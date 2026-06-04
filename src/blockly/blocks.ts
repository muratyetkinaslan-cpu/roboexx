import * as Blockly from 'blockly';
import { ICONS } from './icons';
import { FieldImageUpload } from './image-upload-field';
import { FieldColourPalette } from './colour-field';

/**
 * RoboExx özel blok tanımları (Pico W için).
 * Emoji yerine inline SVG ikon (Blockly FieldImage).
 *
 * YENİ BLOK EKLERKEN:
 *   1. icons.ts → ikon ekle
 *   2. Bu dosyaya tanım ekle (FieldImage + setStyle)
 *   3. generator.ts → MicroPython çevirici ekle
 *   4. toolbox.ts → uygun kategoriye <block type="..."> ekle
 */

const icon = (uri: string) => new Blockly.FieldImage(uri, 20, 20, '');

// ====================================================================
// AKIŞ / CONTROL
// ====================================================================

Blockly.Blocks['rx_on_start'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.bolt), 'START_ICON')
      .appendField('Başlangıçta');
    this.appendStatementInput('DO').setCheck(null);
    this.setStyle('logic_blocks');
    this.setTooltip('Program başladığında bir kez çalıştırılır');
    this.setDeletable(false);
  },
};

Blockly.Blocks['rx_forever'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.loop))
      .appendField('Sürekli tekrarla');
    this.appendStatementInput('DO').setCheck(null);
    this.setStyle('loop_blocks');
    this.setPreviousStatement(true);
    this.setTooltip('İçindeki bloklar sonsuz döngüde çalışır (while True)');
  },
};

Blockly.Blocks['rx_stop'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.stop))
      .appendField('Programı durdur');
    this.setStyle('logic_blocks');
    this.setPreviousStatement(true);
    this.setTooltip('Çalışan programı sonlandırır (sys.exit)');
  },
};

// ====================================================================
// ZAMAN / TIME
// ====================================================================

Blockly.Blocks['rx_delay_ms'] = {
  init: function (this: Blockly.Block) {
    this.appendValueInput('MS')
      .setCheck('Number')
      .appendField(icon(ICONS.clock));
    this.appendDummyInput()
      .appendField('ms bekle');
    this.setStyle('timing_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Belirtilen milisaniye kadar bekler. Sayı ya da değişken bağlanabilir.');
  },
};

Blockly.Blocks['rx_delay_s'] = {
  init: function (this: Blockly.Block) {
    this.appendValueInput('S')
      .setCheck('Number')
      .appendField(icon(ICONS.hourglass));
    this.appendDummyInput()
      .appendField('saniye bekle');
    this.setStyle('timing_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Belirtilen saniye kadar bekler. Sayı ya da değişken bağlanabilir.');
  },
};

Blockly.Blocks['rx_millis'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.clock))
      .appendField('zaman (ms)');
    this.setStyle('timing_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip("Pico'nun başlangıçtan beri geçen milisaniye değeri");
  },
};

// ====================================================================
// PİN / IO
// ====================================================================

Blockly.Blocks['rx_digital_write'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.pinOut))
      .appendField('Pin')
      .appendField(new Blockly.FieldNumber(25, 0, 28, 1), 'PIN')
      .appendField('→')
      .appendField(
        new Blockly.FieldDropdown([
          ['HIGH (1)', 'HIGH'],
          ['LOW (0)', 'LOW'],
        ]),
        'STATE'
      );
    this.setStyle('io_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip("Dijital pini HIGH (3.3V) veya LOW (0V) yapar. Pico W onboard LED = pin 25.");
  },
};

Blockly.Blocks['rx_digital_read'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.pinIn))
      .appendField('Pin')
      .appendField(new Blockly.FieldNumber(15, 0, 28, 1), 'PIN')
      .appendField('oku');
    this.setStyle('io_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Dijital pin değerini okur (True/False)');
  },
};

Blockly.Blocks['rx_pin_mode'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.pinMode))
      .appendField('Pin')
      .appendField(new Blockly.FieldNumber(15, 0, 28, 1), 'PIN')
      .appendField('modu')
      .appendField(
        new Blockly.FieldDropdown([
          ['Çıkış', 'OUT'],
          ['Giriş', 'IN'],
          ['Giriş + pull-up', 'IN_PULL_UP'],
          ['Giriş + pull-down', 'IN_PULL_DOWN'],
        ]),
        'MODE'
      );
    this.setStyle('io_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Pin modunu belirler. Pull-up = pin LOW olduğunda butona basıldı.');
  },
};

Blockly.Blocks['rx_analog_read'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.analog))
      .appendField('Analog pin')
      .appendField(
        new Blockly.FieldDropdown([
          ['ADC0 (GPIO 26)', '26'],
          ['ADC1 (GPIO 27)', '27'],
          ['ADC2 (GPIO 28)', '28'],
        ]),
        'PIN'
      )
      .appendField('oku');
    this.setStyle('io_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Analog değer okur (0-65535). Sadece GPIO 26, 27, 28 destekler.');
  },
};

