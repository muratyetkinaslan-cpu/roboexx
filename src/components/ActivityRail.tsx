import { useEffect, useState } from 'react';


interface RailItem {
  id: string;
  label: string;
  icon: JSX.Element;
  badge?: string | number;
}

// Sadece gerçekten kullanılan sekmeler. (Dersler/Görevler/Cihazlarım
// ve eski Yardım/Ayarlar kaldırıldı — boş/disable sekme yok.)
const topItems: RailItem[] = [
  {
    id: 'workspace',
    label: 'Çalışma Alanı',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 7l9-5 9 5-9 5-9-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M3 12l9 5 9-5M3 17l9 5 9-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projelerim',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'classroom',
    label: 'Sınıf',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M14.5 19c.4-2.5 2.4-4 4.8-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

interface Props {
  active: string;
  onSelect: (id: string) => void;
  /** Hangi item'lar şu an "aktif" gösterilecek (örn. projects panel açıkken 'projects') */
  highlighted?: string[];
  /** Dynamic badges */
  badges?: Record<string, string | number | undefined>;
  /** Kullanıcı profili — alt menüde baş harf + çıkış için */
  userProfile?: { name: string; role: 'teacher' | 'student' } | null;
  onLogout?: () => void;
  /** BLE cihaz adı — Pico'da advertising olarak yayınlanır */
  deviceName?: string;
  onDeviceNameChange?: (name: string) => void;
}

export function ActivityRail({
  active,
  onSelect,
  highlighted = [],
  badges = {},
  userProfile,
  onLogout,
  deviceName,
  onDeviceNameChange,
}: Props) {
  const isHighlighted = (id: string) => active === id || highlighted.includes(id);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <aside className="activity-rail">
      <div className="rail-group">
        {topItems.map((item) => (
          <RailButton
            key={item.id}
            item={{ ...item, badge: badges[item.id] ?? item.badge }}
            active={isHighlighted(item.id)}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>

      <div className="rail-spacer" />

      <div className="rail-group rail-group-bottom">
        {userProfile && (
          <ProfileButton
            userProfile={userProfile}
            open={profileOpen}
            onToggle={() => setProfileOpen((o) => !o)}
            onClose={() => setProfileOpen(false)}
            onLogout={() => {
              setProfileOpen(false);
              onLogout?.();
            }}
            deviceName={deviceName}
            onDeviceNameChange={onDeviceNameChange}
          />
        )}
      </div>
    </aside>
  );
}

function ProfileButton({
  userProfile,
  open,
  onToggle,
  onClose,
  onLogout,
  deviceName,
  onDeviceNameChange,
}: {
  userProfile: { name: string; role: 'teacher' | 'student' };
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onLogout: () => void;
  deviceName?: string;
  onDeviceNameChange?: (name: string) => void;
}) {
  const initials = userProfile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  const roleColor = userProfile.role === 'teacher' ? 'var(--rx-accent)' : '#10b981';
  const [localDeviceName, setLocalDeviceName] = useState(deviceName ?? '');

  useEffect(() => {
    setLocalDeviceName(deviceName ?? '');
  }, [deviceName]);

  const handleDeviceNameSave = () => {
    const trimmed = localDeviceName.trim();
    if (!trimmed) return;
    onDeviceNameChange?.(trimmed);
  };

  return (
    <>
      <button
        className={`rail-profile ${open ? 'is-open' : ''}`}
        onClick={onToggle}
        aria-label={userProfile.name}
        title={userProfile.name}
      >
        <span className="rail-profile-avatar" style={{ background: roleColor }}>{initials}</span>
      </button>
      {open && (
        <>
          <div className="rail-profile-overlay" onClick={onClose} />
          <div className="rail-profile-menu">
            <div className="rail-profile-info">
              <span className="rail-profile-avatar-lg" style={{ background: roleColor }}>{initials}</span>
              <div className="rail-profile-text">
                <div className="rail-profile-name">{userProfile.name}</div>
                <div className="rail-profile-role">
                  {userProfile.role === 'teacher' ? '🎓 Öğretmen' : '✏️ Öğrenci'}
                </div>
              </div>
            </div>

            {onDeviceNameChange && (
              <div className="rail-profile-device-section">
                <label className="rail-profile-device-label">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M5 4l6 8-3 2V2l3 2-6 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                  Bluetooth Cihaz Adı
                </label>
                <div className="rail-profile-device-input-wrap">
                  <input
                    type="text"
                    className="rail-profile-device-input"
                    value={localDeviceName}
                    onChange={(e) => setLocalDeviceName(e.target.value)}
                    onBlur={handleDeviceNameSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleDeviceNameSave();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    maxLength={20}
                    placeholder="RoboExx"
                  />
                </div>
                <div className="rail-profile-device-hint">
                  Modülleri Yükle ile Pico'ya yazılır
                </div>
              </div>
            )}

            <button className="rail-profile-logout" onClick={onLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Çıkış Yap
            </button>
          </div>
        </>
      )}
    </>
  );
}
function RailButton({ item, active, onClick }: { item: RailItem; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      className={`rail-button ${active ? 'is-active' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      aria-label={item.label}
    >
      {item.icon}
      {item.badge !== undefined && item.badge !== '' && (
        <span className="rail-badge">{item.badge}</span>
      )}
      {hover && <span className="rail-tooltip">{item.label}</span>}
    </button>
  );
}
