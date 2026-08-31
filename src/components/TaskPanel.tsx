import { useEffect, useMemo, useState } from 'react';
import {
  gorevleriYukle, bolumlereAyir, sonGorevOku, sonGorevYaz,
  type Gorev, type GorevPaketi,
} from '../robotarm/tasks';
import { kararMetni, type KontrolSonucu } from '../robotarm/checker';

/**
 * 🎓 GÖREV PANELİ — kodlu simülasyonun sol üst köşesi.
 *
 * Öğrenci kaçıncı görevi yaptığını buradan seçer; görev metni altında
 * çıkar. ▶ Çalıştır'a basınca hem simülasyon oynar hem de program cevap
 * anahtarıyla karşılaştırılır; hatalar burada yazıyla, bloklarda ise
 * uyarı balonuyla gösterilir.
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

export function TaskPanel({
  seciliId, onGorevSec, calisiyor, onCalistir, onDurdur,
  sonuc, kontrolEdiliyor, onBlogaGit, hazirMi,
}: Props) {
  const [paket, setPaket] = useState<GorevPaketi | null>(null);
  const [yukHata, setYukHata] = useState<string | null>(null);
  const [metinAcik, setMetinAcik] = useState(true);

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
    // yalnızca ilk açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gorev = useMemo(
    () => paket?.gorevler.find((g) => g.id === seciliId) ?? null,
    [paket, seciliId],
  );
  const bolumler = useMemo(() => (paket ? bolumlereAyir(paket.gorevler) : []), [paket]);

  const sec = (id: number) => {
    const g = paket?.gorevler.find((x) => x.id === id);
    if (!g) return;
    sonGorevYaz(id);
    onGorevSec(g);
  };

  if (yukHata) {
    return (
      <div className="tp tp-hata">
        <b>Görev listesi yüklenemedi</b>
        <span>{yukHata}</span>
      </div>
    );
  }

  return (
    <div className="tp">
      <div className="tp-bar">
        <select
          className="tp-sel"
          value={seciliId || ''}
          onChange={(e) => sec(Number(e.target.value))}
          disabled={!paket}
          title="Hangi görevi yapıyorsun?"
        >
          {!paket && <option>Görevler yükleniyor…</option>}
          {bolumler.map((b) => (
            <optgroup key={b.bolum} label={b.bolum}>
              {b.liste.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} Görev {g.id} — {g.baslik}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {calisiyor ? (
          <button className="btn btn-danger tp-run" onClick={onDurdur}>■ Durdur</button>
        ) : (
          <button className="btn btn-primary tp-run" onClick={onCalistir} disabled={!hazirMi}>
            ▶ Çalıştır ve kontrol et
          </button>
        )}
      </div>

      {gorev && (
        <div className="tp-gorev">
          <button
            className="tp-gorev-hd"
            onClick={() => setMetinAcik((a) => !a)}
            title={metinAcik ? 'Görev metnini gizle' : 'Görev metnini göster'}
          >
            <span className="tp-gorev-t">{gorev.emoji} {gorev.baslik}</span>
            <span className="tp-rozet">{'★'.repeat(gorev.zorluk)}</span>
            <span className="tp-rozet">{gorev.sure} dk</span>
            <span className="tp-chev">{metinAcik ? '▾' : '▸'}</span>
          </button>
          {metinAcik && (
            <>
              <p className="tp-metin">{gorev.aciklama}</p>
              {gorev.kazanimlar.length > 0 && (
                <div className="tp-kaz">
                  {gorev.kazanimlar.map((k) => <span key={k}>{k}</span>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {kontrolEdiliyor && <div className="tp-kontrol">Program kontrol ediliyor…</div>}

      {sonuc && !kontrolEdiliyor && <SonucKarti sonuc={sonuc} onBlogaGit={onBlogaGit} />}
    </div>
  );
}

/* ── Kontrol sonucu ─────────────────────────────────────────────── */

function SonucKarti({ sonuc, onBlogaGit }: { sonuc: KontrolSonucu; onBlogaGit: (b: string) => void }) {
  const [detay, setDetay] = useState(false);
  const renk = sonuc.puan >= 90 ? 'ok' : sonuc.puan >= 70 ? 'orta' : 'kotu';
  const hataSay = sonuc.bulgular.filter((b) => b.onem === 'hata').length;
  const uyariSay = sonuc.bulgular.filter((b) => b.onem === 'uyari').length;

  return (
    <div className={`tp-sonuc tp-${renk}`}>
      <div className="tp-sonuc-hd">
        <span className="tp-puan">{sonuc.puan}</span>
        <span className="tp-sonuc-t">
          <b>{kararMetni(sonuc.karar)}</b>
          <span>
            {hataSay > 0 && `${hataSay} hata`}
            {hataSay > 0 && uyariSay > 0 && ' · '}
            {uyariSay > 0 && `${uyariSay} uyarı`}
            {hataSay === 0 && uyariSay === 0 && 'Cevap anahtarıyla örtüşüyor'}
          </span>
        </span>
      </div>

      <div className="tp-bulgular">
        {sonuc.bulgular.map((b, i) => (
          <div key={i} className={`tp-b tp-b-${b.onem}`}>
            <div className="tp-b-hd">
              <span className={`tp-onem tp-onem-${b.onem}`}>
                {{ hata: 'HATA', uyari: 'UYARI', ipucu: 'İPUCU', iyi: 'TAMAM' }[b.onem]}
              </span>
              <span className="tp-b-t">{b.baslik}</span>
              {b.bid && (
                <button className="tp-git" onClick={() => onBlogaGit(b.bid!)} title="Hatalı bloğa git">
                  bloğu göster
                </button>
              )}
            </div>
            <p className="tp-b-a">{b.aciklama}</p>
            {b.cozum && <div className="tp-cozum"><b>Ne yapmalısın:</b> {b.cozum}</div>}
          </div>
        ))}
      </div>

      {sonuc.davranis && (
        <button className="tp-detay-btn" onClick={() => setDetay((d) => !d)}>
          {detay ? '▾' : '▸'} Adım adım karşılaştırma
          <span> · {sonuc.davranis.eslesen}/{sonuc.davranis.beklenen} adım doğru</span>
        </button>
      )}

      {detay && (
        <div className="tp-diff">
          <div className="tp-diff-hd"><span /><span>Olması gereken</span><span>Senin programın</span></div>
          {sonuc.adimlar.map((a, i) => (
            <div key={i} className={`tp-diff-r tp-${a.op}`}>
              <span>{{ eq: '✓', near: '≈', eksik: '✕', fazla: '+' }[a.op as 'eq']}</span>
              <span>{a.anahtar ?? '—'}</span>
              <span>{a.ogrenci ?? '—'}</span>
            </div>
          ))}
          {sonuc.senaryolar.length > 1 && (
            <div className="tp-senaryo">
              {sonuc.senaryolar.map((s) => (
                <span key={s.ad}>{s.ad}: %{s.puan}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