Blockly.Blocks['rx_pwm_write'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.pwm))
      .appendField('PWM pin')
      .appendField(new Blockly.FieldNumber(15, 0, 28, 1), 'PIN')
      .appendField('görev (0-65535)');
    this.appendValueInput('DUTY').setCheck('Number');
    this.setStyle('io_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('PWM çıkışı: 0=kapalı, 32768=yarı, 65535=tam parlaklık');
  },
};

// ====================================================================
// KONSOL / CONSOLE
// ====================================================================

Blockly.Blocks['rx_print'] = {
  init: function (this: Blockly.Block) {
    this.appendValueInput('TEXT')
      .setCheck(null)
      .appendField(icon(ICONS.terminal))
      .appendField('Yazdır');
    this.setStyle('text_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('REPL konsoluna yazdırır (print)');
  },
};

// ====================================================================
// AKTÜATÖRLER / ACTUATORS
// ====================================================================

Blockly.Blocks['rx_led_builtin'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.led))
      .appendField('Onboard LED')
      .appendField(
        new Blockly.FieldDropdown([
          ['yak', 'ON'],
          ['söndür', 'OFF'],
          ['durum değiştir', 'TOGGLE'],
        ]),
        'STATE'
      );
    this.setStyle('led_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip("Pico W onboard LED'ini kontrol eder (Pico'da pin 25, Pico W'de WL_GPIO0)");
  },
};

Blockly.Blocks['rx_servo_angle'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servo))
      .appendField('Servo pin')
      .appendField(new Blockly.FieldNumber(15, 0, 28, 1), 'PIN')
      .appendField('açı');
    this.appendValueInput('ANGLE').setCheck('Number');
    this.appendDummyInput().appendField('°');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Servo motoru 0-180° arası bir açıya döndürür');
  },
};

Blockly.Blocks['rx_buzzer_tone'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Buzzer pin')
      .appendField(new Blockly.FieldNumber(20, 0, 28, 1), 'PIN')
      .appendField('frekans');
    this.appendValueInput('FREQ').setCheck('Number');
    this.appendDummyInput().appendField('Hz · süre');
    this.appendValueInput('DUR').setCheck('Number');
    this.appendDummyInput().appendField('ms');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip("Buzzer'da belirli frekansta ton çalar (Hz). Süre dolunca otomatik susar.");
  },
};

Blockly.Blocks['rx_buzzer_off'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Buzzer pin')
      .appendField(new Blockly.FieldNumber(20, 0, 28, 1), 'PIN')
      .appendField('sustur');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Buzzer sesini hemen keser');
  },
};

// Nota seçmeli buzzer bloğu — frekans yerine müzik notası
Blockly.Blocks['rx_buzzer_note'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.buzzer))
      .appendField('Buzzer pin')
      .appendField(new Blockly.FieldNumber(20, 0, 28, 1), 'PIN')
      .appendField('nota')
      .appendField(
        new Blockly.FieldDropdown([
          ['Do (4)', '262'],
          ['Re (4)', '294'],
          ['Mi (4)', '330'],
          ['Fa (4)', '349'],
          ['Sol (4)', '392'],
          ['La (4)', '440'],
          ['Si (4)', '494'],
          ['Do (5)', '523'],
          ['Re (5)', '587'],
          ['Mi (5)', '659'],
          ['Fa (5)', '698'],
          ['Sol (5)', '784'],
          ['La (5)', '880'],
          ['Si (5)', '988'],
        ]),
        'NOTE'
      )
      .appendField('süre');
    this.appendValueInput('DUR').setCheck('Number');
    this.appendDummyInput().appendField('ms');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Buzzer\'da seçtiğin müzik notasını çalar. Do-Re-Mi-Fa-Sol-La-Si (4. ve 5. oktav).');
  },
};

Blockly.Blocks['rx_neopixel_init'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('NeoPixel başlat · pin')
      .appendField(new Blockly.FieldNumber(0, 0, 28, 1), 'PIN')
      .appendField('LED sayısı')
      .appendField(new Blockly.FieldNumber(1, 1, 256, 1), 'COUNT');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip("WS2812B/NeoPixel LED şeritlerini başlatır. Diğer NeoPixel bloklarından önce çağır.");
  },
};

Blockly.Blocks['rx_neopixel_set'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('LED');
    this.appendValueInput('INDEX').setCheck('Number');
    this.appendDummyInput()
      .appendField('rengi')
      .appendField(new FieldColourPalette('#ff0000'), 'COLOUR');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('NeoPixel şeridindeki bir LED rengini ayarlar (0=ilk LED). Renk kutusuna tıkla, paletten seç.');
  },
};

Blockly.Blocks['rx_neopixel_show'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('NeoPixel güncelle');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Ayarlanan tüm LED renklerini şeride gönderir. Rengi değiştirdikten sonra çağır.');
  },
};

// ====================================================================
// SENSÖRLER / SENSORS
// ====================================================================

