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

// --- Ek bloklar: alçak seviye + yüksek seviye ---

Blockly.Blocks['rx_bb_motor_single'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField(
        new Blockly.FieldDropdown([
          ['sol', 'left'],
          ['sağ', 'right'],
        ]),
        'SIDE'
      )
      .appendField('motoru hız %');
    this.appendValueInput('SPEED').setCheck('Number');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tek motoru sürer. Hız: -100..100 (eksi = geri)');
  },
};

Blockly.Blocks['rx_bb_move_time'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField(
        new Blockly.FieldDropdown([
          ['ileri ⬆', 'FWD'],
          ['geri ⬇', 'BWD'],
          ['sola ⬅', 'LEFT'],
          ['sağa ➡', 'RIGHT'],
        ]),
        'DIR'
      )
      .appendField('git · hız %');
    this.appendValueInput('SPEED').setCheck('Number');
    this.appendDummyInput().appendField('süre (sn)');
    this.appendValueInput('SEC').setCheck('Number');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Belirtilen süre boyunca gider, sonra kendiliğinden durur');
  },
};

Blockly.Blocks['rx_bb_matrix_bar'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.display))
      .appendField('Ekranda çubuk göster (0-5)');
    this.appendValueInput('N').setCheck('Number');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Alttan yukarı n satır doldurur — seviye/pil göstergesi gibi');
  },
};

Blockly.Blocks['rx_bb_matrix_progress'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.display))
      .appendField('Ekranda % dolum göster');
    this.appendValueInput('PCT').setCheck('Number');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('0-100 arası yüzdeyi 25 piksellik dolum olarak gösterir');
  },
};

Blockly.Blocks['rx_bb_matrix_row'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.display))
      .appendField('Ekran satırı y');
    this.appendValueInput('Y').setCheck('Number');
    this.appendDummyInput().appendField('desen (0-31)');
    this.appendValueInput('BITS').setCheck('Number');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Alçak seviye: satırı 5 bitlik sayıyla doldur. Örn 31 = tüm satır, 17 = kenarlar (10001)');
  },
};

Blockly.Blocks['rx_bb_ring_fill_rgb'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Halkayı boya R');
    this.appendValueInput('R').setCheck('Number');
    this.appendDummyInput().appendField('G');
    this.appendValueInput('G').setCheck('Number');
    this.appendDummyInput().appendField('B');
    this.appendValueInput('B').setCheck('Number');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Alçak seviye: rengi 0-255 arası R,G,B sayılarıyla ver');
  },
};

Blockly.Blocks['rx_bb_ring_set_rgb'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Halka LED no');
    this.appendValueInput('INDEX').setCheck('Number');
    this.appendDummyInput().appendField('R');
    this.appendValueInput('R').setCheck('Number');
    this.appendDummyInput().appendField('G');
    this.appendValueInput('G').setCheck('Number');
    this.appendDummyInput().appendField('B');
    this.appendValueInput('B').setCheck('Number');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Alçak seviye: tek LED\'e 0-255 R,G,B değeri. LED no: 1-7');
  },
};

Blockly.Blocks['rx_bb_ring_brightness'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Halka parlaklığı %');
    this.appendValueInput('PCT').setCheck('Number');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tüm halkanın parlaklığı: 0-100');
  },
};

Blockly.Blocks['rx_bb_tone'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Ses çal · frekans (Hz)');
    this.appendValueInput('FREQ').setCheck('Number');
    this.appendDummyInput().appendField('süre (ms)');
    this.appendValueInput('MS').setCheck('Number');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Alçak seviye: istediğin frekansta bip. İnsan kulağı ~20-15000 Hz duyar');
  },
};

Blockly.Blocks['rx_bb_note'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Nota çal')
      .appendField(
        new Blockly.FieldDropdown([
          ['Do (C4)', 'C4'], ['Re (D4)', 'D4'], ['Mi (E4)', 'E4'],
          ['Fa (F4)', 'F4'], ['Sol (G4)', 'G4'], ['La (A4)', 'A4'],
          ['Si (B4)', 'B4'], ['Do (C5)', 'C5'], ['Re (D5)', 'D5'],
          ['Mi (E5)', 'E5'], ['Fa (F5)', 'F5'], ['Sol (G5)', 'G5'],
          ['La (A5)', 'A5'], ['Si (B5)', 'B5'], ['Do (C6)', 'C6'],
        ]),
        'NOTE'
      )
      .appendField('süre (ms)');
    this.appendValueInput('MS').setCheck('Number');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Seçilen müzik notasını çalar');
  },
};

