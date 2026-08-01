/**
 * Eğitmen Kütüphanesi — kit bazlı HAZIR BLOK PROGRAMLARI.
 *
 * Her dosya, uygulamanın kendi blok tanımlarıyla (rx_* blokları +
 * standart Blockly blokları) kurulmuş tam bir Blockly workspace
 * state'idir. "Ekrana Yükle" bu state'i doğrudan çalışma alanına yükler;
 * öğretmen bir öğrenciye bağlıysa bloklar Live Share üzerinden anında
 * öğrencinin ekranına da düşer.
 *
 * Buradaki builder yardımcıları Blockly 11 serialization formatını üretir:
 *   { blocks: { languageVersion: 0, blocks: [ rx_on_start ... ] } }
 */

// ── Serialization tipleri ────────────────────────────────────────────

interface BlockNode {
  type: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  extraState?: Record<string, unknown>;
  next?: { block: BlockNode };
  x?: number;
  y?: number;
  deletable?: boolean;
}

export interface WorkspaceStateJson {
  blocks: { languageVersion: 0; blocks: BlockNode[] };
}

export interface KitBlockFile {
  id: string;
  /** Dosya adı (panelde görünen başlık) */
  name: string;
  /** Kısa açıklama — ne öğretir / ne yapar */
  desc: string;
  /** Panelde gösterilen adım özeti */
  steps: string[];
  /** Hazır Blockly workspace state'i */
  blocks: WorkspaceStateJson;
}

export interface Kit {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  files: KitBlockFile[];
}

// ── Builder yardımcıları ─────────────────────────────────────────────

/** Sayı shadow'u — value input'lara bağlanır, kullanıcı düzenleyebilir. */
const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });

/** Blok dizisini next zinciri olarak bağlar, ilk bloğu döndürür. */
function chain(list: BlockNode[]): BlockNode {
  if (list.length === 0) throw new Error('chain: boş liste');
  for (let i = list.length - 2; i >= 0; i--) {
    list[i] = { ...list[i], next: { block: list[i + 1] } };
  }
  return list[0];
}

/** rx_on_start kökü + gövde zinciri → tam workspace state. */
function program(body: BlockNode[]): WorkspaceStateJson {
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'rx_on_start',
          x: 40,
          y: 40,
          deletable: false,
          inputs: { DO: { block: chain(body) } },
        },
      ],
    },
  };
}

/** Sürekli tekrarla (while True) — gövde zinciri içine. */
const forever = (body: BlockNode[]): BlockNode => ({
  type: 'rx_forever',
  inputs: { DO: { block: chain(body) } },
});

const waitS = (s: number): BlockNode => ({ type: 'rx_delay_s', inputs: { S: num(s) } });
const waitMs = (ms: number): BlockNode => ({ type: 'rx_delay_ms', inputs: { MS: num(ms) } });

const servo = (pin: number, angle: number): BlockNode => ({
  type: 'rx_servo_angle',
  fields: { PIN: pin },
  inputs: { ANGLE: num(angle) },
});

/** PicoBricks DC motor (I2C sürücü). dir: 'forward' | 'backward' */
const dcMotor = (motorNum: 1 | 2, dir: 'forward' | 'backward', speed: number): BlockNode => ({
  type: 'rx_dc_motor',
  fields: { MOTOR_NUM: String(motorNum), DIRECTION: dir },
  inputs: { SPEED: num(speed) },
});

const dcStopAll = (): BlockNode => ({ type: 'rx_dc_motor_stop', fields: { MOTOR_NUM: 'all' } });

/** L9110 motor — IA/IB pin çifti. */
const l9110 = (ia: number, ib: number, dir: 'forward' | 'backward', speed: number): BlockNode => ({
  type: 'rx_l9110_motor',
  fields: { IA: ia, IB: ib, DIRECTION: dir },
  inputs: { SPEED: num(speed) },
});

const l9110Stop = (ia: number, ib: number): BlockNode => ({
  type: 'rx_l9110_stop',
  fields: { IA: ia, IB: ib },
});

/** Tuş basılı mı? (Boolean değer bloğu). Ok tuşları: '\x11'↑ '\x12'↓ '\x13'← '\x14'→ */
const keyPressed = (key: string) => ({
  block: { type: 'rx_key_pressed', fields: { KEY: key } },
});

/** Ultrasonik mesafe (cm, Number değer bloğu). */
const ultrasonic = (trig: number, echo: number) => ({
  block: { type: 'rx_ultrasonic_distance', fields: { TRIG: trig, ECHO: echo } },
});

