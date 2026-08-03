/**
 * BLE Bridge — RoboExx Pico W ile Web Bluetooth üzerinden iletişim.
 *
 * Pico'da çalışan `main.py` (BLE bootloader) ile aynı protokolü konuşur:
 *   - Nordic UART benzeri 2 characteristic (RX/TX)
 *   - 1-byte mesaj tipleri: BEGIN/CHUNK/END/PING/RESET
 *
 * SerialBridge ile aynı interface'i sağlar (connect, disconnect, uploadCode...)
 * ama bazı farklar:
 *   - "runCode" yok (BLE'de canlı çıktı stream pratik değil)
 *   - "uploadCode" hep aynı: dosyaya yaz + Pico reset
 *   - Aynı tek kanaldan main.py + roboexx.py + user_code.py yüklenebilir
 */

import type { BridgeState } from './types';

// Nordic UART Service UUID'leri (roboexx_main.py ile aynı)
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // tarayıcı yazar
const UART_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // pico notify

// Protokol mesaj tipleri (roboexx_main.py ile aynı)
const MSG_BEGIN = 0x01;
const MSG_CHUNK = 0x02;
const MSG_END = 0x03;
const MSG_PING = 0x04;
const MSG_RESET = 0x05;
const MSG_KEY = 0x06;
const MSG_SENSOR_REQ = 0x07;
const MSG_SENSOR_REPLY = 0x14;

// Pico'dan gelen durum kodları
const STATUS_READY = 0x10;
const STATUS_RECEIVING = 0x11;
const STATUS_SAVED = 0x12;
const STATUS_ERROR = 0x13;

// BLE paket boyutu — MTU genelde 247, header için 20 ayır
const CHUNK_SIZE = 200;

/**
 * Aday UART servisleri. İlk sıra RoboExx/Nordic; gerisi BerryBot tarzı
 * harici BLE-UART modüllerinin fabrika varsayılanları:
 *  - 0xFFE0 / 0xFFE5: HM-10, JDY, MLT-BT05 klonları
 *  - 0xFFF0: BT05/CC41 türevleri
 *  - 49535343-…: Microchip RN4870/BM7x şeffaf UART
 * requestDevice.optionalServices'te listelenmeyen servise erişilemez,
 * o yüzden hepsi orada da geçer.
 */
