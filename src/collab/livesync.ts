import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { UserRole } from '../components/LoginModal';

/**
 * RoboExx Canlı Paylaşım — Multi-Room Mimarisi (Faz 3)
 *
 * Mimari:
 *   - PRESENCE ROOM (sabit "classroom-presence"): Herkes (öğretmen+öğrenci)
 *     bağlı. Sadece awareness. Kim online, rol, el kaldırma, öğretmenin
 *     hangi öğrenciye bağlı olduğu burada görünür.
 *   - WORKSPACE ROOMS ("workspace-{userId}"): Her öğrencinin kendi odası.
 *     Öğrenci hep kendi odasında. Öğretmen geçici olarak bağlanır/ayrılır.
 *
 * Bu sayede:
 *   - Öğrenciler birbirini GÖRMEZ (farklı workspace odalarındalar)
 *   - Öğretmen istediği öğrenciye seçerek bağlanır
 *   - Cursor sync sadece aynı workspace'te olan peer'ler arasında
 */

const PRESENCE_ROOM = 'classroom-presence';

export function workspaceRoomIdFor(userId: string): string {
  return `workspace-${userId}`;
}

// ====== Types ======

export interface PresencePeer {
  clientId: number;
  userId: string;
  name: string;
  role: UserRole;
  joinedAt: number;
  handRaised: boolean;
  lastActivityAt: number;
  /** Öğretmenin şu an hangi öğrencinin workspace'ine bağlı olduğu (userId) */
  connectedTo: string | null;
}

export interface PresenceState {
  connected: boolean;
  myClientId: number;
  myUserId: string;
  myName: string;
  myRole: UserRole;
  myHandRaised: boolean;
  myConnectedTo: string | null;
  peers: PresencePeer[];
  /** Toplam kişi sayısı (kendisi dahil) */
  totalCount: number;
}

export interface WorkspacePeer {
  clientId: number;
  userId: string;
  name: string;
  role: UserRole;
  cursor: { x: number; y: number } | null;
}

export interface WorkspaceState {
  connected: boolean;
  synced: boolean;
  myClientId: number;
  peers: WorkspacePeer[];
}

export interface RoomConnection {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  roomId: string;
  dispose: () => void;
}

// ====== Server URL ======

/**
 * Production'da (Vercel deploy) → VITE_COLLAB_URL env var (Render gibi external WS)
 * Localhost HTTPS → wss://aynı-host:5173/collab (Vite proxy)
 * Localhost HTTP → ws://aynı-host:1234
 */
function defaultServerUrl(): string {
  // Production env var (build sırasında inject edilir)
  const envUrl = import.meta.env.VITE_COLLAB_URL;
  if (envUrl && typeof envUrl === 'string') {
    return envUrl;
  }
  if (typeof window === 'undefined') return 'ws://localhost:1234';
  const host = window.location.hostname || 'localhost';
  // Localhost dev için path-based detection
  if (window.location.protocol === 'https:') {
    const port = window.location.port || '5173';
    return `wss://${host}:${port}/collab`;
  }
  return `ws://${host}:1234`;
}

const SERVER_URL =
  (typeof window !== 'undefined' && (window as any).__ROBOEXX_COLLAB_URL__) ||
  defaultServerUrl();

// ====== Presence ======

interface ConnectOpts {
  userId: string;
  name: string;
  role: UserRole;
}