/** Karşılaştırma: sol OP sağ (Boolean değer bloğu). OP: 'LT' | 'GT' | 'EQ' ... */
const compare = (
  left: Record<string, unknown>,
  op: 'LT' | 'GT' | 'EQ' | 'LTE' | 'GTE',
  right: Record<string, unknown>
) => ({
  block: { type: 'logic_compare', fields: { OP: op }, inputs: { A: left, B: right } },
});

/** Tek dallı if. */
const ifBlock = (cond: Record<string, unknown>, then: BlockNode[]): BlockNode => ({
  type: 'controls_if',
  inputs: { IF0: cond, DO0: { block: chain(then) } },
});

/** if / else. */
const ifElse = (
  cond: Record<string, unknown>,
  then: BlockNode[],
  otherwise: BlockNode[]
): BlockNode => ({
  type: 'controls_ifelse',
  inputs: {
    IF0: cond,
    DO0: { block: chain(then) },
    ELSE: { block: chain(otherwise) },
  },
});

/** if / else-if... / else zinciri (controls_if mutation'ı ile). */
function ifChain(
  branches: Array<{ cond: Record<string, unknown>; then: BlockNode[] }>,
  otherwise?: BlockNode[]
): BlockNode {
  const inputs: Record<string, unknown> = {};
  branches.forEach((b, i) => {
    inputs[`IF${i}`] = b.cond;
    inputs[`DO${i}`] = { block: chain(b.then) };
  });
  if (otherwise) inputs['ELSE'] = { block: chain(otherwise) };
  const extraState: Record<string, unknown> = {};
  if (branches.length > 1) extraState.elseIfCount = branches.length - 1;
  if (otherwise) extraState.hasElse = true;
  const node: BlockNode = { type: 'controls_if', inputs };
  if (Object.keys(extraState).length > 0) node.extraState = extraState;
  return node;
}

/** N kez tekrarla. */
const repeat = (times: number, body: BlockNode[]): BlockNode => ({
  type: 'controls_repeat_ext',
  inputs: { TIMES: num(times), DO: { block: chain(body) } },
});

/** Konsola metin yazdır. */
const printText = (text: string): BlockNode => ({
  type: 'rx_print',
  inputs: { TEXT: { block: { type: 'text', fields: { TEXT: text } } } },
});

// ── Robot Kol otomatik hareket blokları ─────────────────────────────
type ArmCurve = 'ease' | 'linear' | 'easein' | 'easeout';

const armHome = (ms: number): BlockNode => ({
  type: 'rx_arm_home',
  inputs: { MS: num(ms) },
});

const armPose = (
  t: number, o: number, d: number, g: number, ms: number, curve: ArmCurve = 'ease'
): BlockNode => ({
  type: 'rx_arm_pose',
  fields: { CURVE: curve },
  inputs: { T: num(t), O: num(o), D: num(d), G: num(g), MS: num(ms) },
});

const armAxis = (
  axis: 0 | 1 | 2 | 3, angle: number, ms: number, curve: ArmCurve = 'ease'
): BlockNode => ({
  type: 'rx_arm_axis',
  fields: { AXIS: String(axis), CURVE: curve },
  inputs: { ANGLE: num(angle), MS: num(ms) },
});

const armGripper = (act: 'open' | 'close', ms: number): BlockNode => ({
  type: 'rx_arm_gripper',
  fields: { ACT: act },
  inputs: { MS: num(ms) },
});

const armCubePick = (base: number, low: number): BlockNode => ({
  type: 'rx_arm_cube_pick',
  inputs: { BASE: num(base), LOW: num(low) },
});

const armCubePlace = (base: number, low: number): BlockNode => ({
  type: 'rx_arm_cube_place',
  inputs: { BASE: num(base), LOW: num(low) },
});

const armWave = (times: number): BlockNode => ({
  type: 'rx_arm_wave',
  inputs: { TIMES: num(times) },
});

// ════════════════════════════════════════════════════════════════════
// 🦾 ROBOARM KİTİ — Taban GP0 · Omuz GP1 · Dirsek GP2 · Gripper GP3
// ════════════════════════════════════════════════════════════════════

const TABAN = 0, OMUZ = 1, DIRSEK = 2, GRIPPER = 3;

