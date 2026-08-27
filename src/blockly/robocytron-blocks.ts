import * as Blockly from 'blockly';
import { pythonGenerator, Order } from 'blockly/python';
import { ICONS } from './icons';
import { FieldColourPalette } from './colour-field';

/**
 * 🤖 RoboCYTRON blokları (Cytron Maker Pi RP2040).
 *
 * Üretilen kod `robocytron.py` kütüphanesini kullanır ve
 * `bot = RoboCytron()` singleton'ı üzerinden çalışır.
 *
 * Kart üstündeki donanım:
 *   Motor  M1A=GP8  M1B=GP9  ·  M2A=GP10 M2B=GP11
 *   Servo  GP12 GP13 GP14 GP15
 *   RGB    GP18 (2 adet WS2812)
 *   Buzzer GP22 (yan taraftaki susturma anahtarı AÇIK olmalı)
 *   Buton  GP20 · GP21 (aktif düşük, dahili pull-up)
 *   Pil    GP29 (ADC3, kart üstü 1/2 bölücü)
 *   Grove  1:GP0/GP1  2:GP2/GP3  3:GP4/GP5  4:GP16/GP17
 *          5:GP6/GP26  6:GP26/GP27  7:GP7/GP28
 *
 * Hedef kart "🤖 RoboCYTRON" seçiliyken üretilen koda otomatik olarak
 * `from robocytron import RoboCytron` girer; ayrıca bu bloklardan
 * HERHANGİ biri kullanılırsa hedef ne olursa olsun import kendiliğinden
 * eklenir.
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

let robocytronMode = false;

/** Kod hedefi 'robocytron' iken true — global import'u değiştirir. */
export function setRoboCytronMode(on: boolean): void {
  robocytronMode = on;
}

// generator.ts + berrybot-blocks.ts init sarmalayıcılarının ÜZERİNE:
// RoboCYTRON hedefinde robocytron import'u + bot singleton'ı eklenir.
// (roboexx import'u da kalır — generic pin/zaman blokları bu kartta da
//  çalışsın diye; roboexx.py import'u tembeldir, donanım kurmaz.)
const _prevInit = pythonGenerator.init.bind(pythonGenerator);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pythonGenerator as any).init = function (workspace: any) {
  _prevInit(workspace);
  if (robocytronMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).definitions_['_rx_import_robocytron'] =
      'from robocytron import RoboCytron\nbot = RoboCytron()';
  }
};

/** Her RoboCYTRON blok üreticisi bunu çağırır — hedef ne olursa olsun
 *  import + singleton tanımı koda girer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function needBot(generator: any): void {
  generator.definitions_['_rx_import_robocytron'] =
    'from robocytron import RoboCytron\nbot = RoboCytron()';
}

/** Servo / buton / Grove gibi tekrar eden açılır listeler */
const SERVO_PORTS: [string, string][] = [
  ['1 (GP12)', '1'],
  ['2 (GP13)', '2'],
  ['3 (GP14)', '3'],
  ['4 (GP15)', '4'],
];

const BUTTON_PORTS: [string, string][] = [
  ['1 (GP20)', '1'],
  ['2 (GP21)', '2'],
];

const GROVE_PINS: [string, string][] = [
  ['Grove 1 · GP0', '0'],
  ['Grove 1 · GP1', '1'],
  ['Grove 2 · GP2', '2'],
  ['Grove 2 · GP3', '3'],
  ['Grove 3 · GP4', '4'],
  ['Grove 3 · GP5', '5'],
  ['Grove 4 · GP16', '16'],
  ['Grove 4 · GP17', '17'],
  ['Grove 5 · GP6', '6'],
  ['Grove 5/6 · GP26 (analog)', '26'],
  ['Grove 6 · GP27 (analog)', '27'],
  ['Grove 7 · GP7', '7'],
  ['Grove 7 · GP28 (analog)', '28'],
];

const GROVE_ANALOG: [string, string][] = [
  ['GP26 (Grove 5/6)', '26'],
  ['GP27 (Grove 6)', '27'],
  ['GP28 (Grove 7)', '28'],
];

// ====================================================================
// BLOK TANIMLARI
// ====================================================================

// --- Hareket ---

Blockly.Blocks['rx_cy_move'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField('RoboCYTRON')
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
    this.setTooltip('Robotu seçilen yönde sürer. Hız: 0-100');
  },
};

