import { useEffect, useRef, useState } from 'react';
import { themeList } from '../themes/registry';
import type { ThemeId } from '../themes/types';

interface Props {
  current: ThemeId;
  onSelect: (id: ThemeId) => void;
}

export function ThemeMenu({ current, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = themeList.find((t) => t.id === current)!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="theme-menu" ref={ref}>
      <button className="theme-trigger" onClick={() => setOpen((o) => !o)} title="Tema değiştir">
        <span className="theme-emoji">{active.emoji}</span>
        <span className="theme-name">{active.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="theme-dropdown">
          <div className="theme-dropdown-header">Tema</div>
          {themeList.map((theme) => (
            <button
              key={theme.id}
              className={`theme-option ${theme.id === current ? 'is-active' : ''}`}
              onClick={() => {
                onSelect(theme.id);
                setOpen(false);
              }}
            >
              <span className="theme-emoji">{theme.emoji}</span>
              <span className="theme-option-info">
                <span className="theme-option-name">{theme.name}</span>
                <span className="theme-option-desc">{theme.description}</span>
              </span>
              <span
                className="theme-option-swatch"
                style={{
                  background: `linear-gradient(135deg, ${theme.blockly.palette.io[0]} 0%, ${theme.blockly.palette.logic[0]} 100%)`,
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