const ARM_TEST = program([
  printText('RoboArm testi basliyor'),
  // 1) Hepsini merkeze al
  servo(TABAN, 90), waitS(0.4),
  servo(OMUZ, 90), waitS(0.4),
  servo(DIRSEK, 90), waitS(0.4),
  servo(GRIPPER, 90), waitS(0.6),
  // 2) Her ekseni sırayla 60 → 120 → 90 test et
  servo(TABAN, 60), waitS(0.6), servo(TABAN, 120), waitS(0.6), servo(TABAN, 90), waitS(0.6),
  servo(OMUZ, 60), waitS(0.6), servo(OMUZ, 120), waitS(0.6), servo(OMUZ, 90), waitS(0.6),
  servo(DIRSEK, 60), waitS(0.6), servo(DIRSEK, 120), waitS(0.6), servo(DIRSEK, 90), waitS(0.6),
  servo(GRIPPER, 40), waitS(0.6), servo(GRIPPER, 100), waitS(0.6), servo(GRIPPER, 90), waitS(0.4),
  printText('Test bitti! Kol hazir'),
]);

const ARM_KEYBOARD = program([
  // Başlangıç durusu
  servo(TABAN, 90), servo(OMUZ, 90), servo(DIRSEK, 90), servo(GRIPPER, 40),
  printText('A/D taban - W/S omuz - Ok tuslari dirsek - Q ac E kapa'),
  forever([
    ifBlock(keyPressed('a'), [servo(TABAN, 150)]),
    ifBlock(keyPressed('d'), [servo(TABAN, 30)]),
    ifBlock(keyPressed('w'), [servo(OMUZ, 135)]),
    ifBlock(keyPressed('s'), [servo(OMUZ, 45)]),
    ifBlock(keyPressed('\x11'), [servo(DIRSEK, 135)]),   // ↑ yukarı ok
    ifBlock(keyPressed('\x12'), [servo(DIRSEK, 45)]),    // ↓ aşağı ok
    ifBlock(keyPressed('q'), [servo(GRIPPER, 40)]),      // gripper aç
    ifBlock(keyPressed('e'), [servo(GRIPPER, 100)]),     // gripper kapa
    waitMs(30),
  ]),
]);

const ARM_WAVE = program([
  // Merkeze gel
  servo(TABAN, 90), waitS(0.3),
  servo(OMUZ, 90), waitS(0.3),
  servo(DIRSEK, 90), waitS(0.3),
  servo(GRIPPER, 40), waitS(0.5),
  // Kolu kaldır
  servo(OMUZ, 140), waitS(0.8),
  // 3 kere selam salla
  repeat(3, [
    servo(DIRSEK, 130), waitS(0.35),
    servo(DIRSEK, 60), waitS(0.35),
  ]),
  servo(DIRSEK, 90), waitS(0.4),
  // Kolu indir
  servo(OMUZ, 90), waitS(0.5),
  printText('Selam tamamlandi!'),
]);

const ARM_PICK = program([
  printText('Nesne alma gorevi basliyor'),
  // 1) Başlangıç — gripper açık, kol yukarıda
  servo(GRIPPER, 40), waitS(0.3),
  servo(OMUZ, 120), waitS(0.5),
  servo(DIRSEK, 90), waitS(0.4),
  servo(TABAN, 90), waitS(0.8),
  // 2) Nesneye uzan ve kavra
  servo(DIRSEK, 70), waitS(0.5),
  servo(OMUZ, 55), waitS(0.8),
  servo(GRIPPER, 100), waitS(0.6),
  printText('Nesne kavrandi'),
  // 3) Kaldır, tabanı çevir
  servo(OMUZ, 120), waitS(0.8),
  servo(TABAN, 160), waitS(1),
  // 4) İndir ve bırak
  servo(OMUZ, 65), waitS(0.8),
  servo(GRIPPER, 40), waitS(0.5),
  printText('Nesne birakildi'),
  // 5) Merkeze dön
  servo(OMUZ, 120), waitS(0.6),
  servo(TABAN, 90), waitS(0.8),
  servo(OMUZ, 90), waitS(0.4),
  servo(DIRSEK, 90), waitS(0.4),
  printText('Gorev tamamlandi!'),
]);

const ARM_CUBE_AUTO = program([
  printText('Kup gorevi basliyor (otomatik hareket bloklari)'),
  armHome(800),
  // Onumuzden kupu al: yaklas -> yavas alcal -> kavra -> kaldir (tek blok!)
  armCubePick(90, 55),
  printText('Kup kavrandi, tasima...'),
  // Yan tarafa tasi ve birak
  armCubePlace(160, 60),
  printText('Kup birakildi!'),
  armHome(800),
  armWave(2),
  printText('Gorev tamamlandi'),
]);

