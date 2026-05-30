import { pythonGenerator, Order } from 'blockly/python';
import { FieldImageUpload, imageDataToBytesLiteral } from './image-upload-field';

/**
 * MicroPython kod üreticileri.
 *
 * ÖNEMLİ: Tüm helper fonksiyonlar artık `roboexx.py` modülünde.
 * Üretilen kod sadece bu modülü import eder ve fonksiyonlarını çağırır.
 * Kullanıcı RoboExx uygulamasındaki "Modülleri Yükle" butonu ile bu
 * modülü Pico'sunun köküne yükler. Bir kez yapar, hep çalışır.
 *
 * Bu sayede:
 *   - Üretilen kodlar 10-20x daha kısa
 *   - Tek noktadan güncelleme: bug fix → roboexx.py'yi güncelle, herkes yeniden yükler
 *   - Pico belleğinde tek seferlik byte-compile (.mpy cache)
 */

/** '#rrggbb' formatındaki rengi (r, g, b) ondalık üçlüsüne çevirir. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

function dedentOneLevel(code: string, indent: string): string {
  if (!code) return code;
  return code
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n');
}

// ====================================================================
// GLOBAL INIT — her kod üretiminde tetiklenir, temel importları
// definitions_'a koyar. Böylece rx_on_start bloğu olmasa bile veya
// hangi bloklar kullanılırsa kullanılsın time/roboexx her zaman import edilir.
// ====================================================================
const _origInit = pythonGenerator.init.bind(pythonGenerator);
pythonGenerator.init = function (workspace: any) {
  _origInit(workspace);
  // definitions_ Blockly tarafından sorted insertion ile kodun en üstüne konur
  this.definitions_['_rx_import_time'] = 'import time';
  this.definitions_['_rx_import_lib'] = 'from roboexx import *';
};

// ====================================================================
// AKIŞ
// ====================================================================

pythonGenerator.forBlock['rx_on_start'] = function (block, generator) {
  const statements = generator.statementToCode(block, 'DO');
  const body = dedentOneLevel(statements, generator.INDENT);
  // import'lar artık global init'te definitions_ ile ekleniyor — burada tekrar etmiyoruz
  return '# RoboExx — otomatik üretildi\n' + body;
};

pythonGenerator.forBlock['rx_forever'] = function (block, generator) {
  let statements = generator.statementToCode(block, 'DO');
  if (!statements) statements = generator.INDENT + 'pass\n';
  // Loop sonuna küçük bir sleep ekle — CPU'yu boğmasın, BLE/donanım IRQ'ları
  // nefes alabilsin. 10ms hem hassas davranış için yeterli hem de RP2040
  // watchdog/BLE stack için güvenli. Çocuklar bu farkı hissetmez.
  statements += generator.INDENT + 'time.sleep_ms(10)\n';
  return 'while True:\n' + statements;
};

pythonGenerator.forBlock['rx_stop'] = function () {
  return 'import sys\nsys.exit()\n';
};

// ====================================================================
// ZAMAN
// ====================================================================

pythonGenerator.forBlock['rx_delay_ms'] = function (block, generator) {
  const ms = generator.valueToCode(block, 'MS', Order.NONE) || '500';
  return `time.sleep_ms(int(${ms}))\n`;
};

pythonGenerator.forBlock['rx_delay_s'] = function (block, generator) {
  const s = generator.valueToCode(block, 'S', Order.NONE) || '1';
  return `time.sleep(${s})\n`;
};

pythonGenerator.forBlock['rx_millis'] = function () {
  return ['time.ticks_ms()', Order.FUNCTION_CALL];
};

// ====================================================================
// PİN / IO
// ====================================================================

pythonGenerator.forBlock['rx_digital_write'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const state = block.getFieldValue('STATE');
  const value = state === 'HIGH' ? '1' : '0';
  return `Pin(${pin}, Pin.OUT).value(${value})\n`;
};

pythonGenerator.forBlock['rx_digital_read'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [`Pin(${pin}, Pin.IN).value()`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_pin_mode'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const mode = block.getFieldValue('MODE');
  let pinExpr: string;
  if (mode === 'OUT')        pinExpr = `Pin(${pin}, Pin.OUT)`;
  else if (mode === 'IN')    pinExpr = `Pin(${pin}, Pin.IN)`;
  else if (mode === 'IN_PULL_UP')   pinExpr = `Pin(${pin}, Pin.IN, Pin.PULL_UP)`;
  else                              pinExpr = `Pin(${pin}, Pin.IN, Pin.PULL_DOWN)`;
  return `${pinExpr}\n`;
};

pythonGenerator.forBlock['rx_analog_read'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [`ADC(${pin}).read_u16()`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_pwm_write'] = function (block, generator) {
  const pin = block.getFieldValue('PIN');
  const duty = generator.valueToCode(block, 'DUTY', Order.NONE) || '0';
  return `pwm_write(${pin}, ${duty})\n`;
};

// ====================================================================
// KONSOL
// ====================================================================

pythonGenerator.forBlock['rx_print'] = function (block, generator) {
  const text = generator.valueToCode(block, 'TEXT', Order.NONE) || '""';
  return `print(${text})\n`;
};

// ====================================================================
// AKTÜATÖRLER
// ====================================================================

pythonGenerator.forBlock['rx_led_builtin'] = function (block, generator) {
  const state = block.getFieldValue('STATE');
  generator.definitions_['rx_led_var'] = '_rx_led = led_init()';
  if (state === 'ON')     return `_rx_led.value(1)\n`;
  if (state === 'OFF')    return `_rx_led.value(0)\n`;
  return `_rx_led.toggle()\n`;
};

pythonGenerator.forBlock['rx_servo_angle'] = function (block, generator) {
  const pin = block.getFieldValue('PIN');
  const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '90';
  return `servo_angle(${pin}, ${angle})\n`;
};

pythonGenerator.forBlock['rx_buzzer_tone'] = function (block, generator) {
  const pin = block.getFieldValue('PIN');
  const freq = generator.valueToCode(block, 'FREQ', Order.NONE) || '440';
  const dur = generator.valueToCode(block, 'DUR', Order.NONE) || '200';
  return `buzzer_tone(${pin}, ${freq}, ${dur})\n`;
};

pythonGenerator.forBlock['rx_buzzer_off'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return `buzzer_off(${pin})\n`;
};

pythonGenerator.forBlock['rx_buzzer_note'] = function (block, generator) {
  const pin = block.getFieldValue('PIN');
  const note = block.getFieldValue('NOTE'); // frekans değeri (dropdown)
  const dur = generator.valueToCode(block, 'DUR', Order.NONE) || '300';
  return `buzzer_tone(${pin}, ${note}, ${dur})\n`;
};

pythonGenerator.forBlock['rx_neopixel_init'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const count = block.getFieldValue('COUNT');
  return `neopixel_init(${pin}, ${count})\n`;
};

pythonGenerator.forBlock['rx_neopixel_set'] = function (block, generator) {
  const index = generator.valueToCode(block, 'INDEX', Order.NONE) || '0';
  const { r, g, b } = hexToRgb(block.getFieldValue('COLOUR'));
  return `neopixel_set(${index}, ${r}, ${g}, ${b})\n`;
};

pythonGenerator.forBlock['rx_neopixel_show'] = function () {
  return `neopixel_show()\n`;
};

// ====================================================================
// OLED EKRAN
// ====================================================================

pythonGenerator.forBlock['rx_oled_init'] = function (block) {
  const sda = block.getFieldValue('SDA');
  const scl = block.getFieldValue('SCL');
  const bus = block.getFieldValue('I2C_BUS');
  const size = block.getFieldValue('SIZE');
  const addr = block.getFieldValue('ADDR');
  const [w, h] = size === '128x32' ? ['128', '32'] : ['128', '64'];
  return `oled_init(${sda}, ${scl}, bus=${bus}, width=${w}, height=${h}, addr=${addr})\n`;
};

pythonGenerator.forBlock['rx_oled_clear'] = function () {
  return 'oled_clear()\n';
};

pythonGenerator.forBlock['rx_oled_show'] = function () {
  return 'oled_show()\n';
};

pythonGenerator.forBlock['rx_oled_text'] = function (block, generator) {
  const text = generator.valueToCode(block, 'TEXT', Order.NONE) || '""';
  const align = block.getFieldValue('ALIGN');
  const x = block.getFieldValue('X');
  const y = block.getFieldValue('Y');
  const size = block.getFieldValue('SIZE');
  return `oled_text(${text}, x=${x}, y=${y}, size=${size}, align="${align}")\n`;
};

pythonGenerator.forBlock['rx_oled_shape'] = function (block) {
  const shape = block.getFieldValue('SHAPE');
  const x = block.getFieldValue('X');
  const y = block.getFieldValue('Y');
  const size = block.getFieldValue('SIZE');
  const color = block.getFieldValue('COLOR');
  return `oled_shape("${shape}", ${x}, ${y}, size=${size}, color=${color})\n`;
};

pythonGenerator.forBlock['rx_oled_eyes'] = function (block) {
  const eye = block.getFieldValue('EYE');
  return `oled_eyes("${eye}")\n`;
};

// ====================================================================
// SENSÖRLER
// ====================================================================

pythonGenerator.forBlock['rx_button_pressed'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [`button_pressed(${pin})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_key_pressed'] = function (block) {
  const key = block.getFieldValue('KEY');
  // Python string için kaçışlı hale getir
  const py = JSON.stringify(key);
  return [`tus_basili(${py})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_key_just_pressed'] = function (block) {
  const key = block.getFieldValue('KEY');
  const py = JSON.stringify(key);
  return [`tus_basildi(${py})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_gamepad_pressed'] = function (block) {
  // Gamepad düğmeleri klavye ile aynı state'te tutulur, tus_basili kullanır
  const btn = block.getFieldValue('BTN');
  const py = JSON.stringify(btn);
  return [`tus_basili(${py})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_gamepad_just_pressed'] = function (block) {
  const btn = block.getFieldValue('BTN');
  const py = JSON.stringify(btn);
  return [`tus_basildi(${py})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_ultrasonic_distance'] = function (block) {
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');
  return [`ultrasonic_distance(${trig}, ${echo})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_internal_temp'] = function () {
  return [`internal_temp()`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_potentiometer'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [`potentiometer(${pin})`, Order.FUNCTION_CALL];
};

// ====================================================================
// MATEMATİK
// ====================================================================

pythonGenerator.forBlock['rx_map'] = function (block, generator) {
  const value = generator.valueToCode(block, 'VALUE', Order.NONE) || '0';
  const fromLow = generator.valueToCode(block, 'FROM_LOW', Order.NONE) || '0';
  const fromHigh = generator.valueToCode(block, 'FROM_HIGH', Order.NONE) || '100';
  const toLow = generator.valueToCode(block, 'TO_LOW', Order.NONE) || '0';
  const toHigh = generator.valueToCode(block, 'TO_HIGH', Order.NONE) || '255';
  return [`rx_map(${value}, ${fromLow}, ${fromHigh}, ${toLow}, ${toHigh})`, Order.FUNCTION_CALL];
};

// ====================================================================
// OLED KAYAN YAZI + RESİM
// ====================================================================

pythonGenerator.forBlock['rx_oled_scroll_text'] = function (block, generator) {
  const text = generator.valueToCode(block, 'TEXT', Order.NONE) || '""';
  const dir = block.getFieldValue('DIR');
  const y = block.getFieldValue('Y');
  const size = block.getFieldValue('SIZE');
  const speed = block.getFieldValue('SPEED');
  return `oled_scroll_text(${text}, y=${y}, size=${size}, speed=${speed}, direction="${dir}")\n`;
};

pythonGenerator.forBlock['rx_oled_image'] = function (block) {
  const field = block.getField('IMG') as FieldImageUpload | null;
  const val = field?.getValue();
  const x = block.getFieldValue('X');
  const y = block.getFieldValue('Y');
  if (!val || !val.data) {
    return `# (resim yüklenmemiş)\n`;
  }
  const literal = imageDataToBytesLiteral(val);
  return `oled_image(${literal}, x=${x}, y=${y}, width=${val.width}, height=${val.height})\n`;
};

// ====================================================================
// HARİCİ LED
// ====================================================================

pythonGenerator.forBlock['rx_led_external'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const state = block.getFieldValue('STATE');
  if (state === 'ON')     return `Pin(${pin}, Pin.OUT).value(1)\n`;
  if (state === 'OFF')    return `Pin(${pin}, Pin.OUT).value(0)\n`;
  // TOGGLE - kalıcı pin nesnesi gerek, helper kullan
  return `relay_toggle(${pin})\n`; // toggle helper'ı LED için de aynı işi yapar
};

// ====================================================================
// RGB LED (WS2812) — kolay komutlar
// ====================================================================

pythonGenerator.forBlock['rx_rgb_init'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const count = block.getFieldValue('COUNT');
  return `rgb_init(${pin}, ${count})\n`;
};

pythonGenerator.forBlock['rx_rgb_set_all'] = function (block) {
  const { r, g, b } = hexToRgb(block.getFieldValue('COLOUR'));
  return `rgb_set_all(${r}, ${g}, ${b})\n`;
};

pythonGenerator.forBlock['rx_rgb_set_one'] = function (block, generator) {
  const idx = generator.valueToCode(block, 'INDEX', Order.NONE) || '0';
  const { r, g, b } = hexToRgb(block.getFieldValue('COLOUR'));
  return `rgb_set_one(${idx}, ${r}, ${g}, ${b})\n`;
};

pythonGenerator.forBlock['rx_rgb_clear'] = function () {
  return `rgb_clear()\n`;
};

pythonGenerator.forBlock['rx_rgb_rainbow'] = function (block, generator) {
  const step = generator.valueToCode(block, 'STEP', Order.NONE) || '0';
  return `rgb_rainbow(${step})\n`;
};

// ====================================================================
// RÖLE
// ====================================================================

pythonGenerator.forBlock['rx_relay'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const state = block.getFieldValue('STATE');
  if (state === 'ON')     return `relay_set(${pin}, True)\n`;
  if (state === 'OFF')    return `relay_set(${pin}, False)\n`;
  return `relay_toggle(${pin})\n`;
};

// ====================================================================
// DHT11
// ====================================================================

pythonGenerator.forBlock['rx_dht11_temp'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [`dht11_temp(${pin})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_dht11_humidity'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [`dht11_humidity(${pin})`, Order.FUNCTION_CALL];
};

// ====================================================================
// SHTC3
// ====================================================================

pythonGenerator.forBlock['rx_shtc3_init'] = function (block) {
  const sda = block.getFieldValue('SDA');
  const scl = block.getFieldValue('SCL');
  const bus = block.getFieldValue('I2C_BUS');
  return `shtc3_init(sda_pin=${sda}, scl_pin=${scl}, bus=${bus})\n`;
};

pythonGenerator.forBlock['rx_shtc3_temp'] = function () {
  return [`shtc3_temp()`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_shtc3_humidity'] = function () {
  return [`shtc3_humidity()`, Order.FUNCTION_CALL];
};

// ====================================================================
// IR ALICI
// ====================================================================

pythonGenerator.forBlock['rx_ir_init'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return `ir_init(${pin})\n`;
};

pythonGenerator.forBlock['rx_ir_read_code'] = function () {
  return [`ir_read_code()`, Order.FUNCTION_CALL];
};

// ====================================================================
// LDR
// ====================================================================

pythonGenerator.forBlock['rx_ldr_read'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [`ldr_read(${pin})`, Order.FUNCTION_CALL];
};

// ====================================================================
// MOTOR SÜRÜCÜ v2 (PicoBricks I2C)
// ====================================================================

pythonGenerator.forBlock['rx_motor_init'] = function (block) {
  const sda = block.getFieldValue('SDA');
  const scl = block.getFieldValue('SCL');
  const bus = block.getFieldValue('I2C_BUS');
  return `motor_init(sda_pin=${sda}, scl_pin=${scl}, bus=${bus})\n`;
};

pythonGenerator.forBlock['rx_servo_v2'] = function (block, generator) {
  const servoNum = block.getFieldValue('SERVO_NUM');
  const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '90';
  return `servo_v2(${servoNum}, ${angle})\n`;
};

pythonGenerator.forBlock['rx_dc_motor'] = function (block, generator) {
  const motorNum = block.getFieldValue('MOTOR_NUM');
  const direction = block.getFieldValue('DIRECTION');
  const speed = generator.valueToCode(block, 'SPEED', Order.NONE) || '50';
  return `dc_motor(${motorNum}, ${speed}, "${direction}")\n`;
};

pythonGenerator.forBlock['rx_dc_motor_stop'] = function (block) {
  const motorNum = block.getFieldValue('MOTOR_NUM');
  if (motorNum === 'all') {
    return `dc_motor_stop_all()\n`;
  }
  return `dc_motor_stop(${motorNum})\n`;
};

// ============================================================
//  BerryBot Jeneratörleri
//  Kullanılan her BerryBot bloğu, berrybot.py import'unu ve
//  tek 'robot' nesnesini definitions_ ile bir kez enjekte eder.
// ============================================================

/** BerryBot import + robot nesnesini (bir kez) üretilen koda ekler. */
function ensureBerryBot(generator: typeof pythonGenerator): void {
  generator.definitions_['import_berrybot'] = 'from berrybot import BerryBot';
  generator.definitions_['berrybot_robot'] = 'robot = BerryBot()';
}