Blockly.Blocks['rx_cy_move_time'] = {
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

Blockly.Blocks['rx_cy_drive'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField('RoboCYTRON sür · sol %');
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

Blockly.Blocks['rx_cy_stop'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.stop))
      .appendField('RoboCYTRON dur');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Her iki motoru da durdurur (serbest bırakır)');
  },
};

Blockly.Blocks['rx_cy_brake'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.stop))
      .appendField('RoboCYTRON fren yap 🛑');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Aktif fren — motorları kilitleyerek anında durdurur');
  },
};

Blockly.Blocks['rx_cy_motor_single'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField(
        new Blockly.FieldDropdown([
          ['sol (M1)', 'left'],
          ['sağ (M2)', 'right'],
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

Blockly.Blocks['rx_cy_motor_invert'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.refresh))
      .appendField(
        new Blockly.FieldDropdown([
          ['sol (M1)', 'left'],
          ['sağ (M2)', 'right'],
        ]),
        'SIDE'
      )
      .appendField('motor yönünü')
      .appendField(
        new Blockly.FieldDropdown([
          ['ters çevir', 'True'],
          ['normale al', 'False'],
        ]),
        'ON'
      );
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Motor kablosu ters takıldıysa kabloyu sökmeden düzeltir. Programın başında bir kez kullan');
  },
};

// --- Servo ---

Blockly.Blocks['rx_cy_servo'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servo))
      .appendField('Servo')
      .appendField(new Blockly.FieldDropdown(SERVO_PORTS), 'PORT')
      .appendField('açı');
    this.appendValueInput('ANGLE').setCheck('Number');
    this.appendDummyInput().appendField('°');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Seçilen servo portundaki motoru 0-180° arası bir açıya götürür');
  },
};

Blockly.Blocks['rx_cy_servo_sweep'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servoArm))
      .appendField('Servo')
      .appendField(new Blockly.FieldDropdown(SERVO_PORTS), 'PORT')
      .appendField('yumuşak git');
    this.appendValueInput('FROM').setCheck('Number');
    this.appendDummyInput().appendField('° →');
    this.appendValueInput('TO').setCheck('Number');
    this.appendDummyInput().appendField('° süre (ms)');
    this.appendValueInput('MS').setCheck('Number');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('İki açı arasında yavaşça hareket eder — sarsıntısız görünür');
  },
};

Blockly.Blocks['rx_cy_servo_center'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servo))
      .appendField('Tüm servoları ortala (90°)');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('4 servonun hepsini 90 dereceye getirir — başlangıç duruşu');
  },
};

Blockly.Blocks['rx_cy_servo_off'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servo))
      .appendField('Servo')
      .appendField(new Blockly.FieldDropdown(SERVO_PORTS), 'PORT')
      .appendField('sinyalini kes');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Servo serbest kalır — titremeyi ve ısınmayı önler, pil tasarrufu sağlar');
  },
};

Blockly.Blocks['rx_cy_servo_us'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servoArm))
      .appendField('Servo')
      .appendField(new Blockly.FieldDropdown(SERVO_PORTS), 'PORT')
      .appendField('darbe (µs)');
    this.appendValueInput('US').setCheck('Number');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Alçak seviye: darbe genişliği 500-2500 µs. 1500 = orta. Sürekli dönen servolarda hız demektir');
  },
};

Blockly.Blocks['rx_cy_servo_read'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servo))
      .appendField('Servo')
      .appendField(new Blockly.FieldDropdown(SERVO_PORTS), 'PORT')
      .appendField('son açısı');
    this.setStyle('servo_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('En son yazılan açı değeri (0-180)');
  },
};

// --- RGB LED (2 adet WS2812, GP18) ---

Blockly.Blocks['rx_cy_rgb_fill'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB LED\'leri boya')
      .appendField(new FieldColourPalette('#3355ff'), 'COLOUR');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Kart üstündeki 2 RGB LED\'i de seçilen renge boyar');
  },
};

Blockly.Blocks['rx_cy_rgb_set'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB LED no')
      .appendField(
        new Blockly.FieldDropdown([
          ['1', '1'],
          ['2', '2'],
        ]),
        'INDEX'
      )
      .appendField('rengi')
      .appendField(new FieldColourPalette('#ff0000'), 'COLOUR');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tek LED\'i boyar. Kartta 2 adet RGB LED var');
  },
};

