import {
  type PortInfo,
  type BridgeState,
  friendlyNameFor,
  pythonBytesLiteral,
  pythonBytesLiteralFromBytes,
  RPI_VID,
  SUPPORTED_VIDS,
  isEsp32Like,
  isUartBridge,
} from './types';
import { webusbSerialShim, isWebUSBSupported } from './webusb-cdc';

// Web Serial type stubs (Chrome only API, not in standard lib.dom)
interface SerialPortLike {
  open(opts: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  addEventListener(event: 'disconnect', cb: () => void): void;
}

interface SerialAPI {
  requestPort(opts?: { filters?: Array<{ usbVendorId?: number }> }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener(event: 'connect' | 'disconnect', cb: (e: { target: SerialPortLike }) => void): void;
}

/**
 * SerialBridge — Web Serial üzerinden MicroPython kartlarıyla (Raspberry Pi
 * Pico / Pico W ve ESP32) haberleşme katmanı. Raw REPL protokolü her iki
 * ailede birebir aynıdır; Run ve Upload akışları kart fark etmeksizin çalışır.
 *
 * Üç işletim modu:
 *  - normal:    Pico'dan gelen text doğrudan onText'e gider (Serial Monitor)
 *  - silent:    Protokol haberleşmesi (raw REPL'e giriş, OK bekleme vb.) —
 *               gelen text silentBuffer'da birikir, monitöre düşmez
 *  - streaming: Raw REPL exec'i sırasında — gelen text canlı olarak monitöre
 *               akar, ama \x04 protokol işaretleri ayıklanır
 */
export class SerialBridge {
  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopPromise: Promise<void> | null = null;

  private decoder = new TextDecoder('utf-8', { fatal: false });
  private encoder = new TextEncoder();

  private silent = false;
  private silentBuffer = '';

  // Streaming mode: raw REPL exec sırasında çıktıyı canlı yayınla
  private streamMode = false;
  // Canlı "Çalıştır" (runCode) sürerken true. Bu sırada klavye/gamepad
  // tuşları seri porta yazılıp çalışan programın sys.stdin'ine gider.
  // Dosya yükleme (uploadCode/uploadLibrary) sırasında false kalır — o
  // fazlarda tuş enjekte etmek aktarımı bozabilir.
  private liveRun = false;
  private streamState: 'stdout' | 'stderr' | 'end' | 'done' = 'stdout';
  private streamStdout = '';
  private streamStderr = '';

  state: BridgeState = 'disconnected';
  portInfo: PortInfo | null = null;

  // Bağlı kart ESP32 mi? (DTR/RTS donanımsal reset sadece ESP32'de denenir)
  private esp32 = false;
  // UART köprü çipi mi (CP210x/CH340/FTDI)? Gerçek 115200 baud → küçük chunk
  private uartBridge = false;

  /**
   * Kontrollü yazılımsal reset (machine.reset) sürüyor mu?
   * True iken USB 'disconnect' event'i normal kopma gibi işlenmez —
   * bridge portu kendisi kapatıp yeniden bağlanır.
   */
  private rebooting = false;

  /**
   * Read loop jenerasyon sayacı. Yazılımsal reset sonrası eski read loop'un
   * yeni portu ele geçirmesini önler: her _startReadLoop çağrısı sayacı
   * artırır, eski loop kendi jenerasyonu eskiyince sessizce çıkar.
   */
  private readLoopGen = 0;

  // Public callbacks
  onStateChange: (state: BridgeState) => void = () => {};
  onConnect: (info: PortInfo) => void = () => {};
  onDisconnect: () => void = () => {};
  onText: (text: string) => void = () => {};
  onLog: (kind: 'system' | 'info' | 'error', message: string) => void = () => {};

  // ====== Public API ======

  isWebSerialSupported(): boolean {
    // Gerçek Web Serial (masaüstü) YA DA WebUSB CDC yolu (Android tablet)
    return (typeof navigator !== 'undefined' && 'serial' in navigator) || isWebUSBSupported();
  }

  /** Android tablette miyiz? (Web Serial yok ama WebUSB var → CDC şimi) */
  usingWebUSB(): boolean {
    return !(typeof navigator !== 'undefined' && 'serial' in navigator) && isWebUSBSupported();
  }

  /** Ortama göre doğru seri API'yi döndür. */
  private _serialApi(): SerialAPI {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      return (navigator as unknown as { serial: SerialAPI }).serial;
    }
    webusbSerialShim.log = (k, m) => this.onLog(k, m);
    return webusbSerialShim as unknown as SerialAPI;
  }

  /**
   * Web Serial kullanılabilirliğini detaylı kontrol eder.
   * App.tsx'in beklediği `{ ok, message }` formatında döner; ok=false
   * ise UI uyarı banner'ı için kullanıcı dostu açıklama mesajı içerir.
   */
  checkSupport(): { ok: boolean; message?: string } {
    if (typeof navigator === 'undefined') {
      return { ok: false, message: 'Tarayıcı ortamı bulunamadı.' };
    }
    if (!('serial' in navigator)) {
      if (isWebUSBSupported()) {
        // Android tablet: Web Serial yok ama WebUSB var — CDC şimiyle çalışırız
        return { ok: true };
      }
      return {
        ok: false,
        message:
          "Bu tarayıcıda USB erişimi yok. Bilgisayarda Chrome/Edge kullanın; Android tablette Chrome (WebUSB) çalışır. iPad USB desteklemez — orada Bluetooth ile bağlanın.",
      };
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      return {
        ok: false,
        message:
          'Web Serial yalnızca güvenli bağlamda (HTTPS veya localhost) çalışır.',
      };
    }
    return { ok: true };
  }

