import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import '../src/blockly/blocks';
import '../src/blockly/generator';
import { setBerryBotMode } from '../src/blockly/berrybot-blocks';
import { BERRYTANK_SOLUTIONS } from '../src/library/berrytank-solutions';

setBerryBotMode(true);
let bad = 0;
for (const f of BERRYTANK_SOLUTIONS.files) {
  try {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(f.blocks as any, ws);
    const code = pythonGenerator.workspaceToCode(ws);
    ws.dispose();
    if (!code.includes('from berrybot import') && f.id !== 'bt-g30') throw new Error('bb import yok');
    // Blockly değişkenleri "x = None" ile ön-tanımlar — normal.
    // Gerçek sorun: bir fonksiyon çağrısına None sızması.
    const kotu = code.split('\n').filter(l => /\(None|, ?None|None ?[*+\/-]|[*+\/-] ?None/.test(l));
    if (kotu.length) throw new Error('None sızıntısı:\n' + kotu.join('\n'));
  } catch (e: any) { console.error('❌', f.id, e.message); bad++; }
}
console.log(bad === 0 ? '✅ 36/36 Python kod üretimi temiz' : `${bad} dosyada kod üretim sorunu`);