Blockly.Blocks['rx_cy_rgb_fill_rgb'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB LED\'leri boya R');
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

Blockly.Blocks['rx_cy_rgb_set_rgb'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB LED no');
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
    this.setTooltip('Alçak seviye: tek LED\'e 0-255 R,G,B değeri. LED no: 1-2');
  },
};

Blockly.Blocks['rx_cy_rgb_rainbow'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rainbow))
      .appendField('RGB LED gökkuşağı 🌈');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('"Sürekli tekrarla" içinde kullan — renkler yumuşakça döner');
  },
};

Blockly.Blocks['rx_cy_rgb_brightness'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB parlaklığı %');
    this.appendValueInput('PCT').setCheck('Number');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Parlaklık: 0-100. Düşük tutmak pil ömrünü uzatır');
  },
};

Blockly.Blocks['rx_cy_rgb_off'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB LED\'leri söndür');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('İki RGB LED\'i de kapatır');
  },
};

// --- Buzzer (GP22) ---

Blockly.Blocks['rx_cy_horn'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Korna çal 📣');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Buzzer\'ı 0.3 saniye öttürür. Kartın yanındaki buzzer anahtarı AÇIK olmalı');
  },
};

Blockly.Blocks['rx_cy_note'] = {
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

Blockly.Blocks['rx_cy_tone'] = {
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

Blockly.Blocks['rx_cy_quiet'] = {
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

// --- Butonlar (GP20 / GP21) ---

Blockly.Blocks['rx_cy_button'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.button))
      .appendField('Buton')
      .appendField(new Blockly.FieldDropdown(BUTTON_PORTS), 'WHICH')
      .appendField('basılı mı?');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Seçilen buton ŞU AN basılıysa doğru (True)');
  },
};

Blockly.Blocks['rx_cy_button_just'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.button))
      .appendField('Buton')
      .appendField(new Blockly.FieldDropdown(BUTTON_PORTS), 'WHICH')
      .appendField('yeni basıldı mı?');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Butona YENİ basıldıysa doğru. Basılı tutmak tek sefer sayılır — sayaç/mod değiştirme için ideal');
  },
};

Blockly.Blocks['rx_cy_button_wait'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.button))
      .appendField('Buton')
      .appendField(new Blockly.FieldDropdown(BUTTON_PORTS), 'WHICH')
      .appendField('basılana kadar bekle');
    this.setStyle('button_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Program burada durur; butona basılınca devam eder — "başlamak için bas" için kullan');
  },
};

// --- Grove sensörleri ---

Blockly.Blocks['rx_cy_grove_pin'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.pinOut))
      .appendField(new Blockly.FieldDropdown(GROVE_PINS), 'PIN');
    this.setStyle('io_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Grove portunun pin numarasını verir. "Pinler" kategorisindeki bloklara takılabilir');
  },
};

Blockly.Blocks['rx_cy_analog'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.analog))
      .appendField('Analog oku')
      .appendField(new Blockly.FieldDropdown(GROVE_ANALOG), 'PIN');
    this.setStyle('pot_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Grove analog pininden ham değer (0-65535). Potansiyometre, LDR, çizgi sensörü için');
  },
};

Blockly.Blocks['rx_cy_sonar_pins'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ruler))
      .appendField('Ultrasonik pinleri · trig')
      .appendField(new Blockly.FieldDropdown([...GROVE_PINS]), 'TRIG')
      .appendField('echo')
      .appendField(new Blockly.FieldDropdown([...GROVE_PINS]), 'ECHO');
    // Varsayılan: Grove 3 → trig GP4, echo GP5
    this.setFieldValue('4', 'TRIG');
    this.setFieldValue('5', 'ECHO');
    this.setStyle('ultra_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Ultrasonik sensörü hangi Grove portuna taktıysan onu seç. Varsayılan: Grove 3 (GP4/GP5)');
  },
};

Blockly.Blocks['rx_cy_distance'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ruler))
      .appendField('Mesafe (cm)');
    this.setStyle('ultra_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Öndeki engele uzaklık (cm). Engel yoksa 400 döner');
  },
};

