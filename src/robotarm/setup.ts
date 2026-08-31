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
  /** Bu kartın çevre birimi varsayılanları. */
  cevre: CevrePin;
  /** Analog girişler için seçilebilecek pinler. */
  analogSecenek: number[];
  not: string;
}

/** Çevre birimlerinin pinleri — öğrenci hepsini değiştirebilir. */
export interface CevrePin {
  buzzer: number;
  rgbR: number; rgbG: number; rgbB: number;
  role: number;
  trig: number; echo: number;
  pot: number; ldr: number; sicaklik: number;
  ir: number; buton: number;
}

/** Cevap anahtarlarının yazıldığı orijinal çevre pinleri. */
export const KAYNAK_CEVRE: CevrePin = {
  buzzer: 8, rgbR: 9, rgbG: 10, rgbB: 11, role: 3,
  trig: 12, echo: 13, pot: 26, ldr: 27, sicaklik: 28,
  ir: 2, buton: 2,
};

/** Kurulum ekranında gösterilecek çevre birimleri. */
export const CEVRE_ALANLAR: Array<{
  anahtar: keyof CevrePin; ad: string; emoji: string; tur: 'dijital' | 'analog';
}> = [
  { anahtar: 'trig', ad: 'Mesafe · trig', emoji: '📏', tur: 'dijital' },
  { anahtar: 'echo', ad: 'Mesafe · echo', emoji: '📏', tur: 'dijital' },
  { anahtar: 'ldr', ad: 'Işık (LDR)', emoji: '🌗', tur: 'analog' },
  { anahtar: 'pot', ad: 'Potansiyometre', emoji: '🎚', tur: 'analog' },
  { anahtar: 'sicaklik', ad: 'Sıcaklık', emoji: '🌡', tur: 'analog' },
  { anahtar: 'ir', ad: 'IR kumanda', emoji: '🔦', tur: 'dijital' },
  { anahtar: 'buton', ad: 'Buton', emoji: '🔘', tur: 'dijital' },
  { anahtar: 'buzzer', ad: 'Buzzer', emoji: '🔔', tur: 'dijital' },
  { anahtar: 'rgbR', ad: 'RGB kırmızı', emoji: '🔴', tur: 'dijital' },
  { anahtar: 'rgbG', ad: 'RGB yeşil', emoji: '🟢', tur: 'dijital' },
  { anahtar: 'rgbB', ad: 'RGB mavi', emoji: '🔵', tur: 'dijital' },
  { anahtar: 'role', ad: 'Röle', emoji: '⚡', tur: 'dijital' },
];

export const KARTLAR: Kart[] = [
  {
    id: 'arduino', ad: 'Arduino Uno', emoji: '🔵',
    servoBlok: 'rx_servo_angle',
    varsayilanPin: [4, 5, 6, 7],
    pinSecenek: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    cevre: { ...KAYNAK_CEVRE },
    analogSecenek: [26, 27, 28],
    not: 'Sensor Shield · A0=26 A1=27 A2=28',
  },
  {
    id: 'robobricks', ad: 'RoboBricks', emoji: '🧱',
    servoBlok: 'rx_servo_angle',
    varsayilanPin: [4, 5, 6, 7],
    pinSecenek: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    cevre: { ...KAYNAK_CEVRE },
    analogSecenek: [26, 27, 28],
    not: 'Normal servo bloğu · pinler serbest',
  },
  {
    id: 'waveshare', ad: 'Raspberry / Waveshare', emoji: '🍓',
    servoBlok: 'rx_servo_angle',
    varsayilanPin: [4, 5, 6, 7],
    pinSecenek: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    cevre: { ...KAYNAK_CEVRE },
    analogSecenek: [26, 27, 28],
    not: 'GPIO numaraları · normal servo bloğu',
  },
  {
    id: 'picobricks', ad: 'PicoBricks', emoji: '🟩',
    servoBlok: 'rx_servo_v2',
    varsayilanPin: [1, 2, 3, 4],   // sürücü üzerindeki servo kanalları
    pinSecenek: [1, 2, 3, 4],
    cevre: { ...KAYNAK_CEVRE, buzzer: 20 },
    analogSecenek: [26, 27, 28],
    not: 'Motor sürücü kanalları 1-4 · "Sürücü Servo" bloğu',
  },
];

