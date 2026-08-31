import { useEffect, useMemo, useState } from 'react';
import {
  gorevleriYukle, bolumlereAyir, sonGorevOku, sonGorevYaz,
  type Gorev, type GorevPaketi,
} from '../robotarm/tasks';
import type { Bulgu, KontrolSonucu } from '../robotarm/checker';

/**
 * 🎓 GÖREV VE HATA PANELİ — blokların hemen altında durur.
 *
 * Hata raporu bilerek simülasyonun yanında DEĞİL, blok tarafında:
 * çocuk hatayı okurken gözünü bloklardan ayırmasın, "şu bloğu düzelt"
 * denince bloğa uzanabilsin.
 *
 * Bir seferde TEK sorun gösterilir — en önemlisi. Diğerleri katlanmış
 * durur. Yardım üç kademeli, çocuk istedikçe açılır:
 *
 *   1. İpucu   → düşündüren soru, cevabı vermez
 *   2. Ne yapmalıyım → somut adım
 *   3. Cevabı göster → hangi blok, hangi sayı
 *
 * Böylece takılan çocuk yardım alır, bilen çocuk kendi bulur.
 */

interface Props {
  seciliId: number;
  onGorevSec: (g: Gorev) => void;
  calisiyor: boolean;
  onCalistir: () => void;
  onDurdur: () => void;
  sonuc: KontrolSonucu | null;
  kontrolEdiliyor: boolean;
  onBlogaGit: (bid: string) => void;
  hazirMi: boolean;
}