Blockly.Blocks['rx_cy_obstacle'] = {
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

Blockly.Blocks['rx_cy_distance_mm'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ruler))
      .appendField('mesafe (mm) · ham');
    this.setStyle('ultra_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Alçak seviye: milimetre cinsinden tek okuma. Yansıma yoksa 65535');
  },
};

Blockly.Blocks['rx_cy_line_pins'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.eye))
      .appendField('Çizgi sensörü pinleri · sol')
      .appendField(new Blockly.FieldDropdown([...GROVE_ANALOG]), 'L')
      .appendField('sağ')
      .appendField(new Blockly.FieldDropdown([...GROVE_ANALOG]), 'R');
    // Varsayılan: sol GP26 (ADC0), sağ GP27 (ADC1)
    this.setFieldValue('26', 'L');
    this.setFieldValue('27', 'R');
    this.setStyle('sensor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Çizgi sensörlerini hangi analog pinlere taktıysan onları seç. Varsayılan: GP26 / GP27');
  },
};

Blockly.Blocks['rx_cy_line'] = {
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

Blockly.Blocks['rx_cy_line_raw'] = {
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

Blockly.Blocks['rx_cy_line_threshold'] = {
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

// --- Pil ---

Blockly.Blocks['rx_cy_battery'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.bolt))
      .appendField('Pil yüzdesi 🔋');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Kalan pil (%0-100). Kart üstündeki GP29 gerilim bölücüsünden ölçülür');
  },
};

Blockly.Blocks['rx_cy_battery_v'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.bolt))
      .appendField('Besleme voltajı (V)');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Alçak seviye: pil/Vin gerilimi Volt olarak');
  },
};

Blockly.Blocks['rx_cy_stop_all'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.stop))
      .appendField('Her şeyi durdur 🛑');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Motorları, servoları, sesi ve RGB LED\'leri kapatır — programın sonunda kullan');
  },
};

// ====================================================================
// MICROPYTHON ÜRETİCİLERİ
// ====================================================================

const DRIVE_EXPR = (s: string): Record<string, string> => ({
  FWD: `bot.motors.drive(int(${s}), int(${s}))`,
  BWD: `bot.motors.drive(-int(${s}), -int(${s}))`,
  LEFT: `bot.motors.drive(-int(${s}), int(${s}))`,
  RIGHT: `bot.motors.drive(int(${s}), -int(${s}))`,
});

pythonGenerator.forBlock['rx_cy_move'] = function (block, generator) {
  needBot(generator);
  const s = generator.valueToCode(block, 'SPEED', Order.NONE) || '80';
  return DRIVE_EXPR(s)[block.getFieldValue('DIR')] + '\n';
};

pythonGenerator.forBlock['rx_cy_move_time'] = function (block, generator) {
  needBot(generator);
  const s = generator.valueToCode(block, 'SPEED', Order.NONE) || '80';
  const sec = generator.valueToCode(block, 'SEC', Order.NONE) || '1';
  return DRIVE_EXPR(s)[block.getFieldValue('DIR')] +
    `\ntime.sleep(${sec})\nbot.motors.stop()\n`;
};

pythonGenerator.forBlock['rx_cy_drive'] = function (block, generator) {
  needBot(generator);
  const l = generator.valueToCode(block, 'L', Order.NONE) || '0';
  const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
  return `bot.motors.drive(int(${l}), int(${r}))\n`;
};

pythonGenerator.forBlock['rx_cy_stop'] = function (_block, generator) {
  needBot(generator);
  return 'bot.motors.stop()\n';
};

pythonGenerator.forBlock['rx_cy_brake'] = function (_block, generator) {
  needBot(generator);
  return 'bot.motors.brake()\n';
};

pythonGenerator.forBlock['rx_cy_motor_single'] = function (block, generator) {
  needBot(generator);
  const sp = generator.valueToCode(block, 'SPEED', Order.NONE) || '0';
  return `bot.motors.${block.getFieldValue('SIDE')}(int(${sp}))\n`;
};

pythonGenerator.forBlock['rx_cy_motor_invert'] = function (block, generator) {
  needBot(generator);
  return `bot.motors.invert_${block.getFieldValue('SIDE')} = ${block.getFieldValue('ON')}\n`;
};

