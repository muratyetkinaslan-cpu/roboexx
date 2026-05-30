import type { PresenceState } from '../collab/livesync';

interface Props {
  presence: PresenceState;
  /** Şu an bağlı olduğum workspace'in userId'si (öğretmen için) */
  currentWorkspaceUserId: string | null;
  onDisconnect: () => void;
  /** Sınıf panelini aç (sağdaki öğrenci listesi) */
  onOpenClassroom: () => void;
}

export function LiveShareBar({ presence, currentWorkspaceUserId, onDisconnect, onOpenClassroom }: Props) {
  const isTeacher = presence.myRole === 'teacher';
  const connectedStudent = currentWorkspaceUserId
    ? presence.peers.find((p) => p.userId === currentWorkspaceUserId)
    : null;

  // Eğer öğrenciysem, kim benim workspace'ime bağlı?
  const teacherConnectedToMe = !isTeacher
    ? presence.peers.find((p) => p.role === 'teacher' && p.connectedTo === presence.myUserId)
    : null;

  return (
    <div className={`live-share-bar role-${presence.myRole}`}>
      <div className="lsb-left">
        <span className="lsb-dot" data-connected={presence.connected ? 'true' : 'false'} />
        <span className="lsb-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8" cy="8" r="2.5" fill="currentColor" />
          </svg>
          {isTeacher ? 'Öğretmen' : 'Öğrenci'}
        </span>
        <span className="lsb-divider" />
        <span className="lsb-myname">{presence.myName}</span>
        <span className="lsb-divider" />

        {/* Öğretmen — bir öğrenciye bağlı */}
        {isTeacher && connectedStudent && (
          <span className="lsb-status lsb-connected">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" fill="currentColor" />
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
            </svg>
            <strong>{connectedStudent.name}</strong> workspace'inde
          </span>
        )}

        {/* Öğretmen — kimseye bağlı değil */}
        {isTeacher && !connectedStudent && (
          <span className="lsb-status lsb-idle">Bir öğrenciye bağlı değilsin</span>
        )}

        {/* Öğrenci — öğretmen bağlı mı? */}
        {!isTeacher && teacherConnectedToMe && (
          <span className="lsb-status lsb-watching">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="8" cy="8" r="2" fill="currentColor" />
            </svg>
            <strong>{teacherConnectedToMe.name}</strong> seni izliyor
          </span>
        )}

        {/* Öğrenci — kimse izlemiyor */}
        {!isTeacher && !teacherConnectedToMe && (
          <span className="lsb-status">Sınıfta · {presence.totalCount} kişi</span>
        )}
      </div>

      <div className="lsb-right">
        {isTeacher && connectedStudent && (
          <button className="lsb-leave" onClick={onDisconnect} title="Bağlantıyı kes">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Bağlantıyı Kes
          </button>
        )}
        <button className="lsb-copy lsb-classroom-btn" onClick={onOpenClassroom}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M14.5 19c.4-2.5 2.4-4 4.8-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Sınıf ({presence.totalCount})
        </button>
      </div>
    </div>
  );
}
