import type { RoboExxTheme } from './types';

/**
 * ☀️ Galaxy Orange Light — açık tema. Beyaz/açık gri zemin + turuncu vurgular.
 * Galaxy Orange'ın aydınlık kardeşi; aynı marka turuncu kimliği.
 */
export const galaxyOrangeLight: RoboExxTheme = {
  id: 'galaxy-orange-light',
  name: 'Galaxy Orange (Açık)',
  emoji: '☀️',
  description: 'Açık tema · beyaz zemin + turuncu',

  vars: {
    bg: '#F4F4F5',
    bgGradient: 'radial-gradient(ellipse at top left, rgba(249,115,22,0.10) 0%, transparent 55%)',
    surface: '#FFFFFF',
    surface2: '#F0F0F1',
    border: '#D4D4D8',
    borderSoft: '#E4E4E7',
    text: '#18181B',
    textDim: '#52525B',
    textMuted: '#A1A1AA',
    accent: '#EA6610',
    accentHover: '#F97316',
    accentSoft: 'rgba(249,115,22,0.14)',
    accentText: '#FFFFFF',
    success: '#16A34A',
    error: '#DC2626',
    glow: '0 0 24px rgba(249,115,22,0.25)',
    accentGlow: '0 0 16px rgba(249,115,22,0.4)',
  },

  blockly: {
    workspace: '#FAFAFA',
    toolbox: '#FFFFFF',
    flyout: '#F0F0F1',
    cursor: '#EA6610',
    insertion: '#EA6610',
    grid: '#C4C4CC',
    selectedGlow: '#EA6610',
    palette: {
      logic:     ['#F97316', '#EA6610', '#C2410C'],
      loop:      ['#FB923C', '#F97316', '#EA6610'],
      io:        ['#FB9A52', '#FB923C', '#F97316'],
      timing:    ['#EAB308', '#CA8A04', '#A16207'],
      text:      ['#71717A', '#52525B', '#3F3F46'],
      math:      ['#64748B', '#475569', '#334155'],
      operator:  ['#10B981', '#059669', '#047857'],
      actuator:  ['#EC4899', '#DB2777', '#BE185D'],
      sensor:    ['#06B6D4', '#0891B2', '#0E7490'],
      variable:  ['#A855F7', '#9333EA', '#7E22CE'],
      procedure: ['#84CC16', '#65A30D', '#4D7C0F'],
    },
  },

  codemirror: {
    background: '#FAFAFA',
    foreground: '#18181B',
    cursor: '#EA6610',
    selection: 'rgba(249,115,22,0.2)',
    lineHighlight: 'rgba(249,115,22,0.06)',
    keyword: '#C2410C',
    string: '#A16207',
    number: '#B45309',
    comment: '#A1A1AA',
    function: '#EA6610',
    operator: '#52525B',
    builtin: '#C2410C',
    gutterBg: '#FAFAFA',
    gutterText: '#A1A1AA',
    gutterActive: '#52525B',
  },
};
