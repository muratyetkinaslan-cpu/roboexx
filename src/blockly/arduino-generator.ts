import * as Blockly from 'blockly';

/**
 * RoboExx Arduino (C++/.ino) kod üreticisi.
 *
 * MicroPython üreticisinin (generator.ts) Arduino karşılığı. Aynı bloklardan
 * Arduino IDE'nin derleyebileceği temiz bir .ino üretir.
 *
 * Yapı:
 *   - "Başlangıçta" (rx_on_start) bloğunun içi  -> void setup() { ... }
 *   - "Sürekli tekrarla" (rx_forever) bloğunun içi -> void loop() { ... }
 *   - Yardımcı fonksiyonlar / global değişkenler  -> dosyanın başına
 *
 * Pico'ya özel bazı çevre birimleri (OLED, NeoPixel, DHT, IR, PCA9685, I2C
 * motor sürücü, hazır şarkılar...) Arduino tarafında kütüphane gerektirdiği
 * için DESTEKLENMEZ — bu bloklar için kodda açıklayıcı bir yorum üretilir,
 * üretim asla çökmez.
 *
 * Robot araba / çizgi izleyen için ihtiyaç duyulan her şey desteklenir:
 *   akış, zaman, pinler, konsol (Serial), mantık, matematik, metin,
 *   değişken/fonksiyon, LED, buzzer, servo, ultrasonik, buton, potansiyometre,
 *   L9110 motor sürücü ve ENKODER.
 */

// C++ operatör öncelik tablosu (düşük sayı = sıkı bağlanma)
export const AOrder = {
  ATOMIC: 0,
  UNARY: 1,
  MUL: 2,
  ADD: 3,
  SHIFT: 4,
  RELATIONAL: 5,
  EQUALITY: 6,
  BIT_AND: 7,
  BIT_XOR: 8,
  BIT_OR: 9,
  LOGICAL_AND: 10,
  LOGICAL_OR: 11,
  CONDITIONAL: 12,
  ASSIGNMENT: 13,
  NONE: 99,
} as const;

type Gen = any;

// Blockly Generator örneği
export const arduinoGenerator: Gen = new (Blockly as any).Generator('Arduino');

arduinoGenerator.ORDER_ATOMIC = AOrder.ATOMIC;
arduinoGenerator.ORDER_NONE = AOrder.NONE;

arduinoGenerator.INDENT = '  ';

// C++ / Arduino ayrılmış kelimeler — değişken adlarıyla çakışmasın
arduinoGenerator.addReservedWords(
  'setup,loop,if,else,for,while,do,switch,case,break,continue,return,void,int,' +
    'long,float,double,bool,boolean,char,byte,String,true,false,HIGH,LOW,INPUT,' +
    'OUTPUT,INPUT_PULLUP,pinMode,digitalWrite,digitalRead,analogWrite,analogRead,' +
    'delay,delayMicroseconds,millis,micros,map,constrain,min,max,abs,Serial,tone,' +
    'noTone,pulseIn,attachInterrupt,detachInterrupt,digitalPinToInterrupt,Servo,' +
    'sin,cos,tan,sqrt,pow,random,randomSeed,PI'
);

// ---------------------------------------------------------------------------
// init / finish
// ---------------------------------------------------------------------------

arduinoGenerator.init = function (workspace: any) {
  // Tabloları sıfırla
  this.definitions_ = Object.create(null);   // global değişken + yardımcı fonksiyonlar
  this.includes_ = Object.create(null);       // #include satırları
  this.functionNames_ = Object.create(null);
  this.rxSetup_ = '';                          // setup() gövdesi
  this.rxLoop_ = '';                           // loop() gövdesi
  this.rxSerialUsed_ = false;
  this.rxLiveKeysUsed_ = false;                // canlı tuş/gamepad protokolü

  if (!this.nameDB_) {
    this.nameDB_ = new (Blockly as any).Names(this.RESERVED_WORDS_);
  } else {
    this.nameDB_.reset();
  }
  this.nameDB_.setVariableMap(workspace.getVariableMap());
  this.nameDB_.populateVariables(workspace);
  this.nameDB_.populateProcedures(workspace);
};

