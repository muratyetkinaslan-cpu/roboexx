import { useState } from 'react';
import { KITS, type KitCodeFile } from '../library/kits';

/**
 * Eğitmen Kütüphanesi paneli — şifre korumalı hazır kod arşivi.
 *
 * Yalnızca öğretmen rolündeki kullanıcılara açılır ve içerik ancak
 * eğitmen şifresi (oturum başına bir kez) girildikten sonra görünür.
 * Kitlere göre (RoboArm / BerryBot / Tank) gruplanmış kod dosyaları:
 *  - 📋 Kopyala → panoya kopyalar
 *  - ➤ Ekrana Gönder → bağlı olunan öğrencinin ekranına yapıştırır
 *    (öğrenciye bağlı değilse eğitmenin kendi kod editörüne yükler)
 */

interface Props {
  /** Şifre bu oturumda doğrulanmış mı? */
  authorized: boolean;
  /** Şifre girilince çağrılır — doğruysa true döner */
  onAuthorize: (password: string) => boolean;
  /** Şu an bağlı olunan öğrencinin adı (yoksa null) */
  connectedStudentName: string | null;
  /** Kod dosyasını öğrencinin (veya kendi) ekranına gönder */
  onSendToScreen: (file: KitCodeFile) => void;
  onClose: () => void;
}

export function TeacherLibraryPanel({
  authorized,
  onAuthorize,
  connectedStudentName,
  onSendToScreen,
  onClose,
}: Props) {
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState(false);
  const [openKit, setOpenKit] = useState<string | null>(KITS[0]?.id ?? null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  const trySubmit = () => {
    if (onAuthorize(password)) {
      setPassword('');
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  const handleCopy = async (file: KitCodeFile) => {
    try {
      await navigator.clipboard.writeText(file.code);
    } catch {
      // Clipboard API yoksa (http vb.) eski yöntem
      try {
        const ta = document.createElement('textarea');
        ta.value = file.code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setCopiedId(file.id);
    window.setTimeout(() => setCopiedId((c) => (c === file.id ? null : c)), 1800);
  };

  const handleSend = (file: KitCodeFile) => {
    onSendToScreen(file);
    setSentId(file.id);
    window.setTimeout(() => setSentId((s) => (s === file.id ? null : s)), 1800);
  };

  return (
    <aside className="classroom-panel teacher-library-panel">
      <header className="classroom-panel-header">
        <div className="cp-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M5 10.5v5c0 1.5 3.1 3 7 3s7-1.5 7-3v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Eğitmen</span>
          {authorized && <span className="tl-lock-badge is-open" title="Şifre doğrulandı">🔓</span>}
          {!authorized && <span className="tl-lock-badge" title="Şifre korumalı">🔒</span>}
        </div>
        <button className="cp-close" onClick={onClose} title="Paneli kapat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {!authorized ? (
        <div className="tl-password-gate">
          <div className="tl-password-icon">🔒</div>
          <div className="tl-password-title">Eğitmen Şifresi</div>
          <div className="tl-password-desc">
            Hazır kod kütüphanesine erişmek için eğitmen şifresini gir.
          </div>
          <input
            type="password"
            className={`tl-password-input ${pwError ? 'is-error' : ''}`}
            placeholder="Şifre"
            value={password}
            autoFocus
            onChange={(e) => { setPassword(e.target.value); setPwError(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') trySubmit(); }}
          />
          {pwError && <div className="tl-password-error">Şifre yanlış — tekrar dene</div>}
          <button className="tl-password-btn" onClick={trySubmit} disabled={!password.trim()}>
            Kilidi Aç
          </button>
        </div>
      ) : (
        <>
          <div className="tl-target-row">
            {connectedStudentName ? (
              <>
                <span className="tl-target-dot is-connected" />
                <span>
                  Gönderim hedefi: <b>{connectedStudentName}</b>
                </span>
              </>
            ) : (
              <>
                <span className="tl-target-dot" />
                <span>Öğrenciye bağlı değilsin — kodlar kendi ekranına yüklenir</span>
              </>
            )}
          </div>

          <div className="tl-kit-list">
            {KITS.map((kit) => {
              const isOpen = openKit === kit.id;
              return (
                <div key={kit.id} className={`tl-kit ${isOpen ? 'is-open' : ''}`}>
                  <button
                    className="tl-kit-header"
                    onClick={() => setOpenKit(isOpen ? null : kit.id)}
                  >
                    <span className="tl-kit-emoji">{kit.emoji}</span>
                    <span className="tl-kit-name-wrap">
                      <span className="tl-kit-name">{kit.name}</span>
                      <span className="tl-kit-desc">{kit.desc}</span>
                    </span>
                    <span className="tl-kit-count">{kit.files.length}</span>
                    <svg
                      className="tl-kit-chevron"
                      width="12" height="12" viewBox="0 0 16 16" fill="none"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                    >
                      <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="tl-file-list">
                      {kit.files.map((file) => {
                        const expanded = openFile === file.id;
                        return (
                          <div key={file.id} className={`tl-file ${expanded ? 'is-expanded' : ''}`}>
                            <button
                              className="tl-file-header"
                              onClick={() => setOpenFile(expanded ? null : file.id)}
                              title={expanded ? 'Kodu gizle' : 'Kodu önizle'}
                            >
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M4 2h5l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                              </svg>
                              <span className="tl-file-name-wrap">
                                <span className="tl-file-name">{file.name}</span>
                                <span className="tl-file-desc">{file.desc}</span>
                              </span>
                            </button>

                            {expanded && (
                              <pre className="tl-file-code">{file.code}</pre>
                            )}

                            <div className="tl-file-actions">
                              <button
                                className={`tl-action-btn ${copiedId === file.id ? 'is-done' : ''}`}
                                onClick={() => handleCopy(file)}
                                title="Kodu panoya kopyala"
                              >
                                {copiedId === file.id ? '✓ Kopyalandı' : '📋 Kopyala'}
                              </button>
                              <button
                                className={`tl-action-btn tl-action-send ${sentId === file.id ? 'is-done' : ''}`}
                                onClick={() => handleSend(file)}
                                title={connectedStudentName
                                  ? `${connectedStudentName} ekranına gönder`
                                  : 'Kendi kod editörüne yükle'}
                              >
                                {sentId === file.id
                                  ? '✓ Gönderildi'
                                  : connectedStudentName
                                    ? `➤ ${connectedStudentName.split(' ')[0]} Ekranına`
                                    : '➤ Ekrana Yükle'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