Blockly.Blocks['rx_bb_quiet'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Sesi kes 🔇');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Buzzer\'ı susturur');
  },
};

Blockly.Blocks['rx_bb_distance_mm'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ruler))
      .appendField('mesafe (mm) · ham');
    this.setStyle('ultra_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Alçak seviye: milimetre cinsinden tek okuma. Yansıma yoksa 65535');
  },
};

Blockly.Blocks['rx_bb_obstacle'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ruler))
      .appendField('önünde engel var mı? <');
    this.appendValueInput('CM').setCheck('Number');
    this.appendDummyInput().appendField('cm');
    this.setStyle('ultra_blocks');
    this.setOutput(true, 'Boolean');
    this.setInputsInline(true);
    this.setTooltip('3 örnekli güvenilir okuma — engel eşikten yakınsa doğru (True)');
  },
};

Blockly.Blocks['rx_bb_line_raw'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.eye))
      .appendField(
        new Blockly.FieldDropdown([['sol', '0'], ['sağ', '1']]),
        'SIDE'
      )
      .appendField('çizgi sensörü · ham değer');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Alçak seviye: analog değer 0-65535. Siyah zemin = büyük sayı');
  },
};

Blockly.Blocks['rx_bb_line_threshold'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.eye))
      .appendField('çizgi eşiğini ayarla');
    this.appendValueInput('TH').setCheck('Number');
    this.setStyle('sensor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Alçak seviye: "çizgide mi?" kararının eşiği (varsayılan 50000). Pist zeminine göre ayarla');
  },
};

Blockly.Blocks['rx_bb_light_diff'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.light))
      .appendField('ışık farkı (sağ - sol)');
    this.setStyle('ldr_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Pozitif = sağ taraf daha aydınlık; ışık izleyen robotta yön bulmak için');
  },
};

Blockly.Blocks['rx_bb_bright'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.light))
      .appendField('ortam aydınlık mı? eşik');
    this.appendValueInput('TH').setCheck('Number');
    this.setStyle('ldr_blocks');
    this.setOutput(true, 'Boolean');
    this.setInputsInline(true);
    this.setTooltip('İki LDR ortalaması eşikten büyükse doğru (True). Eşik: 0-65535');
  },
};

Blockly.Blocks['rx_bb_ir_code'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ir))
      .appendField('son kumanda tuş kodu');
    this.setStyle('ir_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Alçak seviye: en son alınan NEC tuş kodu (sayı). Hiç basılmadıysa 0');
  },
};

Blockly.Blocks['rx_bb_battery_v'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.bolt))
      .appendField('Pil voltajı (V)');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Alçak seviye: pil gerilimi Volt olarak. Ölçüm donanımı yoksa -1');
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

pythonGenerator.forBlock['rx_bb_motor_single'] = function (block, generator) {
  needBot(generator);
  const sp = generator.valueToCode(block, 'SPEED', Order.NONE) || '0';
  return `bot.motors.${block.getFieldValue('SIDE')}(int(${sp}))\n`;
};

pythonGenerator.forBlock['rx_bb_move_time'] = function (block, generator) {
  needBot(generator);
  const sp = generator.valueToCode(block, 'SPEED', Order.NONE) || '80';
  const sec = generator.valueToCode(block, 'SEC', Order.NONE) || '1';
  const dir = block.getFieldValue('DIR');
  const expr: Record<string, string> = {
    FWD: `bot.motors.drive(int(${sp}), int(${sp}))`,
    BWD: `bot.motors.drive(-int(${sp}), -int(${sp}))`,
    LEFT: `bot.motors.drive(-int(${sp}), int(${sp}))`,
    RIGHT: `bot.motors.drive(int(${sp}), -int(${sp}))`,
  };
  return expr[dir] + `\ntime.sleep(${sec})\nbot.motors.stop()\n`;
};

pythonGenerator.forBlock['rx_bb_matrix_bar'] = function (block, generator) {
  needBot(generator);
  const n = generator.valueToCode(block, 'N', Order.NONE) || '0';
  return `bot.matrix.bar(int(${n}))\n`;
};

pythonGenerator.forBlock['rx_bb_matrix_progress'] = function (block, generator) {
  needBot(generator);
  const p = generator.valueToCode(block, 'PCT', Order.NONE) || '0';
  return `bot.matrix.progress(int(${p}))\n`;
};

