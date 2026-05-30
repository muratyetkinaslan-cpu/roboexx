import { useState } from 'react';
import type { Project } from '../projects/types';
import { formatRelativeTime } from '../projects/workspace';
import type { WorkspaceState } from '../projects/workspace';

interface Props {
  workspaceState: WorkspaceState;
  folderName: string | null;
  projects: Project[];
  currentId: string | null;
  loading: boolean;

  onPickFolder: () => void;
  onGrantPermission: () => void;
  onChangeFolder: () => void;
  onRefresh: () => void;

  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (project: Project) => void;
  onClose: () => void;

  /** Mevcut projeyi kaydet (eskiden topbar'daydı) */
  onSave: () => void;
  /** Açık projenin adını değiştir */
  onRename: (newName: string) => void;
  /** Kaydedilmemiş değişiklik var mı? */
  isDirty: boolean;
  /** Kaydetme animasyonu */
  saveFlash: boolean;
  /** Açık proje adı (yoksa 'Yeni Proje') */
  currentName: string | null;
  /** Açık projenin son kaydedilme zamanı (epoch ms), yoksa null */
  currentUpdatedAt: number | null;
}

export function ProjectsPanel(props: Props) {
  const { workspaceState, folderName, projects, currentId, loading } = props;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const handleDelete = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete === project.id) {
      props.onDelete(project);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(project.id);
      setTimeout(() => setConfirmDelete((x) => (x === project.id ? null : x)), 3000);
    }
  };

  return (
    <aside className="projects-panel">
      <header className="projects-panel-header">
        <div className="projects-panel-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 4a1.5 1.5 0 011.5-1.5h3l1.5 1.5H12.5A1.5 1.5 0 0114 5.5V12a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span>Çalışma Alanı</span>
          {workspaceState === 'ready' && (
            <span className="projects-count">{projects.length}</span>
          )}
        </div>
        <button className="projects-panel-close" onClick={props.onClose} title="Paneli kapat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {workspaceState === 'ready' && folderName && (
        <div className="folder-bar">
          <div className="folder-bar-info" title={folderName}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 4a1.5 1.5 0 011.5-1.5h3l1.5 1.5H12.5A1.5 1.5 0 0114 5.5V12a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="var(--rx-accent-soft)" />
            </svg>
            <span>{folderName}</span>
          </div>
          <div className="folder-bar-actions">
            <button className="folder-bar-btn" onClick={props.onRefresh} title="Yenile" disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ animation: loading ? 'spin 1s linear infinite' : undefined }}>
                <path d="M14 8a6 6 0 11-1.76-4.24M14 2v3.5h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="folder-bar-btn" onClick={props.onChangeFolder} title="Başka klasör">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1.5 1.5 0 011.5-1.5h3l1.5 1.5H12.5A1.5 1.5 0 0114 5.5V8M8 12.5h6M11 9.5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="projects-body">
        {workspaceState === 'unsupported' && (
          <SetupCard
            iconType="warning"
            title="Tarayıcı desteklemiyor"
            description="Bu tarayıcıda File System Access API yok. Chrome veya Edge kullanın — projeleriniz bilgisayarınızdaki bir klasöre kaydedilebilir."
          />
        )}

        {workspaceState === 'no-folder' && (
          <SetupCard
            iconType="folder"
            title="Klasör Seç"
            description="Projelerin bilgisayarındaki bir klasöre kaydedilecek. Bir klasör seç (ya da yeni oluştur) — sonraki seferlerde otomatik tanınacak."
            primary={{
              label: 'Klasör Seç',
              onClick: props.onPickFolder,
            }}
          />
        )}

        {workspaceState === 'permission-needed' && (
          <SetupCard
            iconType="lock"
            title="İzin Gerekli"
            description={`"${folderName}" klasörüne erişmek için izin vermeniz gerekiyor. Bu, tarayıcının her oturumda istediği bir güvenlik adımıdır.`}
            primary={{
              label: 'İzin Ver',
              onClick: props.onGrantPermission,
            }}
            secondary={{
              label: 'Başka klasör seç',
              onClick: props.onPickFolder,
            }}
          />
        )}

        {workspaceState === 'ready' && (
          <>
            {/* Açık proje — adı düzenlenebilir + kaydet */}
            <div className="projects-save-card">
              <div className="projects-save-info">
                <span className="projects-save-label">Açık Proje</span>
                {editingName ? (
                  <input
                    className="projects-save-name-input"
                    value={nameDraft}
                    autoFocus
                    maxLength={40}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => {
                      // Tek çıkış noktası: blur. Enter de buraya yönlendirilir,
                      // böylece onRename iki kez çağrılmaz.
                      const v = nameDraft.trim();
                      if (v) props.onRename(v);
                      setEditingName(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur(); // → onBlur halleder
                      } else if (e.key === 'Escape') {
                        setNameDraft('');   // boş → onBlur rename yapmaz
                        setEditingName(false);
                      }
                    }}
                  />
                ) : (
                  <span className="projects-save-name">
                    {props.currentName ?? 'Yeni Proje'}
                    {props.isDirty && (
                      <span className="projects-save-dirty" title="Kaydedilmemiş değişiklikler">•</span>
                    )}
                    {props.currentName && (
                      <button
                        className="projects-rename-btn"
                        title="Proje adını değiştir"
                        onClick={() => {
                          setNameDraft(props.currentName ?? '');
                          setEditingName(true);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </span>
                )}
                {/* Son kaydedilme zamanı */}
                {props.currentName && !editingName && (
                  <span className="projects-save-time">
                    {props.currentUpdatedAt
                      ? `Son kayıt: ${formatRelativeTime(props.currentUpdatedAt)}`
                      : 'Henüz kaydedilmedi'}
                  </span>
                )}
              </div>
              <button
                className={`projects-save-btn ${props.saveFlash ? 'is-flash' : ''}`}
                onClick={props.onSave}
                title="Açık projeyi kaydet (Ctrl+S)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 2.5h8L13.5 5v8.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M5 2.5v3.5h6V2.5M5 14v-4.5h6V14" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                Kaydet
              </button>
            </div>

            <button className="projects-new-btn" onClick={props.onNew}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Yeni Proje
            </button>

            <div className="projects-list">
              {loading ? (
                <div className="projects-empty">
                  <span>Yükleniyor…</span>
                </div>
              ) : projects.length === 0 ? (
                <div className="projects-empty">
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity="0.25">
                    <path d="M5 11a3 3 0 013-3h7l3 3h11a3 3 0 013 3v13a3 3 0 01-3 3H8a3 3 0 01-3-3V11z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  <span>Henüz proje yok</span>
                  <span className="projects-empty-hint">Yukarıdaki "Kaydet" ile ilkini oluştur</span>
                </div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className={`project-item ${p.id === currentId ? 'is-active' : ''}`}
                    onClick={() => props.onOpen(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        props.onOpen(p.id);
                      }
                    }}
                  >
                    <div className="project-item-icon">
                      {p.mode === 'blocks' ? (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                          <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                          <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                          <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="project-item-text">
                      <div className="project-item-name">{p.name}</div>
                      <div className="project-item-time">
                        {formatRelativeTime(p.updatedAt)}
                        {p.filename && <span className="project-item-filename"> · {p.filename}.json</span>}
                      </div>
                    </div>
                    <button
                      className={`project-item-delete ${confirmDelete === p.id ? 'is-confirm' : ''}`}
                      onClick={(e) => handleDelete(p, e)}
                      title={confirmDelete === p.id ? 'Tekrar tıkla, sil' : 'Sil'}
                    >
                      {confirmDelete === p.id ? (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l4 4 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M3 4.5h10M5 4.5V3a.5.5 0 01.5-.5h5a.5.5 0 01.5.5v1.5M6 7.5v5M10 7.5v5M4.5 4.5l.5 9a.5.5 0 00.5.5h5a.5.5 0 00.5-.5l.5-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// ====== SetupCard sub-component ======

interface SetupCardProps {
  iconType: 'folder' | 'lock' | 'warning';
  title: string;
  description: string;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}

function SetupCard({ iconType, title, description, primary, secondary }: SetupCardProps) {
  return (
    <div className="setup-card">
      <div className={`setup-icon setup-icon-${iconType}`}>
        {iconType === 'folder' && (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M4 9a3 3 0 013-3h6l3 3h12a3 3 0 013 3v12a3 3 0 01-3 3H7a3 3 0 01-3-3V9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M11 17h10M11 20h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {iconType === 'lock' && (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="6" y="14" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M10 14V9a6 6 0 0112 0v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="16" cy="20" r="1.5" fill="currentColor" />
          </svg>
        )}
        {iconType === 'warning' && (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M16 4l13 24H3L16 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M16 13v6M16 23v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <h3 className="setup-title">{title}</h3>
      <p className="setup-description">{description}</p>
      {primary && (
        <button className="setup-primary-btn" onClick={primary.onClick}>
          {primary.label}
        </button>
      )}
      {secondary && (
        <button className="setup-secondary-btn" onClick={secondary.onClick}>
          {secondary.label}
        </button>
      )}
    </div>
  );
}
