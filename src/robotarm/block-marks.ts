/**
 * 🎯 BLOK İŞARETLEME — hatayı doğrudan bloğun üstünde göster.
 *
 * Kontrol motorunun ürettiği her bulgu, mümkünse onu üreten bloğun
 * id'sini taşır. Bu dosya o blokları bulup:
 *   • üstüne Blockly'nin uyarı balonunu koyar (tıklayınca açıklama çıkar)
 *   • bloğun etrafına renkli çerçeve çizer (hata kırmızı, uyarı sarı)
 *   • ilk hatalı bloğa kaydırır
 *
 * Böylece öğrenci "nerede hata yaptım" diye aramaz — blok kendini gösterir.
 */

import * as Blockly from 'blockly';
import type { Bulgu } from './checker';

const HATA_SINIF = 'rx-blok-hata';
const UYARI_SINIF = 'rx-blok-uyari';

/** Önceki çalıştırmadan kalan bütün işaretleri temizler. */
export function isaretleriTemizle(ws: Blockly.Workspace | null): void {
  if (!ws) return;
  for (const b of ws.getAllBlocks(false)) {
    try {
      b.setWarningText(null);
      const svg = (b as Blockly.BlockSvg).getSvgRoot?.();
      svg?.classList.remove(HATA_SINIF, UYARI_SINIF);
    } catch { /* blok silinmiş olabilir */ }
  }
}

/**
 * Bulguları bloklara işler.
 * @returns işaretlenebilen bulgu sayısı
 */
export function bulgulariIsaretle(
  ws: Blockly.Workspace | null,
  bulgular: Bulgu[],
): number {
  if (!ws) return 0;
  isaretleriTemizle(ws);

  // Aynı bloğa birden çok bulgu düşebilir — metinleri birleştir.
  const harita = new Map<string, { onem: 'hata' | 'uyari'; satirlar: string[] }>();
  for (const b of bulgular) {
    if (!b.bid || b.onem === 'iyi' || b.onem === 'ipucu') continue;
    const onem = b.onem === 'hata' ? 'hata' : 'uyari';
    const kayit = harita.get(b.bid) ?? { onem, satirlar: [] };
    if (onem === 'hata') kayit.onem = 'hata';
    kayit.satirlar.push(`${b.baslik}\n${b.aciklama}${b.cozum ? '\n\n→ ' + b.cozum : ''}`);
    harita.set(b.bid, kayit);
  }

  let ilk: Blockly.BlockSvg | null = null;
  let sayac = 0;

  for (const [bid, kayit] of harita) {
    const blok = ws.getBlockById(bid) as Blockly.BlockSvg | null;
    if (!blok) continue;
    try {
      blok.setWarningText(kayit.satirlar.join('\n\n────────\n\n'));
      blok.getSvgRoot()?.classList.add(kayit.onem === 'hata' ? HATA_SINIF : UYARI_SINIF);
      sayac++;
      if (!ilk && kayit.onem === 'hata') ilk = blok;
      else if (!ilk) ilk = blok;
    } catch { /* yoksay */ }
  }

  // İlk hatalı bloğu görünür yap
  if (ilk && (ws as Blockly.WorkspaceSvg).centerOnBlock) {
    try { (ws as Blockly.WorkspaceSvg).centerOnBlock(ilk.id); } catch { /* yoksay */ }
  }
  return sayac;
}

/** Belirli bir bloğu vurgula ve ekrana getir (bulgu listesinden tıklayınca). */
export function blogaGit(ws: Blockly.Workspace | null, bid: string): void {
  if (!ws) return;
  const blok = ws.getBlockById(bid) as Blockly.BlockSvg | null;
  if (!blok) return;
  try {
    (ws as Blockly.WorkspaceSvg).centerOnBlock?.(blok.id);
    blok.select();
  } catch { /* yoksay */ }
}

/** Programı çalıştırırken o an işlenen bloğu yanıp sönen çerçeveyle göster. */
export function calisanBlok(ws: Blockly.Workspace | null, bid: string | undefined): void {
  if (!ws) return;
  const w = ws as Blockly.WorkspaceSvg;
  try {
    w.highlightBlock?.(bid ?? null);
  } catch { /* yoksay */ }
}