Blockly.Blocks['rx_button_pressed'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.button))
      .appendField('Buton pin')
      .appendField(new Blockly.FieldNumber(10, 0, 28, 1), 'PIN')
      .appendField('basıldı mı?');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Pull-up bağlı butonun basılma durumu (LOW = basılı = True)');
  },
};

// ====================================================================
// KLAVYE — bilgisayardan basılan tuşlar (BLE üzerinden Pico'ya gelir)
// ====================================================================

// Yaygın tuşlar — dropdown listesi (kullanıcı kendi seçer)
const _KEY_OPTIONS: [string, string][] = [
  ['W', 'w'], ['A', 'a'], ['S', 's'], ['D', 'd'],
  ['Q', 'q'], ['E', 'e'], ['R', 'r'], ['F', 'f'],
  ['Z', 'z'], ['X', 'x'], ['C', 'c'], ['V', 'v'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'],
  ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'],
  ['9', '9'], ['0', '0'],
  ['↑ Yukarı ok', '\x11'],
  ['↓ Aşağı ok', '\x12'],
  ['← Sol ok', '\x13'],
  ['→ Sağ ok', '\x14'],
  ['␣ Boşluk', ' '],
  ['↵ Enter', '\n'],
];

Blockly.Blocks['rx_key_pressed'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.keyboard))
      .appendField('Tuş')
      .appendField(new Blockly.FieldDropdown(_KEY_OPTIONS), 'KEY')
      .appendField('basılı mı?');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Bilgisayardan basılı tutulan tuş (sürekli True döner). Bağlantı: BLE.');
  },
};

Blockly.Blocks['rx_key_just_pressed'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.keyboard))
      .appendField('Tuş')
      .appendField(new Blockly.FieldDropdown(_KEY_OPTIONS), 'KEY')
      .appendField('basıldı mı? (tek sefer)');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Tuş yeni basıldıysa bir kere True döner, sonra otomatik sıfırlanır. Tek seferlik tetikleme için.');
  },
};

// ====================================================================
// GAMEPAD — bilgisayara bağlı gamepad düğmeleri (BLE veya USB üzerinden Pico'ya)
// ====================================================================

// Gamepad düğmeleri — App.tsx'teki gamepad karakter eşlemesiyle senkron
const _GAMEPAD_OPTIONS: [string, string][] = [
  ['🅰️ A (yeşil)', '\x20'],
  ['🅱️ B (kırmızı)', '\x21'],
  ['❎ X (mavi)', '\x22'],
  ['🆈 Y (sarı)', '\x23'],
  ['◀ LB (sol bumper)', '\x24'],
  ['▶ RB (sağ bumper)', '\x25'],
  ['◀ LT (sol tetik)', '\x26'],
  ['▶ RT (sağ tetik)', '\x27'],
  ['⬆ D-Pad Yukarı', '\x28'],
  ['⬇ D-Pad Aşağı', '\x29'],
  ['⬅ D-Pad Sol', '\x2A'],
  ['➡ D-Pad Sağ', '\x2B'],
  ['▶ Start', '\x2C'],
  ['⏸ Select', '\x2D'],
  ['🕹 L3 (sol stick basma)', '\x2E'],
  ['🕹 R3 (sağ stick basma)', '\x2F'],
  ['🕹 Sol stick ↑', '\x30'],
  ['🕹 Sol stick ↓', '\x31'],
  ['🕹 Sol stick ←', '\x32'],
  ['🕹 Sol stick →', '\x33'],
  ['🕹 Sağ stick ↑', '\x34'],
  ['🕹 Sağ stick ↓', '\x35'],
  ['🕹 Sağ stick ←', '\x36'],
  ['🕹 Sağ stick →', '\x37'],
];

Blockly.Blocks['rx_gamepad_pressed'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.gamepad))
      .appendField('Gamepad')
      .appendField(new Blockly.FieldDropdown(_GAMEPAD_OPTIONS), 'BTN')
      .appendField('basılı mı?');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Gamepad düğmesi basılı tutulduğu sürece True döner. PC\'ye Bluetooth ile gamepad bağlı olmalı.');
  },
};

Blockly.Blocks['rx_gamepad_just_pressed'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.gamepad))
      .appendField('Gamepad')
      .appendField(new Blockly.FieldDropdown(_GAMEPAD_OPTIONS), 'BTN')
      .appendField('basıldı mı? (tek sefer)');
    this.setStyle('button_blocks');
    this.setOutput(true, 'Boolean');
    this.setTooltip('Gamepad düğmesine yeni basıldıysa bir kere True döner, sonra sıfırlanır.');
  },
};

Blockly.Blocks['rx_ultrasonic_distance'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ruler))
      .appendField('Ultrasonik mesafe · trig')
      .appendField(new Blockly.FieldNumber(3, 0, 28, 1), 'TRIG')
      .appendField('echo')
      .appendField(new Blockly.FieldNumber(2, 0, 28, 1), 'ECHO');
    this.setStyle('ultra_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('HC-SR04 ultrasonik sensörle santimetre cinsinden mesafe ölçer');
  },
};