export function connectPresenceRoom(opts: ConnectOpts): RoomConnection {
  console.log('[LiveShare] connectPresenceRoom başladı, SERVER_URL:', SERVER_URL,
    'oda:', PRESENCE_ROOM, 'kullanıcı:', opts.name, '(' + opts.role + ')', 'userId:', opts.userId);
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(SERVER_URL, PRESENCE_ROOM, ydoc);

  // TEK ATIMDA tüm state'i set et — setLocalStateField çağrıları arasında
  // başka peer'in awareness change handler'ı patlayabiliyor, kısmi state ile
  // (userId boş) propagate olabiliyor. setLocalState atomik.
  provider.awareness.setLocalState({
    userId: opts.userId,
    name: opts.name,
    role: opts.role,
    joinedAt: Date.now(),
    handRaised: false,
    lastActivityAt: 0,
    connectedTo: null,
  });

  provider.on('status', (e: any) => {
    console.log('[LiveShare] WebSocket status:', e.status, '| URL:', SERVER_URL + '/' + PRESENCE_ROOM);
  });
  provider.awareness.on('change', () => {
    const states = provider.awareness.getStates();
    const peerList = Array.from(states.values()).map((s: any) => `${s.name}(${s.role}) uid=${s.userId?.slice(0, 8) || 'YOK'}`).join(', ');
    console.log('[LiveShare] presence awareness | peer sayısı:', states.size, '| peer\'ler:', peerList);
  });

  return {
    ydoc, provider, roomId: PRESENCE_ROOM,
    dispose: () => {
      console.log('[LiveShare] presence room dispose');
      try { provider.destroy(); } catch {}
      try { ydoc.destroy(); } catch {}
    },
  };
}

export function watchPresence(
  presence: RoomConnection,
  onChange: (state: PresenceState) => void
): () => void {
  let rafScheduled = false;

  const compute = () => {
    rafScheduled = false;
    const states = presence.provider.awareness.getStates();
    const myClientId = presence.ydoc.clientID;
    const myState = states.get(myClientId) || {};
    const myUserId = (myState.userId as string) || '';

    // userId → en güncel peer eşlemesi.
    // Aynı kullanıcı birden çok sekme/pencere açtığında her sekme ayrı
    // clientId alır; aynı userId listede defalarca görünmesin diye
    // userId'ye göre TEKİLLEŞTİR — en son aktif olan oturumu tut.
    const byUserId = new Map<string, PresencePeer>();

    states.forEach((state, clientId) => {
      if (clientId === myClientId) return;
      const userId = (state.userId as string) || '';
      // userId boş ise awareness daha tam senkronlanmamış, peer'i atla.
      if (!userId) {
        console.log('[LiveShare] Peer atlandı — userId boş, clientId:', clientId);
        return;
      }
      // Kendi userId'mizle aynıysa (başka sekmede ben) — listeye ekleme,
      // sınıfta kendimi peer olarak görmem.
      if (myUserId && userId === myUserId) return;

      const peer: PresencePeer = {
        clientId,
        userId,
        name: (state.name as string) || 'Peer',
        role: ((state.role as UserRole) === 'teacher' ? 'teacher' : 'student'),
        joinedAt: (state.joinedAt as number) || 0,
        handRaised: !!state.handRaised,
        lastActivityAt: (state.lastActivityAt as number) || 0,
        connectedTo: (state.connectedTo as string | null) || null,
      };

      const existing = byUserId.get(userId);
      if (!existing) {
        byUserId.set(userId, peer);
      } else {
        // Aynı userId zaten var — daha güncel olanı (son aktivite ya da
        // daha yeni katılım) tut. Böylece eski/ölü sekme gizlenir.
        const existingScore = Math.max(existing.lastActivityAt, existing.joinedAt);
        const peerScore = Math.max(peer.lastActivityAt, peer.joinedAt);
        if (peerScore >= existingScore) {
          // El kaldırma durumunu kaybetmemek için birleştir
          peer.handRaised = peer.handRaised || existing.handRaised;
          byUserId.set(userId, peer);
        }
      }
    });

    const peers: PresencePeer[] = Array.from(byUserId.values());

    onChange({
      connected: presence.provider.wsconnected,
      myClientId,
      myUserId,
      myName: (myState.name as string) || '...',
      myRole: ((myState.role as UserRole) === 'teacher' ? 'teacher' : 'student'),
      myHandRaised: !!myState.handRaised,
      myConnectedTo: (myState.connectedTo as string | null) || null,
      peers,
      // totalCount artık tekil kullanıcı sayısı: ben + farklı peer'ler
      totalCount: peers.length + (myUserId ? 1 : 0),
    });
  };

  const schedule = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(compute);
  };

  presence.provider.awareness.on('change', schedule);
  presence.provider.on('status', schedule);
  setTimeout(compute, 50);

  return () => {
    presence.provider.awareness.off('change', schedule);
    presence.provider.off('status', schedule);
  };
}