  /**
   * Daha önce yetkilendirilmiş portu bulup otomatik bağlanmayı dener.
   */
  async tryAutoConnect(): Promise<PortInfo | null> {
    if (!this.isWebSerialSupported()) return null;
    try {
      const serial = this._serialApi();
      const ports = await serial.getPorts();
      // Önce Pico'yu, yoksa desteklenen herhangi bir kartı (ESP32) dene
      const devicePort =
        ports.find((p) => p.getInfo().usbVendorId === RPI_VID) ??
        ports.find((p) => {
          const vid = p.getInfo().usbVendorId;
          return vid !== undefined && SUPPORTED_VIDS.includes(vid);
        });
      if (!devicePort) return null;
      return await this._connect(devicePort);
    } catch (e) {
      console.warn('Auto-connect failed:', e);
      return null;
    }
  }

  /**
   * Picker dialogunu açar (Pico + ESP32 kartlarına filtreli) ve bağlanır.
   */
  async requestAndConnect(): Promise<PortInfo> {
    if (!this.isWebSerialSupported()) {
      throw new Error('Bu tarayıcıda USB erişimi yok. Bilgisayarda Chrome/Edge; Android tablette Chrome kullanın.');
    }
    if (this.usingWebUSB()) {
      this.onLog('system', '📱 Tablet modu: USB bağlantısı WebUSB (CDC) üzerinden kurulacak');
    }
    const serial = this._serialApi();
    let port: SerialPortLike;
    try {
      port = await serial.requestPort({
        filters: SUPPORTED_VIDS.map((vid) => ({ usbVendorId: vid })),
      });
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err?.name === 'NotFoundError') {
        throw new Error('Cihaz seçilmedi');
      }
      throw e;
    }
    return this._connect(port);
  }

