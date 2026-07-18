import { useEffect, useRef } from 'react';
import type { UploadProgress } from '../serial/types';

interface Props {
  progress: UploadProgress | null;
  onDismiss: () => void;
}

export function UploadOverlay({ progress, onDismiss }: Props) {
  // onDismiss her render'da yeni referans olabiliyor (App'te inline arrow fn).
  // useEffect dependency'si olsaydı timer her render'da reset olurdu.
  // Bu yüzden ref'te tutup effect'in dependency'sinden çıkarıyoruz.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Başarılı durumda 2.5sn sonra otomatik kapan
  useEffect(() => {
    if (progress?.phase === 'success') {
      const t = setTimeout(() => dismissRef.current(), 2500);
      return () => clearTimeout(t);
    }
  }, [progress?.phase]);

  if (!progress) return null;

  const { phase, pct, bytesSent, bytesTotal, speedKBs, error } = progress;

  return (
    <div className="upload-overlay-backdrop" onClick={phase !== 'uploading' ? onDismiss : undefined}>
      <div className={`upload-overlay-card upload-${phase}`} onClick={(e) => e.stopPropagation()}>
        {phase === 'uploading' && (
          <>
            <div className="upload-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4v18M9 11l7-7 7 7M6 26h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="upload-title">Yükleniyor</div>
            <div className="upload-subtitle">main.py · karta yazılıyor</div>
            <div className="upload-progress">
              <div className="upload-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="upload-stats">
              <span className="upload-stat-pct">{Math.round(pct)}%</span>
              <span className="upload-stat-sep">·</span>
              <span>{formatBytes(bytesSent)} / {formatBytes(bytesTotal)}</span>
              <span className="upload-stat-sep">·</span>
              <span>{speedKBs.toFixed(1)} KB/s</span>
            </div>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="upload-icon upload-icon-success">
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" />
                <path d="M10 16l4 4 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="upload-title">Başarılı</div>
            <div className="upload-subtitle">
              {formatBytes(bytesTotal)} yazıldı · {speedKBs.toFixed(1)} KB/s
            </div>
            <div className="upload-hint">Kart yeniden başlatılıyor…</div>
            <button className="upload-dismiss-btn" onClick={onDismiss}>Tamam</button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="upload-icon upload-icon-error">
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" />
                <path d="M11 11l10 10M21 11L11 21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <div className="upload-title">Yükleme başarısız</div>
            <div className="upload-error">{error || 'Bilinmeyen hata'}</div>
            <button className="upload-dismiss-btn" onClick={onDismiss}>Tamam</button>
          </>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
