import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  type RoboBotConfig,
  loadRoboBotConfig, saveRoboBotConfig, configPayload,
} from '../robobot/config';

interface Props {
  /** Bloklardan üretilen simülasyon JS'i (App tarafından sağlanır) */
  simCode: string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

/** Sim'den gelen canlı sensör telemetrisi */
interface Sensors {
  d: { front: number; left: number; right: number };
  line: { left: number; right: number };
  motors: { l: number; r: number };
  running: boolean;
}

const SIM_URL = '/robot/robobot-sim.html?embed=1';

const TRACK_PRESETS: { value: string; label: string }[] = [
  { value: 'oval', label: 'Oval pist' },
  { value: 'eight', label: 'Sekiz (∞)' },
  { value: 'zigzag', label: 'Zigzag' },
  { value: 'straight', label: 'Düz çizgi' },
  { value: 'ushape', label: 'U dönüş' },
  { value: 'none', label: 'Yol yok' },
];

export function RoboBotPanel({ simCode, fullscreen, onToggleFullscreen, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [cfg, setCfg] = useState<RoboBotConfig>(() => loadRoboBotConfig());
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [simReady, setSimReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [track, setTrack] = useState('oval');
  const [sensors, setSensors] = useState<Sensors | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [codeError, setCodeError] = useState<string | null>(null);

  const logBoxRef = useRef<HTMLDivElement | null>(null);

  const postToSim = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  // config her değişiminde kaydet + simülasyona uygula
  useEffect(() => {
    saveRoboBotConfig(cfg);
    if (simReady) postToSim({ type: 'rx:setConfig', config: configPayload(cfg) });
  }, [cfg, simReady, postToSim]);

  // konsol otomatik en alta kaydır
  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  // --- sim'den gelen mesajlar ---
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || typeof d !== 'object' || d.source !== 'roboexx-bot') return;
      switch (d.type) {
        case 'rx:ready':
          setSimReady(true);
          postToSim({ type: 'rx:setConfig', config: configPayload(cfgRef.current) });
          postToSim({ type: 'rx:setTrackWidth', w: cfgRef.current.trackWidth });
          postToSim({ type: 'rx:setColors', top: cfgRef.current.colorTop, bottom: cfgRef.current.colorBottom });
          break;
        case 'rx:running':
          setRunning(!!d.on);
          break;
        case 'rx:done':
          setRunning(false);
          break;
        case 'rx:log':
          setLog((l) => [...l.slice(-200), String(d.msg)]);
          break;
        case 'rx:sensors':
          setSensors({ d: d.d, line: d.line, motors: d.motors, running: d.running });
          break;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postToSim]);

  // --- çalıştır / durdur ---
  const run = () => {
    setCodeError(null);
    const code = (simCode || '').trim();
    if (!code) {
      setCodeError('Önce bloklarla bir program yaz (en az bir motor/hareket bloğu).');
      return;
    }
    setLog([]);
    postToSim({ type: 'rx:run', code });
  };
  const stop = () => postToSim({ type: 'rx:stop' });
  const reset = () => { postToSim({ type: 'rx:reset' }); setLog([]); };

  // --- pist ---
  const changeTrack = (preset: string) => {
    setTrack(preset);
    setDrawMode(false);
    postToSim({ type: 'rx:setTrack', preset });
  };
  const toggleDraw = () => {
    const next = !drawMode;
    setDrawMode(next);
    postToSim({ type: 'rx:drawMode', on: next });
  };
  const clearTrack = () => { postToSim({ type: 'rx:clearTrack' }); setTrack('none'); };

  // --- engeller ---
  const addObstacle = () => {
    // robotun önüne rastgele dağılımlı yerleştir (üst üste binmesin)
    const x = Math.round((Math.random() - 0.5) * 120);
    const z = Math.round((Math.random() - 0.5) * 120);
    postToSim({ type: 'rx:addObstacle', x, z });
  };
  const clearObstacles = () => postToSim({ type: 'rx:clearObstacles' });

  // --- yardımcılar ---
  const usField = (
    key: 'front' | 'left' | 'right',
    label: string,
  ) => (
    <div className="rb-us-row">
      <span className="rb-us-name">{label}</span>
      <label className="ra-field ra-field-narrow">
        <span>Trig</span>
        <input
          type="number" min={0} max={28} value={cfg.us[key].trig}
          onChange={(e) => setCfg((c) => ({
            ...c, us: { ...c.us, [key]: { ...c.us[key], trig: +e.target.value } },
          }))}
        />
      </label>
      <label className="ra-field ra-field-narrow">
        <span>Echo</span>
        <input
          type="number" min={0} max={28} value={cfg.us[key].echo}
          onChange={(e) => setCfg((c) => ({
            ...c, us: { ...c.us, [key]: { ...c.us[key], echo: +e.target.value } },
          }))}
        />
      </label>
    </div>
  );

  return (
    <div className={`robotarm-panel ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="robotarm-header">
        <span className="robotarm-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="8" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="9" cy="20" r="2" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="15" cy="20" r="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 8V5M15 8V5M8.5 12h.01M15.5 12h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          RoboBOT Simülasyonu
          <span className={`robotarm-dot ${simReady ? 'ok' : ''}`} title={simReady ? 'Simülasyon hazır' : 'Yükleniyor…'} />
          {sensors && (
            <span className="robotarm-tip" title="Canlı mesafe (ön/sol/sağ)">
              ön {sensors.d.front}cm · sol {sensors.d.left}cm · sağ {sensors.d.right}cm
            </span>
          )}
        </span>
        <div className="robotarm-header-actions">
          <button className="btn btn-ghost btn-icon-only" onClick={onToggleFullscreen} title={fullscreen ? 'İkili görünüm' : 'Tam ekran'}>
            {fullscreen ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            )}
          </button>
          <button className="btn btn-ghost btn-icon-only" onClick={onClose} title="Kapat">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      <div className="robotarm-body">
        <div className="robotarm-stage">
          <iframe
            ref={iframeRef}
            src={SIM_URL}
            title="RoboBOT Simülasyonu"
            className="robotarm-iframe"
          />
        </div>

        <aside className="robotarm-config">
          <div className="robotarm-config-scroll">
            {/* ÇALIŞTIR */}
            <div className="ra-section">
              <div className="rb-run-row">
                {running ? (
                  <button className="btn btn-danger" onClick={stop} style={{ flex: 1 }}>■ Durdur</button>
                ) : (
                  <button className="btn btn-primary" onClick={run} style={{ flex: 1 }}>▶ Çalıştır</button>
                )}
                <button className="btn btn-ghost" onClick={reset} title="Robotu başlangıç konumuna al">↺ Sıfırla</button>
              </div>
              {codeError && <p className="ra-warn">{codeError}</p>}
              <p className="ra-hint">
                Bloklarla kodu yaz, <b>Çalıştır</b>'a bas — robot simülasyonda hareket eder.
                Robotu ve engelleri fareyle <b>sürükleyebilirsin</b>. Boş alanı sürükle = kamerayı döndür.
              </p>
            </div>

            {/* CANLI SENSÖR */}
            {sensors && (
              <div className="ra-section">
                <h4 className="ra-h">Canlı sensör değerleri</h4>
                <div className="rb-sensors">
                  <div className={`rb-sensor ${sensors.d.front < 15 ? 'is-near' : ''}`}>
                    <span className="rb-sensor-k">Ön mesafe</span>
                    <span className="rb-sensor-v">{sensors.d.front} cm</span>
                  </div>
                  <div className={`rb-sensor ${sensors.d.left < 15 ? 'is-near' : ''}`}>
                    <span className="rb-sensor-k">Sol mesafe</span>
                    <span className="rb-sensor-v">{sensors.d.left} cm</span>
                  </div>
                  <div className={`rb-sensor ${sensors.d.right < 15 ? 'is-near' : ''}`}>
                    <span className="rb-sensor-k">Sağ mesafe</span>
                    <span className="rb-sensor-v">{sensors.d.right} cm</span>
                  </div>
                  <div className={`rb-sensor ${sensors.line.left ? 'is-line' : ''}`}>
                    <span className="rb-sensor-k">Sol çizgi</span>
                    <span className="rb-sensor-v">{sensors.line.left}</span>
                  </div>
                  <div className={`rb-sensor ${sensors.line.right ? 'is-line' : ''}`}>
                    <span className="rb-sensor-k">Sağ çizgi</span>
                    <span className="rb-sensor-v">{sensors.line.right}</span>
                  </div>
                  <div className="rb-sensor">
                    <span className="rb-sensor-k">Motor L / R</span>
                    <span className="rb-sensor-v">{sensors.motors.l}% / {sensors.motors.r}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* PİST */}
            <div className="ra-section">
              <h4 className="ra-h">Pist / yol</h4>
              <label className="ra-field">
                <span>Hazır pist</span>
                <select value={track} onChange={(e) => changeTrack(e.target.value)}>
                  {TRACK_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label className="ra-grip-slider">
                <span>Çizgi kalınlığı</span>
                <input
                  type="range" min={1.5} max={10} step={0.2}
                  value={cfg.trackWidth}
                  onChange={(e) => {
                    const w = +e.target.value;
                    setCfg((c) => ({ ...c, trackWidth: w }));
                    postToSim({ type: 'rx:setTrackWidth', w });
                  }}
                />
                <b>{cfg.trackWidth.toFixed(1)}</b>
              </label>
              <div className="ra-actions">
                <button
                  className={`btn btn-secondary ${drawMode ? 'is-on ra-goto' : ''}`}
                  onClick={toggleDraw}
                >
                  {drawMode ? '● Çizim açık — zemine tıkla' : '✎ Yol çiz'}
                </button>
                <button className="btn btn-ghost" onClick={clearTrack}>Yolu sil</button>
              </div>
              <p className="ra-hint">
                <b>Yol çiz</b>'i aç, zemine sırayla tıklayarak kendi çizgi pistini oluştur.
                Çizgi sensörleri bu siyah yolu görür. İki sensör çizgiyi ortalayamıyorsa
                <b> çizgi kalınlığını artır</b>.
              </p>
            </div>

            {/* ENGELLER */}
            <div className="ra-section">
              <h4 className="ra-h">Engeller</h4>
              <div className="ra-actions">
                <button className="btn btn-secondary" onClick={addObstacle}>+ Engel ekle</button>
                <button className="btn btn-ghost" onClick={clearObstacles}>Tümünü sil</button>
              </div>
              <p className="ra-hint">
                Engelleri fareyle sürükleyerek konumlandır. Her engelin <b>robota uzaklığı (cm)</b>
                zeminde ve üst ekranda gösterilir. Mesafe sensörü bu engelleri ölçer.
              </p>
            </div>

            {/* MOTOR EŞLEMESİ */}
            <div className="ra-section">
              <h4 className="ra-h">Motor eşlemesi</h4>
              <div className="ra-row">
                <label className="ra-field">
                  <span>Sol teker motoru</span>
                  <select
                    value={cfg.leftMotor}
                    onChange={(e) => setCfg((c) => ({ ...c, leftMotor: e.target.value as '1' | '2' }))}
                  >
                    <option value="1">Motor 1</option>
                    <option value="2">Motor 2</option>
                  </select>
                </label>
                <label className="ra-field">
                  <span>Sağ teker motoru</span>
                  <select
                    value={cfg.rightMotor}
                    onChange={(e) => setCfg((c) => ({ ...c, rightMotor: e.target.value as '1' | '2' }))}
                  >
                    <option value="1">Motor 1</option>
                    <option value="2">Motor 2</option>
                  </select>
                </label>
              </div>
              <p className="ra-hint">Bloklardaki <b>DC Motor</b> numarası ile aynı olmalı.</p>
            </div>

            {/* MESAFE SENSÖRLERİ */}
            <div className="ra-section">
              <h4 className="ra-h">Mesafe sensörleri (3 ultrasonik)</h4>
              {usField('front', 'Ön')}
              {usField('left', 'Sol')}
              {usField('right', 'Sağ')}
              <p className="ra-hint">
                Bloktaki <b>Ultrasonik mesafe</b> trig/echo pinleriyle eşleştir.
                Kod ön sensörü okumak için ön trig pinini kullanmalı.
              </p>
            </div>

            {/* ÇİZGİ SENSÖRLERİ */}
            <div className="ra-section">
              <h4 className="ra-h">Çizgi sensörleri (2 adet)</h4>
              <div className="ra-row">
                <label className="ra-field ra-field-narrow">
                  <span>Sol pin</span>
                  <input
                    type="number" min={0} max={28} value={cfg.line.left}
                    onChange={(e) => setCfg((c) => ({ ...c, line: { ...c.line, left: +e.target.value } }))}
                  />
                </label>
                <label className="ra-field ra-field-narrow">
                  <span>Sağ pin</span>
                  <input
                    type="number" min={0} max={28} value={cfg.line.right}
                    onChange={(e) => setCfg((c) => ({ ...c, line: { ...c.line, right: +e.target.value } }))}
                  />
                </label>
              </div>
              <p className="ra-hint">
                <b>Dijital oku</b> = yol üstünde 1, dışında 0. <b>Analog oku</b> da kullanılabilir
                (yol üstünde yüksek değer). Bloktaki pin ile aynı olmalı.
              </p>
            </div>

            {/* POTANSİYOMETRE */}
            <div className="ra-section">
              <h4 className="ra-h">Potansiyometre (simülasyon)</h4>
              <label className="ra-grip-slider">
                <span>Değer</span>
                <input
                  type="range" min={0} max={100} step={1}
                  value={cfg.potValue}
                  onChange={(e) => {
                    const v = +e.target.value;
                    setCfg((c) => ({ ...c, potValue: v }));
                    postToSim({ type: 'rx:setPot', value: v });
                  }}
                />
                <b>{cfg.potValue}</b>
              </label>
              <p className="ra-hint">Bloktaki <b>Potansiyometre oku</b> bu değeri (0–100) döndürür — hız ayarı denemek için.</p>
            </div>

            {/* ROBOT RENGİ */}
            <div className="ra-section">
              <h4 className="ra-h">Robot rengi</h4>
              <div className="ra-row">
                <label className="ra-field">
                  <span>Üst şase</span>
                  <input
                    type="color" className="rb-color"
                    value={cfg.colorTop}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCfg((c) => ({ ...c, colorTop: v }));
                      postToSim({ type: 'rx:setColors', top: v });
                    }}
                  />
                </label>
                <label className="ra-field">
                  <span>Alt şase</span>
                  <input
                    type="color" className="rb-color"
                    value={cfg.colorBottom}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCfg((c) => ({ ...c, colorBottom: v }));
                      postToSim({ type: 'rx:setColors', bottom: v });
                    }}
                  />
                </label>
              </div>
              <p className="ra-hint">Robotun üst ve alt güverte rengini seç — simülasyonda anında değişir.</p>
            </div>

            {/* KONSOL */}
            <div className="ra-section">
              <h4 className="ra-h">Konsol çıktısı</h4>
              <div className="rb-console" ref={logBoxRef}>
                {log.length === 0
                  ? <span className="rb-console-empty">yazdır bloğu çıktıları burada görünür…</span>
                  : log.map((l, i) => <div key={i} className="rb-console-line">{l}</div>)}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
