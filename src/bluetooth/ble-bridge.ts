/**
 * BLE Bridge — BerryBot / RoboExx ile Web Bluetooth üzerinden iletişim.
 *
 * v2'de değişenler (güvenilir yükleme için):
 *  • Protokol sürümü otomatik algılanır: bağlanınca PING atılır;
 *    yeni bootloader STATUS_READY_V2 (0x16) döner → v2 modu.
 *    - v2 (BerryBot bootloader v2): her CHUNK'a ACK beklenir (akış
 *      kontrolü — BLE modülünün 115200 baud UART tamponu artık taşamaz),
 *      END'de checksum gönderilir, bozuk parça 3 kez yeniden denenir.
 *    - v1 (eski bootloader / RoboExx Pico W): eski davranış korunur,
 *      ama parçalar arasına hız sınırı konur (UART taşmasın diye).
 *  • Bayat durum baytı hatası düzeltildi: her yüklemeden önce durum
 *    kuyruğu temizlenir (eskiden önceki READY/SAVED yanlışlıkla yeni
 *    beklemeyi karşılayabiliyordu).
 *  • v2'de kod yüklendikten sonra bağlantı KOPARILMAZ: BerryBot'un BLE
 *    modülü Pico'dan bağımsız beslendiği için Pico resetlenirken
 *    bağlantı zaten canlı kalır. (v1/Pico W'de eski yeniden bağlanma
 *    dansı korunur.)
 *  • MSG_STOP (v2): "Durdur" → robot kodu çalıştırmadan boşta bekler.
 */

import type { BridgeState } from '../serial/types';

// Nordic UART Service UUID'leri (bootloader ile aynı)
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // tarayıcı yazar
const UART_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // pico notify

// Protokol mesaj tipleri (berrybot_main.py ile aynı)
const MSG_BEGIN = 0x01;
const MSG_CHUNK = 0x02;   // v1: örtük uzunluk, ACK yok
const MSG_END = 0x03;     // v1: checksum yok
const MSG_PING = 0x04;
const MSG_RESET = 0x05;
const MSG_CHUNK2 = 0x06;  // v2: offset(4) + len(2) + data → ACK
const MSG_END2 = 0x07;    // v2: checksum(4, LE)
const MSG_STOP = 0x08;    // v2: durdur (autorun'suz reset)
const MSG_KEY = 0x0b;         // canlı klavye: [0x0B][len][ascii tuşlar]
const MSG_SENSOR_REQ = 0x0c;  // sensör isteği: [0x0C][n][n × (tip,pin1,pin2)]
const MSG_SENSOR_REPLY = 0x14;// cevap notify: [0x14][n × uint16 LE]

// Pico'dan gelen durum kodları
const STATUS_READY = 0x10;
const STATUS_RECEIVING = 0x11;
const STATUS_SAVED = 0x12;
const STATUS_ERROR = 0x13;
const STATUS_ACK = 0x15;
const STATUS_READY_V2 = 0x16;
const STATUS_REBOOTING = 0x17; // robot yükleme moduna geçmek için resetleniyor

/**
 * Aday UART servisleri — ilk sıra RoboExx/Nordic; gerisi harici BLE-UART
 * modüllerinin fabrika varsayılanları (FFE0/FFF0/FFE5 klonları, Microchip
 * RN487x/BM7x). requestDevice.optionalServices'te olmayan servise
 * erişilemez, o yüzden hepsi orada da geçer.
 */