const ARM_CURVES = program([
  printText('Hareket egrisi deneyi: ayni poz, 4 farkli egri'),
  armHome(700),
  printText('1) DOGRUSAL — sabit hiz'),
  armAxis(1, 140, 900, 'linear'),
  armAxis(1, 90, 900, 'linear'),
  printText('2) S EGRISI — yumusak kalkis ve inis'),
  armAxis(1, 140, 900, 'ease'),
  armAxis(1, 90, 900, 'ease'),
  printText('3) YAVAS BASLA — sona dogru hizlanir'),
  armAxis(1, 140, 900, 'easein'),
  armAxis(1, 90, 900, 'easein'),
  printText('4) YAVAS BITIR — hizli baslar, yumusak durur'),
  armAxis(1, 140, 900, 'easeout'),
  armAxis(1, 90, 900, 'easeout'),
  printText('Fark ettin mi? Kupe inerken YAVAS BITIR en guvenlisi!'),
  armPose(90, 120, 80, 40, 800, 'ease'),
  armGripper('close', 350),
  armGripper('open', 350),
  armHome(700),
]);

// ════════════════════════════════════════════════════════════════════
// 🍓 BERRYBOT KİTİ — DC Motor 1 (sol) / 2 (sağ), ultrasonik Trig GP3 /
// Echo GP2, çizgi sensörleri GP26 / GP27
// ════════════════════════════════════════════════════════════════════

const BERRY_TEST = program([
  printText('Ileri'),
  dcMotor(1, 'forward', 60), dcMotor(2, 'forward', 60), waitS(1.5),
  dcStopAll(), waitS(0.5),
  printText('Geri'),
  dcMotor(1, 'backward', 60), dcMotor(2, 'backward', 60), waitS(1.5),
  dcStopAll(), waitS(0.5),
  printText('Sola donus'),
  dcMotor(1, 'backward', 60), dcMotor(2, 'forward', 60), waitS(1),
  dcStopAll(), waitS(0.5),
  printText('Saga donus'),
  dcMotor(1, 'forward', 60), dcMotor(2, 'backward', 60), waitS(1),
  dcStopAll(),
  printText('Test bitti!'),
]);

const BERRY_KEYBOARD = program([
  printText('WASD ile sur! Tusu birakinca durur'),
  forever([
    ifChain(
      [
        { cond: keyPressed('w'), then: [dcMotor(1, 'forward', 70), dcMotor(2, 'forward', 70)] },
        { cond: keyPressed('s'), then: [dcMotor(1, 'backward', 70), dcMotor(2, 'backward', 70)] },
        { cond: keyPressed('a'), then: [dcMotor(1, 'backward', 55), dcMotor(2, 'forward', 55)] },
        { cond: keyPressed('d'), then: [dcMotor(1, 'forward', 55), dcMotor(2, 'backward', 55)] },
      ],
      [dcStopAll()]
    ),
    waitMs(50),
  ]),
]);

const BERRY_OBSTACLE = program([
  printText('Engelden kacan robot basladi!'),
  forever([
    ifElse(
      compare(ultrasonic(3, 2), 'LT', num(15)),
      [
        // Engel! Dur → geri → sola dön
        dcStopAll(), waitMs(200),
        dcMotor(1, 'backward', 60), dcMotor(2, 'backward', 60), waitS(0.5),
        dcMotor(1, 'backward', 60), dcMotor(2, 'forward', 60), waitS(0.6),
        dcStopAll(), waitMs(100),
      ],
      [
        dcMotor(1, 'forward', 60), dcMotor(2, 'forward', 60),
      ]
    ),
    waitMs(50),
  ]),
]);

/** Çizgi sensörü analog okuma — PIN dropdown STRING ister ('26'|'27'|'28'). */
const analogRead = (pin: 26 | 27 | 28) => ({
  block: { type: 'rx_analog_read', fields: { PIN: String(pin) } },
});

const BERRY_LINE = program([
  printText('Cizgi izleme basladi!'),
  forever([
    ifChain(
      [
        {
          // Çizgi solda kaldı → sola kıvrıl
          cond: compare(analogRead(26), 'GT', num(30000)),
          then: [dcMotor(1, 'forward', 0), dcMotor(2, 'forward', 60)],
        },
        {
          // Çizgi sağda kaldı → sağa kıvrıl
          cond: compare(analogRead(27), 'GT', num(30000)),
          then: [dcMotor(1, 'forward', 60), dcMotor(2, 'forward', 0)],
        },
      ],
      // Çizgi ortada → düz git
      [dcMotor(1, 'forward', 55), dcMotor(2, 'forward', 55)]
    ),
    waitMs(20),
  ]),
]);