Blockly.Blocks['rx_internal_temp'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.thermo))
      .appendField('İç sıcaklık (°C)');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip("Pico'nun dahili sıcaklık sensörü değeri (chip sıcaklığı, ortam değil)");
  },
};

Blockly.Blocks['rx_potentiometer'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.potent))
      .appendField('Potansiyometre pin')
      .appendField(
        new Blockly.FieldDropdown([
          ['ADC0 (GPIO 26)', '26'],
          ['ADC1 (GPIO 27)', '27'],
          ['ADC2 (GPIO 28)', '28'],
        ]),
        'PIN'
      )
      .appendField('(0-100)');
    this.setStyle('pot_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Potansiyometre değerini 0-100 arası olarak okur');
  },
};

// ====================================================================
// MATEMATİK / MATH
// ====================================================================

Blockly.Blocks['rx_map'] = {
  init: function (this: Blockly.Block) {
    this.appendValueInput('VALUE').setCheck('Number')
      .appendField(icon(ICONS.arrows))
      .appendField('eşle');
    this.appendValueInput('FROM_LOW').setCheck('Number')
      .appendField('giriş aralığı');
    this.appendValueInput('FROM_HIGH').setCheck('Number')
      .appendField('-');
    this.appendValueInput('TO_LOW').setCheck('Number')
      .appendField('→ çıkış aralığı');
    this.appendValueInput('TO_HIGH').setCheck('Number')
      .appendField('-');
    this.setStyle('math_blocks');
    this.setOutput(true, 'Number');
    this.setInputsInline(true);
    this.setTooltip("Bir aralıktaki değeri başka aralığa eşler. Arduino'nun map() fonksiyonu.");
  },
};

// ====================================================================
// OLED EKRAN (SSD1306 128x64 I2C)
// ====================================================================

Blockly.Blocks['rx_oled_init'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.display))
      .appendField('OLED başlat · SDA pin')
      .appendField(new Blockly.FieldNumber(4, 0, 28, 1), 'SDA')
      .appendField('SCL pin')
      .appendField(new Blockly.FieldNumber(5, 0, 28, 1), 'SCL')
      .appendField('I2C')
      .appendField(
        new Blockly.FieldDropdown([
          ['0', '0'],
          ['1', '1'],
        ]),
        'I2C_BUS'
      );
    this.appendDummyInput()
      .appendField('Boyut')
      .appendField(
        new Blockly.FieldDropdown([
          ['128×64', '128x64'],
          ['128×32', '128x32'],
        ]),
        'SIZE'
      )
      .appendField('Adres')
      .appendField(
        new Blockly.FieldDropdown([
          ['0x3C', '0x3C'],
          ['0x3D', '0x3D'],
        ]),
        'ADDR'
      );
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(false);
    this.setTooltip("SSD1306 OLED ekranı başlatır. Varsayılan: SDA=GP4, SCL=GP5 (I2C0).");
  },
};

Blockly.Blocks['rx_oled_clear'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.eraser))
      .appendField('OLED temizle');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Ekrandaki tüm içeriği siler. show() ile ekrana yansıt.');
  },
};

Blockly.Blocks['rx_oled_show'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.refresh))
      .appendField('OLED ekrana yansıt');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Tampondaki çizimleri/yazıları ekrana gönderir (oled.show()).');
  },
};

Blockly.Blocks['rx_oled_text'] = {
  init: function (this: Blockly.Block) {
    this.appendValueInput('TEXT')
      .setCheck(null)
      .appendField(icon(ICONS.displayText))
      .appendField('OLED yaz');
    this.appendDummyInput()
      .appendField('hizala')
      .appendField(
        new Blockly.FieldDropdown([
          ['↖ Sol-Üst (X,Y)', 'TOPLEFT'],
          ['◯ Tam ortaya', 'CENTER'],
          ['↑ Üst orta', 'TOPCENTER'],
          ['↓ Alt orta', 'BOTTOMCENTER'],
          ['→ Sağ-Üst', 'TOPRIGHT'],
        ]),
        'ALIGN'
      );
    this.appendDummyInput()
      .appendField('X')
      .appendField(new Blockly.FieldNumber(0, 0, 127, 1), 'X')
      .appendField('Y')
      .appendField(new Blockly.FieldNumber(0, 0, 63, 1), 'Y')
      .appendField('boyut')
      .appendField(
        new Blockly.FieldDropdown([
          ['1× (küçük)', '1'],
          ['2× (orta)', '2'],
          ['3× (büyük)', '3'],
        ]),
        'SIZE'
      );
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(false);
    this.setTooltip('Ekrana yazı çizer. Hizala "Tam ortaya" seçilirse X/Y görmezden gelinir.');
  },
};