pythonGenerator.forBlock['rx_cy_servo'] = function (block, generator) {
  needBot(generator);
  const a = generator.valueToCode(block, 'ANGLE', Order.NONE) || '90';
  return `bot.servos.angle(${block.getFieldValue('PORT')}, int(${a}))\n`;
};

pythonGenerator.forBlock['rx_cy_servo_sweep'] = function (block, generator) {
  needBot(generator);
  const f = generator.valueToCode(block, 'FROM', Order.NONE) || '0';
  const t = generator.valueToCode(block, 'TO', Order.NONE) || '180';
  const ms = generator.valueToCode(block, 'MS', Order.NONE) || '1000';
  return `bot.servos.sweep(${block.getFieldValue('PORT')}, int(${f}), int(${t}), int(${ms}))\n`;
};

pythonGenerator.forBlock['rx_cy_servo_center'] = function (_block, generator) {
  needBot(generator);
  return 'bot.servos.center()\n';
};

pythonGenerator.forBlock['rx_cy_servo_off'] = function (block, generator) {
  needBot(generator);
  return `bot.servos.off(${block.getFieldValue('PORT')})\n`;
};

pythonGenerator.forBlock['rx_cy_servo_us'] = function (block, generator) {
  needBot(generator);
  const us = generator.valueToCode(block, 'US', Order.NONE) || '1500';
  return `bot.servos.pulse_us(${block.getFieldValue('PORT')}, int(${us}))\n`;
};