export function setHandRaised(presence: RoomConnection, raised: boolean): void {
  console.log('[LiveShare] setHandRaised', raised, 'kullanıcı:',
    presence.provider.awareness.getLocalState()?.name);
  presence.provider.awareness.setLocalStateField('handRaised', raised);
  // Hemen kontrol et
  setTimeout(() => {
    const s = presence.provider.awareness.getLocalState();
    console.log('[LiveShare] setHandRaised sonrası state:', s?.handRaised);
  }, 50);
}

export function markActivity(presence: RoomConnection): void {
  presence.provider.awareness.setLocalStateField('lastActivityAt', Date.now());
}

export function setConnectedTo(presence: RoomConnection, targetUserId: string | null): void {
  presence.provider.awareness.setLocalStateField('connectedTo', targetUserId);
}

// ====== Workspace ======

export function connectWorkspaceRoom(
  targetUserId: string,
  opts: ConnectOpts
): RoomConnection {
  console.log('[LiveShare] connectWorkspaceRoom başladı, hedef:', targetUserId);
  if (!targetUserId) {
    console.error('[LiveShare] connectWorkspaceRoom — targetUserId BOŞ! Bu olmamalıydı.');
  }
  const ydoc = new Y.Doc();
  const roomId = workspaceRoomIdFor(targetUserId);
  const provider = new WebsocketProvider(SERVER_URL, roomId, ydoc);

  // Atomik state set — kısmi propagate önler
  provider.awareness.setLocalState({
    userId: opts.userId,
    name: opts.name,
    role: opts.role,
    cursor: null,
  });

  return {
    ydoc, provider, roomId,
    dispose: () => {
      try { provider.destroy(); } catch {}
      try { ydoc.destroy(); } catch {}
    },
  };
}

export function watchWorkspace(
  ws: RoomConnection,
  onChange: (state: WorkspaceState) => void
): () => void {
  let synced = false;
  let rafScheduled = false;

  const compute = () => {
    rafScheduled = false;
    const states = ws.provider.awareness.getStates();
    const myClientId = ws.ydoc.clientID;

    const peers: WorkspacePeer[] = [];
    states.forEach((state, clientId) => {
      if (clientId === myClientId) return;
      peers.push({
        clientId,
        userId: (state.userId as string) || '',
        name: (state.name as string) || 'Peer',
        role: ((state.role as UserRole) === 'teacher' ? 'teacher' : 'student'),
        cursor: (state.cursor as { x: number; y: number } | null) ?? null,
      });
    });

    onChange({
      connected: ws.provider.wsconnected,
      synced,
      myClientId,
      peers,
    });
  };

  const schedule = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(compute);
  };

  const onSync = (s: boolean) => { synced = s; schedule(); };

  ws.provider.awareness.on('change', schedule);
  ws.provider.on('status', schedule);
  ws.provider.on('sync', onSync);
  setTimeout(compute, 50);

  return () => {
    ws.provider.awareness.off('change', schedule);
    ws.provider.off('status', schedule);
    ws.provider.off('sync', onSync);
  };
}

export function createCursorBroadcaster(ws: RoomConnection) {
  let lastSent = 0;
  let pending: { x: number; y: number } | null = null;
  let timer: number | null = null;

  const send = () => {
    if (!pending) return;
    try {
      ws.provider.awareness.setLocalStateField('cursor', pending);
    } catch {}
    lastSent = Date.now();
    pending = null;
    timer = null;
  };

  return {
    setCursor: (x: number, y: number) => {
      pending = { x, y };
      const now = Date.now();
      const elapsed = now - lastSent;
      if (elapsed >= 50) send();
      else if (timer === null) timer = window.setTimeout(send, 50 - elapsed);
    },
    dispose: () => {
      if (timer !== null) window.clearTimeout(timer);
      try { ws.provider.awareness.setLocalStateField('cursor', null); } catch {}
    },
  };
}
