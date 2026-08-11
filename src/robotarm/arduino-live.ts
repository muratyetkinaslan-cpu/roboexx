/**
 * Robot kol — Arduino CANLI KONTROL sketch üreticisi.
 *
 * Pico tarafında canlı kontrol REPL üzerinden tek satırlık MicroPython
 * komutlarıyla yapılır. Arduino'da REPL yok; onun yerine karta BİR KEZ
 * bu sketch yüklenir ve tarayıcı (arduinoLiveLink) şu paketleri gönderir:
 *
 *     \x05J<eksen>:<açı>\n      örn. "\x05J1:120\n"  → omuz servosu 120°
 *
 * \x06 ile başlayan klavye paketleri (App'in canlı tuş akışı) sketch
 * tarafından YOK SAYILIR — aynı portta ikisi çakışmadan akar.
 *
 * Açılar FİZİKSEL derece olarak gönderilir (kalibrasyon ofseti/ters çevirme
 * tarayıcıda uygulanır) — sketch gelen değeri doğrudan servoya yazar.
 */
import type { ArmConfig } from './config';

/** Arduino Uno/Nano'da varsayılan kol pinleri (PWM uyumlu; 0/1 = Serial). */
export const ARM_DEFAULT_ARDUINO_PINS = [3, 5, 6, 9] as const;

/**
 * Eklem yapılandırmasından Arduino pinlerini çıkarır.
 * Yalnız 'normal' servo tipi Arduino'da doğrudan sürülebilir; 'driver' ve
 * 'pca' (I2C) eklemler varsayılan pine düşer — panel bu durumda uyarır.
 */
export function armArduinoPins(cfg: ArmConfig): number[] {
  return cfg.joints.map((j, i) =>
    j.kind === 'normal' ? j.id : ARM_DEFAULT_ARDUINO_PINS[i]
  );
}

/** Yapılandırmada Arduino'nun süremeyeceği (I2C) eklem var mı? */
export function armHasNonNormalJoints(cfg: ArmConfig): boolean {
  return cfg.joints.some((j) => j.kind !== 'normal');
}

/** Karta yüklenecek canlı kontrol sketch'i (.ino kaynağı). */
export function buildArmLiveSketch(cfg: ArmConfig): string {
  const pins = armArduinoPins(cfg);
  return [
    '// ============================================================',
    '// RoboExx — Robot Kol CANLI KONTROL (otomatik üretildi)',
    '// ============================================================',
    '// Tarayıcı "\\x05J<eksen>:<açı>\\n" paketleri gönderir; bu sketch',
    '// ilgili servoyu anında sürer. Kaydırıcılar, Tıkla-Git (IK) ve',
    '// simülasyonda çalıştırılan blok programları gerçek kolu böyle',
    '// hareket ettirir. Klavye paketleri (\\x06...) yok sayılır.',
    '//',
    `// Eklem pinleri: Taban=${pins[0]}  Omuz=${pins[1]}  Dirsek=${pins[2]}  Gripper=${pins[3]}`,
    '// (Panelde "Eklemler" bölümünden değiştirip sketch\'i yeniden yükle.)',
    '// ============================================================',
    '#include <Servo.h>',
    '',
    `const int RX_PINS[4] = {${pins.join(', ')}};`,
    'Servo rxS[4];',
    '',
    'char rxBuf[12];',
    'byte rxLen = 0;',
    'bool rxIn = false;',
    '',
    'void setup() {',
    '  Serial.begin(115200);',
    '  for (int i = 0; i < 4; i++) {',
    '    rxS[i].attach(RX_PINS[i]);',
    '    rxS[i].write(90);   // güvenli başlangıç — merkez',
    '  }',
    '}',
    '',
    'void rxHandle() {',
    "  if (rxBuf[0] != 'J') return;",
    "  int j = rxBuf[1] - '0';",
    '  if (j < 0 || j > 3) return;',
    "  char *c = strchr(rxBuf, ':');",
    '  if (!c) return;',
    '  int a = atoi(c + 1);',
    '  if (a < 0) a = 0;',
    '  if (a > 180) a = 180;',
    '  rxS[j].write(a);',
    '}',
    '',
    'void loop() {',
    '  while (Serial.available() > 0) {',
    '    char ch = (char)Serial.read();',
    "    if (ch == '\\x05') { rxIn = true; rxLen = 0; }",
    '    else if (rxIn) {',
    "      if (ch == '\\n') { rxBuf[rxLen] = 0; rxIn = false; rxHandle(); }",
    '      else if (rxLen < sizeof(rxBuf) - 1) rxBuf[rxLen++] = ch;',
    '      else rxIn = false;   // taşan paket çöpe',
    '    }',
    '    // \\x06 klavye paketleri ve diğer her şey sessizce atlanır',
    '  }',
    '}',
    '',
  ].join('\n');
}

/** Tek eklem canlı komut paketi ("\x05J1:120\n"). Açı FİZİKSEL derecedir. */
export function armLiveCommand(joint: number, physicalAngle: number): string {
  const a = Math.max(0, Math.min(180, Math.round(physicalAngle)));
  return `\x05J${joint}:${a}\n`;
}
