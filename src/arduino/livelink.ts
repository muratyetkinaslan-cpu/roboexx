/**
 * Arduino canlı bağlantı — yükleme sonrası klavye/gamepad akışı.
 *
 * Pico'da canlı sürüş, tarayıcının her 50 ms'de "\x06<tuşlar>\n" paketini
 * seri porttan göndermesiyle çalışır. Bu modül aynısını Arduino için yapar:
 * flash bittikten sonra AYNI port 115200 baud ile yeniden açılır ve
 * App.tsx'teki tuş döngüsü sendKeys() ile paketleri buraya da gönderir.
 * Karttaki üretilmiş sketch (__rxPumpKeys) paketleri okur.
 *
 * Tekil (singleton) olarak dışa verilir: hem ArduinoUploader (aç/kapat)
 * hem App (sendKeys) aynı bağlantıyı kullanır.
 */

interface SerialPortLike {
  open(opts: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  setSignals(signals: {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
  }): Promise<void>;
}

const LIVE_BAUD = 115200;

export type LiveLinkState = 'closed' | 'open';

class ArduinoLiveLink {
  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private drainLoop: Promise<void> | null = null;
  private draining = false;
  private lastKeys: string | null = null;
  private listeners = new Set<(s: LiveLinkState) => void>();

  get state(): LiveLinkState {
    return this.writer ? 'open' : 'closed';
  }

  onStateChange(fn: (s: LiveLinkState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch {
        /* yoksay */
      }
    }
  }

  /**
   * Flash sonrası aynı portu canlı moda al.
   * Port açılırken DTR karta reset atar; bootloader ~1 sn sonra sketch'i
   * başlatır — bu normaldir.
   */
  async attach(port: SerialPortLike): Promise<void> {
    await this.close();
    try {
      await port.open({ baudRate: LIVE_BAUD, bufferSize: 4096 });
    } catch (e) {
      // Zaten açık olabilir (nadiren) — yine de yazıcı almayı dene
      if (!(port.writable && !port.writable.locked)) throw e;
    }
    this.port = port;
    this.writer = port.writable!.getWriter();
    this.lastKeys = null;

    // Kartın gönderdiği veriyi (Serial.print vb.) sessizce boşalt —
    // boşaltılmazsa tampon dolup akış tıkanabilir.
    if (port.readable) {
      this.draining = true;
      this.reader = port.readable.getReader();
      this.drainLoop = (async () => {
        try {
          while (this.draining) {
            const { done } = await this.reader!.read();
            if (done) break;
          }
        } catch {
          /* port kapanınca normal */
        }
      })();
    }
    this.emit();
  }

  /**
   * Basılı tuş kümesini gönder. Bağlantı kapalıysa sessizce yok sayar,
   * dolayısıyla App her hedefte güvenle çağırabilir. Her 50 ms'de tam durum
   * gönderilir (Pico ile aynı) — kart resetlense bile durum kendini düzeltir.
   */
  async sendKeys(keys: string): Promise<void> {
    if (!this.writer) return;
    const safe = keys.toLowerCase().slice(0, 16);
    try {
      const data = new TextEncoder().encode('\x06' + safe + '\n');
      await this.writer.write(data);
    } catch {
      // Yazma hatası = kablo çekildi vb. — bağlantıyı kapat
      await this.close().catch(() => {});
    }
  }

  /** Bağlantıyı kapat (yeni flash öncesi zorunlu — port tek sahipli). */
  async close(): Promise<void> {
    this.draining = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* yoksay */
    }
    try {
      this.reader?.releaseLock();
    } catch {
      /* yoksay */
    }
    try {
      this.writer?.releaseLock();
    } catch {
      /* yoksay */
    }
    try {
      await this.port?.close();
    } catch {
      /* yoksay */
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.lastKeys = null;
    this.emit();
  }
}

/** Uygulama genelinde tek canlı bağlantı. */
export const arduinoLiveLink = new ArduinoLiveLink();
