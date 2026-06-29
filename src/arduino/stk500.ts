/**
 * STK500v1 — Arduino (ATmega328P: Uno / Nano) bootloader'ına WebSerial
 * üzerinden doğrudan flash yazma. Harici npm bağımlılığı yok.
 *
 * avrdude'un "arduino" programmer protokolünün tarayıcı uyarlaması.
 * Akış: auto-reset (DTR/RTS) -> sync -> enter progmode -> sayfa sayfa yaz
 *       -> leave progmode -> reset (program çalışsın).
 */

import type { ArduinoBoard } from './boards';
import { parseIntelHex } from './intelhex';

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

  /** Kullanıcıdan bir seri port seçmesini ister (Arduino auto-reset için DTR gerekir). */
  async requestPort(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Web Serial bu tarayıcıda yok. Chrome veya Edge kullan.');
    }
    const serial = (navigator as unknown as { serial: SerialAPI }).serial;
    this.port = await serial.requestPort();
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
    for (let i = 0; i < 5; i++) {
      try {
        // ilk denemelerde tamponu temizle
        this.rxBuffer = [];
        await this.write([STK_GET_SYNC, CRC_EOP]);
        await this.expect(STK_INSYNC, 500);
        await this.expect(STK_OK, 500);
        return;
      } catch (e) {
        lastErr = e as Error;
        await sleep(100);
      }
    }
    throw new Error(
      'Arduino bootloader yanıt vermedi (sync başarısız). ' +
        'Kartın doğru porta takılı olduğundan ve doğru kart tipini seçtiğinden emin ol. ' +
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