export interface Kurulum {
  kart: KartId;
  /** Eklem sırası: taban, omuz, dirsek, tutucu. */
  pin: [number, number, number, number];
  /** Çevre birimi pinleri — öğrenci kendi devresine göre değiştirir. */
  cevre: CevrePin;
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
      if (k && k.kart && Array.isArray(k.pin) && k.pin.length === 4) {
        // Eski kayıtlarda çevre pinleri yoktu — karttan tamamla.
        return { ...k, cevre: { ...kartBul(k.kart).cevre, ...(k.cevre || {}) } };
      }
    }
  } catch { /* yoksay */ }
  return { kart: 'arduino', pin: [4, 5, 6, 7], cevre: { ...KAYNAK_CEVRE } };
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
  const c = { ...KAYNAK_CEVRE, ...(kurulum.cevre || {}) };
  const servoAyni =
    kart.servoBlok === 'rx_servo_angle' &&
    kurulum.pin.every((p, i) => p === KAYNAK_PIN[i]);
  const cevreAyni = (Object.keys(KAYNAK_CEVRE) as Array<keyof CevrePin>)
    .every((k) => c[k] === KAYNAK_CEVRE[k]);
  if (servoAyni && cevreAyni) return anahtar;

  const kopya = JSON.parse(JSON.stringify(anahtar)) as CalismaAlani;

  /** Kaynak pin → öğrencinin pini. */
  const map: Record<number, number> = {};
  const ekle = (kaynak: number, hedef: number) => { if (kaynak !== hedef) map[kaynak] = hedef; };
  ekle(KAYNAK_CEVRE.buzzer, c.buzzer);
  ekle(KAYNAK_CEVRE.rgbR, c.rgbR);
  ekle(KAYNAK_CEVRE.rgbG, c.rgbG);
  ekle(KAYNAK_CEVRE.rgbB, c.rgbB);
  ekle(KAYNAK_CEVRE.role, c.role);
  ekle(KAYNAK_CEVRE.pot, c.pot);
  ekle(KAYNAK_CEVRE.ldr, c.ldr);
  ekle(KAYNAK_CEVRE.sicaklik, c.sicaklik);

  const yeniPin = (eski: unknown): number | undefined => {
    const p = Number(eski);
    return map[p];
  };
  const alanYaz = (b: BlokNode, alan: string, deger: number) => {
    b.fields = { ...(b.fields || {}), [alan]: deger };
  };

  gez(kopya.blocks?.blocks ?? [], (b) => {
    const f = (b.fields || {}) as Record<string, unknown>;

    // ── Servolar ──
    if (b.type === 'rx_servo_angle') {
      const eklem = KAYNAK_PIN.indexOf(Number(f.PIN));
      if (eklem < 0) return;                     // kol dışı servo — dokunma
      if (kart.servoBlok === 'rx_servo_v2') {
        b.type = 'rx_servo_v2';
        b.fields = { SERVO_NUM: String(kurulum.pin[eklem]) };
      } else {
        alanYaz(b, 'PIN', kurulum.pin[eklem]);
      }
      return;
    }

    // ── Mesafe sensörü: iki ayrı alan ──
    if (b.type === 'rx_ultrasonic_distance') {
      if (Number(f.TRIG) === KAYNAK_CEVRE.trig) alanYaz(b, 'TRIG', c.trig);
      if (Number(f.ECHO) === KAYNAK_CEVRE.echo) alanYaz(b, 'ECHO', c.echo);
      return;
    }

    // ── Buton / IR: ikisi de D2 varsayılanında, blok tipine göre ayrılır ──
    if (b.type === 'rx_button_pressed') {
      if (Number(f.PIN) === KAYNAK_CEVRE.buton) alanYaz(b, 'PIN', c.buton);
      return;
    }
    if (b.type === 'rx_ir_init' || b.type === 'rx_ir_read_code') {
      if (Number(f.PIN) === KAYNAK_CEVRE.ir) alanYaz(b, 'PIN', c.ir);
      return;
    }

    // ── Tek PIN alanlı diğer bloklar ──
    if ('PIN' in f) {
      const y = yeniPin(f.PIN);
      if (y !== undefined) alanYaz(b, 'PIN', y);
    }
  });

  return kopya;
}

/** VM'e verilecek çevre pin haritası. */
export function cevreHaritasi(k: Kurulum): CevrePin {
  return { ...KAYNAK_CEVRE, ...(k.cevre || {}) };
}

/** Öğrenciye gösterilecek kısa kurulum özeti. */
export function kurulumOzet(k: Kurulum): string {
  const kart = kartBul(k.kart);
  const ad = ['Taban', 'Omuz', 'Dirsek', 'Tutucu'];
  const on = kart.servoBlok === 'rx_servo_v2' ? 'Servo' : 'D';
  return ad.map((a, i) => `${a} ${on}${k.pin[i]}`).join(' · ');
}