Blockly.Blocks['rx_oled_shape'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.displayShape))
      .appendField('OLED çiz')
      .appendField(
        new Blockly.FieldDropdown([
          ['Daire', 'CIRCLE'],
          ['Dolu Daire', 'CIRCLE_FILL'],
          ['Kare', 'RECT'],
          ['Dolu Kare', 'RECT_FILL'],
          ['Çizgi', 'LINE'],
          ['Piksel', 'PIXEL'],
        ]),
        'SHAPE'
      );
    this.appendDummyInput()
      .appendField('X')
      .appendField(new Blockly.FieldNumber(10, 0, 127, 1), 'X')
      .appendField('Y')
      .appendField(new Blockly.FieldNumber(10, 0, 63, 1), 'Y')
      .appendField('boyut')
      .appendField(new Blockly.FieldNumber(20, 1, 128, 1), 'SIZE');
    this.appendDummyInput()
      .appendField('Renk')
      .appendField(
        new Blockly.FieldDropdown([
          ['Beyaz (1)', '1'],
          ['Siyah (0 – sil)', '0'],
        ]),
        'COLOR'
      );
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(false);
    this.setTooltip('Şekil çizer. Çizgi için "boyut" çizginin uzunluğu (yatay). Piksel için boyut görmezden gelinir.');
  },
};

Blockly.Blocks['rx_oled_eyes'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.eye))
      .appendField('OLED göz çiz')
      .appendField(
        new Blockly.FieldDropdown([
          ['👀 Normal (öne bakan)', 'NORMAL'],
          ['👈 Sola bakan', 'LEFT'],
          ['👉 Sağa bakan', 'RIGHT'],
          ['👆 Yukarı bakan', 'UP'],
          ['👇 Aşağı bakan', 'DOWN'],
          ['😴 Uyuyan', 'SLEEP'],
          ['😮 Şaşırmış', 'SURPRISED'],
          ['😍 Aşık', 'LOVE'],
          ['😠 Kızgın', 'ANGRY'],
          ['😉 Kapalı (göz kırpma)', 'CLOSED'],
          ['🥺 Üzgün', 'SAD'],
          ['😊 Mutlu', 'HAPPY'],
        ]),
        'EYE'
      );
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Ekrana göz ifadesi çizer. Ekranı temizleyip ardından bunu çağır, sonra show().');
  },
};

// ====================================================================
// OLED KAYAN YAZI + RESİM
// ====================================================================

Blockly.Blocks['rx_oled_scroll_text'] = {
  init: function (this: Blockly.Block) {
    this.appendValueInput('TEXT')
      .setCheck(null)
      .appendField(icon(ICONS.marquee))
      .appendField('OLED kayan yazı');
    this.appendDummyInput()
      .appendField('yön')
      .appendField(
        new Blockly.FieldDropdown([
          ['← Sağdan sola', 'LEFT'],
          ['→ Soldan sağa', 'RIGHT'],
        ]),
        'DIR'
      )
      .appendField('Y')
      .appendField(new Blockly.FieldNumber(24, 0, 63, 1), 'Y')
      .appendField('boyut')
      .appendField(
        new Blockly.FieldDropdown([
          ['1×', '1'],
          ['2×', '2'],
          ['3×', '3'],
        ]),
        'SIZE'
      )
      .appendField('hız (ms)')
      .appendField(new Blockly.FieldNumber(30, 1, 500, 1), 'SPEED');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(false);
    this.setTooltip('Yazı ekranda kayar. Bir tam tur (metin tamamen geçene kadar) çalışır, sonra döner.');
  },
};

Blockly.Blocks['rx_oled_image'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.image))
      .appendField('OLED resim göster')
      .appendField(new FieldImageUpload(), 'IMG');
    this.appendDummyInput()
      .appendField('X')
      .appendField(new Blockly.FieldNumber(0, 0, 127, 1), 'X')
      .appendField('Y')
      .appendField(new Blockly.FieldNumber(0, 0, 63, 1), 'Y');
    this.setStyle('oled_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(false);
    this.setTooltip('Bilgisayardan seçtiğin resmi 128×64 siyah-beyaz olarak OLED\'de gösterir. Resim Pico\'da kalıcı değil, koda gömülüdür.');
  },
};

// ====================================================================
// HARİCİ LED (GP7 varsayılan)
// ====================================================================

Blockly.Blocks['rx_led_external'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.led))
      .appendField('LED pin')
      .appendField(new Blockly.FieldNumber(7, 0, 28, 1), 'PIN')
      .appendField(
        new Blockly.FieldDropdown([
          ['yak', 'ON'],
          ['söndür', 'OFF'],
          ['durum değiştir', 'TOGGLE'],
        ]),
        'STATE'
      );
    this.setStyle('led_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Harici bir LED\'i kontrol eder (anot pin'+ ' tarafı + dirençle). Varsayılan: GP7');
  },
};

// ====================================================================
// RGB LED (WS2812) — gelişmiş kullanım
// ====================================================================

Blockly.Blocks['rx_rgb_init'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB LED başlat · pin')
      .appendField(new Blockly.FieldNumber(6, 0, 28, 1), 'PIN')
      .appendField('LED sayısı')
      .appendField(new Blockly.FieldNumber(1, 1, 256, 1), 'COUNT');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('WS2812 RGB LED şeritlerini başlatır. Diğer RGB bloklarından önce çağır.');
  },
};

