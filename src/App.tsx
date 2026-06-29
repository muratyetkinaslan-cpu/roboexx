import { useEffect, useRef, useState } from 'react';
import { ActivityRail } from './components/ActivityRail';
import { BlocklyWorkspace, type BlocklyWorkspaceHandle } from './components/BlocklyWorkspace';
import { ClassroomPanel } from './components/ClassroomPanel';
import { CodePreview } from './components/CodePreview';
import { CodeEditor } from './components/CodeEditor';
import { LoginModal, type UserProfile } from './components/LoginModal';
import { ProjectsPanel } from './components/ProjectsPanel';
import { SerialMonitor, type SerialLine, type LineKind } from './components/SerialMonitor';
import { Toolbar } from './components/Toolbar';
import { UploadOverlay } from './components/UploadOverlay';
import { RobotArmPanel, type RobotArmHandle } from './components/RobotArmPanel';
import { RoboBotPanel } from './components/RoboBotPanel';
import { AssemblyGuide } from './components/AssemblyGuide';
import { parseTelemetry } from './robotarm/config';
import { SensorDashboard } from './components/SensorDashboard';
import { FirmwareUploader } from './components/FirmwareUploader';
import { ArduinoUploader } from './components/ArduinoUploader';
import type { CodeTarget } from './blockly/codegen';
import type { AppMode } from './components/ModeTabs';
import { applyThemeVars, defaultThemeId, themes } from './themes/registry';
import type { ThemeId } from './themes/types';
import { serialBridge } from './serial/bridge';
import { bleBridge, BLEBridge } from './bluetooth/ble-bridge';
import type { BridgeState, PortInfo, UploadProgress } from './serial/types';
import type { Project } from './projects/types';
import {
  generateProjectId,
  getLastOpenedId,
  setLastOpenedId,
  workspaceFs,
  type WorkspaceState as WorkspaceFsState,
} from './projects/workspace';
import {
  connectPresenceRoom,
  connectWorkspaceRoom,
  createCursorBroadcaster,
  markActivity,
  setConnectedTo,
  setHandRaised,
  watchPresence,
  watchWorkspace,
  type PresenceState,
  type RoomConnection,
  type WorkspaceState,
} from './collab/livesync';
import { createBlocklyYjsBridge, type BlocklyYjsBridge } from './collab/blockly-sync';

const THEME_KEY = 'roboexx.theme';
const MONITOR_KEY = 'roboexx.monitorOpen';
const PANEL_KEY = 'roboexx.activePanel';
const PREVIEW_KEY = 'roboexx.previewOpen';
const USER_KEY = 'roboexx.user';

type ActivePanel = 'projects' | 'classroom' | null;

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && (p.role === 'teacher' || p.role === 'student') && typeof p.name === 'string' && p.name.trim()) {
      // Eski profiller userId içermiyordu — yoksa şimdi üret ve kaydet
      let userId = typeof p.userId === 'string' && p.userId ? p.userId : '';
      if (!userId) {
        userId = generateUserId();
        const upgraded: UserProfile = { userId, role: p.role, name: p.name };
        localStorage.setItem(USER_KEY, JSON.stringify(upgraded));
        return upgraded;
      }
      return { userId, role: p.role, name: p.name };
    }
  } catch {}
  return null;
}

function saveUserProfile(p: UserProfile): void {
  localStorage.setItem(USER_KEY, JSON.stringify(p));
}

let lineId = 1;
const nextId = () => lineId++;

