/**
 * Serial bağlantı tipleri ve port → kullanıcı dostu isim eşlemesi.
 *
 * Raspberry Pi USB Vendor ID = 0x2E8A
 * Bilinen Product ID'ler:
 *   0x0003 → RP2040 BOOTROM (boot mode, kullanıcı görmemeli)
 *   0x0005 → Pico CDC (varsayılan MicroPython)
 *   0x0009 → Pico SDK CDC
 *   0x000A → Pico W
 *   0x000B → Pico (alternative)
 *   0x000C → Pico 2
 *   0x000F → Pico 2 W
 */

export const RPI_VID = 0x2E8A;

export interface PortInfo {
  vendorId?: number;
  productId?: number;
  friendlyName: string;
}

export type BridgeState = 'disconnected' | 'connecting' | 'connected' | 'busy';

export interface UploadProgress {
  phase: 'uploading' | 'success' | 'error';
  pct: number;            // 0-100
  bytesSent: number;
  bytesTotal: number;
  speedKBs: number;       // KB/s
  message?: string;
  error?: string;
}

/**
 * Kullanıcı dostu cihaz adı.
 * "COM3" veya "/dev/cu.usbmodemXXX" yerine "Raspberry Pi Pico W" gösteriyoruz.
 */
export function friendlyNameFor(info: { usbVendorId?: number; usbProductId?: number }): string {
  const { usbVendorId, usbProductId } = info;

  if (usbVendorId === RPI_VID) {
    switch (usbProductId) {
      case 0x000A: return 'Raspberry Pi Pico W';
      case 0x000F: return 'Raspberry Pi Pico 2 W';
      case 0x000C: return 'Raspberry Pi Pico 2';
      case 0x0005:
      case 0x000B:
      case 0x0009:
        return 'Raspberry Pi Pico';
      case 0x0003:
        return 'Pico (BOOT modu)';
      default:
        return 'Raspberry Pi Pico';
    }
  }

  if (usbVendorId !== undefined && usbProductId !== undefined) {
    return `USB Cihazı (${usbVendorId.toString(16).padStart(4, '0')}:${usbProductId.toString(16).padStart(4, '0')})`;
  }

  return 'Bilinmeyen cihaz';
}

/**
 * Verilen text'i güvenli Python bytes literal formatına dönüştürür.
 * Örn: 'hello\n' → "b'hello\\n'"
 *
 * Tüm non-ASCII baytları \xHH formatında escape eder.
 * Backslash, tek tırnak ve kontrol karakterleri özel olarak handle edilir.
 */
export function pythonBytesLiteral(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return pythonBytesLiteralFromBytes(bytes);
}

/**
 * Doğrudan Uint8Array'den Python bytes literal — TextDecoder round-trip yapmaz.
 * Binary dosyalar veya chunk'lı dosya yüklemesi için.
 */
export function pythonBytesLiteralFromBytes(bytes: Uint8Array): string {
  let out = "b'";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x5C) out += '\\\\';
    else if (b === 0x27) out += "\\'";
    else if (b === 0x0A) out += '\\n';
    else if (b === 0x0D) out += '\\r';
    else if (b === 0x09) out += '\\t';
    else if (b >= 0x20 && b < 0x7F) out += String.fromCharCode(b);
    else out += '\\x' + b.toString(16).padStart(2, '0');
  }
  return out + "'";
}
