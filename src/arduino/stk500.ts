/**
 * STK500v1 — Arduino (ATmega328P: Uno / Nano) bootloader'ına WebSerial
 * üzerinden doğrudan flash yazma. Harici npm bağımlılığı yok.
 *
 * avrdude'un "arduino" programmer protokolünün tarayıcı uyarlaması.
 * Akış: auto-reset (DTR/RTS) -> sync -> enter progmode -> sayfa sayfa yaz
 *       -> leave progmode -> reset (program çalışsın).
 */

import type { ArduinoBoard } from './boards';
import { ARDUINO_USB_FILTERS, ARDUINO_USB_VENDOR_IDS } from './boards';
import { parseIntelHex } from './intelhex';

/** Bootloader ile eşitlenemedi — genelde yanlış baud (eski/yeni Nano) demek. */
export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

// STK500 sabitleri
const STK_OK = 0x10;
const STK_INSYNC = 0x14;
const CRC_EOP = 0x20;
const STK_GET_SYNC = 0x30;
const STK_ENTER_PROGMODE = 0x50;
const STK_LEAVE_PROGMODE = 0x51;
const STK_LOAD_ADDRESS = 0x55;
const STK_PROG_PAGE = 0x64;
const STK_READ_SIGN = 0x75;

interface SerialPortLike {
  open(opts: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
}

interface SerialAPI {
  requestPort(opts?: { filters?: Array<{ usbVendorId?: number }> }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FlashProgress {
  phase: 'reset' | 'sync' | 'progmode' | 'writing' | 'done';
  pct: number;
  bytesSent?: number;
  bytesTotal?: number;
}

export class Stk500Flasher {
  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private rxBuffer: number[] = [];
  private readLoop: Promise<void> | null = null;
  private reading = false;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Daha önce izin verilmiş bir Arduino portu varsa (tek tane) onu sessizce
   * yeniden kullanır — öğrenci her seferinde dialog görmez.
   * Bulamazsa null döner; o zaman requestPort() ile dialog açılır.
   */
  async tryReuseKnownPort(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const serial = (navigator as unknown as { serial: SerialAPI }).serial;
      const ports = await serial.getPorts();
      const arduinos = ports.filter((p) => {
        const info = p.getInfo();
        return (
          info.usbVendorId != null &&
          (ARDUINO_USB_VENDOR_IDS as readonly number[]).includes(info.usbVendorId)
        );
      });
      // Tek eşleşme varsa güvenle onu kullan; birden çoksa kullanıcı seçsin.
      if (arduinos.length === 1) {
        this.port = arduinos[0];
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Kullanıcıdan bir seri port seçmesini ister (Arduino auto-reset için DTR gerekir).
   * Dialog yalnız bilinen Arduino USB çiplerini gösterir.
   */
  async requestPort(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Web Serial bu tarayıcıda yok. Chrome veya Edge kullan.');
    }
    const serial = (navigator as unknown as { serial: SerialAPI }).serial;
    try {
      this.port = await serial.requestPort({ filters: ARDUINO_USB_FILTERS });
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name === 'NotFoundError') {
        throw new Error('PORT_NOT_SELECTED');
      }
      throw e;
    }
  }

  /** Seçilen portun USB kimliği (kart tahmini için). */
  getPortInfo(): { usbVendorId?: number; usbProductId?: number } | null {
    try {
      return this.port ? this.port.getInfo() : null;
    } catch {
      return null;
    }
  }

  hasPort(): boolean {
    return this.port !== null;
  }

  /** Portu bırak (yeniden seçim için). */
  forgetPort(): void {
    this.port = null;
  }

  /**
   * HEX'i flash'lar; bootloader eşitlenemezse (SyncError) ATmega328P kartlarda
   * diğer bootloader hızıyla (115200 ↔ 57600) OTOMATİK yeniden dener.
   * Öğrencinin "eski mi yeni mi Nano?" bilmesi gerekmez.
   * Dönen değer: gerçekten kullanılan baud hızı.
   */
  async flashHexAuto(
    hexText: string,
    board: ArduinoBoard,
    onProgress?: (p: FlashProgress) => void,
    onNote?: (msg: string) => void
  ): Promise<number> {
    try {
      await this.flashHex(hexText, board, onProgress);
      return board.baudRate;
    } catch (e) {
      const isSync = e instanceof SyncError;
      const altBaud = board.baudRate === 115200 ? 57600 : 115200;
      if (!isSync || board.chip !== 'ATmega328P') throw e;

      onNote?.(
        `Bootloader ${board.baudRate} baud ile yanıt vermedi, ` +
          `${altBaud} baud ile otomatik yeniden deneniyor…`
      );
      // kartın toparlanması için kısa bekle
      await sleep(600);
      const altBoard: ArduinoBoard = { ...board, baudRate: altBaud };
      await this.flashHex(hexText, altBoard, onProgress);
      return altBaud;
    }
  }

  /** Verilen kart için HEX'i derlenmiş şekilde alır ve flash'lar. */
  async flashHex(
    hexText: string,
    board: ArduinoBoard,
    onProgress?: (p: FlashProgress) => void
  ): Promise<void> {
    if (!this.port) throw new Error('Önce port seç');

    const { data } = parseIntelHex(hexText);

    await this.port.open({ baudRate: board.baudRate, bufferSize: 4096 });
    try {
      this.writer = this.port.writable!.getWriter();
      this.startReadLoop();

      // 1) Auto-reset — DTR/RTS pulse (bootloader'a düş)
      onProgress?.({ phase: 'reset', pct: 2 });
      await this.toggleReset();

      // bootloader açılış banner'ı için kısa bekle, tamponu temizle
      await sleep(400);
      this.rxBuffer = [];

      // 2) Sync
      onProgress?.({ phase: 'sync', pct: 8 });
      await this.getSync();

      // 3) İmza kontrolü (opsiyonel ama faydalı)
      try {
        const sig = await this.readSignature();
        const exp = board.signature;
        if (sig[0] !== exp[0] || sig[1] !== exp[1] || sig[2] !== exp[2]) {
          console.warn(
            `[STK500] İmza uyuşmuyor: gelen ${sig.map(hx).join(' ')}, beklenen ${exp
              .map(hx)
              .join(' ')} — yine de denenecek`
          );
        }
      } catch (e) {
        console.warn('[STK500] İmza okunamadı, devam ediliyor:', e);
      }

      // 4) Enter programming mode
      onProgress?.({ phase: 'progmode', pct: 12 });
      await this.cmd([STK_ENTER_PROGMODE]);

      // 5) Sayfa sayfa yaz
      const pageSize = board.pageSize;
      const total = data.length;
      let written = 0;
      for (let addr = 0; addr < total; addr += pageSize) {
        const page = data.slice(addr, Math.min(addr + pageSize, total));
        // adres WORD cinsinden (byte / 2)
        const wordAddr = addr >> 1;
        await this.loadAddress(wordAddr);
        await this.progPage(page);
        written = addr + page.length;
        const pct = 12 + Math.round((written / total) * 84);
        onProgress?.({ phase: 'writing', pct, bytesSent: written, bytesTotal: total });
      }

      // 6) Leave programming mode
      await this.cmd([STK_LEAVE_PROGMODE]);

      onProgress?.({ phase: 'done', pct: 98 });

      // 7) Reset — yeni program çalışsın
      await this.toggleReset();
      onProgress?.({ phase: 'done', pct: 100, bytesSent: total, bytesTotal: total });
    } finally {
      await this.cleanup();
    }
  }

  // ---- STK500 komutları ----

  private async getSync(): Promise<void> {
    let lastErr: Error | null = null;
    for (let i = 0; i < 8; i++) {
      try {
        // her denemede tamponu temizle
        this.rxBuffer = [];
        await this.write([STK_GET_SYNC, CRC_EOP]);
        await this.expect(STK_INSYNC, 400);
        await this.expect(STK_OK, 400);
        return;
      } catch (e) {
        lastErr = e as Error;
        // 4. denemede bir kez daha resetlemeyi dene — bazı klonlar
        // ilk DTR darbesini kaçırabiliyor.
        if (i === 3) {
          await this.toggleReset();
          await sleep(350);
          this.rxBuffer = [];
        }
        await sleep(80);
      }
    }
    throw new SyncError(
      'Arduino bootloader yanıt vermedi (sync başarısız). ' +
        (lastErr ? `(${lastErr.message})` : '')
    );
  }

  private async readSignature(): Promise<number[]> {
    this.rxBuffer = [];
    await this.write([STK_READ_SIGN, CRC_EOP]);
    await this.expect(STK_INSYNC, 500);
    const b = await this.readBytes(3, 500);
    await this.expect(STK_OK, 500);
    return b;
  }

  private async loadAddress(wordAddr: number): Promise<void> {
    const low = wordAddr & 0xff;
    const high = (wordAddr >> 8) & 0xff;
    await this.cmd([STK_LOAD_ADDRESS, low, high]);
  }

  private async progPage(page: Uint8Array): Promise<void> {
    const size = page.length;
    const header = [STK_PROG_PAGE, (size >> 8) & 0xff, size & 0xff, 0x46 /* 'F' flash */];
    const payload = [...header, ...Array.from(page), CRC_EOP];
    this.rxBuffer = [];
    await this.write(payload);
    await this.expect(STK_INSYNC, 2000);
    await this.expect(STK_OK, 2000);
  }

  /** Basit komut: <bytes> + CRC_EOP gönder, INSYNC+OK bekle. */
  private async cmd(bytes: number[]): Promise<void> {
    this.rxBuffer = [];
    await this.write([...bytes, CRC_EOP]);
    await this.expect(STK_INSYNC, 1000);
    await this.expect(STK_OK, 1000);
  }

  // ---- Düşük seviye I/O ----

  private async write(bytes: number[]): Promise<void> {
    if (!this.writer) throw new Error('Port yazıcısı yok');
    await this.writer.write(new Uint8Array(bytes));
  }

  private startReadLoop(): void {
    if (!this.port?.readable) return;
    this.reading = true;
    this.reader = this.port.readable.getReader();
    this.readLoop = (async () => {
      try {
        while (this.reading) {
          const { value, done } = await this.reader!.read();
          if (done) break;
          if (value) for (const b of value) this.rxBuffer.push(b);
        }
      } catch {
        /* port kapanınca normal */
      }
    })();
  }

  private async readBytes(n: number, timeoutMs: number): Promise<number[]> {
    const start = Date.now();
    while (this.rxBuffer.length < n) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Zaman aşımı: ${n} bayt beklendi, ${this.rxBuffer.length} geldi`);
      }
      await sleep(4);
    }
    return this.rxBuffer.splice(0, n);
  }

  private async expect(byte: number, timeoutMs: number): Promise<void> {
    const [b] = await this.readBytes(1, timeoutMs);
    if (b !== byte) {
      throw new Error(`Beklenen 0x${hx(byte)}, gelen 0x${hx(b)}`);
    }
  }

  /** DTR/RTS toggle ile kartı resetle (auto-reset kondansatörü). */
  private async toggleReset(): Promise<void> {
    if (!this.port) return;
    try {
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await sleep(250);
      await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
      await sleep(50);
    } catch (e) {
      console.warn('[STK500] setSignals desteklenmiyor olabilir:', e);
    }
  }

  private async cleanup(): Promise<void> {
    this.reading = false;
    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.reader = null;
    this.writer = null;
    this.rxBuffer = [];
  }
}

function hx(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase();
}