pythonGenerator.forBlock['rx_bb_matrix_row'] = function (block, generator) {
  needBot(generator);
  const y = generator.valueToCode(block, 'Y', Order.NONE) || '0';
  const b = generator.valueToCode(block, 'BITS', Order.NONE) || '0';
  return `bot.matrix.set_row(int(${y}), int(${b}))\n`;
};

pythonGenerator.forBlock['rx_bb_ring_fill_rgb'] = function (block, generator) {
  needBot(generator);
  const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
  const g = generator.valueToCode(block, 'G', Order.NONE) || '0';
  const b = generator.valueToCode(block, 'B', Order.NONE) || '0';
  return `bot.ring.fill((int(${r}), int(${g}), int(${b})))\nbot.ring.show()\n`;
};

pythonGenerator.forBlock['rx_bb_ring_set_rgb'] = function (block, generator) {
  needBot(generator);
  const i = generator.valueToCode(block, 'INDEX', Order.NONE) || '1';
  const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
  const g = generator.valueToCode(block, 'G', Order.NONE) || '0';
  const b = generator.valueToCode(block, 'B', Order.NONE) || '0';
  return `bot.ring.set(max(0, min(6, int(${i}) - 1)), (int(${r}), int(${g}), int(${b})))\nbot.ring.show()\n`;
};

pythonGenerator.forBlock['rx_bb_ring_brightness'] = function (block, generator) {
  needBot(generator);
  const p = generator.valueToCode(block, 'PCT', Order.NONE) || '20';
  return `bot.ring.set_brightness(int(${p}))\n`;
};

pythonGenerator.forBlock['rx_bb_tone'] = function (block, generator) {
  needBot(generator);
  const f = generator.valueToCode(block, 'FREQ', Order.NONE) || '1000';
  const ms = generator.valueToCode(block, 'MS', Order.NONE) || '200';
  return `bot.buzzer.tone(int(${f}), int(${ms}))\n`;
};

pythonGenerator.forBlock['rx_bb_note'] = function (block, generator) {
  needBot(generator);
  const ms = generator.valueToCode(block, 'MS', Order.NONE) || '200';
  return `bot.buzzer.tone(bot.buzzer.NOTES['${block.getFieldValue('NOTE')}'], int(${ms}))\n`;
};

pythonGenerator.forBlock['rx_bb_quiet'] = function (_block, generator) {
  needBot(generator);
  return 'bot.buzzer.stop()\n';
};