arduinoGenerator.finish = function (code: string) {
  const NT = (Blockly as any).Names.NameType;

  // #include satırları
  const includes = Object.keys(this.includes_)
    .map((k) => this.includes_[k])
    .join('\n');

  // global değişkenler + yardımcı fonksiyonlar
  const defs = Object.keys(this.definitions_)
    .map((k) => this.definitions_[k])
    .join('\n\n');

  // Blockly değişkenlerini float global olarak tanımla (sayısal robot kullanımı).
  // Generator'ın gerçekten gördüğü değişkenleri rxVars_ set'inden topluyoruz.
  let varDecls = '';
  if (this.rxVars_ && this.rxVars_.size) {
    const lines: string[] = [];
    this.rxVars_.forEach((name: string) => {
      lines.push(`float ${name} = 0;`);
    });
    varDecls = lines.join('\n');
  }
  void NT;

  // setup() — kullanılan donanıma göre Serial.begin
  // Canlı tuş/gamepad kullanılıyorsa tarayıcı bağlantısıyla aynı hız: 115200.
  let setupBody = '';
  if (this.rxLiveKeysUsed_) {
    setupBody += this.INDENT + 'Serial.begin(115200); // canlı klavye/gamepad\n';
  } else if (this.rxSerialUsed_) {
    setupBody += this.INDENT + 'Serial.begin(9600);\n';
  }
  // setup öncesi kalan (start/forever dışında kalan) top-level kod
  const leftover = (code || '').trim();
  if (leftover) {
    setupBody += this.prefixLines(leftover, this.INDENT) + '\n';
  }
  setupBody += this.rxSetup_;

  const loopBody =
    (this.rxLiveKeysUsed_
      ? this.INDENT + '__rxPumpKeys(); // canlı tuşları tazele\n'
      : '') + this.rxLoop_;

  // Canlı tuş modunda bekleme blokları seri okumayı kesmesin:
  // delay(...) → rxDelay(...) (delayMicroseconds etkilenmez).
  // Aksi halde 64 baytlık RX tamponu beklemede taşar, paketler bölünür,
  // motorlar "titrer" (tuş bir an bırakılmış görünür).
  const liveFix = (s: string): string =>
    this.rxLiveKeysUsed_ ? s.replace(/\bdelay\(/g, 'rxDelay(') : s;

  const parts: string[] = [];
  parts.push('// RoboExx — otomatik üretildi (Arduino C++)');
  if (includes) parts.push(includes);
  if (varDecls) parts.push(varDecls);
  if (defs) parts.push(liveFix(defs));
  parts.push(`void setup() {\n${liveFix(setupBody)}}`);
  parts.push(`void loop() {\n${liveFix(loopBody)}}`);

  // Temizlik
  this.nameDB_.reset();
  this.rxVars_ = null;

  return parts.join('\n\n') + '\n';
};

arduinoGenerator.scrubNakedValue = function (line: string) {
  return line + ';\n';
};

arduinoGenerator.quote_ = function (str: string) {
  const s = String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  return '"' + s + '"';
};

// İfade/komut zincirleme + yorum ekleme
arduinoGenerator.scrub_ = function (block: any, code: string, thisOnly?: boolean) {
  let commentCode = '';
  if (!block.outputConnection || !block.outputConnection.targetConnection) {
    const comment = block.getCommentText();
    if (comment) {
      commentCode += this.prefixLines(comment + '\n', '// ');
    }
  }
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = thisOnly ? '' : this.blockToCode(nextBlock);
  return commentCode + code + nextCode;
};

// prefixLines yardımcı (Blockly tabanında var ama emin olmak için)
if (typeof arduinoGenerator.prefixLines !== 'function') {
  arduinoGenerator.prefixLines = function (text: string, prefix: string) {
    return prefix + text.replace(/(?!\n$)\n/g, '\n' + prefix);
  };
}

/** Değişken adını kayıt altına alır (global tanım üretimi için). */
function rememberVar(generator: Gen, name: string) {
  if (!generator.rxVars_) generator.rxVars_ = new Set<string>();
  generator.rxVars_.add(name);
}

/** Bir bloğun karşılığı Arduino'da yoksa açıklayıcı yorum üretir. */
function unsupportedStatement(label: string): string {
  return `// [Arduino'da desteklenmiyor: ${label} — bu blok Pico/MicroPython içindir]\n`;
}
function unsupportedValue(label: string): [string, number] {
  return [`0 /* Arduino'da yok: ${label} */`, AOrder.ATOMIC];
}

const fb = (type: string, fn: (block: any, g: Gen) => any) => {
  arduinoGenerator.forBlock[type] = fn;
};

// ====================================================================
// AKIŞ
// ====================================================================

fb('rx_on_start', (block, g) => {
  const body = g.statementToCode(block, 'DO');
  g.rxSetup_ += body;
  return '';
});

fb('rx_forever', (block, g) => {
  const body = g.statementToCode(block, 'DO');
  g.rxLoop_ += body;
  return '';
});

fb('rx_stop', () => {
  // Arduino'da program durdurma -> sonsuz boş döngü
  return 'while (true) { delay(1000); }\n';
});

// ====================================================================
// ZAMAN
// ====================================================================

fb('rx_delay_ms', (block, g) => {
  const ms = g.valueToCode(block, 'MS', AOrder.NONE) || '500';
  return `delay(${ms});\n`;
});

fb('rx_delay_s', (block, g) => {
  const s = g.valueToCode(block, 'S', AOrder.NONE) || '1';
  return `delay((unsigned long)(${s} * 1000));\n`;
});

fb('rx_millis', () => {
  return ['millis()', AOrder.ATOMIC];
});

// ====================================================================
// PİN / IO
// ====================================================================

fb('rx_pin_mode', (block) => {
  const pin = block.getFieldValue('PIN');
  const mode = block.getFieldValue('MODE');
  let m = 'OUTPUT';
  if (mode === 'IN') m = 'INPUT';
  else if (mode === 'IN_PULL_UP') m = 'INPUT_PULLUP';
  else if (mode === 'IN_PULL_DOWN') m = 'INPUT'; // Arduino'da dahili pull-down yok
  return `pinMode(${pin}, ${m});\n`;
});

fb('rx_digital_write', (block) => {
  const pin = block.getFieldValue('PIN');
  const state = block.getFieldValue('STATE') === 'HIGH' ? 'HIGH' : 'LOW';
  return `pinMode(${pin}, OUTPUT);\ndigitalWrite(${pin}, ${state});\n`;
});

fb('rx_digital_read', (block) => {
  const pin = block.getFieldValue('PIN');
  return [`digitalRead(${pin})`, AOrder.ATOMIC];
});

// Pico ADC pinleri (26/27/28) -> Arduino analog pinleri (A0/A1/A2)
const APIN: Record<string, string> = { '26': 'A0', '27': 'A1', '28': 'A2' };
const aPin = (pin: string): string => APIN[pin] ?? `A${pin}`;

fb('rx_analog_read', (block) => {
  const pin = String(block.getFieldValue('PIN'));
  // ham deger (Uno: 0-1023)
  return [`analogRead(${aPin(pin)})`, AOrder.ATOMIC];
});

fb('rx_pwm_write', (block, g) => {
  const pin = block.getFieldValue('PIN');
  const duty = g.valueToCode(block, 'DUTY', AOrder.NONE) || '0';
  // Pico 0-65535, Arduino 0-255 -> ölçekle
  return `pinMode(${pin}, OUTPUT);\nanalogWrite(${pin}, constrain((int)(${duty}) >> 8, 0, 255));\n`;
});

// ====================================================================
// KONSOL
// ====================================================================

fb('rx_print', (block, g) => {
  g.rxSerialUsed_ = true;
  const text = g.valueToCode(block, 'TEXT', AOrder.NONE) || '""';
  return `Serial.println(${text});\n`;
});

// ====================================================================
// AKTÜATÖRLER
// ====================================================================

fb('rx_led_builtin', (block) => {
  const state = block.getFieldValue('STATE');
  const head = `pinMode(LED_BUILTIN, OUTPUT);\n`;
  if (state === 'ON') return head + `digitalWrite(LED_BUILTIN, HIGH);\n`;
  if (state === 'OFF') return head + `digitalWrite(LED_BUILTIN, LOW);\n`;
  return head + `digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));\n`;
});

fb('rx_led_external', (block) => {
  const pin = block.getFieldValue('PIN');
  const state = block.getFieldValue('STATE');
  const head = `pinMode(${pin}, OUTPUT);\n`;
  if (state === 'ON') return head + `digitalWrite(${pin}, HIGH);\n`;
  if (state === 'OFF') return head + `digitalWrite(${pin}, LOW);\n`;
  return head + `digitalWrite(${pin}, !digitalRead(${pin}));\n`;
});

fb('rx_relay', (block) => {
  const pin = block.getFieldValue('PIN');
  const state = block.getFieldValue('STATE');
  const head = `pinMode(${pin}, OUTPUT);\n`;
  if (state === 'ON') return head + `digitalWrite(${pin}, HIGH);\n`;
  if (state === 'OFF') return head + `digitalWrite(${pin}, LOW);\n`;
  return head + `digitalWrite(${pin}, !digitalRead(${pin}));\n`;
});

// Servo (Servo.h Arduino çekirdeğiyle gelir)
fb('rx_servo_angle', (block, g) => {
  g.includes_['servo'] = '#include <Servo.h>';
  const pin = block.getFieldValue('PIN');
  const angle = g.valueToCode(block, 'ANGLE', AOrder.NONE) || '90';
  // Pin başına tek Servo nesnesi — global olarak tanımla, setup'ta attach et
  const varName = `_rx_servo_${pin}`;
  g.definitions_[`servo_${pin}`] = `Servo ${varName};`;
  // attach'ı tembel yap: ilk kullanımda
  g.definitions_[`servo_attach_flag_${pin}`] = `bool ${varName}_at = false;`;
  return (
    `if (!${varName}_at) { ${varName}.attach(${pin}); ${varName}_at = true; }\n` +
    `${varName}.write(constrain((int)(${angle}), 0, 180));\n`
  );
});

// Buzzer — tone()/noTone() (kütüphane gerekmez)
fb('rx_buzzer_tone', (block, g) => {
  const pin = block.getFieldValue('PIN');
  const freq = g.valueToCode(block, 'FREQ', AOrder.NONE) || '440';
  const dur = g.valueToCode(block, 'DUR', AOrder.NONE) || '200';
  return `tone(${pin}, ${freq}, ${dur});\ndelay(${dur});\n`;
});

fb('rx_buzzer_note', (block, g) => {
  const pin = block.getFieldValue('PIN');
  const note = block.getFieldValue('NOTE');
  const dur = g.valueToCode(block, 'DUR', AOrder.NONE) || '300';
  return `tone(${pin}, ${note}, ${dur});\ndelay(${dur});\n`;
});

fb('rx_buzzer_off', (block) => {
  const pin = block.getFieldValue('PIN');
  return `noTone(${pin});\n`;
});

// ====================================================================
// SENSÖRLER
// ====================================================================

fb('rx_button_pressed', (block) => {
  const pin = block.getFieldValue('PIN');
  // INPUT_PULLUP varsayımı: basılınca LOW
  return [`(pinMode(${pin}, INPUT_PULLUP), digitalRead(${pin}) == LOW)`, AOrder.ATOMIC];
});

fb('rx_ultrasonic_distance', (block, g) => {
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');
  // HC-SR04 ölçüm yardımcısı (kütüphane gerekmez)
  g.definitions_['rx_ultrasonic'] =
    'long rx_ultrasonic(int trig, int echo) {\n' +
    '  pinMode(trig, OUTPUT); pinMode(echo, INPUT);\n' +
    '  digitalWrite(trig, LOW); delayMicroseconds(2);\n' +
    '  digitalWrite(trig, HIGH); delayMicroseconds(10);\n' +
    '  digitalWrite(trig, LOW);\n' +
    '  long d = pulseIn(echo, HIGH, 30000UL);\n' +
    '  if (d == 0) return 999;\n' +
    '  return d / 58;\n' +
    '}';
  return [`rx_ultrasonic(${trig}, ${echo})`, AOrder.ATOMIC];
});

fb('rx_potentiometer', (block) => {
  const pin = String(block.getFieldValue('PIN'));
  // Pico tarafiyla ayni semantik: 0-100
  return [`map(analogRead(${aPin(pin)}), 0, 1023, 0, 100)`, AOrder.ATOMIC];
});

fb('rx_ldr_read', (block) => {
  const pin = String(block.getFieldValue('PIN'));
  // Pico tarafiyla ayni semantik: 0-100
  return [`map(analogRead(${aPin(pin)}), 0, 1023, 0, 100)`, AOrder.ATOMIC];
});

// ====================================================================
// L9110 MOTOR SÜRÜCÜ
// ====================================================================

function ensureL9110(g: Gen) {
  g.definitions_['rx_l9110'] =
    'void rx_l9110(int ia, int ib, int spd, int dir) {\n' +
    '  pinMode(ia, OUTPUT); pinMode(ib, OUTPUT);\n' +
    '  spd = constrain(spd, 0, 100);\n' +
    '  int pwm = map(spd, 0, 100, 0, 255);\n' +
    '  if (dir > 0 && spd > 0) { analogWrite(ia, pwm); digitalWrite(ib, LOW); }\n' +
    '  else if (dir < 0 && spd > 0) { analogWrite(ib, pwm); digitalWrite(ia, LOW); }\n' +
    '  else {\n' +
    '    // DUR = FREN: L9110\'da iki giris HIGH = kisa devre freni.\n' +
    '    // Iki pini LOW yapmak "coast"tur — motor ataletle donmeye devam eder.\n' +
    '    digitalWrite(ia, HIGH); digitalWrite(ib, HIGH);\n' +
    '    delay(80);\n' +
    '    digitalWrite(ia, LOW); digitalWrite(ib, LOW);\n' +
    '  }\n' +
    '}';
}

fb('rx_l9110_motor', (block, g) => {
  ensureL9110(g);
  const ia = block.getFieldValue('IA');
  const ib = block.getFieldValue('IB');
  const dir = block.getFieldValue('DIRECTION') === 'forward' ? 1 : -1;
  const speed = g.valueToCode(block, 'SPEED', AOrder.NONE) || '50';
  return `rx_l9110(${ia}, ${ib}, (int)(${speed}), ${dir});\n`;
});

fb('rx_l9110_stop', (block, g) => {
  ensureL9110(g);
  const ia = block.getFieldValue('IA');
  const ib = block.getFieldValue('IB');
  return `rx_l9110(${ia}, ${ib}, 0, 0);\n`;
});

// ====================================================================
// ENKODER (interrupt tabanlı, 2 enkoder)
// ====================================================================

function ensureEncoder(g: Gen) {
  g.definitions_['rx_enc_vars'] =
    'volatile long _rx_enc1 = 0, _rx_enc2 = 0;\n' +
    'long _rx_enc1_c = 0, _rx_enc2_c = 0;\n' +
    'unsigned long _rx_enc1_t = 0, _rx_enc2_t = 0;\n' +
    'void _rx_enc1_isr() { _rx_enc1++; }\n' +
    'void _rx_enc2_isr() { _rx_enc2++; }';
  g.definitions_['rx_enc_fns'] =
    'void rx_enc_init(int eid, int pin) {\n' +
    '  pinMode(pin, INPUT_PULLUP);\n' +
    '  if (eid == 1) { attachInterrupt(digitalPinToInterrupt(pin), _rx_enc1_isr, RISING); _rx_enc1_t = millis(); }\n' +
    '  else { attachInterrupt(digitalPinToInterrupt(pin), _rx_enc2_isr, RISING); _rx_enc2_t = millis(); }\n' +
    '}\n' +
    'long rx_enc_count(int eid) { return (eid == 1) ? _rx_enc1 : _rx_enc2; }\n' +
    'void rx_enc_reset(int eid) {\n' +
    '  if (eid == 1) { noInterrupts(); _rx_enc1 = 0; interrupts(); _rx_enc1_c = 0; }\n' +
    '  else { noInterrupts(); _rx_enc2 = 0; interrupts(); _rx_enc2_c = 0; }\n' +
    '}\n' +
    'long rx_enc_speed(int eid) {\n' +
    '  unsigned long now = millis();\n' +
    '  long c = rx_enc_count(eid);\n' +
    '  long *last = (eid == 1) ? &_rx_enc1_c : &_rx_enc2_c;\n' +
    '  unsigned long *t = (eid == 1) ? &_rx_enc1_t : &_rx_enc2_t;\n' +
    '  unsigned long dt = now - *t;\n' +
    '  long dc = c - *last;\n' +
    '  *t = now; *last = c;\n' +
    '  if (dt == 0) return 0;\n' +
    '  return (dc * 1000L) / (long)dt;\n' +
    '}';
}

fb('rx_encoder_init', (block, g) => {
  ensureEncoder(g);
  const enc = block.getFieldValue('ENC');
  const pin = block.getFieldValue('PIN');
  return `rx_enc_init(${enc}, ${pin});\n`;
});

fb('rx_encoder_count', (block, g) => {
  ensureEncoder(g);
  const enc = block.getFieldValue('ENC');
  return [`rx_enc_count(${enc})`, AOrder.ATOMIC];
});

fb('rx_encoder_speed', (block, g) => {
  ensureEncoder(g);
  const enc = block.getFieldValue('ENC');
  return [`rx_enc_speed(${enc})`, AOrder.ATOMIC];
});

fb('rx_encoder_reset', (block, g) => {
  ensureEncoder(g);
  const enc = block.getFieldValue('ENC');
  return `rx_enc_reset(${enc});\n`;
});

// ====================================================================
// MATEMATİK (RoboExx özel)
// ====================================================================

fb('rx_map', (block, g) => {
  const value = g.valueToCode(block, 'VALUE', AOrder.NONE) || '0';
  const fromLow = g.valueToCode(block, 'FROM_LOW', AOrder.NONE) || '0';
  const fromHigh = g.valueToCode(block, 'FROM_HIGH', AOrder.NONE) || '100';
  const toLow = g.valueToCode(block, 'TO_LOW', AOrder.NONE) || '0';
  const toHigh = g.valueToCode(block, 'TO_HIGH', AOrder.NONE) || '255';
  return [`map(${value}, ${fromLow}, ${fromHigh}, ${toLow}, ${toHigh})`, AOrder.ATOMIC];
});

fb('rx_abs', (block, g) => {
  const value = g.valueToCode(block, 'VALUE', AOrder.NONE) || '0';
  return [`abs(${value})`, AOrder.ATOMIC];
});

// ====================================================================
// CANLI TUŞ / GAMEPAD (klavye + gamepad — tarayıcıdan USB seri ile)
// ====================================================================
//
// Tarayıcı, yükleme sonrası aynı porta 115200 baud'da bağlı kalır ve her
// 50 ms'de basılı tuş kümesini "\x06<tuşlar>\n" paketiyle gönderir
// (Pico'daki roboexx.py protokolünün aynısı). Aşağıdaki pump bu paketleri
// bloklamadan okur ve basılı/yeni-basıldı durumlarını günceller.

function ensureLiveKeys(g: any): void {
  g.rxLiveKeysUsed_ = true;
  g.definitions_['rx_live_keys'] = [
    '// --- Canlı tuş/gamepad durumu (tarayıcıdan \\x06...\\n paketleri) ---',
    '// Kararlılık önlemleri:',
    '//  * Taşan/bozuk paket ÇÖPE atılır (yarım paket "tuş bırakıldı" sanılmaz)',
    '//  * Tuş, ancak 2 ARDIŞIK geçerli pakette yoksa bırakılmış sayılır',
    '//  * 500 ms paket gelmezse tüm tuşlar bırakılır (güvenli duruş)',
    '//  * rxDelay() bekleme sırasında da paketleri okur (tampon taşmaz)',
    'bool __rxKeyDown[128];',
    'bool __rxKeyOnce[128];',
    'unsigned char __rxKeyMiss[128];',
    'bool __rxKbReading = false;',
    'bool __rxKbOverflow = false;',
    'char __rxKbBuf[24];',
    'unsigned char __rxKbLen = 0;',
    'unsigned long __rxLastPacketMs = 0;',
    '',
    'void __rxApplyPacket() {',
    '  bool now[128] = {false};',
    '  for (unsigned char i = 0; i < __rxKbLen; i++) {',
    '    unsigned char k = (unsigned char)__rxKbBuf[i];',
    '    if (k < 128) now[k] = true;',
    '  }',
    '  for (int k = 0; k < 128; k++) {',
    '    if (now[k]) {',
    '      if (!__rxKeyDown[k]) __rxKeyOnce[k] = true;',
    '      __rxKeyDown[k] = true;',
    '      __rxKeyMiss[k] = 0;',
    '    } else if (__rxKeyDown[k]) {',
    '      // tek paketlik kayıp titreme yaratmasın: 2 ardışık yoklukta bırak',
    '      if (++__rxKeyMiss[k] >= 2) { __rxKeyDown[k] = false; __rxKeyMiss[k] = 0; }',
    '    }',
    '  }',
    '  __rxLastPacketMs = millis();',
    '}',
    '',
    'void __rxPumpKeys() {',
    '  while (Serial.available() > 0) {',
    '    char c = (char)Serial.read();',
    "    if (c == '\\x06') { __rxKbReading = true; __rxKbOverflow = false; __rxKbLen = 0; }",
    '    else if (__rxKbReading) {',
    "      if (c == '\\n') {",
    '        if (!__rxKbOverflow) __rxApplyPacket(); // bozuk paketi uygulama',
    '        __rxKbReading = false;',
    '      } else if (__rxKbLen < sizeof(__rxKbBuf)) {',
    '        __rxKbBuf[__rxKbLen++] = c;',
    '      } else {',
    '        __rxKbOverflow = true;',
    '      }',
    '    }',
    '  }',
    '  // Güvenli duruş: uzun süre paket yoksa (kablo/sekme) tuşları bırak',
    '  if (__rxLastPacketMs != 0 && (millis() - __rxLastPacketMs) > 500) {',
    '    for (int k = 0; k < 128; k++) { __rxKeyDown[k] = false; __rxKeyMiss[k] = 0; }',
    '    __rxLastPacketMs = 0;',
    '  }',
    '}',
    '',
    '// delay() yerine: beklerken de seri paketleri okur, tampon taşmaz.',
    'void rxDelay(unsigned long ms) {',
    '  unsigned long t0 = millis();',
    '  while (millis() - t0 < ms) {',
    '    __rxPumpKeys();',
    '    delayMicroseconds(200);',
    '  }',
    '}',
    '',
    'bool rxTusBasili(char k) {',
    '  __rxPumpKeys();',
    "  if (k >= 'A' && k <= 'Z') k += 32;",
    '  return __rxKeyDown[(unsigned char)k];',
    '}',
    '',
    'bool rxTusBasildi(char k) {',
    '  __rxPumpKeys();',
    "  if (k >= 'A' && k <= 'Z') k += 32;",
    '  unsigned char i = (unsigned char)k;',
    '  if (__rxKeyOnce[i]) { __rxKeyOnce[i] = false; return true; }',
    '  return false;',
    '}',
  ].join('\n');
}

/** Tuş karakterini güvenli C++ char literaline çevir ('w', '\x11', '\x20'…). */
function cKeyLiteral(key: string): string {
  const code = (key || ' ').charCodeAt(0) & 0xff;
  // görünür ASCII harf/rakamsa okunur yaz, değilse hex kaçışı
  if (code >= 0x61 && code <= 0x7a) return `'${String.fromCharCode(code)}'`;
  if (code >= 0x30 && code <= 0x39) return `'${String.fromCharCode(code)}'`;
  return `(char)0x${code.toString(16).padStart(2, '0').toUpperCase()}`;
}

fb('rx_key_pressed', (block, g) => {
  ensureLiveKeys(g);
  const key = String(block.getFieldValue('KEY') ?? ' ');
  return [`rxTusBasili(${cKeyLiteral(key)})`, AOrder.ATOMIC];
});

fb('rx_key_just_pressed', (block, g) => {
  ensureLiveKeys(g);
  const key = String(block.getFieldValue('KEY') ?? ' ');
  return [`rxTusBasildi(${cKeyLiteral(key)})`, AOrder.ATOMIC];
});

fb('rx_gamepad_pressed', (block, g) => {
  ensureLiveKeys(g);
  const btn = String(block.getFieldValue('BTN') ?? '\x20');
  return [`rxTusBasili(${cKeyLiteral(btn)})`, AOrder.ATOMIC];
});

fb('rx_gamepad_just_pressed', (block, g) => {
  ensureLiveKeys(g);
  const btn = String(block.getFieldValue('BTN') ?? '\x20');
  return [`rxTusBasildi(${cKeyLiteral(btn)})`, AOrder.ATOMIC];
});

// ====================================================================
// ARDUİNO'DA DESTEKLENMEYEN ÇEVRE BİRİMLERİ (Pico'ya özel)
// ====================================================================

const STATEMENT_UNSUPPORTED: Record<string, string> = {
  rx_neopixel_init: 'NeoPixel başlat',
  rx_neopixel_set: 'NeoPixel renk',
  rx_neopixel_show: 'NeoPixel göster',
  rx_oled_init: 'OLED başlat',
  rx_oled_clear: 'OLED temizle',
  rx_oled_show: 'OLED göster',
  rx_oled_text: 'OLED yazı',
  rx_oled_shape: 'OLED şekil',
  rx_oled_eyes: 'OLED gözler',
  rx_oled_scroll_text: 'OLED kayan yazı',
  rx_oled_image: 'OLED resim',
  rx_rgb_init: 'RGB başlat',
  rx_rgb_set_all: 'RGB tümü',
  rx_rgb_set_one: 'RGB tek',
  rx_rgb_clear: 'RGB temizle',
  rx_rgb_rainbow: 'RGB gökkuşağı',
  rx_motor_init: 'I2C motor sürücü başlat',
  rx_dc_motor: 'I2C DC motor',
  rx_dc_motor_stop: 'I2C DC motor durdur',
  rx_servo_v2: 'Sürücü servo (I2C)',
  rx_pca9685_init: 'PCA9685 başlat',
  rx_servo_v3: 'PCA9685 servo',
  rx_servo_v3_off: 'PCA9685 servo serbest',
  rx_ir_init: 'IR başlat',
  rx_shtc3_init: 'SHTC3 başlat',
  rx_play_song: 'Şarkı çal',
};

const VALUE_UNSUPPORTED: Record<string, string> = {
  rx_dht11_temp: 'DHT11 sıcaklık',
  rx_dht11_humidity: 'DHT11 nem',
  rx_shtc3_temp: 'SHTC3 sıcaklık',
  rx_shtc3_humidity: 'SHTC3 nem',
  rx_ir_read_code: 'IR kod oku',
  rx_internal_temp: 'Dahili sıcaklık',
};

Object.keys(STATEMENT_UNSUPPORTED).forEach((type) => {
  fb(type, () => unsupportedStatement(STATEMENT_UNSUPPORTED[type]));
});
Object.keys(VALUE_UNSUPPORTED).forEach((type) => {
  fb(type, () => unsupportedValue(VALUE_UNSUPPORTED[type]));
});

// ====================================================================
// BUILT-IN BLOCKLY BLOKLARI — C++ karşılıkları
// ====================================================================

// ---- Mantık ----
fb('logic_compare', (block, g) => {
  const OPS: Record<string, string> = {
    EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=',
  };
  const op = OPS[block.getFieldValue('OP')];
  const order = op === '==' || op === '!=' ? AOrder.EQUALITY : AOrder.RELATIONAL;
  const a = g.valueToCode(block, 'A', order) || '0';
  const b = g.valueToCode(block, 'B', order) || '0';
  return [`${a} ${op} ${b}`, order];
});

fb('logic_operation', (block, g) => {
  const op = block.getFieldValue('OP') === 'AND' ? '&&' : '||';
  const order = op === '&&' ? AOrder.LOGICAL_AND : AOrder.LOGICAL_OR;
  let a = g.valueToCode(block, 'A', order) || 'false';
  let b = g.valueToCode(block, 'B', order) || 'false';
  return [`${a} ${op} ${b}`, order];
});

fb('logic_negate', (block, g) => {
  const arg = g.valueToCode(block, 'BOOL', AOrder.UNARY) || 'true';
  return [`!${arg}`, AOrder.UNARY];
});

fb('logic_boolean', (block) => {
  return [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', AOrder.ATOMIC];
});

fb('logic_ternary', (block, g) => {
  const cond = g.valueToCode(block, 'IF', AOrder.CONDITIONAL) || 'false';
  const thenV = g.valueToCode(block, 'THEN', AOrder.CONDITIONAL) || '0';
  const elseV = g.valueToCode(block, 'ELSE', AOrder.CONDITIONAL) || '0';
  return [`(${cond} ? ${thenV} : ${elseV})`, AOrder.CONDITIONAL];
});

// ---- Akış (built-in) ----
fb('controls_if', (block, g) => {
  let n = 0;
  let code = '';
  do {
    const cond = g.valueToCode(block, 'IF' + n, AOrder.NONE) || 'false';
    const branch = g.statementToCode(block, 'DO' + n);
    code += (n === 0 ? 'if (' : 'else if (') + cond + ') {\n' + branch + '}\n';
    n++;
  } while (block.getInput('IF' + n));
  if (block.getInput('ELSE')) {
    const branch = g.statementToCode(block, 'ELSE');
    code += 'else {\n' + branch + '}\n';
  }
  return code;
});
arduinoGenerator.forBlock['controls_ifelse'] = arduinoGenerator.forBlock['controls_if'];

fb('controls_repeat_ext', (block, g) => {
  const times = g.valueToCode(block, 'TIMES', AOrder.NONE) || '0';
  let branch = g.statementToCode(block, 'DO');
  const i = g.nameDB_.getDistinctName('i', (Blockly as any).Names.NameType.VARIABLE);
  return `for (int ${i} = 0; ${i} < (int)(${times}); ${i}++) {\n${branch}}\n`;
});

fb('controls_whileUntil', (block, g) => {
  const until = block.getFieldValue('MODE') === 'UNTIL';
  let cond = g.valueToCode(block, 'BOOL', until ? AOrder.UNARY : AOrder.NONE) || 'false';
  const branch = g.statementToCode(block, 'DO');
  if (until) cond = '!' + cond;
  return `while (${cond}) {\n${branch}}\n`;
});

fb('controls_for', (block, g) => {
  const varName = g.getVariableName(block.getFieldValue('VAR'));
  rememberVar(g, varName);
  const from = g.valueToCode(block, 'FROM', AOrder.ASSIGNMENT) || '0';
  const to = g.valueToCode(block, 'TO', AOrder.ASSIGNMENT) || '0';
  const by = g.valueToCode(block, 'BY', AOrder.ASSIGNMENT) || '1';
  const branch = g.statementToCode(block, 'DO');
  // değişken global float — döngüde yeniden kullan
  return (
    `for (${varName} = ${from}; ${varName} <= ${to}; ${varName} += ${by}) {\n` +
    branch +
    `}\n`
  );
});

fb('controls_flow_statements', (block) => {
  return block.getFieldValue('FLOW') === 'BREAK' ? 'break;\n' : 'continue;\n';
});

// ---- Matematik (built-in) ----
fb('math_number', (block) => {
  const n = Number(block.getFieldValue('NUM'));
  return [String(n), n < 0 ? AOrder.UNARY : AOrder.ATOMIC];
});

fb('math_arithmetic', (block, g) => {
  const OPS: Record<string, [string, number]> = {
    ADD: [' + ', AOrder.ADD],
    MINUS: [' - ', AOrder.ADD],
    MULTIPLY: [' * ', AOrder.MUL],
    DIVIDE: [' / ', AOrder.MUL],
    POWER: ['', AOrder.NONE],
  };
  const op = block.getFieldValue('OP');
  const [sym, order] = OPS[op];
  const a = g.valueToCode(block, 'A', order) || '0';
  const b = g.valueToCode(block, 'B', order) || '0';
  if (op === 'POWER') {
    return [`pow(${a}, ${b})`, AOrder.ATOMIC];
  }
  return [a + sym + b, order];
});

fb('math_single', (block, g) => {
  const op = block.getFieldValue('OP');
  const arg = g.valueToCode(block, 'NUM', op === 'NEG' ? AOrder.UNARY : AOrder.NONE) || '0';
  switch (op) {
    case 'ROOT': return [`sqrt(${arg})`, AOrder.ATOMIC];
    case 'ABS': return [`abs(${arg})`, AOrder.ATOMIC];
    case 'NEG': return [`-${arg}`, AOrder.UNARY];
    case 'LN': return [`log(${arg})`, AOrder.ATOMIC];
    case 'LOG10': return [`log10(${arg})`, AOrder.ATOMIC];
    case 'EXP': return [`exp(${arg})`, AOrder.ATOMIC];
    case 'POW10': return [`pow(10, ${arg})`, AOrder.ATOMIC];
    default: return [`${arg}`, AOrder.NONE];
  }
});

fb('math_trig', (block, g) => {
  const op = block.getFieldValue('OP');
  const arg = g.valueToCode(block, 'NUM', AOrder.NONE) || '0';
  const rad = `((${arg}) * PI / 180.0)`;
  switch (op) {
    case 'SIN': return [`sin(${rad})`, AOrder.ATOMIC];
    case 'COS': return [`cos(${rad})`, AOrder.ATOMIC];
    case 'TAN': return [`tan(${rad})`, AOrder.ATOMIC];
    case 'ASIN': return [`(asin(${arg}) * 180.0 / PI)`, AOrder.ATOMIC];
    case 'ACOS': return [`(acos(${arg}) * 180.0 / PI)`, AOrder.ATOMIC];
    case 'ATAN': return [`(atan(${arg}) * 180.0 / PI)`, AOrder.ATOMIC];
    default: return ['0', AOrder.ATOMIC];
  }
});

fb('math_constant', (block) => {
  const c = block.getFieldValue('CONSTANT');
  const MAP: Record<string, [string, number]> = {
    PI: ['PI', AOrder.ATOMIC],
    E: ['M_E', AOrder.ATOMIC],
    GOLDEN_RATIO: ['1.61803398875', AOrder.ATOMIC],
    SQRT2: ['sqrt(2)', AOrder.ATOMIC],
    SQRT1_2: ['sqrt(0.5)', AOrder.ATOMIC],
    INFINITY: ['INFINITY', AOrder.ATOMIC],
  };
  return MAP[c] || ['0', AOrder.ATOMIC];
});

fb('math_round', (block, g) => {
  const op = block.getFieldValue('OP');
  const arg = g.valueToCode(block, 'NUM', AOrder.NONE) || '0';
  if (op === 'ROUND') return [`round(${arg})`, AOrder.ATOMIC];
  if (op === 'ROUNDUP') return [`ceil(${arg})`, AOrder.ATOMIC];
  return [`floor(${arg})`, AOrder.ATOMIC];
});

fb('math_modulo', (block, g) => {
  const a = g.valueToCode(block, 'DIVIDEND', AOrder.NONE) || '0';
  const b = g.valueToCode(block, 'DIVISOR', AOrder.NONE) || '1';
  // tamsayı modu — int'e çevir
  return [`((long)(${a}) % (long)(${b}))`, AOrder.ATOMIC];
});

fb('math_constrain', (block, g) => {
  const value = g.valueToCode(block, 'VALUE', AOrder.NONE) || '0';
  const low = g.valueToCode(block, 'LOW', AOrder.NONE) || '0';
  const high = g.valueToCode(block, 'HIGH', AOrder.NONE) || '0';
  return [`constrain(${value}, ${low}, ${high})`, AOrder.ATOMIC];
});

fb('math_random_int', (block, g) => {
  const from = g.valueToCode(block, 'FROM', AOrder.NONE) || '0';
  const to = g.valueToCode(block, 'TO', AOrder.NONE) || '0';
  return [`random(${from}, (${to}) + 1)`, AOrder.ATOMIC];
});

fb('math_random_float', () => {
  return ['(random(0, 10000) / 10000.0)', AOrder.ATOMIC];
});

// ---- Metin (built-in) — Arduino String ----
fb('text', (block, g) => {
  return [g.quote_(block.getFieldValue('TEXT')), AOrder.ATOMIC];
});

fb('text_join', (block, g) => {
  const n = block.itemCount_ ?? 0;
  if (!n) return ['String("")', AOrder.ATOMIC];
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const item = g.valueToCode(block, 'ADD' + i, AOrder.NONE) || '""';
    parts.push(`String(${item})`);
  }
  return [parts.join(' + '), AOrder.ADD];
});

fb('text_length', (block, g) => {
  const text = g.valueToCode(block, 'VALUE', AOrder.NONE) || '""';
  return [`String(${text}).length()`, AOrder.ATOMIC];
});

fb('text_indexOf', (block, g) => {
  const text = g.valueToCode(block, 'VALUE', AOrder.NONE) || '""';
  const find = g.valueToCode(block, 'FIND', AOrder.NONE) || '""';
  // Blockly 1-tabanlı; bulunamazsa 0. Arduino indexOf 0-tabanlı, -1.
  const isFirst = block.getFieldValue('END') === 'FIRST';
  const fn = isFirst ? 'indexOf' : 'lastIndexOf';
  return [`(String(${text}).${fn}(${find}) + 1)`, AOrder.ATOMIC];
});

// ---- Değişkenler ----
fb('variables_get', (block, g) => {
  const name = g.getVariableName(block.getFieldValue('VAR'));
  rememberVar(g, name);
  return [name, AOrder.ATOMIC];
});

fb('variables_set', (block, g) => {
  const name = g.getVariableName(block.getFieldValue('VAR'));
  rememberVar(g, name);
  const value = g.valueToCode(block, 'VALUE', AOrder.ASSIGNMENT) || '0';
  return `${name} = ${value};\n`;
});

fb('math_change', (block, g) => {
  const name = g.getVariableName(block.getFieldValue('VAR'));
  rememberVar(g, name);
  const delta = g.valueToCode(block, 'DELTA', AOrder.ADD) || '0';
  return `${name} += ${delta};\n`;
});

// ---- Fonksiyonlar (procedures) — float dönüş / void ----
function procDef(returnType: 'float' | 'void') {
  return (block: any, g: Gen) => {
    const funcName = g.nameDB_.getName(
      block.getFieldValue('NAME'),
      (Blockly as any).Names.NameType.PROCEDURE
    );
    const args: string[] = (block.getVars() || []).map((v: string) => {
      const nm = g.nameDB_.getName(v, (Blockly as any).Names.NameType.VARIABLE);
      return `float ${nm}`;
    });
    let branch = g.statementToCode(block, 'STACK');
    let returnValue = '';
    if (returnType === 'float') {
      returnValue = g.valueToCode(block, 'RETURN', AOrder.NONE) || '0';
    }
    let code = `${returnType} ${funcName}(${args.join(', ')}) {\n${branch}`;
    if (returnType === 'float') code += `  return ${returnValue};\n`;
    code += '}';
    g.definitions_['rxproc_' + funcName] = code;
    return null;
  };
}
fb('procedures_defnoreturn', procDef('void'));
fb('procedures_defreturn', procDef('float'));

fb('procedures_callnoreturn', (block, g) => {
  const funcName = g.nameDB_.getName(
    block.getFieldValue('NAME'),
    (Blockly as any).Names.NameType.PROCEDURE
  );
  const args: string[] = [];
  const variables = block.getVars ? block.getVars() : [];
  for (let i = 0; i < (block.arguments_ ? block.arguments_.length : variables.length); i++) {
    args.push(g.valueToCode(block, 'ARG' + i, AOrder.NONE) || '0');
  }
  return `${funcName}(${args.join(', ')});\n`;
});

fb('procedures_callreturn', (block, g) => {
  const funcName = g.nameDB_.getName(
    block.getFieldValue('NAME'),
    (Blockly as any).Names.NameType.PROCEDURE
  );
  const args: string[] = [];
  for (let i = 0; i < (block.arguments_ ? block.arguments_.length : 0); i++) {
    args.push(g.valueToCode(block, 'ARG' + i, AOrder.NONE) || '0');
  }
  return [`${funcName}(${args.join(', ')})`, AOrder.ATOMIC];
});

fb('procedures_ifreturn', (block, g) => {
  const cond = g.valueToCode(block, 'CONDITION', AOrder.NONE) || 'false';
  let code = `if (${cond}) {\n`;
  if (block.hasReturnValue_) {
    const value = g.valueToCode(block, 'VALUE', AOrder.NONE) || '0';
    code += `  return ${value};\n`;
  } else {
    code += '  return;\n';
  }
  code += '}\n';
  return code;
});