const CANDIDATE_SERVICE_UUIDS: (string | number)[] = [
  UART_SERVICE_UUID,
  0xffe0,
  0xfff0,
  0xffe5,
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

/** GATT işlemlerini zaman aşımıyla sarmala — Web Bluetooth bazen sonsuz
 *  "pending" promise döndürür (Chrome hatası); bağlantı asla bitmez. */
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} zaman aşımı (${ms}ms)`)), ms)
    ),
  ]);

// v1 parça boyutu SABİT 200 olmalı (eski bootloader uzunluğu buradan türetir).
const CHUNK_SIZE_V1 = 200;
// v2'de uzunluk açık gönderildiği için parça boyutu esnek; MTU küçükse
// otomatik düşürülür.
const CHUNK_SIZE_V2 = 200;
const CHUNK_SIZE_MIN = 20;
// v1'de akış kontrolü yok → UART (115200 ≈ 11.5 KB/sn) taşmasın diye
// parçalar arası bekleme. 200 bayt ≈ 17 ms; %50 pay bırak.
const V1_CHUNK_DELAY_MS = 26;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BLEBridgePortInfo {
  friendlyName: string;
  deviceId: string;
}

export class BLEBridge {
  state: BridgeState = 'disconnected';
  portInfo: BLEBridgePortInfo | null = null;
  /** Bootloader protokol v2 mi? (ACK'lı güvenilir yükleme + Durdur desteği) */
  protoV2 = false;

  // Callback'ler (App.tsx tarafından set edilir)
  onStateChange: (s: BridgeState) => void = () => {};
  onLog: (kind: 'system' | 'info' | 'error' | 'stdout' | 'stderr', message: string) => void = () => {};

  private device: BluetoothDevice | null = null;
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private txChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyAvailable = false;
  /** Robottan (notify VEYA read-yoklama ile) en az bir gecerli bayt geldi mi? */
  private linkAlive = false;
  /** Bildirimler olu cikarsa devreye giren read-yoklama zamanlayicisi */
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollHex: string | null = null;
  /** Gelen durum baytları (notify) — FIFO kuyruk */
  private statusQueue: number[] = [];
  private statusWaiter: {
    resolve: (s: number) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  /**
   * İşlem jenerasyon sayacı. Her yükleme/durdurma bunu artırır; arka planda
   * süren _verifyAlive (PING doğrulayıcı) kendi jenerasyonu eskiyince ANINDA
   * çekilir. Eskiden doğrulayıcı, hemen ardından başlatılan İKİNCİ yüklemenin
   * durum bekleyicisini _clearStatus ile siliyordu → yükleme sonsuza dek
   * donuyor, kullanıcı robota reset atmak zorunda kalıyordu.
   */
  private opSeq = 0;
  /**
   * İPTAL BAYRAĞI — Durdur/Reset/Disconnect basılınca true olur; süren
   * yüklemenin chunk döngüsü ve durum beklemeleri anında hata fırlatıp
   * temiz çıkar. Eskiden yükleme arka planda dakikalarca sürüp yeni
   * komutlarla çakışabiliyordu.
   */
  private cancelled = false;
  /**
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
    if (this.state === 'connected' || this.state === 'connecting' || this.state === 'busy') {
      throw new Error('Zaten bağlı');
    }

    this._setState('connecting');
    try {
      this.onLog('system', 'Bluetooth cihaz seçim penceresi açılıyor...');

      // acceptAllDevices: services filtresi bazı OS'lerde (özellikle macOS)
      // scan_response'taki UUID'yi görmez → cihaz hiç listelenmez.
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICE_UUIDS,
      });

      this.device = device;
      this.onLog('system', `Cihaz seçildi: ${device.name || 'isimsiz'} — bağlanılıyor...`);

      device.addEventListener('gattserverdisconnected', () => {
        if (this.expectReconnect) {
          this.onLog('system', 'Bağlantı koptu — otomatik yeniden bağlanılıyor...');
          this._autoReconnect();
        } else {
          this.onLog('system', 'Bluetooth bağlantısı koptu');
          this.disconnect();
        }
      });

      const server = await withTimeout(device.gatt!.connect(), 15000, 'GATT bağlantı');
      const service = await this._findService(server, true);
      await this._setupChars(service, true);

      this.portInfo = {
        friendlyName: device.name || 'BerryBot',
        deviceId: device.id,
      };
      this._setState('connected');
      // Bağlantı koptuğunda (robot resetlenince de) otomatik yeniden bağlan.
      this.expectReconnect = true;
      this.onLog('system', `Bluetooth bağlı: ${this.portInfo.friendlyName}`);

      // Protokol sürümünü algıla (PING → READY_V2 mi READY mi?)
      await this._detectProtocol();
      if (this.protoV2) {
        this.onLog('system', '✓ Güvenilir yükleme aktif (bootloader v2 — ACK + checksum)');
      } else if (this.notifyAvailable) {
        this.onLog('info', 'Eski bootloader algılandı — "Modülleri Yükle" ile güncellersen yükleme çok daha kararlı olur');
      }

      return this.portInfo;
    } catch (e) {
      this._setState('disconnected');
      this.device = null;
      this.rxChar = null;
      this.txChar = null;
      const err = e as Error;
      if (err?.name === 'NotFoundError') {
        this.onLog('system', 'Bağlantı iptal edildi (cihaz seçilmedi)');
      } else if (err?.name === 'SecurityError') {
        this.onLog('error', 'BLE izni reddedildi — tarayıcı Bluetooth iznini kontrol et');
      } else {
        this.onLog('error', `BLE bağlantı hatası: ${err?.message ?? err}`);
      }
      throw e;
    }
  }

  /**
   * Bağlantı kopunca aynı cihaza otomatik yeniden bağlan.
   */
  private async _autoReconnect(): Promise<void> {
    if (this.reconnecting) return;
    if (!this.device) { this.disconnect(); return; }
    this.reconnecting = true;
    this._setState('connecting');
    this._stopReadPolling();
    this._clearStatus();

    // İlk deneme çabuk (modül genelde hemen advertising'e döner),
    // sonrakiler aralıklı.
    const delays = [600, 1200, 2000, 2000, 2000, 2500, 2500, 3000, 3000, 3000];

    for (let attempt = 0; attempt < delays.length; attempt++) {
      await sleep(delays[attempt]);
      // Kullanıcı bu sırada elle disconnect ettiyse dur
      if (!this.device || !this.expectReconnect) break;
      try {
        const server = await withTimeout(this.device.gatt!.connect(), 8000, 'GATT bağlantı');
        const service = await this._findService(server, false);
        await this._setupChars(service, false);

        this._setState('connected');
        this.reconnecting = false;
        this.onLog('system', `✓ Otomatik bağlandı: ${this.portInfo?.friendlyName ?? 'BerryBot'}`);
        await this._detectProtocol();
        return;
      } catch {
        this.onLog('system', `Bağlanılıyor… (deneme ${attempt + 1}/${delays.length})`);
      }
    }

    // Başarısız — temizle
    this.reconnecting = false;
    this.expectReconnect = false;
    this.onLog('error', 'Otomatik bağlanma başarısız — elle tekrar bağlanın');
    this.disconnect();
  }

  /**
   * Bilinen UART servislerini sırayla dene; bulamazsan cihazdaki tüm
   * erişilebilir servisleri tara ve ilkini al. 2 tur — bazı modüller
   * bağlantıdan hemen sonra servis keşfini geç tamamlar.
   */
  private async _findService(server: any, verbose: boolean): Promise<any> {
    let lastErr: Error | null = null;
    for (let round = 1; round <= 2; round++) {
      for (const uuid of CANDIDATE_SERVICE_UUIDS) {
        try {
          const sv: any = await withTimeout(server.getPrimaryService(uuid), 3000, `Servis ${uuid}`);
          if (verbose) this.onLog('system', `Servis bulundu: ${sv.uuid}`);
          return sv;
        } catch (e) {
          lastErr = e as Error;
        }
      }
      if (round === 1) {
        if (verbose) this.onLog('system', 'Bilinen servisler henüz hazır değil, tekrar deneniyor…');
        await sleep(700);
      }
    }
    try {
      const all = await withTimeout(server.getPrimaryServices(), 5000, 'Servis taraması');
      if (verbose) {
        this.onLog('system', `Erişilebilir servisler: ${(all as any[]).map((sv: any) => sv.uuid).join(', ') || 'yok'}`);
      }
      if ((all as any[]).length > 0) return (all as any[])[0];
    } catch (e) {
      lastErr = e as Error;
    }
    throw new Error(
      'UART servisi bulunamadı. Robota "Modülleri Yükle" yapıldı mı? ' +
      'İşletim sistemi Bluetooth ayarlarında cihazı "unut", robotu kapat-aç ve tekrar dene. ' +
      `(${lastErr?.message ?? 'bilinmeyen hata'})`
    );
  }

  /**
   * Servisteki karakteristikleri özelliklerine göre seç (UUID varsaymadan).
   */
  private async _setupChars(service: any, verbose: boolean): Promise<void> {
    let writeChar: any = null;
    let notifyChar: any = null;
    try {
      const chars = await withTimeout(service.getCharacteristics(), 6000, 'Karakteristik listesi');
      for (const ch of chars as any[]) {
        const p = ch.properties || {};
        if (verbose) {
          this.onLog(
            'system',
            `• ${String(ch.uuid).slice(4, 8)} — write=${!!p.write} writeNoResp=${!!p.writeWithoutResponse} notify=${!!p.notify} indicate=${!!p.indicate}`,
          );
        }
        if (!writeChar && (p.writeWithoutResponse || p.write)) writeChar = ch;
        if (!notifyChar && (p.notify || p.indicate)) notifyChar = ch;
      }
    } catch (e) {
      if (verbose) this.onLog('error', `Karakteristikler listelenemedi: ${(e as Error).message}`);
    }

    this.rxChar = writeChar || (await service.getCharacteristic(UART_RX_CHAR_UUID));
    this.txChar = notifyChar || (await service.getCharacteristic(UART_TX_CHAR_UUID));

    this.notifyAvailable = false;
    if (this.txChar) {
      // CCCD bazı modüllerde geç hazırlanır — 2 deneme
      for (let i = 1; i <= 2 && !this.notifyAvailable; i++) {
        try {
          await withTimeout(this.txChar.startNotifications(), 6000, `Bildirim (${i}/2)`);
          this.txChar.addEventListener('characteristicvaluechanged', this._onNotify);
          this.notifyAvailable = true;
        } catch (e) {
          if (verbose) this.onLog('system', `Notify açılamadı (${(e as Error).message})${i < 2 ? ' — tekrar deneniyor…' : '. Durum beklemeden yükleyeceğim.'}`);
          if (i < 2) await sleep(700);
        }
      }
    } else if (verbose) {
      this.onLog('system', 'Modülde bildirim (notify) yok — yükleme durum beklemeden yapılacak.');
    }
  }

  /**
   * PING at; protokol surumunu VE bildirim hattinin canliligini belirle.
   * Bazi moduller CCCD aboneligini kabul eder ama hic notify GONDERMEZ —
   * once read-yoklama denenir, o da sessizse KOR MODa gecilir
   * (durum beklemeden, hiz sinirli yukleme).
   */
  private async _detectProtocol(): Promise<void> {
    this.protoV2 = false;
    this.linkAlive = false;
    if (!this.rxChar) return;
    if (!this.notifyAvailable) return; // abonelik zaten yok -> kor mod
    const mySeq = this.opSeq;
    // 1) Notify ile 3 deneme
    for (let i = 1; i <= 3; i++) {
      if (this.opSeq !== mySeq || this.state === 'busy') return; // yükleme devraldı
      this._clearStatus();
      try {
        await this._writeRaw(new Uint8Array([MSG_PING]));
        const st = await this._nextStatus(1200);
        if (st === STATUS_READY_V2) { this.protoV2 = true; return; }
        if (st >= 0x10 && st <= 0x17) return; // v1 ama hat CANLI
      } catch { /* sessiz — tekrar dene */ }
    }
    // 2) Hic bayt gelmedi -> read-yoklamayi baslat, bir tur daha dene
    this.onLog('system', 'Bildirim hattı sessiz — okuma yoklaması deneniyor…');
    this._startReadPolling();
    for (let i = 1; i <= 3; i++) {
      if (this.opSeq !== mySeq || this.state === 'busy') return; // yükleme devraldı
      this._clearStatus();
      try {
        await this._writeRaw(new Uint8Array([MSG_PING]));
        const st = await this._nextStatus(1200);
        if (st === STATUS_READY_V2) {
          this.protoV2 = true;
          this.onLog('system', '✓ Durum baytları okuma yoklamasıyla alınıyor');
          return;
        }
        if (st >= 0x10 && st <= 0x17) {
          this.onLog('system', '✓ Durum baytları okuma yoklamasıyla alınıyor');
          return;
        }
      } catch { /* sessiz */ }
    }
    // 3) Robot->telefon yonu tamamen olu -> kor mod
    this._stopReadPolling();
    this.notifyAvailable = false;
    this.onLog('system',
      '⚠ Robottan durum baytı alınamıyor (modül notify iletmiyor) — KÖR MOD: ' +
      'yükleme beklemesiz, hız sınırlı gidecek. İPUCU: robot boştayken bağlanınca ÇİFT BİP duyman lazım — duyuyorsan telefon→robot hattı sağlam demektir.');
  }

  async disconnect(): Promise<void> {
    this.cancelled = true; // süren işlemler temiz düşsün
    this.opSeq++;
    this.expectReconnect = false;
    this.reconnecting = false;
    this._stopReadPolling();
    this._clearStatus();
    if (this.device?.gatt?.connected) {
      try { this.device.gatt.disconnect(); } catch {}
    }
    this.device = null;
    this.rxChar = null;
    this.txChar = null;
    this.portInfo = null;
    this.protoV2 = false;
    this._setState('disconnected');
  }

  /**
   * Bir dosyayı Pico'ya yaz. filename = 'user_code.py', 'berrybot.py', 'main.py' vs.
   */
  async uploadFile(
    filename: string,
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    if (!this.rxChar) throw new Error('RX karakteristik yok');

    // Meşgulse: önceki (muhtemelen takılı) yüklemeyi iptal et ve devral.
    if (this.state === 'busy') {
      this.cancelled = true;
      this._clearStatus(); // askıdaki bekleyici reject olur, eski işlem düşer
      const t0 = Date.now();
      while ((this.state as BridgeState) === 'busy' && Date.now() - t0 < 2500) {
        await sleep(50);
      }
      if ((this.state as BridgeState) === 'busy') this._setState('connected');
    }
    if (this.state !== 'connected') throw new Error('BLE bağlı değil');
    this.cancelled = false;

    this.opSeq++;        // ← arka plandaki _verifyAlive PING doğrulayıcısını durdur
    this._setState('busy');
    this._clearStatus(); // ← bayat durum baytları yeni beklemeyi karşılamasın
    const start = Date.now();
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(code);
    const bytesTotal = codeBytes.length;

    try {
      // 1) BEGIN — dosya adı + boyut. Robot kod çalıştırıyorsa v3
      // bootloader REBOOTING yollayıp yükleme moduna resetlenir; o zaman
      // BEGIN'i yeniden göndeririz.
      const nameBytes = encoder.encode(filename);
      const begin = new Uint8Array(2 + nameBytes.length + 4);
      begin[0] = MSG_BEGIN;
      begin[1] = nameBytes.length;
      begin.set(nameBytes, 2);
      new DataView(begin.buffer).setUint32(2 + nameBytes.length, bytesTotal, true);
      await this._beginHandshake(begin);

      onProgress?.({ pct: 0, bytesSent: 0, bytesTotal, speedKBs: 0 });

      // 2) CHUNK'lar
      if (this.protoV2) {
        await this._sendChunksV2(codeBytes, start, onProgress);
      } else {
        await this._sendChunksV1(codeBytes, start, onProgress);
      }

      // 3) END — Pico dosyayı doğrular (v2) ve yazar
      if (this.protoV2) {
        let sum = 0;
        for (let i = 0; i < codeBytes.length; i++) sum = (sum + codeBytes[i]) >>> 0;
        const end = new Uint8Array(5);
        end[0] = MSG_END2;
        new DataView(end.buffer).setUint32(1, sum, true);
        await this._writeRaw(end);
        await this._waitFor([STATUS_SAVED], 8000);
      } else {
        await this._writeRaw(new Uint8Array([MSG_END]));
        await this._waitFor([STATUS_SAVED], 6000);
      }

      const elapsed = (Date.now() - start) / 1000;
      const speedKBs = elapsed > 0 ? bytesTotal / 1024 / elapsed : 0;
      onProgress?.({ pct: 100, bytesSent: bytesTotal, bytesTotal, speedKBs });
    } finally {
      if ((this.state as BridgeState) === 'busy') this._setState('connected');
    }
  }

  /**
   * BEGIN gönder ve RECEIVING bekle. Robot kod çalıştırıyorsa (v3
   * bootloader) REBOOTING döner ve yükleme moduna resetlenir — modül
   * bağlantıyı taşıdığı için BLE kopmadan BEGIN'i yeniden göndeririz.
   * Modül yine de kısa süreliğine düşerse otomatik yeniden bağlanma
   * araya girer; deneme penceresi onu da kapsar.
   */
  private async _beginHandshake(begin: Uint8Array): Promise<void> {
    if (!this.notifyAvailable) {
      // Kor mod: durum baytlarini goremeyiz. Robot kosan koddan yukleme
      // moduna resetleniyor olabilir (REBOOTING'i goremeyiz) -> BEGIN'i
      // aralikli 3 kez gonder; v4 bootloader tekrarlanan BEGIN'e dayanikli.
      this.onLog('system', 'Kör mod: robot yükleme moduna alınıyor…');
      await this._writeRaw(begin);
      await sleep(2500);                 // gozcu REBOOTING + yeniden acilis
      this._clearStatus();
      await this._writeRaw(begin);
      await sleep(1200);
      this._clearStatus();
      await this._writeRaw(begin);
      await sleep(600);
      return;
    }

    await this._writeRaw(begin);
    let s: number;
    try {
      s = await this._waitFor([STATUS_RECEIVING, STATUS_REBOOTING], 4000);
    } catch (e) {
      if ((e as Error).message.includes('zaman aşımı')) {
        throw new Error(
          'Robot yanıt vermedi. Robotu kapatıp açın; hâlâ olmuyorsa "Modülleri Yükle" ile robot yazılımını güncelleyin.'
        );
      }
      throw e;
    }
    if (s === STATUS_RECEIVING) return; // robot zaten hazırdı

    // REBOOTING → robot yükleme moduna resetleniyor. BEGIN'i tekrar dene.
    this.onLog('system', '⚙ Robot yükleme moduna geçiyor…');
    for (let attempt = 1; attempt <= 10; attempt++) {
      if (this.cancelled) throw new Error('Yükleme iptal edildi');
      await sleep(attempt === 1 ? 1200 : 900);
      if (this.cancelled) throw new Error('Yükleme iptal edildi');
      this._clearStatus();
      try {
        await this._writeRaw(begin);
      } catch {
        continue; // modül anlık düşmüş olabilir — reconnect araya girer
      }
      try {
        const r = await this._waitFor([STATUS_RECEIVING], 1500);
        if (r === STATUS_RECEIVING) return;
      } catch (e) {
        if ((e as Error).message.includes('STATUS_ERROR')) {
          // Yeniden gönderilen BEGIN yarım paket çöpüne denk gelmiş
          // olabilir — bir tur daha dene.
          continue;
        }
        // zaman aşımı → tekrar dene
      }
    }
    throw new Error('Robot yükleme moduna geçemedi — robotu kapatıp açın ve tekrar deneyin');
  }

  /**
   * Yükleme sonrası robotun ayağa kalktığını doğrula (PING → READY_V2).
   * Modül bağlantıyı taşıdığı için çoğu zaman ilk denemede yanıt gelir;
   * gelmezse ve bağlantı hâlâ açık görünüyorsa bayat bağlantıyı koparıp
   * otomatik yeniden bağlanmayı tetikleriz.
   */
  private async _verifyAlive(): Promise<void> {
    if (!this.notifyAvailable) return;
    // Jenerasyonu yakala: yeni bir yükleme/durdurma başlarsa (opSeq artar)
    // bu doğrulayıcı ONA KARIŞMADAN sessizce çekilir. Eskiden buradaki
    // _clearStatus, ikinci yüklemenin ACK/RECEIVING bekleyicisini yutuyordu.
    const mySeq = this.opSeq;
    for (let attempt = 1; attempt <= 5; attempt++) {
      await sleep(attempt === 1 ? 1200 : 1000);
      if (this.opSeq !== mySeq) return;         // yeni işlem devraldı — karışma
      if (this.state === 'busy') return;        // yükleme sürüyor — karışma
      if (this.state === 'connecting') return;  // reconnect zaten ilgileniyor
      if (this.state === 'disconnected') return;
      this._clearStatus();
      try {
        await this._writeRaw(new Uint8Array([MSG_PING]));
        const s = await this._nextStatus(1500);
        if (s === STATUS_READY_V2 || s === STATUS_READY) return;
      } catch {
        // yanıt yok — tekrar dene
      }
      if (this.opSeq !== mySeq) return;
    }
    // Robot yanıt vermiyor ama GATT "bağlı" görünüyor → bayat bağlantı.
    if (this.device?.gatt?.connected && this.expectReconnect) {
      this.onLog('system', 'Bağlantı tazeleniyor…');
      try { this.device.gatt.disconnect(); } catch {} // reconnect tetiklenir
    }
  }

  /** v2: açık uzunluklu parçalar + her parçaya ACK + zaman aşımında tekrar dene. */
  private async _sendChunksV2(
    codeBytes: Uint8Array,
    start: number,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    const bytesTotal = codeBytes.length;
    let chunkSize = CHUNK_SIZE_V2;
    let offset = 0;

    while (offset < bytesTotal) {
      if (this.cancelled) throw new Error('Yükleme iptal edildi');
      const dlen = Math.min(chunkSize, bytesTotal - offset);
      const pkt = new Uint8Array(7 + dlen);
      pkt[0] = MSG_CHUNK2;
      const view = new DataView(pkt.buffer);
      view.setUint32(1, offset, true);
      view.setUint16(5, dlen, true);
      pkt.set(codeBytes.subarray(offset, offset + dlen), 7);

      // Yaz — yazma reddedilirse (MTU küçük) parça boyutunu düşürüp
      // AYNI offset'i yeni boyutla tekrar paketle.
      try {
        await this._writeRaw(pkt);
      } catch (e) {
        if (chunkSize > CHUNK_SIZE_MIN) {
          chunkSize = Math.max(CHUNK_SIZE_MIN, Math.floor(chunkSize / 2));
          this.onLog('system', `Parça boyutu ${chunkSize} bayta düşürüldü (MTU sınırı)`);
          continue;
        }
        throw e;
      }

      // ACK bekle — zaman aşımında aynı parçayı 2 kez daha gönder.
      // (Bootloader aynı offset'i tekrar yazmaya karşı dayanıklıdır.)
      if (this.notifyAvailable) {
        let acked = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await this._waitFor([STATUS_ACK], 2500);
            acked = true;
            break;
          } catch (e) {
            if ((e as Error).message.includes('STATUS_ERROR')) throw e;
            if (attempt === 3) break;
            this.onLog('system', `Parça ${offset} tekrar gönderiliyor (${attempt}/2)…`);
            await this._writeRaw(pkt);
          }
        }
        if (!acked) {
          throw new Error(`Parça ${offset} için onay gelmedi — bağlantı zayıf olabilir, tekrar deneyin`);
        }
      } else {
        // Kör mod (notify yok): ACK göremeyiz → UART taşmasın diye hız sınırı
        await sleep(V1_CHUNK_DELAY_MS);
      }

      offset += dlen;

      const elapsed = (Date.now() - start) / 1000;
      const speedKBs = elapsed > 0 ? offset / 1024 / elapsed : 0;
      onProgress?.({ pct: (offset / bytesTotal) * 95, bytesSent: offset, bytesTotal, speedKBs });
    }
  }

  /** v1: sabit 200 baytlık parçalar, ACK yok → UART taşmasın diye hız sınırı. */
  private async _sendChunksV1(
    codeBytes: Uint8Array,
    start: number,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    const bytesTotal = codeBytes.length;
    let offset = 0;
    while (offset < bytesTotal) {
      if (this.cancelled) throw new Error('Yükleme iptal edildi');
      const dlen = Math.min(CHUNK_SIZE_V1, bytesTotal - offset);
      const pkt = new Uint8Array(5 + dlen);
      pkt[0] = MSG_CHUNK;
      new DataView(pkt.buffer).setUint32(1, offset, true);
      pkt.set(codeBytes.subarray(offset, offset + dlen), 5);
      // write-with-response tercih et: her yazma link katmanında onaylanır,
      // bu da doğal bir hız sınırı sağlar.
      await this._writeRaw(pkt, true);
      await sleep(V1_CHUNK_DELAY_MS);
      offset += dlen;

      const elapsed = (Date.now() - start) / 1000;
      const speedKBs = elapsed > 0 ? offset / 1024 / elapsed : 0;
      onProgress?.({ pct: (offset / bytesTotal) * 95, bytesSent: offset, bytesTotal, speedKBs });
    }
  }

  /**
   * Kullanıcı kodunu yükle ve çalıştır (BLE üzerinden).
   */
  async uploadCode(
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    this.expectReconnect = true;
    await this.uploadFile('user_code.py', code, onProgress);

    if (this.protoV2) {
      // v2/v3 (BerryBot): checksum doğrulandı, dosya yazıldı, Pico
      // resetlendi. BLE modülü Pico'dan bağımsız beslendiği için bağlantı
      // genelde KOPMAZ — yine de robotu PING ile doğrula; yanıt yoksa
      // bayat bağlantıyı tazele.
      this.onLog('system', '✓ Kod doğrulandı ve kaydedildi — robot yeni kodu çalıştırıyor');
      void this._verifyAlive();
      return;
    }

    if (!this.notifyAvailable) {
      // Kor mod: onay goremiyoruz ama robot aldiysa melodi + ekranda ✓
      // gosterir ve yeni kodu calistirmak icin kendini resetler.
      this.onLog('system', '✓ Kod gönderildi (kör mod) — robot MELODİ çalıp ekranda ✓ gösterdiyse kayıt başarılı');
      this.onLog('info', 'Melodi YOKSA dosya robota ulaşmadı: robotu KAPAT-AÇ (şeffaf mod sigortası devreye girer, çift bip bekle) ve tekrar yükle');
      return;
    }

    // v1 (eski bootloader / RoboExx Pico W): cihaz resetlenir, bağlantı düşer.
    this._setState('connecting');
    this.onLog('system', '⚙ Cihaz yeni kodu çalıştırmak için yeniden başlıyor…');
    this._autoReconnect();
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    } catch {}
    this.rxChar = null;
    this.txChar = null;
  }

  /**
   * Kütüphane dosyalarını yükle (berrybot.py, main.py, device_name.txt...).
   * Reset OLMAZ — sadece kaydedilir. (Bootloader v2 de kütüphane
   * dosyalarında reset atmaz; zincirleme yükleme bozulmaz.)
   */
  async uploadLibrary(
    filename: string,
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    await this.uploadFile(filename, code, onProgress);
  }

  /** Robotu durdur (v2): kod çalıştırılmadan boşta bekleyen moda reset. */
  async stopCode(): Promise<void> {
    if (this.state !== 'connected' && this.state !== 'busy') throw new Error('BLE bağlı değil');
    const wasBusy = this.state === 'busy';
    this.cancelled = true;  // süren yükleme varsa anında düşür
    this.opSeq++;           // önceki doğrulayıcıyı geçersiz kıl
    this._clearStatus();    // askıdaki bekleyiciler reject olsun
    // İptal edilen işlemin finally'sine ulaşıp state'i bırakmasını BEKLE —
    // bayrağı hemen temizlersek işlem kontrol noktasına gelmeden bayrak
    // kapanır ve zombi gibi devam ederdi (yarış durumu).
    if (wasBusy) {
      const t0 = Date.now();
      while ((this.state as BridgeState) === 'busy' && Date.now() - t0 < 2000) {
        await sleep(50);
      }
    }
    if (!this.protoV2) {
      this.cancelled = false;
      if ((this.state as BridgeState) === 'busy') this._setState('connected');
      throw new Error('Durdur için robot yazılımını güncelle ("Modülleri Yükle")');
    }
    this.expectReconnect = true;
    await this._writeRaw(new Uint8Array([MSG_STOP]));
    if ((this.state as BridgeState) === 'busy') this._setState('connected');
    this.cancelled = false;
    void this._verifyAlive();
  }

  /** Manual reset (Pico'yu yeniden başlat — mevcut kod tekrar çalışır) */
  async forceReset(): Promise<void> {
    const wasBusy = this.state === 'busy';
    this.cancelled = true;  // takılı yüklemeyi düşür
    this.opSeq++;
    this._clearStatus();
    // İptal edilen işlemin düşmesini bekle (bayrak yarışını önle)
    if (wasBusy) {
      const t0 = Date.now();
      while (this.state === 'busy' && Date.now() - t0 < 2000) {
        await sleep(50);
      }
    }
    if (this.rxChar) {
      try {
        this.expectReconnect = true;
        await this._writeRaw(new Uint8Array([MSG_RESET]));
      } catch {}
    }
    if (this.state === 'busy') this._setState('connected');
    this.cancelled = false;
  }

  // ====== private ======

  private _setState(s: BridgeState): void {
    if (this.state !== s) {
      this.state = s;
      this.onStateChange(s);
    }
  }

  private async _writeRaw(data: Uint8Array, preferResponse = false): Promise<void> {
    if (!this.rxChar) throw new Error('RX karakteristik yok');
    const c: any = this.rxChar;
    const p = c.properties || {};
    const tryWoR = async () => c.writeValueWithoutResponse(data);
    const tryW = async () => c.writeValue(data);
    let order: Array<() => Promise<void>>;
    if (preferResponse && p.write) order = [tryW, tryWoR];
    else if (p.writeWithoutResponse) order = [tryWoR, tryW];
    else if (p.write) order = [tryW, tryWoR];
    else order = [tryWoR, tryW];
    let lastErr: any = null;
    for (const fn of order) {
      try {
        await fn();
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Yazma başarısız');
  }

  /** Sensör cevap callback'i — [0x14] sonrası payload baytları gelir */
  public onSensorReply: ((payload: Uint8Array) => void) | null = null;

  private _onNotify = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value || value.byteLength < 1) return;
    this._ingest(value);
  };

  /** Gelen baytlari isle — notify'dan da read-yoklamadan da cagrilir. */
  private _ingest(value: DataView): void {
    // Sensör cevabı (0x14 + payload) — durum kuyruğuna KARIŞTIRMA
    if (value.getUint8(0) === MSG_SENSOR_REPLY) {
      this.linkAlive = true;
      if (this.onSensorReply) {
        const payload = new Uint8Array(value.buffer, value.byteOffset + 1, value.byteLength - 1);
        try { this.onSensorReply(payload); } catch { /* yut */ }
      }
      return;
    }
    // Modül birden fazla durum baytını tek notify'da birleştirebilir —
    // yalnız GEÇERLİ durum baytlarını (0x10-0x17) kuyruğa al; şeffaf mod
    // çöpü/print çıktısı kuyruk mantığını bozmasın.
    for (let i = 0; i < value.byteLength; i++) {
      const status = value.getUint8(i);
      if (status < 0x10 || status > 0x17) continue;
      this.linkAlive = true;
      if (this.statusWaiter) {
        const w = this.statusWaiter;
        this.statusWaiter = null;
        clearTimeout(w.timer);
        w.resolve(status);
      } else {
        this.statusQueue.push(status);
        if (this.statusQueue.length > 64) this.statusQueue.shift();
      }
    }
  }

  /**
   * Bildirimler olu: bazi moduller CCCD aboneligini kabul eder ama hic
   * notify GONDERMEZ. Karakteristikte 'read' varsa 250 ms'de bir okuyup
   * DEGISEN icerigi bayt akisi gibi isleriz — durum baytlari ve sensor
   * cevaplari bu yoldan da akar.
   */
  private _startReadPolling(): void {
    if (this.pollTimer || !this.txChar) return;
    const p: any = (this.txChar as any).properties || {};
    if (!p.read) return;
    this.lastPollHex = null;
    this.pollTimer = setInterval(async () => {
      const ch = this.txChar;
      if (!ch || this.state === 'disconnected') { this._stopReadPolling(); return; }
      try {
        const v = await ch.readValue();
        if (!v || v.byteLength < 1) return;
        let hex = '';
        for (let i = 0; i < v.byteLength; i++) hex += v.getUint8(i).toString(16).padStart(2, '0');
        if (hex === this.lastPollHex) return;   // ayni icerik — yeni veri yok
        this.lastPollHex = hex;
        this._ingest(v);
      } catch { /* okuma anlik basarisiz olabilir */ }
    }, 250);
  }

  private _stopReadPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Canlı klavye (WASD): basılı tuşları gönder. [0x0B][len][ascii] */
  async sendKeys(keys: string): Promise<void> {
    if (this.state !== 'connected' || !this.rxChar) return;
    const ascii = keys.slice(0, 16);
    const payload = new Uint8Array(2 + ascii.length);
    payload[0] = MSG_KEY;
    payload[1] = ascii.length;
    for (let i = 0; i < ascii.length; i++) payload[2 + i] = ascii.charCodeAt(i) & 0x7f;
    try { await this._writeRaw(payload); } catch { /* sessiz */ }
  }

  /**
   * Sensör değerlerini iste. sensors: [tip, pin1, pin2] üçlüleri.
   * Cevap onSensorReply(payload) ile gelir — her sensör için uint16 LE.
   */
  async requestSensors(sensors: Array<[number, number, number]>): Promise<void> {
    if (this.state !== 'connected' || !this.rxChar) return;
    if (sensors.length === 0) return;
    const payload = new Uint8Array(2 + sensors.length * 3);
    payload[0] = MSG_SENSOR_REQ;
    payload[1] = sensors.length & 0xff;
    for (let i = 0; i < sensors.length; i++) {
      payload[2 + i * 3] = sensors[i][0] & 0xff;
      payload[2 + i * 3 + 1] = sensors[i][1] & 0xff;
      payload[2 + i * 3 + 2] = sensors[i][2] & 0xff;
    }
    try { await this._writeRaw(payload); } catch { /* sessiz */ }
  }

  private _clearStatus(): void {
    this.statusQueue = [];
    if (this.statusWaiter) {
      const w = this.statusWaiter;
      this.statusWaiter = null;
      clearTimeout(w.timer);
      // KRİTİK: bekleyen promise'i reddet — eskiden sadece null'lanıyordu ve
      // promise SONSUZA DEK askıda kalıyordu (await asla dönmüyordu). Üst üste
      // yüklemede donmaların ana nedeni buydu.
      w.reject(new Error('BLE durum bekleyicisi iptal edildi'));
    }
  }

  /** Kuyruktan sıradaki durum baytını al (yoksa timeout kadar bekle). */
  private _nextStatus(timeoutMs: number): Promise<number> {
    if (this.statusQueue.length > 0) {
      return Promise.resolve(this.statusQueue.shift()!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.statusWaiter = null;
        reject(new Error('BLE zaman aşımı'));
      }, timeoutMs);
      this.statusWaiter = { resolve, reject, timer };
    });
  }

  /**
   * Beklenen durum baytlarından biri gelene kadar bekle.
   * STATUS_ERROR gelirse hata fırlatır; alakasız baytları yoksayar.
   */
  private async _waitFor(expected: number[], timeoutMs: number): Promise<number> {
    if (!this.notifyAvailable) {
      // Modülde notify yok — kör mod: kısa bekleyip devam et.
      await sleep(400);
      return expected[0];
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.cancelled) throw new Error('İşlem iptal edildi');
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`BLE zaman aşımı: durum 0x${expected[0].toString(16)} beklendi`);
      }
      const s = await this._nextStatus(remaining);
      if (expected.includes(s)) return s;
      if (s === STATUS_ERROR) throw new Error('Robot hata bildirdi (STATUS_ERROR) — aktarım bozuk, tekrar deneyin');
      // beklenmeyen bayt (ör. eski READY) → yoksay, beklemeye devam
    }
  }
}

export const bleBridge = new BLEBridge();