// ---- Hareket ----
pythonGenerator.forBlock['bb_move'] = function (block, generator) {
  ensureBerryBot(generator);
  const dir = block.getFieldValue('DIR');       // ileri/geri/sol/sag
  const speed = block.getFieldValue('SPEED');   // SPEED_LOW/MID/MAX
  return `robot.${dir}(${speed})\n`;
};

pythonGenerator.forBlock['bb_stop'] = function (_block, generator) {
  ensureBerryBot(generator);
  return 'robot.dur()\n';
};

pythonGenerator.forBlock['bb_motors'] = function (block, generator) {
  ensureBerryBot(generator);
  const left = generator.valueToCode(block, 'LEFT', Order.NONE) || '0';
  const right = generator.valueToCode(block, 'RIGHT', Order.NONE) || '0';
  return `robot.motor_sur(${left}, ${right})\n`;
};

// ---- Mesafe ----
pythonGenerator.forBlock['bb_distance'] = function (_block, generator) {
  ensureBerryBot(generator);
  return ['robot.mesafe()', Order.FUNCTION_CALL];
};

// ---- Çizgi sensörü ----
pythonGenerator.forBlock['bb_line'] = function (block, generator) {
  ensureBerryBot(generator);
  const side = block.getFieldValue('SIDE'); // cizgi_sol / cizgi_sag
  return [`robot.${side}()`, Order.FUNCTION_CALL];
};

