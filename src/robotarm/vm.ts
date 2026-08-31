/**
 * 🧠 BLOK YORUMLAYICI — Blockly çalışma alanını doğrudan çalıştırır.
 *
 * NEDEN: Eski yol (`sim-run.ts`) blokları JavaScript metnine çevirip
 * `new Function(...)` ile koşturuyordu. Bu üç şeyi imkânsız kılıyordu:
 *   • O anda hangi BLOĞUN çalıştığını bilmek (blok üstünde hata gösterme)
 *   • Cevap anahtarını aynı motorla koşturup karşılaştırmak
 *   • Programı arka planda anında (zaman beklemeden) çalıştırmak
 *
 * Bu dosya blok JSON'unu (Blockly serialization) doğrudan yorumlar.
 * Her olay, onu üreten bloğun id'sini taşır → hata tam o bloğun üstünde
 * gösterilebilir.
 *
 * İKİ MOD:
 *   live=true   → gerçek zamanlı; simülasyonu ve donanım panelini sürer
 *   live=false  → sanal saat; anında biter, kontrol için iz (trace) döner
 */

import { bench, GUVENLI_ACI } from './hw-bench';

/* ── Tipler ─────────────────────────────────────────────────────── */

export interface BlokNode {
  type: string;
  id?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlokNode; shadow?: BlokNode }>;
  extraState?: Record<string, unknown>;
  next?: { block: BlokNode };
  x?: number; y?: number;
}

export interface CalismaAlani {
  blocks?: { languageVersion?: number; blocks: BlokNode[] };
  variables?: Array<{ name: string; id: string }>;
}

/** Programın ürettiği tek bir donanım olayı. */
export interface Olay {
  k: 'servo' | 'tone' | 'toneOff' | 'rgb' | 'relay' | 'digital' | 'pwm'
   | 'print' | 'wait' | 'read' | 'var' | 'call' | 'atla';
  /** Olayı üreten bloğun id'si — hata bu bloğun üstünde gösterilir. */
  bid?: string;
  t: number;
  pin?: number;
  joint?: number;
  val?: number;
  /** Kırpılmadan önceki ham açı — güvenlik uyarısı için */
  ham?: number;
  freq?: number;
  dur?: number;
  ms?: number;
  color?: string;
  text?: string;
  dev?: string;
  name?: string;
  type?: string;
}

export interface CalismaSonucu {
  iz: Olay[];
  ciktilar: string[];
  hata: string | null;
  hataBid?: string;
  sanalMs: number;
  adim: number;
  blokSayisi: Record<string, number>;
}

export interface CalistirSecenek {
  live?: boolean;
  /** Canlı modda eklem açısını simülasyona yazar. */
  eklemYaz?: (eklem: number, aci: number) => void;
  /** Çalışan bloğu arayüzde vurgulamak için. */
  onBlok?: (bid: string | undefined, node: BlokNode) => void;
  onOlay?: (o: Olay) => void;
  durdur?: () => boolean;
  /** Kontrol modunda sensör değerleri sabitlenir. */
  sensor?: { mesafe: number; pot: number; ldr: number; sicaklik: number; buton: boolean };
  /** Rastgele bloklar için tohum — kontrolde iki koşu aynı sonucu vermeli. */
  tohum?: number;
  maxAdim?: number;
  maxSanalMs?: number;
  /** Servo pini → eklem. Panel ayarlarından üretilir. */
  pinEklem?: Record<number, number>;
  /** Basılı tuşlar (gamepad/klavye blokları için) */
  tuslar?: Set<string>;
  tuslarBir?: Set<string>;
}

/* ── Sabitler ───────────────────────────────────────────────────── */

/** Müfredat v3 donanımı: servolar D4-D7'de. Panel ayarı bunu genişletir. */
export const MUFREDAT_PIN_EKLEM: Record<number, number> = { 4: 0, 5: 1, 6: 2, 7: 3 };
export const EKLEM_AD = ['Taban', 'Omuz', 'Dirsek', 'Tutucu'];

