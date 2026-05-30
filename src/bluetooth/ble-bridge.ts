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

// Pico'dan gelen durum kodları
const STATUS_READY = 0x10;
const STATUS_RECEIVING = 0x11;
const STATUS_SAVED = 0x12;
const STATUS_ERROR = 0x13;

// BLE paket boyutu — MTU genelde 247, header için 20 ayır
const CHUNK_SIZE = 200;

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
        optionalServices: [UART_SERVICE_UUID],
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

      // SERVİS KEŞFİ — bazen GATT bağlandıktan hemen sonra servisler henüz
      // keşfedilmemiş olabiliyor. 3 kez dene, her başarısız arada 500ms bekle.
      // Bu, macOS BLE cache ve Pico advertising-vs-GATT yarış durumlarını çözer.
      let service: BluetoothRemoteGATTService | null = null;
      let lastErr: Error | null = null;
      for (let i = 1; i <= 3; i++) {
        try {
          service = await withTimeout(
            server.getPrimaryService(UART_SERVICE_UUID), 4000, `Servis bulma (deneme ${i}/3)`
          );
          break;
        } catch (e) {
          lastErr = e as Error;
          if (i < 3) {
            this.onLog('system', `Servis henüz hazır değil, tekrar deneniyor… (${i}/3)`);
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
      if (!service) {
        // 3 deneme de başarısız → muhtemelen Pico'da BLE bootloader yok ya da
        // başka bir cihaz seçildi. Kullanıcıya net bir yön ver.
        throw new Error(
          'RoboExx servisi bulunamadı. Pico W\'ye "Modülleri Yükle" ile main.py yüklü mü? ' +
          'macOS Bluetooth ayarlarında cihazı "unut" ve tekrar dene. ' +
          `(${lastErr?.message ?? 'bilinmeyen hata'})`
        );
      }

      this.rxChar = await withTimeout(
        service.getCharacteristic(UART_RX_CHAR_UUID), 6000, 'RX karakteristik'
      );
      this.txChar = await withTimeout(
        service.getCharacteristic(UART_TX_CHAR_UUID), 6000, 'TX karakteristik'
      );
      await withTimeout(this.txChar.startNotifications(), 6000, 'Bildirim');
      this.txChar.addEventListener('characteristicvaluechanged', this._onNotify);

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
        const service = await withTimeout(server.getPrimaryService(UART_SERVICE_UUID), 5000);
        this.rxChar = await withTimeout(service.getCharacteristic(UART_RX_CHAR_UUID), 5000);
        this.txChar = await withTimeout(service.getCharacteristic(UART_TX_CHAR_UUID), 5000);
        await withTimeout(this.txChar.startNotifications(), 5000);
        this.txChar.addEventListener('characteristicvaluechanged', this._onNotify);

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

  // ====== private ======

  private _setState(s: BridgeState): void {
    if (this.state !== s) {
      this.state = s;
      this.onStateChange(s);
    }
  }

  private async _writeRaw(data: Uint8Array): Promise<void> {
    if (!this.rxChar) throw new Error('RX karakteristik yok');
    // BLE write without response — daha hızlı
    if ((this.rxChar as any).writeValueWithoutResponse) {
      await (this.rxChar as any).writeValueWithoutResponse(data);
    } else {
      await this.rxChar.writeValue(data);
    }
  }

  private _onNotify = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value || value.byteLength < 1) return;
    const status = value.getUint8(0);
    this.lastStatus = status;
    // Bekleyenleri uyandır
    const waiters = this.statusWaiters;
    this.statusWaiters = [];
    waiters.forEach((cb) => cb(status));
  };

  private async _waitStatus(expected: number, timeoutMs: number): Promise<void> {
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