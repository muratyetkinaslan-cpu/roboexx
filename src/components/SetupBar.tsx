import { useEffect, useState } from 'react';
import { bench, rgbRengi, rgbAcikMi, type BenchState } from '../robotarm/hw-bench';
import {
  KARTLAR, kartBul, kurulumOzet, CEVRE_ALANLAR,
  type Kurulum, type KartId, type CevrePin,
} from '../robotarm/setup';

/**
 * ⚙️ KURULUM ÇUBUĞU — kart · pinler · kalibrasyon.
 *
 * Öğrenci göreve başlamadan önce hangi kartı kullandığını ve servoların
 * hangi pine takılı olduğunu söyler. Cevap anahtarları buna göre çevrilir
 * (bkz. setup.ts), böylece PicoBricks'te "Sürücü Servo" bloğu yazan çocuk
 * "yanlış blok" uyarısı almaz.
 *
 * "Kalibre et" tüm servoları 90°'ye alır — hem simülasyonda hem kartta.
 * Kol düz dururken monte edilir; öğrenci göreve buradan başlar.
 */
export function SetupBar({
  kurulum, onDegis, onKalibre, kartBagli,
}: {
  kurulum: Kurulum;
  onDegis: (k: Kurulum) => void;
  onKalibre: () => void;
  kartBagli: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const [cevreAcik, setCevreAcik] = useState(false);
  const [kalibreEdildi, setKalibreEdildi] = useState(false);
  const kart = kartBul(kurulum.kart);

  const kartDegis = (id: KartId) => {
    // Kart değişince o kartın varsayılan pinlerine dönülür.
    const y = kartBul(id);
    onDegis({ kart: id, pin: [...y.varsayilanPin], cevre: { ...y.cevre } });
  };
  const pinDegis = (eklem: number, p: number) => {
    const y = [...kurulum.pin] as Kurulum['pin'];
    y[eklem] = p;
    onDegis({ ...kurulum, pin: y });
  };
  const cevreDegis = (alan: keyof CevrePin, p: number) =>
    onDegis({ ...kurulum, cevre: { ...kurulum.cevre, [alan]: p } });
  const cevreSifirla = () => onDegis({ ...kurulum, cevre: { ...kart.cevre } });

  const kalibre = () => {
    onKalibre();
    setKalibreEdildi(true);
    window.setTimeout(() => setKalibreEdildi(false), 2200);
  };

  const EKLEM = ['Taban', 'Omuz', 'Dirsek', 'Tutucu'];
  const onEk = kart.servoBlok === 'rx_servo_v2' ? 'Servo' : 'D';

  return (
    <div className="sb">
      <div className="sb-satir">
        <select
          className="sb-kart"
          value={kurulum.kart}
          onChange={(e) => kartDegis(e.target.value as KartId)}
          title="Hangi kartı kullanıyorsun? Cevap anahtarları buna göre ayarlanır."
        >
          {KARTLAR.map((k) => (
            <option key={k.id} value={k.id}>{k.emoji} {k.ad}</option>
          ))}
        </select>

        <button
          className={`sb-kalibre ${kalibreEdildi ? 'is-ok' : ''}`}
          onClick={kalibre}
          title="Tüm servoları 90°'ye alır — kolu düz duruma getirip monte et"
        >
          {kalibreEdildi ? '✓ 90° verildi' : '🎯 Kalibre et'}
        </button>

        <button className="sb-pinbtn" onClick={() => setAcik((a) => !a)} title="Servo pinlerini değiştir">
          {acik ? '▾' : '▸'} Servo pinleri
        </button>
        <button className="sb-pinbtn" onClick={() => setCevreAcik((a) => !a)} title="Sensör ve çıkış pinlerini değiştir">
          {cevreAcik ? '▾' : '▸'} Donanım pinleri
        </button>
      </div>

      <p className="sb-ozet">
        {kurulumOzet(kurulum)}
        <span> · {kart.not}</span>
      </p>

      {acik && (
        <div className="sb-pinler">
          {EKLEM.map((ad, i) => (
            <label key={ad}>
              <span>{ad}</span>
              <select
                value={kurulum.pin[i]}
                onChange={(e) => pinDegis(i, Number(e.target.value))}
              >
                {kart.pinSecenek.map((p) => (
                  <option key={p} value={p}>{onEk}{p}</option>
                ))}
              </select>
            </label>
          ))}
          <p className="sb-not">
            Cevap anahtarları seçtiğin pinlere göre çevriliyor — doğru yazdığın
            kod "yanlış pin" uyarısı almaz.
          </p>
        </div>
      )}

      {cevreAcik && (
        <div className="sb-pinler sb-cevre">
          {CEVRE_ALANLAR.map((c) => (
            <label key={c.anahtar}>
              <span>{c.emoji} {c.ad}</span>
              <select
                value={kurulum.cevre[c.anahtar]}
                onChange={(e) => cevreDegis(c.anahtar, Number(e.target.value))}
              >
                {(c.tur === 'analog' ? kart.analogSecenek : kart.pinSecenek).map((p) => (
                  <option key={p} value={p}>
                    {c.tur === 'analog' ? `A${p - 26} (${p})` : `D${p}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="sb-not">
            Kendi devrende sensörü başka pine taktıysan burayı değiştir —
            cevap anahtarı da o pine göre çevrilir.
            <button className="sb-sifirla" onClick={cevreSifirla}>varsayılana dön</button>
          </p>
        </div>
      )}

      {!kartBagli && (
        <p className="sb-not sb-kartsiz">
          Kart bağlı değil — kalibrasyon şimdilik sadece simülasyonda çalışır.
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   🔌 DONANIM PANELİ — kodlu tarafta çevre birimleri.
   Kodda buzzer öterse burada da öter, RGB yanarsa burada da yanar.
   Sensör değerlerini elle verip kodu baştan sona test edebilirsin.
   ══════════════════════════════════════════════════════════════════ */
export function HardwarePanel() {
  const [s, setS] = useState<BenchState>(() => bench.durum());
  useEffect(() => bench.abone(setS), []);

  const renk = rgbRengi(s);
  const yanik = rgbAcikMi(s);

  return (
    <div className="hp">
      <div className="hp-cikti">
        <span className="hp-oge" title="RGB LED — D9 kırmızı, D10 yeşil, D11 mavi">
          <span
            className="hp-bulb"
            style={{
              background: yanik ? renk : '#141417',
              borderColor: yanik ? renk : '#2A2A30',
              boxShadow: yanik ? `0 0 16px ${renk}` : 'none',
            }}
          />
          <span className="hp-legs">
            {([9, 10, 11] as const).map((p) => (
              <i key={p} className={`hp-leg l${p} ${s.rgb[p] ? 'on' : ''}`}>{p}</i>
            ))}
          </span>
        </span>

        <span className={`hp-oge ${s.buzzer ? 'is-on' : ''}`} title="Buzzer — D8">
          <span className={`hp-spk ${s.buzzer ? 'on' : ''}`}>🔊</span>
          <b>{s.buzzer ? s.buzzer.freq + ' Hz' : '—'}</b>
        </span>

        <span className={`hp-oge ${s.role ? 'is-on' : ''}`} title="Röle — D3">
          ⚡ <b>{s.role ? 'açık' : 'kapalı'}</b>
        </span>

        {s.uyarilar.length > 0 && (
          <span className="hp-uyari" title={s.uyarilar.join('\n')}>
            ⚠ {s.uyarilar[s.uyarilar.length - 1]}
          </span>
        )}
      </div>

      <div className="hp-giris">
        <Kaydirici ad="📏 Mesafe" pin="HC-SR04" birim=" cm" min={2} max={100}
          deger={s.girisler.mesafe} onChange={(v) => bench.girisAyarla('mesafe', v)} />
        <Kaydirici ad="🌗 Işık (LDR)" pin="A1" birim="" min={0} max={100}
          deger={s.girisler.ldr} onChange={(v) => bench.girisAyarla('ldr', v)} />
        <Kaydirici ad="🎚 Potansiyometre" pin="A0" birim="" min={0} max={100}
          deger={s.girisler.pot} onChange={(v) => bench.girisAyarla('pot', v)} />
        <Kaydirici ad="🌡 Sıcaklık" pin="A2" birim=" °C" min={-10} max={60}
          deger={s.girisler.sicaklik} onChange={(v) => bench.girisAyarla('sicaklik', v)} />

        <div className="hp-ir">
          <span className="hp-ir-baslik">🔦 IR kumanda <code>D2</code></span>
          <div className="hp-ir-tus">
            {IR_TUSLAR.map((t) => (
              <button
                key={t.kod}
                className={s.girisler.irKod === t.kod ? 'is-on' : ''}
                onClick={() => bench.girisAyarla('irKod', s.girisler.irKod === t.kod ? 0 : t.kod)}
                title={`Kod ${t.kod}`}
              >
                {t.ad}
              </button>
            ))}
          </div>
          <span className="hp-ir-kod">
            Okunan kod: <b>{s.girisler.irKod || 0}</b>
          </span>
        </div>

        <button
          className={`hp-btn ${s.girisler.buton ? 'on' : ''}`}
          onMouseDown={() => bench.girisAyarla('buton', true)}
          onMouseUp={() => bench.girisAyarla('buton', false)}
          onMouseLeave={() => bench.girisAyarla('buton', false)}
          onTouchStart={(e) => { e.preventDefault(); bench.girisAyarla('buton', true); }}
          onTouchEnd={() => bench.girisAyarla('buton', false)}
        >
          🔘 Buton (D2) — basılı tut
        </button>
      </div>
    </div>
  );
}

/** Yaygın NEC kumanda kodları — çocuk tuşa basıp kodu programda okur. */
const IR_TUSLAR = [
  { ad: '▲', kod: 70 }, { ad: '▼', kod: 21 }, { ad: '◀', kod: 68 },
  { ad: '▶', kod: 67 }, { ad: 'OK', kod: 64 },
  { ad: '1', kod: 12 }, { ad: '2', kod: 24 }, { ad: '3', kod: 94 },
];

function Kaydirici(p: {
  ad: string; pin: string; birim: string; min: number; max: number;
  deger: number; onChange: (v: number) => void;
}) {
  return (
    <label className="hp-slider">
      <span>{p.ad} <code>{p.pin}</code><b>{p.deger}{p.birim}</b></span>
      <input type="range" min={p.min} max={p.max} value={p.deger}
        onChange={(e) => p.onChange(+e.target.value)} />
    </label>
  );
}

/**
 * 🔴 ÇIKIŞ ŞERİDİ — görev sekmesinin üstünde tek satır.
 *
 * Çocuk hatayı okurken RGB'nin yanıp yanmadığını, buzzerın ötüp ötmediğini
 * görmek için sekme değiştirmek zorunda kalmasın diye burada da duruyor.
 * Değer vermek (sensör kaydırıcıları) Donanım sekmesinde.
 */
export function OutputStrip() {
  const [s, setS] = useState<BenchState>(() => bench.durum());
  useEffect(() => bench.abone(setS), []);
  const renk = rgbRengi(s);
  const yanik = rgbAcikMi(s);

  return (
    <div className="os">
      <span className="os-oge" title="RGB LED">
        <span
          className="os-bulb"
          style={{
            background: yanik ? renk : '#141417',
            borderColor: yanik ? renk : '#2A2A30',
            boxShadow: yanik ? `0 0 13px ${renk}` : 'none',
          }}
        />
        <span className="os-legs">
          {([9, 10, 11] as const).map((p) => (
            <i key={p} className={`os-leg l${p} ${s.rgb[p] ? 'on' : ''}`} />
          ))}
        </span>
      </span>

      <span className={`os-oge ${s.buzzer ? 'is-on' : ''}`} title="Buzzer">
        <span className={`os-spk ${s.buzzer ? 'on' : ''}`}>🔊</span>
        <b>{s.buzzer ? s.buzzer.freq : '—'}</b>
      </span>

      <span className={`os-oge ${s.role ? 'is-on' : ''}`} title="Röle">⚡</span>

      <span className="os-not">
        📏 {s.girisler.mesafe} cm · 🌗 {s.girisler.ldr} · 🔦 {s.girisler.irKod || '—'}
      </span>
    </div>
  );
}
