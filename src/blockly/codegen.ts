import { pythonGenerator } from './generator';
import { arduinoGenerator } from './arduino-generator';
import { setBerryBotMode } from './berrybot-blocks';

/** Üretilecek kod hedefi. */
export type CodeTarget = 'micropython' | 'arduino' | 'berrybot';

/** İnsan-okur etiketler. */
export const TARGET_LABELS: Record<CodeTarget, string> = {
  micropython: 'MicroPython · Pico / ESP32',
  arduino: 'Arduino · C++',
  berrybot: 'MicroPython · BerryBot 🍓',
};

/** Hedefe göre doğru Blockly generator'ı döndürür.
 *  'berrybot' da MicroPython üretir — üstüne berrybot import'u eklenir. */
export function getGenerator(target: CodeTarget) {
  return target === 'arduino' ? arduinoGenerator : pythonGenerator;
}

/** Workspace'ten seçili hedef için kod üretir (hata olursa boş döner). */
export function generateForTarget(target: CodeTarget, ws: any): string {
  setBerryBotMode(target === 'berrybot');
  try {
    return getGenerator(target).workspaceToCode(ws);
  } catch (e) {
    console.error(`[RoboExx] ${target} kod üretim hatası:`, e);
    return `// Kod üretilemedi: ${(e as Error).message}`;
  } finally {
    setBerryBotMode(false);
  }
}
