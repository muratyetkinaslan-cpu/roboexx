import * as Blockly from 'blockly';
import { pythonGenerator, Order } from 'blockly/python';
import { ICONS } from './icons';
import { FieldColourPalette } from './colour-field';

/**
 * 🍓 BerryBot blokları (Robotistan BerryBot, RP2040).
 *
 * Üretilen kod `berrybot.py` v2 kütüphanesini kullanır ve
 * `bot = BerryBot()` singleton'ı üzerinden çalışır. Bootloader
 * (berrybot_main.py) aynı singleton'ı paylaştığı için matris timer'ı,
 * NeoPixel PIO makinesi vb. iki kez kurulmaz.
 *
 * Hedef kart "🍓 BerryBot" seçiliyken üretilen koda otomatik olarak
 * `from berrybot import ...` girer; ayrıca bu bloklardan HERHANGİ biri
 * kullanılırsa hedef ne olursa olsun import kendiliğinden eklenir.
 */

const icon = (uri: string) => new Blockly.FieldImage(uri, 20, 20, '');

/** '#rrggbb' → (r,g,b) */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

// ====================================================================
// HEDEF MODU — codegen.ts generateForTarget çağırmadan önce ayarlar
// ====================================================================

let berrybotMode = false;

/** Kod hedefi 'berrybot' iken true — global import'u değiştirir. */
export function setBerryBotMode(on: boolean): void {
  berrybotMode = on;
}

// generator.ts'in init sarmalayıcısının ÜZERİNE ikinci bir sarmalayıcı:
// BerryBot hedefinde berrybot import'u + bot singleton'ı eklenir.
// (roboexx import'u da kalır — generic pin/buzzer/zaman blokları
//  BerryBot üzerinde de çalışsın diye; roboexx.py import'u tembeldir,
//  donanım kurmaz.)
const _prevInit = pythonGenerator.init.bind(pythonGenerator);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pythonGenerator as any).init = function (workspace: any) {
  _prevInit(workspace);
  if (berrybotMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).definitions_['_rx_import_berrybot'] =
      'from berrybot import BerryBot, IR_KEYS\nbot = BerryBot()';
  }
};

