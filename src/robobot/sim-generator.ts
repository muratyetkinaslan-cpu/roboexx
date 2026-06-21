/**
 * RoboBOT simülasyon kod üreteci.
 *
 * Blockly çalışma alanını, simülasyon iframe'inin çalıştırabileceği **async JS**'e
 * çevirir. Standart bloklar (eğer/değilse, tekrarla, mantık, matematik, değişken,
 * metin) Blockly'nin hazır JavaScript üretecini kullanır; burada yalnızca RoboExx'e
 * özel `rx_*` blokları için üreteç tanımlıyoruz.
 *
 * Üretilen kod, simülasyondaki global `bot` API'sini çağırır:
 *   await bot.motor(no, hız, yön) / bot.motorStop(no) / bot.motorStopAll()
 *   await bot.wait(ms)
 *   await bot.distance(trig, echo) / bot.digital(pin) / bot.analog(pin) / bot.pot(pin)
 *   await bot.tone(pin, frekans, süre) / bot.toneOff(pin)
 *   bot.print(x) / bot.stopProgram()
 *   await bot.frame()   // "sürekli tekrarla" döngüsünü 60Hz'de nefes aldırır
 *
 * Kullanım:
 *   import { installSimGenerators } from '../robobot/sim-generator';
 *   installSimGenerators();
 *   const code = javascriptGenerator.workspaceToCode(Blockly.getMainWorkspace());
 */
import { javascriptGenerator, Order } from 'blockly/javascript';
import type * as Blockly from 'blockly';

let installed = false;

