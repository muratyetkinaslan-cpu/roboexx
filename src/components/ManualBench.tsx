import { useEffect, useState } from 'react';
import { bench, rgbRengi, rgbAcikMi, type BenchState } from '../robotarm/hw-bench';

/**
 * 🕹 KODSUZ SİMÜLASYON — kod yazmadan donanımı tanı.
 *
 * Sadece robot kol ve üstündeki parçalar var: dört eklem, RGB LED,
 * buzzer, röle. Kalibrasyon, pin eşlemesi, nokta tekrarı gibi ayarlar
 * burada YOK — çocuk parçaları eliyle oynatarak tanısın diye.
 *
 * Her kaydırıcının yanında hangi pine bağlı olduğu yazar; öğrenci kodlu
 * moda geçtiğinde "servo pin D5" bloğunun neyi oynattığını zaten bilir.
 */

interface Props {
  aciler: number[];
  onEklem: (eklem: number, aci: number) => void;
  onHome: () => void;
  /** Kart bağlı mı — canlı sürüş ancak bağlıyken çalışır. */
  kartBagli: boolean;
  /** Kaydırıcı hareketleri gerçek kola da gitsin mi? */
  canli: boolean;
  onCanliChange: (v: boolean) => void;
}

const EKLEMLER = [
  { ad: 'Taban', pin: 4, renk: '#F97316', ipucu: 'Kolu sağa-sola döndürür' },
  { ad: 'Omuz', pin: 5, renk: '#38BDF8', ipucu: 'Kolu yukarı-aşağı kaldırır' },
  { ad: 'Dirsek', pin: 6, renk: '#A855F7', ipucu: 'Ön kolu büker' },
  { ad: 'Tutucu', pin: 7, renk: '#22C55E', ipucu: 'Pençeyi açar-kapatır' },
];

const GUVENLI: Array<[number, number]> = [[30, 150], [30, 150], [30, 150], [40, 140]];

const RENKLER = [
  { ad: 'Kırmızı', hex: '#ff0000', pins: [1, 0, 0] },
  { ad: 'Yeşil', hex: '#00ff00', pins: [0, 1, 0] },
  { ad: 'Mavi', hex: '#0000ff', pins: [0, 0, 1] },
  { ad: 'Sarı', hex: '#ffff00', pins: [1, 1, 0] },
  { ad: 'Mor', hex: '#ff00ff', pins: [1, 0, 1] },
  { ad: 'Beyaz', hex: '#ffffff', pins: [1, 1, 1] },
];

const NOTALAR = [
  { ad: 'Do', hz: 262 }, { ad: 'Re', hz: 294 }, { ad: 'Mi', hz: 330 },
  { ad: 'Fa', hz: 349 }, { ad: 'Sol', hz: 392 }, { ad: 'La', hz: 440 }, { ad: 'Si', hz: 494 },
];

