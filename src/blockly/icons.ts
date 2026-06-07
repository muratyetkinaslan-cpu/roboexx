/**
 * Bloklar için inline SVG ikonlar (Blockly FieldImage formatında).
 * Her ikon 24x24 viewBox, beyaz stroke/fill (renkli blok arka planı için).
 */

function svgToDataUri(svg: string): string {
  const utf8 = unescape(encodeURIComponent(svg));
  return `data:image/svg+xml;base64,${btoa(utf8)}`;
}

const stroke = (paths: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
     fill="none" stroke="white" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const fill = (paths: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
     fill="white">${paths}</svg>`;

export const ICONS = {
  // ====== Akış / Control ======
  bolt:     svgToDataUri(fill('<path d="M13 2L4 14h6l-1 8 10-12h-6l0-8z"/>')),
  loop:     svgToDataUri(stroke(
    '<polyline points="21 4 21 9 16 9"/>' +
    '<polyline points="3 20 3 15 8 15"/>' +
    '<path d="M5 9a8 8 0 0114-3l2 3M3 15l2 3a8 8 0 0014-3"/>'
  )),
  stop:     svgToDataUri(fill('<rect x="5" y="5" width="14" height="14" rx="2"/>')),
  pause:    svgToDataUri(fill('<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>')),

  // ====== Pin / IO ======
  pinOut:   svgToDataUri(stroke('<path d="M12 2v10"/><path d="M5.5 7a8 8 0 1013 0"/>')),
  pinIn:    svgToDataUri(stroke('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')),
  analog:   svgToDataUri(stroke('<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>')),
  pwm:      svgToDataUri(stroke('<path d="M3 18V8h4v10h4V8h4v10h4V8h2"/>')),
  pinMode:  svgToDataUri(stroke('<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>')),

  // ====== Zaman / Time ======
  clock:    svgToDataUri(stroke('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>')),
  hourglass: svgToDataUri(stroke('<path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6V2z"/>')),

  // ====== Konsol / Console ======
  terminal: svgToDataUri(stroke(
    '<rect x="2" y="4" width="20" height="16" rx="2"/>' +
    '<polyline points="7 9 10 12 7 15"/>' +
    '<line x1="13" y1="15" x2="17" y2="15"/>'
  )),

  // ====== Math / Logic ======
  dice:     svgToDataUri(stroke('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="white"/><circle cx="16" cy="8" r="1.2" fill="white"/><circle cx="8" cy="16" r="1.2" fill="white"/><circle cx="16" cy="16" r="1.2" fill="white"/><circle cx="12" cy="12" r="1.2" fill="white"/>')),
  calc:     svgToDataUri(stroke('<rect x="4" y="2" width="16" height="20" rx="2"/><rect x="7" y="5" width="10" height="3"/><circle cx="8" cy="13" r="0.8" fill="white"/><circle cx="12" cy="13" r="0.8" fill="white"/><circle cx="16" cy="13" r="0.8" fill="white"/><circle cx="8" cy="18" r="0.8" fill="white"/><circle cx="12" cy="18" r="0.8" fill="white"/><circle cx="16" cy="18" r="0.8" fill="white"/>')),
  arrows:   svgToDataUri(stroke('<path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/>')),
  abs:      svgToDataUri(stroke('<path d="M5 4v16M19 4v16M9 8l3 4 3-4M9 16l3-4 3 4"/>')),

  // ====== Aktüatörler / Actuators ======
  led:      svgToDataUri(stroke('<path d="M9 18h6M10 21h4M12 2a7 7 0 00-4 12.6V17h8v-2.4A7 7 0 0012 2z"/>')),
  servo:    svgToDataUri(stroke('<rect x="4" y="9" width="14" height="10" rx="1"/><circle cx="11" cy="14" r="2.5"/><path d="M11 14l5-7M16 7l2 2-2 2M14 5l4 4"/>')),
  motor:    svgToDataUri(stroke('<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10h3v4h-3M7 12h6"/><circle cx="10" cy="12" r="1.5" fill="white"/>')),
  buzzer:   svgToDataUri(stroke('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M16 8a4 4 0 010 8M19 5a8 8 0 010 14"/>')),
  rgb:      svgToDataUri(stroke('<circle cx="7" cy="9" r="3.5"/><circle cx="17" cy="9" r="3.5"/><circle cx="12" cy="17" r="3.5"/>')),

  // ====== Sensörler / Sensors ======
  ruler:    svgToDataUri(stroke('<path d="M3 7l4 4-4 4M21 7l-4 4 4 4"/><path d="M7 11h10"/><path d="M9 9v4M12 9v4M15 9v4"/>')),
  thermo:   svgToDataUri(stroke('<path d="M14 14V4a2 2 0 00-4 0v10a4 4 0 104 0z"/><line x1="12" y1="9" x2="12" y2="14"/>')),
  drop:     svgToDataUri(stroke('<path d="M12 2.5C12 2.5 5 11 5 16a7 7 0 0014 0c0-5-7-13.5-7-13.5z"/>')),
  light:    svgToDataUri(stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>')),
  button:   svgToDataUri(stroke('<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9"/>')),
  keyboard: svgToDataUri(stroke(
    '<rect x="2" y="6" width="20" height="12" rx="2"/>' +
    '<line x1="6" y1="10" x2="6.01" y2="10"/>' +
    '<line x1="10" y1="10" x2="10.01" y2="10"/>' +
    '<line x1="14" y1="10" x2="14.01" y2="10"/>' +
    '<line x1="18" y1="10" x2="18.01" y2="10"/>' +
    '<line x1="7" y1="14" x2="17" y2="14"/>'
  )),
  gamepad: svgToDataUri(stroke(
    '<path d="M6 8h12a4 4 0 0 1 4 4v4a3 3 0 0 1-3 3 3 3 0 0 1-2.5-1.4L15 16H9l-1.5 1.6A3 3 0 0 1 5 19a3 3 0 0 1-3-3v-4a4 4 0 0 1 4-4z"/>' +
    '<line x1="6" y1="12" x2="6" y2="14"/>' +
    '<line x1="5" y1="13" x2="7" y2="13"/>' +
    '<circle cx="17" cy="12" r="0.5" fill="white"/>' +
    '<circle cx="18.5" cy="13.5" r="0.5" fill="white"/>'
  )),
  potent:   svgToDataUri(stroke('<circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="17" y2="7"/><line x1="3" y1="20" x2="6" y2="17"/><line x1="18" y1="6" x2="21" y2="3"/>')),

  // ====== Text / Strings ======
  text:     svgToDataUri(stroke('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>')),
  link:     svgToDataUri(stroke('<path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>')),

  // ====== OLED / Display ======
  display:  svgToDataUri(stroke('<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="8.5" x2="21" y2="8.5"/><circle cx="5.5" cy="6.8" r="0.4" fill="white"/><circle cx="7.5" cy="6.8" r="0.4" fill="white"/>')),
  displayText: svgToDataUri(stroke('<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="6.5" y1="11.5" x2="17.5" y2="11.5" stroke-width="1.6"/><line x1="6.5" y1="14.5" x2="14" y2="14.5" stroke-width="1.6"/>')),
  displayShape: svgToDataUri(stroke('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="13" r="2.2" stroke-width="1.5"/><rect x="13" y="11" width="4.5" height="4.5" stroke-width="1.5"/>')),
  eye:      svgToDataUri(stroke('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/>')),
  eraser:   svgToDataUri(stroke('<path d="M18 14L10 22H3v-7l8-8 7 7z"/><line x1="13" y1="9" x2="20" y2="16"/>')),
  refresh:  svgToDataUri(stroke('<polyline points="21 4 21 9 16 9"/><path d="M21 9a8 8 0 10-2 5.7"/>')),
  marquee:  svgToDataUri(stroke('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="6 9 8 12 6 15" stroke-width="1.6"/><polyline points="11 9 13 12 11 15" stroke-width="1.6"/><line x1="15" y1="9" x2="18" y2="9" stroke-width="1.6"/><line x1="15" y1="15" x2="18" y2="15" stroke-width="1.6"/>')),
  image:    svgToDataUri(stroke('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="9.5" r="1.2"/><polyline points="3 18 9 12 13 16 17 12 21 16" stroke-width="1.4"/>')),

  // ====== Yeni sensör/aktüatör ======
  humidity: svgToDataUri(stroke('<path d="M12 3C8 9 6 12 6 15a6 6 0 0012 0c0-3-2-6-6-12z"/><path d="M11 17v-3M9 14h4" stroke-width="1.2"/>')),
  relay:    svgToDataUri(stroke('<rect x="3" y="6" width="18" height="12" rx="1.5"/><circle cx="7" cy="12" r="1.5" fill="white"/><line x1="7" y1="12" x2="14" y2="9"/><circle cx="14" cy="9" r="1.5" fill="white"/><circle cx="17" cy="15" r="1.5" fill="white"/>')),
  ir:       svgToDataUri(stroke('<rect x="8" y="3" width="8" height="14" rx="3"/><path d="M6 19l2-2M16 17l2 2M12 21v-3"/><circle cx="12" cy="10" r="1.5" fill="white"/>')),
  rainbow:  svgToDataUri(stroke('<path d="M3 18a9 9 0 0118 0"/><path d="M5 18a7 7 0 0114 0" stroke-opacity="0.8"/><path d="M7 18a5 5 0 0110 0" stroke-opacity="0.6"/><path d="M9 18a3 3 0 016 0" stroke-opacity="0.4"/>')),
  servoArm: svgToDataUri(stroke('<rect x="6" y="8" width="12" height="10" rx="1.5"/><line x1="12" y1="13" x2="20" y2="6" stroke-width="2"/><circle cx="12" cy="13" r="1.5" fill="white"/><circle cx="20" cy="6" r="1.2" fill="white"/>')),

  // ====== Variables / Functions ======
  variable: svgToDataUri(stroke('<path d="M5 5l3 7-3 7M19 5l-3 7 3 7M9 12h6"/>')),
  func:     svgToDataUri(stroke('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 11l-2 1 2 1M15 11l2 1-2 1M13 9l-2 6"/>')),
};
