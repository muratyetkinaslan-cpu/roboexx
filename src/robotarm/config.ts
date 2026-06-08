/**
 * 4 eksenli robot kol — servo konfigürasyonu ve komut/telemetri eşlemesi.
 *
 * Simülasyon mantıksal açıları 0–180° kullanır (her eklem için "90" merkez).
 * Fiziksel servo açısı = kalibrasyon ofseti + (ters ise 180-mantıksal).
 * Böylece simülasyonda 90° iken fiziksel kolu da 90°'ye ayarlayıp birlikte
 * çalıştırabilirsin.
 *
 * 3 servo tipi (blok tabanlı uygulamayla birebir aynı):
 *   normal  → servo_angle(pin, açı)          — Pico GPIO'ya doğrudan
 *   driver  → servo_v2(num, açı)             — motor sürücü kart (1–4)
 *   pca     → servo_v3(kanal, açı)           — PCA9685 I2C 16 kanal
 */

export type ServoKind = 'normal' | 'driver' | 'pca';

/** Telemetri/komut tip kodu — firmware ile ortak. 0=normal 1=driver 2=pca */
export const KIND_CODE: Record<ServoKind, number> = { normal: 0, driver: 1, pca: 2 };
export const CODE_KIND: Record<number, ServoKind> = { 0: 'normal', 1: 'driver', 2: 'pca' };

export interface JointConfig {
  /** Eklem etiketi (Taban / Omuz / Dirsek / Gripper) */
  label: string;
  kind: ServoKind;
  /** normal→pin(0-28), driver→num(1-4), pca→channel(0-15) */
  id: number;
  /** Kalibrasyon ofseti (derece). Fiziksel = ofset + mantıksal */
  offset: number;
  /** Yönü ters çevir */
  invert: boolean;
}

export interface ArmConfig {
  joints: [JointConfig, JointConfig, JointConfig, JointConfig];
  /** PCA9685 I2C ayarları (pca tipi kullanılıyorsa) */
  pca: { sda: number; scl: number; addr: number };
}

const STORAGE_KEY = 'roboexx.robotarm.config';

export const DEFAULT_ARM_CONFIG: ArmConfig = {
  joints: [
    { label: 'Taban (J1)',    kind: 'normal', id: 0, offset: 0, invert: false },
    { label: 'Omuz (J2)',     kind: 'normal', id: 1, offset: 0, invert: false },
    { label: 'Dirsek (J3)',   kind: 'normal', id: 2, offset: 0, invert: false },
    { label: 'Gripper (J4)',  kind: 'normal', id: 3, offset: 0, invert: false },
  ],
  pca: { sda: 4, scl: 5, addr: 0x40 },
};

export function loadArmConfig(): ArmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.joints) && p.joints.length === 4) return p as ArmConfig;
    }
  } catch {}
  return structuredClone(DEFAULT_ARM_CONFIG);
}

export function saveArmConfig(cfg: ArmConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}

function clamp180(v: number): number {
  return Math.max(0, Math.min(180, Math.round(v)));
}

/** Mantıksal sim açısı → fiziksel servo açısı (kalibrasyon uygulanmış). */
export function logicalToPhysical(j: JointConfig, logical: number): number {
  const base = j.invert ? 180 - logical : logical;
  return clamp180(base + j.offset);
}

/** Fiziksel servo açısı → mantıksal sim açısı (telemetri için ters dönüşüm). */
export function physicalToLogical(j: JointConfig, physical: number): number {
  const minusOffset = physical - j.offset;
  return clamp180(j.invert ? 180 - minusOffset : minusOffset);
}

/** Tek bir eklem için MicroPython tek satırlık komut üretir. */
export function jointCommand(j: JointConfig, logical: number): string {
  const a = logicalToPhysical(j, logical);
  switch (j.kind) {
    case 'normal': return `servo_angle(${j.id}, ${a})`;
    case 'driver': return `servo_v2(${j.id}, ${a})`;
    case 'pca':    return `servo_v3(${j.id}, ${a})`;
  }
}

/**
 * REPL'e bir kez gönderilecek bootstrap — gerekli fonksiyonları içe aktarır.
 * PCA kullanılıyorsa init_pca9685 de çağrılır.
 */
export function bootstrapCode(cfg: ArmConfig): string {
  const usesPca = cfg.joints.some((j) => j.kind === 'pca');
  const lines = ['from roboexx import *'];
  if (usesPca) {
    lines.push('from pca9685 import servo_v3, servo_v3_off, init_pca9685');
    lines.push(`init_pca9685(sda=${cfg.pca.sda}, scl=${cfg.pca.scl}, addr=0x${cfg.pca.addr.toString(16).toUpperCase()})`);
  }
  return lines.join('\n');
}

/** Tüm eklemleri verilen mantıksal açılara getiren çok satırlı kod. */
export function allJointsCommand(cfg: ArmConfig, logical: number[]): string {
  return logical
    .slice(0, 4)
    .map((a, i) => jointCommand(cfg.joints[i], a))
    .join('\n');
}

/** Telemetri satırını ayrıştır: "@SV <kod> <id> <açı>" → {code,id,angle} | null */
export function parseTelemetry(line: string): { code: number; id: number; angle: number } | null {
  const m = line.trim().match(/^@SV\s+(\d+)\s+(-?\d+)\s+(-?\d+)$/);
  if (!m) return null;
  return { code: +m[1], id: +m[2], angle: +m[3] };
}

/** (typeKodu, id) → eklem indeksi. Eşleşme yoksa -1. */
export function jointForServo(cfg: ArmConfig, code: number, id: number): number {
  const kind = CODE_KIND[code];
  if (!kind) return -1;
  return cfg.joints.findIndex((j) => j.kind === kind && j.id === id);
}
