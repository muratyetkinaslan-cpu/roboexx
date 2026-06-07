/**
 * RoboExx Sensör Dashboard tip tanımları
 * Pin yapılandırması ve sensör değerleri için.
 *
 * Protokol (Pico tarafı ile uyumlu, roboexx_main.py):
 *   MSG_SENSOR_REQ = 0x07
 *   MSG_SENSOR_REPLY = 0x14
 *
 *   Talep formatı: [0x07] + her sensör için 3 byte: [type, pin1, pin2]
 *   Cevap formatı: [0x14] + her sensör için 2 byte: uint16 LE değer
 */

export const SENSOR_TYPE = {
  DIGITAL: 0x01,
  ANALOG: 0x02,
  ULTRASONIC: 0x03,
  TEMP_INTERNAL: 0x04,
} as const;

export type SensorTypeValue = typeof SENSOR_TYPE[keyof typeof SENSOR_TYPE];

/** Bir sensörün yapılandırması (Ayarlar popup'ında düzenlenir) */
export interface SensorConfig {
  id: string;            // benzersiz (örn "ldr-left", "ultra-front")
  name: string;          // gösterilecek isim ("Sol LDR", "Ön Mesafe")
  type: SensorTypeValue;
  pin1: number;          // ana pin (digital pin no, ADC pin no, trig pin)
  pin2: number;          // ek pin (ultrasonic için echo). Diğerleri için 0.
  // Görsel yerleşim — robot resmi üzerinde yüzde (0-100) koordinat
  x: number;             // resimde sol-sağ % (0 = sol)
  y: number;             // resimde üst-alt % (0 = üst)
  // Balon nereden çıksın (ipucu yönü)
  anchor: 'top' | 'bottom' | 'left' | 'right';
  // Değer için birim ve formatlama
  unit?: string;         // örn "mm", "lx", "°C"
  minRaw?: number;       // ham değerin minimumu (örn ADC 0)
  maxRaw?: number;       // ham değerin maksimumu (örn ADC 65535)
}

/** Sensörden gelen son değer */
export interface SensorReading {
  raw: number;           // ham değer (uint16)
  ok: boolean;           // okuma başarılı mı (0xFFFx hata değil mi)
  ts: number;            // unix ms
}

/** Hata kodları (Pico tarafı set ediyor) */
export const SENSOR_ERROR = {
  TIMEOUT: 0xFFFF,
  INVALID_PIN: 0xFFFE,
  UNKNOWN_TYPE: 0xFFFD,
  READ_EXCEPTION: 0xFFFC,
  HARDWARE_ERROR: 0xFFFB,
} as const;

/** Default sensör seti — RoboTurtle araç için */
export const DEFAULT_SENSORS: SensorConfig[] = [
  // Önde 3 ultrasonik (sol, orta, sağ)
  {
    id: 'ultra-left', name: 'Sol Mesafe', type: SENSOR_TYPE.ULTRASONIC,
    pin1: 8, pin2: 9, x: 78, y: 50, anchor: 'right', unit: 'mm',
  },
  {
    id: 'ultra-front', name: 'Ön Mesafe', type: SENSOR_TYPE.ULTRASONIC,
    pin1: 10, pin2: 11, x: 72, y: 60, anchor: 'right', unit: 'mm',
  },
  {
    id: 'ultra-right', name: 'Sağ Mesafe', type: SENSOR_TYPE.ULTRASONIC,
    pin1: 12, pin2: 13, x: 65, y: 70, anchor: 'right', unit: 'mm',
  },
  // Üst kat LDR'ler
  {
    id: 'ldr-left', name: 'Sol LDR', type: SENSOR_TYPE.ANALOG,
    pin1: 26, pin2: 0, x: 30, y: 22, anchor: 'top', unit: '',
    minRaw: 0, maxRaw: 65535,
  },
  {
    id: 'ldr-right', name: 'Sağ LDR', type: SENSOR_TYPE.ANALOG,
    pin1: 27, pin2: 0, x: 55, y: 22, anchor: 'top', unit: '',
    minRaw: 0, maxRaw: 65535,
  },
  // Alt çizgi sensörü
  {
    id: 'line', name: 'Çizgi Sensörü', type: SENSOR_TYPE.DIGITAL,
    pin1: 14, pin2: 0, x: 15, y: 80, anchor: 'left', unit: '',
  },
];

/** Sensör tipini Türkçe etiket olarak göster */
export const SENSOR_TYPE_LABEL: Record<SensorTypeValue, string> = {
  [SENSOR_TYPE.DIGITAL]: 'Dijital (0/1)',
  [SENSOR_TYPE.ANALOG]: 'Analog (ADC)',
  [SENSOR_TYPE.ULTRASONIC]: 'Ultrasonik (Mesafe)',
  [SENSOR_TYPE.TEMP_INTERNAL]: 'Dahili Sıcaklık',
};

/** Pico Pin sınırları — sensör tipine göre */
export const PIN_LIMITS: Record<SensorTypeValue, { pin1: [number, number]; pin2?: [number, number] }> = {
  [SENSOR_TYPE.DIGITAL]: { pin1: [0, 28] },
  [SENSOR_TYPE.ANALOG]: { pin1: [26, 29] },           // ADC sadece 26-29
  [SENSOR_TYPE.ULTRASONIC]: { pin1: [0, 28], pin2: [0, 28] },
  [SENSOR_TYPE.TEMP_INTERNAL]: { pin1: [0, 0] },      // pin yok
};

/** Ham değeri kullanıcı dostu metin'e çevir */
export function formatValue(cfg: SensorConfig, r: SensorReading): string {
  if (!r.ok) return '—';
  switch (cfg.type) {
    case SENSOR_TYPE.DIGITAL:
      return r.raw ? '1' : '0';
    case SENSOR_TYPE.ULTRASONIC:
      if (r.raw === 0xFFFF) return '∞';
      return (r.raw / 10).toFixed(1) + ' cm';
    case SENSOR_TYPE.ANALOG: {
      const pct = Math.round((r.raw / 65535) * 100);
      return pct + '%';
    }
    case SENSOR_TYPE.TEMP_INTERNAL:
      return (r.raw / 100).toFixed(1) + '°C';
    default:
      return String(r.raw);
  }
}

/** Cevap byte'larından değer parse et */
export function isErrorValue(raw: number): boolean {
  return raw >= 0xFFFB && raw <= 0xFFFF;
}
