export type AppMode = 'blocks' | 'code';

interface Props {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

export function ModeTabs({ mode, onChange }: Props) {
  return (
    <div className="mode-tabs">
      <button
        className={`mode-tab ${mode === 'blocks' ? 'is-active' : ''}`}
        onClick={() => onChange('blocks')}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Bloklar
      </button>
      <button
        className={`mode-tab ${mode === 'code' ? 'is-active' : ''}`}
        onClick={() => onChange('code')}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Kod
      </button>
    </div>
  );
}
