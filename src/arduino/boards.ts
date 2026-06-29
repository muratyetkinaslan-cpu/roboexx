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
