import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
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
import { bench } from '../robotarm/hw-bench';
import { calistir as vmCalistir, bloklariAc, type CalismaAlani } from '../robotarm/vm';
import { gorevKontrol, type KontrolSonucu } from '../robotarm/checker';
import { bulgulariIsaretle, isaretleriTemizle, blogaGit, calisanBlok } from '../robotarm/block-marks';
import { type Gorev } from '../robotarm/tasks';
import { ManualBench } from './ManualBench';
import { SetupBar, HardwarePanel, OutputStrip } from './SetupBar';
import {
  kurulumOku, kurulumYaz, pinEklemHaritasi, anahtariUyarla, cevreHaritasi, type Kurulum,
} from '../robotarm/setup';
import { ArmTaskBar } from './ArmTaskBar';


/** App'in serial telemetrisini panele iletmesi için imperative handle. */
export interface RobotArmHandle {
  /** Kodlu modda programı çalıştır (blok sütunundaki düğme çağırır). */
  runBlocks: () => void;
  stopBlocks: () => void;
  /** Firmware'den gelen servo telemetrisi: gerçek→sim yansıtma. */
  applyServoTelemetry(code: number, id: number, angle: number): void;
}

/** Kodlu = ekran ikiye bölük, bloklar solda; Kodsuz = eski tam panel. */
export type ArmMode = 'kodlu' | 'kodsuz';

interface Props {
  /** Pico bağlı mı? */
  connected: boolean;
  /** Çalışma modu — App yönetir (blok sütunu buna göre gösterilir). */
  mode: ArmMode;
  onModeChange: (m: ArmMode) => void;
  /** Kodlu modda kontrol edilecek görev — App seçer, panel çalıştırır. */
  gorev: Gorev | null;
  /** Kontrol bitince App'e bildir (rapor blok tarafında gösterilir). */
  onKontrolSonucu: (s: KontrolSonucu | null) => void;
  onKontrolBasladi: () => void;
  onCalisiyorDegisti: (c: boolean) => void;
  onGorevSec: (g: Gorev) => void;
  kontrol: KontrolSonucu | null;
  kontrolEdiliyor: boolean;
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
  { connected, mode, onModeChange, gorev, onKontrolSonucu, onKontrolBasladi,
    onCalisiyorDegisti, onGorevSec, kontrol, kontrolEdiliyor,
    onSendCode, fullscreen, onToggleFullscreen, onClose }, ref
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

  /** Kodlu modun alt bölümü: görev/hata · donanım · kurulum. */
  const [altSekme, setAltSekme] = useState<'gorev' | 'donanim' | 'kurulum'>('gorev');

  /** Kart + pin seçimi. Cevap anahtarları buna göre çevrilir. */
  const [kurulum, setKurulum] = useState<Kurulum>(() => kurulumOku());
  const kurulumRef = useRef(kurulum); kurulumRef.current = kurulum;
  const kurulumDegis = (k: Kurulum) => { setKurulum(k); kurulumYaz(k); };
  useEffect(() => { bench.pinAyarla(cevreHaritasi(kurulum)); }, [kurulum]);

  /** 🎯 Kalibrasyon: tüm servoları 90°'ye al — simülasyonda ve kartta. */
  const kalibreEt = useCallback(() => {
    [0, 1, 2, 3].forEach((j) => {
      anglesRef.current[j] = 90;
      postToSim({ type: 'rx:setJoint', joint: j, angle: 90 });
      hwJointRef.current(j, 90);
    });
    setManualAngles([90, 90, 90, 90]);
    bench.sifirla();
    setSimLog((l) => [...l.slice(-150), '🎯 Kalibrasyon: tüm servolar 90° — kolu düz duruma getir.']);
  }, []);

  /** Kodsuz modda kaydırıcıların gösterdiği açılar. */
  const [manualAngles, setManualAngles] = useState<number[]>([90, 90, 90, 40]);

  /** Simülasyon içindeki "Servo Kontrolü" panelinin görünürlüğü.
   *  Tamamı kapatılabilir; parçalar (kaydırıcılar, seri satırı, düğmeler,
   *  durum, koordinat) tek tek gizlenebilir. */
  const [simUi, setSimUi] = useState(() => {
    try {
      const k = localStorage.getItem('roboexx.roboarm.simui');
      if (k) return JSON.parse(k) as Record<string, boolean>;
    } catch { /* yoksay */ }
    return { panel: true, j0: true, j1: true, j2: true, j3: true, serial: true, buttons: true, status: true, coords: true };
  });
  useEffect(() => {
    try { localStorage.setItem('roboexx.roboarm.simui', JSON.stringify(simUi)); } catch { /* yoksay */ }
    postToSim({ type: 'rx:ui', panel: simUi.panel, parts: simUi });
  }, [simUi, simReady]);

