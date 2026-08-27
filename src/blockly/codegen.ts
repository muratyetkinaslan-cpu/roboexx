import { pythonGenerator } from './generator';
import { arduinoGenerator } from './arduino-generator';
import { setBerryBotMode } from './berrybot-blocks';
import { setRoboCytronMode } from './robocytron-blocks';

/** Üretilecek kod hedefi. */
export type CodeTarget = 'micropython' | 'arduino' | 'berrybot' | 'robocytron';

/** İnsan-okur etiketler. */
export const TARGET_LABELS: Record<CodeTarget, string> = {
  micropython: 'MicroPython · Pico / ESP32',
  arduino: 'Arduino · C++',
  berrybot: 'MicroPython · BerryBot 🍓',
  robocytron: 'MicroPython · Cytron Maker Pi RP2040 🤖',
};

/** Hedefe göre doğru Blockly generator'ı döndürür.
 *  'berrybot' ve 'robocytron' da MicroPython üretir — üstüne ilgili
 *  kütüphane import'u eklenir. */
export function getGenerator(target: CodeTarget) {
  return target === 'arduino' ? arduinoGenerator : pythonGenerator;
}

/** Workspace'ten seçili hedef için kod üretir (hata olursa boş döner). */
export function generateForTarget(target: CodeTarget, ws: any): string {
  setBerryBotMode(target === 'berrybot');
  setRoboCytronMode(target === 'robocytron');
  try {
    return getGenerator(target).workspaceToCode(ws);
  } catch (e) {
    console.error(`[RoboExx] ${target} kod üretim hatası:`, e);
    return `// Kod üretilemedi: ${(e as Error).message}`;
  } finally {
    setBerryBotMode(false);
    setRoboCytronMode(false);
  }
}
