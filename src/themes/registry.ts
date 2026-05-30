import * as Blockly from 'blockly';
import type { RoboExxTheme, ThemeId } from './types';
import { galaxyOrange } from './galaxy-orange';
import { galaxyOrangeLight } from './galaxy-orange-light';

export const themes: Record<ThemeId, RoboExxTheme> = {
  'galaxy-orange': galaxyOrange,
  'galaxy-orange-light': galaxyOrangeLight,
};

export const themeList: RoboExxTheme[] = [
  galaxyOrange,
  galaxyOrangeLight,
];

export const defaultThemeId: ThemeId = 'galaxy-orange';

/**
 * RoboExxTheme'den Blockly Theme nesnesi üretir.
 * Her tema değişiminde bu çağrılır.
 */
export function buildBlocklyTheme(theme: RoboExxTheme): Blockly.Theme {
  const p = theme.blockly.palette;

  /**
   * Donanım kategorilerine özel sabit renkler (temadan bağımsız).
   * Kullanıcı isteği: her donanım kendi tanınır rengiyle gelsin.
   * Her renk 3 ton: [gövde, kenar, gölge].
   */
  const HW = {
    led:    ['#e23b3b', '#c52f2f', '#a32626'], // LED — kırmızı
    rgb:    ['#e23b3b', '#c52f2f', '#a32626'], // RGB LED — kırmızı (LED ile aynı aile)
    buzzer: ['#2b2b2f', '#1f1f22', '#141416'], // Buzzer — siyah
    servo:  ['#2e7fd6', '#2569b3', '#1d5491'], // Servo — mavi
    dcmotor:['#e8b81f', '#cda015', '#a98410'], // DC Motor — sarı
    button: ['#8a8d96', '#73767e', '#5d6066'], // Buton — gri
    relay:  ['#2e7fd6', '#2569b3', '#1d5491'], // Röle — mavi
    oled:   ['#2e7fd6', '#2569b3', '#1d5491'], // OLED — mavi
    ultra:  ['#2e7fd6', '#2569b3', '#1d5491'], // Mesafe — mavi
    pot:    ['#8b5a2b', '#744823', '#5c3a1c'], // Potansiyometre — kahverengi
    ldr:    ['#c08a4f', '#a87340', '#8c5f34'], // LDR — açık kahve
    ir:     ['#1d1d20', '#161618', '#0e0e10'], // IR Sensör — siyaha yakın
  };

  return Blockly.Theme.defineTheme(`roboexx-${theme.id}`, {
    name: `roboexx-${theme.id}`,
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: theme.blockly.workspace,
      toolboxBackgroundColour: theme.blockly.toolbox,
      toolboxForegroundColour: theme.vars.text,
      flyoutBackgroundColour: theme.blockly.flyout,
      flyoutForegroundColour: theme.vars.text,
      flyoutOpacity: 1,
      scrollbarColour: theme.vars.border,
      scrollbarOpacity: 0.6,
      insertionMarkerColour: theme.blockly.insertion,
      insertionMarkerOpacity: 0.9,
      markerColour: theme.blockly.cursor,
      cursorColour: theme.blockly.cursor,
      selectedGlowColour: theme.blockly.selectedGlow,
      selectedGlowOpacity: 0.0,
      replacementGlowColour: theme.blockly.selectedGlow,
      replacementGlowOpacity: 0.0,
    },
    blockStyles: {
      logic_blocks:     { colourPrimary: p.logic[0],     colourSecondary: p.logic[1],     colourTertiary: p.logic[2],     hat: 'cap' },
      loop_blocks:      { colourPrimary: p.loop[0],      colourSecondary: p.loop[1],      colourTertiary: p.loop[2] },
      io_blocks:        { colourPrimary: p.io[0],        colourSecondary: p.io[1],        colourTertiary: p.io[2] },
      timing_blocks:    { colourPrimary: p.timing[0],    colourSecondary: p.timing[1],    colourTertiary: p.timing[2] },
      text_blocks:      { colourPrimary: p.text[0],      colourSecondary: p.text[1],      colourTertiary: p.text[2] },
      math_blocks:      { colourPrimary: p.math[0],      colourSecondary: p.math[1],      colourTertiary: p.math[2] },
      operator_blocks:  { colourPrimary: p.operator[0],  colourSecondary: p.operator[1],  colourTertiary: p.operator[2] },
      actuator_blocks:  { colourPrimary: p.actuator[0],  colourSecondary: p.actuator[1],  colourTertiary: p.actuator[2] },
      sensor_blocks:    { colourPrimary: p.sensor[0],    colourSecondary: p.sensor[1],    colourTertiary: p.sensor[2] },
      variable_blocks:  { colourPrimary: p.variable[0],  colourSecondary: p.variable[1],  colourTertiary: p.variable[2] },
      procedure_blocks: { colourPrimary: p.procedure[0], colourSecondary: p.procedure[1], colourTertiary: p.procedure[2] },
      // Donanıma özel blok stilleri — sabit renkler
      led_blocks:       { colourPrimary: HW.led[0],     colourSecondary: HW.led[1],     colourTertiary: HW.led[2] },
      rgb_blocks:       { colourPrimary: HW.rgb[0],     colourSecondary: HW.rgb[1],     colourTertiary: HW.rgb[2] },
      buzzer_blocks:    { colourPrimary: HW.buzzer[0],  colourSecondary: HW.buzzer[1],  colourTertiary: HW.buzzer[2] },
      servo_blocks:     { colourPrimary: HW.servo[0],   colourSecondary: HW.servo[1],   colourTertiary: HW.servo[2] },
      dcmotor_blocks:   { colourPrimary: HW.dcmotor[0], colourSecondary: HW.dcmotor[1], colourTertiary: HW.dcmotor[2] },
      button_blocks:    { colourPrimary: HW.button[0],  colourSecondary: HW.button[1],  colourTertiary: HW.button[2] },
      relay_blocks:     { colourPrimary: HW.relay[0],   colourSecondary: HW.relay[1],   colourTertiary: HW.relay[2] },
      oled_blocks:      { colourPrimary: HW.oled[0],    colourSecondary: HW.oled[1],    colourTertiary: HW.oled[2] },
      ultra_blocks:     { colourPrimary: HW.ultra[0],   colourSecondary: HW.ultra[1],   colourTertiary: HW.ultra[2] },
      pot_blocks:       { colourPrimary: HW.pot[0],     colourSecondary: HW.pot[1],     colourTertiary: HW.pot[2] },
      ldr_blocks:       { colourPrimary: HW.ldr[0],     colourSecondary: HW.ldr[1],     colourTertiary: HW.ldr[2] },
      ir_blocks:        { colourPrimary: HW.ir[0],      colourSecondary: HW.ir[1],      colourTertiary: HW.ir[2] },
    },
    categoryStyles: {
      logic_category:     { colour: p.logic[0] },
      loop_category:      { colour: p.loop[0] },
      io_category:        { colour: p.io[0] },
      timing_category:    { colour: p.timing[0] },
      text_category:      { colour: p.text[0] },
      math_category:      { colour: p.math[0] },
      operator_category:  { colour: p.operator[0] },
      actuator_category:  { colour: p.actuator[0] },
      sensor_category:    { colour: p.sensor[0] },
      variable_category:  { colour: p.variable[0] },
      procedure_category: { colour: p.procedure[0] },
      // Donanıma özel kategori renkleri (toolbox'taki nokta rengi)
      led_category:     { colour: HW.led[0] },
      rgb_category:     { colour: HW.rgb[0] },
      buzzer_category:  { colour: HW.buzzer[0] },
      servo_category:   { colour: HW.servo[0] },
      dcmotor_category: { colour: HW.dcmotor[0] },
      button_category:  { colour: HW.button[0] },
      relay_category:   { colour: HW.relay[0] },
      oled_category:    { colour: HW.oled[0] },
      ultra_category:   { colour: HW.ultra[0] },
      pot_category:     { colour: HW.pot[0] },
      ldr_category:     { colour: HW.ldr[0] },
      ir_category:      { colour: HW.ir[0] },
    },
    fontStyle: {
      family: 'Inter, system-ui, -apple-system, sans-serif',
      weight: '600',
      size: 13,
    },
  });
}

/**
 * RoboExx temasının CSS değişkenlerini document root'a uygular.
 */
export function applyThemeVars(theme: RoboExxTheme) {
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, value]) => {
    const cssKey = '--rx-' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssKey, value);
  });
  root.dataset.theme = theme.id;
}

export type { RoboExxTheme, ThemeId };
