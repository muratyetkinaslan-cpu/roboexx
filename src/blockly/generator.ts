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
  if (shape === 'LINE_V') {
    // Dikey çizgi: eski roboexx.py'lerde de çalışsın diye piksel piksel (tek satır, girinti güvenli)
    return `for __vy in range(${size}): oled_shape("PIXEL", ${x}, ${y} + __vy, color=${color})\n`;
  }
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

pythonGenerator.forBlock['rx_abs'] = function (block, generator) {
  const value = generator.valueToCode(block, 'VALUE', Order.NONE) || '0';
  return [`abs(${value})`, Order.FUNCTION_CALL];
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

// ---- Servo v3 — PCA9685 I2C 16-kanal sürücü ----
pythonGenerator.forBlock['rx_pca9685_init'] = function (block, generator) {
  generator.definitions_['import_pca9685_init'] = 'from pca9685 import init_pca9685';
  const sda = block.getFieldValue('SDA');
  const scl = block.getFieldValue('SCL');
  const addrText = (block.getFieldValue('ADDR') || '40').trim();
  const addr = parseInt(addrText.replace(/^0x/i, ''), 16) || 0x40;
  // Default değerlerse parametre vermeden çağır (kod temiz olsun)
  if (sda === 4 && scl === 5 && addr === 0x40) {
    return `init_pca9685()\n`;
  }
  return `init_pca9685(sda=${sda}, scl=${scl}, addr=0x${addr.toString(16).toUpperCase()})\n`;
};

pythonGenerator.forBlock['rx_servo_v3'] = function (block, generator) {
  generator.definitions_['import_pca9685'] = 'from pca9685 import servo_v3';
  const channel = block.getFieldValue('CHANNEL');
  const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '90';
  return `servo_v3(${channel}, ${angle})\n`;
};

pythonGenerator.forBlock['rx_servo_v3_off'] = function (block, generator) {
  generator.definitions_['import_pca9685_off'] = 'from pca9685 import servo_v3_off';
  const channel = block.getFieldValue('CHANNEL');
  return `servo_v3_off(${channel})\n`;
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

// ====================================================================
// L9110 MOTOR SÜRÜCÜ — kendi içinde tam (roboexx.py gerekmez)
// ====================================================================

/** L9110 yardımcılarını üretilen kodun başına bir kez ekler. */
function ensureL9110Defs(generator: any) {
  generator.definitions_['_rx_import_machine_pwm'] = 'from machine import Pin, PWM';
  generator.definitions_['_rx_import_time'] = 'import time';
  generator.definitions_['_rx_l9110_lib'] =
    '_rx_l9110_pwm = {}\n' +
    'def _rx_l9110_duty(o, duty):\n' +
    '    # duty_u16 yoksa (eski ESP32 firmware) 0-1023 duty() kullan\n' +
    '    try:\n' +
    '        o.duty_u16(duty)\n' +
    '    except AttributeError:\n' +
    '        o.duty(duty * 1023 // 65535)\n' +
    'def _rx_l9110_pwm_pin(p):\n' +
    '    o = _rx_l9110_pwm.get(p)\n' +
    '    if o is None:\n' +
    '        o = PWM(Pin(p)); o.freq(1000); _rx_l9110_pwm[p] = o\n' +
    '    return o\n' +
    'def _rx_l9110_low(p):\n' +
    '    # PWM kanalini tamamen birak ve pini dijital LOW yap.\n' +
    '    # ESP32 LEDC duty=0 glitch darbeleri uretir — dijital LOW kesin cozum.\n' +
    '    o = _rx_l9110_pwm.pop(p, None)\n' +
    '    if o:\n' +
    '        try:\n' +
    '            _rx_l9110_duty(o, 0); o.deinit()\n' +
    '        except Exception:\n' +
    '            pass\n' +
    '    Pin(p, Pin.OUT).value(0)\n' +
    'def _rx_l9110_high(p):\n' +
    '    # %100 hizda PWM yerine dijital HIGH (ESP32 max-duty tuhafliklarini atlar)\n' +
    '    o = _rx_l9110_pwm.pop(p, None)\n' +
    '    if o:\n' +
    '        try:\n' +
    '            o.deinit()\n' +
    '        except Exception:\n' +
    '            pass\n' +
    '    Pin(p, Pin.OUT).value(1)\n' +
    'def rx_l9110(ia, ib, spd, d):\n' +
    '    spd = 0 if spd < 0 else (100 if spd > 100 else int(spd))\n' +
    '    if spd == 0 or d == 0:\n' +
    '        # DUR = FREN: L9110\'da iki giris HIGH = kisa devre freni.\n' +
    '        # Iki pini 0 yapmak "coast"tur — motor ataletle donmeye devam eder!\n' +
    '        _rx_l9110_low(ia); _rx_l9110_low(ib)\n' +
    '        pa = Pin(ia, Pin.OUT); pb = Pin(ib, Pin.OUT)\n' +
    '        pa.value(1); pb.value(1)\n' +
    '        time.sleep_ms(80)\n' +
    '        pa.value(0); pb.value(0)\n' +
    '        return\n' +
    '    hi = ia if d > 0 else ib\n' +
    '    lo = ib if d > 0 else ia\n' +
    '    _rx_l9110_low(lo)\n' +
    '    if spd >= 100:\n' +
    '        _rx_l9110_high(hi)\n' +
    '    else:\n' +
    '        _rx_l9110_duty(_rx_l9110_pwm_pin(hi), spd * 65535 // 100)';
}

pythonGenerator.forBlock['rx_l9110_motor'] = function (block, generator) {
  ensureL9110Defs(generator);
  const ia = block.getFieldValue('IA');
  const ib = block.getFieldValue('IB');
  const dir = block.getFieldValue('DIRECTION') === 'forward' ? 1 : -1;
  const speed = generator.valueToCode(block, 'SPEED', Order.NONE) || '50';
  return `rx_l9110(${ia}, ${ib}, ${speed}, ${dir})\n`;
};

pythonGenerator.forBlock['rx_l9110_stop'] = function (block, generator) {
  ensureL9110Defs(generator);
  const ia = block.getFieldValue('IA');
  const ib = block.getFieldValue('IB');
  return `rx_l9110(${ia}, ${ib}, 0, 0)\n`;
};

// ====================================================================
// ENKODER — kendi içinde tam (roboexx.py gerekmez)
// ====================================================================

function ensureEncoderDefs(generator: any) {
  generator.definitions_['_rx_import_machine_enc'] = 'from machine import Pin';
  generator.definitions_['_rx_import_time_enc'] = 'import time';
  generator.definitions_['_rx_enc_lib'] =
    '_rx_enc = {1: 0, 2: 0}\n' +
    '_rx_enc_t = {1: 0, 2: 0}\n' +
    '_rx_enc_c = {1: 0, 2: 0}\n' +
    'def _rx_enc_init(eid, pin):\n' +
    '    p = Pin(pin, Pin.IN, Pin.PULL_UP)\n' +
    '    def _cb(t, eid=eid):\n' +
    '        _rx_enc[eid] += 1\n' +
    '    p.irq(trigger=Pin.IRQ_RISING, handler=_cb)\n' +
    '    _rx_enc_t[eid] = time.ticks_ms()\n' +
    'def _rx_enc_speed(eid):\n' +
    '    now = time.ticks_ms()\n' +
    '    dt = time.ticks_diff(now, _rx_enc_t[eid])\n' +
    '    dc = _rx_enc[eid] - _rx_enc_c[eid]\n' +
    '    _rx_enc_t[eid] = now; _rx_enc_c[eid] = _rx_enc[eid]\n' +
    '    if dt <= 0:\n' +
    '        return 0\n' +
    '    return dc * 1000 // dt';
}

pythonGenerator.forBlock['rx_encoder_init'] = function (block, generator) {
  ensureEncoderDefs(generator);
  const enc = block.getFieldValue('ENC');
  const pin = block.getFieldValue('PIN');
  return `_rx_enc_init(${enc}, ${pin})\n`;
};

pythonGenerator.forBlock['rx_encoder_count'] = function (block, generator) {
  ensureEncoderDefs(generator);
  const enc = block.getFieldValue('ENC');
  return [`_rx_enc[${enc}]`, Order.MEMBER];
};

pythonGenerator.forBlock['rx_encoder_speed'] = function (block, generator) {
  ensureEncoderDefs(generator);
  const enc = block.getFieldValue('ENC');
  return [`_rx_enc_speed(${enc})`, Order.FUNCTION_CALL];
};

pythonGenerator.forBlock['rx_encoder_reset'] = function (block, generator) {
  ensureEncoderDefs(generator);
  const enc = block.getFieldValue('ENC');
  return `_rx_enc[${enc}] = 0\n_rx_enc_c[${enc}] = 0\n`;
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
