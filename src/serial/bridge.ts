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

  // Public callbacks
  onStateChange: (state: BridgeState) => void = () => {};
  onConnect: (info: PortInfo) => void = () => {};
  onDisconnect: () => void = () => {};
  onText: (text: string) => void = () => {};
  onLog: (kind: 'system' | 'info' | 'error', message: string) => void = () => {};

  // ====== Public API ======

  isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
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
      return {
        ok: false,
        message:
          'Bu tarayıcıda Web Serial yok. Chrome veya Edge kullanın (Firefox ve Safari desteklemiyor).',
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
      const serial = (navigator as unknown as { serial: SerialAPI }).serial;
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
      throw new Error('Web Serial bu tarayıcıda desteklenmiyor. Chrome veya Edge kullan.');
    }
    const serial = (navigator as unknown as { serial: SerialAPI }).serial;
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

      // 1) Dosyayı aç
      await this._execRaw(`f=open('main.py','wb')\nprint('__OPEN__')\n`);

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
        `f.close()\nimport os\nprint('__OK__',os.stat('main.py')[6])\n`
      );

      if (error && error.trim()) {
        throw new Error(error.trim());
      }
      if (!output.includes('__OK__')) {
        throw new Error('Yazma doğrulaması başarısız');
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
      await port.open({ baudRate: 115200, bufferSize: 8192 });
    } catch (e: unknown) {
      // "already in progress" hatası StrictMode'da olur — sessizce yut
      const err = e as { name?: string; message?: string };
      if (err?.name === 'InvalidStateError' || (err?.message ?? '').includes('already')) {
        this._setState('disconnected');
        throw new Error('Port zaten açılıyor — tekrar dene');
      }
      this._setState('disconnected');
      throw e;
    }
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
      this.onLog('system', 'USB bağlantısı kesildi');
      this.disconnect();
    });

    if (port.writable) {
      this.writer = port.writable.getWriter();
    }

    this.readLoopPromise = this._startReadLoop();

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

  private async _startReadLoop(): Promise<void> {
    while (this.port?.readable) {
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
    await this.writer.write(bytes);
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

  private async _enterRaw(): Promise<void> {
    this.silent = true;
    this.silentBuffer = '';

    // STRATEJİ 1: Friendly REPL'de varsayalım — Ctrl-C ile kes + Ctrl-A ile raw'a gir
    await this._write('\r\x03\x03');
    await new Promise((r) => setTimeout(r, 200));
    this.silentBuffer = '';
    await this._write('\r\x01');
    try {
      await this._waitForBuffer('raw REPL', 1500);
      await new Promise((r) => setTimeout(r, 50));
      this.silentBuffer = '';
      return;
    } catch {
      // strateji 1 başarısız — devam
    }

    // STRATEJİ 2: Soft reset (Ctrl-D) — main.py yeniden başlar, USB aktivite
    // tespiti devreye girer (yeni bootloader). Sonra raw REPL'e gir.
    this.silentBuffer = '';
    await this._write('\r\x04');
    await new Promise((r) => setTimeout(r, 400));
    await this._write('\x03\x03\x03');
    await new Promise((r) => setTimeout(r, 2500));
    this.silentBuffer = '';
    await this._write('\r\x01');
    try {
      await this._waitForBuffer('raw REPL', 3000);
      await new Promise((r) => setTimeout(r, 50));
      this.silentBuffer = '';
      return;
    } catch {
      // strateji 2 başarısız — devam
    }

    // STRATEJİ 3: Pico sıkışmış (eski main.py, core1 thread, BLE meşgul).
    // Yeni bootloader USB byte gelince reset yapar — Ctrl-C'leri art arda
    // gönder ve uzun bekle, Pico kendini resetlesin. Sonra tekrar dene.
    for (let attempt = 0; attempt < 3; attempt++) {
      this.silentBuffer = '';
      // ESP32 ise: DTR/RTS ile donanımsal reset dene (Pico'da no-op)
      if (this.esp32) {
        await this._hardResetEsp32();
        this.silentBuffer = '';
      }
      // Yoğun byte trafiği → yeni bootloader bunu yakalayıp reset eder
      await this._write('\x03\x03\x03\x03\x03');
      await new Promise((r) => setTimeout(r, 1500));
      this.silentBuffer = '';
      await this._write('\r\x03\x01');
      try {
        await this._waitForBuffer('raw REPL', 2500);
        await new Promise((r) => setTimeout(r, 50));
        this.silentBuffer = '';
        return;
      } catch {
        // sonraki deneme
      }
    }

    // Hiçbir strateji çalışmadı → kullanıcıya net mesaj ver
    throw new Error(
      (this.esp32 ? 'ESP32' : 'Pico') + ' REPL\'e dönmüyor. Lütfen karttaki fiziksel ' +
      (this.esp32 ? 'EN/RST' : 'RESET') + ' tuşuna bas (veya gücü çek-tak), sonra tekrar dene. ' +
      (this.esp32
        ? '(ESP32\'de MicroPython yüklü olduğundan emin ol — micropython.org/download/esp32)'
        : '(Yeni bootloader yüklendikten sonra bu sorun olmayacak.)')
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