// ════════════════════════════════════════════════════════════════════
// 🛡️ TANK KİTİ — L9110: sol palet IA6/IB7 · sağ palet IA8/IB9
// ════════════════════════════════════════════════════════════════════

const SOL_IA = 6, SOL_IB = 7, SAG_IA = 8, SAG_IB = 9;

const tankDur = (): BlockNode[] => [l9110Stop(SOL_IA, SOL_IB), l9110Stop(SAG_IA, SAG_IB)];

const TANK_TEST = program([
  printText('Ileri'),
  l9110(SOL_IA, SOL_IB, 'forward', 60), l9110(SAG_IA, SAG_IB, 'forward', 60), waitS(1.5),
  ...tankDur(), waitS(0.5),
  printText('Geri'),
  l9110(SOL_IA, SOL_IB, 'backward', 60), l9110(SAG_IA, SAG_IB, 'backward', 60), waitS(1.5),
  ...tankDur(), waitS(0.5),
  printText('Yerinde sola donus'),
  l9110(SOL_IA, SOL_IB, 'backward', 60), l9110(SAG_IA, SAG_IB, 'forward', 60), waitS(1),
  ...tankDur(), waitS(0.5),
  printText('Yerinde saga donus'),
  l9110(SOL_IA, SOL_IB, 'forward', 60), l9110(SAG_IA, SAG_IB, 'backward', 60), waitS(1),
  ...tankDur(),
  printText('Test bitti!'),
]);

const TANK_KEYBOARD = program([
  printText('WASD ile tanki sur!'),
  forever([
    ifChain(
      [
        { cond: keyPressed('w'), then: [l9110(SOL_IA, SOL_IB, 'forward', 75), l9110(SAG_IA, SAG_IB, 'forward', 75)] },
        { cond: keyPressed('s'), then: [l9110(SOL_IA, SOL_IB, 'backward', 75), l9110(SAG_IA, SAG_IB, 'backward', 75)] },
        { cond: keyPressed('a'), then: [l9110(SOL_IA, SOL_IB, 'backward', 65), l9110(SAG_IA, SAG_IB, 'forward', 65)] },
        { cond: keyPressed('d'), then: [l9110(SOL_IA, SOL_IB, 'forward', 65), l9110(SAG_IA, SAG_IB, 'backward', 65)] },
      ],
      tankDur()
    ),
    waitMs(50),
  ]),
]);

const TANK_OBSTACLE = program([
  printText('Engelden kacan tank basladi!'),
  forever([
    ifElse(
      compare(ultrasonic(3, 2), 'LT', num(20)),
      [
        ...tankDur(), waitMs(200),
        l9110(SOL_IA, SOL_IB, 'backward', 65), l9110(SAG_IA, SAG_IB, 'backward', 65), waitS(0.6),
        l9110(SOL_IA, SOL_IB, 'forward', 65), l9110(SAG_IA, SAG_IB, 'backward', 65), waitS(0.7),
        ...tankDur(), waitMs(100),
      ],
      [
        l9110(SOL_IA, SOL_IB, 'forward', 65), l9110(SAG_IA, SAG_IB, 'forward', 65),
      ]
    ),
    waitMs(50),
  ]),
]);

// ════════════════════════════════════════════════════════════════════