/** Her BerryBot blok üreticisi bunu çağırır — hedef ne olursa olsun
 *  import + singleton tanımı koda girer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function needBot(generator: any): void {
  generator.definitions_['_rx_import_berrybot'] =
    'from berrybot import BerryBot, IR_KEYS\nbot = BerryBot()';
}

// ====================================================================
// BLOK TANIMLARI
// ====================================================================

// --- Hareket ---

Blockly.Blocks['rx_bb_move'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField('BerryBot')
      .appendField(
        new Blockly.FieldDropdown([
          ['ileri git ⬆', 'FWD'],
          ['geri git ⬇', 'BWD'],
          ['sola dön ⬅', 'LEFT'],
          ['sağa dön ➡', 'RIGHT'],
        ]),
        'DIR'
      )
      .appendField('hız %');
    this.appendValueInput('SPEED').setCheck('Number');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('BerryBot\'u seçilen yönde sürer. Hız: 0-100');
  },
};

Blockly.Blocks['rx_bb_drive'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField('BerryBot sür · sol %');
    this.appendValueInput('L').setCheck('Number');
    this.appendDummyInput().appendField('sağ %');
    this.appendValueInput('R').setCheck('Number');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tank sürüşü: her teker için ayrı hız (-100..100). Eksi = geri');
  },
};

Blockly.Blocks['rx_bb_stop'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.stop))
      .appendField('BerryBot dur');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Her iki motoru da durdurur');
  },
};

// --- 5x5 LED Matris (ekran) ---

const BB_ICON_OPTIONS: [string, string][] = [
  ['😊 gülümse', 'smile'],
  ['☹ üzgün', 'sad'],
  ['❤ kalp', 'heart'],
  ['✓ onay', 'yes'],
  ['✗ çarpı', 'no'],
  ['⬆ ileri', 'forward'],
  ['⬇ geri', 'backward'],
  ['⬅ sol', 'left'],
  ['➡ sağ', 'right'],
  ['■ dolu', 'full'],
  ['☀ güneş', 'sunny'],
  ['📶 bluetooth', 'bluetooth'],
  ['🔋 pil', 'battery'],
  ['△ üçgen', 'triangle'],
];

Blockly.Blocks['rx_bb_matrix_icon'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.display))
      .appendField('Ekranda göster')
      .appendField(new Blockly.FieldDropdown(BB_ICON_OPTIONS), 'ICON');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('5x5 LED ekranda hazır bir şekil gösterir');
  },
};

Blockly.Blocks['rx_bb_matrix_pixel'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.display))
      .appendField('Ekran pikseli x');
    this.appendValueInput('X').setCheck('Number');
    this.appendDummyInput().appendField('y');
    this.appendValueInput('Y').setCheck('Number');
    this.appendDummyInput().appendField(
      new Blockly.FieldDropdown([
        ['yak 💡', '1'],
        ['söndür', '0'],
      ]),
      'ON'
    );
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tek pikseli yakar/söndürür. x ve y: 0-4');
  },
};

Blockly.Blocks['rx_bb_matrix_scroll'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.marquee))
      .appendField('Ekranda kaydır');
    this.appendValueInput('TEXT');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Sayı/kısa metni ekranda kayan yazı olarak gösterir (rakamlar, % ? - !)');
  },
};

Blockly.Blocks['rx_bb_matrix_clear'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.eraser))
      .appendField('Ekranı temizle');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('5x5 ekrandaki her şeyi siler');
  },
};

// --- RGB halka ---

Blockly.Blocks['rx_bb_ring_fill'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Halkayı boya')
      .appendField(new FieldColourPalette('#3355ff'), 'COLOUR');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('7 RGB LED\'in hepsini seçilen renge boyar');
  },
};

Blockly.Blocks['rx_bb_ring_set'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Halka LED no');
    this.appendValueInput('INDEX').setCheck('Number');
    this.appendDummyInput()
      .appendField('rengi')
      .appendField(new FieldColourPalette('#ff0000'), 'COLOUR');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tek LED\'i boyar. LED no: 1-7');
  },
};

Blockly.Blocks['rx_bb_ring_rainbow'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rainbow))
      .appendField('Halkada gökkuşağı 🌈');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('"Sürekli tekrarla" içinde kullan — halka gökkuşağı gibi döner');
  },
};

Blockly.Blocks['rx_bb_ring_off'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Halkayı söndür');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Tüm RGB LED\'leri kapatır');
  },
};

// --- Ses ---

Blockly.Blocks['rx_bb_horn'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Korna çal 📣');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('BerryBot kornasını 0.3 saniye öttürür');
  },
};

// --- Sensörler (değer blokları) ---

Blockly.Blocks['rx_bb_distance'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ruler))
      .appendField('BerryBot mesafe (cm)');
    this.setStyle('ultra_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Öndeki engele uzaklık (cm). Engel yoksa 400 döner');
  },
};

Blockly.Blocks['rx_bb_line'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.eye))
      .appendField(
        new Blockly.FieldDropdown([
          ['sol', 'L'],
          ['sağ', 'R'],
        ]),
        'SIDE'
      )
      .appendField('çizgi sensörü siyahta mı?');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Seçilen çizgi sensörü siyah çizgiyi görüyorsa doğru (True)');
  },
};

Blockly.Blocks['rx_bb_light'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.light))
      .appendField(
        new Blockly.FieldDropdown([
          ['sol', '0'],
          ['sağ', '1'],
        ]),
        'SIDE'
      )
      .appendField('ışık sensörü (LDR)');
    this.setStyle('ldr_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Seçilen LDR\'nin ham değeri (0-65535). Çok ışık = büyük sayı');
  },
};

Blockly.Blocks['rx_bb_ir_pressed'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ir))
      .appendField('Kumandada')
      .appendField(
        new Blockly.FieldDropdown([
          ['⬆ yukarı', 'UP'],
          ['⬇ aşağı', 'DOWN'],
          ['⬅ sol', 'LEFT'],
          ['➡ sağ', 'RIGHT'],
          ['OK', 'OK'],
          ['1', '1'], ['2', '2'], ['3', '3'],
          ['4', '4'], ['5', '5'], ['6', '6'],
          ['7', '7'], ['8', '8'], ['9', '9'],
        ]),
        'KEY'
      )
      .appendField('tuşuna basıldı mı?');
    this.setStyle('ir_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('IR kumandada seçilen tuşa yeni basıldıysa doğru (True)');
  },
};

Blockly.Blocks['rx_bb_button'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.button))
      .appendField('BerryBot butonuna basılı mı?');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Üstteki mod butonu basılıysa doğru (True)');
  },
};

// --- Pil ---

Blockly.Blocks['rx_bb_battery'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.bolt))
      .appendField('Pil yüzdesi 🔋');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Kalan pil (%0-100). Ölçüm donanımı yoksa -1 döner');
  },
};

Blockly.Blocks['rx_bb_show_battery'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.display))
      .appendField('Ekranda pili göster 🔋');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('5x5 ekranda pil çubuğu + kayan yüzde gösterir');
  },
};

// ====================================================================
// MICROPYTHON ÜRETİCİLERİ
// ====================================================================

pythonGenerator.forBlock['rx_bb_move'] = function (block, generator) {
  needBot(generator);
  const s = generator.valueToCode(block, 'SPEED', Order.NONE) || '80';
  const dir = block.getFieldValue('DIR');
  const expr: Record<string, string> = {
    FWD: `bot.motors.drive(int(${s}), int(${s}))`,
    BWD: `bot.motors.drive(-int(${s}), -int(${s}))`,
    LEFT: `bot.motors.drive(-int(${s}), int(${s}))`,
    RIGHT: `bot.motors.drive(int(${s}), -int(${s}))`,
  };
  return expr[dir] + '\n';
};

pythonGenerator.forBlock['rx_bb_drive'] = function (block, generator) {
  needBot(generator);
  const l = generator.valueToCode(block, 'L', Order.NONE) || '0';
  const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
  return `bot.motors.drive(int(${l}), int(${r}))\n`;
};

pythonGenerator.forBlock['rx_bb_stop'] = function (_block, generator) {
  needBot(generator);
  return 'bot.motors.stop()\n';
};

pythonGenerator.forBlock['rx_bb_matrix_icon'] = function (block, generator) {
  needBot(generator);
  return `bot.matrix.show('${block.getFieldValue('ICON')}')\n`;
};

pythonGenerator.forBlock['rx_bb_matrix_pixel'] = function (block, generator) {
  needBot(generator);
  const x = generator.valueToCode(block, 'X', Order.NONE) || '0';
  const y = generator.valueToCode(block, 'Y', Order.NONE) || '0';
  return `bot.matrix.set_pixel(int(${x}), int(${y}), ${block.getFieldValue('ON')})\n`;
};

pythonGenerator.forBlock['rx_bb_matrix_scroll'] = function (block, generator) {
  needBot(generator);
  const t = generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
  return `bot.matrix.scroll(${t})\n`;
};

pythonGenerator.forBlock['rx_bb_matrix_clear'] = function (_block, generator) {
  needBot(generator);
  return 'bot.matrix.clear()\n';
};

pythonGenerator.forBlock['rx_bb_ring_fill'] = function (block, generator) {
  needBot(generator);
  const { r, g, b } = hexToRgb(block.getFieldValue('COLOUR'));
  return `bot.ring.fill((${r}, ${g}, ${b}))\nbot.ring.show()\n`;
};

pythonGenerator.forBlock['rx_bb_ring_set'] = function (block, generator) {
  needBot(generator);
  const idx = generator.valueToCode(block, 'INDEX', Order.NONE) || '1';
  const { r, g, b } = hexToRgb(block.getFieldValue('COLOUR'));
  return `bot.ring.set(max(0, min(6, int(${idx}) - 1)), (${r}, ${g}, ${b}))\nbot.ring.show()\n`;
};

pythonGenerator.forBlock['rx_bb_ring_rainbow'] = function (_block, generator) {
  needBot(generator);
  return 'bot.ring.rainbow()\n';
};

pythonGenerator.forBlock['rx_bb_ring_off'] = function (_block, generator) {
  needBot(generator);
  return 'bot.ring.off()\n';
};

pythonGenerator.forBlock['rx_bb_horn'] = function (_block, generator) {
  needBot(generator);
  return 'bot.buzzer.horn()\n';
};

pythonGenerator.forBlock['rx_bb_distance'] = function (_block, generator) {
  needBot(generator);
  return ['bot.sonar.distance_cm()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_bb_line'] = function (block, generator) {
  needBot(generator);
  const i = block.getFieldValue('SIDE') === 'L' ? 0 : 1;
  return [`bot.line.on_line()[${i}]`, Order.MEMBER];
};

pythonGenerator.forBlock['rx_bb_light'] = function (block, generator) {
  needBot(generator);
  return [`bot.light.raw()[${block.getFieldValue('SIDE')}]`, Order.MEMBER];
};

pythonGenerator.forBlock['rx_bb_ir_pressed'] = function (block, generator) {
  needBot(generator);
  return [`bot.ir.pressed(IR_KEYS['${block.getFieldValue('KEY')}'])`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_bb_button'] = function (_block, generator) {
  needBot(generator);
  return ['bot.button.value() == 1', Order.RELATIONAL];
};

pythonGenerator.forBlock['rx_bb_battery'] = function (_block, generator) {
  needBot(generator);
  return ['bot.battery_pct()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_bb_show_battery'] = function (_block, generator) {
  needBot(generator);
  return 'bot.show_battery()\n';
};

// ====================================================================
// TOOLBOX KATEGORİSİ — toolbox.ts bunu XML'e ekler
// ====================================================================

export const berrybotToolboxCategory = `
  <category name="🍓 BerryBot" categorystyle="motor_category">
    <label text="Robotistan BerryBot — hareket, ekran, halka, sensörler"></label>
    <block type="rx_bb_move">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
    <block type="rx_bb_drive">
      <value name="L"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
      <value name="R"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
    <block type="rx_bb_stop"></block>
    <block type="rx_bb_matrix_icon"></block>
    <block type="rx_bb_matrix_pixel">
      <value name="X"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
      <value name="Y"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
    </block>
    <block type="rx_bb_matrix_scroll">
      <value name="TEXT"><shadow type="text"><field name="TEXT">123</field></shadow></value>
    </block>
    <block type="rx_bb_matrix_clear"></block>
    <block type="rx_bb_ring_fill"></block>
    <block type="rx_bb_ring_set">
      <value name="INDEX"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="rx_bb_ring_rainbow"></block>
    <block type="rx_bb_ring_off"></block>
    <block type="rx_bb_horn"></block>
    <block type="rx_bb_distance"></block>
    <block type="rx_bb_line"></block>
    <block type="rx_bb_light"></block>
    <block type="rx_bb_ir_pressed"></block>
    <block type="rx_bb_button"></block>
    <block type="rx_bb_battery"></block>
    <block type="rx_bb_show_battery"></block>
  </category>
`;