Blockly.Blocks['rx_rgb_set_all'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Tüm RGB LED\'leri boya')
      .appendField(new FieldColourPalette('#ff0000'), 'COLOUR');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tüm LED\'leri seçtiğin renge boyar ve hemen gösterir. Renk kutusuna tıkla, paletten seç.');
  },
};

Blockly.Blocks['rx_rgb_set_one'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('RGB LED');
    this.appendValueInput('INDEX').setCheck('Number');
    this.appendDummyInput()
      .appendField('rengi')
      .appendField(new FieldColourPalette('#ff0000'), 'COLOUR');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tek bir LED\'i (0\'dan başlayarak) seçtiğin renge boyar. Renk kutusuna tıkla, paletten seç.');
  },
};

Blockly.Blocks['rx_rgb_clear'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rgb))
      .appendField('Tüm RGB LED\'leri kapat');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Tüm RGB LED\'leri söndürür.');
  },
};

Blockly.Blocks['rx_rgb_rainbow'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.rainbow))
      .appendField('RGB gökkuşağı');
    this.appendValueInput('STEP').setCheck('Number')
      .appendField('adım');
    this.setStyle('rgb_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Tüm LED\'lere gökkuşağı dağıtır. Adımı döngüde değiştirerek animasyon yap.');
  },
};

// ====================================================================
// RÖLE (GP12 varsayılan)
// ====================================================================

Blockly.Blocks['rx_relay'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.relay))
      .appendField('Röle pin')
      .appendField(new Blockly.FieldNumber(12, 0, 28, 1), 'PIN')
      .appendField(
        new Blockly.FieldDropdown([
          ['Aç', 'ON'],
          ['Kapat', 'OFF'],
          ['Durum değiştir', 'TOGGLE'],
        ]),
        'STATE'
      );
    this.setStyle('relay_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('Röleyi açar/kapatır. Yüksek akımlı cihazları (lamba, motor) kontrol et.');
  },
};

// ====================================================================
// DHT11 — sıcaklık ve nem v1
// ====================================================================

Blockly.Blocks['rx_dht11_temp'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.thermo))
      .appendField('DHT11 sıcaklık pin')
      .appendField(new Blockly.FieldNumber(11, 0, 28, 1), 'PIN')
      .appendField('°C');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('DHT11 sensöründen sıcaklık okur (°C). Hata varsa -1 döner.');
  },
};

Blockly.Blocks['rx_dht11_humidity'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.humidity))
      .appendField('DHT11 nem pin')
      .appendField(new Blockly.FieldNumber(11, 0, 28, 1), 'PIN')
      .appendField('%');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('DHT11 sensöründen nem okur (%). Hata varsa -1 döner.');
  },
};

// ====================================================================
// SHTC3 — sıcaklık ve nem v2 (I2C, SDA GP4 SCL GP5)
// ====================================================================

Blockly.Blocks['rx_shtc3_init'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.thermo))
      .appendField('SHTC3 başlat · SDA pin')
      .appendField(new Blockly.FieldNumber(4, 0, 28, 1), 'SDA')
      .appendField('SCL pin')
      .appendField(new Blockly.FieldNumber(5, 0, 28, 1), 'SCL')
      .appendField('I2C')
      .appendField(
        new Blockly.FieldDropdown([
          ['0', '0'],
          ['1', '1'],
        ]),
        'I2C_BUS'
      );
    this.setStyle('sensor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('SHTC3 sensörünü başlatır. Önce bu, sonra sıcaklık/nem oku.');
  },
};

Blockly.Blocks['rx_shtc3_temp'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.thermo))
      .appendField('SHTC3 sıcaklık °C');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('SHTC3\'ten sıcaklık (°C). Önce SHTC3 başlat çağrılmış olmalı.');
  },
};

Blockly.Blocks['rx_shtc3_humidity'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.humidity))
      .appendField('SHTC3 nem %');
    this.setStyle('sensor_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('SHTC3\'ten nem (%). Önce SHTC3 başlat çağrılmış olmalı.');
  },
};

// ====================================================================
// IR ALICI (GP0 varsayılan)
// ====================================================================

Blockly.Blocks['rx_ir_init'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ir))
      .appendField('IR alıcı başlat · pin')
      .appendField(new Blockly.FieldNumber(0, 0, 28, 1), 'PIN');
    this.setStyle('ir_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('IR alıcısını başlatır (TSOP38xx). Önce bu, sonra kod oku.');
  },
};

Blockly.Blocks['rx_ir_read_code'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.ir))
      .appendField('IR kumanda kodu');
    this.setStyle('ir_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('Son alınan kumanda kodunu döndürür (NEC formatında). Yeni kod yoksa 0.');
  },
};

// ====================================================================
// LDR (Işık Sensörü) — analog, GP27 varsayılan
// ====================================================================

