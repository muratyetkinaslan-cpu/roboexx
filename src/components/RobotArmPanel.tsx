import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import {
  type ArmConfig, type ServoKind,
  loadArmConfig, saveArmConfig,
  bootstrapCode, jointCommand, allJointsCommand,
  physicalToLogical, jointForServo,
} from '../robotarm/config';

/** App'in serial telemetrisini panele iletmesi için imperative handle. */
export interface RobotArmHandle {
  /** Firmware'den gelen servo telemetrisi: gerçek→sim yansıtma. */
  applyServoTelemetry(code: number, id: number, angle: number): void;
}

interface Props {
  /** Pico bağlı mı? */
  connected: boolean;
  /** Tek/çok satırlık MicroPython'u REPL'e gönder (App uygular). */
  onSendCode: (code: string) => void;
  /** Tam ekran mı? */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

const KIND_LABELS: Record<ServoKind, string> = {
  normal: 'Normal servo',
  driver: 'Sürücü servo',
  pca: 'PCA9685',
};
/** id alanı etiketi tip'e göre değişir */
const ID_LABEL: Record<ServoKind, string> = { normal: 'Pin', driver: 'No', pca: 'Kanal' };
const ID_MAX: Record<ServoKind, number> = { normal: 28, driver: 4, pca: 15 };
const ID_MIN: Record<ServoKind, number> = { normal: 0, driver: 1, pca: 0 };

const SIM_URL = '/robot/arm-sim.html';

export const RobotArmPanel = forwardRef<RobotArmHandle, Props>(function RobotArmPanel(
  { connected, onSendCode, fullscreen, onToggleFullscreen, onClose }, ref
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [cfg, setCfg] = useState<ArmConfig>(() => loadArmConfig());
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [simReady, setSimReady] = useState(false);
  const [gotoOn, setGotoOn] = useState(false);
  const [pointModeOn, setPointModeOn] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [repeating, setRepeating] = useState(false);
  const [dwell, setDwell] = useState(400);
  const [bootDone, setBootDone] = useState(false);
  const [lastReach, setLastReach] = useState<number | null>(null);
  const liveThrottle = useRef<Record<number, number>>({});
  // Echo (geri besleme) bastırma: sim kendi komutunu gönderdiği eklemin
  // telemetri yankısını kısa süre yok say → slider geri zıplamaz.
  const drivenAt = useRef<Record<number, number>>({});
  const markDriven = (joints: number[]) => {
    const now = performance.now();
    for (const j of joints) drivenAt.current[j] = now;
  };

  // config her değişiminde kaydet
  useEffect(() => { saveArmConfig(cfg); }, [cfg]);

  /** sim iframe'ine mesaj gönder */
  const postToSim = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  /** REPL hazırlığı: importlar (+PCA init). connected ise gönderir. */
  const ensureBoot = useCallback(() => {
    if (!connected) return;
    onSendCode(bootstrapCode(cfgRef.current));
    setBootDone(true);
  }, [connected, onSendCode]);

  // --- sim'den gelen mesajlar ---
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || typeof d !== 'object' || d.source !== 'roboexx-arm') return;
      switch (d.type) {
        case 'rx:ready':
          setSimReady(true);
          break;
        case 'rx:points':
          if (typeof d.n === 'number') setPointCount(d.n);
          break;
        case 'rx:repeatState':
          setRepeating(!!d.on);
          break;
        case 'rx:ik': {
          // Sim kol hedefe gitti → aynı açıları gerçek kola gönder
          if (Array.isArray(d.angles)) {
            if (!bootDone) ensureBoot();
            markDriven([0, 1, 2, 3]);
            onSendCode(allJointsCommand(cfgRef.current, d.angles));
          }
          if (typeof d.reach === 'number') setLastReach(d.reach);
          break;
        }
        case 'rx:joint': {
          // Slider canlı sürüş → ilgili servoyu gerçek kola yaz (throttle)
          if (typeof d.joint === 'number' && typeof d.angle === 'number') {
            const now = performance.now();
            markDriven([d.joint]);
            const last = liveThrottle.current[d.joint] || 0;
            if (now - last < 45) break;
            liveThrottle.current[d.joint] = now;
            if (!bootDone) ensureBoot();
            onSendCode(jointCommand(cfgRef.current.joints[d.joint], d.angle));
          }
          break;
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSendCode, ensureBoot, bootDone]);

  // App → bu panel: gerçek servo telemetrisi → sim yansıtma
  useImperativeHandle(ref, () => ({
    applyServoTelemetry(code: number, id: number, angle: number) {
      const joint = jointForServo(cfgRef.current, code, id);
      if (joint < 0) return;
      // Sim'in kendi gönderdiği komutun yankısıysa yok say (echo döngüsü kırma).
      // Blok çalıştırınca gelen telemetri ise (sim göndermedi) normal yansır.
      if (performance.now() - (drivenAt.current[joint] || 0) < 800) return;
      const logical = physicalToLogical(cfgRef.current.joints[joint], angle);
      postToSim({ type: 'rx:setJoint', joint, angle: logical });
    },
  }), [postToSim]);

  // --- kontroller ---
  const homeAll = () => {
    postToSim({ type: 'rx:home' });
    if (connected) {
      if (!bootDone) ensureBoot();
      markDriven([0, 1, 2, 3]);
      onSendCode(allJointsCommand(cfgRef.current, [90, 90, 90, 90]));
    }
  };
  const toggleGoto = () => {
    const next = !gotoOn;
    setGotoOn(next);
    if (next) { setPointModeOn(false); setRepeating(false); }
    postToSim({ type: 'rx:enableGoto', on: next });
  };
  const togglePointMode = () => {
    const next = !pointModeOn;
    setPointModeOn(next);
    if (next) { setGotoOn(false); }
    postToSim({ type: 'rx:pointMode', on: next });
  };
  const clearPoints = () => {
    postToSim({ type: 'rx:clearPoints' });
    setPointCount(0);
    setRepeating(false);
  };
  const toggleRepeat = () => {
    if (repeating) {
      postToSim({ type: 'rx:repeat', on: false });
      setRepeating(false);
    } else {
      // tekrar başlarken nokta ekleme modundan çık
      setPointModeOn(false);
      postToSim({ type: 'rx:pointMode', on: false });
      postToSim({ type: 'rx:repeat', on: true, dwell });
    }
  };

  const updateJoint = (i: number, patch: Partial<ArmConfig['joints'][number]>) => {
    setCfg((c) => {
      const joints = c.joints.map((j, idx) => (idx === i ? { ...j, ...patch } : j)) as ArmConfig['joints'];
      return { ...c, joints };
    });
  };
  const usesPca = cfg.joints.some((j) => j.kind === 'pca');

  return (
    <div className={`robotarm-panel ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="robotarm-header">
        <span className="robotarm-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 6v4M7 14l5-4 5 4M5 20h14M7 14v6M17 14v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Robot Kol
          <span className={`robotarm-dot ${simReady ? 'ok' : ''}`} title={simReady ? 'Simülasyon hazır' : 'Yükleniyor…'} />
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
            title="Robot Kol Simülasyonu"
            className="robotarm-iframe"
          />
        </div>

        <aside className="robotarm-config">
          <div className="robotarm-config-scroll">
            <div className="ra-section">
              <div className="ra-actions">
                <button className={`btn btn-secondary ra-goto ${gotoOn ? 'is-on' : ''}`} onClick={toggleGoto}>
                  {gotoOn ? '● Tıkla-Git açık' : 'Tıkla-Git (IK)'}
                </button>
                <button className="btn btn-ghost" onClick={homeAll} title="Sim + gerçek kolu 90°'ye getir">
                  Tümü 90° (kalibrasyon)
                </button>
              </div>
              <p className="ra-hint">
                {gotoOn
                  ? 'Sahnede zemine tıkla — kol oraya gider; bağlıysa gerçek kol da gider.'
                  : 'Simülasyonu 90°, fiziksel kolu da 90° yap; sonra birlikte çalışırlar.'}
                {lastReach !== null && <> · son hedef sapma: <b>{lastReach} cm</b></>}
              </p>
              {!connected && <p className="ra-warn">Pico bağlı değil — komutlar yalnızca simülasyonda çalışır.</p>}
              {connected && !bootDone && (
                <button className="btn btn-ghost ra-boot" onClick={ensureBoot}>Modülleri hazırla (import)</button>
              )}
            </div>

            <div className="ra-section">
              <h4 className="ra-h">Nokta tekrarı (pick &amp; place)</h4>
              <div className="ra-actions">
                <button
                  className={`btn btn-secondary ${pointModeOn ? 'is-on ra-goto' : ''}`}
                  onClick={togglePointMode}
                  disabled={repeating}
                >
                  {pointModeOn ? `● Nokta ekle açık (${pointCount})` : 'Nokta ekle'}
                </button>
                <div className="ra-row">
                  <button
                    className={`btn ${repeating ? 'btn-danger' : 'btn-primary'}`}
                    onClick={toggleRepeat}
                    disabled={pointCount < 2}
                    style={{ flex: 1 }}
                  >
                    {repeating ? '■ Durdur' : `▶ Tekrarla (${pointCount} nokta)`}
                  </button>
                  <button className="btn btn-ghost" onClick={clearPoints} disabled={repeating}>Temizle</button>
                </div>
                <label className="ra-field ra-field-inline">
                  <span>Bekleme (ms)</span>
                  <input
                    type="number" min={0} max={5000} step={50} value={dwell}
                    onChange={(e) => setDwell(Math.max(0, +e.target.value))}
                    disabled={repeating}
                  />
                </label>
              </div>
              <p className="ra-hint">
                <b>Nokta ekle</b>'yi aç, sahnede zemine sırayla tıklayarak 2+ hedef nokta koy.
                Sonra <b>Tekrarla</b> ile kol noktalar arasında döngüye girer; bağlıysa gerçek kol da
                aynı sırayı tekrarlar.
              </p>
            </div>

            <div className="ra-section">
              <h4 className="ra-h">Eklem → Servo eşlemesi & kalibrasyon</h4>
              {cfg.joints.map((j, i) => (
                <div className="ra-joint" key={i}>
                  <div className="ra-joint-label">{j.label}</div>
                  <div className="ra-joint-grid">
                    <label className="ra-field">
                      <span>Tip</span>
                      <select
                        value={j.kind}
                        onChange={(e) => updateJoint(i, { kind: e.target.value as ServoKind })}
                      >
                        <option value="normal">{KIND_LABELS.normal}</option>
                        <option value="driver">{KIND_LABELS.driver}</option>
                        <option value="pca">{KIND_LABELS.pca}</option>
                      </select>
                    </label>
                    <label className="ra-field ra-field-narrow">
                      <span>{ID_LABEL[j.kind]}</span>
                      <input
                        type="number"
                        min={ID_MIN[j.kind]}
                        max={ID_MAX[j.kind]}
                        value={j.id}
                        onChange={(e) => updateJoint(i, { id: +e.target.value })}
                      />
                    </label>
                    <label className="ra-field ra-field-narrow">
                      <span>Ofset°</span>
                      <input
                        type="number"
                        min={-90}
                        max={90}
                        value={j.offset}
                        onChange={(e) => updateJoint(i, { offset: +e.target.value })}
                      />
                    </label>
                    <label className="ra-field ra-field-check">
                      <input
                        type="checkbox"
                        checked={j.invert}
                        onChange={(e) => updateJoint(i, { invert: e.target.checked })}
                      />
                      <span>Ters</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {usesPca && (
              <div className="ra-section">
                <h4 className="ra-h">PCA9685 I2C</h4>
                <div className="ra-joint-grid">
                  <label className="ra-field ra-field-narrow">
                    <span>SDA</span>
                    <input type="number" min={0} max={28} value={cfg.pca.sda}
                      onChange={(e) => setCfg((c) => ({ ...c, pca: { ...c.pca, sda: +e.target.value } }))} />
                  </label>
                  <label className="ra-field ra-field-narrow">
                    <span>SCL</span>
                    <input type="number" min={0} max={28} value={cfg.pca.scl}
                      onChange={(e) => setCfg((c) => ({ ...c, pca: { ...c.pca, scl: +e.target.value } }))} />
                  </label>
                  <label className="ra-field ra-field-narrow">
                    <span>Adres 0x</span>
                    <input type="text" value={cfg.pca.addr.toString(16).toUpperCase()}
                      onChange={(e) => {
                        const v = parseInt(e.target.value || '40', 16);
                        if (!Number.isNaN(v)) setCfg((c) => ({ ...c, pca: { ...c.pca, addr: v } }));
                      }} />
                  </label>
                </div>
                <p className="ra-hint">PCA tipi eklemler için bir kez init edilir.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
});