  /** Kodlu modda simülasyon ile hata panelinin oranı (%). Sürüklenebilir. */
  const [simYuzde, setSimYuzde] = useState<number>(() => {
    const v = Number(localStorage.getItem('roboexx.roboarm.simyuzde'));
    return Number.isFinite(v) && v >= 20 && v <= 85 ? v : 52;
  });
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const surukle = (e: React.PointerEvent) => {
    e.preventDefault();
    const kutu = bodyRef.current?.getBoundingClientRect();
    if (!kutu) return;
    const hedef = e.currentTarget as HTMLElement;
    hedef.setPointerCapture(e.pointerId);
    const hareket = (ev: PointerEvent) => {
      const y = ((ev.clientY - kutu.top) / kutu.height) * 100;
      setSimYuzde(Math.max(20, Math.min(85, y)));
    };
    const bitir = () => {
      hedef.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', hareket);
      window.removeEventListener('pointerup', bitir);
      setSimYuzde((v) => { try { localStorage.setItem('roboexx.roboarm.simyuzde', String(v)); } catch { /* yoksay */ } return v; });
    };
    window.addEventListener('pointermove', hareket);
    window.addEventListener('pointerup', bitir);
  };

  // Görev App'te tutulur (rapor blok sütununda gösteriliyor).
  const gorevRef = useRef<Gorev | null>(null); gorevRef.current = gorev;
  useEffect(() => { onCalisiyorDegisti(simRunning); }, [simRunning, onCalisiyorDegisti]);
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

  /**
   * ▶ ÇALIŞTIR — üç şey aynı anda olur:
   *   1. Program cevap anahtarıyla karşılaştırılır (anında, sanal saatle)
   *   2. Hatalar blokların üstüne uyarı balonu olarak konur
   *   3. Simülasyon canlı oynar; o an çalışan blok vurgulanır
   */
  const runBlocks = () => {
    if (simRunning) return;
    setSimRunErr(null);
    onKontrolSonucu(null);

    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg | null;
    if (!ws) { setSimRunErr('Blok çalışma alanı bulunamadı.'); return; }

    let alan: CalismaAlani;
    try {
      alan = Blockly.serialization.workspaces.save(ws) as unknown as CalismaAlani;
    } catch (e) {
      setSimRunErr('Program okunamadı: ' + (e as Error).message);
      return;
    }
    if (!alan.blocks?.blocks?.length) {
      setSimRunErr('Çalışma alanı boş — önce blokları yerleştir.');
      return;
    }

    isaretleriTemizle(ws);
    bench.sifirla();
    runCtl.current = { abort: false };
    keysOnceRef.current.clear();
    setSimRunning(true);
    setSimLog(['▶ Simülasyonda çalışıyor…']);

    // (1)+(2) Kontrol arka planda anında koşar, sonucu bloklara işlenir.
    const hedefGorev = gorevRef.current;
    if (hedefGorev) {
      onKontrolBasladi();
      // Cevap anahtarı öğrencinin kartına/pinlerine çevrilir, sonra
      // karşılaştırılır — PicoBricks'te "Sürücü Servo" yazan çocuk
      // "yanlış blok" uyarısı almaz.
      gorevKontrol(
        alan,
        anahtariUyarla(hedefGorev.anahtar, kurulumRef.current),
        pinEklemHaritasi(kurulumRef.current),
        cevreHaritasi(kurulumRef.current),
      )
        .then((sonuc) => {
          onKontrolSonucu(sonuc);
          const n = bulgulariIsaretle(ws, sonuc.bulgular);
          setSimLog((l) => [...l,
            sonuc.puan >= 90
              ? `✔ Görev kontrolü: ${sonuc.puan}/100 — tamam`
              : `◐ Görev kontrolü: ${sonuc.puan}/100 · ${n} blok işaretlendi`,
          ]);
        })
        .catch((e: Error) => {
          onKontrolSonucu(null);
          setSimLog((l) => [...l, 'Kontrol yapılamadı: ' + e.message]);
        });
    }

    // (3) Canlı simülasyon — servo pinleri panel ayarından da eşlenir.
    // Pin haritası öğrencinin KURULUMUNDAN gelir (kart + seçtiği pinler),
    // ayrıca panelin kendi eklem ayarı da eklenir.
    const pinEklem: Record<number, number> = { ...pinEklemHaritasi(kurulumRef.current) };
    cfgRef.current.joints.forEach((j, i) => { if (j.kind === 'normal') pinEklem[j.id] = i; });

    vmCalistir(alan, {
      live: true,
      pinEklem,
      cevre: cevreHaritasi(kurulumRef.current),
      durdur: () => runCtl.current.abort,
      tuslar: keysRef.current,
      tuslarBir: keysOnceRef.current,
      eklemYaz: (eklem, aci) => {
        const v = Math.max(0, Math.min(180, aci));
        anglesRef.current[eklem] = v;
        postToSim({ type: 'rx:setJoint', joint: eklem, angle: Math.round(v) });
        hwJointRef.current(eklem, Math.round(v));
      },
      onBlok: (bid) => calisanBlok(ws, bid),
      onOlay: (o) => { if (o.k === 'print') setSimLog((l) => [...l.slice(-150), String(o.text)]); },
    })
      .then((r) => {
        setSimLog((l) => [...l, r.hata ? '✖ ' + r.hata : '✔ Program bitti.']);
        if (r.hata) setSimRunErr(r.hata);
      })
      .catch((e: unknown) => setSimLog((l) => [...l, 'Hata: ' + ((e as Error)?.message || String(e))]))
      .finally(() => {
        setSimRunning(false);
        bench.sustur();
        calisanBlok(ws, undefined);
      });
  };