// ---- Işık (LDR) ----
pythonGenerator.forBlock['bb_light'] = function (block, generator) {
  ensureBerryBot(generator);
  const side = block.getFieldValue('SIDE'); // isik_sol / isik_sag
  return [`robot.${side}()`, Order.FUNCTION_CALL];
};

// ---- Buton ----
pythonGenerator.forBlock['bb_button'] = function (_block, generator) {
  ensureBerryBot(generator);
  return ['robot.buton_basili()', Order.FUNCTION_CALL];
};

// ---- RGB şerit ----
pythonGenerator.forBlock['bb_rgb_all'] = function (block, generator) {
  ensureBerryBot(generator);
  const colour = block.getFieldValue('COLOUR') || '#ff0000';
  const { r, g, b } = hexToRgb(colour);
  return `robot.rgb_tum(${r}, ${g}, ${b})\n`;
};

pythonGenerator.forBlock['bb_rgb_one'] = function (block, generator) {
  ensureBerryBot(generator);
  const index = generator.valueToCode(block, 'INDEX', Order.NONE) || '0';
  const colour = block.getFieldValue('COLOUR') || '#ff0000';
  const { r, g, b } = hexToRgb(colour);
  return `robot.rgb_piksel(${index}, ${r}, ${g}, ${b})\n`;
};