  async disconnect(): Promise<void> {
    this._setState('disconnected');
    this.liveRun = false;
    this.readLoopGen++; // aktif read loop'u geçersiz kıl
    try { await this.reader?.cancel(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.portInfo = null;
    this.esp32 = false;
    this.uartBridge = false;
    this.onDisconnect();
  }

  /**
   * Friendly REPL'e komut gönder (Serial Monitor input'u için).
   */
  async sendCommand(cmd: string): Promise<void> {
    if (this.state !== 'connected') return;
    await this._write(cmd + '\r\n');
  }

  /**
   * Çalışan programı durdur (Ctrl-C iki kere) + motor/PWM temizliği.
   *
   * ÖNEMLİ: Ctrl-C programı kesse bile PWM DONANIMI son duty'de çıkış
   * vermeye devam eder (özellikle ESP32 LEDC) — motor dönmeye devam eder!
   * Bu yüzden kesmeden hemen sonra REPL'e bir temizlik komutu gönderilir:
   *   - Üretilen koddaki _rx_l9110_pwm ve roboexx._pwm_cache içindeki tüm
   *     PWM'ler duty=0 + deinit edilir, pinleri dijital LOW'a çekilir
   *   - L9110 pinlerine kısa fren darbesi (iki giriş HIGH) verilir
   */
  async interrupt(): Promise<void> {
    if (!this.writer) return;
    await this._write('\r\x03\x03');
    // Eğer busy state'de takılı kalmışsak zorla resetle
    this._forceIdle();
    // Ctrl-C sonrası friendly REPL'in oturması için kısa bekleme,
    // ardından motor/PWM temizliği (fire-and-forget, hata yutulur)
    setTimeout(() => {
      this._sendMotorCleanup().catch(() => {});
    }, 250);
  }

  /**
   * REPL'e tek satırlık PWM/motor temizlik komutu yaz.
   * Çalışan program yoksa veya ilgili globals tanımlı değilse no-op'tur;
   * Pico'da da zararsızdır (orada da PWM Ctrl-C sonrası çalışmaya devam eder).
   */
  private async _sendMotorCleanup(): Promise<void> {
    if (!this.writer || this.silent || this.state !== 'connected') return;
    const py =
      'exec("try:\\n' +
      ' import sys, time\\n' +
      ' from machine import Pin\\n' +
      ' _l9=globals().get(\'_rx_l9110_pwm\')\\n' +
      ' _l9p=list(_l9.keys()) if _l9 else []\\n' +
      ' _ds=[_l9,getattr(sys.modules.get(\'roboexx\'),\'_pwm_cache\',None)]\\n' +
      ' for _d in _ds:\\n' +
      '  if _d:\\n' +
      '   for _p,_o in list(_d.items()):\\n' +
      '    try:\\n' +
      '     _o.duty_u16(0)\\n' +
      '    except Exception:\\n' +
      '     pass\\n' +
      '    try:\\n' +
      '     _o.deinit()\\n' +
      '    except Exception:\\n' +
      '     pass\\n' +
      '    try:\\n' +
      '     Pin(_p,Pin.OUT).value(0)\\n' +
      '    except Exception:\\n' +
      '     pass\\n' +
      '   _d.clear()\\n' +
      ' if _l9p:\\n' +
      '  _ps=[Pin(_p,Pin.OUT) for _p in _l9p]\\n' +
      '  for _q in _ps:\\n' +
      '   _q.value(1)\\n' +
      '  time.sleep_ms(80)\\n' +
      '  for _q in _ps:\\n' +
      '   _q.value(0)\\n' +
      'except Exception:\\n' +
      ' pass")';
    try {
      await this._write(py + '\r\n');
    } catch {
      // sessiz yut
    }
  }

  /**
   * KURTARMA — sıkışan bridge'i zorla idle'a getir.
   * Kullanıcı "Meşgul" göstergesinden çıkamazsa bunu çağırır.
   * Port hala açıksa connected, değilse disconnected.
   */
  async forceReset(): Promise<void> {
    this._forceIdle();
    try {
      if (this.writer) {
        // Pico'ya da hard interrupt gönder
        await this._write('\r\x03\x03');
      }
    } catch {}
  }

  /**
   * Klavye / gamepad basılı tuşlarını USB seri ile Pico'ya bildir.
   * Protokol: \x06 + ASCII tuşlar + \n  (Pico tarafı sys.stdin'den okur)
   *
   * Gönderilebilecek durumlar:
   *   - state 'connected'         → friendly REPL veya yüklenmiş main.py çalışıyor
   *   - state 'busy' + liveRun    → canlı "Çalıştır" sürüyor, tuşlar programın
   *                                 sys.stdin'ine akar
   * Bloklanan durumlar:
   *   - silent                    → raw REPL el sıkışma/dosya aktarımı (bayt
   *                                 enjekte etmek protokolü bozar)
   *   - dosya yükleme (busy ama liveRun=false)
   */
  async sendKeys(keys: string): Promise<void> {
    if (!this.writer) return;
    if (this.silent) return; // raw REPL aktarımı sürüyor — karışma
    const canSend =
      this.state === 'connected' || (this.state === 'busy' && this.liveRun);
    if (!canSend) return;
    const safe = keys.toLowerCase().slice(0, 16);
    try {
      await this._write('\x06' + safe + '\n');
    } catch {
      // sessiz yut
    }
  }

  /** İç state'leri temizle, busy durumundan çıkar. */
  private _forceIdle(): void {
    this.silent = false;
    this.silentBuffer = '';
    this.streamMode = false;
    this.liveRun = false;
    this.streamState = 'stdout';
    this.streamStdout = '';
    this.streamStderr = '';
    if (this.port !== null) {
      this._setState('connected');
    } else {
      this._setState('disconnected');
    }
  }

  /**
   * Run: Kodu raw REPL ile çalıştır. Çıktı CANLI olarak Serial Monitor'a akar.
   */
  async runCode(code: string): Promise<void> {
    if (this.state !== 'connected') throw new Error('Bağlı değil');
    this._setState('busy');
    this.liveRun = true; // tuş enjeksiyonuna izin ver (canlı çalıştırma)
    console.log('[RoboExx] runCode başladı, kod boyutu:', code.length);
    try {
      console.log('[RoboExx] _enterRaw çağrılıyor...');
      await this._enterRaw();
      console.log('[RoboExx] _enterRaw tamamlandı, _execRaw başlıyor');
      await this._execRaw(code);
      console.log('[RoboExx] _execRaw tamamlandı, _exitRaw başlıyor');
      await this._exitRaw();
      console.log('[RoboExx] runCode başarılı bitiş');
    } catch (e) {
      console.error('[RoboExx] runCode HATA:', e);
      throw e;
    } finally {
      console.log('[RoboExx] runCode finally — _forceIdle çağrılıyor, mevcut state:', this.state);
      this._forceIdle();
      console.log('[RoboExx] _forceIdle sonrası state:', this.state);
    }
  }

  /**
   * Upload: Kodu main.py olarak flash'a yaz + soft reset.
   */
  async uploadCode(
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    if (this.state !== 'connected') throw new Error('Bağlı değil');
    this._setState('busy');

    const start = Date.now();
    const codeBytes = this.encoder.encode(code);
    const bytesTotal = codeBytes.length;
    const CHUNK_BYTES = 1024;

    try {
      await this._enterRaw();
      onProgress?.({ pct: 0, bytesSent: 0, bytesTotal, speedKBs: 0 });

      // 0) Bootloader'ın çekirdek-1 gözcüsünü durdur — flash'a yazarken
      //    diğer çekirdek çalışmamalı (RP2040 XIP kısıtı). Bootloader yoksa
      //    zararsız bir değişken ataması olur.
      await this._stopWatcher();

      // 1) Kullanıcı kodunu HER ZAMAN user_code.py'ye yaz. main.py bir
      //    "çalıştırıcı"dır (BLE bootloader'ı ya da mini stub — ikisi de
      //    BERRYBOT-BOOT imzalı). Eski davranış (kodu main.py'ye yazmak)
      //    BLE bootloader'ını EZİYORDU.
      await this._execRaw(`f=open('user_code.py','wb')\nprint('__OPEN__')\n`);

      // 2) Chunk'lar halinde yaz — Pico'nun RAM'i taşmasın
      let offset = 0;
      while (offset < bytesTotal) {
        const end = Math.min(offset + CHUNK_BYTES, bytesTotal);
        const chunk = codeBytes.slice(offset, end);
        const literal = pythonBytesLiteralFromBytes(chunk);
        await this._execRaw(`f.write(${literal})\nprint('__C__')\n`);
        offset = end;
        const elapsed = (Date.now() - start) / 1000;
        const speedKBs = elapsed > 0 ? offset / 1024 / elapsed : 0;
        onProgress?.({
          pct: (offset / bytesTotal) * 90,
          bytesSent: offset,
          bytesTotal,
          speedKBs,
        });
      }

      // 3) Kapat ve doğrula
      const { output, error } = await this._execRaw(
        `f.close()\nimport os\nprint('__OK__',os.stat('user_code.py')[6])\n`
      );

      if (error && error.trim()) {
        throw new Error(error.trim());
      }
      if (!output.includes('__OK__')) {
        throw new Error('Yazma doğrulaması başarısız');
      }

      // 4) main.py bir çalıştırıcı mı? (BLE bootloader veya stub — ikisi de
      //    'BERRYBOT-BOOT' imzası taşır.) Değilse/yoksa user_code.py'yi
      //    çalıştıran mini stub'ı yaz. Bootloader'a ASLA dokunma.
      const probe = await this._execRaw(
        `h=''\ntry:\n    f=open('main.py')\n    h=f.read(120)\n    f.close()\nexcept Exception:\n    pass\nprint('__BOOT__' if 'BERRYBOT-BOOT' in h else '__NOBOOT__')\n`
      );
      if (!probe.output.includes('__BOOT__')) {
        const stub = [
          '# BERRYBOT-BOOT stub — user_code.py calistirici (USB).',
          '# BLE ile de yukleme icin "Modulleri Yukle" (tam bootloader kurulur).',
          'try:',
          "    with open('user_code.py') as _f:",
          '        _c = _f.read()',
          'except OSError:',
          '    _c = None',
          'if _c:',
          "    exec(_c, {'__name__': '__main__'})",
          '',
        ].join('\n');
        const stubLiteral = pythonBytesLiteralFromBytes(this.encoder.encode(stub));
        const stubRes = await this._execRaw(
          `f=open('main.py','wb')\nf.write(${stubLiteral})\nf.close()\nprint('__STUB__')\n`
        );
        if (!stubRes.output.includes('__STUB__')) {
          throw new Error('main.py çalıştırıcısı yazılamadı');
        }
      }

      const elapsed = (Date.now() - start) / 1000;
      const speedKBs = elapsed > 0 ? bytesTotal / 1024 / elapsed : 0;
      onProgress?.({ pct: 95, bytesSent: bytesTotal, bytesTotal, speedKBs });

      await this._exitRaw();
      await this._write('\x04'); // friendly REPL'de Ctrl-D = soft reset

      onProgress?.({ pct: 100, bytesSent: bytesTotal, bytesTotal, speedKBs });
    } finally {
      this._forceIdle();
    }
  }

  /**
   * Pico'ya dosya yükle (örn. roboexx.py kütüphanesi).
   * uploadCode'dan farkları:
   *   - filename parametresi alır
   *   - soft reset YAPMAZ (kullanıcının çalışan programı kesilmesin)
   *   - "Modülleri Yükle" butonundan çağrılır
   */
  async uploadLibrary(
    filename: string,
    code: string,
    onProgress?: (p: { pct: number; bytesSent: number; bytesTotal: number; speedKBs: number }) => void
  ): Promise<void> {
    if (this.state !== 'connected') throw new Error('Bağlı değil');
    this._setState('busy');

    const start = Date.now();
    const codeBytes = this.encoder.encode(code);
    const bytesTotal = codeBytes.length;

    // Büyük dosyalar (>4KB) için chunk'lara böl — Pico W'nin sınırlı RAM'i
    // tek seferde 14 KB bytes literal'i parse edemiyor (MemoryError).
    // Her chunk için ayrı bir f.write() raw REPL komutu gönder.
    const CHUNK_BYTES = 1024;

    try {
      await this._enterRaw();
      await this._stopWatcher();
      onProgress?.({ pct: 0, bytesSent: 0, bytesTotal, speedKBs: 0 });

      // 1) Dosyayı aç (boş)
      await this._execRaw(`f=open('${filename}','wb')\nprint('__OPEN__')\n`);

      // 2) Her chunk'ı ayrı yaz
      let offset = 0;
      while (offset < bytesTotal) {
        const end = Math.min(offset + CHUNK_BYTES, bytesTotal);
        const chunk = codeBytes.slice(offset, end);
        const literal = pythonBytesLiteralFromBytes(chunk);
        // Tek satır gönder — minimum RAM kullanımı
        const pyCode = `f.write(${literal})\nprint('__C__')\n`;
        await this._execRaw(pyCode);

        offset = end;
        const elapsed = (Date.now() - start) / 1000;
        const speedKBs = elapsed > 0 ? offset / 1024 / elapsed : 0;
        onProgress?.({
          pct: (offset / bytesTotal) * 95,
          bytesSent: offset,
          bytesTotal,
          speedKBs,
        });
      }

      // 3) Dosyayı kapat ve doğrula
      const { output, error } = await this._execRaw(
        `f.close()\nimport os\nprint('__OK__',os.stat('${filename}')[6])\n`
      );

      if (error && error.trim()) {
        throw new Error(error.trim());
      }
      if (!output.includes('__OK__')) {
        throw new Error('Yazma doğrulaması başarısız');
      }

      const elapsed = (Date.now() - start) / 1000;
      const speedKBs = elapsed > 0 ? bytesTotal / 1024 / elapsed : 0;

      await this._exitRaw();
      onProgress?.({ pct: 100, bytesSent: bytesTotal, bytesTotal, speedKBs });
    } finally {
      this._forceIdle();
    }
  }

  // ====== Private ======

  /** Bootloader v3/v4 gözcüsünü (çekirdek-1) durdur — flash yazımı öncesi. */
  private async _stopWatcher(): Promise<void> {
    try {
      await this._execRaw(
        `_watch_stop=True\nimport time as _t\n_t.sleep_ms(700)\nprint('__W__')\n`
      );
    } catch {
      // gözcü yoksa / eski firmware — önemsiz
    }
  }

  private _setState(s: BridgeState) {
    if (this.state !== s) {
      this.state = s;
      this.onStateChange(s);
    }
  }

  private async _connect(port: SerialPortLike): Promise<PortInfo> {
    // Concurrent connect guard — StrictMode dev'de iki kere mount olunca
    // ikinci çağrı önceki port.open() devam ederken patlıyor.
    if (this.state === 'connecting' || this.state === 'connected' || this.state === 'busy') {
      if (this.portInfo) return this.portInfo;
      throw new Error('Bağlantı zaten kuruluyor');
    }
    this._setState('connecting');
    try {
      await this._openPort(port);
    } catch (e: unknown) {
      // "already in progress" hatası StrictMode'da olur — sessizce yut
      const err = e as { name?: string; message?: string };
      this._setState('disconnected');
      if (err?.name === 'InvalidStateError' || (err?.message ?? '').includes('already')) {
        throw new Error('Port zaten açılıyor — tekrar dene');
      }
      throw e;
    }

    const info = port.getInfo();
    this.portInfo = {
      vendorId: info.usbVendorId,
      productId: info.usbProductId,
      friendlyName: friendlyNameFor(info),
    };
    this._setState('connected');
    this.onConnect(this.portInfo);
    return this.portInfo;
  }

  /**
   * Portu aç, kart tipini belirle, sinyalleri ayarla, writer + read loop kur.
   * Hem ilk bağlantı (_connect) hem yazılımsal reset sonrası yeniden
   * bağlanma (_hardResetAndReconnect) tarafından kullanılır.
   */
  private async _openPort(port: SerialPortLike): Promise<void> {
    await port.open({ baudRate: 115200, bufferSize: 8192 });
    this.port = port;

    // Kart tipini belirle
    const rawInfo = port.getInfo();
    this.esp32 = isEsp32Like(rawInfo);
    this.uartBridge = isUartBridge(rawInfo);

    // ESP32 auto-reset devresi (EN=IO0 transistör çifti): DTR ve RTS'in
    // İKİSİ birden assert edilince kart normal çalışır. Chrome açılışta
    // genelde ikisini de assert eder ama bazı sürücülerde (özellikle CH340)
    // garanti değil — kartın resette/bootloader'da takılı kalmaması için
    // burada açıkça ayarlıyoruz. Pico için DTR assert USB-CDC "bağlı"
    // sinyalidir, o yüzden her kart için güvenli.
    try {
      await port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
    } catch {
      // setSignals bazı sürücülerde yok — sessizce geç
    }

    port.addEventListener('disconnect', () => {
      // Kontrollü yazılımsal reset sırasında USB'nin kopması BEKLENEN bir
      // durum — bridge kendi yeniden bağlanacak, kullanıcıya kopma gösterme.
      if (this.rebooting) return;
      this.onLog('system', 'USB bağlantısı kesildi');
      this.disconnect();
    });

    if (port.writable) {
      this.writer = port.writable.getWriter();
    }

    this.readLoopPromise = this._startReadLoop();
  }

  /** Silent buffer'daki bayat veriyi at (yeni el sıkışmadan önce). */
  private _drainStale(): void {
    this.silentBuffer = '';
  }

  /**
   * SON ÇARE — kartı yazılımsal olarak resetle ve otomatik yeniden bağlan.
   *
   * Sıkışan Pico'da (eski main.py core1 thread'i, kilitli döngü vb.) soft
   * reset (Ctrl-D) bile takılı kalabiliyor; kullanıcı fiziksel RESET tuşuna
   * basmak zorunda kalıyordu. Bu fonksiyon aynı işi YAZILIMLA yapar:
   *   1. Friendly REPL'e kör olarak `machine.reset()` gönder (hard reset —
   *      core1 thread'lerini beklemez, USB dahil tüm çipi yeniden başlatır)
   *   2. USB yeniden numaralandırılır → eski portu kapat
   *   3. Daha önce yetkilendirilmiş portu (izin kalıcıdır) tekrar bul ve aç
   *
   * Başarılıysa true döner; kart temiz boot etmiş, REPL'e girilebilir durumda.
   */
  private async _hardResetAndReconnect(): Promise<boolean> {
    if (!this.port) return false;
    this.onLog('info', '⟳ Kart yazılımsal olarak resetleniyor (RESET tuşuna gerek yok)…');
    this.rebooting = true;
    try {
      // 1) Kör komut: önce Ctrl-C'lerle friendly REPL'e dönmeyi dene,
      //    sonra machine.reset(). REPL cevap vermese bile zarar yok.
      try {
        await this._write('\r\x03\x03');
        await new Promise((r) => setTimeout(r, 250));
        await this._write('\r\x03');
        await new Promise((r) => setTimeout(r, 150));
        await this._write('import machine\r\nmachine.reset()\r\n');
      } catch {
        // yazma hatası — port zaten kopmuş olabilir, devam
      }

      // 2) USB'nin düşmesi için bekle, sonra eski portu tamamen kapat
      await new Promise((r) => setTimeout(r, 700));
      this.readLoopGen++; // eski read loop'u geçersiz kıl
      try { await this.reader?.cancel(); } catch {}
      try { this.writer?.releaseLock(); } catch {}
      this.writer = null;
      this.reader = null;
      try { await this.port?.close(); } catch {}
      this.port = null;

      // 3) Kart yeniden numaralandırılana kadar portu ara (en fazla 12sn)
      const serial = this._serialApi();
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const ports = await serial.getPorts();
          const devicePort =
            ports.find((p) => p.getInfo().usbVendorId === RPI_VID) ??
            ports.find((p) => {
              const vid = p.getInfo().usbVendorId;
              return vid !== undefined && SUPPORTED_VIDS.includes(vid);
            });
          if (!devicePort) continue;
          await this._openPort(devicePort);
          // Boot'un oturması + MicroPython banner'ının basılması için bekle
          await new Promise((r) => setTimeout(r, 1200));
          this._drainStale();
          this.onLog('info', '✓ Kart resetlendi ve yeniden bağlanıldı');
          return true;
        } catch {
          // port henüz hazır değil / açılamadı — tekrar dene.
          // (this.port'u yerel değişkene al — TS, _openPort içindeki
          // atamayı takip edemediği için tipi 'null'a daraltıyor.)
          const halfOpen = this.port as SerialPortLike | null;
          try { await halfOpen?.close(); } catch {}
          this.port = null;
          this.writer = null;
        }
      }
      this.onLog('error', 'Kart reset sonrası bulunamadı — USB kablosunu kontrol et');
      return false;
    } finally {
      this.rebooting = false;
    }
  }