pythonGenerator.forBlock['rx_cy_servo_read'] = function (block, generator) {
  needBot(generator);
  return [`bot.servos.read(${block.getFieldValue('PORT')})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_rgb_fill'] = function (block, generator) {
  needBot(generator);
  const { r, g, b } = hexToRgb(block.getFieldValue('COLOUR'));
  return `bot.pixels.fill((${r}, ${g}, ${b}))\nbot.pixels.show()\n`;
};

pythonGenerator.forBlock['rx_cy_rgb_set'] = function (block, generator) {
  needBot(generator);
  const i = parseInt(block.getFieldValue('INDEX'), 10) - 1;
  const { r, g, b } = hexToRgb(block.getFieldValue('COLOUR'));
  return `bot.pixels.set(${i}, (${r}, ${g}, ${b}))\nbot.pixels.show()\n`;
};

pythonGenerator.forBlock['rx_cy_rgb_fill_rgb'] = function (block, generator) {
  needBot(generator);
  const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
  const g = generator.valueToCode(block, 'G', Order.NONE) || '0';
  const b = generator.valueToCode(block, 'B', Order.NONE) || '0';
  return `bot.pixels.fill((int(${r}), int(${g}), int(${b})))\nbot.pixels.show()\n`;
};

pythonGenerator.forBlock['rx_cy_rgb_set_rgb'] = function (block, generator) {
  needBot(generator);
  const i = generator.valueToCode(block, 'INDEX', Order.NONE) || '1';
  const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
  const g = generator.valueToCode(block, 'G', Order.NONE) || '0';
  const b = generator.valueToCode(block, 'B', Order.NONE) || '0';
  return `bot.pixels.set(max(0, min(1, int(${i}) - 1)), (int(${r}), int(${g}), int(${b})))\nbot.pixels.show()\n`;
};

pythonGenerator.forBlock['rx_cy_rgb_rainbow'] = function (_block, generator) {
  needBot(generator);
  return 'bot.pixels.rainbow()\n';
};

pythonGenerator.forBlock['rx_cy_rgb_brightness'] = function (block, generator) {
  needBot(generator);
  const p = generator.valueToCode(block, 'PCT', Order.NONE) || '20';
  return `bot.pixels.set_brightness(int(${p}))\n`;
};

pythonGenerator.forBlock['rx_cy_rgb_off'] = function (_block, generator) {
  needBot(generator);
  return 'bot.pixels.off()\n';
};

pythonGenerator.forBlock['rx_cy_horn'] = function (_block, generator) {
  needBot(generator);
  return 'bot.buzzer.horn()\n';
};

pythonGenerator.forBlock['rx_cy_note'] = function (block, generator) {
  needBot(generator);
  const ms = generator.valueToCode(block, 'MS', Order.NONE) || '200';
  return `bot.buzzer.tone(bot.buzzer.NOTES['${block.getFieldValue('NOTE')}'], int(${ms}))\n`;
};

pythonGenerator.forBlock['rx_cy_tone'] = function (block, generator) {
  needBot(generator);
  const f = generator.valueToCode(block, 'FREQ', Order.NONE) || '1000';
  const ms = generator.valueToCode(block, 'MS', Order.NONE) || '200';
  return `bot.buzzer.tone(int(${f}), int(${ms}))\n`;
};

pythonGenerator.forBlock['rx_cy_quiet'] = function (_block, generator) {
  needBot(generator);
  return 'bot.buzzer.stop()\n';
};

pythonGenerator.forBlock['rx_cy_button'] = function (block, generator) {
  needBot(generator);
  return [`bot.buttons.pressed(${block.getFieldValue('WHICH')})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_button_just'] = function (block, generator) {
  needBot(generator);
  return [`bot.buttons.just_pressed(${block.getFieldValue('WHICH')})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_button_wait'] = function (block, generator) {
  needBot(generator);
  return `bot.buttons.wait(${block.getFieldValue('WHICH')})\n`;
};

pythonGenerator.forBlock['rx_cy_grove_pin'] = function (block) {
  return [block.getFieldValue('PIN'), Order.ATOMIC];
};

pythonGenerator.forBlock['rx_cy_analog'] = function (block, generator) {
  needBot(generator);
  return [`bot.analog(${block.getFieldValue('PIN')})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_sonar_pins'] = function (block, generator) {
  needBot(generator);
  return `bot.sonar.set_pins(${block.getFieldValue('TRIG')}, ${block.getFieldValue('ECHO')})\n`;
};

pythonGenerator.forBlock['rx_cy_distance'] = function (_block, generator) {
  needBot(generator);
  return ['bot.sonar.distance_cm()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_distance_mm'] = function (_block, generator) {
  needBot(generator);
  return ['bot.sonar.distance_mm()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_obstacle'] = function (block, generator) {
  needBot(generator);
  const cm = generator.valueToCode(block, 'CM', Order.NONE) || '15';
  return [`bot.sonar.obstacle(int(${cm}))`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_line_pins'] = function (block, generator) {
  needBot(generator);
  return `bot.line.set_pins(${block.getFieldValue('L')}, ${block.getFieldValue('R')})\n`;
};

pythonGenerator.forBlock['rx_cy_line'] = function (block, generator) {
  needBot(generator);
  const i = block.getFieldValue('SIDE') === 'L' ? 0 : 1;
  return [`bot.line.on_line()[${i}]`, Order.MEMBER];
};

pythonGenerator.forBlock['rx_cy_line_raw'] = function (block, generator) {
  needBot(generator);
  return [`bot.line.raw()[${block.getFieldValue('SIDE')}]`, Order.MEMBER];
};

pythonGenerator.forBlock['rx_cy_line_threshold'] = function (block, generator) {
  needBot(generator);
  const t = generator.valueToCode(block, 'TH', Order.NONE) || '50000';
  return `bot.line.threshold = int(${t})\n`;
};

pythonGenerator.forBlock['rx_cy_battery'] = function (_block, generator) {
  needBot(generator);
  return ['bot.battery_pct()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_battery_v'] = function (_block, generator) {
  needBot(generator);
  return ['bot.battery_v()', Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_cy_stop_all'] = function (_block, generator) {
  needBot(generator);
  return 'bot.stop_all()\n';
};

// ====================================================================
// TOOLBOX KATEGORİSİ — toolbox.ts bunu XML'e ekler
// ====================================================================

export const robocytronToolboxCategory = `
  <category name="🤖 RoboCYTRON Motor" categorystyle="dcmotor_category">
    <label text="Hareket — yüksek seviye"></label>
    <block type="rx_cy_move">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
    <block type="rx_cy_move_time">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
      <value name="SEC"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="rx_cy_drive">
      <value name="L"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
      <value name="R"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
    <block type="rx_cy_stop"></block>
    <block type="rx_cy_brake"></block>
    <label text="Alçak seviye + ayar"></label>
    <block type="rx_cy_motor_single">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">80</field></shadow></value>
    </block>
    <block type="rx_cy_motor_invert"></block>
    <block type="rx_cy_stop_all"></block>
  </category>

  <category name="🤖 RoboCYTRON Servo" categorystyle="servo_category">
    <label text="4 servo portu — GP12..GP15"></label>
    <block type="rx_cy_servo">
      <value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value>
    </block>
    <block type="rx_cy_servo_sweep">
      <value name="FROM"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="TO"><shadow type="math_number"><field name="NUM">180</field></shadow></value>
      <value name="MS"><shadow type="math_number"><field name="NUM">1000</field></shadow></value>
    </block>
    <block type="rx_cy_servo_center"></block>
    <block type="rx_cy_servo_off"></block>
    <label text="Alçak seviye"></label>
    <block type="rx_cy_servo_us">
      <value name="US"><shadow type="math_number"><field name="NUM">1500</field></shadow></value>
    </block>
    <block type="rx_cy_servo_read"></block>
  </category>

  <category name="🤖 RoboCYTRON RGB LED" categorystyle="rgb_category">
    <label text="2 adet WS2812 — GP18"></label>
    <block type="rx_cy_rgb_fill"></block>
    <block type="rx_cy_rgb_set"></block>
    <block type="rx_cy_rgb_rainbow"></block>
    <block type="rx_cy_rgb_off"></block>
    <block type="rx_cy_rgb_brightness">
      <value name="PCT"><shadow type="math_number"><field name="NUM">20</field></shadow></value>
    </block>
    <label text="Alçak seviye — R,G,B sayılarıyla"></label>
    <block type="rx_cy_rgb_fill_rgb">
      <value name="R"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="G"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="B"><shadow type="math_number"><field name="NUM">255</field></shadow></value>
    </block>
    <block type="rx_cy_rgb_set_rgb">
      <value name="INDEX"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="R"><shadow type="math_number"><field name="NUM">255</field></shadow></value>
      <value name="G"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="B"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    </block>
  </category>

  <category name="🤖 RoboCYTRON Ses" categorystyle="buzzer_category">
    <label text="Buzzer anahtarı AÇIK olmalı — GP22"></label>
    <block type="rx_cy_horn"></block>
    <block type="rx_cy_note">
      <value name="MS"><shadow type="math_number"><field name="NUM">200</field></shadow></value>
    </block>
    <label text="Alçak seviye"></label>
    <block type="rx_cy_tone">
      <value name="FREQ"><shadow type="math_number"><field name="NUM">1000</field></shadow></value>
      <value name="MS"><shadow type="math_number"><field name="NUM">200</field></shadow></value>
    </block>
    <block type="rx_cy_quiet"></block>
  </category>

  <category name="🤖 RoboCYTRON Buton" categorystyle="button_category">
    <label text="Kart üstü 2 buton — GP20 / GP21"></label>
    <block type="rx_cy_button"></block>
    <block type="rx_cy_button_just"></block>
    <block type="rx_cy_button_wait"></block>
  </category>

  <category name="🤖 RoboCYTRON Mesafe" categorystyle="ultra_category">
    <label text="Ultrasonik — Grove portuna takılır"></label>
    <block type="rx_cy_sonar_pins"></block>
    <block type="rx_cy_obstacle">
      <value name="CM"><shadow type="math_number"><field name="NUM">15</field></shadow></value>
    </block>
    <block type="rx_cy_distance"></block>
    <label text="Alçak seviye"></label>
    <block type="rx_cy_distance_mm"></block>
  </category>

  <category name="🤖 RoboCYTRON Çizgi" categorystyle="sensor_category">
    <label text="Çizgi sensörü — analog Grove portu"></label>
    <block type="rx_cy_line_pins"></block>
    <block type="rx_cy_line"></block>
    <label text="Alçak seviye — analog"></label>
    <block type="rx_cy_line_raw"></block>
    <block type="rx_cy_line_threshold">
      <value name="TH"><shadow type="math_number"><field name="NUM">50000</field></shadow></value>
    </block>
  </category>

  <category name="🤖 RoboCYTRON Grove" categorystyle="io_category">
    <label text="7 Grove portu — pin seçici"></label>
    <block type="rx_cy_grove_pin"></block>
    <block type="rx_cy_analog"></block>
  </category>

  <category name="🤖 RoboCYTRON Pil" categorystyle="sensor_category">
    <block type="rx_cy_battery"></block>
    <label text="Alçak seviye"></label>
    <block type="rx_cy_battery_v"></block>
  </category>
`;
