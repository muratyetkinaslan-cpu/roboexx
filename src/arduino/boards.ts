/**
 * Desteklenen Arduino kartları (STK500v1 / WebSerial ile flash).
 *
 * Sınıfta en çok kullanılan kartlar: Uno R3 ve Nano (ATmega328P).
 * arduino-cli FQBN'leri compile sunucusuna gönderilir.
 */

export interface ArduinoBoard {
  id: string;
  name: string;
  shortName: string;
  /** arduino-cli Fully Qualified Board Name */
  fqbn: string;
  chip: string;
  /** Bootloader haberleşme hızı */
  baudRate: number;
  /** Flash sayfa boyutu (bayt) — ATmega328P = 128 */
  pageSize: number;
  /** Beklenen imza (signature) bytes */
  signature: [number, number, number];
  description: string;
}

export const ARDUINO_BOARDS: ArduinoBoard[] = [
  {
    id: 'uno',
    name: 'Arduino Uno',
    shortName: 'Uno',
    fqbn: 'arduino:avr:uno',
    chip: 'ATmega328P',
    baudRate: 115200,
    pageSize: 128,
    signature: [0x1e, 0x95, 0x0f],
    description: 'En yaygın kart. Optiboot bootloader, 115200 baud.',
  },
  {
    id: 'nano',
    name: 'Arduino Nano (yeni bootloader)',
    shortName: 'Nano',
    fqbn: 'arduino:avr:nano:cpu=atmega328',
    chip: 'ATmega328P',
    baudRate: 115200,
    pageSize: 128,
    signature: [0x1e, 0x95, 0x0f],
    description: 'Yeni bootloader. 115200 baud. Çoğu yeni Nano klonu.',
  },
  {
    id: 'nano-old',
    name: 'Arduino Nano (eski bootloader)',
    shortName: 'Nano (eski)',
    fqbn: 'arduino:avr:nano:cpu=atmega328old',
    chip: 'ATmega328P',
    baudRate: 57600,
    pageSize: 128,
    signature: [0x1e, 0x95, 0x0f],
    description: 'Eski bootloader. 57600 baud. Eski/ucuz Nano klonları için.',
  },
];

export function getBoard(id: string): ArduinoBoard | undefined {
  return ARDUINO_BOARDS.find((b) => b.id === id);
}

/**
 * Arduino kartlarında yaygın USB seri çip üreticileri.
 * Port seçim dialogunu bunlarla filtreleyerek öğrencinin yanlış
 * (Bluetooth, dahili modem vb.) port seçmesini engelleriz.
 */
export const ARDUINO_USB_VENDOR_IDS = [
  0x2341, // Arduino SA (orijinal Uno/Nano/Mega)
  0x2a03, // Arduino.org
  0x1a86, // WCH CH340/CH341 (klon kartların çoğu)
  0x0403, // FTDI FT232 (eski orijinal Nano)
  0x10c4, // Silicon Labs CP210x
  0x067b, // Prolific PL2303
] as const;

export const ARDUINO_USB_FILTERS = ARDUINO_USB_VENDOR_IDS.map((usbVendorId) => ({
  usbVendorId,
}));

export interface BoardGuess {
  /** Önerilen kart id'si (ARDUINO_BOARDS içinden) */
  boardId: string;
  /** Kullanıcıya gösterilecek açıklama, ör. "CH340 çipi algılandı" */
  reason: string;
  /** Ne kadar eminiz (yalnız UI ipucu için) */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * USB VID/PID'den kart tahmini.
 * Kesin karar değil, ön seçim — kullanıcı isterse değiştirir;
 * bootloader hızı zaten flash sırasında otomatik denenir.
 */
export function guessBoardFromUsb(info: {
  usbVendorId?: number;
  usbProductId?: number;
}): BoardGuess | null {
  const vid = info.usbVendorId;
  if (vid == null) return null;

  switch (vid) {
    case 0x2341:
    case 0x2a03:
      return {
        boardId: 'uno',
        reason: 'Orijinal Arduino USB çipi algılandı',
        confidence: 'high',
      };
    case 0x1a86:
      return {
        boardId: 'nano',
        reason: 'CH340 çipi algılandı (klon Uno/Nano)',
        confidence: 'medium',
      };
    case 0x0403:
      return {
        boardId: 'nano-old',
        reason: 'FTDI çipi algılandı (genelde eski Nano)',
        confidence: 'medium',
      };
    case 0x10c4:
    case 0x067b:
      return {
        boardId: 'nano',
        reason: 'USB-seri dönüştürücü algılandı',
        confidence: 'low',
      };
    default:
      return null;
  }
}
