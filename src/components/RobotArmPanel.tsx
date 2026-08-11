import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import * as Blockly from 'blockly';
import {
  type ArmConfig, type ServoKind,
  loadArmConfig, saveArmConfig,
  bootstrapCode, jointCommand, allJointsCommand,
  logicalToPhysical, physicalToLogical, jointForServo,
} from '../robotarm/config';
import { generateArmSimCode } from '../robotarm/sim-run';
import {
  buildArmLiveSketch, armLiveCommand, armHasNonNormalJoints,
} from '../robotarm/arduino-live';
import { arduinoLiveLink } from '../arduino/livelink';
import { ArduinoUploader } from './ArduinoUploader';

/** App'in serial telemetrisini panele iletmesi için imperative handle. */
export interface RobotArmHandle {
  /** Firmware'den gelen servo telemetrisi: gerçek→sim yansıtma. */
  applyServoTelemetry(code: number, id: number, angle: number): void;
}

interface Props {
  /** Pico bağlı mı? */
  connected: boolean;
  /** Tek/çok satırlık MicroPython'u REPL'e gönder (App uygular). */
  onSendCode: (code: string) => void;
  /** Tam ekran mı? */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

const KIND_LABELS: Record<ServoKind, string> = {
  normal: 'Normal servo',
  driver: 'Sürücü servo',
  pca: 'PCA9685',
};
/** id alanı etiketi tip'e göre değişir */
const ID_LABEL: Record<ServoKind, string> = { normal: 'Pin', driver: 'No', pca: 'Kanal' };
const ID_MAX: Record<ServoKind, number> = { normal: 28, driver: 4, pca: 15 };
const ID_MIN: Record<ServoKind, number> = { normal: 0, driver: 1, pca: 0 };

const SIM_URL = '/robot/arm-sim.html';

export const RobotArmPanel = forwardRef<RobotArmHandle, Props>(function RobotArmPanel(
  { connected, onSendCode, fullscreen, onToggleFullscreen, onClose }, ref
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [cfg, setCfg] = useState<ArmConfig>(() => loadArmConfig());
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [simReady, setSimReady] = useState(false);
  const [gotoOn, setGotoOn] = useState(false);
  const [pointModeOn, setPointModeOn] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [repeating, setRepeating] = useState(false);
  const [dwell, setDwell] = useState(400);
  const [tip, setTip] = useState<{ x: number; y: number; z: number; r: number } | null>(null);
  const [pickReport, setPickReport] = useState<{ target: { x: number; y: number; z: number }; reached: { x: number; y: number; z: number }; err: number; cube: number } | null>(null);
  const [holding, setHolding] = useState(false);
  const [partsList, setPartsList] = useState<{ name: string; group: string; color: number }[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const [lastReach, setLastReach] = useState<number | null>(null);
  const liveThrottle = useRef<Record<number, number>>({});

  // ── KART SEÇİMİ + ARDUINO CANLI BAĞLANTI ─────────────────────────
  const board = cfg.board ?? 'pico';
  const [armLive, setArmLive] = useState(arduinoLiveLink.state === 'open');
  useEffect(() => arduinoLiveLink.onStateChange((st) => setArmLive(st === 'open')), []);
  const [armUpOpen, setArmUpOpen] = useState(false);

  // ── BLOK PROGRAMINI SİMÜLASYONDA ÇALIŞTIRMA ──────────────────────
  const [simRunning, setSimRunning] = useState(false);
  const [simRunErr, setSimRunErr] = useState<string | null>(null);
  const [simLog, setSimLog] = useState<string[]>([]);
  const simLogRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const el = simLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [simLog]);
  const runCtl = useRef<{ abort: boolean }>({ abort: false });
  /** Sim'in son bilinen mantıksal açıları (home: gripper 82 — sim varsayılanı). */
  const anglesRef = useRef<[number, number, number, number]>([90, 90, 90, 82]);
  // Bağlantı/boot durumlarının çalışan programa taze ulaşması için ref'ler
  const connRef = useRef(connected); connRef.current = connected;
  const bootRef = useRef(bootDone); bootRef.current = bootDone;
  const onSendCodeRef = useRef(onSendCode); onSendCodeRef.current = onSendCode;

  // Tuş blokları için klavye takibi (panel açıkken)
  const keysRef = useRef<Set<string>>(new Set());
  const keysOnceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const norm = (e: KeyboardEvent): string | null => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return null;
      const k = e.key;
      if (k === 'ArrowUp') return '\x11';
      if (k === 'ArrowDown') return '\x12';
      if (k === 'ArrowLeft') return '\x13';
      if (k === 'ArrowRight') return '\x14';
      if (k === 'Enter') return '\n';
      if (k === ' ') return ' ';
      if (k.length === 1) return k.toLowerCase();
      return null;
    };
    const onDown = (e: KeyboardEvent) => {
      const k = norm(e); if (k === null) return;
      if (!keysRef.current.has(k)) keysOnceRef.current.add(k);
      keysRef.current.add(k);
    };
    const onUp = (e: KeyboardEvent) => { const k = norm(e); if (k !== null) keysRef.current.delete(k); };
    const onBlur = () => keysRef.current.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  // Echo (geri besleme) bastırma: sim kendi komutunu gönderdiği eklemin
  // telemetri yankısını kısa süre yok say → slider geri zıplamaz.
  const drivenAt = useRef<Record<number, number>>({});
  const markDriven = (joints: number[]) => {
    const now = performance.now();
    for (const j of joints) drivenAt.current[j] = now;
  };

  // config her değişiminde kaydet
  useEffect(() => { saveArmConfig(cfg); }, [cfg]);

  /** sim iframe'ine mesaj gönder */
  const postToSim = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  /** REPL hazırlığı: importlar (+PCA init). connected ise gönderir. */
  const ensureBoot = useCallback(() => {
    if (!connected) return;
    onSendCode(bootstrapCode(cfgRef.current));
    setBootDone(true);
  }, [connected, onSendCode]);

  /** Tek eklemi seçili karta gönder (mantıksal açı; throttle içeride). */
  const hwSendJoint = useCallback((j: number, logical: number) => {
    const c = cfgRef.current;
    const now = performance.now();
    if (now - (liveThrottle.current[j] || 0) < 45) return;
    liveThrottle.current[j] = now;
    if ((c.board ?? 'pico') === 'arduino') {
      const phys = logicalToPhysical(c.joints[j], logical);
      arduinoLiveLink.sendRaw(armLiveCommand(j, phys)).catch(() => {});
    } else {
      if (!connRef.current) return;
      if (!bootRef.current) { onSendCodeRef.current(bootstrapCode(c)); setBootDone(true); }
      markDriven([j]);
      onSendCodeRef.current(jointCommand(c.joints[j], logical));
    }
  }, []);

  /** Dört eklemi birden seçili karta gönder (IK / merkez gibi tek atımlar). */
  const hwSendAll = useCallback((angles: number[]) => {
    const c = cfgRef.current;
    if ((c.board ?? 'pico') === 'arduino') {
      for (let j = 0; j < 4; j++) {
        const phys = logicalToPhysical(c.joints[j], angles[j]);
        arduinoLiveLink.sendRaw(armLiveCommand(j, phys)).catch(() => {});
      }
    } else {
      if (!connRef.current) return;
      if (!bootRef.current) { onSendCodeRef.current(bootstrapCode(c)); setBootDone(true); }
      markDriven([0, 1, 2, 3]);
      onSendCodeRef.current(allJointsCommand(c, angles));
    }
  }, []);
  const hwJointRef = useRef(hwSendJoint); hwJointRef.current = hwSendJoint;

  // ── kol API'si: sim-run.ts'in ürettiği kod bu nesneyi çağırır ────
  const STOP = useRef({ __stop: true }).current;
  const armApi = useRef<Record<string, unknown> | null>(null);
  if (!armApi.current) {
    const easing = (t: number, c: string): number =>
      c === 'ease' ? t * t * (3 - 2 * t)
        : c === 'easein' ? t * t
        : c === 'easeout' ? t * (2 - t)
        : t;
    const chk = () => { if (runCtl.current.abort) throw STOP; };
    const frame = async () => { chk(); await new Promise((r) => setTimeout(r, 16)); chk(); };
    const setJointLive = (j: number, a: number) => {
      const v = Math.max(0, Math.min(180, a));
      anglesRef.current[j] = v;
      postToSim({ type: 'rx:setJoint', joint: j, angle: Math.round(v) });
      hwJointRef.current(j, Math.round(v));
    };
    const armGit = async (
      t: number, o: number, d: number, g: number, ms: number, curve: string
    ) => {
      const tgt = [t, o, d, g].map((v) =>
        v == null || Number(v) < -0.5 ? null : Math.max(0, Math.min(180, Number(v) || 0)));
      const bas = [...anglesRef.current];
      const dur = Math.max(20, Number(ms) || 0);
      const t0 = performance.now();
      for (;;) {
        chk();
        const f = Math.min(1, (performance.now() - t0) / dur);
        const e = easing(f, curve);
        for (let j = 0; j < 4; j++) {
          if (tgt[j] == null) continue;
          setJointLive(j, bas[j] + ((tgt[j] as number) - bas[j]) * e);
        }
        if (f >= 1) break;
        await new Promise((r) => setTimeout(r, 20));
      }
    };
    const armEksen = (j: number, a: number, ms: number, c: string) =>
      armGit(j === 0 ? a : -1, j === 1 ? a : -1, j === 2 ? a : -1, j === 3 ? a : -1, ms, c);
    const armTut = (open: boolean, ms: number) => armEksen(3, open ? 40 : 100, ms, 'easeout');
    const log = (m: string) => setSimLog((l) => [...l.slice(-150), m]);
    const noopAsync = async () => { await frame(); };
    armApi.current = {
      frame,
      wait: async (ms: number) => {
        const end = performance.now() + Math.max(0, Number(ms) || 0);
        while (performance.now() < end) { chk(); await new Promise((r) => setTimeout(r, 15)); }
      },
      print: (x: unknown) => log(String(x)),
      millis: () => Math.round(performance.now()),
      map: (v: number, fl: number, fh: number, tl: number, th: number) => {
        const a = +v, b = +fl, c = +fh, d = +tl, e = +th;
        return c === b ? d : Math.round(((a - b) * (e - d)) / (c - b) + d);
      },
      keyDown: async (k: string) => { await frame(); return keysRef.current.has(k); },
      keyOnce: async (k: string) => {
        await frame();
        if (keysOnceRef.current.has(k)) { keysOnceRef.current.delete(k); return true; }
        return false;
      },
      stopProgram: () => { runCtl.current.abort = true; throw STOP; },
      // 🦾 kol hareketleri (firmware kütüphanesiyle aynı sekanslar)
      armGit, armEksen,
      armMerkez: (ms: number) => armGit(90, 90, 90, 40, ms, 'ease'),
      armTut,
      armSelam: async (kez: number) => {
        await armEksen(1, 140, 600, 'ease');
        const n = Math.max(1, Math.round(Number(kez) || 1));
        for (let i = 0; i < n; i++) {
          await armEksen(2, 130, 300, 'easeout');
          await armEksen(2, 60, 300, 'easeout');
        }
        await armEksen(2, 90, 250, 'ease');
        await armEksen(1, 90, 500, 'ease');
      },
      armKupAl: async (taban: number, alcak: number) => {
        await armTut(true, 300);
        await armGit(taban, 120, 80, -1, 700, 'ease');
        await armGit(-1, alcak, 70, -1, 600, 'easeout');
        await armTut(false, 400);
        await armGit(-1, 120, 90, -1, 600, 'ease');
      },
      armKupBirak: async (taban: number, alcak: number) => {
        await armGit(taban, 120, 85, -1, 800, 'ease');
        await armGit(-1, alcak, 75, -1, 600, 'easeout');
        await armTut(true, 350);
        await armGit(-1, 120, 90, -1, 550, 'ease');
      },
      // Paylaşılan üretecin diğer API'leri kol panelinde zararsız stub:
      motor: noopAsync, motorStop: noopAsync, motorStopAll: noopAsync,
      l9110: noopAsync, l9110Stop: noopAsync,
      tone: noopAsync, toneOff: noopAsync,
      rgbAll: noopAsync, rgbOne: noopAsync, rgbClear: noopAsync,
      matrixPixel: noopAsync, matrixShow: noopAsync, matrixClear: noopAsync,
      pinMode: noopAsync, digitalWrite: noopAsync, pwmWrite: noopAsync,
      ledExt: noopAsync, ledBuiltin: noopAsync, servo: noopAsync,
      encInit: noopAsync, encReset: noopAsync,
      encCount: async () => { await frame(); return 0; },
      encSpeed: async () => { await frame(); return 0; },
      distance: async () => { await frame(); return 999; },
      digital: async () => { await frame(); return 0; },
      analog: async () => { await frame(); return 0; },
      pot: async () => { await frame(); return 50; },
      ldr: async () => { await frame(); return 50; },
      button: async () => { await frame(); return false; },
    };
  }

  const runBlocks = () => {
    if (simRunning) return;
    setSimRunErr(null);
    let code = '';
    try {
      const ws = Blockly.getMainWorkspace();
      if (!ws) { setSimRunErr('Blok çalışma alanı bulunamadı.'); return; }
      code = generateArmSimCode(ws as Blockly.Workspace);
    } catch (e) {
      setSimRunErr('Kod üretilemedi: ' + (e as Error).message);
      return;
    }
    if (!code.trim()) {
      setSimRunErr('Önce bloklarla bir kol programı yaz (🦾 blokları).');
      return;
    }
    runCtl.current = { abort: false };
    keysOnceRef.current.clear();
    setSimRunning(true);
    setSimLog(['▶ Simülasyonda çalışıyor…']);
    let fn: (bot: unknown) => Promise<void>;
    try {
      fn = new Function('bot', '"use strict"; return (async () => {\n' + code + '\n})();') as typeof fn;
    } catch (e) {
      setSimRunErr('Sözdizimi hatası: ' + (e as Error).message);
      setSimRunning(false);
      return;
    }
    fn(armApi.current)
      .then(() => setSimLog((l) => [...l, '✔ Program bitti.']))
      .catch((e: unknown) => {
        if (e && (e as { __stop?: boolean }).__stop) setSimLog((l) => [...l, '⏹ Durduruldu.']);
        else setSimLog((l) => [...l, 'Hata: ' + ((e as Error)?.message || String(e))]);
      })
      .finally(() => setSimRunning(false));
  };
  const stopBlocks = () => { runCtl.current.abort = true; };
  // Panel kapanırken çalışan simülasyonu durdur
  useEffect(() => () => { runCtl.current.abort = true; }, []);

  // --- sim'den gelen mesajlar ---
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || typeof d !== 'object' || d.source !== 'roboexx-arm') return;
      switch (d.type) {
        case 'rx:ready':
          setSimReady(true);
          // kaydedilmiş gripper düzenini + küp ayarlarını simülasyona uygula
          postToSim({ type: 'rx:gripperTransform', ...cfgRef.current.gripper });
          postToSim({ type: 'rx:setCube', cm: cfgRef.current.pick.cubeCm });
          postToSim({ type: 'rx:setHeight', cm: cfgRef.current.pick.heightCm });
          postToSim({ type: 'rx:setStance', on: cfgRef.current.pick.stance180 });
          break;
        case 'rx:pick':
          if (d.target) setPickReport({ target: d.target, reached: d.reached, err: d.err, cube: d.cube });
          break;
        case 'rx:holding':
          setHolding(!!d.on);
          break;
        case 'rx:parts':
          if (Array.isArray(d.parts)) setPartsList(d.parts);
          break;
        case 'rx:points':
          if (typeof d.n === 'number') setPointCount(d.n);
          break;
        case 'rx:repeatState':
          setRepeating(!!d.on);
          break;
        case 'rx:tip':
          if (typeof d.x === 'number') setTip({ x: d.x, y: d.y, z: d.z, r: d.r });
          break;
        case 'rx:ik': {
          // Sim kol hedefe gitti → aynı açıları gerçek kola gönder
          if (Array.isArray(d.angles)) {
            d.angles.slice(0, 4).forEach((a: number, i: number) => { anglesRef.current[i] = a; });
            hwSendAll(d.angles);   // Pico REPL veya Arduino canlı sketch
          }
          if (typeof d.reach === 'number') setLastReach(d.reach);
          break;
        }
        case 'rx:joint': {
          // Slider canlı sürüş → ilgili servoyu gerçek kola yaz (throttle)
          if (typeof d.joint === 'number' && typeof d.angle === 'number') {
            anglesRef.current[d.joint] = d.angle;   // sim-run başlangıcı doğru olsun
            hwSendJoint(d.joint, d.angle);
          }
          break;
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [hwSendAll, hwSendJoint]);

  // App → bu panel: gerçek servo telemetrisi → sim yansıtma
  useImperativeHandle(ref, () => ({
    applyServoTelemetry(code: number, id: number, angle: number) {
      const joint = jointForServo(cfgRef.current, code, id);
      if (joint < 0) return;
      // Sim'in kendi gönderdiği komutun yankısıysa yok say (echo döngüsü kırma).
      // Blok çalıştırınca gelen telemetri ise (sim göndermedi) normal yansır.
      if (performance.now() - (drivenAt.current[joint] || 0) < 800) return;
      const logical = physicalToLogical(cfgRef.current.joints[joint], angle);
      anglesRef.current[joint] = logical;
      postToSim({ type: 'rx:setJoint', joint, angle: logical });
    },
  }), [postToSim]);

  // --- kontroller ---
  const homeAll = () => {
    postToSim({ type: 'rx:home' });
    anglesRef.current = [90, 90, 90, 82];
    hwSendAll([90, 90, 90, 90]);
  };
  const toggleGoto = () => {
    const next = !gotoOn;
    setGotoOn(next);
    if (next) { setPointModeOn(false); setRepeating(false); }
    postToSim({ type: 'rx:enableGoto', on: next });
  };
  const togglePointMode = () => {
    const next = !pointModeOn;
    setPointModeOn(next);
    if (next) { setGotoOn(false); }
    postToSim({ type: 'rx:pointMode', on: next });
  };
  const clearPoints = () => {
    postToSim({ type: 'rx:clearPoints' });
    setPointCount(0);
    setRepeating(false);
  };
  const toggleRepeat = () => {
    if (repeating) {
      postToSim({ type: 'rx:repeat', on: false });
      setRepeating(false);
    } else {
      // tekrar başlarken nokta ekleme modundan çık
      setPointModeOn(false);
      postToSim({ type: 'rx:pointMode', on: false });
      postToSim({ type: 'rx:repeat', on: true, dwell });
    }
  };

  const updateJoint = (i: number, patch: Partial<ArmConfig['joints'][number]>) => {
    setCfg((c) => {
      const joints = c.joints.map((j, idx) => (idx === i ? { ...j, ...patch } : j)) as ArmConfig['joints'];
      return { ...c, joints };
    });
  };
  const usesPca = cfg.joints.some((j) => j.kind === 'pca');

  // --- gripper düzeni ---
  const setGripper = (patch: Partial<ArmConfig['gripper']>) => {
    setCfg((c) => {
      const gripper = { ...c.gripper, ...patch };
      postToSim({ type: 'rx:gripperTransform', ...gripper });
      return { ...c, gripper };
    });
  };
  const flip = (axis: 0 | 1 | 2) => {
    const rot = [...cfg.gripper.rot] as [number, number, number];
    let v = (((rot[axis] + 180) % 360) + 360) % 360;
    if (v > 180) v -= 360;
    rot[axis] = v;
    setGripper({ rot });
  };
  const toggleGripPart = (name: string) => {
    const has = cfg.gripper.parts.includes(name);
    const parts = has ? cfg.gripper.parts.filter((n) => n !== name) : [...cfg.gripper.parts, name];
    setGripper({ parts });
  };
  // Sıfırla = fabrika çevirme varsayılanına dön (düz değil, 180° flip)
  const resetGripper = () => setGripper({
    parts: [], rot: [0, 0, 0], pos: [0, 0, 0], pivot: [0, 0, 0],
  });
  const hl = (name: string | null) => postToSim({ type: 'rx:highlight', name });

  // --- küp alma ayarları ---
  const setCubeCm = (cm: number) => {
    setCfg((c) => ({ ...c, pick: { ...c.pick, cubeCm: cm } }));
    postToSim({ type: 'rx:setCube', cm });
  };
  const setHeightCm = (cm: number) => {
    setCfg((c) => ({ ...c, pick: { ...c.pick, heightCm: cm } }));
    postToSim({ type: 'rx:setHeight', cm });
  };
  const setStance180 = (on: boolean) => {
    setCfg((c) => ({ ...c, pick: { ...c.pick, stance180: on } }));
    postToSim({ type: 'rx:setStance', on });
  };

  return (
    <div className={`robotarm-panel ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="robotarm-header">
        <span className="robotarm-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 6v4M7 14l5-4 5 4M5 20h14M7 14v6M17 14v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Robot Kol
          <span className={`robotarm-dot ${simReady ? 'ok' : ''}`} title={simReady ? 'Simülasyon hazır' : 'Yükleniyor…'} />
          {tip && (
            <span className="robotarm-tip" title="Gripper ucunun IK konumu (cm)">
              uç: {tip.x}, {tip.y}, {tip.z} cm · merkeze {tip.r}
            </span>
          )}
        </span>
        <div className="robotarm-header-actions">
          <button className="btn btn-ghost btn-icon-only" onClick={onToggleFullscreen} title={fullscreen ? 'İkili görünüm' : 'Tam ekran'}>
            {fullscreen ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            )}
          </button>
          <button className="btn btn-ghost btn-icon-only" onClick={onClose} title="Kapat">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {/* Kol canlı kontrol sketch'i için gömülü yükleyici */}
      <ArduinoUploader
        open={armUpOpen}
        onClose={() => setArmUpOpen(false)}
        source={buildArmLiveSketch(cfg)}
      />

      <div className="robotarm-body">
        <div className="robotarm-stage">
          <iframe
            ref={iframeRef}
            src={SIM_URL}
            title="Robot Kol Simülasyonu"
            className="robotarm-iframe"
          />
        </div>

        <aside className="robotarm-config">
          <div className="robotarm-config-scroll">
            {/* KART & SİMÜLASYONDA ÇALIŞTIR */}
            <div className="ra-section">
              <h4 className="ra-h">Kart &amp; Çalıştır</h4>
              <label className="ra-field">
                <span>Kontrol kartı</span>
                <select
                  value={board}
                  onChange={(e) => setCfg((c) => ({ ...c, board: e.target.value as 'pico' | 'arduino' }))}
                >
                  <option value="pico">Pico W (USB · MicroPython)</option>
                  <option value="arduino">Arduino Uno / Nano (canlı sketch)</option>
                </select>
              </label>

              <div className="ra-row">
                {simRunning ? (
                  <button className="btn btn-danger" onClick={stopBlocks} style={{ flex: 1 }}>
                    ■ Durdur
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={runBlocks} style={{ flex: 1 }}>
                    ▶ Simülasyonda çalıştır
                  </button>
                )}
              </div>
              {simRunErr && <p className="ra-warn">{simRunErr}</p>}
              {simLog.length > 0 && (
                <pre ref={simLogRef} className="ra-simlog">{simLog.join('\n')}</pre>
              )}
              <p className="ra-hint">
                Bloklardaki 🦾 kol hareketleri <b>kart olmadan</b> simülasyonda oynar.
                {board === 'pico'
                  ? ' Pico bağlıysa gerçek kol da aynı anda hareket eder.'
                  : ' Arduino canlı bağlantısı açıksa gerçek kol da aynı anda hareket eder.'}
                {' '}Eğitim için: 🎓 Eğitmen Kütüphanesi → RoboArm Kiti → <b>20 görev</b>.
              </p>

              {board === 'arduino' && (
                <>
                  <div className="ra-live-row">
                    <span className={`robotarm-dot ${armLive ? 'ok' : ''}`} />
                    <span>Arduino canlı bağlantı: <b>{armLive ? 'açık' : 'kapalı'}</b></span>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setArmUpOpen(true)}>
                    ⬆ Kol kontrol sketch'ini yükle (gerekli)
                  </button>
                  {armHasNonNormalJoints(cfg) && (
                    <p className="ra-warn">
                      Sürücü/PCA9685 tipli eklemler Arduino canlı kontrolde desteklenmez —
                      bu eklemler varsayılan pine (3/5/6/9) düşer. Tip: "Normal servo" seç.
                    </p>
                  )}
                  <p className="ra-hint">
                    <b>Kurulum (bir kez):</b> ① Aşağıdaki "Eklemler"den servo pinlerini gir
                    (Uno/Nano önerisi: 3·5·6·9). ② <b>Sketch'i yükle</b>'ye bas — derlenip karta
                    yazılır, bağlantı otomatik açılır. ③ Artık kaydırıcı, Tıkla-Git ve
                    "Simülasyonda çalıştır" gerçek kolu da sürer. Pin değiştirirsen sketch'i
                    yeniden yükle. (Blok programını kalıcı yazmak için üstteki
                    <b> Arduino'ya Yükle</b> ayrıdır.)
                  </p>
                </>
              )}
            </div>

            <div className="ra-section">
              <div className="ra-actions">
                <button className={`btn btn-secondary ra-goto ${gotoOn ? 'is-on' : ''}`} onClick={toggleGoto}>
                  {gotoOn ? '● Tıkla-Git açık' : 'Tıkla-Git (IK)'}
                </button>
                <button className="btn btn-ghost" onClick={homeAll} title="Sim + gerçek kolu 90°'ye getir">
                  Tümü 90° (kalibrasyon)
                </button>
              </div>
              <p className="ra-hint">
                {gotoOn
                  ? 'Sahnede zemine tıkla — kol oraya gider; bağlıysa gerçek kol da gider.'
                  : 'Simülasyonu 90°, fiziksel kolu da 90° yap; sonra birlikte çalışırlar.'}
                {lastReach !== null && <> · son hedef sapma: <b>{lastReach} cm</b></>}
              </p>
              {board === 'pico' && !connected && (
                <p className="ra-warn">Pico bağlı değil — komutlar yalnızca simülasyonda çalışır.</p>
              )}
              {board === 'arduino' && !armLive && (
                <p className="ra-warn">Arduino canlı bağlantı kapalı — üstteki bölümden sketch'i yükle.</p>
              )}
              {board === 'pico' && connected && !bootDone && (
                <button className="btn btn-ghost ra-boot" onClick={ensureBoot}>Modülleri hazırla (import)</button>
              )}
            </div>

            <div className="ra-section">
              <h4 className="ra-h">Nokta tekrarı (pick &amp; place)</h4>
              <div className="ra-actions">
                <button
                  className={`btn btn-secondary ${pointModeOn ? 'is-on ra-goto' : ''}`}
                  onClick={togglePointMode}
                  disabled={repeating}
                >
                  {pointModeOn ? `● Nokta ekle açık (${pointCount})` : 'Nokta ekle'}
                </button>
                <div className="ra-row">
                  <button
                    className={`btn ${repeating ? 'btn-danger' : 'btn-primary'}`}
                    onClick={toggleRepeat}
                    disabled={pointCount < 2}
                    style={{ flex: 1 }}
                  >
                    {repeating ? '■ Durdur' : `▶ Tekrarla (${pointCount} nokta)`}
                  </button>
                  <button className="btn btn-ghost" onClick={clearPoints} disabled={repeating}>Temizle</button>
                </div>
                <label className="ra-field ra-field-inline">
                  <span>Bekleme (ms)</span>
                  <input
                    type="number" min={0} max={5000} step={50} value={dwell}
                    onChange={(e) => setDwell(Math.max(0, +e.target.value))}
                    disabled={repeating}
                  />
                </label>
              </div>
              <p className="ra-hint">
                <b>Nokta ekle</b>'yi aç, sahnede zemine sırayla tıklayarak 2+ hedef nokta koy.
                Sonra <b>Tekrarla</b> ile kol noktalar arasında döngüye girer; bağlıysa gerçek kol da
                aynı sırayı tekrarlar.
              </p>
            </div>

            <div className="ra-section">
              <h4 className="ra-h">Küp alma</h4>
              <div className="ra-row">
                <label className="ra-field">
                  <span>Küp kenarı (cm)</span>
                  <input
                    type="number" min={0.5} max={15} step={0.5}
                    value={cfg.pick.cubeCm}
                    onChange={(e) => setCubeCm(Math.max(0.5, +e.target.value || 3))}
                  />
                </label>
                <label className="ra-field">
                  <span>Hedef yükseklik (cm)</span>
                  <input
                    type="number" min={0} max={40} step={0.5}
                    value={cfg.pick.heightCm}
                    onChange={(e) => setHeightCm(Math.max(0, +e.target.value || 0))}
                  />
                </label>
              </div>
              <label className="ra-grip-slider">
                <span>Yükseklik</span>
                <input
                  type="range" min={0} max={40} step={0.5}
                  value={cfg.pick.heightCm}
                  onChange={(e) => setHeightCm(+e.target.value)}
                />
                <b>{cfg.pick.heightCm.toFixed(1)}</b>
              </label>
              <label className="ra-check">
                <input
                  type="checkbox"
                  checked={cfg.pick.stance180}
                  onChange={(e) => setStance180(e.target.checked)}
                />
                <span>Robot duruşunu 180° çevir (tüm kol)</span>
              </label>

              <div className="ra-actions">
                <button
                  className={`btn ${holding ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => {
                    if (holding) { postToSim({ type: 'rx:placeCancel' }); }
                    else { postToSim({ type: 'rx:pickHold' }); }
                  }}
                >
                  {holding ? '■ Tutmayı bırak (iptal)' : '✊ Küpü Al ve Tut'}
                </button>
              </div>
              {holding && (
                <p className="ra-hint" style={{ color: 'var(--rx-accent)' }}>
                  Küp tutuluyor. <b>Bırakmak için simülasyonda hedef noktaya tıkla</b> — kol oraya gider,
                  küpü bırakır (gerçek kol da aynısını yapar).
                </p>
              )}
              <p className="ra-hint">
                <b>Hedef yükseklik</b> ile "Tıkla-Git" artık zemine değil, <b>havada</b> o yükseklikteki
                noktaya gider — Z/yükseklikte istediğin yere taşı. Küp kenarını gerçek küpüne göre gir.
              </p>
              {pickReport && (
                <div className="ra-pick-report">
                  <div>Hedef: <b>{pickReport.target.x}, {pickReport.target.y}, {pickReport.target.z}</b> cm</div>
                  <div>Ulaşılan: <b>{pickReport.reached.x}, {pickReport.reached.y}, {pickReport.reached.z}</b> cm</div>
                  <div className={pickReport.err > 2.5 ? 'ra-pick-bad' : 'ra-pick-ok'}>
                    Sapma: <b>{pickReport.err} cm</b>{pickReport.err > 2.5 ? ' — erişemiyor, Z/yükseklik ayarla' : ''}
                  </div>
                </div>
              )}
            </div>

            <div className="ra-section">
              <h4 className="ra-h">Eklem → Servo eşlemesi & kalibrasyon</h4>
              {cfg.joints.map((j, i) => (
                <div className="ra-joint" key={i}>
                  <div className="ra-joint-label">{j.label}</div>
                  <div className="ra-joint-grid">
                    <label className="ra-field">
                      <span>Tip</span>
                      <select
                        value={j.kind}
                        onChange={(e) => updateJoint(i, { kind: e.target.value as ServoKind })}
                      >
                        <option value="normal">{KIND_LABELS.normal}</option>
                        <option value="driver">{KIND_LABELS.driver}</option>
                        <option value="pca">{KIND_LABELS.pca}</option>
                      </select>
                    </label>
                    <label className="ra-field ra-field-narrow">
                      <span>{ID_LABEL[j.kind]}</span>
                      <input
                        type="number"
                        min={ID_MIN[j.kind]}
                        max={ID_MAX[j.kind]}
                        value={j.id}
                        onChange={(e) => updateJoint(i, { id: +e.target.value })}
                      />
                    </label>
                    <label className="ra-field ra-field-narrow">
                      <span>Ofset°</span>
                      <input
                        type="number"
                        min={-90}
                        max={90}
                        value={j.offset}
                        onChange={(e) => updateJoint(i, { offset: +e.target.value })}
                      />
                    </label>
                    <label className="ra-field ra-field-check">
                      <input
                        type="checkbox"
                        checked={j.invert}
                        onChange={(e) => updateJoint(i, { invert: e.target.checked })}
                      />
                      <span>Ters</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {usesPca && (
              <div className="ra-section">
                <h4 className="ra-h">PCA9685 I2C</h4>
                <div className="ra-joint-grid">
                  <label className="ra-field ra-field-narrow">
                    <span>SDA</span>
                    <input type="number" min={0} max={28} value={cfg.pca.sda}
                      onChange={(e) => setCfg((c) => ({ ...c, pca: { ...c.pca, sda: +e.target.value } }))} />
                  </label>
                  <label className="ra-field ra-field-narrow">
                    <span>SCL</span>
                    <input type="number" min={0} max={28} value={cfg.pca.scl}
                      onChange={(e) => setCfg((c) => ({ ...c, pca: { ...c.pca, scl: +e.target.value } }))} />
                  </label>
                  <label className="ra-field ra-field-narrow">
                    <span>Adres 0x</span>
                    <input type="text" value={cfg.pca.addr.toString(16).toUpperCase()}
                      onChange={(e) => {
                        const v = parseInt(e.target.value || '40', 16);
                        if (!Number.isNaN(v)) setCfg((c) => ({ ...c, pca: { ...c.pca, addr: v } }));
                      }} />
                  </label>
                </div>
                <p className="ra-hint">PCA tipi eklemler için bir kez init edilir.</p>
              </div>
            )}

            <div className="ra-section">
              <h4 className="ra-h">Aparatı çevir (gripper'a dokunmaz)</h4>
              <p className="ra-hint">
                Çevrilecek <b>aparatı</b> aşağıdan seç (üzerine gelince simülasyonda parlar),
                sonra <b>180°</b> ile yerinde ters çevir. Sadece seçili parça döner; gripper ve
                diğer parçalar yerinde kalır.
              </p>

              <div className="ra-grip-flips">
                <span>180° çevir:</span>
                <button className="btn btn-ghost" onClick={() => flip(0)}>X</button>
                <button className="btn btn-ghost" onClick={() => flip(1)}>Y</button>
                <button className="btn btn-ghost" onClick={() => flip(2)}>Z</button>
                <button className="btn btn-ghost ra-grip-reset" onClick={resetGripper}>Sıfırla</button>
              </div>

              <div className="ra-parts">
                {partsList.length === 0 && <span className="ra-hint">Parçalar yükleniyor…</span>}
                {partsList
                  .filter((p) => p.group !== 'grip')
                  .map((p) => {
                    const on = cfg.gripper.parts.includes(p.name);
                    return (
                      <label
                        key={p.name}
                        className={`ra-part ${on ? 'is-on' : ''}`}
                        onMouseEnter={() => hl(p.name)}
                        onMouseLeave={() => hl(null)}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleGripPart(p.name)} />
                        <span className="ra-part-sw" style={{ background: '#' + p.color.toString(16).padStart(6, '0') }} />
                        <span className="ra-part-name">{p.name}</span>
                        <span className="ra-part-grp">{p.group}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
});
