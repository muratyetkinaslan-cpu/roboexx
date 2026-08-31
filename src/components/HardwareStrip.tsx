import { useEffect, useState } from 'react';
import { bench, rgbRengi, rgbAcikMi, type BenchState } from '../robotarm/hw-bench';

/**
 * 🔌 DONANIM ŞERİDİ — simülasyonun altında tek satır.
 *
 * Kodlu simülasyonda ekran zaten ikiye bölük; çevre birimleri için geniş
 * bir kenar çubuğu yer kaplar. Bu yüzden RGB, buzzer ve röle tek satırda
 * gösterilir; sensör kaydırıcıları ise ancak görevde o sensör kullanılınca
 * açılır (görev seçildiğinde `gerekli` listesi gelir).
 */

interface Props {
  /** Görevde geçen giriş birimleri — yalnız bunlar gösterilir. */
  gerekli?: Array<'mesafe' | 'pot' | 'ldr' | 'sicaklik' | 'buton'>;
}

export function HardwareStrip({ gerekli }: Props) {
  const [s, setS] = useState<BenchState>(() => bench.durum());
  const [acik, setAcik] = useState(false);
  useEffect(() => bench.abone(setS), []);

  const renk = rgbRengi(s);
  const yanik = rgbAcikMi(s);
  const girisler = gerekli && gerekli.length > 0 ? gerekli : null;

  return (
    <div className="hws">
      <div className="hws-satir">
        <span className="hws-oge" title="RGB LED — D9 kırmızı, D10 yeşil, D11 mavi">
          <span
            className="hws-bulb"
            style={{
              background: yanik ? renk : '#141417',
              borderColor: yanik ? renk : '#2A2A30',
              boxShadow: yanik ? `0 0 14px ${renk}` : 'none',
            }}
          />
          <span className="hws-legs">
            {([9, 10, 11] as const).map((p) => (
              <i key={p} className={`hws-leg l${p} ${s.rgb[p] ? 'on' : ''}`}>{p}</i>
            ))}
          </span>
        </span>

        <span className={`hws-oge ${s.buzzer ? 'is-on' : ''}`} title="Buzzer — D8">
          <span className={`hws-spk ${s.buzzer ? 'on' : ''}`}>🔊</span>
          <b>{s.buzzer ? s.buzzer.freq + ' Hz' : '—'}</b>
        </span>

        <span className={`hws-oge ${s.role ? 'is-on' : ''}`} title="Röle — D3">
          ⚡ <b>{s.role ? 'açık' : 'kapalı'}</b>
        </span>

        {girisler && (
          <button
            className={`hws-oge hws-toggle ${acik ? 'is-on' : ''}`}
            onClick={() => setAcik((a) => !a)}
            title="Sensör değerlerini elle ayarla"
          >
            🎚 Girişler {acik ? '▾' : '▸'}
          </button>
        )}

        {s.uyarilar.length > 0 && (
          <span className="hws-uyari" title={s.uyarilar.join('\n')}>
            ⚠ {s.uyarilar[s.uyarilar.length - 1]}
          </span>
        )}
      </div>

      {girisler && acik && (
        <div className="hws-girisler">
          {girisler.includes('buton') && (
            <button
              className={`hws-btn ${s.girisler.buton ? 'on' : ''}`}
              onMouseDown={() => bench.girisAyarla('buton', true)}
              onMouseUp={() => bench.girisAyarla('buton', false)}
              onMouseLeave={() => bench.girisAyarla('buton', false)}
              onTouchStart={(e) => { e.preventDefault(); bench.girisAyarla('buton', true); }}
              onTouchEnd={() => bench.girisAyarla('buton', false)}
            >
              🔘 Buton (D2) — basılı tut
            </button>
          )}
          {girisler.includes('mesafe') && (
            <Kaydirici ad="Mesafe" pin="D12/13" birim=" cm" min={2} max={100}
              deger={s.girisler.mesafe} onChange={(v) => bench.girisAyarla('mesafe', v)} />
          )}
          {girisler.includes('pot') && (
            <Kaydirici ad="Pot" pin="A0" birim="" min={0} max={100}
              deger={s.girisler.pot} onChange={(v) => bench.girisAyarla('pot', v)} />
          )}
          {girisler.includes('ldr') && (
            <Kaydirici ad="Işık" pin="A1" birim="" min={0} max={100}
              deger={s.girisler.ldr} onChange={(v) => bench.girisAyarla('ldr', v)} />
          )}
          {girisler.includes('sicaklik') && (
            <Kaydirici ad="Sıcaklık" pin="A2" birim=" °C" min={-10} max={60}
              deger={s.girisler.sicaklik} onChange={(v) => bench.girisAyarla('sicaklik', v)} />
          )}
        </div>
      )}
    </div>
  );
}

function Kaydirici(p: {
  ad: string; pin: string; birim: string; min: number; max: number;
  deger: number; onChange: (v: number) => void;
}) {
  return (
    <label className="hws-slider">
      <span>{p.ad} <code>{p.pin}</code><b>{p.deger}{p.birim}</b></span>
      <input type="range" min={p.min} max={p.max} value={p.deger}
        onChange={(e) => p.onChange(+e.target.value)} />
    </label>
  );
}
