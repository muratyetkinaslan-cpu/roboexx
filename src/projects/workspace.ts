import type { Project } from './types';
import { idbDelete, idbGet, idbSet } from './idb';

const HANDLE_KEY = 'workspaceDirHandle';
const LAST_OPENED_KEY = 'roboexx.projects.lastId';

export type WorkspaceState =
  | 'unsupported'        // tarayıcı File System Access API'yi desteklemiyor
  | 'no-folder'          // hiç klasör seçilmemiş
  | 'permission-needed'  // klasör seçili ama izin verilmemiş/iptal edilmiş
  | 'ready';             // hazır, listeleme/kayıt yapılabilir

/**
 * Proje workspace'i — File System Access API ile gerçek klasör erişimi.
 *
 * Akış:
 *  1. tryRestore() — açılışta IndexedDB'den önceki handle'ı geri yükle
 *  2. pickFolder() — kullanıcı klasör seçer (showDirectoryPicker)
 *  3. ensurePermission() — izin yenileme (browser session başında gerekli)
 *  4. list/save/delete — projelerle çalış
 *
 * Dosya formatı: <name>.json (sanitize edilmiş)
 * Çakışma: ilk kayıtta " (2)", " (3)" suffix'i eklenir
 */
export class WorkspaceFs {
  state: WorkspaceState = 'no-folder';
  folderName: string | null = null;
  // FileSystemDirectoryHandle. TS lib'de yok, any.
  private dirHandle: any = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /** Açılışta IndexedDB'den klasör handle'ını geri yükle */
  async tryRestore(): Promise<WorkspaceState> {
    if (!this.isSupported()) {
      this.state = 'unsupported';
      return this.state;
    }
    try {
      const handle = await idbGet<any>(HANDLE_KEY);
      if (!handle) {
        this.state = 'no-folder';
        return this.state;
      }
      this.dirHandle = handle;
      this.folderName = handle.name;

      // İzin halen geçerli mi? (tarayıcı oturumlar arası izni unutabilir)
      const granted = await this.queryPermission();
      this.state = granted ? 'ready' : 'permission-needed';
    } catch (e) {
      console.warn('Workspace restore failed:', e);
      this.state = 'no-folder';
    }
    return this.state;
  }

  /** Klasör seçim dialogu aç (kullanıcı etkileşimi gerekir) */
  async pickFolder(): Promise<WorkspaceState> {
    if (!this.isSupported()) {
      this.state = 'unsupported';
      return this.state;
    }
    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        id: 'roboexx-workspace',
        startIn: 'documents',
      });
      this.dirHandle = handle;
      this.folderName = handle.name;
      await idbSet(HANDLE_KEY, handle);
      this.state = 'ready';
    } catch (e: unknown) {
      // Kullanıcı iptal etti — state aynen kalır
      const err = e as { name?: string };
      if (err?.name !== 'AbortError') {
        console.warn('pickFolder failed:', e);
      }
    }
    return this.state;
  }

  /** Mevcut handle için izin yenile */
  async ensurePermission(): Promise<boolean> {
    if (!this.dirHandle) return false;
    if (await this.queryPermission()) {
      this.state = 'ready';
      return true;
    }
    if (await this.requestPermission()) {
      this.state = 'ready';
      return true;
    }
    this.state = 'permission-needed';
    return false;
  }

  private async queryPermission(): Promise<boolean> {
    if (!this.dirHandle) return false;
    try {
      const result = await this.dirHandle.queryPermission({ mode: 'readwrite' });
      return result === 'granted';
    } catch {
      return false;
    }
  }

  private async requestPermission(): Promise<boolean> {
    if (!this.dirHandle) return false;
    try {
      const result = await this.dirHandle.requestPermission({ mode: 'readwrite' });
      return result === 'granted';
    } catch {
      return false;
    }
  }

  /** Klasörü unut (kullanıcı başka klasör seçmek isterse) */
  async forgetFolder(): Promise<void> {
    await idbDelete(HANDLE_KEY);
    this.dirHandle = null;
    this.folderName = null;
    this.state = 'no-folder';
  }

  /** Klasördeki tüm .json dosyalarını proje olarak yükle */
  async list(): Promise<Project[]> {
    if (this.state !== 'ready' || !this.dirHandle) return [];
    const projects: Project[] = [];
    try {
      for await (const [name, handle] of this.dirHandle.entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
        try {
          const file = await handle.getFile();
          const text = await file.text();
          const proj = JSON.parse(text);
          if (proj && typeof proj.id === 'string' && typeof proj.name === 'string') {
            // Filename alanı dosyada yoksa dosya adından çıkar
            if (!proj.filename) {
              proj.filename = name.replace(/\.json$/, '');
            }
            projects.push(proj as Project);
          }
        } catch (e) {
          console.warn(`Skipping bad project file ${name}:`, e);
        }
      }
    } catch (e) {
      console.error('Workspace list failed:', e);
    }
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    return projects;
  }

  /** Projeyi klasöre yaz. İlk kayıtta benzersiz dosya adı üretir. */
  async save(project: Project): Promise<Project> {
    if (this.state !== 'ready' || !this.dirHandle) {
      throw new Error('Workspace klasörü seçili değil');
    }

    let filename = project.filename;
    if (!filename) {
      // İlk kayıt: benzersiz dosya adı üret
      const baseName = sanitizeFilename(project.name);
      filename = baseName;
      let n = 2;
      while (await this.fileExists(filename + '.json')) {
        filename = `${baseName} (${n++})`;
      }
    }

    const updatedProject: Project = { ...project, filename };

    const fileHandle = await this.dirHandle.getFileHandle(filename + '.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(updatedProject, null, 2));
    await writable.close();

    return updatedProject;
  }

  async delete(project: Project): Promise<void> {
    if (this.state !== 'ready' || !this.dirHandle) {
      throw new Error('Workspace klasörü seçili değil');
    }
    const filename = (project.filename || sanitizeFilename(project.name)) + '.json';
    try {
      await this.dirHandle.removeEntry(filename);
    } catch (e) {
      console.warn('Delete failed (file may not exist):', e);
    }
  }

  private async fileExists(filename: string): Promise<boolean> {
    if (!this.dirHandle) return false;
    try {
      await this.dirHandle.getFileHandle(filename, { create: false });
      return true;
    } catch {
      return false;
    }
  }
}

// ====== Helpers ======

export function generateProjectId(): string {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

export function getLastOpenedId(): string | null {
  return localStorage.getItem(LAST_OPENED_KEY);
}

export function setLastOpenedId(id: string | null): void {
  if (id === null) localStorage.removeItem(LAST_OPENED_KEY);
  else localStorage.setItem(LAST_OPENED_KEY, id);
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'az önce';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} saat önce`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} gün önce`;
  const d = new Date(ts);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' });
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();
  return cleaned || 'untitled';
}

// Singleton — uygulama boyunca tek workspace
export const workspaceFs = new WorkspaceFs();
