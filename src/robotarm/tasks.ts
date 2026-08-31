/**
 * 📚 GÖREV KÜTÜPHANESİ — 71 RoboArm görevi + cevap anahtarları.
 *
 * Veri `public/cevap_anahtari/roboarm-gorevler.json` dosyasındadır
 * (BerryBot LMS'teki müfredat v3 ve 71 cevap anahtarından üretilmiştir).
 * Tek dosya olarak bir kez indirilir, sonra bellekte tutulur —
 * uygulamanın JS paketini büyütmez.
 */

import type { CalismaAlani } from './vm';

export interface Gorev {
  id: number;
  baslik: string;
  bolum: string;
  emoji: string;
  zorluk: number;
  sure: number;
  xp: number;
  /** Öğrencinin okuyacağı görev metni. */
  aciklama: string;
  /** Öğretmen için örnek çözüm özeti. */
  ornekCozum: string;
  kazanimlar: string[];
  /** Cevap anahtarı — kontrol bununla karşılaştırır. */
  anahtar: CalismaAlani;
}

export interface GorevPaketi {
  surum: string;
  donanim: {
    kart?: string;
    pinler?: Record<string, string>;
    guvenli_aci?: Record<string, string>;
  };
  gorevler: Gorev[];
}

const URL = '/cevap_anahtari/roboarm-gorevler.json';

let paket: GorevPaketi | null = null;
let istek: Promise<GorevPaketi> | null = null;

export async function gorevleriYukle(): Promise<GorevPaketi> {
  if (paket) return paket;
  if (istek) return istek;
  istek = (async () => {
    const r = await fetch(URL);
    if (!r.ok) throw new Error(`Görev dosyası okunamadı (${r.status}). public/cevap_anahtari/roboarm-gorevler.json yerinde mi?`);
    const p = (await r.json()) as GorevPaketi;
    p.gorevler.sort((a, b) => a.id - b.id);
    paket = p;
    return p;
  })();
  return istek;
}

export function gorevBul(id: number): Gorev | null {
  return paket?.gorevler.find((g) => g.id === id) ?? null;
}

/** Öğrencinin en son seçtiği görev — tarayıcıda saklanır. */
const SON_KEY = 'roboexx.roboarm.sonGorev';
export function sonGorevOku(): number {
  const v = Number(localStorage.getItem(SON_KEY));
  return Number.isFinite(v) && v > 0 ? v : 1;
}
export function sonGorevYaz(id: number): void {
  try { localStorage.setItem(SON_KEY, String(id)); } catch { /* yoksay */ }
}

/** Görevleri bölüme göre grupla (seçici için). */
export function bolumlereAyir(gorevler: Gorev[]): Array<{ bolum: string; liste: Gorev[] }> {
  const sira: string[] = [];
  const harita = new Map<string, Gorev[]>();
  for (const g of gorevler) {
    if (!harita.has(g.bolum)) { harita.set(g.bolum, []); sira.push(g.bolum); }
    harita.get(g.bolum)!.push(g);
  }
  return sira.map((b) => ({ bolum: b, liste: harita.get(b)! }));
}