export function installSimGenerators(): void {
  if (installed) return;
  installed = true;

  const G = javascriptGenerator;
  // Awaited ifadeyi her zaman parantezle döndür → herhangi bir bağlamda güvenli.
  const awaited = (expr: string): [string, number] => [`(${expr})`, Order.ATOMIC];

  // ---- AKIŞ ----
  G.forBlock['rx_on_start'] = function (block: Blockly.Block) {
    return G.statementToCode(block, 'DO');
  };

  G.forBlock['rx_forever'] = function (block: Blockly.Block) {
    const body = G.statementToCode(block, 'DO');
    // Her turda bir kare bekle → donmaz, robot akıcı hareket eder.
    return 'while (true) {\n' + body + G.INDENT + 'await bot.frame();\n}\n';
  };

  G.forBlock['rx_stop'] = function () {
    return 'bot.stopProgram();\n';
  };

  // ---- ZAMAN ----
  G.forBlock['rx_delay_ms'] = function (block: Blockly.Block) {
    const ms = G.valueToCode(block, 'MS', Order.NONE) || '500';
    return `await bot.wait(${ms});\n`;
  };
  G.forBlock['rx_delay_s'] = function (block: Blockly.Block) {
    const s = G.valueToCode(block, 'S', Order.NONE) || '1';
    return `await bot.wait((${s}) * 1000);\n`;
  };
  G.forBlock['rx_millis'] = function () {
    return awaited('performance.now()');
  };

  // ---- DC MOTOR ----
  G.forBlock['rx_dc_motor'] = function (block: Blockly.Block) {
    const num = block.getFieldValue('MOTOR_NUM');
    const dir = block.getFieldValue('DIRECTION');
    const speed = G.valueToCode(block, 'SPEED', Order.NONE) || '50';
    return `await bot.motor("${num}", ${speed}, "${dir}");\n`;
  };
  G.forBlock['rx_dc_motor_stop'] = function (block: Blockly.Block) {
    const num = block.getFieldValue('MOTOR_NUM');
    if (num === 'all') return 'await bot.motorStopAll();\n';
    return `await bot.motorStop("${num}");\n`;
  };

  // ---- SENSÖRLER ----
  G.forBlock['rx_ultrasonic_distance'] = function (block: Blockly.Block) {
    const trig = block.getFieldValue('TRIG');
    const echo = block.getFieldValue('ECHO');
    return awaited(`await bot.distance(${trig}, ${echo})`);
  };
  G.forBlock['rx_digital_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return awaited(`await bot.digital(${pin})`);
  };
  G.forBlock['rx_analog_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return awaited(`await bot.analog(${pin})`);
  };
  G.forBlock['rx_potentiometer'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return awaited(`await bot.pot(${pin})`);
  };

  // ---- BUZZER ----
  G.forBlock['rx_buzzer_tone'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const freq = G.valueToCode(block, 'FREQ', Order.NONE) || '440';
    const dur = G.valueToCode(block, 'DUR', Order.NONE) || '200';
    return `await bot.tone(${pin}, ${freq}, ${dur});\n`;
  };
  G.forBlock['rx_buzzer_note'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const note = block.getFieldValue('NOTE'); // frekans değeri (dropdown)
    const dur = G.valueToCode(block, 'DUR', Order.NONE) || '300';
    return `await bot.tone(${pin}, ${note}, ${dur});\n`;
  };
  G.forBlock['rx_buzzer_off'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return `await bot.toneOff(${pin});\n`;
  };

  // ---- KONSOL ----
  G.forBlock['rx_print'] = function (block: Blockly.Block) {
    const text = G.valueToCode(block, 'TEXT', Order.NONE) || '""';
    return `bot.print(${text});\n`;
  };

  // ---- MATEMATİK (RoboExx) ----
  G.forBlock['rx_map'] = function (block: Blockly.Block) {
    const v = G.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const fl = G.valueToCode(block, 'FROM_LOW', Order.NONE) || '0';
    const fh = G.valueToCode(block, 'FROM_HIGH', Order.NONE) || '100';
    const tl = G.valueToCode(block, 'TO_LOW', Order.NONE) || '0';
    const th = G.valueToCode(block, 'TO_HIGH', Order.NONE) || '255';
    return awaited(`bot.map(${v}, ${fl}, ${fh}, ${tl}, ${th})`);
  };
  G.forBlock['rx_abs'] = function (block: Blockly.Block) {
    const v = G.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return awaited(`Math.abs(${v})`);
  };

  // ---- KLAVYE / GAMEPAD (simülasyonda yakalanmıyor → false) ----
  const falseVal = (): [string, number] => ['false', Order.ATOMIC];
  for (const t of ['rx_key_pressed', 'rx_key_just_pressed', 'rx_gamepad_pressed',
    'rx_gamepad_just_pressed', 'rx_button_pressed']) {
    G.forBlock[t] = falseVal;
  }

  // ---- SİMÜLASYONDA MODELLENMEYEN SENSÖRLER → makul varsayılan ----
  G.forBlock['rx_internal_temp'] = (): [string, number] => ['25', Order.ATOMIC];
  G.forBlock['rx_ldr_read'] = (): [string, number] => ['500', Order.ATOMIC];
  G.forBlock['rx_ir_read_code'] = (): [string, number] => ['0', Order.ATOMIC];
  G.forBlock['rx_dht'] = (): [string, number] => ['0', Order.ATOMIC];
  G.forBlock['rx_shtc'] = (): [string, number] => ['0', Order.ATOMIC];

  // ---- DONANIM ÇIKIŞLARI (sim'de görsel karşılığı yok → sessizce atla) ----
  // Öğrenci programında LED/OLED/servo bloğu olsa bile simülasyon çökmez;
  // bu bloklar yalnızca yok sayılır, hareket/sensör blokları normal çalışır.
  const noop = (): string => '';
  for (const t of [
    'rx_digital_write', 'rx_pin_mode', 'rx_pwm_write', 'rx_relay',
    'rx_led_builtin', 'rx_led_external',
    'rx_servo_angle', 'rx_servo_v',
    'rx_motor_init', 'rx_pca', 'rx_ir_init',
    'rx_neopixel_init', 'rx_neopixel_set', 'rx_neopixel_show',
    'rx_rgb_init', 'rx_rgb_clear', 'rx_rgb_rainbow', 'rx_rgb_set_all', 'rx_rgb_set_one',
    'rx_oled_init', 'rx_oled_clear', 'rx_oled_show', 'rx_oled_text', 'rx_oled_eyes',
    'rx_oled_image', 'rx_oled_scroll_text', 'rx_oled_shape',
    'rx_play_song',
  ]) {
    G.forBlock[t] = noop;
  }
}

/**
 * Çalışma alanını simülasyon JS'ine çevirir. Üreteçleri kurar, sonra üretir.
 * Hareket/sensör bloğu olmayan bir programda kullanıcıyı uyarır (sonsuz döngü riski).
 */
export function generateSimCode(workspace: Blockly.Workspace): string {
  installSimGenerators();
  return javascriptGenerator.workspaceToCode(workspace);
}
