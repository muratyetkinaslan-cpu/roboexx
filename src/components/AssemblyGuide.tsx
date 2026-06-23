import { useEffect, useMemo, useState } from 'react';
import { ASSEMBLY_KITS, getKit, type AssemblyStep } from '../robotarm/assembly';

interface Props {
  /** Rehberi kapat */
  onClose: () => void;
  /** Son adımda “Simülasyonu Aç” — rehberi kapatıp Robot Kol panelini açar */
  onOpenSimulation: () => void;
}

type View = { kind: 'select' } | { kind: 'steps'; kitId: string; index: number };

export function AssemblyGuide({ onClose, onOpenSimulation }: Props) {
  const [view, setView] = useState<View>({ kind: 'select' });

  // ESC ile kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (view.kind === 'steps') {
        if (e.key === 'ArrowRight') goNext();
        if (e.key === 'ArrowLeft') goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const kit = view.kind === 'steps' ? getKit(view.kitId) : undefined;
  const step: AssemblyStep | undefined =
    kit && view.kind === 'steps' ? kit.steps[view.index] : undefined;
  const total = kit?.steps.length ?? 0;
  const isLast = view.kind === 'steps' && view.index === total - 1;

  const goNext = () => {
    setView((v) => {
      if (v.kind !== 'steps') return v;
      const k = getKit(v.kitId);
      if (!k) return v;
      if (v.index >= k.steps.length - 1) return v; // son adımda buton onOpenSimulation çağırır
      return { ...v, index: v.index + 1 };
    });
  };
  const goPrev = () =>
    setView((v) => (v.kind === 'steps' && v.index > 0 ? { ...v, index: v.index - 1 } : v));

  return (
    <div className="guide-overlay" role="dialog" aria-modal="true">
      <div className="guide-backdrop" onClick={onClose} />
      <div className="guide-shell">
        <header className="guide-header">
          <div className="guide-header-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 5a2 2 0 012-2h5v18H6a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M20 5a2 2 0 00-2-2h-5v18h5a2 2 0 002-2V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.55" />
            </svg>
            <span>Montaj Rehberi</span>
            {kit && (
              <>
                <span className="guide-sep">/</span>
                <span className="guide-kit-name">{kit.name}</span>
              </>
            )}
          </div>
          <div className="guide-header-actions">
            {view.kind === 'steps' && (
              <button className="btn btn-ghost" onClick={() => setView({ kind: 'select' })}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Kit seç
              </button>
            )}
            <button className="btn btn-ghost btn-icon-only" onClick={onClose} title="Kapat (Esc)">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        {view.kind === 'select' ? (
          <KitSelect onPick={(id) => setView({ kind: 'steps', kitId: id, index: 0 })} />
        ) : (
          kit && step && (
            <StepView
              kitSteps={kit.steps}
              index={view.index}
              step={step}
              total={total}
              isLast={isLast}
              onJump={(i) => setView({ kind: 'steps', kitId: view.kitId, index: i })}
              onPrev={goPrev}
              onNext={goNext}
              onOpenSimulation={onOpenSimulation}
            />
          )
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Kit seçim ekranı
   ============================================================ */
function KitSelect({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="guide-select">
      <p className="guide-select-lead">
        Bir kit seç — adım adım montaj rehberi açılır. Önce kurulum, sonra simülasyonda denersin.
      </p>
      <div className="guide-kit-grid">
        {ASSEMBLY_KITS.map((k) => (
          <button
            key={k.id}
            className={`guide-kit-card ${k.comingSoon ? 'is-soon' : ''}`}
            onClick={() => !k.comingSoon && onPick(k.id)}
            disabled={k.comingSoon}
          >
            <div className="guide-kit-art">
              {k.id === 'roboarm' ? <ArtRoboArmHero /> : <ArtRoboBotHero />}
            </div>
            <div className="guide-kit-meta">
              <div className="guide-kit-card-name">{k.name}</div>
              <div className="guide-kit-tag">{k.tagline}</div>
              <p className="guide-kit-desc">{k.description}</p>
              {k.comingSoon ? (
                <span className="guide-kit-soon">Yakında</span>
              ) : (
                <span className="guide-kit-start">
                  Montaja Başla
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Adım görünümü
   ============================================================ */
function StepView({
  kitSteps, index, step, total, isLast, onJump, onPrev, onNext, onOpenSimulation,
}: {
  kitSteps: AssemblyStep[];
  index: number;
  step: AssemblyStep;
  total: number;
  isLast: boolean;
  onJump: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenSimulation: () => void;
}) {
  const pct = useMemo(() => Math.round(((index + 1) / total) * 100), [index, total]);

  return (
    <div className="guide-steps">
      {/* Sol: adım listesi */}
      <nav className="guide-stepnav">
        <div className="guide-stepnav-head">Adımlar</div>
        <ol className="guide-stepnav-list">
          {kitSteps.map((s, i) => {
            const state = i < index ? 'done' : i === index ? 'active' : 'todo';
            return (
              <li key={i}>
                <button className={`guide-stepnav-item is-${state}`} onClick={() => onJump(i)}>
                  <span className="guide-stepnav-num">
                    {state === 'done' ? (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="guide-stepnav-label">{s.short}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Orta: çizim + metin */}
      <div className="guide-stepmain">
        <div className="guide-stepmain-scroll">
          <div className="guide-art-wrap">
            <span className="guide-art-badge">Adım {index + 1}/{total}</span>
            <StepArt art={step.art} />
          </div>

          <div className="guide-stepbody">
            <h2 className="guide-step-title">{step.title}</h2>
            <p className="guide-step-subtitle">{step.subtitle}</p>

            {step.parts && step.parts.length > 0 && (
              <div className="guide-parts">
                {step.parts.map((p) => (
                  <span key={p} className="guide-part-chip">{p}</span>
                ))}
              </div>
            )}

            <ol className="guide-instr">
              {step.steps.map((s, i) => (
                <li key={i}>
                  <span className="guide-instr-num">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>

            {step.tip && (
              <div className="guide-callout is-tip">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5a4.5 4.5 0 00-2.6 8.2c.4.3.6.7.6 1.1v.7h4v-.7c0-.4.2-.8.6-1.1A4.5 4.5 0 008 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M6 14h4M6.5 12.2h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <span><b>İpucu:</b> {step.tip}</span>
              </div>
            )}
            {step.warn && (
              <div className="guide-callout is-warn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2l6.5 11.5h-13L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M8 6.5v3.2M8 11.8v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span><b>Dikkat:</b> {step.warn}</span>
              </div>
            )}
          </div>
        </div>

        {/* Alt: ilerleme + gezinme */}
        <footer className="guide-stepfoot">
          <div className="guide-progress">
            <div className="guide-progress-bar"><span style={{ width: `${pct}%` }} /></div>
            <span className="guide-progress-text">%{pct}</span>
          </div>
          <div className="guide-nav-btns">
            <button className="btn btn-ghost" onClick={onPrev} disabled={index === 0}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Geri
            </button>
            {isLast ? (
              <button className="btn btn-primary" onClick={onOpenSimulation}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M4 3l9 5-9 5V3z" fill="currentColor" />
                </svg>
                Simülasyonu Aç ve Dene
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onNext}>
                İleri
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   Şematik çizimler
   ============================================================ */
function StepArt({ art }: { art: string }) {
  switch (art) {
    case 'kit': return <ArtKit />;
    case 'center': return <ArtCenter />;
    case 'base': return <ArtArm stage="base" />;
    case 'shoulder': return <ArtArm stage="shoulder" />;
    case 'elbow': return <ArtArm stage="elbow" />;
    case 'gripper': return <ArtArm stage="gripper" />;
    case 'wiring': return <ArtWiring />;
    case 'calibrate': return <ArtArm stage="full" badge="check" />;
    case 'done': return <ArtArm stage="full" badge="play" />;
    default: return null;
  }
}

const C = {
  line: 'var(--rx-text-dim)',
  dim: 'var(--rx-text-muted)',
  acc: 'var(--rx-accent)',
  accSoft: 'var(--rx-accent-soft)',
  surf: 'var(--rx-surface2)',
  text: 'var(--rx-text)',
  ok: 'var(--rx-success)',
};

function svgProps() {
  return {
    viewBox: '0 0 360 280',
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid meet' as const,
    fill: 'none',
  };
}

/* --- Kit içeriği --- */
function ArtKit() {
  const items: { x: number; y: number; label: string; node: JSX.Element }[] = [
    { x: 40, y: 36, label: 'MG996R ×2', node: <ServoIcon big /> },
    { x: 150, y: 36, label: 'MG90S ×2', node: <ServoIcon /> },
    { x: 250, y: 36, label: 'PCA9685', node: <BoardIcon /> },
    { x: 40, y: 150, label: 'Pico', node: <PicoIcon /> },
    { x: 150, y: 150, label: 'Hornlar', node: <HornIcon /> },
    { x: 250, y: 150, label: 'Vidalar', node: <ScrewIcon /> },
  ];
  return (
    <svg {...svgProps()}>
      {items.map((it, i) => (
        <g key={i} transform={`translate(${it.x},${it.y})`}>
          <rect x={0} y={0} width={70} height={78} rx={10} fill={C.surf} stroke={C.line} strokeWidth={1.2} />
          <g transform="translate(35,34)">{it.node}</g>
          <text x={35} y={68} textAnchor="middle" fontSize="10" fill={C.text} fontFamily="var(--font-mono)">{it.label}</text>
        </g>
      ))}
    </svg>
  );
}
function ServoIcon({ big }: { big?: boolean }) {
  const w = big ? 26 : 20, h = big ? 30 : 24;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill={C.accSoft} stroke={C.acc} strokeWidth={1.4} />
      <rect x={-w / 2 - 5} y={-h / 2 + 3} width={5} height={6} fill={C.acc} />
      <rect x={w / 2} y={-h / 2 + 3} width={5} height={6} fill={C.acc} />
      <circle cx={0} cy={-h / 2 - 3} r={4} fill={C.surf} stroke={C.acc} strokeWidth={1.4} />
    </g>
  );
}
function BoardIcon() {
  return (
    <g>
      <rect x={-22} y={-14} width={44} height={28} rx={3} fill={C.accSoft} stroke={C.acc} strokeWidth={1.3} />
      {[-16, -8, 0, 8, 16].map((x) => <circle key={x} cx={x} cy={-8} r={1.6} fill={C.acc} />)}
      {[-16, -8, 0, 8, 16].map((x) => <circle key={'b' + x} cx={x} cy={8} r={1.6} fill={C.acc} />)}
    </g>
  );
}
function PicoIcon() {
  return (
    <g>
      <rect x={-12} y={-18} width={24} height={36} rx={3} fill={C.surf} stroke={C.line} strokeWidth={1.3} />
      <rect x={-7} y={-14} width={14} height={9} rx={1.5} fill={C.line} />
      {[-14, 14].map((x) => [-12, -6, 0, 6, 12].map((y) => <circle key={x + ',' + y} cx={x} cy={y} r={1.3} fill={C.acc} />))}
    </g>
  );
}
function HornIcon() {
  return (
    <g>
      <circle cx={0} cy={0} r={6} fill={C.surf} stroke={C.line} strokeWidth={1.3} />
      <rect x={-2} y={-16} width={4} height={16} rx={2} fill={C.line} />
      <rect x={-2} y={0} width={4} height={16} rx={2} fill={C.line} />
      <rect x={-16} y={-2} width={16} height={4} rx={2} fill={C.line} />
      <rect x={0} y={-2} width={16} height={4} rx={2} fill={C.line} />
    </g>
  );
}
function ScrewIcon() {
  return (
    <g stroke={C.line} strokeWidth={1.4} fill="none">
      {[-10, 4].map((x) => (
        <g key={x} transform={`translate(${x},-10)`}>
          <circle cx={0} cy={0} r={5} fill={C.surf} />
          <path d="M-2.5 0h5M0 -2.5v5" />
          <path d="M0 5v14M-2 19l2 3 2-3" />
        </g>
      ))}
    </g>
  );
}

/* --- Servo 90° --- */
function ArtCenter() {
  return (
    <svg {...svgProps()}>
      <rect x={120} y={120} width={120} height={120} rx={8} fill={C.surf} stroke={C.line} strokeWidth={1.6} />
      <rect x={108} y={150} width={14} height={26} rx={2} fill={C.surf} stroke={C.line} strokeWidth={1.4} />
      <rect x={238} y={150} width={14} height={26} rx={2} fill={C.surf} stroke={C.line} strokeWidth={1.4} />
      {/* açı kadranı */}
      <circle cx={180} cy={120} r={64} fill="none" stroke={C.line} strokeWidth={1.2} strokeDasharray="2 4" />
      <path d="M116 120 A64 64 0 0 1 244 120" fill="none" stroke={C.dim} strokeWidth={1.4} />
      {/* 0 / 90 / 180 işaretleri */}
      <text x={108} y={124} textAnchor="end" fontSize="11" fill={C.dim} fontFamily="var(--font-mono)">0°</text>
      <text x={180} y={48} textAnchor="middle" fontSize="12" fill={C.acc} fontFamily="var(--font-mono)" fontWeight="700">90°</text>
      <text x={252} y={124} textAnchor="start" fontSize="11" fill={C.dim} fontFamily="var(--font-mono)">180°</text>
      {/* mil + ortada gösterge */}
      <circle cx={180} cy={120} r={9} fill={C.surf} stroke={C.acc} strokeWidth={2} />
      <line x1={180} y1={120} x2={180} y2={60} stroke={C.acc} strokeWidth={3} strokeLinecap="round" />
      <circle cx={180} cy={60} r={4} fill={C.acc} />
      <text x={180} y={210} textAnchor="middle" fontSize="11" fill={C.text}>Mil tam ortada — horn’u şimdi tak</text>
    </svg>
  );
}

/* --- Kademeli kol çizimi --- */
function ArtArm({ stage, badge }: {
  stage: 'base' | 'shoulder' | 'elbow' | 'gripper' | 'full';
  badge?: 'check' | 'play';
}) {
  const order = ['base', 'shoulder', 'elbow', 'gripper', 'full'];
  const reached = order.indexOf(stage);
  // Bir parçanın durumu: bu adımda eklendiyse vurgulu, daha önce eklendiyse soluk
  const partColor = (addedAt: number) => {
    if (stage === 'full') return { stroke: C.line, fill: C.surf, op: 1 };
    if (addedAt === reached) return { stroke: C.acc, fill: C.accSoft, op: 1 };       // yeni
    if (addedAt < reached) return { stroke: C.line, fill: C.surf, op: 0.55 };        // monteli
    return null;                                                                      // henüz yok
  };
  const base = partColor(0);
  const shoulder = partColor(1);
  const elbow = partColor(2);
  const gripper = partColor(3);

  return (
    <svg {...svgProps()}>
      {/* zemin */}
      <line x1={30} y1={250} x2={330} y2={250} stroke={C.dim} strokeWidth={1.5} />
      {/* Taban: blok + döner tabla */}
      {base && (
        <g opacity={base.op}>
          <rect x={120} y={214} width={120} height={36} rx={6} fill={base.fill} stroke={base.stroke} strokeWidth={1.8} />
          <ellipse cx={180} cy={210} rx={48} ry={10} fill={base.fill} stroke={base.stroke} strokeWidth={1.8} />
          <circle cx={180} cy={210} r={6} fill={base.stroke} />
          {stage === 'base' && (
            <>
              <path d="M150 196 a30 12 0 0 1 60 0" fill="none" stroke={C.acc} strokeWidth={1.6} strokeDasharray="3 3" />
              <path d="M210 196l4-5 2 6z" fill={C.acc} />
              <text x={180} y={186} textAnchor="middle" fontSize="10" fill={C.acc} fontFamily="var(--font-mono)">J1 dönüş</text>
            </>
          )}
        </g>
      )}
      {/* Omuz: dikey braket + alt kol (yukarı) */}
      {shoulder && (
        <g opacity={shoulder.op}>
          <circle cx={180} cy={200} r={11} fill={shoulder.fill} stroke={shoulder.stroke} strokeWidth={1.8} />
          <rect x={172} y={120} width={16} height={84} rx={6} fill={shoulder.fill} stroke={shoulder.stroke} strokeWidth={1.8} />
          {stage === 'shoulder' && <text x={150} y={165} textAnchor="end" fontSize="10" fill={C.acc} fontFamily="var(--font-mono)">J2 omuz</text>}
        </g>
      )}
      {/* Dirsek: eklem + ön kol (açılı) */}
      {elbow && (
        <g opacity={elbow.op}>
          <circle cx={180} cy={120} r={10} fill={elbow.fill} stroke={elbow.stroke} strokeWidth={1.8} />
          <rect x={176} y={70} width={76} height={15} rx={7} fill={elbow.fill} stroke={elbow.stroke} strokeWidth={1.8} transform="rotate(-32 180 78)" />
          {stage === 'elbow' && <text x={236} y={96} textAnchor="start" fontSize="10" fill={C.acc} fontFamily="var(--font-mono)">J3 dirsek</text>}
        </g>
      )}
      {/* Gripper: eklem + kıskaç */}
      {gripper && (
        <g opacity={gripper.op}>
          <g transform="translate(238,86)">
            <circle cx={0} cy={0} r={8} fill={gripper.fill} stroke={gripper.stroke} strokeWidth={1.8} />
            <path d="M6 -4 l16 -9 M6 4 l16 9" stroke={gripper.stroke} strokeWidth={3} strokeLinecap="round" />
            <path d="M22 -13 l8 -2 M22 13 l8 2" stroke={gripper.stroke} strokeWidth={3} strokeLinecap="round" />
          </g>
          {stage === 'gripper' && <text x={262} y={70} textAnchor="start" fontSize="10" fill={C.acc} fontFamily="var(--font-mono)">J4 gripper</text>}
        </g>
      )}

      {/* full görünümde eklem etiketleri */}
      {stage === 'full' && (
        <g fontFamily="var(--font-mono)" fontSize="9" fill={C.dim}>
          <text x={180} y={268} textAnchor="middle">J1</text>
          <text x={158} y={165} textAnchor="end">J2</text>
          <text x={150} y={100} textAnchor="end">J3</text>
          <text x={278} y={84} textAnchor="start">J4</text>
        </g>
      )}

      {/* rozet */}
      {badge && (
        <g transform="translate(300,40)">
          <circle cx={0} cy={0} r={22} fill={badge === 'check' ? 'color-mix(in srgb, var(--rx-success) 18%, transparent)' : C.accSoft}
            stroke={badge === 'check' ? C.ok : C.acc} strokeWidth={2} />
          {badge === 'check' ? (
            <path d="M-9 1l6 6L10 -7" stroke={C.ok} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ) : (
            <path d="M-6 -9l15 9-15 9z" fill={C.acc} />
          )}
        </g>
      )}
    </svg>
  );
}

/* --- Kablolama --- */
function ArtWiring() {
  const ch = [0, 1, 2, 3];
  const jointNames = ['J1 Taban', 'J2 Omuz', 'J3 Dirsek', 'J4 Gripper'];
  return (
    <svg {...svgProps()}>
      {/* PCA9685 */}
      <rect x={120} y={40} width={130} height={70} rx={8} fill={C.accSoft} stroke={C.acc} strokeWidth={1.6} />
      <text x={185} y={30} textAnchor="middle" fontSize="11" fill={C.acc} fontFamily="var(--font-mono)" fontWeight="700">PCA9685</text>
      {ch.map((c) => (
        <g key={c}>
          <circle cx={140 + c * 30} cy={52} r={3} fill={C.acc} />
          <text x={140 + c * 30} y={68} textAnchor="middle" fontSize="9" fill={C.text} fontFamily="var(--font-mono)">CH{c}</text>
          {/* servo etiketleri */}
          <line x1={140 + c * 30} y1={49} x2={140 + c * 30} y2={28} stroke={C.acc} strokeWidth={1.3} />
          <text x={140 + c * 30} y={22} textAnchor="middle" fontSize="7.5" fill={C.dim} fontFamily="var(--font-mono)">{jointNames[c].split(' ')[0]}</text>
        </g>
      ))}

      {/* Pico */}
      <rect x={40} y={150} width={50} height={90} rx={6} fill={C.surf} stroke={C.line} strokeWidth={1.5} />
      <text x={65} y={144} textAnchor="middle" fontSize="11" fill={C.text} fontFamily="var(--font-mono)">Pico</text>
      {/* I2C hatları */}
      <path d="M120 80 C100 80 90 165 90 170" stroke={C.acc} strokeWidth={1.6} fill="none" />
      <path d="M120 92 C104 92 90 182 90 185" stroke={C.acc} strokeWidth={1.6} fill="none" />
      <text x={150} y={150} fontSize="9" fill={C.dim} fontFamily="var(--font-mono)">SDA→GP4</text>
      <text x={150} y={166} fontSize="9" fill={C.dim} fontFamily="var(--font-mono)">SCL→GP5</text>

      {/* Harici güç */}
      <rect x={250} y={150} width={70} height={50} rx={6} fill={C.surf} stroke={C.ok} strokeWidth={1.6} />
      <text x={285} y={172} textAnchor="middle" fontSize="11" fill={C.ok} fontFamily="var(--font-mono)" fontWeight="700">5–6V</text>
      <text x={285} y={188} textAnchor="middle" fontSize="8.5" fill={C.dim} fontFamily="var(--font-mono)">harici güç</text>
      <path d="M250 165 C235 120 235 110 250 105" stroke={C.ok} strokeWidth={1.6} fill="none" />
      <text x={218} y={130} fontSize="9" fill={C.ok} fontFamily="var(--font-mono)">V+</text>

      {/* ortak GND */}
      <line x1={65} y1={240} x2={285} y2={240} stroke={C.dim} strokeWidth={1.4} strokeDasharray="3 3" />
      <text x={175} y={256} textAnchor="middle" fontSize="9" fill={C.dim} fontFamily="var(--font-mono)">ortak GND</text>
    </svg>
  );
}

/* --- Kart kahramanları --- */
function ArtRoboArmHero() {
  return (
    <svg viewBox="0 0 200 150" width="100%" height="100%" fill="none">
      <line x1={20} y1={132} x2={180} y2={132} stroke={C.dim} strokeWidth={1.5} />
      <rect x={70} y={108} width={70} height={24} rx={5} fill={C.surf} stroke={C.acc} strokeWidth={1.8} />
      <ellipse cx={105} cy={106} rx={30} ry={7} fill={C.surf} stroke={C.acc} strokeWidth={1.8} />
      <circle cx={105} cy={104} r={8} fill={C.accSoft} stroke={C.acc} strokeWidth={1.6} />
      <rect x={98} y={50} width={14} height={56} rx={6} fill={C.accSoft} stroke={C.acc} strokeWidth={1.8} />
      <circle cx={105} cy={50} r={8} fill={C.surf} stroke={C.acc} strokeWidth={1.6} />
      <rect x={102} y={18} width={56} height={13} rx={6} fill={C.accSoft} stroke={C.acc} strokeWidth={1.8} transform="rotate(-30 105 26)" />
      <g transform="translate(146,30)">
        <circle cx={0} cy={0} r={7} fill={C.surf} stroke={C.acc} strokeWidth={1.6} />
        <path d="M5 -4 l13 -7 M5 4 l13 7" stroke={C.acc} strokeWidth={3} strokeLinecap="round" />
      </g>
    </svg>
  );
}
function ArtRoboBotHero() {
  return (
    <svg viewBox="0 0 200 150" width="100%" height="100%" fill="none" opacity={0.6}>
      <rect x={55} y={50} width={90} height={50} rx={10} fill={C.surf} stroke={C.line} strokeWidth={1.8} />
      <circle cx={70} cy={108} r={18} fill={C.surf} stroke={C.line} strokeWidth={1.8} />
      <circle cx={130} cy={108} r={18} fill={C.surf} stroke={C.line} strokeWidth={1.8} />
      <circle cx={70} cy={108} r={7} fill={C.line} />
      <circle cx={130} cy={108} r={7} fill={C.line} />
      <rect x={88} y={36} width={24} height={14} rx={3} fill={C.line} />
    </svg>
  );
}