  const stopBlocks = () => { runCtl.current.abort = true; bench.sustur(); };
  // Panel kapanırken çalışan simülasyonu durdur
  useEffect(() => () => { runCtl.current.abort = true; bench.sustur(); }, []);

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
    runBlocks: () => runBlocks(),
    stopBlocks: () => stopBlocks(),
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

  /** Seçili görevin cevap anahtarında geçen giriş birimleri — donanım
   *  şeridi yalnızca bunları gösterir, ekran kalabalıklaşmasın. */
  const gerekliGirisler = useMemo(() => {
    if (!gorev) return [] as Array<'mesafe' | 'pot' | 'ldr' | 'sicaklik' | 'buton'>;
    const tipler = new Set(bloklariAc(gorev.anahtar).map((b) => b.type));
    const liste: Array<'mesafe' | 'pot' | 'ldr' | 'sicaklik' | 'buton'> = [];
    if (tipler.has('rx_ultrasonic_distance')) liste.push('mesafe');
    if (tipler.has('rx_potentiometer')) liste.push('pot');
    if (tipler.has('rx_ldr_read')) liste.push('ldr');
    if (tipler.has('rx_analog_read') || tipler.has('rx_internal_temp')) liste.push('sicaklik', 'pot');
    if (tipler.has('rx_button_pressed') || tipler.has('rx_digital_read')) liste.push('buton');
    return [...new Set(liste)];
  }, [gorev]);

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
          <div className="ra-mod" role="tablist" aria-label="Simülasyon modu">
            <button
              role="tab"
              aria-selected={mode === 'kodlu'}
              className={mode === 'kodlu' ? 'is-on' : ''}
              onClick={() => onModeChange('kodlu')}
              title="Bloklar solda, simülasyon sağda — görev kontrolü açık"
            >
              Kodlu
            </button>
            <button
              role="tab"
              aria-selected={mode === 'kodsuz'}
              className={mode === 'kodsuz' ? 'is-on' : ''}
              onClick={() => onModeChange('kodsuz')}
              title="Kod yazmadan kolu elle sür — kaydırıcılar, Tıkla-Git, kalibrasyon"
            >
              Kodsuz
            </button>
          </div>
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

