interface Props {
  code: string;
  onClose: () => void;
}

export function CodePreview({ code, onClose }: Props) {
  const lineCount = code ? code.split('\n').length : 0;
  return (
    <div className="code-preview">
      <div className="code-preview-header">
        <div className="code-preview-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="code-preview-label">MicroPython</span>
          <span className="code-preview-badge">canlı</span>
        </div>
        <div className="code-preview-actions">
          {lineCount > 0 && <span className="code-preview-stats">{lineCount} satır</span>}
          <button
            className="code-preview-close"
            onClick={onClose}
            title="Kod önizlemesini gizle"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <pre className="code-preview-body">
        {code || '# Bloklarınız MicroPython koduna çevrilecek\n# Sol panelden bir blok sürükleyerek başla'}
      </pre>
    </div>
  );
}