const CANDIDATE_SERVICE_UUIDS: (string | number)[] = [
  UART_SERVICE_UUID,
  0xffe0,
  0xfff0,
  0xffe5,
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

/** Karakteristik özelliklerini okunur stringe çevir (teşhis logu için). */
function propsToString(ch: BluetoothRemoteGATTCharacteristic): string {
  const p = (ch as any).properties || {};
  const out: string[] = [];
  if (p.read) out.push('read');
  if (p.write) out.push('write');
  if (p.writeWithoutResponse) out.push('writeNR');
  if (p.notify) out.push('notify');
  if (p.indicate) out.push('indicate');
  return out.join(',') || 'yok';
}

export interface BLEBridgePortInfo {
  friendlyName: string;
  deviceId: string;
}

export class BLEBridge {
  state: BridgeState = 'disconnected';
  portInfo: BLEBridgePortInfo | null = null;

  // Callback'ler (App.tsx tarafından set edilir)
  onStateChange: (s: BridgeState) => void = () => {};
  onLog: (kind: 'system' | 'info' | 'error' | 'stdout' | 'stderr', message: string) => void = () => {};

  private device: BluetoothDevice | null = null;
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private txChar: BluetoothRemoteGATTCharacteristic | null = null;
  /** Son alınan durum kodu (notify ile gelir) */
  private lastStatus: number | null = null;
  private statusWaiters: Array<(status: number) => void> = [];
  /** Sensör cevap callback'i — payload byte'ları gelir */
  public onSensorReply: ((payload: Uint8Array) => void) | null = null;
  /**
   * 🍓 BerryBot modu: giden her mesajı [BB 66 len payload xor] çerçevesine
   * sarar. BerryBot'un UART-BLE modülü paket sınırlarını korumadığı için
   * firmware çerçeveleri deterministik çözer. App, hedef 'berrybot' iken
   * true yapar.
   */
  public frameOutgoing = false;
  /**
   * GATT yazma başına en fazla bayt (0 = sınırsız). Harici BLE-UART
   * modülleri çoğunlukla 20 baytlık BLE paketleriyle çalışır (MTU 23);
   * daha büyük writeValue "GATT Error: Not Supported/Invalid length"
   * verebilir. App, hedef 'berrybot' iken 20 yapar.
   */
  public maxGattWrite = 0;
  /** Bildirim aboneliği kuruldu mu? Kurulamadıysa durumlar iyimser beklenir. */
  private notifyOk = true;
  /**
   * Kod yükleme sonrası Pico reset olunca beklenen kopma.
   * true ise gattserverdisconnected'da cihazı UNUTMA — otomatik reconnect dene.
   */
  private expectReconnect = false;
  /** Reconnect denemesi sürüyor mu (çift tetiklenmeyi önle) */
  private reconnecting = false;

  /** Web Bluetooth API mevcut mu? */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined'
      && 'bluetooth' in navigator
      && typeof (navigator as any).bluetooth?.requestDevice === 'function';
  }

  async connect(): Promise<BLEBridgePortInfo> {
    if (!BLEBridge.isSupported()) {
      throw new Error('Bu tarayıcı Web Bluetooth desteklemiyor. Chrome veya Edge kullan.');
    }
    if (this.state === 'connected' || this.state === 'busy') {
      throw new Error('Zaten bağlı');
    }
    // connecting state'inde tekrar tıklanırsa: önceki denemeyi iptal edip
    // baştan başla — "bağlanmıyor" durumunda kullanıcı tekrar deneyebilsin.
    if (this.state === 'connecting') {
      try {
        if (this.device?.gatt?.connected) this.device.gatt.disconnect();
      } catch {}
      this.device = null;
      this.rxChar = null;
      this.txChar = null;
    }

    // Yeni bağlantı — eski flag'leri sıfırla
    this.expectReconnect = false;
    this.reconnecting = false;

    this._setState('connecting');
    try {
      this.onLog('system', 'Bluetooth cihaz seçim penceresi açılıyor...');

      // Cihaz seçici: TÜM BLE cihazlarını göster, kullanıcı kendi RoboExx'ini
      // seçsin. acceptAllDevices her durumda cihazı listeler;
      // UUID'ye bağlantı sonrası optionalServices üzerinden erişiriz.
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICE_UUIDS,
      });

      this.device = device;
      this.onLog('system', `Cihaz seçildi: ${device.name || 'isimsiz'} — bağlanılıyor...`);

      // GATT işlemlerini timeout ile sarmala — Web Bluetooth bazen
      // sonsuz "pending" promise döndürür (Chrome bug), bağlantı asla bitmez.
      // Süreler cömert: gerçek macOS/Chrome bağlantısı 3-6sn sürebilir.
      const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, rej) =>
            setTimeout(() => rej(new Error(`${label} zaman aşımı (${ms}ms)`)), ms)
          ),
        ]);

      const server = await withTimeout(device.gatt!.connect(), 15000, 'GATT bağlantı');

      // ── SERVİS KEŞFİ ────────────────────────────────────────────────
      // Önce bilinen UART servislerini sırayla dene (RoboExx/Nordic +
      // harici BLE-UART modüllerinin fabrika varsayılanları). Hiçbiri
      // yoksa cihazdaki TÜM servisleri tara ve içinde yazılabilir
      // karakteristik olan ilk servisi al.
      let service: BluetoothRemoteGATTService | null = null;
      let lastErr: Error | null = null;
      for (let round = 1; round <= 2 && !service; round++) {
        for (const uuid of CANDIDATE_SERVICE_UUIDS) {
          try {
            service = await withTimeout(
              server.getPrimaryService(uuid as any), 3000, `Servis ${uuid}`
            );
            this.onLog('system', `Servis bulundu: ${service!.uuid}`);
            break;
          } catch (e) {
            lastErr = e as Error;
          }
        }
        if (!service && round === 1) {
          this.onLog('system', 'Bilinen servisler henüz hazır değil, tekrar deneniyor…');
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      if (!service) {
        // Son çare: tüm servisleri tara (yalnızca optionalServices'tekilere
        // erişim izni vardır; diğerleri zaten listeye gelmez)
        try {
          const all = await withTimeout(server.getPrimaryServices(), 5000, 'Servis taraması');
          this.onLog('system', `Cihazdaki erişilebilir servisler: ${all.map((sv: any) => sv.uuid).join(', ') || 'yok'}`);
          service = all[0] ?? null;
        } catch (e) {
          lastErr = e as Error;
        }
      }
      if (!service) {
        throw new Error(
          'UART servisi bulunamadı. Robota "Modülleri Yükle" yapıldı mı? ' +
          'İşletim sistemi Bluetooth ayarlarında cihazı "unut", robotu kapat-aç ve tekrar dene. ' +
          `(${lastErr?.message ?? 'bilinmeyen hata'})`
        );
      }

      // ── KARAKTERİSTİK KEŞFİ — UUID'ye değil YETENEĞE göre ──────────
      // Bazı modüllerde RX/TX rolleri Nordic düzeninin TERSİDİR ya da tek
      // karakteristik hem write hem notify taşır (ör. FFE1). Bu yüzden
      // "yazılabilir olan"ı ve "bildirim yapabilen"i özelliklerinden seçiyoruz.
      const chars = await withTimeout(service.getCharacteristics(), 6000, 'Karakteristik listesi');
      for (const ch of chars) {
        this.onLog('system', `  karakteristik ${ch.uuid} [${propsToString(ch)}]`);
      }
      const writable = chars.filter((ch: any) =>
        ch.properties?.write || ch.properties?.writeWithoutResponse);
      const notifiable = chars.filter((ch: any) =>
        ch.properties?.notify || ch.properties?.indicate);
      // Nordic RX UUID'si yazılabilirse onu tercih et; değilse ilk yazılabilir
      this.rxChar =
        writable.find((ch: any) => ch.uuid === UART_RX_CHAR_UUID) ??
        writable[0] ?? null;
      this.txChar =
        notifiable.find((ch: any) => ch.uuid === UART_TX_CHAR_UUID) ??
        notifiable[0] ?? null;
      if (!this.rxChar) {
        throw new Error('Bu serviste yazılabilir karakteristik yok — yanlış cihaz seçilmiş olabilir');
      }
      this.onLog('system', `Yazma: ${this.rxChar.uuid} · Bildirim: ${this.txChar?.uuid ?? 'YOK'}`);

      // ── BİLDİRİM ABONELİĞİ — başarısız olsa bile bağlantıyı KESME ──
      // Bazı modüller CCCD'yi geç hazırlar ("Not Supported"): 2 deneme yap;
      // yine olmazsa "iyimser mod"a geç — durum onayları beklenmez, yükleme
      // yine çalışır (firmware kaydedip kendini resetler).
      this.notifyOk = false;
      if (this.txChar) {
        for (let i = 1; i <= 2 && !this.notifyOk; i++) {
          try {
            await withTimeout(this.txChar.startNotifications(), 6000, `Bildirim (deneme ${i}/2)`);
            this.notifyOk = true;
          } catch (ne) {
            this.onLog('system', `Bildirim aboneliği olmadı (${(ne as Error).message})${i < 2 ? ' — tekrar deneniyor…' : ''}`);
            if (i < 2) await new Promise((r) => setTimeout(r, 700));
          }
        }
        if (this.notifyOk) {
          this.txChar.addEventListener('characteristicvaluechanged', this._onNotify);
        }
      }
      if (!this.notifyOk) {
        this.onLog('system', '⚠ Bildirimler kapalı — iyimser modda devam ediliyor (yükleme çalışır, durum onayı beklenmez)');
      }

      // Disconnect listener'ı bağlantı KURULDUKTAN SONRA ekle —
      // başarısızlık durumunda artakalmasın.
      device.addEventListener('gattserverdisconnected', () => {
        if (this.expectReconnect) {
          this.onLog('system', 'Pico yeniden başladı — otomatik bağlanılıyor...');
          this._autoReconnect();
        } else {
          this.onLog('system', 'Bluetooth bağlantısı koptu');
          this.disconnect();
        }
      });

      this.portInfo = {
        friendlyName: device.name || 'RoboExx Pico',
        deviceId: device.id,
      };

      // KARARLILIK KONTROLÜ — Pico bazen bağlantıyı kurar gibi yapıp 1-3sn
      // içinde düşürüyor (macOS Bluetooth cache, MTU pazarlığı, IRQ yarışı).
      // 800ms bekle, hâlâ bağlıysa "gerçekten bağlandı" say.
      await new Promise((r) => setTimeout(r, 800));
      if (!device.gatt?.connected) {
        throw new Error('Bağlantı kurulur kurulmaz koptu — Pico hazır olmayabilir');
      }

      this._setState('connected');
      this.onLog('system', `Bluetooth bağlı: ${this.portInfo.friendlyName}`);

      // PING'i biraz daha geciktir — Pico'ya IRQ ile karakteristik subscription
      // işlemini tamamlama fırsatı ver. Hemen yazarsak bazı Pico'larda boğulup
      // bağlantı düşüyor.
      setTimeout(() => {
        if (this.state === 'connected') {
          this._writeRaw(new Uint8Array([MSG_PING])).catch(() => {});
        }
      }, 400);

      return this.portInfo;
    } catch (e) {
      // Hata: bağlantıyı temizle, eğer kısmen kuruldu ise GATT'ı da kapat
      try {
        if (this.device?.gatt?.connected) this.device.gatt.disconnect();
      } catch {}
      this._setState('disconnected');
      this.device = null;
      this.rxChar = null;
      this.txChar = null;
      const err = e as Error;
      if (err?.name === 'NotFoundError') {
        this.onLog('system', 'Bağlantı iptal edildi (cihaz seçilmedi)');
      } else if (err?.name === 'SecurityError') {
        this.onLog('error', 'BLE izni reddedildi — tarayıcı Bluetooth iznini kontrol et');
      } else if (err?.message?.includes('zaman aşımı')) {
        this.onLog('error', `Bağlantı zaman aşımı: ${err.message} — Pico'yu resetleyip tekrar dene`);
      } else {
        this.onLog('error', `BLE bağlantı hatası: ${err?.message ?? err}`);
      }
      throw e;
    }
  }

  /**
   * Kod yüklendikten sonra Pico reset olunca aynı cihaza otomatik yeniden bağlan.
   * Pico'nun açılıp tekrar advertising'e başlaması ~2-4sn sürer, bu yüzden
   * birkaç kez deneriz (her deneme arası bekleme).
   */
  private async _autoReconnect(): Promise<void> {
    if (this.reconnecting) return;
    if (!this.device) { this.disconnect(); return; }
    this.reconnecting = true;
    this._setState('connecting');

    const maxAttempts = 8;          // ~16sn boyunca dene
    const delayMs = 2000;           // her deneme arası 2sn

    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ]);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Pico'nun açılması için bekle
      await new Promise((r) => setTimeout(r, delayMs));
      // Kullanıcı bu sırada elle disconnect ettiyse dur
      if (!this.device || !this.expectReconnect) break;
      try {
        // Her adıma cömert timeout — sonsuz pending'i kes ama gerçek bağlantıya
        // yeterli süre tanı. macOS/Chrome bazen 6sn'e kadar sürebilir.
        const server = await withTimeout(this.device.gatt!.connect(), 8000);
        // İlk bağlantıdaki keşifle aynı mantık: bilinen servisleri dene,
        // karakteristikleri YETENEĞE göre seç (Nordic olmayan modüller için)
        let service: BluetoothRemoteGATTService | null = null;
        for (const uuid of CANDIDATE_SERVICE_UUIDS) {
          try {
            service = await withTimeout(server.getPrimaryService(uuid as any), 3000);
            break;
          } catch { /* sıradakini dene */ }
        }
        if (!service) {
          const all = await withTimeout(server.getPrimaryServices(), 5000);
          service = all[0] ?? null;
        }
        if (!service) throw new Error('servis yok');
        const chars = await withTimeout(service.getCharacteristics(), 5000);
        const writable = chars.filter((ch: any) =>
          ch.properties?.write || ch.properties?.writeWithoutResponse);
        const notifiable = chars.filter((ch: any) =>
          ch.properties?.notify || ch.properties?.indicate);
        this.rxChar =
          writable.find((ch: any) => ch.uuid === UART_RX_CHAR_UUID) ?? writable[0] ?? null;
        this.txChar =
          notifiable.find((ch: any) => ch.uuid === UART_TX_CHAR_UUID) ?? notifiable[0] ?? null;
        if (!this.rxChar) throw new Error('yazılabilir karakteristik yok');
        this.notifyOk = false;
        if (this.txChar) {
          try {
            await withTimeout(this.txChar.startNotifications(), 5000);
            this.notifyOk = true;
            this.txChar.addEventListener('characteristicvaluechanged', this._onNotify);
          } catch {
            this.notifyOk = false;
          }
        }

        this._setState('connected');
        this.expectReconnect = false;
        this.reconnecting = false;
        this.onLog('system', `✓ Otomatik bağlandı: ${this.portInfo?.friendlyName ?? 'RoboExx Pico'}`);
        try { await this._writeRaw(new Uint8Array([MSG_PING])); } catch {}
        return;
      } catch {
        // Başarısız deneme — yarım kalan GATT bağlantısını kapat,
        // bir sonraki deneme temiz başlasın.
        try {
          if (this.device?.gatt?.connected) this.device.gatt.disconnect();
        } catch {}
        this.onLog('system', `Bağlanılıyor… (deneme ${attempt}/${maxAttempts})`);
      }
    }

    // Başarısız — temizle
    this.reconnecting = false;
    this.expectReconnect = false;
    this.onLog('error', 'Otomatik bağlanma başarısız — elle tekrar bağlanın');
    this.disconnect();
  }

  async disconnect(): Promise<void> {
    // Elle disconnect → bekleyen otomatik reconnect varsa iptal et
    this.expectReconnect = false;
    this.reconnecting = false;
    if (this.device?.gatt?.connected) {
      try { this.device.gatt.disconnect(); } catch {}
    }
    this.device = null;
    this.rxChar = null;
    this.txChar = null;
    this.portInfo = null;
    this._setState('disconnected');
  }

  /**
   * Bir dosyayı Pico'ya yaz. filename = 'user_code.py', 'roboexx.py', 'main.py' vs.
   * onProgress: yükleme ilerlemesi (0-100 yüzde)
   * Yazma bitince Pico otomatik reset olur (main.py veya user_code.py için).
   * roboexx.py için reset olmaz, sadece kaydedilir.
   */
  async uploadFile(
    filename: string,
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    if (this.state !== 'connected') throw new Error('BLE bağlı değil');
    if (!this.rxChar) throw new Error('RX karakteristik yok');

    this._setState('busy');
    const start = Date.now();
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(code);
    const bytesTotal = codeBytes.length;

    try {
      // 1) BEGIN — dosya adı + boyut
      const nameBytes = encoder.encode(filename);
      const begin = new Uint8Array(2 + nameBytes.length + 4);
      begin[0] = MSG_BEGIN;
      begin[1] = nameBytes.length;
      begin.set(nameBytes, 2);
      const sizeView = new DataView(begin.buffer);
      sizeView.setUint32(2 + nameBytes.length, bytesTotal, true); // little endian
      await this._writeRaw(begin);
      await this._waitStatus(STATUS_RECEIVING, 3000);

      onProgress?.({ pct: 0, bytesSent: 0, bytesTotal, speedKBs: 0 });

      // 2) CHUNK'lar
      let offset = 0;
      while (offset < bytesTotal) {
        const chunkLen = Math.min(CHUNK_SIZE, bytesTotal - offset);
        const chunk = new Uint8Array(5 + chunkLen);
        chunk[0] = MSG_CHUNK;
        const view = new DataView(chunk.buffer);
        view.setUint32(1, offset, true);
        chunk.set(codeBytes.subarray(offset, offset + chunkLen), 5);
        await this._writeRaw(chunk);
        offset += chunkLen;

        const elapsed = (Date.now() - start) / 1000;
        const speedKBs = elapsed > 0 ? offset / 1024 / elapsed : 0;
        onProgress?.({
          pct: (offset / bytesTotal) * 95,
          bytesSent: offset,
          bytesTotal,
          speedKBs,
        });
      }

      // 3) END — Pico dosyayı yazar
      await this._writeRaw(new Uint8Array([MSG_END]));
      await this._waitStatus(STATUS_SAVED, 5000);

      const elapsed = (Date.now() - start) / 1000;
      const speedKBs = elapsed > 0 ? bytesTotal / 1024 / elapsed : 0;
      onProgress?.({ pct: 100, bytesSent: bytesTotal, bytesTotal, speedKBs });
    } finally {
      if (this.state === 'busy') this._setState('connected');
    }
  }

  /**
   * Kullanıcı kodunu yükle ve çalıştır (BLE üzerinden).
   * Pico user_code.py olarak yazar, sonra otomatik reset olur ve yeni kod çalışır.
   */
  async uploadCode(
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    // Yükleme sırasında reset kopması "beklenen" — kopma handler'ı normal
    // disconnect yapmasın (cihazı unutmasın).
    this.expectReconnect = true;
    await this.uploadFile('user_code.py', code, onProgress);
    this._setState('connecting');
    this.onLog('system', '⚙ Pico yeni kodu çalıştırmak için yeniden başlıyor…');
    // Pico STATUS_SAVED gönderdikten sonra kendi micropython.schedule ile
    // reset edecek (~300ms). Biz bağlantıyı KENDİMİZ koparMIYORUZ — yoksa
    // Pico dosya yazımı ortasında kalabilir. Pico reset olunca
    // gattserverdisconnected event'i tetiklenir; bu da _autoReconnect'i
    // başlatır (zaten device.addEventListener'da kurulu).
    // Sadece reconnect flag'lerini hazırla, kopma event'ini bekle.
    this.reconnecting = false;
    // Pico reset event'i 0.5-1sn içinde gelir. Eğer 3sn'de gelmezse
    // sigortalı reconnect başlat.
    setTimeout(() => {
      if (this.state === 'connecting' && this.expectReconnect && !this.reconnecting) {
        this.onLog('system', 'Reset event gecikti, otomatik bağlanma başlatılıyor');
        this._autoReconnect();
      }
    }, 3000);
  }

  /**
   * Kütüphane dosyalarını yükle (roboexx.py).
   * Pico reset OLMAZ — sadece kaydedilir.
   */
  async uploadLibrary(
    filename: string,
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    await this.uploadFile(filename, code, onProgress);
  }

  /** Manual reset (Pico'yu yeniden başlat) */
  async forceReset(): Promise<void> {
    if (this.rxChar) {
      try {
        await this._writeRaw(new Uint8Array([MSG_RESET]));
      } catch {}
    }
    if (this.state === 'busy') this._setState('connected');
  }

  /**
   * Klavye basılı tuşlarını Pico'ya bildir.
   * keys: basılı tuşların concat string'i (örn "wa", boş "")
   * 50ms aralıkla çağrılır. Bağlantı yoksa sessizce yutar.
   */
  async sendKeys(keys: string): Promise<void> {
    if (this.state !== 'connected' || !this.rxChar) return;
    const enc = new TextEncoder();
    const keyBytes = enc.encode(keys.toLowerCase().slice(0, 16)); // max 16 tuş
    const payload = new Uint8Array(1 + keyBytes.length);
    payload[0] = MSG_KEY;
    payload.set(keyBytes, 1);
    try {
      await this._writeRaw(payload);
    } catch {
      // Bağlantı kopmuş olabilir, sessiz yut
    }
  }

  /**
   * Sensör değerleri için Pico'ya istek gönder.
   * sensors: her sensör için [type, pin1, pin2] tuple'ları (her biri 0-255).
   * Pico cevap olarak `onSensorReply(payload)` çağırır — payload her sensör
   * için 2 byte uint16 LE değer içerir.
   */
  async requestSensors(sensors: Array<[number, number, number]>): Promise<void> {
    if (this.state !== 'connected' || !this.rxChar) return;
    if (sensors.length === 0) return;
    const payload = new Uint8Array(1 + sensors.length * 3);
    payload[0] = MSG_SENSOR_REQ;
    for (let i = 0; i < sensors.length; i++) {
      payload[1 + i * 3]     = sensors[i][0] & 0xFF;
      payload[1 + i * 3 + 1] = sensors[i][1] & 0xFF;
      payload[1 + i * 3 + 2] = sensors[i][2] & 0xFF;
    }
    try {
      await this._writeRaw(payload);
    } catch {
      // sessiz yut
    }
  }

  // ====== private ======

  private _setState(s: BridgeState): void {
    if (this.state !== s) {
      this.state = s;
      this.onStateChange(s);
    }
  }

  private async _writeRaw(data: Uint8Array): Promise<void> {
    if (!this.rxChar) throw new Error('RX karakteristik yok');

    // 🍓 Çerçeveleme: [0xBB 0x66 len_lo len_hi payload xor]
    let out = data;
    if (this.frameOutgoing) {
      const f = new Uint8Array(data.length + 5);
      f[0] = 0xbb; f[1] = 0x66;
      f[2] = data.length & 0xff; f[3] = (data.length >> 8) & 0xff;
      f.set(data, 4);
      let chk = 0;
      for (const b of data) chk ^= b;
      f[f.length - 1] = chk;
      out = f;
    }

    // Parçala: harici BLE-UART modülleri için ≤maxGattWrite baytlık yazmalar
    const step = this.maxGattWrite > 0 ? this.maxGattWrite : out.length;
    for (let off = 0; off < out.length; off += step) {
      const slice = out.subarray(off, Math.min(off + step, out.length));
      await this._gattWrite(slice);
    }
  }

  /** Tek GATT yazması — karakteristiğin GERÇEK yeteneklerine göre.
   *  writeValueWithoutResponse fonksiyonu Chrome'da hep vardır ama
   *  karakteristik desteklemiyorsa "GATT Error: Not Supported" fırlatır;
   *  bu yüzden önce properties'e bakılır, yine de hata gelirse
   *  writeValue (yanıtlı) ile tekrar denenir. */
  private async _gattWrite(data: Uint8Array): Promise<void> {
    const ch = this.rxChar!;
    const props = (ch as any).properties;
    const canWWR = !!props?.writeWithoutResponse
      && typeof (ch as any).writeValueWithoutResponse === 'function';
    try {
      if (canWWR) {
        await (ch as any).writeValueWithoutResponse(data);
      } else if (typeof (ch as any).writeValueWithResponse === 'function') {
        await (ch as any).writeValueWithResponse(data);
      } else {
        await ch.writeValue(data);
      }
    } catch (e) {
      // Son çare: yanıtlı klasik yazma
      if ((e as Error)?.name === 'NotSupportedError' && canWWR) {
        await ch.writeValue(data);
      } else {
        throw e;
      }
    }
  }

  private _onNotify = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value || value.byteLength < 1) return;
    const status = value.getUint8(0);

    // Sensör cevabı (0x14) ise ayrı handle et — STATUS değil, payload var
    if (status === MSG_SENSOR_REPLY) {
      if (this.onSensorReply) {
        const payload = new Uint8Array(value.buffer, value.byteOffset + 1, value.byteLength - 1);
        try { this.onSensorReply(payload); } catch {}
      }
      return;
    }

    this.lastStatus = status;
    // Bekleyenleri uyandır
    const waiters = this.statusWaiters;
    this.statusWaiters = [];
    waiters.forEach((cb) => cb(status));
  };

  private async _waitStatus(expected: number, timeoutMs: number): Promise<void> {
    // Bildirim aboneliği kurulamadıysa durum onayı hiç gelmez — kısa bir
    // nefes payı bırakıp iyimser devam et (firmware yine de kaydeder).
    if (!this.notifyOk) {
      await new Promise((r) => setTimeout(r, 300));
      return;
    }
    if (this.lastStatus === expected) {
      this.lastStatus = null;
      return;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.statusWaiters.indexOf(cb);
        if (idx >= 0) this.statusWaiters.splice(idx, 1);
        reject(new Error(`BLE zaman aşımı: durum ${expected.toString(16)} beklendi`));
      }, timeoutMs);
      const cb = (status: number) => {
        if (status === expected) {
          clearTimeout(timer);
          resolve();
        } else if (status === STATUS_ERROR) {
          clearTimeout(timer);
          reject(new Error('Pico hata bildirdi (STATUS_ERROR)'));
        } else {
          // Beklediğimiz değilse — tekrar bekle
          this.statusWaiters.push(cb);
        }
      };
      this.statusWaiters.push(cb);
    });
  }
}

export const bleBridge = new BLEBridge();