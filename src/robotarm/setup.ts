/**
 * ⚙️ KURULUM — hangi kart, hangi pinler?
 *
 * Aynı görev farklı kartlarda farklı bloklarla yazılır:
 *
 *   Arduino / RoboBricks / Raspberry-Waveshare
 *       → normal servo bloğu:  "servo pin D5 açı 120"   (rx_servo_angle)
 *   PicoBricks
 *       → sürücü servo bloğu:  "Sürücü Servo 2 açı 120" (rx_servo_v2)
 *
 * Cevap anahtarları D4-D7 pinli normal servo bloklarıyla yazılmıştır.
 * Öğrenci başka bir kart ya da başka pinler seçtiğinde anahtarı ona göre
 * ÇEVİRİYORUZ — yoksa doğru yazdığı kod "yanlış pin" diye işaretlenirdi.
 */

import type { CalismaAlani, BlokNode } from './vm';

export type KartId = 'arduino' | 'robobricks' | 'waveshare' | 'picobricks';

export interface Kart {
  id: KartId;
  ad: string;
  emoji: string;
  /** Servolar hangi blokla sürülür? */
  servoBlok: 'rx_servo_angle' | 'rx_servo_v2';
  /** Varsayılan eklem pinleri (taban, omuz, dirsek, tutucu). */
  varsayilanPin: [number, number, number, number];
  /** Bu kartta seçilebilecek pinler. */
  pinSecenek: number[];
  /** Çevre birimi pinleri. */
  cevre: { buzzer: number; rgbR: number; rgbG: number; rgbB: number; trig: number; echo: number; ldr: number; ir: number };
  not: string;
}

export const KARTLAR: Kart[] = [
  {
    id: 'arduino', ad: 'Arduino Uno', emoji: '🔵',
    servoBlok: 'rx_servo_angle',
    varsayilanPin: [4, 5, 6, 7],
    pinSecenek: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    cevre: { buzzer: 8, rgbR: 9, rgbG: 10, rgbB: 11, trig: 12, echo: 13, ldr: 27, ir: 2 },
    not: 'Sensor Shield · servolar dijital pinlerde',
  },
  {
    id: 'robobricks', ad: 'RoboBricks', emoji: '🧱',
    servoBlok: 'rx_servo_angle',
    varsayilanPin: [4, 5, 6, 7],
    pinSecenek: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    cevre: { buzzer: 8, rgbR: 9, rgbG: 10, rgbB: 11, trig: 12, echo: 13, ldr: 27, ir: 2 },
    not: 'Normal servo bloğu · pinler serbest',
  },
  {
    id: 'waveshare', ad: 'Raspberry / Waveshare', emoji: '🍓',
    servoBlok: 'rx_servo_angle',
    varsayilanPin: [4, 5, 6, 7],
    pinSecenek: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    cevre: { buzzer: 8, rgbR: 9, rgbG: 10, rgbB: 11, trig: 12, echo: 13, ldr: 27, ir: 2 },
    not: 'GPIO numaraları · normal servo bloğu',
  },
  {
    id: 'picobricks', ad: 'PicoBricks', emoji: '🟩',
    servoBlok: 'rx_servo_v2',
    varsayilanPin: [1, 2, 3, 4],   // sürücü üzerindeki servo kanalları
    pinSecenek: [1, 2, 3, 4],
    cevre: { buzzer: 20, rgbR: 9, rgbG: 10, rgbB: 11, trig: 12, echo: 13, ldr: 27, ir: 2 },
    not: 'Motor sürücü kanalları 1-4 · "Sürücü Servo" bloğu',
  },
];

export interface Kurulum {
  kart: KartId;
  /** Eklem sırası: taban, omuz, dirsek, tutucu. */
  pin: [number, number, number, number];
}

const ANAHTAR = 'roboexx.roboarm.kurulum';

export function kartBul(id: KartId): Kart {
  return KARTLAR.find((k) => k.id === id) ?? KARTLAR[0];
}

export function kurulumOku(): Kurulum {
  try {
    const s = localStorage.getItem(ANAHTAR);
    if (s) {
      const k = JSON.parse(s) as Kurulum;
      if (k && k.kart && Array.isArray(k.pin) && k.pin.length === 4) return k;
    }
  } catch { /* yoksay */ }
  return { kart: 'arduino', pin: [4, 5, 6, 7] };
}

export function kurulumYaz(k: Kurulum): void {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(k)); } catch { /* yoksay */ }
}

/** Servo pini → eklem indeksi (VM'e verilir). */
export function pinEklemHaritasi(k: Kurulum): Record<number, number> {
  const h: Record<number, number> = {};
  k.pin.forEach((p, i) => { h[p] = i; });
  return h;
}

/* ── Cevap anahtarını kurulumla eşleştir ─────────────────────────── */

/** Anahtarların yazıldığı orijinal pinler. */
const KAYNAK_PIN = [4, 5, 6, 7];

function gez(o: unknown, fn: (b: BlokNode) => void): void {
  if (Array.isArray(o)) { o.forEach((x) => gez(x, fn)); return; }
  if (!o || typeof o !== 'object') return;
  const n = o as BlokNode & Record<string, unknown>;
  if (typeof n.type === 'string') fn(n);
  Object.values(o as Record<string, unknown>).forEach((v) => gez(v, fn));
}

/**
 * Cevap anahtarını öğrencinin kartına ve pinlerine çevirir.
 *
 * • Pin değişmişse servo bloklarının PIN alanı güncellenir.
 * • PicoBricks seçilmişse `rx_servo_angle` → `rx_servo_v2` dönüştürülür
 *   (PIN alanı SERVO_NUM olur, kanal numarası yazılır).
 *
 * Böylece öğrenci kendi kartının bloklarıyla doğru yazdığında kontrol
 * "yanlış blok / yanlış pin" demez.
 */
export function anahtariUyarla(anahtar: CalismaAlani, kurulum: Kurulum): CalismaAlani {
  const kart = kartBul(kurulum.kart);
  const ayni =
    kart.servoBlok === 'rx_servo_angle' &&
    kurulum.pin.every((p, i) => p === KAYNAK_PIN[i]);
  if (ayni) return anahtar;

  const kopya = JSON.parse(JSON.stringify(anahtar)) as CalismaAlani;

  gez(kopya.blocks?.blocks ?? [], (b) => {
    if (b.type !== 'rx_servo_angle') return;
    const eskiPin = Number((b.fields as Record<string, unknown>)?.PIN);
    const eklem = KAYNAK_PIN.indexOf(eskiPin);
    if (eklem < 0) return;                       // kol dışı servo — dokunma

    if (kart.servoBlok === 'rx_servo_v2') {
      b.type = 'rx_servo_v2';
      b.fields = { SERVO_NUM: String(kurulum.pin[eklem]) };
    } else {
      b.fields = { ...(b.fields || {}), PIN: kurulum.pin[eklem] };
    }
  });

  return kopya;
}

/** Öğrenciye gösterilecek kısa kurulum özeti. */
export function kurulumOzet(k: Kurulum): string {
  const kart = kartBul(k.kart);
  const ad = ['Taban', 'Omuz', 'Dirsek', 'Tutucu'];
  const on = kart.servoBlok === 'rx_servo_v2' ? 'Servo' : 'D';
  return ad.map((a, i) => `${a} ${on}${k.pin[i]}`).join(' · ');
}