export function ArmTaskBar({
  seciliId, onGorevSec, calisiyor, onCalistir, onDurdur,
  sonuc, kontrolEdiliyor, onBlogaGit, hazirMi,
}: Props) {
  const [paket, setPaket] = useState<GorevPaketi | null>(null);
  const [yukHata, setYukHata] = useState<string | null>(null);
  const [gorevAcik, setGorevAcik] = useState(true);

  useEffect(() => {
    let iptal = false;
    gorevleriYukle()
      .then((p) => {
        if (iptal) return;
        setPaket(p);
        const g = p.gorevler.find((x) => x.id === sonGorevOku()) ?? p.gorevler[0];
        if (g) onGorevSec(g);
      })
      .catch((e: Error) => { if (!iptal) setYukHata(e.message); });
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gorev = useMemo(() => paket?.gorevler.find((g) => g.id === seciliId) ?? null, [paket, seciliId]);
  const bolumler = useMemo(() => (paket ? bolumlereAyir(paket.gorevler) : []), [paket]);

  if (yukHata) return <div className="atb atb-hata">Görev listesi yüklenemedi: {yukHata}</div>;

  return (
    <div className="atb">
      <div className="atb-ust">
        <select
          className="atb-sel"
          value={seciliId || ''}
          onChange={(e) => {
            const g = paket?.gorevler.find((x) => x.id === Number(e.target.value));
            if (g) { sonGorevYaz(g.id); onGorevSec(g); }
          }}
          disabled={!paket}
        >
          {!paket && <option>Görevler yükleniyor…</option>}
          {bolumler.map((b) => (
            <optgroup key={b.bolum} label={b.bolum}>
              {b.liste.map((g) => (
                <option key={g.id} value={g.id}>{g.emoji} {g.id}. {g.baslik}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {calisiyor ? (
          <button className="btn btn-danger atb-run" onClick={onDurdur}>■ Durdur</button>
        ) : (
          <button className="btn btn-primary atb-run" onClick={onCalistir} disabled={!hazirMi}>
            ▶ Çalıştır
          </button>
        )}
      </div>

      {gorev && (
        <div className="atb-gorev">
          <button className="atb-gorev-hd" onClick={() => setGorevAcik((a) => !a)}>
            <span>{gorevAcik ? '▾' : '▸'} Ne yapmam gerekiyor?</span>
          </button>
          {gorevAcik && <p className="atb-metin">{gorev.aciklama}</p>}
        </div>
      )}

      {kontrolEdiliyor && <div className="atb-bekle">Programın kontrol ediliyor…</div>}

      {sonuc && !kontrolEdiliyor && <Rapor sonuc={sonuc} onBlogaGit={onBlogaGit} />}
    </div>
  );
}

/* ── Sonuç ────────────────────────────────────────────────────────── */

const BASLIK: Record<KontrolSonucu['karar'], { emoji: string; metin: string; sinif: string }> = {
  tam: { emoji: '🎉', metin: 'Görevi tamamladın!', sinif: 'ok' },
  kucuk_hata: { emoji: '🙂', metin: 'Neredeyse oldu — ufak bir şey kaldı', sinif: 'orta' },
  eksik: { emoji: '🔧', metin: 'Birkaç şeyi düzeltmen gerekiyor', sinif: 'kotu' },
  yanlis: { emoji: '🌱', metin: 'Baştan bir bakalım', sinif: 'kotu' },
  bos: { emoji: '🌱', metin: 'Hadi başlayalım', sinif: 'kotu' },
};

function Rapor({ sonuc, onBlogaGit }: { sonuc: KontrolSonucu; onBlogaGit: (b: string) => void }) {
  const b = BASLIK[sonuc.karar];

  // SIRALI DÜZELTME: bir seferde tek sorun gösterilir. Çocuk onu düzeltip
  // tekrar çalıştırınca sıradaki ortaya çıkar. Hepsini birden görmek
  // (özellikle 4-5 madde) çocuğu bunaltıyor ve hiçbirine başlamıyor.
  const sorunlar = sonuc.bulgular.filter((f) => f.onem !== 'iyi');
  const gosterilen = sorunlar.slice(0, 1);
  const kalan = sorunlar.length - 1;

  return (
    <div className={`atb-sonuc atb-${b.sinif}`}>
      <div className="atb-sonuc-hd">
        <span className="atb-emoji">{b.emoji}</span>
        <span className="atb-sonuc-t">
          <b>{b.metin}</b>
          {sorunlar.length > 0 && (
            <span>Şimdi şuna bakalım</span>
          )}
        </span>
      </div>

      {sorunlar.length === 0 && (
        <p className="atb-tebrik">
          Kolun tam görevdeki gibi hareket etti. Artık gerçek kola yükleyebilirsin.
        </p>
      )}

      {gosterilen.map((f, i) => (
        <SorunKarti key={f.kod + i} bulgu={f} onBlogaGit={onBlogaGit} ilk={i === 0} />
      ))}

      {kalan > 0 && (
        <p className="atb-sira">
          Önce bunu düzelt, sonra tekrar <b>▶ Çalıştır</b>'a bas.
          {kalan === 1 ? ' Sonra bir şeye daha bakacağız.' : ` Sonra ${kalan} şeye daha bakacağız.`}
        </p>
      )}
    </div>
  );
}

function SorunKarti({ bulgu, onBlogaGit, ilk }: { bulgu: Bulgu; onBlogaGit: (b: string) => void; ilk: boolean }) {
  /** 0 = kapalı · 1 = ipucu · 2 = ne yapmalıyım · 3 = cevap */
  const [kademe, setKademe] = useState(0);

  const ipucuVar = !!bulgu.ipucu;
  const cevapVar = !!bulgu.cevap;
  const sonKademe = cevapVar ? 3 : 2;

  const dugmeMetni = kademe === 0 && ipucuVar ? '💡 İpucu ver'
    : kademe < 2 ? '🔎 Ne yapmalıyım?'
    : '✅ Cevabı göster';

  return (
    <div className={`atb-sorun atb-s-${bulgu.onem} ${ilk ? 'is-ilk' : ''}`}>
      <h5>
        {bulgu.baslik}
        {bulgu.bid && (
          <button className="atb-git" onClick={() => onBlogaGit(bulgu.bid!)}>
            bloğu göster
          </button>
        )}
      </h5>
      <p>{bulgu.aciklama}</p>

      {kademe >= 1 && ipucuVar && (
        <div className="atb-yardim atb-y1"><b>💡 İpucu</b><span>{bulgu.ipucu}</span></div>
      )}
      {kademe >= 2 && bulgu.cozum && (
        <div className="atb-yardim atb-y2"><b>🔎 Ne yapmalısın</b><span>{bulgu.cozum}</span></div>
      )}
      {kademe >= 3 && cevapVar && (
        <div className="atb-yardim atb-y3"><b>✅ Cevap</b><span>{bulgu.cevap}</span></div>
      )}

      {kademe < sonKademe && (
        <button
          className="atb-yardim-btn"
          onClick={() => setKademe((k) => (k === 0 && !ipucuVar ? 2 : k + 1))}
        >
          {dugmeMetni}
        </button>
      )}
    </div>
  );
}