      {/* ══ KODLU MOD ══════════════════════════════════════════════
          Ekran ikiye bölük: bloklar App tarafında solda, burası sağ yarı.
          Üstte görev seçici + Çalıştır, ortada simülasyon, altta donanım. */}
      {mode === 'kodlu' ? (
        /* ══ KODLU MOD ═════════════════════════════════════════════
           Sağ yarı yatayda ikiye bölünür: üstte robot kol, altta görev
           metni + Çalıştır + hata. Aradaki çubuk sürüklenerek oran
           değiştirilir (tercih hatırlanır). */
        <div className="robotarm-body ra-kodlu" ref={bodyRef}>
          <div className="robotarm-stage ra-kodlu-stage" style={{ flex: `0 0 ${simYuzde}%` }}>
            <iframe
              ref={iframeRef}
              src={SIM_URL}
              title="Robot Kol Simülasyonu"
              className="robotarm-iframe"
            />
            <SimGorunum ayar={simUi} setAyar={setSimUi} />
          </div>

          <div className="ra-tutamac" onPointerDown={surukle} title="Sürükleyerek alanı büyüt/küçült">
            <span />
          </div>

          <div className="ra-alt">
            <div className="ra-sekme" role="tablist">
              {(['gorev', 'donanim', 'kurulum'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={altSekme === t}
                  className={altSekme === t ? 'is-on' : ''}
                  onClick={() => setAltSekme(t)}
                >
                  {t === 'gorev' ? 'Görev & Hata' : t === 'donanim' ? '🔌 Donanım' : '⚙️ Kurulum'}
                </button>
              ))}
            </div>

            {altSekme === 'donanim' && <HardwarePanel />}
            {altSekme === 'kurulum' && (
              <SetupBar
                kurulum={kurulum}
                onDegis={kurulumDegis}
                onKalibre={kalibreEt}
                kartBagli={connected}
              />
            )}

            <div className={altSekme === 'gorev' ? '' : 'is-gizli'}>
            <OutputStrip />
            <ArmTaskBar
              seciliId={gorev?.id ?? 0}
              onGorevSec={onGorevSec}
              calisiyor={simRunning}
              onCalistir={runBlocks}
              onDurdur={stopBlocks}
              sonuc={kontrol}
              kontrolEdiliyor={kontrolEdiliyor}
              onBlogaGit={(bid) => blogaGit(Blockly.getMainWorkspace(), bid)}
              hazirMi={simReady}
            />
            </div>
            {simRunErr && <p className="ra-warn ra-kodlu-err">{simRunErr}</p>}
          </div>
        </div>
      ) : (

      /* ══ KODSUZ MOD ═════════════════════════════════════════════
         Kod yok. Sadece robot kol ve üstündeki parçalar: dört eklem,
         RGB LED, buzzer, röle. Kalibrasyon/pin eşlemesi/nokta tekrarı
         gibi ayarlar burada YOK — çocuk parçaları tanısın diye. */
      <div className="robotarm-body ra-kodsuz">
        <div className="robotarm-stage">
          <iframe
            ref={iframeRef}
            src={SIM_URL}
            title="Robot Kol Simülasyonu"
            className="robotarm-iframe"
          />
        </div>

        <aside className="robotarm-config ra-kodsuz-yan">
          <div className="robotarm-config-scroll">
            <SetupBar
              kurulum={kurulum}
              onDegis={kurulumDegis}
              onKalibre={kalibreEt}
              kartBagli={connected}
            />
            <SimGorunum ayar={simUi} setAyar={setSimUi} satir />
            <ManualBench
              aciler={manualAngles}
              onEklem={(eklem, aci) => {
                setManualAngles((a) => { const y = [...a]; y[eklem] = aci; return y; });
                anglesRef.current[eklem] = aci;
                postToSim({ type: 'rx:setJoint', joint: eklem, angle: Math.round(aci) });
                hwJointRef.current(eklem, Math.round(aci));
              }}
              onHome={() => {
                const ev = [90, 90, 90, 40];
                setManualAngles(ev);
                ev.forEach((v, j) => {
                  anglesRef.current[j] = v;
                  postToSim({ type: 'rx:setJoint', joint: j, angle: v });
                  hwJointRef.current(j, v);
                });
                bench.sifirla();
              }}
            />
          </div>
        </aside>
      </div>
      )}
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════════
   👁 GÖRÜNÜM — simülasyonun içindeki "Servo Kontrolü" panelini
   tamamen ya da parça parça gizle. Kodlu modda ekran zaten dar;
   öğretmen istemediği kutuyu kapatabilsin diye.
   ══════════════════════════════════════════════════════════════════ */
function SimGorunum({
  ayar, setAyar, satir,
}: {
  ayar: Record<string, boolean>;
  setAyar: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  satir?: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const cevir = (k: string) => setAyar((a) => ({ ...a, [k]: !a[k] }));

  const PARCALAR: Array<[string, string]> = [
    ['j0', 'Taban kaydırıcısı'],
    ['j1', 'Omuz kaydırıcısı'],
    ['j2', 'Dirsek kaydırıcısı'],
    ['j3', 'Tutucu kaydırıcısı'],
    ['serial', 'Seri satırı'],
    ['buttons', 'Sıfırla düğmesi'],
    ['status', 'Durum satırı'],
    ['coords', 'Koordinatlar'],
  ];

  return (
    <div className={`ra-gor ${satir ? 'is-satir' : ''}`}>
      <button className="ra-gor-btn" onClick={() => setAcik((a) => !a)} title="Panelde ne görünsün?">
        👁 Görünüm {acik ? '▾' : '▸'}
      </button>
      {acik && (
        <div className="ra-gor-menu">
          <label className="ra-gor-ana">
            <input type="checkbox" checked={ayar.panel !== false} onChange={() => cevir('panel')} />
            <b>Servo Kontrolü paneli</b>
          </label>
          <div className="ra-gor-liste">
            {PARCALAR.map(([k, ad]) => (
              <label key={k} className={ayar.panel === false ? 'is-pasif' : ''}>
                <input
                  type="checkbox"
                  checked={ayar[k] !== false}
                  disabled={ayar.panel === false}
                  onChange={() => cevir(k)}
                />
                {ad}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