pythonGenerator.forBlock['bb_rgb_off'] = function (_block, generator) {
  ensureBerryBot(generator);
  return 'robot.rgb_kapat()\n';
};

// ---- Buzzer ----
pythonGenerator.forBlock['bb_horn'] = function (_block, generator) {
  ensureBerryBot(generator);
  return 'robot.korna()\n';
};

pythonGenerator.forBlock['bb_buzzer'] = function (block, generator) {
  ensureBerryBot(generator);
  const freq = generator.valueToCode(block, 'FREQ', Order.NONE) || '440';
  const dur = generator.valueToCode(block, 'DUR', Order.NONE) || '200';
  return `robot.ses(${freq}, ${dur})\n`;
};

// ---- LED Matris ----
pythonGenerator.forBlock['bb_matrix_shape'] = function (block, generator) {
  ensureBerryBot(generator);
  const shape = block.getFieldValue('SHAPE');
  return `robot.matris_sekil("${shape}")\n`;
};

pythonGenerator.forBlock['bb_matrix_clear'] = function (_block, generator) {
  ensureBerryBot(generator);
  return 'robot.matris_temizle()\n';
};

// ---- IR alıcı ----
pythonGenerator.forBlock['bb_ir_start'] = function (_block, generator) {
  ensureBerryBot(generator);
  return 'robot.ir_basla()\n';
};

pythonGenerator.forBlock['bb_ir_key'] = function (block, generator) {
  ensureBerryBot(generator);
  // berrybot.py IR_RX sınıfının tuş sabitleri
  generator.definitions_['import_ir_rx'] = 'from berrybot import IR_RX';
  const key = block.getFieldValue('KEY');
  return [`(robot.ir_tus() == IR_RX.${key})`, Order.RELATIONAL];
};

// ---- Müzik — hazır şarkı çalma ----
pythonGenerator.forBlock['rx_play_song'] = function (block, generator) {
  // songs.py'den play_song import et (bir kez)
  generator.definitions_['import_songs'] = 'from songs import play_song';
  const song = block.getFieldValue('SONG');
  const pin = block.getFieldValue('PIN');
  return `play_song(${pin}, "${song}")\n`;
};

export { pythonGenerator };
