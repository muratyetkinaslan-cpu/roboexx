import { useEffect, useRef, useState } from 'react';

export type LineKind = 'system' | 'output' | 'sent' | 'error' | 'info';

export interface SerialLine {
  id: number;
  kind: LineKind;
  text: string;
  ts: Date;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  connected: boolean;
  lines: SerialLine[];
  onSend: (cmd: string) => void;
  onClear: () => void;
}

export function SerialMonitor({ open, onToggle, connected, lines, onSend, onClear }: Props) {
  const [input, setInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, open, autoScroll]);

  const submit = () => {
    if (!input.trim() || !connected) return;
    onSend(input);
    setHistory((h) => [...h, input].slice(-50));
    setHistoryIdx(-1);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setInput(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const next = historyIdx + 1;
      if (next >= history.length) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(next);
        setInput(history[next]);
      }
    }
  };

  return (
    <section className="serial-monitor" data-open={open}>
      <header className="serial-header" onClick={(e) => {
        // Sadece header'a tıklandığında toggle (butonlara değil)
        if ((e.target as HTMLElement).closest('.serial-actions')) return;
        onToggle();
      }}>
        <button className="serial-toggle" aria-label={open ? 'Kapat' : 'Aç'}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="serial-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3.5 6l1.5 1.5-1.5 1.5M6.5 9.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Serial Monitor</span>
        </div>

        <div className="serial-meta">
          <span className={`serial-status ${connected ? 'is-connected' : ''}`}>
            <span className="serial-status-dot">
              {connected && <span className="serial-status-pulse" />}
            </span>
            {connected ? '115200 baud · Pico W' : 'Bağlı değil'}
          </span>
          <span className="serial-line-count">{lines.length} satır</span>
        </div>

        <div className="serial-actions">
          <button
            className={`serial-icon-btn ${autoScroll ? 'is-active' : ''}`}
            onClick={() => setAutoScroll((s) => !s)}
            title={autoScroll ? 'Otomatik kaydırma açık' : 'Otomatik kaydırma kapalı'}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v11M4 9l4 4 4-4M3 14h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="serial-icon-btn" onClick={onClear} title="Temizle">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M3 4.5h10M5 4.5V3a.5.5 0 01.5-.5h5a.5.5 0 01.5.5v1.5M6 7.5v5M10 7.5v5M4.5 4.5l.5 9a.5.5 0 00.5.5h5a.5.5 0 00.5-.5l.5-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {open && (
        <>
          <div className="serial-body" ref={bodyRef}>
            {lines.length === 0 ? (
              <div className="serial-empty">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity="0.3">
                  <rect x="3" y="6" width="26" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 12l3 3-3 3M13 18h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Henüz çıktı yok — bağlanınca print() çıktıları burada görünecek</span>
              </div>
            ) : (
              lines.map((line) => <SerialLineView key={line.id} line={line} />)
            )}
          </div>

          <div className="serial-input-row">
            <span className={`serial-prompt ${connected ? 'is-active' : ''}`}>&gt;&gt;&gt;</span>
            <input
              className="serial-input"
              type="text"
              placeholder={connected ? "Komut yaz, Enter ile gönder · Yukarı ok ile geçmiş" : 'Bağlandığında komut yazabilirsin'}
              value={input}
              disabled={!connected}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="serial-send-btn"
              onClick={submit}
              disabled={!connected || !input.trim()}
              title="Gönder (Enter)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M2 8l12-6-3 14-3-6-6-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SerialLineView({ line }: { line: SerialLine }) {
  const time = formatTime(line.ts);
  return (
    <div className={`serial-line serial-line-${line.kind}`}>
      <span className="serial-time">{time}</span>
      <span className="serial-tag">{tagFor(line.kind)}</span>
      <span className="serial-text">{line.text}</span>
    </div>
  );
}

function formatTime(d: Date): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => n.toString().padStart(2, '0')).join(':');
}

function tagFor(k: LineKind): string {
  switch (k) {
    case 'system': return 'SYS';
    case 'info':   return 'INF';
    case 'output': return 'OUT';
    case 'sent':   return '>>>';
    case 'error':  return 'ERR';
  }
}
