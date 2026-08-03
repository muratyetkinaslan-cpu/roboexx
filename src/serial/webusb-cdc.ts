/**
 * WebUSB CDC-ACM köprüsü — TABLET DESTEĞİ
 * ---------------------------------------------------------------
 * Android'de Chrome, Web Serial API'yi DESTEKLEMEZ (yalnız masaüstü).
 * Ama WebUSB'yi destekler ve Raspberry Pi Pico (BerryBot) standart bir
 * USB CDC-ACM cihazıdır → sürücüsüz, ekstra donanımsız (yalnız OTG
 * kablosu) aynı raw-REPL yüklemesi WebUSB üzerinden yapılabilir.
 *
 * Bu dosya, SerialBridge'in kullandığı SerialPort yüzeyini (open/close/
 * readable/writable/getInfo/setSignals/addEventListener) bir USBDevice
 * üzerinde taklit eder. SerialBridge'de TEK satır değişir: navigator.serial
 * yoksa bu şim kullanılır.
 *
 * Notlar:
 *  - Android: hiçbir sürücü cihazı sahiplenmediği için claimInterface
 *    sorunsuz çalışır. (Masaüstünde navigator.serial zaten var; bu yol
 *    oraya hiç girmez — Windows'un usbser çakışması konu dışı.)
 *  - MicroPython, DTR set edilmeden çıktı basmaz → open() içinde
 *    SET_CONTROL_LINE_STATE ile DTR+RTS kaldırılır.
 *  - Pico native USB olduğu için baudRate kozmetiktir; yine de
 *    SET_LINE_CODING ile gönderilir (CDC uyumu).
 */

// ---- USB / CDC sabitleri ----
const CDC_COMM_CLASS = 0x02;   // control (comm) arayüz sınıfı
const CDC_DATA_CLASS = 0x0a;   // data arayüz sınıfı
const REQ_SET_LINE_CODING = 0x20;
const REQ_SET_CONTROL_LINE_STATE = 0x22;
const REQ_SEND_BREAK = 0x23;

interface SerialPortLike {
  open(opts: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  addEventListener(event: 'disconnect', cb: () => void): void;
}

export function isWebUSBSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).usb
    && typeof (navigator as any).usb.requestDevice === 'function';
}

export class WebUSBSerialPort implements SerialPortLike {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;

  private device: any;               // USBDevice
  private ctrlIface = -1;
  private dataIface = -1;
  private epIn = -1;
  private epOut = -1;
  private closed = false;
  private disconnectCbs: Array<() => void> = [];

  constructor(device: any) {
    this.device = device;
    const usb: any = (navigator as any).usb;
    usb.addEventListener('disconnect', (e: any) => {
      if (e.device === this.device) {
        this.closed = true;
        for (const cb of this.disconnectCbs) {
          try { cb(); } catch { /* yut */ }
        }
      }
    });
  }

  getInfo(): { usbVendorId?: number; usbProductId?: number } {
    return { usbVendorId: this.device.vendorId, usbProductId: this.device.productId };
  }

  addEventListener(event: 'disconnect', cb: () => void): void {
    if (event === 'disconnect') this.disconnectCbs.push(cb);
  }

  async open(opts: { baudRate: number }): Promise<void> {
    const d = this.device;
    this.closed = false;
    await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);

    // CDC control + data arayüzlerini ve data uç noktalarını bul
    this.ctrlIface = -1;
    this.dataIface = -1;
    this.epIn = -1;
    this.epOut = -1;
    for (const iface of d.configuration.interfaces) {
      const alt = iface.alternates[0];
      if (alt.interfaceClass === CDC_COMM_CLASS && this.ctrlIface < 0) {
        this.ctrlIface = iface.interfaceNumber;
      } else if (alt.interfaceClass === CDC_DATA_CLASS && this.dataIface < 0) {
        this.dataIface = iface.interfaceNumber;
        for (const ep of alt.endpoints) {
          if (ep.type === 'bulk' && ep.direction === 'in') this.epIn = ep.endpointNumber;
          if (ep.type === 'bulk' && ep.direction === 'out') this.epOut = ep.endpointNumber;
        }
      }
    }
    if (this.dataIface < 0 || this.epIn < 0 || this.epOut < 0) {
      throw new Error('USB cihazında CDC seri arayüzü bulunamadı — bu bir MicroPython kartı mı?');
    }

    try { if (this.ctrlIface >= 0) await d.claimInterface(this.ctrlIface); } catch { /* bazı OS'lerde gereksiz */ }
    await d.claimInterface(this.dataIface);

