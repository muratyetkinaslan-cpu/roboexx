/**
 * RoboBOT simülasyon yapılandırması.
 * Öğrenci sensör pinlerini ve motor numaralarını seçer; bu ayar hem simülasyona
 * (postMessage rx:setConfig) gönderilir hem de localStorage'da saklanır.
 *
 * Pinler, gerçek RoboBOT bloklarıyla aynı mantıkta:
 *  - DC Motor blok: MOTOR_NUM '1' | '2'
 *  - Ultrasonik blok: trig + echo pin
 *  - Çizgi sensörü: digital_read / analog_read pin (TCRT5000)
 */

export interface UsPins { trig: number; echo: number; }

export interface RoboBotConfig {
  /** Sol tekerleği süren DC motor no */
  leftMotor: '1' | '2';
  /** Sağ tekerleği süren DC motor no */
  rightMotor: '1' | '2';
  /** 3 ultrasonik sensör (sol / ön / sağ) trig-echo pinleri */
  us: { front: UsPins; left: UsPins; right: UsPins };
  /** 2 çizgi sensörü pini (sol / sağ) */
  line: { left: number; right: number };
  /** Potansiyometre simülasyon değeri (0-100) */
  potValue: number;
}

export const DEFAULT_CONFIG: RoboBotConfig = {
  leftMotor: '1',
  rightMotor: '2',
  us: {
    front: { trig: 3, echo: 2 },   // bloktaki varsayılan
    left:  { trig: 7, echo: 6 },
    right: { trig: 9, echo: 8 },
  },
  line: { left: 26, right: 27 },   // GP26/GP27 = ADC0/ADC1
  potValue: 50,
};

const KEY = 'roboexx.robobot.config.v1';

export function loadRoboBotConfig(): RoboBotConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const p = JSON.parse(raw);
    // eksik alanları varsayılanla doldur (ileri uyumluluk)
    return {
      ...DEFAULT_CONFIG,
      ...p,
      us: { ...DEFAULT_CONFIG.us, ...(p.us || {}) },
      line: { ...DEFAULT_CONFIG.line, ...(p.line || {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveRoboBotConfig(cfg: RoboBotConfig): void {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* yoksay */ }
}

/** Simülasyona gönderilecek sade config nesnesi (rx:setConfig payload'ı). */
export function configPayload(cfg: RoboBotConfig) {
  return {
    leftMotor: cfg.leftMotor,
    rightMotor: cfg.rightMotor,
    us: cfg.us,
    line: cfg.line,
    potValue: cfg.potValue,
  };
}