pythonGenerator.forBlock['rx_bb_distance_mm'] = function (_block, generator) {
  needBot(generator);
  return ['bot.sonar.distance_mm()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_bb_obstacle'] = function (block, generator) {
  needBot(generator);
  const cm = generator.valueToCode(block, 'CM', Order.NONE) || '15';
  return [`bot.sonar.obstacle(int(${cm}))`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_bb_line_raw'] = function (block, generator) {
  needBot(generator);
  return [`bot.line.raw()[${block.getFieldValue('SIDE')}]`, Order.MEMBER];
};

pythonGenerator.forBlock['rx_bb_line_threshold'] = function (block, generator) {
  needBot(generator);
  const t = generator.valueToCode(block, 'TH', Order.NONE) || '50000';
  return `bot.line.threshold = int(${t})\n`;
};

pythonGenerator.forBlock['rx_bb_light_diff'] = function (_block, generator) {
  needBot(generator);
  return ['bot.light.diff()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_bb_bright'] = function (block, generator) {
  needBot(generator);
  const t = generator.valueToCode(block, 'TH', Order.NONE) || '10000';
  return [`bot.light.is_bright(int(${t}))`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_bb_ir_code'] = function (_block, generator) {
  needBot(generator);
  return ['bot.ir.last_code', Order.MEMBER];
};

pythonGenerator.forBlock['rx_bb_battery_v'] = function (_block, generator) {
  needBot(generator);
  return ['bot.battery_v()', Order.FUNCTION_CALL];
};

// ====================================================================
// TOOLBOX KATEGORİSİ — toolbox.ts bunu XML'e ekler
// ====================================================================

export const berrybotToolboxCategory = `
  <category name="🍓 BerryBot Motor" categorystyle="motor_category">
    <label text="Hareket — yüksek seviye"></label>
    <block type="rx_bb_move">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
    <block type="rx_bb_move_time">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
      <value name="SEC"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="rx_bb_drive">
      <value name="L"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
      <value name="R"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
    <block type="rx_bb_stop"></block>
    <label text="Alçak seviye"></label>
    <block type="rx_bb_motor_single">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
  </category>

  <category name="🍓 BerryBot LED Matris" categorystyle="oled_category">
    <label text="5x5 ekran — yüksek seviye"></label>
    <block type="rx_bb_matrix_icon"></block>
    <block type="rx_bb_matrix_scroll">
      <value name="TEXT"><shadow type="text"><field name="TEXT">123</field></shadow></value>
    </block>
    <block type="rx_bb_matrix_bar">
      <value name="N"><shadow type="math_number"><field name="NUM">3</field></shadow></value>
    </block>
    <block type="rx_bb_matrix_progress">
      <value name="PCT"><shadow type="math_number"><field name="NUM">50</field></shadow></value>
    </block>
    <block type="rx_bb_matrix_clear"></block>
    <label text="Alçak seviye — piksel/satır"></label>
    <block type="rx_bb_matrix_pixel">
      <value name="X"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
      <value name="Y"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
    </block>
    <block type="rx_bb_matrix_row">
      <value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="BITS"><shadow type="math_number"><field name="NUM">31</field></shadow></value>
    </block>
  </category>

  <category name="🍓 BerryBot RGB LED" categorystyle="rgb_category">
    <label text="7'li halka — yüksek seviye"></label>
    <block type="rx_bb_ring_fill"></block>
    <block type="rx_bb_ring_set">
      <value name="INDEX"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="rx_bb_ring_rainbow"></block>
    <block type="rx_bb_ring_off"></block>
    <block type="rx_bb_ring_brightness">
      <value name="PCT"><shadow type="math_number"><field name="NUM">20</field></shadow></value>
    </block>
    <label text="Alçak seviye — R,G,B sayılarıyla"></label>
    <block type="rx_bb_ring_fill_rgb">
      <value name="R"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="G"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="B"><shadow type="math_number"><field name="NUM">255</field></shadow></value>
    </block>
    <block type="rx_bb_ring_set_rgb">
      <value name="INDEX"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="R"><shadow type="math_number"><field name="NUM">255</field></shadow></value>
      <value name="G"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="B"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    </block>
  </category>

  <category name="🍓 BerryBot Ses" categorystyle="buzzer_category">
    <block type="rx_bb_horn"></block>
    <block type="rx_bb_note">
      <value name="MS"><shadow type="math_number"><field name="NUM">200</field></shadow></value>
    </block>
    <label text="Alçak seviye"></label>
    <block type="rx_bb_tone">
      <value name="FREQ"><shadow type="math_number"><field name="NUM">1000</field></shadow></value>
      <value name="MS"><shadow type="math_number"><field name="NUM">200</field></shadow></value>
    </block>
    <block type="rx_bb_quiet"></block>
  </category>

  <category name="🍓 BerryBot Mesafe" categorystyle="ultra_category">
    <label text="Yüksek seviye"></label>
    <block type="rx_bb_obstacle">
      <value name="CM"><shadow type="math_number"><field name="NUM">15</field></shadow></value>
    </block>
    <block type="rx_bb_distance"></block>
    <label text="Alçak seviye"></label>
    <block type="rx_bb_distance_mm"></block>
  </category>

  <category name="🍓 BerryBot Çizgi" categorystyle="sensor_category">
    <label text="Yüksek seviye"></label>
    <block type="rx_bb_line"></block>
    <label text="Alçak seviye — analog"></label>
    <block type="rx_bb_line_raw"></block>
    <block type="rx_bb_line_threshold">
      <value name="TH"><shadow type="math_number"><field name="NUM">50000</field></shadow></value>
    </block>
  </category>

  <category name="🍓 BerryBot Işık (LDR)" categorystyle="ldr_category">
    <label text="Yüksek seviye"></label>
    <block type="rx_bb_bright">
      <value name="TH"><shadow type="math_number"><field name="NUM">10000</field></shadow></value>
    </block>
    <block type="rx_bb_light_diff"></block>
    <label text="Alçak seviye — analog"></label>
    <block type="rx_bb_light"></block>
  </category>

  <category name="🍓 BerryBot Kumanda + Buton" categorystyle="ir_category">
    <block type="rx_bb_ir_pressed"></block>
    <block type="rx_bb_button"></block>
    <label text="Alçak seviye"></label>
    <block type="rx_bb_ir_code"></block>
  </category>

  <category name="🍓 BerryBot Pil" categorystyle="sensor_category">
    <block type="rx_bb_battery"></block>
    <block type="rx_bb_show_battery"></block>
    <label text="Alçak seviye"></label>
    <block type="rx_bb_battery_v"></block>
  </category>
`;