export default function App() {
  // ====== Kullanıcı profili (login modal'dan) ======
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => loadUserProfile());

  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(THEME_KEY) as ThemeId | null;
    return saved && themes[saved] ? saved : defaultThemeId;
  });
  const theme = themes[themeId];
  /** Açık/koyu tema arası geçiş yapar. */
  const toggleLight = () => {
    setThemeId((cur) =>
      cur === 'galaxy-orange-light' ? 'galaxy-orange' : 'galaxy-orange-light'
    );
  };

  const [mode, setMode] = useState<AppMode>('blocks');
  const [activeRail, setActiveRail] = useState('workspace');

  const [generatedCode, setGeneratedCode] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [codeWasEdited, setCodeWasEdited] = useState(false);

  const [workspaceFsState, setWorkspaceFsState] = useState<WorkspaceFsState>('no-folder');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  // Son kaydedilme zamanını "X dk önce" olarak canlı tutmak için dakikalık tick
  const [savedTick, setSavedTick] = useState(0);

  // Topbar'daki "son kaydedilme" metni — savedTick her dakika tetikler,
  // currentProject.updatedAt değişince de güncellenir.
  const lastSavedText = (() => {
    void savedTick; // canlı yenileme bağımlılığı
    if (!currentProject) return null;
    const diff = Date.now() - currentProject.updatedAt;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'az önce kaydedildi';
    if (min < 60) return `${min} dk önce kaydedildi`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} saat önce kaydedildi`;
    return 'bugünden önce kaydedildi';
  })();
  // Aynı tarayıcıda tek aktif sekme — başka sekme açılınca bu sekme pasifleşir.
  // Pasif sekme presence'a bağlanmaz, sınıfta tek kişi görünür.
  const [tabActive, setTabActive] = useState(true);
  const [activePanel, setActivePanel] = useState<ActivePanel>(() => {
    const saved = localStorage.getItem(PANEL_KEY);
    if (saved === 'projects' || saved === 'classroom') return saved;
    return null;
  });

  const [bridgeState, setBridgeState] = useState<BridgeState>('disconnected');
  const [portInfo, setPortInfo] = useState<PortInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  /** "Modülleri Yükle" basınca açılan kit seçim popup'ı görünür mü? */

  /** Bağlantı modu: USB (Web Serial) veya BLE (Web Bluetooth) */
  const [connectionMode, setConnectionMode] = useState<'usb' | 'ble'>(() => {
    return (localStorage.getItem('roboexx.connection-mode') as 'usb' | 'ble') || 'usb';
  });
  /**
   * BLE cihaz adı — Pico'da advertising olarak yayınlanır. Modülleri Yükle
   * butonuna basınca device_name.txt dosyası olarak Pico'ya yazılır.
   * Default: kullanıcı adı + "'in RoboExx" (örn. "Ahmet'in RoboExx")
   */
  const [deviceName, setDeviceName] = useState<string>(() => {
    const stored = localStorage.getItem('roboexx.device-name');
    if (stored) return stored;
    return 'RoboExx-Pico'; // userProfile yüklendikten sonra useEffect'te güncellenir
  });

  // userProfile yüklü ve deviceName default ise kullanıcı adından türet
  useEffect(() => {
    if (userProfile && !localStorage.getItem('roboexx.device-name')) {
      // İlk kelime + "'in RoboExx" (örn. "Ahmet'in RoboExx")
      const firstName = userProfile.name.trim().split(/\s+/)[0];
      const newName = `${firstName}'in RoboExx`.slice(0, 26);
      setDeviceName(newName);
      localStorage.setItem('roboexx.device-name', newName);
    }
  }, [userProfile?.userId]);

  // Serial monitör varsayılan KAPALI — sadece kullanıcı tıklayınca açılır.
  // localStorage'da açık bırakıldıysa hatırlanır.
  const [monitorOpen, setMonitorOpen] = useState(() => localStorage.getItem(MONITOR_KEY) === 'true');
  const [previewOpen, setPreviewOpen] = useState(() => localStorage.getItem(PREVIEW_KEY) !== 'false');

  // ====== Robot Kol simülasyonu ======
  const [robotArmOpen, setRobotArmOpen] = useState(false);
  const [robotArmFullscreen, setRobotArmFullscreen] = useState(false);
  const robotArmRef = useRef<RobotArmHandle>(null);
  // ====== Montaj rehberi (doc) ======
  const [guideOpen, setGuideOpen] = useState(false);
  // ====== RoboBOT (diferansiyel sürüş) simülasyonu ======
  const [roboBotOpen, setRoboBotOpen] = useState(false);
  const [roboBotFullscreen, setRoboBotFullscreen] = useState(false);
  // Tam ekran açılıp kapanınca blok alanı gizlenir/görünür → Blockly'yi yeniden boyutlandır.
  useEffect(() => {
    const id = setTimeout(() => blocklyRef.current?.resize(), 80);
    return () => clearTimeout(id);
  }, [roboBotFullscreen, robotArmFullscreen]);
  // Donanım galerisi — varsayılan AÇIK, kullanıcı kapatabilir
  const [lines, setLines] = useState<SerialLine[]>([]);

  const textBufferRef = useRef('');
  const blocklyRef = useRef<BlocklyWorkspaceHandle>(null);
  const initializedRef = useRef(false);
  const isLoadingRef = useRef(false);

  // ====== Live Share — Multi-room ======
  // Presence: classroom-presence odası — herkes burada bağlı, kim online göster
  // Workspace: workspace-{userId} odası — öğrenci her zaman kendi odasında,
  //            öğretmen seçtiği öğrencinin odasına geçer
  const [presenceState, setPresenceState] = useState<PresenceState>({
    connected: false,
    myClientId: 0,
    myUserId: '',
    myName: '',
    myRole: 'student',
    myHandRaised: false,
    myConnectedTo: null,
    peers: [],
    totalCount: 0,
  });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    connected: false,
    synced: false,
    myClientId: 0,
    peers: [],
  });
  const [currentWorkspaceUserId, setCurrentWorkspaceUserId] = useState<string | null>(null);

  const presenceRoomRef = useRef<RoomConnection | null>(null);
  const presenceUnsubRef = useRef<(() => void) | null>(null);
  const workspaceRoomRef = useRef<RoomConnection | null>(null);
  const workspaceUnsubRef = useRef<(() => void) | null>(null);
  const workspaceBridgeRef = useRef<BlocklyYjsBridge | null>(null);
  const cursorBroadcasterRef = useRef<ReturnType<typeof createCursorBroadcaster> | null>(null);
  /** Aktivite throttle — her edit'te değil, en fazla 1sn'de bir broadcast et */
  const lastActivityBroadcastRef = useRef(0);

  useEffect(() => {
    applyThemeVars(theme);
    localStorage.setItem(THEME_KEY, themeId);
  }, [theme, themeId]);

  // "Son kaydedilme" metnini canlı tutmak için dakikalık tick
  useEffect(() => {
    const t = setInterval(() => setSavedTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    localStorage.setItem(MONITOR_KEY, String(monitorOpen));
  }, [monitorOpen]);

  useEffect(() => {
    if (activePanel) localStorage.setItem(PANEL_KEY, activePanel);
    else localStorage.removeItem(PANEL_KEY);
  }, [activePanel]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_KEY, String(previewOpen));
  }, [previewOpen]);

  useEffect(() => {
    serialBridge.onStateChange = setBridgeState;
    serialBridge.onConnect = (info) => {
      setPortInfo(info);
      addLine('system', `Bağlandı: ${info.friendlyName}`);
    };
    serialBridge.onDisconnect = () => {
      setPortInfo(null);
      addLine('system', 'Bağlantı kesildi');
    };
    serialBridge.onText = (text) => {
      textBufferRef.current += text;
      const parts = textBufferRef.current.split(/\r?\n/);
      textBufferRef.current = parts.pop() || '';
      for (const part of parts) {
        if (part.length === 0) continue;
        // Robot kol servo telemetrisi (@SV kod id açı) → simülasyona yansıt, monitöre yazma
        const tel = parseTelemetry(part);
        if (tel) {
          robotArmRef.current?.applyServoTelemetry(tel.code, tel.id, tel.angle);
          continue;
        }
        addLine(classifyLine(part), part);
      }
    };
    serialBridge.onLog = (kind, message) => addLine(kind, message);

    // BLE Bridge — aynı state callback'lerine bağla
    bleBridge.onStateChange = setBridgeState;
    bleBridge.onLog = (kind, message) => addLine(kind, message);

    addLine('system', 'RoboExx · Pico W bağlantısı bekleniyor');
    serialBridge.tryAutoConnect().then((info) => {
      if (info) addLine('info', 'Önceden tanınan cihaz otomatik bağlandı');
    });

    if ('serial' in navigator) {
      const onConnect = () => {
        if (serialBridge.state === 'disconnected') {
          serialBridge.tryAutoConnect().then((info) => {
            if (info) addLine('info', 'Cihaz takıldı, otomatik bağlandı');
          });
        }
      };
      (navigator as unknown as { serial: { addEventListener: (e: string, cb: () => void) => void } })
        .serial.addEventListener('connect', onConnect);
    }
  }, []);

  // ====================================================================
  // KLAVYE KONTROLÜ — basılı tuşları Pico'ya canlı gönder (BLE veya USB).
  // Pico'daki roboexx kütüphanesi state'i günceller; tus_basili("w") /
  // tus_basildi("w") fonksiyonlarıyla kullanıcı kodu okur.
  // Popup: PressedKeysOverlay component'i basılı tuşları gösterir.
  // ====================================================================
  const [pressedKeysDisplay, setPressedKeysDisplay] = useState<string>('');
  const [gamepadActive, setGamepadActive] = useState<boolean>(false);
  const [sensorPanelOpen, setSensorPanelOpen] = useState<boolean>(false);
  const [firmwareUploaderOpen, setFirmwareUploaderOpen] = useState<boolean>(false);
  const [arduinoUploaderOpen, setArduinoUploaderOpen] = useState<boolean>(false);
  const [codeTarget, setCodeTarget] = useState<CodeTarget>(() => {
    const saved = localStorage.getItem('roboexx.code-target');
    return saved === 'arduino' ? 'arduino' : 'micropython';
  });

  // Hedef değişince kodu yeniden üret (MicroPython ↔ Arduino)
  const handleTargetChange = (t: CodeTarget) => {
    setCodeTarget(t);
    try { localStorage.setItem('roboexx.code-target', t); } catch { /* yoksay */ }
    // Bloklar aynı; sadece üretilen kod dilini değiştir
    setTimeout(() => blocklyRef.current?.regenerate(), 0);
  };

  useEffect(() => {
    // 'connected' → normal kontrol; 'busy' → USB'de canlı "Çalıştır" sürüyor,
    // tuşlar programın sys.stdin'ine gitmeli (BLE'de busy kısa sürer, sorunsuz).
    if (bridgeState !== 'connected' && bridgeState !== 'busy') {
      setPressedKeysDisplay('');
      return;
    }

    const pressed = new Set<string>();
    const normalize = (e: KeyboardEvent): string | null => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        return null;
      }
      const k = e.key;
      if (k.length === 1) return k.toLowerCase();
      if (k === 'ArrowUp') return '\x11';
      if (k === 'ArrowDown') return '\x12';
      if (k === 'ArrowLeft') return '\x13';
      if (k === 'ArrowRight') return '\x14';
      if (k === ' ') return ' ';
      if (k === 'Enter') return '\n';
      if (k === 'Escape') return '\x1b';
      return null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = normalize(e);
      if (k === null) return;
      if (['w','a','s','d',' ','\x11','\x12','\x13','\x14'].includes(k)) {
        e.preventDefault();
      }
      pressed.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = normalize(e);
      if (k === null) return;
      pressed.delete(k);
    };
    const onBlur = () => pressed.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // 50ms'de bir basılı tuşları gönder + popup state'i güncelle
    // GAMEPAD STATE — bağlı gamepad var mı (popup için)
    let gamepadConnected = false;
    let gamepadName = '';
    const onGamepadConnected = (e: GamepadEvent) => {
      gamepadConnected = true;
      gamepadName = e.gamepad.id;
      addLine('system', `🎮 Gamepad bağlandı: ${e.gamepad.id}`);
    };
    const onGamepadDisconnected = () => {
      gamepadConnected = false;
      gamepadName = '';
      addLine('system', '🎮 Gamepad bağlantısı kesildi');
    };
    window.addEventListener('gamepadconnected', onGamepadConnected as EventListener);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected as EventListener);

    /**
     * Gamepad düğmeleri kendi özel karakterlerine eşlenir (klavyeyle çakışmaz).
     * Bloklardaki "🎮 Gamepad düğme [X] basılı mı?" bu karakterleri seçer.
     * Karakter aralığı \x20-\x3F (control char range, ASCII metinle çakışmaz).
     *
     *   \x20 A          \x28 D-pad ↑      \x30 Sol stick ↑
     *   \x21 B          \x29 D-pad ↓      \x31 Sol stick ↓
     *   \x22 X          \x2A D-pad ←      \x32 Sol stick ←
     *   \x23 Y          \x2B D-pad →      \x33 Sol stick →
     *   \x24 LB         \x2C Start        \x34 Sağ stick ↑
     *   \x25 RB         \x2D Select       \x35 Sağ stick ↓
     *   \x26 LT         \x2E L3 (stick basma)  \x36 Sağ stick ←
     *   \x27 RT         \x2F R3                \x37 Sağ stick →
     */
    const readGamepadKeys = (): string[] => {
      const gps = navigator.getGamepads();
      const out: string[] = [];
      for (const gp of gps) {
        if (!gp) continue;
        const DEAD = 0.35;
        // Yüz butonları
        if (gp.buttons[0]?.pressed) out.push('\x20'); // A
        if (gp.buttons[1]?.pressed) out.push('\x21'); // B
        if (gp.buttons[2]?.pressed) out.push('\x22'); // X
        if (gp.buttons[3]?.pressed) out.push('\x23'); // Y
        // Bumper / Trigger
        if (gp.buttons[4]?.pressed) out.push('\x24'); // LB
        if (gp.buttons[5]?.pressed) out.push('\x25'); // RB
        if (gp.buttons[6]?.pressed) out.push('\x26'); // LT
        if (gp.buttons[7]?.pressed) out.push('\x27'); // RT
        // D-pad
        if (gp.buttons[12]?.pressed) out.push('\x28'); // ↑
        if (gp.buttons[13]?.pressed) out.push('\x29'); // ↓
        if (gp.buttons[14]?.pressed) out.push('\x2A'); // ←
        if (gp.buttons[15]?.pressed) out.push('\x2B'); // →
        // Start / Select
        if (gp.buttons[9]?.pressed) out.push('\x2C');  // Start
        if (gp.buttons[8]?.pressed) out.push('\x2D');  // Select
        // L3 / R3 (stick basma)
        if (gp.buttons[10]?.pressed) out.push('\x2E');
        if (gp.buttons[11]?.pressed) out.push('\x2F');
        // Sol stick (axes 0, 1) → yön karakterleri
        const lx = gp.axes[0] ?? 0;
        const ly = gp.axes[1] ?? 0;
        if (ly < -DEAD) out.push('\x30');
        if (ly > DEAD)  out.push('\x31');
        if (lx < -DEAD) out.push('\x32');
        if (lx > DEAD)  out.push('\x33');
        // Sağ stick (axes 2, 3)
        const rx = gp.axes[2] ?? 0;
        const ry = gp.axes[3] ?? 0;
        if (ry < -DEAD) out.push('\x34');
        if (ry > DEAD)  out.push('\x35');
        if (rx < -DEAD) out.push('\x36');
        if (rx > DEAD)  out.push('\x37');
        break;
      }
      return out;
    };

    const interval = setInterval(() => {
      // Klavye basılıları + gamepad basılıları birleştir
      const allPressed = new Set(pressed);
      const gpKeys = readGamepadKeys();
      for (const k of gpKeys) allPressed.add(k);

      const keys = Array.from(allPressed).join('');
      // Popup için okunabilir gösterim üret
      const display = Array.from(allPressed).map((k) => {
        // Klavye özel karakterleri
        if (k === '\x11') return '↑';
        if (k === '\x12') return '↓';
        if (k === '\x13') return '←';
        if (k === '\x14') return '→';
        if (k === ' ') return '␣';
        if (k === '\n') return '↵';
        if (k === '\x1b') return 'Esc';
        // Gamepad karakterleri
        if (k === '\x20') return 'A';
        if (k === '\x21') return 'B';
        if (k === '\x22') return 'X';
        if (k === '\x23') return 'Y';
        if (k === '\x24') return 'LB';
        if (k === '\x25') return 'RB';
        if (k === '\x26') return 'LT';
        if (k === '\x27') return 'RT';
        if (k === '\x28') return '⬆';
        if (k === '\x29') return '⬇';
        if (k === '\x2A') return '⬅';
        if (k === '\x2B') return '➡';
        if (k === '\x2C') return 'Start';
        if (k === '\x2D') return 'Sel';
        if (k === '\x2E') return 'L3';
        if (k === '\x2F') return 'R3';
        if (k === '\x30') return 'L↑';
        if (k === '\x31') return 'L↓';
        if (k === '\x32') return 'L←';
        if (k === '\x33') return 'L→';
        if (k === '\x34') return 'R↑';
        if (k === '\x35') return 'R↓';
        if (k === '\x36') return 'R←';
        if (k === '\x37') return 'R→';
        return k.toUpperCase();
      }).join(' ');
      // Gamepad bağlıysa popup'a 🎮 ikonu, sadece klavye varsa ⌨
      setPressedKeysDisplay(display);
      setGamepadActive(gamepadConnected);
      // Hangi bridge bağlıysa ona gönder
      if (connectionMode === 'ble') {
        bleBridge.sendKeys(keys).catch(() => {});
      } else {
        serialBridge.sendKeys(keys).catch(() => {});
      }
    }, 50);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('gamepadconnected', onGamepadConnected as EventListener);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected as EventListener);
      // Son boş gönder
      if (connectionMode === 'ble') {
        bleBridge.sendKeys('').catch(() => {});
      } else {
        serialBridge.sendKeys('').catch(() => {});
      }
      setPressedKeysDisplay('');
      setGamepadActive(false);
    };
  }, [connectionMode, bridgeState]);

  useEffect(() => {
    (async () => {
      const state = await workspaceFs.tryRestore();
      setWorkspaceFsState(state);
      setFolderName(workspaceFs.folderName);
      if (state === 'ready') {
        await refreshProjects(true);
      }
      setTimeout(() => { initializedRef.current = true; }, 400);
    })();
  }, []);

  // ====== Live Share lifecycle — Multi-room ======

  // ─── Tek Aktif Sekme ───────────────────────────────────────────
  // Aynı tarayıcıda yalnızca bir sekme "aktif" olur. Yeni bir sekme
  // açıldığında BroadcastChannel ile diğerlerine haber verir; eski
  // sekmeler pasif moda geçer (presence'tan düşer). Böylece sınıfta
  // aynı kişi birden çok kez görünmez — tek PC = tek aktif hesap.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return; // eski tarayıcı

    const channel = new BroadcastChannel('roboexx-tab-lock');
    const myTabId = Math.random().toString(36).slice(2) + Date.now().toString(36);

    channel.onmessage = (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      // Başka bir sekme "ben aktifim" dedi → bu sekme pasifleşir
      if (msg.type === 'claim' && msg.tabId !== myTabId) {
        setTabActive(false);
      }
    };

    // Açılışta sahiplen — diğer sekmeler bunu duyup pasifleşir
    channel.postMessage({ type: 'claim', tabId: myTabId });
    setTabActive(true);

    return () => {
      channel.close();
    };
  }, []);

  // Live Share kapalıysa hiç bağlanma — production deploy için
  // VITE_LIVE_SHARE_ENABLED=false ile devre dışı bırakılır.
  const liveShareEnabled = import.meta.env.VITE_LIVE_SHARE_ENABLED !== 'false';

  // Login sonrası presence odasına otomatik bağlan
  useEffect(() => {
    if (!liveShareEnabled) return;
    if (!userProfile) return;
    // Pasif sekme presence'a bağlanmaz — sınıfta tek kişi görünür
    if (!tabActive) return;

    // Module-level singleton kontrolü: aynı userId için zaten bağlı isek
    // tekrar bağlanma — StrictMode 2x mount durumunda da çakışma olmaz.
    if (presenceRoomRef.current) {
      return;
    }

    const presence = connectPresenceRoom({
      userId: userProfile.userId,
      name: userProfile.name,
      role: userProfile.role,
    });
    presenceRoomRef.current = presence;
    presenceUnsubRef.current = watchPresence(presence, setPresenceState);

    // Öğrenci kendi workspace odasına otomatik bağlanır
    if (userProfile.role === 'student') {
      setTimeout(() => switchWorkspace(userProfile.userId), 300);
    }

    const onBeforeUnload = () => {
      workspaceBridgeRef.current?.dispose();
      workspaceRoomRef.current?.dispose();
      presenceRoomRef.current?.dispose();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    // ÖNEMLİ: StrictMode dev'de cleanup hemen çalışır ama biz dispose ETMEK
    // İSTEMEYİZ — çünkü 10ms sonra aynı effect tekrar çalışacak. Sadece
    // event listener'ı temizle, presence bağlantısı korunsun.
    // Gerçek dispose: logout (userProfile null) VEYA sekme pasifleşince.
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.userId, tabActive]);

  // Sekme pasifleşince presence bağlantısını kes — sınıftan düş.
  useEffect(() => {
    if (tabActive) return;
    if (presenceRoomRef.current) {
      presenceUnsubRef.current?.();
      presenceUnsubRef.current = null;
      workspaceBridgeRef.current?.dispose();
      workspaceBridgeRef.current = null;
      workspaceRoomRef.current?.dispose();
      workspaceRoomRef.current = null;
      presenceRoomRef.current.dispose();
      presenceRoomRef.current = null;
      setPresenceState((s) => ({ ...s, connected: false, peers: [], totalCount: 0 }));
    }
  }, [tabActive]);

  // Workspace odası değiştiğinde sync sonrası state'i pull et
  useEffect(() => {
    if (!workspaceState.synced || !workspaceBridgeRef.current) return;
    // Yeni bağlandığımız workspace'in state'ini hemen Blockly'ye yükle
    workspaceBridgeRef.current.pullNow();
    // Eğer biz öğrenciysek ve odada başka kimse yoksa (yeni öğrenci ilk açılış),
    // kendi local state'imizi push et — yoksa boş kalır
    workspaceBridgeRef.current.pushNow();
  }, [workspaceState.synced, currentWorkspaceUserId]);

  /**
   * Workspace odasına geçiş yap (eskiden ayrıl, yenisine bağlan).
   * Öğrenci için: kendi userId (login sonrası bir kez çağrılır)
   * Öğretmen için: bir öğrenciye tıkladığında o öğrencinin userId'siyle çağrılır
   */
  const switchWorkspace = (targetUserId: string) => {
    if (!userProfile || !presenceRoomRef.current) return;
    if (!targetUserId) {
      console.warn('[App] switchWorkspace çağrıldı ama targetUserId BOŞ — atlanıyor');
      return;
    }
    if (currentWorkspaceUserId === targetUserId) return;

    // 1) Eski workspace'ten ayrıl
    if (workspaceRoomRef.current) {
      workspaceUnsubRef.current?.();
      workspaceUnsubRef.current = null;
      cursorBroadcasterRef.current?.dispose();
      cursorBroadcasterRef.current = null;
      workspaceBridgeRef.current?.dispose();
      workspaceBridgeRef.current = null;
      workspaceRoomRef.current.dispose();
      workspaceRoomRef.current = null;
    }

    // 2) Blockly state'ini temizle — eski odanın state'i yeni odaya sızmasın
    blocklyRef.current?.resetToEmpty();

    // 3) Yeni workspace odasına bağlan
    const ws = connectWorkspaceRoom(targetUserId, {
      userId: userProfile.userId,
      name: userProfile.name,
      role: userProfile.role,
    });
    workspaceRoomRef.current = ws;
    setCurrentWorkspaceUserId(targetUserId);

    workspaceUnsubRef.current = watchWorkspace(ws, setWorkspaceState);
    cursorBroadcasterRef.current = createCursorBroadcaster(ws);

    // 4) Bridge kurulumu (Blockly hazır olunca)
    const setupBridge = () => {
      if (!blocklyRef.current) {
        setTimeout(setupBridge, 100);
        return;
      }
      const bridge = createBlocklyYjsBridge({
        ydoc: ws.ydoc,
        blocklyHandle: blocklyRef.current,
      });
      workspaceBridgeRef.current = bridge;
    };
    setupBridge();

    // 5) Öğretmen ise presence'a "şu an X'e bağlıyım" bildir
    if (userProfile.role === 'teacher' && presenceRoomRef.current) {
      setConnectedTo(presenceRoomRef.current, targetUserId);
    }
  };

  /** Öğretmenin "bağlantıyı kes" eylemi — mevcut workspace'ten çık, hiçbirine bağlanma */
  const disconnectWorkspace = () => {
    if (!userProfile || userProfile.role !== 'teacher') return;
    if (workspaceRoomRef.current) {
      workspaceUnsubRef.current?.();
      workspaceUnsubRef.current = null;
      cursorBroadcasterRef.current?.dispose();
      cursorBroadcasterRef.current = null;
      workspaceBridgeRef.current?.dispose();
      workspaceBridgeRef.current = null;
      workspaceRoomRef.current.dispose();
      workspaceRoomRef.current = null;
    }
    setCurrentWorkspaceUserId(null);
    setWorkspaceState({ connected: false, synced: false, myClientId: 0, peers: [] });
    blocklyRef.current?.resetToEmpty();
    if (presenceRoomRef.current) {
      setConnectedTo(presenceRoomRef.current, null);
    }
    addLine('system', 'Workspace bağlantısı kesildi');
  };

  /** Öğretmenin sınıf panelinde bir öğrenciye tıklaması */
  const handleConnectToStudent = (targetUserId: string) => {
    if (!userProfile || userProfile.role !== 'teacher') return;
    if (currentWorkspaceUserId === targetUserId) return; // zaten oradayız
    const target = presenceState.peers.find((p) => p.userId === targetUserId);
    switchWorkspace(targetUserId);
    if (target) addLine('system', `${target.name} öğrencisinin workspace'ine bağlandın`);
  };

  const handleToggleHand = () => {
    if (!presenceRoomRef.current) return;
    const newRaised = !presenceState.myHandRaised;
    setHandRaised(presenceRoomRef.current, newRaised);
    addLine('system', newRaised ? 'El kaldırdın — öğretmenine bildirildi' : 'Eli indirdin');
  };

  /**
   * Çıkış yap — tüm live share bağlantılarını kapat, profil bilgisini sil,
   * login modal'ını tekrar göster. URL'i de temizle.
   */
  const handleLogout = () => {
    if (!confirm('Çıkış yapmak istediğine emin misin? Sınıftaki bağlantın kesilecek.')) {
      return;
    }
    // 1. Live Share kaynaklarını dispose et
    presenceUnsubRef.current?.();
    presenceUnsubRef.current = null;
    workspaceUnsubRef.current?.();
    workspaceUnsubRef.current = null;
    cursorBroadcasterRef.current?.dispose();
    cursorBroadcasterRef.current = null;
    workspaceBridgeRef.current?.dispose();
    workspaceBridgeRef.current = null;
    workspaceRoomRef.current?.dispose();
    workspaceRoomRef.current = null;
    presenceRoomRef.current?.dispose();
    presenceRoomRef.current = null;

    // 2. State'i temizle
    setPresenceState({
      connected: false, myClientId: 0, myUserId: '',
      myName: '', myRole: 'student', myHandRaised: false,
      myConnectedTo: null, peers: [], totalCount: 0,
    });
    setWorkspaceState({ connected: false, synced: false, myClientId: 0, peers: [] });
    setCurrentWorkspaceUserId(null);

    // 3. Aktif paneli kapat
    setActivePanel(null);

    // 4. localStorage'ı temizle — login modal tekrar gösterilsin
    localStorage.removeItem(USER_KEY);
    setUserProfile(null);

    addLine('system', '👋 Çıkış yapıldı');
  };

  const addLine = (kind: LineKind, text: string) => {
    setLines((l) => {
      const next = [...l, { id: nextId(), kind, text, ts: new Date() }];
      return next.length > 2000 ? next.slice(-2000) : next;
    });
  };

  const activeCode = mode === 'code' ? customCode : generatedCode;

  const refreshProjects = async (autoLoadLast: boolean = false): Promise<Project[]> => {
    setProjectsLoading(true);
    try {
      const list = await workspaceFs.list();
      setProjects(list);
      if (autoLoadLast) {
        const lastId = getLastOpenedId();
        console.log('[App] autoLoadLast — lastId:', lastId, '| proje sayısı:', list.length,
          '| id listesi:', list.map((p) => p.id));
        if (lastId) {
          const proj = list.find((p) => p.id === lastId);
          if (proj) {
            setTimeout(() => loadProjectIntoUI(proj), 300);
          } else {
            console.warn('[App] lastId ile eşleşen proje YOK:', lastId);
          }
        } else {
        }
      }
      return list;
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleModeChange = (newMode: AppMode) => {
    if (newMode === 'code') {
      if (!codeWasEdited) setCustomCode(generatedCode);
      setMode('code');
    } else {
      if (codeWasEdited) {
        const ok = confirm('Kod modunda yaptığınız düzenlemeler atılacak. Devam edilsin mi?');
        if (!ok) return;
        setCodeWasEdited(false);
      }
      setMode('blocks');
    }
  };

  const handleBlocklyEdit = () => {
    if (initializedRef.current && !isLoadingRef.current) setIsDirty(true);
    // Workspace bridge'e bildir (varsa)
    if (workspaceBridgeRef.current) {
      workspaceBridgeRef.current.notifyLocalChange();
    } else {
    }
    // Presence'a aktivite bildir — 1sn throttle
    if (presenceRoomRef.current) {
      const now = Date.now();
      if (now - lastActivityBroadcastRef.current >= 1000) {
        lastActivityBroadcastRef.current = now;
        markActivity(presenceRoomRef.current);
      }
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCustomCode(newCode);
    setCodeWasEdited(newCode !== generatedCode);
    if (initializedRef.current && !isLoadingRef.current) setIsDirty(true);
  };

  const handlePickFolder = async () => {
    const state = await workspaceFs.pickFolder();
    setWorkspaceFsState(state);
    setFolderName(workspaceFs.folderName);
    if (state === 'ready') {
      addLine('system', `Workspace klasörü: ${workspaceFs.folderName}`);
      await refreshProjects();
    }
  };

  const handleGrantPermission = async () => {
    const ok = await workspaceFs.ensurePermission();
    setWorkspaceFsState(workspaceFs.state);
    if (ok) {
      addLine('system', `Workspace klasörüne izin verildi: ${workspaceFs.folderName}`);
      await refreshProjects(true);
    }
  };

  const handleChangeFolder = async () => {
    if (isDirty) {
      const ok = confirm('Mevcut projede kaydetmediğiniz değişiklikler var. Klasör değiştirilsin mi?');
      if (!ok) return;
    }
    await workspaceFs.forgetFolder();
    setProjects([]);
    setCurrentProject(null);
    setLastOpenedId(null);
    await handlePickFolder();
  };

  const loadProjectIntoUI = (p: Project) => {
    console.log('[App] loadProjectIntoUI:', p.name, '| mod:', p.mode,
      '| blocksState var mı:', !!p.blocksState);
    isLoadingRef.current = true;
    if (p.mode === 'blocks' && p.blocksState) {
      // loadState kendi içinde workspace hazır olana kadar bekler
      // (sayfa yenilemede Blockly init geç bitebilir). blocklyRef handle
      // ilk render'da hazır olduğu için doğrudan çağırmak güvenli.
      blocklyRef.current?.loadState(p.blocksState);
      setMode('blocks');
    } else if (p.mode === 'code' && p.code !== null) {
      setCustomCode(p.code);
      setCodeWasEdited(false);
      setMode('code');
    }
    setCurrentProject(p);
    setLastOpenedId(p.id);
    addLine('info', `"${p.name}" açıldı`);
    // isLoading penceresi: blok modunda loadState gecikmeli (retry) olabilir,
    // geç gelen yükleme event'leri "dirty" yapmasın diye uzun tut.
    const settleMs = p.mode === 'blocks' ? 4800 : 200;
    setTimeout(() => {
      isLoadingRef.current = false;
      setIsDirty(false);
    }, settleMs);
  };

  const handleNewProject = () => {
    if (isDirty) {
      const ok = confirm('Mevcut projede kaydetmediğiniz değişiklikler var. Yeni proje açılsın mı?');
      if (!ok) return;
    }
    isLoadingRef.current = true;
    blocklyRef.current?.resetToEmpty();
    setCustomCode('');
    setCodeWasEdited(false);
    setMode('blocks');
    setCurrentProject(null);
    setLastOpenedId(null);
    addLine('info', 'Yeni proje');
    setTimeout(() => {
      isLoadingRef.current = false;
      setIsDirty(false);
    }, 200);
  };

  const handleOpenProject = (id: string) => {
    if (id === currentProject?.id) return;
    if (isDirty) {
      const ok = confirm('Mevcut projede kaydetmediğiniz değişiklikler var. Açma işlemine devam edilsin mi?');
      if (!ok) return;
    }
    const p = projects.find((x) => x.id === id);
    if (p) loadProjectIntoUI(p);
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      await workspaceFs.delete(project);
      if (currentProject?.id === project.id) {
        setCurrentProject(null);
        setLastOpenedId(null);
      }
      addLine('info', `"${project.name}" silindi`);
      await refreshProjects();
    } catch (e) {
      addLine('error', `Silme hatası: ${(e as Error).message}`);
    }
  };

  const handleSave = async () => {
    if (workspaceFs.state !== 'ready') {
      addLine('info', 'Önce workspace klasörü seçmelisin');
      setActivePanel('projects');
      return;
    }

    let blocksState: object | null = null;
    let code: string | null = null;
    if (mode === 'blocks') {
      blocksState = blocklyRef.current?.saveState() ?? null;
    } else {
      code = customCode;
    }

    let project: Project;
    if (currentProject) {
      project = { ...currentProject, mode, blocksState, code, updatedAt: Date.now() };
    } else {
      const defaultName = `Proje ${projects.length + 1}`;
      const inputName = prompt('Proje adı:', defaultName);
      if (inputName === null) return;
      const trimmed = inputName.trim();
      if (!trimmed) return;
      project = {
        id: generateProjectId(),
        name: trimmed,
        mode,
        blocksState,
        code,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    try {
      const saved = await workspaceFs.save(project);
      setCurrentProject(saved);
      setLastOpenedId(saved.id);
      setIsDirty(false);
      addLine('info', `"${saved.name}" kaydedildi → ${saved.filename}.json`);
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      await refreshProjects();
    } catch (e) {
      addLine('error', `Kayıt hatası: ${(e as Error).message}`);
    }
  };

  /**
   * Açık projenin adını değiştir.
   * Not: Görünen ad (name) güncellenir; diskteki .json dosya adı sabit kalır
   * (dosya taşıma File System API'de riskli — sınıf güvenliği için yapılmıyor).
   */
  const handleRename = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || !currentProject) return;
    if (trimmed === currentProject.name) return;
    try {
      const renamed = { ...currentProject, name: trimmed, updatedAt: Date.now() };
      const saved = await workspaceFs.save(renamed);
      setCurrentProject(saved);
      setLastOpenedId(saved.id);
      addLine('info', `Proje adı değişti: "${saved.name}"`);
      await refreshProjects();
    } catch (e) {
      addLine('error', `Yeniden adlandırma hatası: ${(e as Error).message}`);
    }
  };

  /**
   * Sessiz otomatik kayıt — 2 dakikada bir tetiklenir.
   * Sadece zaten kaydedilmiş bir proje açıksa ve değişiklik varsa çalışır.
   * Yeni/isimsiz projeyi kaydetmez (prompt açmaz — kullanıcıyı rahatsız etmez).
   */
  const autoSave = async () => {
    if (workspaceFs.state !== 'ready') return;
    if (!currentProject) return;   // isimsiz proje — otomatik kaydetme
    if (!isDirty) return;          // değişiklik yok — gereksiz yazma

    let blocksState: object | null = null;
    let code: string | null = null;
    if (mode === 'blocks') {
      blocksState = blocklyRef.current?.saveState() ?? null;
    } else {
      code = customCode;
    }

    try {
      const project: Project = {
        ...currentProject, mode, blocksState, code, updatedAt: Date.now(),
      };
      const saved = await workspaceFs.save(project);
      setCurrentProject(saved);
      setLastOpenedId(saved.id);
      setIsDirty(false);
      addLine('info', `Otomatik kaydedildi: "${saved.name}"`);
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      await refreshProjects();
    } catch (e) {
      console.warn('Otomatik kayıt hatası:', e);
    }
  };

  // 2 dakikada bir otomatik kayıt
  useEffect(() => {
    const TWO_MIN = 2 * 60 * 1000;
    const timer = setInterval(() => { autoSave(); }, TWO_MIN);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, isDirty, mode, customCode, workspaceFsState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentProject, customCode, projects.length, workspaceFsState]);

  /** Aktif bridge — USB veya BLE moduna göre. Tek noktadan abstract. */
  const activeBridge = connectionMode === 'ble' ? bleBridge : serialBridge;

  /**
   * Robot kol için MicroPython'u REPL'e satır satır gönder (canlı sürüş).
   * Yalnızca USB/REPL ile çalışır; satırlar Pico'da anında yürütülür.
   * Pico bağlı değilse sendCommand zaten sessizce döner.
   */
  const sendArmCode = (code: string) => {
    const lines = code.split('\n').map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      void serialBridge.sendCommand(line);
    }
  };

  const handleConnect = async () => {
    try {
      await serialBridge.requestAndConnect();
      } catch (e) {
      addLine('error', (e as Error).message);
    }
  };

  const handleBleConnect = async () => {
    if (!BLEBridge.isSupported()) {
      addLine('error', 'Bu tarayıcı Web Bluetooth desteklemiyor. Chrome veya Edge kullan.');
      return;
    }
    const tryConnect = async (): Promise<boolean> => {
      try {
        await bleBridge.connect();
        setPortInfo({ friendlyName: bleBridge.portInfo?.friendlyName ?? 'RoboExx Pico', vendorId: 0, productId: 0 } as PortInfo);
        return true;
      } catch (e) {
        const msg = (e as Error).message;
        // Kullanıcı pencereyi kapattıysa retry deneme
        if ((e as Error).name === 'NotFoundError') return false;
        // Bağlantı kurulur kurulmaz kopma → tek seferlik otomatik retry
        if (msg.includes('kurulur kurulmaz')) {
          addLine('system', 'Bağlantı düştü, 1.5sn sonra otomatik tekrar denenecek…');
          await new Promise((r) => setTimeout(r, 1500));
          try {
            await bleBridge.connect();
            setPortInfo({ friendlyName: bleBridge.portInfo?.friendlyName ?? 'RoboExx Pico', vendorId: 0, productId: 0 } as PortInfo);
            return true;
          } catch (e2) {
            addLine('error', `BLE bağlantı hatası (yeniden deneme başarısız): ${(e2 as Error).message}`);
            return false;
          }
        }
        addLine('error', `BLE bağlantı hatası: ${msg}`);
        return false;
      }
    };
    await tryConnect();
  };

  const handleDisconnect = async () => {
    if (connectionMode === 'ble') {
      await bleBridge.disconnect();
      setPortInfo(null);
    } else {
      await serialBridge.disconnect();
    }
  };

  const handleConnectionModeChange = async (mode: 'usb' | 'ble') => {
    if (mode === connectionMode) return;
    // Mod değişiminde her iki bridge'i de garanti kapat — yarım kalan
    // BLE reconnect veya açık USB portu yeni moda sızmasın.
    try { await bleBridge.disconnect(); } catch {}
    try { await serialBridge.disconnect(); } catch {}
    setPortInfo(null);
    setConnectionMode(mode);
    localStorage.setItem('roboexx.connection-mode', mode);
    addLine('system', `Bağlantı modu: ${mode === 'ble' ? 'Bluetooth' : 'USB'}`);
  };

  const handleRun = async () => {
    // BLE modunda Run yok — sadece USB'de
    if (connectionMode === 'ble') {
      addLine('info', 'Bluetooth modunda sadece "Yükle" mevcut');
      return;
    }
    if (!activeCode.trim()) {
      addLine('info', 'Çalıştırılacak kod yok');
      return;
    }
    addLine('system', `▶ Çalıştırılıyor (${activeCode.split('\n').length} satır, RAM)`);
    try {
      await serialBridge.runCode(activeCode);
      addLine('system', 'Çalıştırma tamamlandı');
    } catch (e) {
      addLine('error', `Çalıştırma hatası: ${(e as Error).message}`);
    }
  };

  const handleUpload = async () => {
    if (!activeCode.trim()) {
      addLine('info', 'Yüklenecek kod yok');
      return;
    }
    const targetName = connectionMode === 'ble' ? 'user_code.py' : 'main.py';
    addLine('system', `⬆ Yükleniyor (${activeCode.length} bayt → ${targetName}, ${connectionMode === 'ble' ? 'BLE' : 'USB'})`);
    setUploadProgress({ phase: 'uploading', pct: 0, bytesSent: 0, bytesTotal: activeCode.length, speedKBs: 0 });

    try {
      await activeBridge.uploadCode(activeCode, (p) => {
        setUploadProgress({ phase: 'uploading', pct: p.pct, bytesSent: p.bytesSent, bytesTotal: p.bytesTotal, speedKBs: p.speedKBs });
      });
      setUploadProgress((prev) => prev ? { ...prev, phase: 'success', pct: 100 } : null);
      addLine('system', connectionMode === 'ble'
        ? '✓ Kod gönderildi — Pico yeniden başlıyor, otomatik bağlanılacak'
        : 'Yükleme başarılı, Pico restart oluyor');
    } catch (e) {
      const err = e as Error;
      setUploadProgress((prev) => prev ? { ...prev, phase: 'error', error: err.message } : null);
      addLine('error', `Yükleme hatası: ${err.message}`);
    }
  };

  /**
   * "Modülleri Yükle" — RoboExx modüllerini (roboexx.py + main.py + songs.py + device_name.txt)
   * Pico'ya yükler. Bağlantı kontrolü yapar, doğrudan yükleme başlatır.
   */
  const handleUploadLibrary = () => {
    if (bridgeState !== 'connected' && bridgeState !== 'busy') {
      addLine('error', 'Önce bir cihaza bağlan (USB veya Bluetooth)');
      return;
    }
    runUploadLibrary();
  };

  /**
   * RoboExx modüllerini Pico'ya yükler:
   *  - roboexx.py (PicoBricks API)
   *  - songs.py (hazır şarkılar)
   *  - pca9685.py (PCA9685 I2C servo sürücüsü)
   *  - main.py (BLE bootloader)
   *  - device_name.txt (BLE cihaz adı)
   */
  const runUploadLibrary = async () => {
    addLine('system', `📚 RoboExx modülleri indiriliyor…`);
    let libCode: string;
    let mainCode: string;
    let songsCode = '';
    let pcaCode = '';
    try {
      const results = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}lib/roboexx.py`),
        fetch(`${import.meta.env.BASE_URL}lib/roboexx_main.py`),
        fetch(`${import.meta.env.BASE_URL}lib/songs.py`),
        fetch(`${import.meta.env.BASE_URL}lib/pca9685.py`),
      ]);
      const [libRes, mainRes, songsRes, pcaRes] = results;
      if (!libRes.ok) throw new Error(`roboexx.py HTTP ${libRes.status}`);
      if (!mainRes.ok) throw new Error(`roboexx_main.py HTTP ${mainRes.status}`);
      if (!songsRes.ok) throw new Error(`songs.py HTTP ${songsRes.status}`);
      if (!pcaRes.ok) throw new Error(`pca9685.py HTTP ${pcaRes.status}`);
      libCode = await libRes.text();
      mainCode = await mainRes.text();
      songsCode = await songsRes.text();
      pcaCode = await pcaRes.text();
    } catch (e) {
      addLine('error', `Kütüphane dosyası okunamadı: ${(e as Error).message}`);
      return;
    }

    // 1) roboexx.py — toplam ilerlemenin %0-30'u
    addLine('system', `⬆ roboexx.py yükleniyor (${libCode.length} bayt)`);
    setUploadProgress({ phase: 'uploading', pct: 0, bytesSent: 0, bytesTotal: libCode.length, speedKBs: 0 });
    try {
      await activeBridge.uploadLibrary('roboexx.py', libCode, (p) => {
        setUploadProgress({ phase: 'uploading', pct: p.pct * 0.3, bytesSent: p.bytesSent, bytesTotal: p.bytesTotal, speedKBs: p.speedKBs });
      });
      addLine('system', `✓ roboexx.py yüklendi`);
    } catch (e) {
      const err = e as Error;
      setUploadProgress((prev) => prev ? { ...prev, phase: 'error', error: err.message } : null);
      addLine('error', `roboexx.py yükleme hatası: ${err.message}`);
      return;
    }

    // 2) songs.py — müzik kütüphanesi  %30-45
    addLine('system', `⬆ songs.py yükleniyor (${songsCode.length} bayt)`);
    setUploadProgress({ phase: 'uploading', pct: 30, bytesSent: 0, bytesTotal: songsCode.length, speedKBs: 0 });
    try {
      await activeBridge.uploadLibrary('songs.py', songsCode, (p) => {
        setUploadProgress({ phase: 'uploading', pct: 30 + p.pct * 0.15, bytesSent: p.bytesSent, bytesTotal: p.bytesTotal, speedKBs: p.speedKBs });
      });
      addLine('system', '✓ songs.py yüklendi');
    } catch (e) {
      const err = e as Error;
      setUploadProgress((prev) => prev ? { ...prev, phase: 'error', error: err.message } : null);
      addLine('error', `songs.py yükleme hatası: ${err.message}`);
      return;
    }

    // 3) pca9685.py — I2C servo sürücüsü  %45-55
    addLine('system', `⬆ pca9685.py yükleniyor (${pcaCode.length} bayt)`);
    setUploadProgress({ phase: 'uploading', pct: 45, bytesSent: 0, bytesTotal: pcaCode.length, speedKBs: 0 });
    try {
      await activeBridge.uploadLibrary('pca9685.py', pcaCode, (p) => {
        setUploadProgress({ phase: 'uploading', pct: 45 + p.pct * 0.1, bytesSent: p.bytesSent, bytesTotal: p.bytesTotal, speedKBs: p.speedKBs });
      });
      addLine('system', '✓ pca9685.py yüklendi');
    } catch (e) {
      const err = e as Error;
      setUploadProgress((prev) => prev ? { ...prev, phase: 'error', error: err.message } : null);
      addLine('error', `pca9685.py yükleme hatası: ${err.message}`);
      return;
    }

    // 4) main.py (BLE bootloader)  — %55-95
    addLine('system', `⬆ main.py (BLE bootloader) yükleniyor (${mainCode.length} bayt)`);
    setUploadProgress({ phase: 'uploading', pct: 55, bytesSent: 0, bytesTotal: mainCode.length, speedKBs: 0 });
    try {
      await activeBridge.uploadLibrary('main.py', mainCode, (p) => {
        setUploadProgress({ phase: 'uploading', pct: 55 + p.pct * 0.4, bytesSent: p.bytesSent, bytesTotal: p.bytesTotal, speedKBs: p.speedKBs });
      });
      addLine('system', '✓ main.py yüklendi');
    } catch (e) {
      const err = e as Error;
      setUploadProgress((prev) => prev ? { ...prev, phase: 'error', error: err.message } : null);
      addLine('error', `main.py yükleme hatası: ${err.message}`);
      return;
    }

    // 5) device_name.txt — BLE cihaz adı (kişiselleştirilmiş)
    addLine('system', `⬆ Cihaz adı yazılıyor: "${deviceName}"`);
    try {
      await activeBridge.uploadLibrary('device_name.txt', deviceName, (p) => {
        setUploadProgress({ phase: 'uploading', pct: 95 + p.pct * 0.05, bytesSent: p.bytesSent, bytesTotal: p.bytesTotal, speedKBs: p.speedKBs });
      });
      setUploadProgress((prev) => prev ? { ...prev, phase: 'success', pct: 100 } : null);
      addLine('system', `✓ RoboExx modülleri hazır · Cihaz: "${deviceName}"`);
      addLine('info', 'Pico\'yu yeniden başlat (RESET tuşu veya gücü kes/aç) — sonra BLE üzerinden bağlanabilirsin');
    } catch (e) {
      const err = e as Error;
      setUploadProgress((prev) => prev ? { ...prev, phase: 'error', error: err.message } : null);
      addLine('error', `Cihaz adı yükleme hatası: ${err.message}`);
    }
  };

  const handleStop = async () => {
    if (connectionMode === 'ble') {
      addLine('info', 'Bluetooth modunda Durdur yok. Yeni kod yükle veya Pico\'yu resetle.');
      return;
    }
    try {
      await serialBridge.interrupt();
      addLine('system', 'Durduruldu (Ctrl+C)');
    } catch {}
  };

  const handleSerialSend = async (cmd: string) => {
    addLine('sent', cmd);
    try {
      await serialBridge.sendCommand(cmd);
    } catch (e) {
      addLine('error', (e as Error).message);
    }
  };

  const handleClearSerial = () => setLines([]);

  const handleRailSelect = (id: string) => {
    if (id === 'guide') {
      setGuideOpen((o) => !o);
      return;
    }
    if (id === 'projects' || id === 'classroom') {
      setActivePanel((p) => (p === id ? null : (id as ActivePanel)));
      return;
    }
    setActiveRail(id);
  };

  const liveShareActive = !!presenceState.myUserId; // presence bağlı mı

  // Sekme pasifse — tam ekran uyarı, RoboExx başka sekmede açık
  if (!tabActive) {
    return (
      <div className="tab-passive-backdrop">
        <div className="tab-passive-card">
          <div className="tab-passive-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="6" cy="7" r="0.6" fill="currentColor" />
            </svg>
          </div>
          <h2 className="tab-passive-title">RoboExx başka sekmede açık</h2>
          <p className="tab-passive-desc">
            Aynı bilgisayarda RoboExx yalnızca tek sekmede çalışır. Sınıfta
            iki kez görünmemen için bu sekme duraklatıldı.
          </p>
          <button
            className="tab-passive-btn"
            onClick={() => {
              // Bu sekmeyi tekrar aktif yap — diğerleri pasifleşir
              if (typeof BroadcastChannel !== 'undefined') {
                const ch = new BroadcastChannel('roboexx-tab-lock');
                ch.postMessage({ type: 'claim', tabId: 'reclaim-' + Date.now() });
                ch.close();
              }
              setTabActive(true);
            }}
          >
            Bu sekmede devam et
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="app"
      data-panel-open={activePanel !== null ? 'true' : 'false'}
      data-live-share={liveShareActive ? 'true' : 'false'}
    >
      <Toolbar
        mode={mode}
        onModeChange={handleModeChange}
        bridgeState={bridgeState}
        portInfo={portInfo}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onRun={handleRun}
        onUpload={handleUpload}
        onStop={handleStop}
        projectName={currentProject?.name ?? null}
        isDirty={isDirty}
        onUploadLibrary={handleUploadLibrary}
        connectionMode={connectionMode}
        onConnectionModeChange={handleConnectionModeChange}
        onBleConnect={handleBleConnect}
        onForceReset={async () => {
          await activeBridge.forceReset();
          addLine('system', '⚠ Bridge sıfırlandı');
        }}
        onSensorPanel={() => setSensorPanelOpen(true)}
        onFirmwareUpload={() => setFirmwareUploaderOpen(true)}
        codeTarget={codeTarget}
        onTargetChange={handleTargetChange}
        onArduinoUpload={() => setArduinoUploaderOpen(true)}
        onRobotArm={() => { setRobotArmOpen((o) => !o); setRoboBotOpen(false); setRoboBotFullscreen(false); }}
        robotArmActive={robotArmOpen}
        onRoboBot={() => { setRoboBotOpen((o) => !o); setRobotArmOpen(false); setRobotArmFullscreen(false); }}
        roboBotActive={roboBotOpen}
        themeId={themeId}
        onToggleLight={toggleLight}
        lastSavedText={lastSavedText}
      />

      <ActivityRail
        active={activeRail}
        onSelect={handleRailSelect}
        highlighted={[...(activePanel ? [activePanel] : []), ...(guideOpen ? ['guide'] : [])]}
        badges={{
          projects: projects.length || undefined,
          classroom: liveShareActive ? presenceState.totalCount : undefined,
        }}
        userProfile={userProfile}
        onLogout={handleLogout}
        deviceName={deviceName}
        onDeviceNameChange={(n) => {
          setDeviceName(n);
          localStorage.setItem('roboexx.device-name', n);
          addLine('system', `Cihaz adı değişti: "${n}" — Modülleri Yükle ile Pico'ya yazılır`);
        }}
      />

      {activePanel === 'projects' && (
        <ProjectsPanel
          workspaceState={workspaceFsState}
          folderName={folderName}
          projects={projects}
          currentId={currentProject?.id ?? null}
          loading={projectsLoading}
          onPickFolder={handlePickFolder}
          onGrantPermission={handleGrantPermission}
          onChangeFolder={handleChangeFolder}
          onRefresh={() => refreshProjects()}
          onOpen={handleOpenProject}
          onNew={handleNewProject}
          onDelete={handleDeleteProject}
          onClose={() => setActivePanel(null)}
          onSave={handleSave}
          onRename={handleRename}
          isDirty={isDirty}
          saveFlash={saveFlash}
          currentName={currentProject?.name ?? null}
          currentUpdatedAt={currentProject?.updatedAt ?? null}
        />
      )}

      {activePanel === 'classroom' && (
        <ClassroomPanel
          presence={presenceState}
          currentWorkspaceUserId={currentWorkspaceUserId}
          onClose={() => setActivePanel(null)}
          onConnectToStudent={handleConnectToStudent}
          onDisconnectWorkspace={disconnectWorkspace}
          onToggleHand={handleToggleHand}
        />
      )}

      <main className="main-content" data-monitor-open={monitorOpen}>
        <div
          className="workspace-area"
          data-arm-open={(robotArmOpen || roboBotOpen) ? 'true' : 'false'}
          data-arm-full={((robotArmOpen && robotArmFullscreen) || (roboBotOpen && roboBotFullscreen)) ? 'true' : 'false'}
        >
          {/* Blok alanı her zaman mounted kalır; tam ekranda CSS ile gizlenir
              (unmount edilirse Blockly dispose olur ve bloklar/kod silinir). */}
          <div className="workspace-main-col">
          {mode === 'blocks' ? (
            <div className={`workspace-split ${previewOpen ? '' : 'is-preview-collapsed'}`}>
              <div className="workspace-blocks">
                <BlocklyWorkspace
                  ref={blocklyRef}
                  target={codeTarget}
                  onCodeChange={setGeneratedCode}
                  onUserEdit={handleBlocklyEdit}
                  theme={theme}
                  onCursorMove={currentWorkspaceUserId ? (x, y) => cursorBroadcasterRef.current?.setCursor(x, y) : undefined}
                  peerCursors={currentWorkspaceUserId ? workspaceState.peers
                    .filter((p) => p.cursor)
                    .map((p) => ({ clientId: p.clientId, name: p.name, x: p.cursor!.x, y: p.cursor!.y })) : undefined}
                />
                {!previewOpen && (
                  <button
                    className="preview-show-btn"
                    onClick={() => setPreviewOpen(true)}
                    title={`${codeTarget === 'arduino' ? 'Arduino' : 'MicroPython'} kod önizlemesini göster`}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{codeTarget === 'arduino' ? 'Arduino' : 'MicroPython'}</span>
                  </button>
                )}
              </div>
              {previewOpen && (
                <CodePreview code={generatedCode} onClose={() => setPreviewOpen(false)} />
              )}
            </div>
          ) : (
            <div className="workspace-code">
              <div className="code-editor-wrap">
                <div className="code-editor-header">
                  <span className="code-editor-title">
                    <span className="dot-indicator" />
                    {codeTarget === 'arduino' ? 'Arduino · sketch.ino' : 'MicroPython · main.py'}
                    {codeWasEdited && <span className="edited-badge">düzenlendi</span>}
                  </span>
                  <span className="code-editor-hint">
                    {codeTarget === 'arduino'
                      ? "Arduino'ya bu kod derlenip yüklenecek"
                      : "Pico W'ye doğrudan bu kod yüklenecek"}
                  </span>
                </div>
                <CodeEditor value={customCode} onChange={handleCodeChange} theme={theme} />
              </div>
            </div>
          )}
          </div>

          {robotArmOpen && (
            <RobotArmPanel
              ref={robotArmRef}
              connected={bridgeState === 'connected'}
              onSendCode={sendArmCode}
              fullscreen={robotArmFullscreen}
              onToggleFullscreen={() => setRobotArmFullscreen((f) => !f)}
              onClose={() => { setRobotArmOpen(false); setRobotArmFullscreen(false); }}
            />
          )}

          {roboBotOpen && (
            <RoboBotPanel
              fullscreen={roboBotFullscreen}
              onToggleFullscreen={() => setRoboBotFullscreen((f) => !f)}
              onClose={() => { setRoboBotOpen(false); setRoboBotFullscreen(false); }}
            />
          )}
        </div>

        {guideOpen && (
          <AssemblyGuide
            onClose={() => setGuideOpen(false)}
            onOpenSimulation={() => {
              setGuideOpen(false);
              setRobotArmOpen(true);
              setRoboBotOpen(false);
              setRoboBotFullscreen(false);
            }}
          />
        )}

        <SerialMonitor
          open={monitorOpen}
          onToggle={() => setMonitorOpen((o) => !o)}
          connected={bridgeState === 'connected' || bridgeState === 'busy'}
          lines={lines}
          onSend={handleSerialSend}
          onClear={handleClearSerial}
        />
      </main>

      <UploadOverlay progress={uploadProgress} onDismiss={() => setUploadProgress(null)} />

      <SensorDashboard
        open={sensorPanelOpen}
        onClose={() => setSensorPanelOpen(false)}
      />

      <FirmwareUploader
        open={firmwareUploaderOpen}
        onClose={() => setFirmwareUploaderOpen(false)}
      />

      <ArduinoUploader
        open={arduinoUploaderOpen}
        onClose={() => setArduinoUploaderOpen(false)}
        source={activeCode}
      />

      {/* Klavye / gamepad basılı tuş göstergesi — sağ alt köşede küçük popup */}
      {pressedKeysDisplay && (
        <div className="keys-overlay" aria-live="polite">
          <span className="keys-overlay-label">{gamepadActive ? '🎮' : '⌨'}</span>
          <span className="keys-overlay-keys">{pressedKeysDisplay}</span>
        </div>
      )}

      {!userProfile && (
        <LoginModal
          onSubmit={(p) => {
            saveUserProfile(p);
            setUserProfile(p);
          }}
        />
      )}
    </div>
  );
}

function classifyLine(text: string): LineKind {
  const t = text.trim();
  if (!t) return 'output';
  if (t.startsWith('Traceback')) return 'error';
  if (t.match(/^[A-Z][a-zA-Z]*Error:/)) return 'error';
  if (t.match(/^\s*File "/) && t.includes(', line ')) return 'error';
  if (t.startsWith('MicroPython ') || t.startsWith('Type "help')) return 'system';
  if (t === '>>>' || t.startsWith('>>> ')) return 'system';
  return 'output';
}
