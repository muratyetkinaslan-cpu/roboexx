/**
 * Kütüphane doğrulama: her KitBlockFile gerçek Blockly'ye yüklenir,
 * geri serialize edilir ve kaynakta belirtilen her (blok tipi, alan adı,
 * alan değeri) üçlüsünün round-trip'te AYNEN korunduğu doğrulanır.
 * (Blockly bilinmeyen blok tipinde hata fırlatır ama bilinmeyen ALAN
 * adlarını sessizce yutar — bu test onu da yakalar.)
 *
 * Çalıştırma: npx tsx scripts/validate-solutions.ts
 */
import * as Blockly from 'blockly';
import 'blockly/python';
import '../src/blockly/blocks';
import '../src/blockly/berrybot-blocks';
import { KITS } from '../src/library/kits-blocks';

type AnyObj = Record<string, any>;

/** State ağacından (type, fieldName, fieldValue) üçlülerini topla. */
function collectFields(node: AnyObj, out: Array<[string, string, string]>): void {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string' && node.fields) {
    for (const [fname, fval] of Object.entries(node.fields as AnyObj)) {
      // Değişken alanları {id} nesnesi — id üzerinden karşılaştır
      const v = (fval && typeof fval === 'object' && 'id' in (fval as AnyObj))
        ? `id:${(fval as AnyObj).id}` : String(fval);
      out.push([node.type, fname, v]);
    }
  }
  for (const val of Object.values(node)) {
    if (Array.isArray(val)) val.forEach((x) => collectFields(x, out));
    else if (val && typeof val === 'object') collectFields(val as AnyObj, out);
  }
}

/** Blok tipi sayımı (kaynak vs round-trip karşılaştırması için). */
function countTypes(node: AnyObj, map: Map<string, number>): void {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string' && node.type !== 'math_number' /* shadow'lar değişebilir */) {
    map.set(node.type, (map.get(node.type) || 0) + 1);
  }
  for (const val of Object.values(node)) {
    if (Array.isArray(val)) val.forEach((x) => countTypes(x, map));
    else if (val && typeof val === 'object') countTypes(val as AnyObj, map);
  }
}

let fail = 0, pass = 0;

for (const kit of KITS) {
  for (const file of kit.files) {
    const label = `${kit.id} / ${file.id}`;
    try {
      const ws = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(file.blocks as AnyObj, ws);

      const saved = Blockly.serialization.workspaces.save(ws) as AnyObj;
      ws.dispose();

      // 1) Blok tipleri korunmuş mu?
      const srcTypes = new Map<string, number>(), outTypes = new Map<string, number>();
      countTypes(file.blocks as AnyObj, srcTypes);
      countTypes(saved, outTypes);
      for (const [t, n] of srcTypes) {
        if ((outTypes.get(t) || 0) < n) {
          throw new Error(`blok kayboldu: ${t} (kaynak ${n}, yüklenen ${outTypes.get(t) || 0})`);
        }
      }

      // 2) Alan adı+değeri korunmuş mu? (yanlış alan adı = sessiz kayıp)
      const srcFields: Array<[string, string, string]> = [];
      const outFields: Array<[string, string, string]> = [];
      collectFields(file.blocks as AnyObj, srcFields);
      collectFields(saved, outFields);
      const outSet = new Set(outFields.map((f) => f.join('§')));
      for (const f of srcFields) {
        if (!outSet.has(f.join('§'))) {
          throw new Error(`alan kayboldu/yanlış: ${f[0]}.${f[1]} = ${f[2]}`);
        }
      }

      console.log(`✅ ${label}`);
      pass++;
    } catch (e: any) {
      console.error(`❌ ${label}: ${e.message}`);
      fail++;
    }
  }
}

console.log(`\n${pass} geçti, ${fail} kaldı`);
if (fail > 0) process.exit(1);