Blockly.Blocks['rx_ldr_read'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.light))
      .appendField('LDR ışık pin')
      .appendField(
        new Blockly.FieldDropdown([
          ['ADC1 (GPIO 27)', '27'],
          ['ADC0 (GPIO 26)', '26'],
          ['ADC2 (GPIO 28)', '28'],
        ]),
        'PIN'
      )
      .appendField('(0-100)');
    this.setStyle('ldr_blocks');
    this.setOutput(true, 'Number');
    this.setTooltip('LDR (ışık sensörü) değerini 0-100 arası okur. Yüksek değer = aydınlık.');
  },
};

// ====================================================================
// MOTOR SÜRÜCÜ v2 — PicoBricks I2C motor driver chip
// SDA=GP4, SCL=GP5 (OLED ile aynı I2C hattını paylaşır)
// ====================================================================

Blockly.Blocks['rx_motor_init'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField('Motor sürücü başlat · SDA')
      .appendField(new Blockly.FieldNumber(4, 0, 28, 1), 'SDA')
      .appendField('SCL')
      .appendField(new Blockly.FieldNumber(5, 0, 28, 1), 'SCL')
      .appendField('I2C')
      .appendField(
        new Blockly.FieldDropdown([
          ['0', '0'],
          ['1', '1'],
        ]),
        'I2C_BUS'
      );
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('I2C motor sürücü chip\'ini başlatır. Servo ve DC motor bloklarından önce çağır.');
  },
};

Blockly.Blocks['rx_servo_v2'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servoArm))
      .appendField('Sürücü Servo')
      .appendField(
        new Blockly.FieldDropdown([
          ['1', '1'],
          ['2', '2'],
          ['3', '3'],
          ['4', '4'],
        ]),
        'SERVO_NUM'
      )
      .appendField('açı');
    this.appendValueInput('ANGLE').setCheck('Number');
    this.appendDummyInput().appendField('°');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Motor sürücü üzerindeki servoyu belirli açıya getirir (0-180°).');
  },
};

// ============================================================
//  Servo v3 — PCA9685 16-Kanal I2C PWM/Servo Sürücüsü
//  Pico'ya I2C ile bağlanan harici kart (Adafruit & uyumlu).
//  Bir bloka 16 servo bağlanabilir, her kanala bağımsız açı verilir.
// ============================================================
Blockly.Blocks['rx_servo_v3'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servoArm))
      .appendField('PCA9685 servo — kanal')
      .appendField(
        new Blockly.FieldDropdown([
          ['0', '0'],   ['1', '1'],   ['2', '2'],   ['3', '3'],
          ['4', '4'],   ['5', '5'],   ['6', '6'],   ['7', '7'],
          ['8', '8'],   ['9', '9'],   ['10', '10'], ['11', '11'],
          ['12', '12'], ['13', '13'], ['14', '14'], ['15', '15'],
        ]),
        'CHANNEL'
      )
      .appendField('açı');
    this.appendValueInput('ANGLE').setCheck('Number');
    this.appendDummyInput().appendField('°');
    // Pin ve adres ayarları — varsayılan: SDA=GP4, SCL=GP5, adres=0x40
    this.appendDummyInput()
      .appendField('  ⚙ SDA')
      .appendField(new Blockly.FieldNumber(4, 0, 28, 1), 'SDA')
      .appendField('SCL')
      .appendField(new Blockly.FieldNumber(5, 0, 28, 1), 'SCL')
      .appendField('adres 0x')
      .appendField(new Blockly.FieldTextInput('40'), 'ADDR');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip(
      'PCA9685 I2C servo sürücüsü üzerindeki seçili kanala 0-180° açı yazar. ' +
      'Varsayılan: SDA=GP4, SCL=GP5, adres 0x40 (Adafruit kart için).'
    );
  },
};

Blockly.Blocks['rx_servo_v3_off'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.servoArm))
      .appendField('PCA9685 servo — kanal')
      .appendField(
        new Blockly.FieldDropdown([
          ['0', '0'],   ['1', '1'],   ['2', '2'],   ['3', '3'],
          ['4', '4'],   ['5', '5'],   ['6', '6'],   ['7', '7'],
          ['8', '8'],   ['9', '9'],   ['10', '10'], ['11', '11'],
          ['12', '12'], ['13', '13'], ['14', '14'], ['15', '15'],
        ]),
        'CHANNEL'
      )
      .appendField('serbest bırak');
    this.appendDummyInput()
      .appendField('  ⚙ SDA')
      .appendField(new Blockly.FieldNumber(4, 0, 28, 1), 'SDA')
      .appendField('SCL')
      .appendField(new Blockly.FieldNumber(5, 0, 28, 1), 'SCL')
      .appendField('adres 0x')
      .appendField(new Blockly.FieldTextInput('40'), 'ADDR');
    this.setStyle('servo_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Seçili PCA9685 kanalının PWM\'ini durdurur (servo motoru rahat bırakır, akım çekmez).');
  },
};

