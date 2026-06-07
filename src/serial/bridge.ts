import {
  type PortInfo,
  type BridgeState,
  friendlyNameFor,
  pythonBytesLiteral,
  pythonBytesLiteralFromBytes,
  RPI_VID,
} from './types';

// Web Serial type stubs (Chrome only API, not in standard lib.dom)
interface SerialPortLike {
  open(opts: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
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
 * SerialBridge — Web Serial üzerinden Pico W ile haberleşme katmanı.
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
  private streamState: 'stdout' | 'stderr' | 'end' | 'done' = 'stdout';
  private streamStdout = '';
  private streamStderr = '';

  state: BridgeState = 'disconnected';
  portInfo: PortInfo | null = null;

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
      const picoPort = ports.find((p) => {
        const info = p.getInfo();
        return info.usbVendorId === RPI_VID;
      });
      if (!picoPort) return null;
      return await this._connect(picoPort);
    } catch (e) {
      console.warn('Auto-connect failed:', e);
      return null;
    }
  }

  /**
   * Picker dialogunu açar (Raspberry Pi cihazlarına filtreli) ve bağlanır.
   */
  async requestAndConnect(): Promise<PortInfo> {
    if (!this.isWebSerialSupported()) {
      throw new Error('Web Serial bu tarayıcıda desteklenmiyor. Chrome veya Edge kullan.');
    }
    const serial = (navigator as unknown as { serial: SerialAPI }).serial;
    let port: SerialPortLike;
    try {
      port = await serial.requestPort({ filters: [{ usbVendorId: RPI_VID }] });
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
    try { await this.reader?.cancel(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.portInfo = null;
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
   * Çalışan programı durdur (Ctrl-C iki kere).
   */
  async interrupt(): Promise<void> {
    if (!this.writer) return;
    await this._write('\r\x03\x03');
    // Eğer busy state'de takılı kalmışsak zorla resetle
    this._forceIdle();
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
  /**
   * Klavye basılı tuşlarını USB seri ile Pico'ya bildir.
   * Protokol: \x06 + ASCII tuşlar + \n
   * Pico tarafında roboexx.py'nin background stdin reader'ı bu mesajı yakalar.
   *
   * NOT: streamMode (kullanıcı kodu çalışırken) sırasında da göndeririz!
   * stdin (frontend→Pico) ve stdout (Pico→frontend) ayrı yönlerde olduğu için
   * raw REPL stream parser'ını bozmaz. Sadece silent mode (upload/protokol komutları)
   * sırasında bloke ederiz.
   */
  async sendKeys(keys: string): Promise<void> {
    if (this.state !== 'connected' && this.state !== 'busy') return;
    if (this.silent) return; // upload protocol komutlarıyla karışmasın
    if (!this.writer) return;
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
      'Pico REPL\'e geçilemiyor. Bunun en olası sebebi Pico\'da eski bir bootloader veya BLE servisinin meşgul olması. ' +
      'ÇÖZÜM: Toolbar\'daki ⚡ Firmware Yükle butonu ile Pico\'ya MicroPython\'ı BOOTSEL modunda yeniden yükle. ' +
      'Bu Pico\'nun belleğini sıfırlar ve temiz başlangıç sağlar. Sonra tekrar "Modülleri Yükle" yapabilirsin.'
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
    // Büyük yüklemelerde (lib, resim) Pico'nun yetişmesi için daha küçük chunk
    // ve aralarda daha uzun pause. 512 bayt + 8ms emniyetli.
    const chunkSize = 512;

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = codeBytes.slice(i, Math.min(i + chunkSize, total));
      await this._write(chunk);
      const sent = Math.min(i + chunkSize, total);
      onChunkSent?.(sent, total);
      if (i + chunkSize < total) {
        await new Promise((r) => setTimeout(r, 8));
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