export const KITS: Kit[] = [
  {
    id: 'roboarm',
    name: 'RoboArm Kiti',
    emoji: '🦾',
    desc: '4 eksenli robot kol · servo GP0–GP3',
    files: [
      {
        id: 'arm-cube-auto', name: '🧊 Küp Görevi (Otomatik Bloklar)',
        desc: 'Tek blokla bilimsel küp al/bırak — yeni 🦾 hareket blokları',
        steps: ['Merkeze al', '"Küpü al" bloğu: yaklaş → yavaş alçal → kavra → kaldır', '"Küpü bırak" bloğu ile 160°\'ye taşı', 'Selam salla'],
        blocks: ARM_CUBE_AUTO,
      },
      {
        id: 'arm-curves', name: '〰 Hareket Eğrisi Deneyi',
        desc: 'Aynı hareket 4 eğriyle: doğrusal · S eğrisi · yavaş başla · yavaş bitir',
        steps: ['Omuz 90↔140 arası 4 farklı eğriyle', 'Farkları gözlemle ve karşılaştır', 'Küpe inişte hangi eğri güvenli? (yavaş bitir!)'],
        blocks: ARM_CURVES,
      },
      {
        id: 'arm-test', name: 'Kol Merkez ve Eksen Testi',
        desc: 'Tüm servoları merkezler, her ekseni sırayla test eder',
        steps: ['4 servoyu 90°\'ye al', 'Her ekseni 60→120→90 test et', 'Gripper aç/kapa testi'],
        blocks: ARM_TEST,
      },
      {
        id: 'arm-keyboard', name: 'Klavye ile Kol Kontrolü',
        desc: 'A/D taban · W/S omuz · ↑/↓ dirsek · Q aç / E kapa',
        steps: ['Kolu merkeze al', 'Sürekli döngüde tuşları kontrol et', 'Basılan tuşa göre servo pozisyonu'],
        blocks: ARM_KEYBOARD,
      },
      {
        id: 'arm-wave', name: 'Selam Ver (Demo Hareket)',
        desc: 'Kol el sallar — tanıtım günleri için demo',
        steps: ['Merkeze gel', 'Omzu kaldır', '3 kez dirsekle salla (tekrar bloğu)', 'Kolu indir'],
        blocks: ARM_WAVE,
      },
      {
        id: 'arm-pick', name: 'Nesne Al ve Bırak',
        desc: 'Kavra → taşı → bırak görev dizisi',
        steps: ['Gripper açık başla', 'Nesneye uzan, kavra', 'Tabanı 160°\'ye çevir', 'Bırak ve merkeze dön'],
        blocks: ARM_PICK,
      },
    ],
  },
  {
    id: 'berrybot',
    name: 'BerryBot Kiti',
    emoji: '🍓',
    desc: '2 tekerlekli robot · DC Motor 1-2',
    files: [
      {
        id: 'berry-test', name: 'Motor Testi',
        desc: 'İleri / geri / dönüşler — teker yönlerini doğrular',
        steps: ['1.5 sn ileri', '1.5 sn geri', 'Sola ve sağa dönüş', 'Dur'],
        blocks: BERRY_TEST,
      },
      {
        id: 'berry-keyboard', name: 'Klavye ile Sürüş (WASD)',
        desc: 'W/A/S/D ile canlı sürüş, tuş bırakınca durur',
        steps: ['Sürekli döngü', 'if/değilse-eğer zinciri: W-S-A-D', 'Hiçbiri basılı değilse: tüm motorları durdur'],
        blocks: BERRY_KEYBOARD,
      },
      {
        id: 'berry-obstacle', name: 'Engelden Kaçan Robot',
        desc: 'Ultrasonik (Trig 3 / Echo 2) engel görünce kaçar',
        steps: ['Mesafe < 15 cm ise', 'Dur → geri gel → sola dön', 'Değilse düz git'],
        blocks: BERRY_OBSTACLE,
      },
      {
        id: 'berry-line', name: 'Çizgi İzleyen Robot',
        desc: 'GP26/GP27 analog sensörlerle siyah çizgi takibi',
        steps: ['Sol sensör çizgide → sola kıvrıl', 'Sağ sensör çizgide → sağa kıvrıl', 'İkisi de değilse düz git'],
        blocks: BERRY_LINE,
      },
    ],
  },
  {
    id: 'tank',
    name: 'Tank Kiti',
    emoji: '🛡️',
    desc: 'Paletli araç · L9110 (sol 6/7 · sağ 8/9)',
    files: [
      {
        id: 'tank-test', name: 'Palet Motor Testi',
        desc: 'İki paletin yönünü doğrular (L9110)',
        steps: ['1.5 sn ileri', '1.5 sn geri', 'Yerinde sola/sağa dönüş', 'Fren'],
        blocks: TANK_TEST,
      },
      {
        id: 'tank-keyboard', name: 'Klavye ile Tank Sürüşü (WASD)',
        desc: 'Yerinde dönüşlü canlı tank sürüşü',
        steps: ['Sürekli döngü', 'W-S ileri/geri, A-D yerinde dönüş', 'Tuş yoksa iki paleti de durdur'],
        blocks: TANK_KEYBOARD,
      },
      {
        id: 'tank-obstacle', name: 'Engelden Kaçan Tank',
        desc: 'Ultrasonik ile engel algıla, geri gel, dön',
        steps: ['Mesafe < 20 cm ise', 'Fren → geri → yerinde dön', 'Değilse tam yol ileri'],
        blocks: TANK_OBSTACLE,
      },
    ],
  },
];