const DUR = Symbol('dur');

const say = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const kis = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function girdi(b: BlokNode | null, ad: string): BlokNode | null {
  const i = b?.inputs?.[ad];
  return (i?.block || i?.shadow) ?? null;
}

function degiskenAdi(alan: unknown, harita: Record<string, string>): string {
  if (alan == null) return '?';
  if (typeof alan === 'string') return harita[alan] || alan;
  const o = alan as { name?: string; id?: string };
  return o.name || (o.id ? harita[o.id] || o.id : '?');
}

/* ── Çalıştırıcı ────────────────────────────────────────────────── */

export async function calistir(
  alan: CalismaAlani,
  sec: CalistirSecenek = {},
): Promise<CalismaSonucu> {
  const live = !!sec.live;
  const maxAdim = sec.maxAdim ?? 400000;
  const maxSanalMs = sec.maxSanalMs ?? 30000;
  const durdur = sec.durdur ?? (() => false);
  const pinEklem = { ...MUFREDAT_PIN_EKLEM, ...(sec.pinEklem || {}) };

  const iz: Olay[] = [];
  const ciktilar: string[] = [];
  const blokSayisi: Record<string, number> = Object.create(null);

  let sanal = 0;
  let adim = 0;
  let hata: string | null = null;
  let hataBid: string | undefined;
  const t0 = live ? performance.now() : 0;
  const simdi = () => (live ? performance.now() - t0 : sanal);

  /* tohumlu rastgele — kontrolde tekrarlanabilirlik şart */
  let rndDurum = sec.tohum == null ? null : (sec.tohum >>> 0) || 1;
  const rnd = (): number => {
    if (rndDurum == null) return Math.random();
    rndDurum = (rndDurum * 1664525 + 1013904223) >>> 0;
    return rndDurum / 4294967296;
  };

  /* eklem durumu — canlı modda simülasyona yansır */
  const eklemAci = [90, 90, 90, 90];
  const eklemYaz = sec.eklemYaz ?? (() => {});

  /* değişken + fonksiyon tabloları */
  const varAd: Record<string, string> = Object.create(null);
  for (const v of alan.variables || []) varAd[v.id] = v.name;
  const genel: Record<string, unknown> = Object.create(null);
  const fnler: Record<string, { par: string[]; govde: BlokNode | null; don: BlokNode | null; donerMi: boolean }> = Object.create(null);

  const ustler = alan.blocks?.blocks || [];
  for (const b of ustler) {
    if (b.type === 'procedures_defnoreturn' || b.type === 'procedures_defreturn') {
      const ad = String(b.fields?.NAME ?? 'fonksiyon');
      const par = ((b.extraState?.params as unknown[]) || []).map((p) =>
        typeof p === 'string' ? p : String((p as { name?: string }).name ?? ''));
      fnler[ad] = { par, govde: girdi(b, 'STACK'), don: girdi(b, 'RETURN'), donerMi: b.type === 'procedures_defreturn' };
    }
  }

  function yay(o: Omit<Olay, 't'>): void {
    const tam = { ...o, t: Math.round(simdi()) } as Olay;
    iz.push(tam);
    sec.onOlay?.(tam);
  }

  function tik(): void {
    if (++adim > maxAdim) throw { __sinir: 'adim' };
    if (!live && sanal > maxSanalMs) throw { __sinir: 'sure' };
    if (durdur()) throw DUR;
  }

  async function bekle(ms: number, bid?: string): Promise<void> {
    const d = Math.max(0, say(ms));
    yay({ k: 'wait', ms: d, bid });
    if (live) {
      const son = performance.now() + d;
      while (performance.now() < son) {
        if (durdur()) throw DUR;
        await new Promise((r) => setTimeout(r, Math.min(16, Math.max(1, son - performance.now()))));
      }
    } else {
      sanal += d;
    }
  }

  /** Döngülerin tarayıcıyı kilitlememesi için nefes. */
  async function nefes(): Promise<void> {
    if (live) {
      if (durdur()) throw DUR;
      await new Promise((r) => setTimeout(r, 16));
      if (durdur()) throw DUR;
    } else {
      sanal += 16;
      tik();
    }
  }

  /** Gerçek servo hızını taklit et (300°/sn): beklemesiz kod hedefe varamaz. */
  async function servoSur(eklem: number, hedef: number): Promise<void> {
    const bas = eklemAci[eklem];
    eklemAci[eklem] = hedef;
    if (!live) { eklemYaz(eklem, hedef); return; }
    const sure = Math.max(30, Math.abs(hedef - bas) / 0.3);
    const b0 = performance.now();
    for (;;) {
      if (durdur()) throw DUR;
      const f = Math.min(1, (performance.now() - b0) / sure);
      eklemYaz(eklem, bas + (hedef - bas) * f);
      if (f >= 1) break;
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  /** Aynı anda birden çok eklemi hedefe götür (rx_arm_* blokları). */
  async function pozaGit(hedefler: (number | null)[], ms: number, egri: string): Promise<void> {
    const bas = [...eklemAci];
    const sure = Math.max(20, say(ms));
    const yumusat = (t: number): number =>
      egri === 'ease' ? t * t * (3 - 2 * t)
        : egri === 'easein' ? t * t
        : egri === 'easeout' ? t * (2 - t) : t;
    if (!live) {
      for (let j = 0; j < 4; j++) if (hedefler[j] != null) { eklemAci[j] = hedefler[j]!; eklemYaz(j, hedefler[j]!); }
      sanal += sure;
      return;
    }
    const b0 = performance.now();
    for (;;) {
      if (durdur()) throw DUR;
      const f = Math.min(1, (performance.now() - b0) / sure);
      const e = yumusat(f);
      for (let j = 0; j < 4; j++) {
        if (hedefler[j] == null) continue;
        const v = bas[j] + (hedefler[j]! - bas[j]) * e;
        eklemAci[j] = v;
        eklemYaz(j, v);
      }
      if (f >= 1) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    for (let j = 0; j < 4; j++) if (hedefler[j] != null) eklemAci[j] = hedefler[j]!;
  }

  const sensorOku = (ad: 'mesafe' | 'pot' | 'ldr' | 'sicaklik'): number =>
    sec.sensor ? sec.sensor[ad] : bench.durum().girisler[ad];
  const butonOku = (): boolean =>
    sec.sensor ? sec.sensor.buton : bench.durum().girisler.buton;

  /* ── DEĞER BLOKLARI ───────────────────────────────────────────── */
  async function deger(b: BlokNode | null, kapsam: Record<string, unknown> | null): Promise<unknown> {
    if (!b) return 0;
    blokSayisi[b.type] = (blokSayisi[b.type] || 0) + 1;
    tik();
    const f = (b.fields || {}) as Record<string, unknown>;
    const D = (n: string) => deger(girdi(b, n), kapsam);
    const S = async (n: string) => say(await D(n));

    switch (b.type) {
      case 'math_number': return say(f.NUM);
      case 'text': return String(f.TEXT ?? '');
      case 'logic_boolean': return f.BOOL === 'TRUE';
      case 'logic_null': return null;

      case 'variables_get': {
        const k = degiskenAdi(f.VAR, varAd);
        return kapsam && k in kapsam ? kapsam[k] : (genel[k] ?? 0);
      }

      case 'math_arithmetic': {
        const a = await S('A'), c = await S('B');
        switch (f.OP) {
          case 'ADD': return a + c;
          case 'MINUS': return a - c;
          case 'MULTIPLY': return a * c;
          case 'DIVIDE': return c === 0 ? 0 : a / c;
          case 'POWER': return Math.pow(a, c);
          default: return a + c;
        }
      }
      case 'math_single': {
        const a = await S('NUM');
        switch (f.OP) {
          case 'ROOT': return Math.sqrt(Math.abs(a));
          case 'ABS': return Math.abs(a);
          case 'NEG': return -a;
          case 'LN': return a > 0 ? Math.log(a) : 0;
          default: return a;
        }
      }
      case 'math_trig': {
        const r = (await S('NUM')) * Math.PI / 180;
        return f.OP === 'COS' ? Math.cos(r) : f.OP === 'TAN' ? Math.tan(r) : Math.sin(r);
      }
      case 'math_constrain': return kis(await S('VALUE'), await S('LOW'), await S('HIGH'));
      case 'math_modulo': { const d2 = await S('DIVISOR'); return d2 === 0 ? 0 : (await S('DIVIDEND')) % d2; }
      case 'math_round': {
        const a = await S('NUM');
        return f.OP === 'ROUNDUP' ? Math.ceil(a) : f.OP === 'ROUNDDOWN' ? Math.floor(a) : Math.round(a);
      }
      case 'math_random_int': {
        const lo = await S('FROM'), hi = await S('TO');
        return Math.floor(rnd() * (hi - lo + 1)) + lo;
      }
      case 'math_number_property': {
        const a = await S('NUMBER_TO_CHECK');
        if (f.PROPERTY === 'EVEN') return a % 2 === 0;
        if (f.PROPERTY === 'ODD') return a % 2 !== 0;
        return false;
      }

      case 'logic_compare': {
        const a = await D('A'), c = await D('B');
        const an = say(a), cn = say(c);
        switch (f.OP) {
          case 'EQ': return a === c || an === cn;
          case 'NEQ': return !(a === c || an === cn);
          case 'LT': return an < cn;
          case 'LTE': return an <= cn;
          case 'GT': return an > cn;
          case 'GTE': return an >= cn;
          default: return false;
        }
      }
      case 'logic_operation': {
        const a = await D('A');
        if (f.OP === 'AND') return a ? !!(await D('B')) : false;
        return a ? true : !!(await D('B'));
      }
      case 'logic_negate': return !(await D('BOOL'));
      case 'logic_ternary': return (await D('IF')) ? await D('THEN') : await D('ELSE');

      case 'text_join': {
        const n = say(b.extraState?.itemCount ?? 2);
        let s = '';
        for (let i = 0; i < n; i++) s += String((await D('ADD' + i)) ?? '');
        return s;
      }
      case 'text_length': return String(await D('VALUE')).length;

      /* sensörler */
      case 'rx_ultrasonic_distance': {
        await nefes();
        const v = sensorOku('mesafe');
        yay({ k: 'read', dev: 'mesafe', val: v, bid: b.id });
        return v;
      }
      case 'rx_potentiometer': {
        await nefes();
        const v = sensorOku('pot');
        yay({ k: 'read', dev: 'pot', val: v, bid: b.id });
        return v;
      }
      case 'rx_ldr_read': {
        await nefes();
        const v = sensorOku('ldr');
        yay({ k: 'read', dev: 'ldr', val: v, bid: b.id });
        return v;
      }
      case 'rx_analog_read': {
        await nefes();
        const pin = say(f.PIN ?? 26);
        const v = pin === 27 ? sensorOku('ldr') : pin === 28 ? sensorOku('sicaklik') : sensorOku('pot');
        yay({ k: 'read', dev: 'analog' + pin, val: v, bid: b.id });
        return v;
      }
      case 'rx_digital_read': {
        await nefes();
        const pin = say(f.PIN ?? 2);
        return pin === 2 ? (butonOku() ? 1 : 0) : (bench.durum().pinler[pin] ?? 0);
      }
      case 'rx_button_pressed': {
        await nefes();
        const on = butonOku();
        if (on) yay({ k: 'read', dev: 'buton', val: 1, bid: b.id });
        return on;
      }
      case 'rx_key_pressed': case 'rx_gamepad_pressed': {
        await nefes();
        const t = String(f.KEY ?? f.BTN ?? ' ');
        return !!sec.tuslar?.has(t);
      }
      case 'rx_key_just_pressed': case 'rx_gamepad_just_pressed': {
        await nefes();
        const t = String(f.KEY ?? f.BTN ?? ' ');
        if (sec.tuslarBir?.has(t)) { sec.tuslarBir.delete(t); return true; }
        return false;
      }
      case 'rx_millis': return Math.round(simdi());
      case 'rx_map': {
        const v = await S('VALUE'), fl = await S('FROM_LOW'), fh = await S('FROM_HIGH');
        const tl = await S('TO_LOW'), th = await S('TO_HIGH');
        return fh === fl ? tl : Math.round(((v - fl) * (th - tl)) / (fh - fl) + tl);
      }
      case 'rx_abs': return Math.abs(await S('VALUE'));
      case 'rx_internal_temp': case 'rx_dht11_temp': case 'rx_shtc3_temp': return sensorOku('sicaklik');
      case 'rx_dht11_humidity': case 'rx_shtc3_humidity': return 50;

      case 'procedures_callreturn':
        return await fnCagir(String(b.extraState?.name ?? ''), b, kapsam);

      default: return 0;
    }
  }

  /* ── KOMUT BLOKLARI ───────────────────────────────────────────── */
  async function zincir(b: BlokNode | null, kapsam: Record<string, unknown> | null): Promise<void> {
    let n = b;
    while (n) { await komut(n, kapsam); n = n.next?.block ?? null; }
  }

  async function komut(b: BlokNode, kapsam: Record<string, unknown> | null): Promise<void> {
    blokSayisi[b.type] = (blokSayisi[b.type] || 0) + 1;
    sec.onBlok?.(b.id, b);
    tik();
    const f = (b.fields || {}) as Record<string, unknown>;
    const D = (n: string) => deger(girdi(b, n), kapsam);
    const S = async (n: string) => say(await D(n));
    const G = (n: string) => girdi(b, n);

    switch (b.type) {
      case 'rx_on_start': await zincir(G('DO'), kapsam); break;

      /* ── SERVO → kol eklemleri ── */
      case 'rx_servo_angle': {
        const pin = say(f.PIN ?? 15);
        const ham = Math.round(await S('ANGLE'));
        const aci = kis(ham, 0, 180);
        const eklem = pinEklem[pin];
        if (eklem === undefined) {
          bench.pwmYaz(pin, aci);
          yay({ k: 'pwm', pin, val: aci, bid: b.id });
        } else {
          bench.aciUyar(eklem, ham);
          yay({ k: 'servo', pin, joint: eklem, val: aci, ham, bid: b.id });
          await servoSur(eklem, aci);
        }
        break;
      }
      case 'rx_servo_v2': case 'rx_servo_v3': {
        const id = say(f.NUM ?? f.CH ?? 1);
        const aci = kis(Math.round(await S('ANGLE')), 0, 180);
        const eklem = kis(b.type === 'rx_servo_v2' ? id - 1 : id, 0, 3);
        yay({ k: 'servo', pin: -1, joint: eklem, val: aci, ham: aci, bid: b.id });
        await servoSur(eklem, aci);
        break;
      }

      /* ── 🦾 HAZIR KOL BLOKLARI (eski görev seti) ── */
      case 'rx_arm_pins': break;
      case 'rx_arm_pose': {
        const h = [await S('T'), await S('O'), await S('D'), await S('G')]
          .map((v) => (v < -0.5 ? null : kis(Math.round(v), 0, 180)));
        h.forEach((v, j) => { if (v != null) yay({ k: 'servo', pin: -1, joint: j, val: v, ham: v, bid: b.id }); });
        await pozaGit(h, await S('MS') || 800, String(f.CURVE ?? 'ease'));
        break;
      }
      case 'rx_arm_axis': {
        const j = kis(say(f.AXIS ?? 0), 0, 3);
        const a = kis(Math.round(await S('ANGLE')), 0, 180);
        const h: (number | null)[] = [null, null, null, null];
        h[j] = a;
        yay({ k: 'servo', pin: -1, joint: j, val: a, ham: a, bid: b.id });
        await pozaGit(h, await S('MS') || 600, String(f.CURVE ?? 'ease'));
        break;
      }
      case 'rx_arm_home': {
        [90, 90, 90, 40].forEach((v, j) => yay({ k: 'servo', pin: -1, joint: j, val: v, ham: v, bid: b.id }));
        await pozaGit([90, 90, 90, 40], await S('MS') || 800, 'ease');
        break;
      }
      case 'rx_arm_gripper': {
        const a = f.ACT === 'open' ? 40 : 100;
        yay({ k: 'servo', pin: -1, joint: 3, val: a, ham: a, bid: b.id });
        await pozaGit([null, null, null, a], await S('MS') || 350, 'easeout');
        break;
      }
      case 'rx_arm_wave': {
        const n = Math.max(1, Math.round(await S('TIMES') || 1));
        await pozaGit([null, 140, null, null], 600, 'ease');
        for (let i = 0; i < n; i++) {
          await pozaGit([null, null, 130, null], 300, 'easeout');
          await pozaGit([null, null, 60, null], 300, 'easeout');
        }
        await pozaGit([null, null, 90, null], 250, 'ease');
        await pozaGit([null, 90, null, null], 500, 'ease');
        yay({ k: 'servo', pin: -1, joint: 1, val: 90, ham: 90, bid: b.id });
        break;
      }
      case 'rx_arm_cube_pick': case 'rx_arm_cube_place': {
        const taban = kis(Math.round(await S('BASE')), 0, 180);
        const alcak = kis(Math.round(await S('LOW')), 0, 180);
        const al = b.type === 'rx_arm_cube_pick';
        yay({ k: 'servo', pin: -1, joint: 0, val: taban, ham: taban, bid: b.id });
        if (al) await pozaGit([null, null, null, 40], 300, 'easeout');
        await pozaGit([taban, 120, al ? 80 : 85, null], al ? 700 : 800, 'ease');
        await pozaGit([null, alcak, al ? 70 : 75, null], 600, 'easeout');
        await pozaGit([null, null, null, al ? 100 : 40], al ? 400 : 350, 'easeout');
        await pozaGit([null, 120, 90, null], al ? 600 : 550, 'ease');
        yay({ k: 'servo', pin: -1, joint: 3, val: al ? 100 : 40, ham: al ? 100 : 40, bid: b.id });
        break;
      }

      /* ── ZAMAN ── */
      case 'rx_delay_ms': await bekle(await S('MS'), b.id); break;
      case 'rx_delay_s': await bekle((await S('S')) * 1000, b.id); break;

      /* ── BUZZER ── */
      case 'rx_buzzer_tone': case 'rx_buzzer_note': {
        const pin = say(f.PIN ?? 8);
        const frk = b.type === 'rx_buzzer_note'
          ? Math.round(say(f.NOTE ?? 440))
          : Math.round(await S('FREQ'));
        const sur = Math.round(await S('DUR')) || (b.type === 'rx_buzzer_note' ? 300 : 200);
        if (live) bench.ot(frk);
        yay({ k: 'tone', pin, freq: frk, dur: sur, bid: b.id });
        await bekle(sur, b.id);
        if (live) bench.sustur();
        yay({ k: 'toneOff', pin, bid: b.id });
        break;
      }
      case 'rx_buzzer_off':
        if (live) bench.sustur();
        yay({ k: 'toneOff', pin: say(f.PIN ?? 8), bid: b.id });
        break;

      /* ── DİJİTAL ÇIKIŞ ── */
      case 'rx_digital_write': {
        const pin = say(f.PIN);
        const v = (f.STATE === 'HIGH' || f.STATE === 1 || f.STATE === '1') ? 1 : 0;
        if (live) bench.dijitalYaz(pin, v);
        if (pin === 9 || pin === 10 || pin === 11) {
          yay({ k: 'rgb', pin, val: v, color: rgbHexPin(pin, v), bid: b.id });
        } else {
          yay({ k: 'digital', pin, val: v, bid: b.id });
        }
        break;
      }
      case 'rx_relay': {
        const pin = say(f.PIN ?? 3);
        const v = (f.STATE ?? 'ON') === 'ON' ? 1 : 0;
        if (live) bench.dijitalYaz(pin, v);
        yay({ k: 'relay', pin, val: v, bid: b.id });
        break;
      }
      case 'rx_led_external': case 'rx_led_builtin': {
        const pin = say(f.PIN ?? 25);
        const v = (f.STATE ?? 'ON') === 'ON' ? 1 : 0;
        if (live) bench.dijitalYaz(pin, v);
        yay({ k: 'digital', pin, val: v, bid: b.id });
        break;
      }
      case 'rx_pwm_write': {
        const pin = say(f.PIN);
        const d2 = kis(Math.round(await S('DUTY')), 0, 100);
        if (live) bench.pwmYaz(pin, d2);
        yay({ k: 'pwm', pin, val: d2, bid: b.id });
        break;
      }
      case 'rx_pin_mode': break;

      /* ── WS2812 RGB ── */
      case 'rx_rgb_set_all': case 'rx_rgb_set_one': case 'rx_neopixel_set': {
        const c = String(f.COLOUR ?? '#ff0000');
        if (live) bench.rgbRenk(c);
        yay({ k: 'rgb', pin: -1, val: 1, color: c, bid: b.id });
        break;
      }
      case 'rx_rgb_clear':
        if (live) bench.rgbRenk('#000000');
        yay({ k: 'rgb', pin: -1, val: 0, color: '#000000', bid: b.id });
        break;

      /* ── SERİ ── */
      case 'rx_print': {
        const t = String(await D('TEXT'));
        ciktilar.push(t);
        yay({ k: 'print', text: t, bid: b.id });
        break;
      }

      /* ── AKIŞ ── */
      case 'rx_forever': {
        const g = G('DO');
        for (;;) {
          await zincir(g, kapsam);
          await nefes();
          if (!live && sanal > maxSanalMs) throw { __sinir: 'forever' };
        }
      }
      case 'rx_stop': throw DUR;

      case 'controls_repeat_ext': case 'controls_repeat': {
        const n = kis(Math.round((await S('TIMES')) || say(f.TIMES)), 0, 10000);
        const g = G('DO');
        for (let i = 0; i < n; i++) { await zincir(g, kapsam); tik(); }
        break;
      }
      case 'controls_whileUntil': {
        const g = G('DO');
        const kadar = f.MODE === 'UNTIL';
        let koruma = 0;
        for (;;) {
          const c = !!(await D('BOOL'));
          if (kadar ? c : !c) break;
          await zincir(g, kapsam);
          await nefes();
          if (++koruma > 200000) throw { __sinir: 'while' };
        }
        break;
      }
      case 'controls_for': {
        const k = degiskenAdi(f.VAR, varAd);
        const bas = await S('FROM'), son = await S('TO');
        const art = Math.abs(await S('BY')) || 1;
        const g = G('DO');
        const hedef = kapsam && k in kapsam ? kapsam : genel;
        if (bas <= son) for (let i = bas; i <= son; i += art) { hedef[k] = i; await zincir(g, kapsam); tik(); }
        else for (let i = bas; i >= son; i -= art) { hedef[k] = i; await zincir(g, kapsam); tik(); }
        break;
      }
      case 'controls_flow_statements':
        throw f.FLOW === 'BREAK' ? { __kir: true } : { __devam: true };

      case 'controls_if': {
        const n = say(b.extraState?.elseIfCount ?? 0) + 1;
        const varsaDegilse = !!(b.extraState?.elseCount || b.extraState?.hasElse || G('ELSE'));
        let oldu = false;
        for (let i = 0; i < n; i++) {
          if (await D('IF' + i)) { await zincir(G('DO' + i), kapsam); oldu = true; break; }
        }
        if (!oldu && varsaDegilse) await zincir(G('ELSE'), kapsam);
        break;
      }

      /* ── DEĞİŞKEN ── */
      case 'variables_set': {
        const k = degiskenAdi(f.VAR, varAd);
        const v = await D('VALUE');
        if (kapsam && k in kapsam) kapsam[k] = v; else genel[k] = v;
        yay({ k: 'var', name: k, val: say(v), bid: b.id });
        break;
      }
      case 'math_change': {
        const k = degiskenAdi(f.VAR, varAd);
        const d2 = await S('DELTA');
        const hedef = kapsam && k in kapsam ? kapsam : genel;
        hedef[k] = say(hedef[k]) + d2;
        yay({ k: 'var', name: k, val: say(hedef[k]), bid: b.id });
        break;
      }

      /* ── FONKSİYON ── */
      case 'procedures_callnoreturn':
        await fnCagir(String(b.extraState?.name ?? ''), b, kapsam);
        break;
      case 'procedures_defnoreturn': case 'procedures_defreturn': break;

      default:
        yay({ k: 'atla', type: b.type, bid: b.id });
        break;
    }
  }

  async function fnCagir(ad: string, cagri: BlokNode, kapsam: Record<string, unknown> | null): Promise<unknown> {
    const fn = fnler[ad];
    if (!fn) return 0;
    const yerel: Record<string, unknown> = Object.create(null);
    for (let i = 0; i < fn.par.length; i++) yerel[fn.par[i]] = await deger(girdi(cagri, 'ARG' + i), kapsam);
    yay({ k: 'call', name: ad, bid: cagri.id });
    try { await zincir(fn.govde, yerel); } catch (e) {
      if (!(e as { __donus?: boolean })?.__donus) throw e;
    }
    return fn.donerMi ? await deger(fn.don, yerel) : 0;
  }

  /* ── BAŞLAT ── */
  const ana = ustler.find((b) => b.type === 'rx_on_start');
  try {
    if (!ana) hata = 'Programda "Başlangıçta" bloğu yok — kod hiç çalışmaz.';
    else await zincir(girdi(ana, 'DO'), null);
  } catch (e) {
    const err = e as { __sinir?: string; __kir?: boolean; __devam?: boolean; message?: string };
    if (e === DUR || err?.__kir || err?.__devam) { /* normal duruş */ }
    else if (err?.__sinir) { /* sonsuz döngü/süre sınırı — normal bitiş sayılır */ }
    else { hata = err?.message || String(e); }
  }

  return { iz, ciktilar, hata, hataBid, sanalMs: Math.round(sanal), adim, blokSayisi };
}

function rgbHexPin(pin: number, v: number): string {
  const s = bench.durum();
  const r = pin === 9 ? v : s.rgb[9];
  const g = pin === 10 ? v : s.rgb[10];
  const b = pin === 11 ? v : s.rgb[11];
  return '#' + [r ? 255 : 0, g ? 255 : 0, b ? 255 : 0]
    .map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Blok ağacını düz listeye açar — statik kontroller için. */
export function bloklariAc(alan: CalismaAlani | null): BlokNode[] {
  const cikti: BlokNode[] = [];
  const gez = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(gez); return; }
    if (!o || typeof o !== 'object') return;
    const n = o as BlokNode & Record<string, unknown>;
    if (typeof n.type === 'string') {
      cikti.push(n);
      for (const k of Object.keys(n.inputs || {})) gez(n.inputs![k]);
      if (n.next?.block) gez(n.next.block);
      return;
    }
    Object.values(o as Record<string, unknown>).forEach(gez);
  };
  gez(alan?.blocks?.blocks || []);
  return cikti;
}

export { GUVENLI_ACI };