  private async _startReadLoop(): Promise<void> {
    const myGen = ++this.readLoopGen;
    while (this.port?.readable && myGen === this.readLoopGen) {
      try {
        this.reader = this.port.readable.getReader();
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (!value) continue;

          const text = this.decoder.decode(value, { stream: true });
          if (!text) continue;

          if (this.streamMode) {
            this._processStream(text);
          } else if (this.silent) {
            this.silentBuffer += text;
          } else {
            this.onText(text);
          }
        }
      } catch (e) {
        if (this.state !== 'disconnected') {
          console.warn('Read loop error:', e);
        }
      } finally {
        try { this.reader?.releaseLock(); } catch {}
        this.reader = null;
      }
      if (this.state === 'disconnected') break;
      if (myGen !== this.readLoopGen) break; // yeni loop devraldı
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * Streaming mode: Raw REPL exec çıktısını canlı parse et.
   * Format: <stdout>\x04<stderr>\x04>
   * \x04 işaretleri ayıklanır, kullanıcı içerik canlı olarak onText'e akar.
   */
  private _processStream(text: string): void {
    // Hangi byte'lar geldi? \x04 = 0x04 = "End of Transmission"
    const has04 = text.includes('\x04');
    const has04Bracket = text.includes('\x04>');
    if (has04 || has04Bracket) {
      console.log('[RoboExx] _processStream chunk:', JSON.stringify(text.slice(0, 80)),
        'state:', this.streamState, 'has \\x04:', has04, 'has \\x04>:', has04Bracket);
    }
    let pos = 0;
    while (pos < text.length && this.streamState !== 'done') {
      if (this.streamState === 'stdout') {
        const idx = text.indexOf('\x04', pos);
        if (idx === -1) {
          const chunk = text.slice(pos);
          this.streamStdout += chunk;
          if (chunk) this.onText(chunk);
          return;
        }
        const chunk = text.slice(pos, idx);
        this.streamStdout += chunk;
        if (chunk) this.onText(chunk);
        pos = idx + 1;
        this.streamState = 'stderr';
      } else if (this.streamState === 'stderr') {
        const idx = text.indexOf('\x04', pos);
        if (idx === -1) {
          const chunk = text.slice(pos);
          this.streamStderr += chunk;
          if (chunk) this.onText(chunk);
          return;
        }
        const chunk = text.slice(pos, idx);
        this.streamStderr += chunk;
        if (chunk) this.onText(chunk);
        pos = idx + 1;
        this.streamState = 'end';
      } else if (this.streamState === 'end') {
        if (text[pos] === '>') this.streamState = 'done';
        pos++;
      }
    }
  }

  private async _write(data: Uint8Array | string): Promise<void> {
    if (!this.writer) throw new Error('Yazıcı hazır değil');
    const bytes = typeof data === 'string' ? this.encoder.encode(data) : data;
    // Zaman aşımı emniyeti: USB yığını sıkışırsa write() hiç dönmeyebilir ve
    // tüm uygulama "Meşgul"de kalır. 4sn'de dönmezse hata fırlat — üst
    // katman (enterRaw stratejileri) kurtarmayı devralır.
    await Promise.race([
      this.writer.write(bytes),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Seri porta yazma zaman aşımı — kart cevap vermiyor')), 4000)
      ),
    ]);
  }

