import type { RoboExxTheme } from './types';

/**
 * 🪐 Galaxy Orange — RoboExx markası, derin uzay siyahı + turuncu vurgular.
 */
export const galaxyOrange: RoboExxTheme = {
  id: 'galaxy-orange',
  name: 'Galaxy Orange',
  emoji: '🪐',
  description: 'Marka teması · uzay siyahı + turuncu',

  vars: {
    bg: '#08080A',
    bgGradient: 'radial-gradient(ellipse at top left, rgba(249,115,22,0.08) 0%, transparent 55%)',
    surface: '#111113',
    surface2: '#1A1A1D',
    border: '#27272A',
    borderSoft: '#1F1F22',
    text: '#FAFAFA',
    textDim: '#A1A1AA',
    textMuted: '#52525B',
    accent: '#F97316',
    accentHover: '#FB8A3A',
    accentSoft: 'rgba(249,115,22,0.12)',
    accentText: '#08080A',
    success: '#22C55E',
    error: '#EF4444',
    glow: '0 0 24px rgba(249,115,22,0.35)',
    accentGlow: '0 0 16px rgba(249,115,22,0.5)',
  },

  blockly: {
    workspace: '#08080A',
    toolbox: '#111113',
    flyout: '#1A1A1D',
    cursor: '#F97316',
    insertion: '#F97316',
    grid: '#636369',
    selectedGlow: '#F97316',
    palette: {
      logic:     ['#F97316', '#EA6610', '#C2410C'],
      loop:      ['#FB923C', '#F97316', '#EA6610'],
      io:        ['#FFB070', '#FB923C', '#F97316'],
      timing:    ['#FACC15', '#EAB308', '#CA8A04'],
      text:      ['#71717A', '#52525B', '#3F3F46'],
      math:      ['#52525B', '#3F3F46', '#27272A'],
      operator:  ['#10B981', '#059669', '#047857'],
      actuator:  ['#EC4899', '#DB2777', '#BE185D'],
      sensor:    ['#06B6D4', '#0891B2', '#0E7490'],
      variable:  ['#A855F7', '#9333EA', '#7E22CE'],
      procedure: ['#84CC16', '#65A30D', '#4D7C0F'],
    },
  },

  codemirror: {
    background: '#08080A',
    foreground: '#FAFAFA',
    cursor: '#F97316',
    selection: 'rgba(249,115,22,0.25)',
    lineHighlight: 'rgba(249,115,22,0.05)',
    keyword: '#FB923C',
    string: '#FACC15',
    number: '#FBBF24',
    comment: '#52525B',
    function: '#FFB070',
    operator: '#A1A1AA',
    builtin: '#F97316',
    gutterBg: '#08080A',
    gutterText: '#3F3F46',
    gutterActive: '#A1A1AA',
  },
};