    // SET_LINE_CODING: baud(4, LE) + stop(1)=0 + parity(1)=0 + data(1)=8
    const coding = new Uint8Array(7);
    new DataView(coding.buffer).setUint32(0, opts.baudRate >>> 0, true);
    coding[4] = 0; coding[5] = 0; coding[6] = 8;
    const ctrlIdx = this.ctrlIface >= 0 ? this.ctrlIface : this.dataIface;
    try {
      await d.controlTransferOut(
        { requestType: 'class', recipient: 'interface', request: REQ_SET_LINE_CODING, value: 0, index: ctrlIdx },
        coding
      );
    } catch { /* Pico native USB — kozmetik */ }

    // DTR+RTS: MicroPython DTR olmadan çıktı basmaz
    await this._lineState(true, true);

    const self = this;
    this.readable = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (self.closed) { controller.close(); return; }
        try {
          const res = await self.device.transferIn(self.epIn, 512);
          if (res.status === 'stall') {
            await self.device.clearHalt('in', self.epIn);
            return;
          }
          if (res.data && res.data.byteLength > 0) {
            controller.enqueue(new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength));
          }
        } catch (e) {
          if (self.closed) { try { controller.close(); } catch { /* zaten kapalı */ } }
          else controller.error(e);
        }
      },
      cancel() {
        self.closed = true;
      },
    });

    this.writable = new WritableStream<Uint8Array>({
      async write(chunk) {
        if (self.closed) throw new Error('Port kapalı');
        await self.device.transferOut(self.epOut, chunk);
      },
      close() { /* device close ayrı yönetilir */ },
      abort() { /* yut */ },
    });
  }

  async setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void> {
    if (signals.break !== undefined) {
      const ctrlIdx = this.ctrlIface >= 0 ? this.ctrlIface : this.dataIface;
      try {
        await this.device.controlTransferOut({
          requestType: 'class', recipient: 'interface', request: REQ_SEND_BREAK,
          value: signals.break ? 0xffff : 0, index: ctrlIdx,
        });
      } catch { /* opsiyonel */ }
    }
    if (signals.dataTerminalReady !== undefined || signals.requestToSend !== undefined) {
      await this._lineState(signals.dataTerminalReady ?? true, signals.requestToSend ?? true);
    }
  }

  private async _lineState(dtr: boolean, rts: boolean): Promise<void> {
    const ctrlIdx = this.ctrlIface >= 0 ? this.ctrlIface : this.dataIface;
    try {
      await this.device.controlTransferOut({
        requestType: 'class', recipient: 'interface', request: REQ_SET_CONTROL_LINE_STATE,
        value: (dtr ? 1 : 0) | (rts ? 2 : 0), index: ctrlIdx,
      });
    } catch { /* bazı yığınlarda gereksiz */ }
  }

  async close(): Promise<void> {
    this.closed = true;
    try { await this._lineState(false, false); } catch { /* yut */ }
    try { if (this.dataIface >= 0) await this.device.releaseInterface(this.dataIface); } catch { /* yut */ }
    try { if (this.ctrlIface >= 0) await this.device.releaseInterface(this.ctrlIface); } catch { /* yut */ }
    try { await this.device.close(); } catch { /* yut */ }
    this.readable = null;
    this.writable = null;
  }
}

/**
 * navigator.serial ile aynı yüzey: requestPort / getPorts / addEventListener.
 * SerialBridge, masaüstünde gerçek Web Serial'ı, tablette bunu kullanır.
 */
export const webusbSerialShim = {
  async requestPort(opts?: { filters?: Array<{ usbVendorId?: number }> }): Promise<WebUSBSerialPort> {
    const usb: any = (navigator as any).usb;
    const filters = (opts?.filters ?? [])
      .filter((f) => f.usbVendorId !== undefined)
      .map((f) => ({ vendorId: f.usbVendorId! }));
    const device = await usb.requestDevice({ filters: filters.length ? filters : undefined });
    return new WebUSBSerialPort(device);
  },

  async getPorts(): Promise<WebUSBSerialPort[]> {
    const usb: any = (navigator as any).usb;
    const devices: any[] = await usb.getDevices();
    return devices.map((d) => new WebUSBSerialPort(d));
  },

  addEventListener(event: 'connect' | 'disconnect', cb: (e: { target: WebUSBSerialPort }) => void): void {
    const usb: any = (navigator as any).usb;
    usb.addEventListener(event, (e: any) => {
      try { cb({ target: new WebUSBSerialPort(e.device) }); } catch { /* yut */ }
    });
  },
};