  private async _waitForBuffer(needle: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (true) {
      if (this.silentBuffer.includes(needle)) return;
      if (Date.now() - start > timeoutMs) {
        throw new Error('Zaman aşımı: bekleniyor "' + needle.replace(/[\r\n\x01-\x1f]/g, '·').slice(0, 40) + '"');
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  /**
   * ESP32'yi DTR/RTS ile donanımsal olarak resetle (uygulama moduna).
   * Klasik auto-reset devresi: RTS assert + DTR deassert → EN low (reset),
   * sonra ikisini bırak → kart normal boot eder. Pico'da bu devre yok,
   * o yüzden sadece ESP32 kartlarda çağrılır.
   */
  private async _hardResetEsp32(): Promise<void> {
    if (!this.esp32 || !this.port?.setSignals) return;
    try {
      this.onLog('info', 'ESP32 donanımsal reset deneniyor…');
      // EN'i çek (reset) — IO0 high kalsın ki bootloader'a DÜŞMESİN
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 120));
      // Bırak → normal boot
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 60));
      // DTR'yi tekrar assert et (USB-CDC bağlı sinyali / IO0 devresi dengede)
      await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
      // ESP32 boot log'unu basar — REPL hazır olana dek bekle
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      // sürücü desteklemiyorsa sessizce geç
    }
  }

  /**
   * Tek bir raw REPL giriş denemesi: Ctrl-A gönder, banner'ı bekle.
   * MicroPython raw REPL'e girince "raw REPL; CTRL-B to exit" basar;
   * zaten raw REPL'deyse Ctrl-A banner'ı yeniden basar — iki durumda da OK.
   */
  private async _tryRawEntry(timeoutMs: number): Promise<boolean> {
    this._drainStale();
    try {
      await this._write('\r\x01');
      await this._waitForBuffer('raw REPL', timeoutMs);
      await new Promise((r) => setTimeout(r, 50));
      this._drainStale();
      return true;
    } catch {
      return false;
    }
  }

  private async _enterRaw(): Promise<void> {
    this.silent = true;
    this._drainStale();

    // STRATEJİ 1: Friendly REPL'de varsayalım — SABIRLI kesme.
    // Tek çift Ctrl-C sıkı döngülerde her zaman yakalanmıyor; mpremote gibi
    // Ctrl-C'yi aralıklarla birkaç kez gönder, sonra Ctrl-A ile raw'a gir.
    try {
      for (let i = 0; i < 3; i++) {
        await this._write('\r\x03\x03');
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch {
      // yazma zaman aşımı — sonraki stratejiler / yazılımsal reset devralır
    }
    await new Promise((r) => setTimeout(r, 200));
    if (await this._tryRawEntry(2000)) return;

    // STRATEJİ 2: Soft reset (Ctrl-D) — main.py yeniden başlar, USB aktivite
    // tespiti devreye girer (yeni bootloader). Sonra tekrar kes + raw REPL'e gir.
    try {
      this._drainStale();
      await this._write('\r\x04');
      await new Promise((r) => setTimeout(r, 400));
      await this._write('\x03\x03\x03');
      await new Promise((r) => setTimeout(r, 2500));
      await this._write('\r\x03\x03');
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      // yazma hatası — devam
    }
    if (await this._tryRawEntry(3000)) return;

    // STRATEJİ 3: Pico sıkışmış (eski main.py, core1 thread, BLE meşgul).
    // Yeni bootloader USB byte gelince reset yapar — Ctrl-C'leri art arda
    // gönder ve uzun bekle, Pico kendini resetlesin. Sonra tekrar dene.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this._drainStale();
        // ESP32 ise: DTR/RTS ile donanımsal reset dene (Pico'da no-op)
        if (this.esp32) {
          await this._hardResetEsp32();
          this._drainStale();
        }
        // Yoğun byte trafiği → yeni bootloader bunu yakalayıp reset eder
        await this._write('\x03\x03\x03\x03\x03');
        await new Promise((r) => setTimeout(r, 1500));
        await this._write('\r\x03');
      } catch {
        // yazma hatası — reset stratejisine düş
        break;
      }
      if (await this._tryRawEntry(2500)) return;
    }

    // STRATEJİ 4 (SON ÇARE): Yazılımsal hard reset + otomatik yeniden bağlanma.
    // Fiziksel RESET tuşuna basmanın yazılımla yapılmış hali — machine.reset()
    // core1 thread'lerini beklemeden tüm çipi yeniden başlatır. Kart temiz
    // boot edince raw REPL'e girmek her zaman mümkündür.
    const resetOk = await this._hardResetAndReconnect();
    if (resetOk) {
      this.silent = true; // yeniden bağlanma sırasında akış silent kalmalı
      this._drainStale();
      try {
        await this._write('\r\x03\x03');
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
      if (await this._tryRawEntry(4000)) return;
      // İlk deneme tutmadıysa kart hâlâ boot ediyor olabilir — bir kez daha
      await new Promise((r) => setTimeout(r, 1500));
      if (await this._tryRawEntry(4000)) return;
    }

    // Hiçbir strateji çalışmadı → kullanıcıya net mesaj ver
    throw new Error(
      (this.esp32 ? 'ESP32' : 'Pico') + ' REPL\'e dönmüyor. Lütfen USB kablosunu çıkarıp tak ' +
      'veya karttaki fiziksel ' + (this.esp32 ? 'EN/RST' : 'RESET') + ' tuşuna bas, sonra tekrar dene. ' +
      (this.esp32
        ? '(ESP32\'de MicroPython yüklü olduğundan emin ol — micropython.org/download/esp32)'
        : '(Kabloyu tekrar taktıktan sonra "Bağlan" ile yeniden bağlanabilirsin.)')
    );
  }

  private async _exitRaw(): Promise<void> {
    try {
      await this._write('\r\x02');
      await this._waitForBuffer('>>>', 2000);
    } catch {
      // sessizce yut
    }
    this.silent = false;
    this.silentBuffer = '';
  }

  /**
   * Raw REPL'de kodu çalıştır.
   *
   * İki aşamalı:
   *  1. Silent: Kodu chunk'larla gönder, "OK" işaretini bekle
   *  2. Streaming: Çıktıyı canlı olarak Serial Monitor'a yansıt, \x04> ile bitir
   */
  private async _execRaw(
    code: string,
    onChunkSent?: (sent: number, total: number) => void
  ): Promise<{ output: string; error: string }> {
    const codeBytes = this.encoder.encode(code);
    const total = codeBytes.length;
    // Büyük yüklemelerde kartın yetişmesi için chunk + pause:
    //  - Pico / Espressif native USB (USB-CDC): 512 bayt + 8ms emniyetli
    //  - CP210x/CH340/FTDI (gerçek 115200 UART): ESP32'nin UART RX tamponu
    //    küçük (256B) — 128 bayt + 20ms ile taşma yaşanmıyor
    const chunkSize = this.uartBridge ? 128 : 512;
    const pauseMs = this.uartBridge ? 20 : 8;

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = codeBytes.slice(i, Math.min(i + chunkSize, total));
      await this._write(chunk);
      const sent = Math.min(i + chunkSize, total);
      onChunkSent?.(sent, total);
      if (i + chunkSize < total) {
        await new Promise((r) => setTimeout(r, pauseMs));
      }
    }

    // Çalıştır (Ctrl-D)
    await this._write('\x04');
    console.log('[RoboExx] Ctrl-D yazıldı, OK bekleniyor...');

    // OK işaretini silent buffer'da bekle
    await this._waitForBuffer('OK', 3000);
    console.log('[RoboExx] OK alındı, silentBuffer:', JSON.stringify(this.silentBuffer.slice(0, 100)));

    // KRİTİK: "OK" sonrası silent buffer'da kalan veriyi alıp stream parser'a
    // ver. Yeni Pico firmware'leri "OK" + stream + end-marker'ı tek pakette
    // gönderiyor. Eğer buffer'ı temizleyip stream moduna geçersek bu veriler
    // kaybolur, end-marker hiç gelmez ve 60s timeout olur.
    const okIdx = this.silentBuffer.indexOf('OK');
    const leftover = this.silentBuffer.slice(okIdx + 2);
    console.log('[RoboExx] leftover boyutu:', leftover.length, 'içerik:', JSON.stringify(leftover.slice(0, 60)));
    this.silent = false;
    this.silentBuffer = '';

    // Stream modunu kur
    this.streamMode = true;
    this.streamState = 'stdout';
    this.streamStdout = '';
    this.streamStderr = '';

    // Kalan veriyi şimdi stream parser'a yedir — kayıp önlenir
    if (leftover) {
      this._processStream(leftover);
      console.log('[RoboExx] leftover işlendi, streamState:', this.streamState);
    }

    // Stream'in bitmesini bekle (\x04> görene kadar)
    // VEYA dış müdahale ile streamMode kapatılana kadar (interrupt/forceReset)
    const start = Date.now();
    let lastLog = start;
    while (this.streamState !== 'done' && this.streamMode) {
      if (Date.now() - start > 60000) {
        console.error('[RoboExx] 60s TIMEOUT - streamState:', this.streamState, 'streamMode:', this.streamMode);
        this.streamMode = false;
        throw new Error('Çalıştırma zaman aşımı (60s)');
      }
      // Her 2 saniyede bir log
      if (Date.now() - lastLog > 2000) {
        console.log('[RoboExx] stream bekleniyor, state:', this.streamState, 'stdout uzunluğu:', this.streamStdout.length);
        lastLog = Date.now();
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    console.log('[RoboExx] Stream bitti, streamState:', this.streamState, 'streamMode:', this.streamMode);

    const output = this.streamStdout;
    const error = this.streamStderr;
    this.streamMode = false;

    // _exitRaw silent buffer kullanıyor — geri dön
    this.silent = true;
    this.silentBuffer = '';

    return { output, error };
  }
}

export const serialBridge = new SerialBridge();
