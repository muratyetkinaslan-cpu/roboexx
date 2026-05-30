/**
 * RoboExx tema sistemi.
 *
 * Her tema 3 katmanı tanımlar:
 *  1. UI değişkenleri (CSS variables) — toolbar, paneller, butonlar
 *  2. Blockly teması — workspace, kategoriler, blok renkleri
 *  3. CodeMirror teması — Python editörü
 *
 * Yeni tema eklerken: src/themes/registry.ts içine ekle.
 */

export type ThemeId =
  | 'galaxy-orange'
  | 'galaxy-orange-light';

export interface RoboExxTheme {
  id: ThemeId;
  name: string;
  emoji: string;
  description: string;

  /**
   * Opsiyonel PNG ikon yolu (public/ köküne görelatif).
   * Verilirse tema seçicide ve topbar rozetinde emoji yerine bu PNG gösterilir.
   * Dosya yoksa emoji'ye düşülür (fallback).
   * Örn: 'themes/iron-man.png'
   */
  image?: string;

  /** UI CSS değişkenleri */
  vars: {
    bg: string;
    bgGradient: string;
    surface: string;
    surface2: string;
    border: string;
    borderSoft: string;
    text: string;
    textDim: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentSoft: string;
    accentText: string;
    success: string;
    error: string;
    glow: string;
    accentGlow: string;
  };

  /** Blockly özel renkleri */
  blockly: {
    workspace: string;
    toolbox: string;
    flyout: string;
    cursor: string;
    insertion: string;
    grid: string;
    selectedGlow: string;
    /** Kategori → [primary, secondary, tertiary] */
    palette: {
      logic: [string, string, string];
      loop: [string, string, string];
      io: [string, string, string];
      timing: [string, string, string];
      text: [string, string, string];
      math: [string, string, string];
      operator: [string, string, string];
      actuator: [string, string, string];
      sensor: [string, string, string];
      variable: [string, string, string];
      procedure: [string, string, string];
    };
  };

  /** CodeMirror Python editörü renkleri */
  codemirror: {
    background: string;
    foreground: string;
    cursor: string;
    selection: string;
    lineHighlight: string;
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
    operator: string;
    builtin: string;
    gutterBg: string;
    gutterText: string;
    gutterActive: string;
  };
}
