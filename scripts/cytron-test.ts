/**
 * RoboCYTRON blokları için hızlı kod üretim testi.
 *   npx tsx scripts/cytron-test.ts
 * Her bloğu tek tek üretir; hata verirse veya beklenen çağrı çıkmazsa uyarır.
 */
import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import '../src/blockly/blocks';
import '../src/blockly/generator';
import { setRoboCytronMode } from '../src/blockly/robocytron-blocks';
import { robocytronToolboxCategory } from '../src/blockly/robocytron-blocks';

setRoboCytronMode(true);

// Toolbox XML'inden tüm rx_cy_* blok tiplerini çıkar
const types = Array.from(
  new Set(
    [...robocytronToolboxCategory.matchAll(/<block type="(rx_cy_[a-z0-9_]+)"/g)].map((m) => m[1])
  )
);

let bad = 0;
console.log(`Toolbox'ta ${types.length} RoboCYTRON bloğu bulundu.\n`);

for (const type of types) {
  try {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock(type);
    // Değer girişlerine sayı bağla ki "None" sızmasın
    for (const input of block.inputList) {
      if (input.connection && input.connection.type === Blockly.INPUT_VALUE) {
        const num = ws.newBlock('math_number');
        num.setFieldValue('5', 'NUM');
        input.connection.connect(num.outputConnection!);
      }
    }
    const isValue = !!block.outputConnection;
    const out = isValue
      ? (pythonGenerator as any).forBlock[type](block, pythonGenerator)
      : (pythonGenerator as any).forBlock[type](block, pythonGenerator);
    const code = Array.isArray(out) ? out[0] : out;
    ws.dispose();

    if (!code || /None/.test(code)) throw new Error(`şüpheli çıktı: ${code}`);
    if (!/^bot\.|^\d+$/.test(code.trim())) throw new Error(`bot.* çağrısı yok: ${code}`);
    console.log(`  ✓ ${type.padEnd(22)} → ${code.trim().split('\n')[0]}`);
  } catch (e: any) {
    console.error(`  ✗ ${type}: ${e.message}`);
    bad++;
  }
}

// Tam workspace testi: import satırı gerçekten ekleniyor mu?
const ws = new Blockly.Workspace();
const b = ws.newBlock('rx_cy_stop');
const full = pythonGenerator.workspaceToCode(ws);
ws.dispose();
const hasImport = full.includes('from robocytron import RoboCytron') && full.includes('bot = RoboCytron()');
console.log(`\nImport testi: ${hasImport ? '✓ import + singleton eklendi' : '✗ import EKSİK'}`);
if (!hasImport) bad++;
void b;

console.log(bad === 0 ? `\n✅ ${types.length}/${types.length} blok temiz` : `\n❌ ${bad} sorun`);
process.exit(bad === 0 ? 0 : 1);
