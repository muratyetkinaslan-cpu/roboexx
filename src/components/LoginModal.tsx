import { useState } from 'react';

export type UserRole = 'teacher' | 'student';

export interface UserProfile {
  /** Kalıcı kullanıcı kimliği — workspace odası adı için (`workspace-{userId}`) */
  userId: string;
  role: UserRole;
  name: string;
}

interface Props {
  onSubmit: (profile: UserProfile) => void;
}

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function LoginModal({ onSubmit }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const trimmedName = name.trim();

  const submit = () => {
    if (!role || !trimmedName) return;
    onSubmit({ userId: generateUserId(), role, name: trimmedName });
  };

  return (
    <div className="login-modal-backdrop">
      <div className="login-modal">
        <div className="login-modal-brand">
          <div className="login-modal-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="login-modal-title">RoboExx</div>
            <div className="login-modal-subtitle">Pico W · Blok Tabanlı Programlama</div>
          </div>
        </div>

        {step === 1 && (
          <div className="login-step">
            <h2 className="login-step-title">Sen kimsin?</h2>
            <p className="login-step-desc">Rolünü seç. Sınıf yönetimi için kullanılır.</p>
            <div className="role-grid">
              <button
                className={`role-card ${role === 'teacher' ? 'is-selected' : ''}`}
                onClick={() => { setRole('teacher'); window.setTimeout(() => setStep(2), 200); }}
              >
                <div className="role-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path d="M2 9l10-5 10 5-10 5L2 9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="22" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="role-name">Öğretmen</div>
                <div className="role-desc">Sınıfı yönetir, istediği öğrencinin workspace'ine bağlanır</div>
              </button>

              <button
                className={`role-card ${role === 'student' ? 'is-selected' : ''}`}
                onClick={() => { setRole('student'); window.setTimeout(() => setStep(2), 200); }}
              >
                <div className="role-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="role-name">Öğrenci</div>
                <div className="role-desc">Kendi workspace'inde çalışır, yardım için el kaldırabilir</div>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="login-step">
            <button className="login-back" onClick={() => setStep(1)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M9 3L4 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Geri
            </button>
            <h2 className="login-step-title">{role === 'teacher' ? 'Öğretmen' : 'Öğrenci'} olarak giriş</h2>
            <p className="login-step-desc">Adını yaz, sınıfta böyle gözükeceksin.</p>
            <div className="name-input-wrap">
              <input
                type="text"
                className="name-input"
                placeholder={role === 'teacher' ? 'Örn: Ahmet Hoca' : 'Örn: Ali Yılmaz'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && trimmedName) submit(); }}
                autoFocus
                maxLength={30}
              />
              <button className="name-submit" disabled={!trimmedName} onClick={submit}>
                Başla
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
