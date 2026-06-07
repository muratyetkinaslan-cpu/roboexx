import { useEffect, useState } from 'react';
import type { PresenceState, PresencePeer } from '../collab/livesync';

interface Props {
  presence: PresenceState;
  /** Şu an bağlı olduğum öğrencinin userId'si (sadece öğretmen için anlamlı) */
  currentWorkspaceUserId: string | null;
  onClose: () => void;
  /** Öğretmen bir öğrenciye tıklarsa */
  onConnectToStudent: (userId: string) => void;
  /** Öğretmen mevcut bağlantıdan çıkmak isterse */
  onDisconnectWorkspace: () => void;
  /** Öğrenci el kaldırma toggle */
  onToggleHand: () => void;
}

export function ClassroomPanel({
  presence,
  currentWorkspaceUserId,
  onClose,
  onConnectToStudent,
  onDisconnectWorkspace,
  onToggleHand,
}: Props) {
  // Aktivite zamanları için periyodik tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  const isTeacher = presence.myRole === 'teacher';

  // Görünür peer'leri belirle
  //  - Öğretmen: HERKES
  //  - Öğrenci: Sadece öğretmenler (diğer öğrencileri görmez)
  const visiblePeers = presence.peers.filter((p) => isTeacher ? true : p.role === 'teacher');

  // Sırala: el kaldıranlar üstte, sonra aktiviteye göre
  const sortedPeers = [...visiblePeers].sort((a, b) => {
    if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
    return (b.lastActivityAt || 0) - (a.lastActivityAt || 0);
  });

  const raisedCount = presence.peers.filter((p) => p.role === 'student' && p.handRaised).length;

  // Öğretmen için: kim hangi öğrenciye bağlı? (Diğer öğretmenler dahil)
  const connectionsByStudent = new Map<string, string>(); // studentUserId -> teacherName
  presence.peers.forEach((p) => {
    if (p.role === 'teacher' && p.connectedTo) {
      connectionsByStudent.set(p.connectedTo, p.name);
    }
  });
  // Kendim öğretmensem, kendi bağlantımı da ekle
  if (isTeacher && presence.myConnectedTo) {
    connectionsByStudent.set(presence.myConnectedTo, presence.myName);
  }

  return (
    <aside className="classroom-panel">
      <header className="classroom-panel-header">
        <div className="cp-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.7" />
            <path d="M14.5 19c.4-2.5 2.4-4 4.8-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Sınıf</span>
          <span className="cp-count">{visiblePeers.length + 1}</span>
          {isTeacher && raisedCount > 0 && (
            <span className="cp-hand-badge" title={`${raisedCount} el kaldıran var`}>
              <span role="img" aria-label="El">✋</span>
              {raisedCount}
            </span>
          )}
        </div>
        <button className="cp-close" onClick={onClose} title="Paneli kapat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Öğretmen için: şu an bağlı durumu */}
      {isTeacher && currentWorkspaceUserId && (
        <div className="cp-current-connection">
          <div className="cp-current-label">Şu an bağlısın</div>
          <div className="cp-current-name">
            {presence.peers.find((p) => p.userId === currentWorkspaceUserId)?.name ?? 'Öğrenci'}
          </div>
          <button className="cp-disconnect-btn" onClick={onDisconnectWorkspace}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Bağlantıyı Kes
          </button>
        </div>
      )}

      {/* Öğretmen için: kimseye bağlı değil hint */}
      {isTeacher && !currentWorkspaceUserId && visiblePeers.some((p) => p.role === 'student') && (
        <div className="cp-hint-row">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 5v3M8 11v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Bir öğrenciye tıkla, workspace'ine geç
        </div>
      )}

      {/* Öğrenci için: el kaldır butonu */}
      {!isTeacher && (
        <div className="hand-raise-section">
          <button
            className={`hand-raise-btn ${presence.myHandRaised ? 'is-raised' : ''}`}
            onClick={onToggleHand}
          >
            <span className="hand-emoji" role="img" aria-label="El">✋</span>
            {presence.myHandRaised ? 'Eli İndir' : 'El Kaldır'}
          </button>
          {presence.myHandRaised && (
            <div className="hand-raise-hint">Öğretmen yardım istediğini görüyor.</div>
          )}
        </div>
      )}

      <div className="cp-list">
        {/* Kendim — her zaman üstte */}
        <PeerRow
          peer={null}
          name={presence.myName + ' (Sen)'}
          role={presence.myRole}
          clientIdForColor={presence.myClientId}
          isSelf
          isClickable={false}
          isCurrentTarget={false}
          handRaised={presence.myHandRaised}
          connectedByTeacher={connectionsByStudent.get(presence.myUserId) ?? null}
          onClick={() => {}}
        />

        {sortedPeers.map((p) => (
          <PeerRow
            key={p.clientId}
            peer={p}
            name={p.name}
            role={p.role}
            clientIdForColor={p.clientId}
            isSelf={false}
            isClickable={isTeacher && p.role === 'student'}
            isCurrentTarget={isTeacher && p.userId === currentWorkspaceUserId}
            handRaised={p.handRaised}
            connectedByTeacher={p.role === 'student' ? (connectionsByStudent.get(p.userId) ?? null) : null}
            onClick={() => {
              if (!isTeacher || p.role !== 'student') return;
              onConnectToStudent(p.userId);
            }}
          />
        ))}

        {sortedPeers.length === 0 && (
          <div className="cp-alone">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" opacity="0.3">
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{isTeacher ? 'Henüz öğrenci yok' : 'Bağlı öğretmen yok'}</span>
            <span className="cp-alone-hint">
              {isTeacher ? 'Öğrenciler katıldığında burada görünür' : 'Öğretmen geldiğinde burada görünecek'}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

interface PeerRowProps {
  peer: PresencePeer | null;
  name: string;
  role: 'teacher' | 'student';
  clientIdForColor: number;
  isSelf: boolean;
  isClickable: boolean;
  isCurrentTarget: boolean;
  handRaised: boolean;
  /** Bu öğrenci hangi öğretmenle bağlı (varsa) */
  connectedByTeacher: string | null;
  onClick: () => void;
}

function PeerRow({
  peer,
  name,
  role,
  clientIdForColor,
  isSelf,
  isClickable,
  isCurrentTarget,
  handRaised,
  connectedByTeacher,
  onClick,
}: PeerRowProps) {
  const color = role === 'teacher' ? 'var(--rx-accent)' : colorForPeer(clientIdForColor);
  const initials = getInitials(name);
  const activity = peer ? formatActivity(peer.lastActivityAt) : { label: 'Aktif', isActive: true };

  return (
    <div
      className={[
        'peer-row',
        isSelf ? 'is-self' : '',
        handRaised ? 'is-hand-raised' : '',
        isClickable ? 'is-clickable' : '',
        isCurrentTarget ? 'is-current-target' : '',
      ].filter(Boolean).join(' ')}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      title={isClickable ? `${name} workspace'ine bağlan` : undefined}
    >
      <div className="peer-avatar" style={{ background: color }}>
        {role === 'teacher' && (
          <span className="peer-role-icon" title="Öğretmen">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 9l10-5 10 5-10 5L2 9z" />
            </svg>
          </span>
        )}
        {initials}
      </div>
      <div className="peer-info">
        <div className="peer-name">
          {name}
          {role === 'teacher' && !isSelf && <span className="peer-teacher-tag">Öğretmen</span>}
          {isCurrentTarget && <span className="peer-connected-tag">Bağlı</span>}
        </div>
        <div className={`peer-activity ${activity.isActive ? 'is-active' : ''}`}>
          {activity.isActive && <span className="peer-activity-pulse" />}
          {connectedByTeacher && !isSelf && role === 'student'
            ? `${connectedByTeacher} bağlı`
            : activity.label}
        </div>
      </div>
      {handRaised && (
        <div className="peer-hand-up" title="El kaldırdı, yardım istiyor">
          <span role="img" aria-label="El kaldırdı">✋</span>
        </div>
      )}
      {isClickable && !isCurrentTarget && (
        <div className="peer-connect-arrow" title="Bağlan">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

// Helpers
function colorForPeer(clientId: number): string {
  const hue = (clientId * 137.508) % 360;
  return `hsl(${hue}, 65%, 52%)`;
}
function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}
function formatActivity(lastActivityAt: number): { label: string; isActive: boolean } {
  if (!lastActivityAt) return { label: 'Bekliyor', isActive: false };
  const elapsed = Date.now() - lastActivityAt;
  if (elapsed < 5000) return { label: 'Aktif', isActive: true };
  const sec = Math.floor(elapsed / 1000);
  if (sec < 60) return { label: `${sec} sn önce`, isActive: false };
  const min = Math.floor(sec / 60);
  if (min < 60) return { label: `${min} dk önce`, isActive: false };
  return { label: `${Math.floor(min / 60)} sa önce`, isActive: false };
}
