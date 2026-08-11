/**
 * Robot kol — blok programını SİMÜLASYONDA çalıştırmak için kod üreteci.
 *
 * RoboBOT sim üreteci akış/zaman/tuş/print bloklarını zaten karşılar; burada
 * yalnız 🦾 kol bloklarını panelin `bot.arm*` API'sine bağlarız. Kol üreteçleri
 * paylaşılan javascriptGenerator'a GEÇİCİ yazılır ve üretimden sonra eski
 * haline döndürülür — böylece RoboBOT simülasyonu etkilenmez.
 *
 * Panel API'si (RobotArmPanel içinde uygulanır):
 *   await bot.armGit(t, o, d, g, ms, curve)   // -1 = o eksen yerinde kalır
 *   await bot.armEksen(j, açı, ms, curve)
 *   await bot.armMerkez(ms) / bot.armTut(açıkMı, ms) / bot.armSelam(kez)
 *   await bot.armKupAl(taban, omuzAlçak) / bot.armKupBirak(taban, omuzAlçak)
 */
import { javascriptGenerator, Order } from 'blockly/javascript';
import type * as Blockly from 'blockly';
import { installSimGenerators } from '../robobot/sim-generator';

const ARM_TYPES = [
  'rx_arm_pins', 'rx_arm_pose', 'rx_arm_axis', 'rx_arm_home',
  'rx_arm_gripper', 'rx_arm_wave', 'rx_arm_cube_pick', 'rx_arm_cube_place',
] as const;

function installArmGenerators(): Record<string, unknown> {
  const G = javascriptGenerator;
  const saved: Record<string, unknown> = {};
  for (const t of ARM_TYPES) saved[t] = G.forBlock[t];

  G.forBlock['rx_arm_pins'] = () => '';   // sim'de fiziksel pin gerekmez

  G.forBlock['rx_arm_pose'] = function (block: Blockly.Block) {
    const t = G.valueToCode(block, 'T', Order.NONE) || '90';
    const o = G.valueToCode(block, 'O', Order.NONE) || '90';
    const d = G.valueToCode(block, 'D', Order.NONE) || '90';
    const g = G.valueToCode(block, 'G', Order.NONE) || '40';
    const ms = G.valueToCode(block, 'MS', Order.NONE) || '800';
    const curve = String(block.getFieldValue('CURVE') || 'ease');
    return `await bot.armGit(${t}, ${o}, ${d}, ${g}, ${ms}, "${curve}");\n`;
  };

  G.forBlock['rx_arm_axis'] = function (block: Blockly.Block) {
    const axis = block.getFieldValue('AXIS') || '0';
    const angle = G.valueToCode(block, 'ANGLE', Order.NONE) || '90';
    const ms = G.valueToCode(block, 'MS', Order.NONE) || '600';
    const curve = String(block.getFieldValue('CURVE') || 'ease');
    return `await bot.armEksen(${axis}, ${angle}, ${ms}, "${curve}");\n`;
  };

  G.forBlock['rx_arm_home'] = function (block: Blockly.Block) {
    const ms = G.valueToCode(block, 'MS', Order.NONE) || '800';
    return `await bot.armMerkez(${ms});\n`;
  };

  G.forBlock['rx_arm_gripper'] = function (block: Blockly.Block) {
    const act = block.getFieldValue('ACT') || 'open';
    const ms = G.valueToCode(block, 'MS', Order.NONE) || '350';
    return `await bot.armTut(${act === 'open' ? 'true' : 'false'}, ${ms});\n`;
  };

  G.forBlock['rx_arm_wave'] = function (block: Blockly.Block) {
    const times = G.valueToCode(block, 'TIMES', Order.NONE) || '2';
    return `await bot.armSelam(${times});\n`;
  };

  G.forBlock['rx_arm_cube_pick'] = function (block: Blockly.Block) {
    const base = G.valueToCode(block, 'BASE', Order.NONE) || '90';
    const low = G.valueToCode(block, 'LOW', Order.NONE) || '55';
    return `await bot.armKupAl(${base}, ${low});\n`;
  };

  G.forBlock['rx_arm_cube_place'] = function (block: Blockly.Block) {
    const base = G.valueToCode(block, 'BASE', Order.NONE) || '160';
    const low = G.valueToCode(block, 'LOW', Order.NONE) || '60';
    return `await bot.armKupBirak(${base}, ${low});\n`;
  };

  return saved;
}

function restoreArmGenerators(saved: Record<string, unknown>): void {
  const G = javascriptGenerator;
  for (const t of ARM_TYPES) {
    const prev = saved[t];
    if (prev === undefined) delete G.forBlock[t];
    else G.forBlock[t] = prev as (typeof G.forBlock)[string];
  }
}

/** Eşlenmemiş her blok tipi için güvenli stub — sim asla patlamaz. */
function ensureCovered(workspace: Blockly.Workspace): void {
  const G = javascriptGenerator;
  const seen = new Set<string>();
  for (const b of (workspace as unknown as { getAllBlocks(o: boolean): Blockly.Block[] }).getAllBlocks(false)) {
    const t = b.type;
    if (seen.has(t)) continue;
    seen.add(t);
    if (G.forBlock[t]) continue;
    if ((b as unknown as { outputConnection: unknown }).outputConnection) {
      G.forBlock[t] = (): [string, number] => ['0', Order.ATOMIC];
    } else {
      G.forBlock[t] = (): string => '';
    }
    console.warn('[ArmSim] Eşlenmemiş blok tipi sim\'de atlanıyor:', t);
  }
}

/** Çalışma alanını kol simülasyonu JS'ine çevirir. */
export function generateArmSimCode(workspace: Blockly.Workspace): string {
  installSimGenerators();          // akış/zaman/tuş/print + güvenli tabanlar
  const saved = installArmGenerators();
  const G = javascriptGenerator as unknown as { INFINITE_LOOP_TRAP: string | null };
  const savedTrap = G.INFINITE_LOOP_TRAP;
  // Boş gövdeli "tekrarla/while" döngüleri sekmeyi kilitlemesin:
  // her turda bir kare bekle + Durdur'u yakala (panel içinde koştuğumuz için şart).
  G.INFINITE_LOOP_TRAP = 'await bot.frame();\n';
  try {
    ensureCovered(workspace);
    return javascriptGenerator.workspaceToCode(workspace);
  } finally {
    G.INFINITE_LOOP_TRAP = savedTrap;
    restoreArmGenerators(saved);   // RoboBOT sim'i etkilenmesin
  }
}