Blockly.Blocks['rx_dc_motor'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField('DC Motor')
      .appendField(
        new Blockly.FieldDropdown([
          ['1', '1'],
          ['2', '2'],
        ]),
        'MOTOR_NUM'
      )
      .appendField('yön')
      .appendField(
        new Blockly.FieldDropdown([
          ['▶ İleri', 'forward'],
          ['◀ Geri', 'backward'],
        ]),
        'DIRECTION'
      );
    this.appendValueInput('SPEED').setCheck('Number')
      .appendField('hız %');
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('DC motoru çalıştırır. Hız: 0-100. PicoBricks motor sürücü chip\'i kullanılır.');
  },
};

Blockly.Blocks['rx_dc_motor_stop'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(icon(ICONS.motor))
      .appendField('DC Motoru durdur')
      .appendField(
        new Blockly.FieldDropdown([
          ['1', '1'],
          ['2', '2'],
          ['Tüm motorlar', 'all'],
        ]),
        'MOTOR_NUM'
      );
    this.setStyle('dcmotor_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setTooltip('DC motoru durdurur (hız=0).');
  },
};

// ====================================================================
// BUILT-IN BLOK STYLE OVERRIDE
// ====================================================================
// Blockly'nin yerleşik mantık blokları varsayılan olarak "logic_blocks"
// stilini kullanır — bu bizim Akış kategorimizle aynı renk olur. Mantık
// kategorisinde farklı renk göstermek için init'lerini sarmaladık ve
// sonunda setStyle('operator_blocks') diyoruz.
//
// _rxOperatorPatched flag'i HMR sırasında çift sarmalı önler.

const operatorBlockTypes = [
  'logic_compare',
  'logic_operation',
  'logic_negate',
  'logic_boolean',
  'logic_ternary',
];

for (const type of operatorBlockTypes) {
  const def = (Blockly.Blocks as Record<string, { init?: () => void; _rxOperatorPatched?: boolean }>)[type];
  if (def && typeof def.init === 'function' && !def._rxOperatorPatched) {
    const origInit = def.init;
    def.init = function (this: Blockly.Block) {
      origInit.call(this);
      this.setStyle('operator_blocks');
    };
    def._rxOperatorPatched = true;
  }
}


// ============================================================
//  Müzik Bloğu — buzzer'da hazır şarkı çalma
// ============================================================
Blockly.Blocks['rx_play_song'] = {
  init: function (this: Blockly.Block) {
    this.appendDummyInput()
      .appendField('🎵 Şarkı çal')
      .appendField(
        new Blockly.FieldDropdown([
          ['🐉 Game of Thrones', 'gameofthrones'],
          ['⭐ Star Wars', 'starwars'],
          ['🖤 İmparatorluk Marşı', 'imperial'],
          ['🎬 The Godfather', 'godfather'],
          ['🚀 Star Trek', 'startrek'],
          ['🎷 Cantina Band', 'cantina'],
          ['🍄 Super Mario', 'mario'],
          ['🧩 Tetris', 'tetris'],
          ['👾 Pac-Man', 'pacman'],
          ['🦔 Green Hill (Sonic)', 'greenhill'],
          ['🗡️ Zelda Teması', 'zeldatheme'],
          ['🌙 Zelda Ninni', 'zeldalullaby'],
          ['⛈️ Song of Storms', 'songofstorms'],
          ['🩸 Bloody Tears', 'bloodytears'],
          ['🎮 Mii Channel', 'miichannel'],
          ['🎈 Jigglypuff', 'jigglypuff'],
          ['🔍 Professor Layton', 'layton'],
          ['💀 Doom', 'doom'],
          ['⚡ Harry Potter', 'harrypotter'],
          ['🐱 Keyboard Cat', 'keyboardcat'],
          ['🐘 Baby Elephant Walk', 'babyelephant'],
          ['🐈 Pink Panther', 'pinkpanther'],
          ['🦁 The Lion Sleeps Tonight', 'lionsleeps'],
          ['🎤 Take on Me', 'takeonme'],
          ['🕺 Never Gonna Give You Up', 'nevergonna'],
          ['📱 Nokia', 'nokia'],
          ['🎂 Doğum Günü', 'birthday'],
          ['🎹 Für Elise', 'furelise'],
          ['🎼 Ode to Joy', 'odetojoy'],
          ['🎻 Cannon in D', 'cannon'],
          ['🎶 Minuet in G', 'minuet'],
          ['🌿 Greensleeves', 'greensleeves'],
          ['😴 Brahms Ninni', 'brahms'],
          ['🔔 Jingle Bells', 'jinglebells'],
          ['🎄 Merry Christmas', 'merrychristmas'],
          ['🌟 Silent Night', 'silentnight'],
        ]),
        'SONG'
      );
    this.appendDummyInput()
      .appendField('pin')
      .appendField(new Blockly.FieldNumber(20, 0, 28, 1), 'PIN');
    this.setStyle('buzzer_blocks');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setTooltip('Seçilen hazır şarkıyı buzzer\'da çalar.');
  },
};
