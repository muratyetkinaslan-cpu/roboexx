import { useEffect, useRef, useState } from 'react';
import { ASSEMBLY_KITS, getKit, type AssemblyStep, type ArmModelStep } from '../robotarm/assembly';

interface Props {
  onClose: () => void;
  /** Son adımda “Simülasyonu Aç” — rehberi kapatıp Robot Kol panelini açar */
  onOpenSimulation: () => void;
}

const SIM_URL = '/robot/montaj.html';

type View = { kind: 'select' } | { kind: 'steps'; kitId: string; index: number };

export function AssemblyGuide({ onClose, onOpenSimulation }: Props) {
  const [view, setView] = useState<View>({ kind: 'select' });

  const kit = view.kind === 'steps' ? getKit(view.kitId) : undefined;
  const total = kit?.steps.length ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (view.kind !== 'steps') return;
      if (e.key === 'ArrowRight') setView((v) => (v.kind === 'steps' && v.index < total - 1 ? { ...v, index: v.index + 1 } : v));
      if (e.key === 'ArrowLeft') setView((v) => (v.kind === 'steps' && v.index > 0 ? { ...v, index: v.index - 1 } : v));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, total, onClose]);

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
            {kit && (<><span className="guide-sep">/</span><span className="guide-kit-name">{kit.name}</span></>)}
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
          kit && (
            <StepView
              kit={kit}
              index={view.index}
              onJump={(i) => setView({ kind: 'steps', kitId: view.kitId, index: i })}
              onPrev={() => setView((v) => (v.kind === 'steps' && v.index > 0 ? { ...v, index: v.index - 1 } : v))}
              onNext={() => setView((v) => (v.kind === 'steps' && v.index < total - 1 ? { ...v, index: v.index + 1 } : v))}
              onOpenSimulation={onOpenSimulation}
            />
          )
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Kit seçim
   ============================================================ */
function KitSelect({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="guide-select">
      <p className="guide-select-lead">
        Bir kit seç — gerçek 3D model üzerinde adım adım montaj başlar. Vidalanacak yerler kırmızı işaretlenir.
      </p>
      <div className="guide-kit-grid">
        {ASSEMBLY_KITS.map((k) => (
          <button
            key={k.id}
            className={`guide-kit-card ${k.comingSoon ? 'is-soon' : ''}`}
            onClick={() => !k.comingSoon && onPick(k.id)}
            disabled={k.comingSoon}
          >
            <div className="guide-kit-art">{k.id === 'roboarm' ? <ArtRoboArmHero /> : <ArtRoboBotHero />}</div>
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
   Adım görünümü — 3D baskın, az yazı (çocuk dostu)
   ============================================================ */
function StepView({
  kit, index, onJump, onPrev, onNext, onOpenSimulation,
}: {
  kit: { steps: AssemblyStep[] };
  index: number;
  onJump: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenSimulation: () => void;
}) {
  const steps = kit.steps;
  const step = steps[index];
  const total = steps.length;
  const isLast = index === total - 1;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [simReady, setSimReady] = useState(false);

  const postStep = (model: ArmModelStep) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'rx:assembly', step: model }, '*');
  };

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const d = ev.data;
      if (d && typeof d === 'object' && d.source === 'roboexx-arm' && d.type === 'rx:ready') setSimReady(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (simReady) postStep(step.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.model, simReady]);

  return (
    <div className="guide-kid">
      {/* BÜYÜK 3D model */}
      <div className="guide-kid-stage">
        <iframe
          ref={iframeRef}
          src={SIM_URL}
          title="RoboARM 3D montaj"
          className="guide-kid-iframe"
          onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: 'rx:ping' }, '*')}
        />
        {!simReady && <div className="guide-sim-loading"><span className="guide-spinner" />3D model yükleniyor…</div>}

        {/* üstte küçük adım rozeti + başlık */}
        <div className="guide-kid-titlebar">
          <span className="guide-kid-num">{index + 1}/{total}</span>
          <span className="guide-kid-title">{step.title}</span>
        </div>

        {/* geri / ileri büyük oklar */}
        <button className="guide-kid-arrow left" onClick={onPrev} disabled={index === 0} aria-label="Geri">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {isLast ? (
          <button className="guide-kid-arrow right play" onClick={onOpenSimulation} aria-label="Simülasyonu aç">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M7 5l12 7-12 7V5z" fill="currentColor" /></svg>
          </button>
        ) : (
          <button className="guide-kid-arrow right" onClick={onNext} aria-label="İleri">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>

      {/* altta: tek satır talimat + nokta göstergeleri */}
      <div className="guide-kid-foot">
        <p className="guide-kid-sub">{step.subtitle}</p>
        <div className="guide-kid-dots">
          {steps.map((s, i) => (
            <button
              key={i}
              className={`guide-kid-dot ${i === index ? 'is-active' : i < index ? 'is-done' : ''}`}
              onClick={() => onJump(i)}
              title={s.short}
            />
          ))}
        </div>
        {isLast && (
          <button className="btn btn-primary guide-kid-simbtn" onClick={onOpenSimulation}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor" /></svg>
            Simülasyonu Aç ve Dene
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Kart küçük görselleri (yalnızca seçim ekranı)
   ============================================================ */
const C = {
  line: 'var(--rx-text-dim)', acc: 'var(--rx-accent)',
  accSoft: 'var(--rx-accent-soft)', surf: 'var(--rx-surface2)',
};
function ArtRoboArmHero() {
  return (
    <svg viewBox="0 0 200 150" width="100%" height="100%" fill="none">
      <line x1={20} y1={132} x2={180} y2={132} stroke={C.line} strokeWidth={1.5} />
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