export function ManualBench({ aciler, onEklem, onHome, kartBagli, canli, onCanliChange }: Props) {
  const [s, setS] = useState<BenchState>(() => bench.durum());
  useEffect(() => bench.abone(setS), []);

  const renk = rgbRengi(s);
  const yanik = rgbAcikMi(s);

  const rgbYak = (pins: number[]) => {
    bench.dijitalYaz(9, pins[0]);
    bench.dijitalYaz(10, pins[1]);
    bench.dijitalYaz(11, pins[2]);
  };
  const rgbSondur = () => rgbYak([0, 0, 0]);

  const cal = (hz: number) => {
    bench.ot(hz);
    window.setTimeout(() => bench.sustur(), 400);
  };

  return (
    <div className="mb">
      {/* ── Gerçek kolla birlikte oynatma ── */}
      <section className="mb-grup">
        <button
          className={`mb-canli ${canli && kartBagli ? 'on' : ''} ${!kartBagli ? 'yok' : ''}`}
          onClick={() => kartBagli && onCanliChange(!canli)}
          disabled={!kartBagli}
          title={kartBagli
            ? 'Kaydırıcıyı oynattığında gerçek kol da aynı anda hareket eder'
            : 'Önce kartı bağla (üstteki USB/BLE)'}
        >
          <span className={`mb-nokta2 ${canli && kartBagli ? 'on' : ''}`} />
          {kartBagli
            ? (canli ? '🔗 Gerçek kol BİRLİKTE oynuyor' : '⛓️‍💥 Sadece simülasyon')
            : '⛓️‍💥 Kart bağlı değil — sadece simülasyon'}
        </button>
        {canli && kartBagli && (
          <p className="mb-canli-not">
            Kaydırıcıyı çektiğinde açı anında karta gidiyor. Kol takılırsa
            kaydırıcıyı yavaş oynat.
          </p>
        )}
      </section>

      {/* ── Robot kol ── */}
      <section className="mb-grup">
        <h4>🦾 Robot Kol <button className="mb-mini" onClick={onHome}>hazır duruş</button></h4>
        {EKLEMLER.map((e, i) => {
          const [lo, hi] = GUVENLI[i];
          const disinda = aciler[i] < lo || aciler[i] > hi;
          return (
            <label key={e.ad} className="mb-eklem">
              <span className="mb-eklem-ust">
                <i className="mb-nokta" style={{ background: e.renk }} />
                <b>{e.ad}</b>
                <code>D{e.pin}</code>
                <em>{e.ipucu}</em>
                <span className={`mb-aci ${disinda ? 'disinda' : ''}`}>{Math.round(aciler[i])}°</span>
              </span>
              <input
                type="range" min={0} max={180} value={Math.round(aciler[i])}
                style={{ accentColor: e.renk }}
                onChange={(ev) => onEklem(i, Number(ev.target.value))}
              />
              <span className="mb-guvenli">güvenli: {lo}–{hi}°</span>
            </label>
          );
        })}
      </section>

      {/* ── RGB LED ── */}
      <section className="mb-grup">
        <h4>🌈 RGB LED <code>D9 · D10 · D11</code></h4>
        <div className="mb-rgb">
          <span
            className="mb-bulb"
            style={{
              background: yanik ? renk : '#141417',
              borderColor: yanik ? renk : '#2A2A30',
              boxShadow: yanik ? `0 0 26px ${renk}` : 'none',
            }}
          />
          <div className="mb-renkler">
            {RENKLER.map((r) => (
              <button
                key={r.ad}
                className="mb-renk"
                style={{ background: r.hex }}
                onClick={() => rgbYak(r.pins)}
                title={`${r.ad} — D9:${r.pins[0]} D10:${r.pins[1]} D11:${r.pins[2]}`}
              >
                <span className="sr-only">{r.ad}</span>
              </button>
            ))}
            <button className="mb-renk mb-kapat" onClick={rgbSondur} title="Söndür">✕</button>
          </div>
        </div>
        <div className="mb-bacaklar">
          {([9, 10, 11] as const).map((p) => (
            <button
              key={p}
              className={`mb-bacak b${p} ${s.rgb[p] ? 'on' : ''}`}
              onClick={() => bench.dijitalYaz(p, s.rgb[p] ? 0 : 1)}
              title={`D${p} bacağını aç/kapat`}
            >
              D{p} {s.rgb[p] ? 'AÇIK' : 'kapalı'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Buzzer ── */}
      <section className="mb-grup">
        <h4>🔔 Buzzer <code>D8</code></h4>
        <div className="mb-notalar">
          {NOTALAR.map((n) => (
            <button key={n.ad} className="mb-nota" onClick={() => cal(n.hz)} title={`${n.hz} Hz`}>
              {n.ad}
            </button>
          ))}
        </div>
      </section>

      {/* ── Röle ── */}
      <section className="mb-grup">
        <h4>🔌 Röle <code>D3</code></h4>
        <button
          className={`mb-role ${s.role ? 'on' : ''}`}
          onClick={() => bench.dijitalYaz(3, s.role ? 0 : 1)}
        >
          ⚡ Röle {s.role ? 'AÇIK' : 'kapalı'}
        </button>
      </section>

      <p className="mb-not">
        Burada kod yok — parçaları elinle oynat, ne yaptıklarını gör.
        Hazır olunca üstten <b>Kodlu</b>'ya geç ve aynı parçaları bloklarla sür.
      </p>
    </div>
  );
}
