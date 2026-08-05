/**
 * 🪖 BERRYTANK — LMS GÖREV CEVAP ANAHTARI (36 görev)
 *
 * BerryBot LMS'teki "Çelik Palet Harekâtı" müfredatının blok çözümleri.
 * Her giriş LMS görev numarasıyla eşleşir (G1..G36). Eğitmen Kütüphanesi
 * panelinden "Ekrana Yükle" ile açılır; Live Share ile bir öğrenciye
 * bağlıyken yüklenirse bloklar anında öğrencinin ekranına düşer.
 *
 * Donanım: BerryBot kartı (rx_bb_* blokları) + 2x N20 palet motoru.
 * Kalibrasyon isteyen değerler (hız, eşik, süre) ÖRNEKTİR — brifingde
 * belirtildiği gibi sınıfta ölçülüp güncellenir.
 */

import type { Kit, KitBlockFile, WorkspaceStateJson, BlockNode } from './kits-blocks';

// ── Temel kurucular (kits-blocks ile aynı desenler) ──────────────────

const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });

function chain(list: BlockNode[]): BlockNode {
  if (list.length === 0) throw new Error('chain: boş liste');
  const copy = list.map((b) => ({ ...b }));
  for (let i = copy.length - 2; i >= 0; i--) copy[i].next = { block: copy[i + 1] };
  return copy[0];
}

/** Değişken kaydı: aynı ada hep aynı id. */
const varId = (name: string) => `bt_var_${name}`;
const varsOf = (...names: string[]) => names.map((n) => ({ name: n, id: varId(n) }));

function program(body: BlockNode[], variables?: string[], extraTop?: BlockNode[]): WorkspaceStateJson {
  const top: BlockNode[] = [
    { type: 'rx_on_start', x: 40, y: 40, deletable: false, inputs: { DO: { block: chain(body) } } },
  ];
  if (extraTop) extraTop.forEach((b, i) => top.push({ ...b, x: 640, y: 40 + i * 260 }));
  const ws: WorkspaceStateJson = { blocks: { languageVersion: 0, blocks: top } };
  if (variables && variables.length) ws.variables = varsOf(...variables);
  return ws;
}

// ── Akış / mantık / matematik ────────────────────────────────────────

const forever = (body: BlockNode[]): BlockNode => ({
  type: 'rx_forever', inputs: { DO: { block: chain(body) } },
});
const waitS = (s: number): BlockNode => ({ type: 'rx_delay_s', inputs: { S: num(s) } });
const waitMs = (ms: number): BlockNode => ({ type: 'rx_delay_ms', inputs: { MS: num(ms) } });
/** Süresi bir değer bloğundan gelen bekleme (örn. değişken ya da çarpım). */
const waitSV = (v: object): BlockNode => ({ type: 'rx_delay_s', inputs: { S: v } });
const waitMsV = (v: object): BlockNode => ({ type: 'rx_delay_ms', inputs: { MS: v } });

const repeat = (times: number, body: BlockNode[]): BlockNode => ({
  type: 'controls_repeat_ext', inputs: { TIMES: num(times), DO: { block: chain(body) } },
});
/** Tekrar sayısı değer bloğundan (örn. değişken). */
const repeatV = (timesV: object, body: BlockNode[]): BlockNode => ({
  type: 'controls_repeat_ext', inputs: { TIMES: timesV, DO: { block: chain(body) } },
});
const breakLoop = (): BlockNode => ({ type: 'controls_flow_statements', fields: { FLOW: 'BREAK' } });

const ifBlock = (cond: object, then: BlockNode[]): BlockNode => ({
  type: 'controls_if', inputs: { IF0: cond, DO0: { block: chain(then) } },
});
const ifElse = (cond: object, then: BlockNode[], other: BlockNode[]): BlockNode => ({
  type: 'controls_if',
  extraState: { hasElse: true },
  inputs: { IF0: cond, DO0: { block: chain(then) }, ELSE: { block: chain(other) } },
});
function ifChain(
  branches: Array<{ cond: object; then: BlockNode[] }>,
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
/** koşul SAĞLANANA KADAR tekrarla (until). */
const untilLoop = (cond: object, body: BlockNode[]): BlockNode => ({
  type: 'controls_whileUntil', fields: { MODE: 'UNTIL' },
  inputs: { BOOL: cond, DO: { block: chain(body) } },
});

const cmp = (a: object, op: 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE', b: object) => ({
  block: { type: 'logic_compare', fields: { OP: op }, inputs: { A: a, B: b } },
});
const logicOp = (op: 'AND' | 'OR', a: object, b: object) => ({
  block: { type: 'logic_operation', fields: { OP: op }, inputs: { A: a, B: b } },
});
const arith = (op: 'ADD' | 'MINUS' | 'MULTIPLY' | 'DIVIDE', a: object, b: object) => ({
  block: { type: 'math_arithmetic', fields: { OP: op }, inputs: { A: a, B: b } },
});
const randInt = (from: number, to: number) => ({
  block: { type: 'math_random_int', inputs: { FROM: num(from), TO: num(to) } },
});

// ── Değişkenler ──────────────────────────────────────────────────────

const setVar = (name: string, value: object): BlockNode => ({
  type: 'variables_set', fields: { VAR: { id: varId(name) } }, inputs: { VALUE: value },
});
const getVar = (name: string) => ({ block: { type: 'variables_get', fields: { VAR: { id: varId(name) } } } });
/** ad = ad + n  (sayaç artırma) */
const incVar = (name: string, n = 1): BlockNode =>
  setVar(name, arith('ADD', getVar(name), num(n)));

// ── Fonksiyonlar (prosedürler) ───────────────────────────────────────

const defProc = (name: string, body: BlockNode[]): BlockNode => ({
  type: 'procedures_defnoreturn', fields: { NAME: name },
  inputs: { STACK: { block: chain(body) } },
});
const callProc = (name: string): BlockNode => ({
  type: 'procedures_callnoreturn', extraState: { name },
});

// ── BerryBot donanım blokları ────────────────────────────────────────

const move = (dir: 'FWD' | 'BWD' | 'LEFT' | 'RIGHT', speed: number): BlockNode => ({
  type: 'rx_bb_move', fields: { DIR: dir }, inputs: { SPEED: num(speed) },
});
const moveV = (dir: 'FWD' | 'BWD' | 'LEFT' | 'RIGHT', speedV: object): BlockNode => ({
  type: 'rx_bb_move', fields: { DIR: dir }, inputs: { SPEED: speedV },
});
const moveTime = (dir: 'FWD' | 'BWD' | 'LEFT' | 'RIGHT', speed: number, sec: number): BlockNode => ({
  type: 'rx_bb_move_time', fields: { DIR: dir }, inputs: { SPEED: num(speed), SEC: num(sec) },
});
const drive = (l: number, r: number): BlockNode => ({
  type: 'rx_bb_drive', inputs: { L: num(l), R: num(r) },
});
const driveV = (lV: object, rV: object): BlockNode => ({
  type: 'rx_bb_drive', inputs: { L: lV, R: rV },
});
const stop = (): BlockNode => ({ type: 'rx_bb_stop' });

const icon = (i: string): BlockNode => ({ type: 'rx_bb_matrix_icon', fields: { ICON: i } });
const scroll = (t: string): BlockNode => ({
  type: 'rx_bb_matrix_scroll', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: t } } } },
});
const mxClear = (): BlockNode => ({ type: 'rx_bb_matrix_clear' });
const bar = (n: number): BlockNode => ({ type: 'rx_bb_matrix_bar', inputs: { N: num(n) } });
const barV = (v: object): BlockNode => ({ type: 'rx_bb_matrix_bar', inputs: { N: v } });
const progressV = (v: object): BlockNode => ({ type: 'rx_bb_matrix_progress', inputs: { PCT: v } });

const ringFill = (hex: string): BlockNode => ({ type: 'rx_bb_ring_fill', fields: { COLOUR: hex } });
const ringSet = (index: number, hex: string): BlockNode => ({
  type: 'rx_bb_ring_set', fields: { COLOUR: hex }, inputs: { INDEX: num(index) },
});
const ringOff = (): BlockNode => ({ type: 'rx_bb_ring_off' });
const ringRainbow = (): BlockNode => ({ type: 'rx_bb_ring_rainbow' });
const ringBright = (pct: number): BlockNode => ({ type: 'rx_bb_ring_brightness', inputs: { PCT: num(pct) } });

const horn = (): BlockNode => ({ type: 'rx_bb_horn' });
const tone = (freq: number, ms: number): BlockNode => ({
  type: 'rx_bb_tone', inputs: { FREQ: num(freq), MS: num(ms) },
});
const toneV = (freq: number, msV: object): BlockNode => ({
  type: 'rx_bb_tone', inputs: { FREQ: num(freq), MS: msV },
});
const note = (n: string, ms: number): BlockNode => ({
  type: 'rx_bb_note', fields: { NOTE: n }, inputs: { MS: num(ms) },
});
const quiet = (): BlockNode => ({ type: 'rx_bb_quiet' });

const lineBlack = (side: 'L' | 'R' = 'L') => ({ block: { type: 'rx_bb_line', fields: { SIDE: side } } });
const lineRaw = (side: '0' | '1' = '0') => ({ block: { type: 'rx_bb_line_raw', fields: { SIDE: side } } });  // 0=sol 1=sağ
const lightDiff = () => ({ block: { type: 'rx_bb_light_diff' } });
const brightAt = (th: number) => ({ block: { type: 'rx_bb_bright', inputs: { TH: num(th) } } });
const obstacle = (cm: number) => ({ block: { type: 'rx_bb_obstacle', inputs: { CM: num(cm) } } });
const distanceCm = () => ({ block: { type: 'rx_bb_distance' } });
const irKey = (k: string) => ({ block: { type: 'rx_bb_ir_pressed', fields: { KEY: k } } });
const button = () => ({ block: { type: 'rx_bb_button' } });

// ── Renkler ──────────────────────────────────────────────────────────
const KIRMIZI = '#e53935', YESIL = '#2ecc40', MAVI = '#2979ff',
  SARI = '#f5c518', BEYAZ = '#ffffff', MOR = '#9b59b6';

// ── Ortak parçalar ───────────────────────────────────────────────────

/** Tek sensörle kenar takibi (G13'ün çekirdeği). */
const cizgiAdimi = (hizli = 55, yavas = 35): BlockNode =>
  ifElse(lineBlack('L'), [drive(hizli, yavas)], [drive(yavas, hizli)]);

/** Kalın bant algılama gövdesi: 'siyah' sayacını günceller. */
const siyahSayaci = (): BlockNode[] => [
  ifElse(lineBlack('L'), [incVar('siyah')], [setVar('siyah', num(0))]),
];

// ════════════════════════════════════════════════════════════════════
// OP-1 · EĞİTİM KAMPI
// ════════════════════════════════════════════════════════════════════

const G1 = program([
  scroll('T-07'),
  ringFill(YESIL),
  note('C4', 300), note('E4', 300), note('G4', 300),
  icon('yes'),
]);

const G2 = program([
  icon('triangle'),
  setVar('kisa', num(200)), setVar('uzun', num(600)),
  repeat(3, [toneV(800, getVar('kisa')), waitMs(200)]),
  waitMs(300),
  repeat(3, [toneV(800, getVar('uzun')), waitMs(200)]),
  waitMs(300),
  repeat(3, [toneV(800, getVar('kisa')), waitMs(200)]),
  icon('yes'),
], ['kisa', 'uzun']);

const G3 = program([
  forever([
    ifElse(
      brightAt(600),
      [ringFill(KIRMIZI), icon('no'), tone(600, 150), tone(900, 150)],
      [ringOff(), quiet(), icon('triangle')]
    ),
    waitMs(50),
  ]),
]);

const G4 = program([
  setVar('adim', num(0)),
  icon('no'),
  forever([
    ifChain([
      { cond: logicOp('AND', irKey('3'), cmp(getVar('adim'), 'EQ', num(0))),
        then: [setVar('adim', num(1)), tone(900, 80), bar(1)] },
      { cond: logicOp('AND', irKey('5'), cmp(getVar('adim'), 'EQ', num(1))),
        then: [setVar('adim', num(2)), tone(900, 80), bar(3)] },
      { cond: logicOp('AND', irKey('7'), cmp(getVar('adim'), 'EQ', num(2))),
        then: [setVar('adim', num(3)), icon('yes'), ringFill(YESIL),
               note('C4', 200), note('E4', 200), note('G4', 200), note('C5', 400)] },
      // Yanlış tuş örneği: OK'ye basmak şifreyi sıfırlar.
      // (Tam çözümde her yanlış rakam için benzer bir "değilse eğer" dalı eklenir.)
      { cond: irKey('OK'),
        then: [setVar('adim', num(0)), icon('no'), ringFill(KIRMIZI), tone(300, 400), ringOff()] },
    ]),
    waitMs(30),
  ]),
], ['adim']);

const G5 = program([
  forever([
    ifChain(
      [
        { cond: cmp(lightDiff(), 'GT', num(200)),
          then: [icon('right'), ringOff(), ringSet(2, SARI), ringSet(3, SARI)] },
        { cond: cmp(lightDiff(), 'LT', num(-200)),
          then: [icon('left'), ringOff(), ringSet(0, SARI), ringSet(1, SARI)] },
      ],
      [icon('full'), ringOff()]
    ),
    waitMs(100),
  ]),
]);

const G6 = program([
  icon('triangle'),
  forever([
    ifBlock(button(), [
      {
        type: 'controls_for',
        fields: { VAR: { id: varId('i') } },
        inputs: {
          FROM: num(5), TO: num(1), BY: num(-1),
          DO: {
            block: chain([
              barV(getVar('i')),
              tone(1000, 100),
              waitMsV(arith('MULTIPLY', getVar('i'), num(200))),
            ]),
          },
        },
      } as BlockNode,
      ringFill(KIRMIZI), icon('full'), tone(200, 1000),
      waitS(1), ringOff(), mxClear(), icon('triangle'),
    ]),
    waitMs(30),
  ]),
], ['i']);

// ════════════════════════════════════════════════════════════════════
// OP-2 · ÇELİK PALETLER
// ════════════════════════════════════════════════════════════════════

const G7 = program([
  icon('forward'),
  // Altın değerler robota göre bulunur: sapıyorsa sol/sağ %'yi 1-2 puan oynat.
  drive(60, 60),
  waitS(2),
  stop(),
  horn(), icon('yes'),
]);

const G8 = program([
  // don90: kronometreyle ölçülen 90° dönüş süresi (örnek 0.6 sn)
  setVar('don90', num(0.6)),
  icon('right'), drive(50, -50), waitSV(getVar('don90')), stop(), waitS(0.8),
  icon('right'), drive(50, -50), waitSV(arith('MULTIPLY', getVar('don90'), num(2))), stop(), waitS(0.8),
  icon('right'), drive(50, -50), waitSV(arith('MULTIPLY', getVar('don90'), num(4))), stop(),
  horn(), icon('yes'),
], ['don90']);

const G9 = program(
  [
    icon('forward'),
    repeat(3, [callProc('sag_kacis'), horn(), callProc('sol_kacis'), horn()]),
    stop(), icon('yes'),
  ],
  undefined,
  [
    defProc('sag_kacis', [drive(70, 35), waitS(1)]),
    defProc('sol_kacis', [drive(35, 70), waitS(1)]),
  ]
);

const G10 = program([
  icon('backward'),
  move('BWD', 60),
  repeat(6, [ringFill(KIRMIZI), tone(500, 150), ringOff(), tone(800, 150)]),
  stop(), icon('yes'),
]);

const G11 = program([
  setVar('hiz', num(30)),
  bar(1),
  forever([
    ifChain([
      { cond: irKey('1'), then: [setVar('hiz', num(30)), bar(1), tone(900, 60)] },
      { cond: irKey('2'), then: [setVar('hiz', num(60)), bar(3), tone(900, 60)] },
      { cond: irKey('3'), then: [setVar('hiz', num(90)), bar(5), tone(900, 60)] },
      { cond: irKey('UP'), then: [moveV('FWD', getVar('hiz'))] },
      { cond: irKey('OK'), then: [stop()] },
    ]),
    waitMs(30),
  ]),
], ['hiz']);

const G12 = program([
  icon('smile'),
  forever([
    ifChain(
      [
        { cond: irKey('UP'), then: [move('FWD', 70), icon('forward')] },
        { cond: irKey('DOWN'), then: [move('BWD', 70), icon('backward')] },
        { cond: irKey('LEFT'), then: [move('LEFT', 70), icon('left')] },
        { cond: irKey('RIGHT'), then: [move('RIGHT', 70), icon('right')] },
        { cond: irKey('5'), then: [horn(), icon('heart')] },
      ],
      [stop()]  // KRİTİK: tuş yoksa DUR — bunu unutan tankı duvara gömer!
    ),
    waitMs(30),
  ]),
]);

// ════════════════════════════════════════════════════════════════════
// OP-3 · İKMAL HATTI
// ════════════════════════════════════════════════════════════════════

const G13 = program([
  icon('forward'),
  forever([cizgiAdimi(55, 35)]),
]);

const G14 = program([
  setVar('kayip', num(0)),
  forever([
    ifElse(lineBlack('L'),
      [setVar('kayip', num(0)), drive(55, 35)],
      [incVar('kayip'), drive(35, 55)]
    ),
    ifBlock(cmp(getVar('kayip'), 'GT', num(200)), [
      stop(), ringFill(SARI), horn(),
      untilLoop(lineBlack('L'), [drive(40, -40)]),   // hattı bulana kadar yerinde tara
      stop(), setVar('kayip', num(0)), ringFill(YESIL),
    ]),
  ]),
], ['kayip']);

const G15 = program([
  setVar('siyah', num(0)), setVar('nokta', num(0)),
  forever([
    ...siyahSayaci(),
    ifElse(cmp(getVar('siyah'), 'GT', num(150)),
      [
        incVar('nokta'), stop(),
        repeatV(getVar('nokta'), [tone(1000, 100), waitMs(150)]),
        barV(getVar('nokta')),
        untilLoop({ block: { type: 'logic_negate', inputs: { BOOL: lineBlack('L') } } },
          [drive(45, 45)]),                          // bant bitene kadar yürü (çift sayma yok)
        setVar('siyah', num(0)),
      ],
      [cizgiAdimi(55, 35)]
    ),
  ]),
], ['siyah', 'nokta']);

const G16 = program([
  // Rekor değerleri: hizli/yavas farkıyla oyna, tur sürelerini karşılaştır!
  setVar('hizli', num(75)), setVar('yavas', num(30)),
  icon('forward'),
  forever([
    ifElse(lineBlack('L'),
      [driveV(getVar('hizli'), getVar('yavas'))],
      [driveV(getVar('yavas'), getVar('hizli'))]
    ),
  ]),
], ['hizli', 'yavas']);

const G17 = program([
  forever([
    ifElse(brightAt(600),
      [ringOff(), icon('sunny')],
      [ringFill(BEYAZ), ringBright(100), icon('full')]   // tünel: farlar tam parlak
    ),
    cizgiAdimi(55, 35),
  ]),
]);

const G18 = program([
  setVar('emir', num(0)), setVar('siyah', num(0)), setVar('don90', num(0.6)),
  forever([
    ifBlock(irKey('RIGHT'), [setVar('emir', num(1)), icon('right'), tone(900, 80)]),
    ...siyahSayaci(),
    ifElse(cmp(getVar('siyah'), 'GT', num(150)),
      [
        ifElse(cmp(getVar('emir'), 'EQ', num(1)),
          [stop(), drive(50, -50), waitSV(getVar('don90')), stop(),
           setVar('emir', num(0)), mxClear()],
          [drive(55, 55), waitS(0.3)]                 // emir yok → banttan düz geç
        ),
        setVar('siyah', num(0)),
      ],
      [cizgiAdimi(55, 35)]
    ),
  ]),
], ['emir', 'siyah', 'don90']);

// ════════════════════════════════════════════════════════════════════
// OP-4 · CEPHE HATTI (parkur)
// ════════════════════════════════════════════════════════════════════

const G19 = program([
  // Kalkış geri sayımı
  {
    type: 'controls_for',
    fields: { VAR: { id: varId('i') } },
    inputs: {
      FROM: num(3), TO: num(1), BY: num(-1),
      DO: { block: chain([barV(getVar('i')), tone(800, 120), waitS(1)]) },
    },
  } as BlockNode,
  horn(), icon('forward'),
  forever([cizgiAdimi(55, 35)]),   // göbeğe kadar takip — çember doğal davranıştır!
], ['i']);

const G20 = program([
  setVar('siyah', num(0)), setVar('sayac', num(0)),
  forever([
    ...siyahSayaci(),
    ifElse(cmp(getVar('siyah'), 'GT', num(150)),
      [
        stop(), ringFill(KIRMIZI), icon('no'),
        setVar('sayac', num(0)),
        // 3 sn (30 x 100ms) VEYA buton — hangisi önce gelirse
        untilLoop(
          logicOp('OR', cmp(getVar('sayac'), 'GT', num(30)), button()),
          [waitMs(100), incVar('sayac')]
        ),
        ringFill(YESIL), horn(), icon('yes'),
        drive(55, 55), waitS(0.4),                    // banttan çık
        setVar('siyah', num(0)),
      ],
      [cizgiAdimi(55, 35)]
    ),
  ]),
], ['siyah', 'sayac']);

const G21 = program([
  forever([
    // GÜVENLİK HER ZAMAN İLK KOŞUL!
    ifElse(obstacle(12),
      [
        stop(), icon('no'),
        untilLoop({ block: { type: 'logic_negate', inputs: { BOOL: obstacle(12) } } },
          [ringFill(KIRMIZI), tone(700, 200), ringOff(), waitMs(100)]),
        waitS(1),                                     // emin ol!
        ringFill(YESIL), icon('yes'),
      ],
      [cizgiAdimi(55, 35)]
    ),
    waitMs(20),
  ]),
]);

const G22 = program([
  // 1) KEŞİF: her rengin ham değerini matriste % olarak izle, eşikleri not et.
  // 2) GÖREV: E1/E2/E3 eşiklerini KENDİ ölçtüğün sayılarla değiştir!
  forever([
    progressV(arith('DIVIDE', lineRaw('0'), num(655))),
    ifChain([
      { cond: cmp(lineRaw('0'), 'LT', num(20000)),    // E1: koyu (siyah/gri)
        then: [stop(), ringFill(KIRMIZI), waitS(3)] },
      { cond: cmp(lineRaw('0'), 'LT', num(40000)),    // E2: orta (kırmızı/mavi)
        then: [horn(), icon('heart')] },
      { cond: cmp(lineRaw('0'), 'LT', num(55000)),    // E3: açık (sarı)
        then: [ringFill(SARI), waitMs(200), ringOff()] },
    ]),
    waitMs(100),
  ]),
]);

const G23 = program(
  [
    callProc('yukle_kontrol'),
    callProc('git'),
    callProc('teslim'),
    callProc('don'),
    icon('yes'),
  ],
  ['siyah', 'don90'],
  [
    defProc('yukle_kontrol', [
      icon('triangle'),
      untilLoop(button(), [waitMs(50)]),
      horn(),
    ]),
    defProc('git', [
      setVar('siyah', num(0)),
      // sarsmamak için yavaş vites; ilk kalın bantta teslimat sapağı
      untilLoop(cmp(getVar('siyah'), 'GT', num(150)), [
        ...siyahSayaci(),
        cizgiAdimi(45, 28),
      ]),
      stop(),
    ]),
    defProc('teslim', [
      ringFill(MAVI),
      repeat(3, [tone(1000, 120), waitMs(180)]),
      icon('heart'),
      waitS(5),
      ringOff(),
    ]),
    defProc('don', [
      setVar('don90', num(0.6)),
      drive(50, -50), waitSV(arith('MULTIPLY', getVar('don90'), num(2))), stop(),  // 180°
      untilLoop(button(), [cizgiAdimi(45, 28)]),      // üsse dönüş; butonla bitir
      stop(),
    ]),
  ]
);

const G24 = program([
  icon('forward'),
  forever([
    ifElse(cmp(distanceCm(), 'GT', num(6)),
      [
        move('FWD', 35),
        tone(1200, 60),
        waitMsV(arith('MULTIPLY', distanceCm(), num(15))),  // bip aralığı = mesafe x 15 ms
      ],
      [
        stop(), ringFill(YESIL),
        note('C4', 200), note('G4', 200), note('C5', 400),
        icon('yes'),
        breakLoop(),
      ]
    ),
  ]),
]);

const G25 = program([
  setVar('siyah', num(0)), setVar('bant', num(0)), setVar('sayac', num(0)),
  // Kalkış
  repeat(3, [tone(800, 120), waitS(1)]),
  horn(),
  forever([
    // Öncelik 1: ENGEL (güvenlik)
    ifBlock(obstacle(12), [
      stop(),
      untilLoop({ block: { type: 'logic_negate', inputs: { BOOL: obstacle(12) } } },
        [ringFill(KIRMIZI), tone(700, 200), ringOff()]),
      waitS(1),
    ]),
    // Öncelik 2: TÜNEL (farlar)
    ifElse(brightAt(600), [ringOff()], [ringFill(BEYAZ), ringBright(100)]),
    // Öncelik 3: KALIN BANT — durum sayacına göre davran
    ...siyahSayaci(),
    ifElse(cmp(getVar('siyah'), 'GT', num(150)),
      [
        incVar('bant'),
        ifElse(cmp(getVar('bant'), 'EQ', num(1)),
          [ // 1. bant = DUR-KALK protokolü
            stop(), ringFill(KIRMIZI), setVar('sayac', num(0)),
            untilLoop(logicOp('OR', cmp(getVar('sayac'), 'GT', num(30)), button()),
              [waitMs(100), incVar('sayac')]),
            ringFill(YESIL), horn(),
            drive(55, 55), waitS(0.4),
          ],
          [ // Son bant = BİTİŞ (damalı bölge)
            stop(), ringRainbow(),
            note('C4', 150), note('E4', 150), note('G4', 150), note('C5', 400),
            scroll('ZAFER'),
            breakLoop(),
          ]
        ),
        setVar('siyah', num(0)),
      ],
      [cizgiAdimi(55, 35)]   // Öncelik 4: normal takip
    ),
  ]),
], ['siyah', 'bant', 'sayac']);

// ════════════════════════════════════════════════════════════════════
// OP-5 · KOMANDO SINAVI
// ════════════════════════════════════════════════════════════════════

const G26 = program([
  // Gece modu: G25 ile aynı mimari — farklar: farlar hep açık ama kısık,
  // alarm parlaklığı düşük, eşikler geceye göre YENİDEN ölçülür!
  ringFill(BEYAZ), ringBright(40),
  forever([
    ifBlock(obstacle(12), [
      stop(), ringBright(20),
      untilLoop({ block: { type: 'logic_negate', inputs: { BOOL: obstacle(12) } } },
        [ringFill(SARI), tone(500, 150), ringFill(BEYAZ)]),
      ringBright(40), waitS(1),
    ]),
    cizgiAdimi(50, 32),
  ]),
]);

const G27 = program([
  setVar('c', num(0)),
  forever([
    cizgiAdimi(55, 35),
    ifBlock(irKey('OK'), [
      stop(), icon('triangle'), ringFill(SARI),
      note('A4', 150), note('E4', 300),               // sorgu melodisi
      setVar('c', num(0)),
      // 5 sn cevap penceresi (50 x 100ms) — 3=dost, 9=düşman
      untilLoop(
        logicOp('OR', logicOp('OR', irKey('3'), irKey('9')),
          cmp(getVar('c'), 'GT', num(50))),
        [waitMs(100), incVar('c')]
      ),
      ifElse(irKey('3'),
        [ringFill(YESIL), icon('heart'), horn()],     // DOST
        [ringFill(KIRMIZI), icon('no'),               // DÜŞMAN ya da cevapsız
         moveTime('BWD', 80, 1.5), stop()]
      ),
      waitS(1), ringOff(), mxClear(),
    ]),
  ]),
], ['c']);

const G28 = program([
  setVar('skor', num(0)),
  forever([
    setVar('gizli', randInt(1, 5)),
    mxClear(),
    repeatV(getVar('gizli'), [tone(900, 150), waitMs(300)]),  // sinyal yayını
    icon('triangle'),
    // cevap bekle: herhangi bir rakam
    untilLoop(
      logicOp('OR',
        logicOp('OR', irKey('1'), irKey('2')),
        logicOp('OR', irKey('3'), logicOp('OR', irKey('4'), irKey('5')))),
      [waitMs(30)]
    ),
    setVar('cevap', num(0)),
    ifChain([
      { cond: irKey('1'), then: [setVar('cevap', num(1))] },
      { cond: irKey('2'), then: [setVar('cevap', num(2))] },
      { cond: irKey('3'), then: [setVar('cevap', num(3))] },
      { cond: irKey('4'), then: [setVar('cevap', num(4))] },
      { cond: irKey('5'), then: [setVar('cevap', num(5))] },
    ]),
    ifElse(cmp(getVar('cevap'), 'EQ', getVar('gizli')),
      [icon('yes'), ringFill(YESIL), note('C5', 200), incVar('skor'),
       progressV(arith('MULTIPLY', getVar('skor'), num(20)))],
      [icon('no'), ringFill(KIRMIZI), tone(300, 400), barV(getVar('gizli'))]
    ),
    waitS(1.5), ringOff(),
    ifBlock(cmp(getVar('skor'), 'GTE', num(5)), [
      scroll('KOD KIRICI'),
      note('C4', 150), note('E4', 150), note('G4', 150), note('C5', 400),
      breakLoop(),
    ]),
  ]),
], ['skor', 'gizli', 'cevap']);

const G29 = program([
  setVar('tur', num(0)), setVar('siyah', num(0)),
  forever([
    // Nöbette gafil avlanmak yok: engel güvenliği hep aktif
    ifBlock(obstacle(12), [
      stop(),
      untilLoop({ block: { type: 'logic_negate', inputs: { BOOL: obstacle(12) } } },
        [ringFill(KIRMIZI), tone(700, 200), ringOff()]),
      waitS(1),
    ]),
    ...siyahSayaci(),
    ifElse(cmp(getVar('siyah'), 'GT', num(150)),
      [
        incVar('tur'),
        progressV(arith('MULTIPLY', getVar('tur'), num(20))),
        note('G4', 120), note('C5', 200),             // rapor melodisi
        ifChain([
          { cond: cmp(getVar('tur'), 'EQ', num(1)), then: [ringFill(MAVI)] },
          { cond: cmp(getVar('tur'), 'EQ', num(2)), then: [ringFill(SARI)] },
          { cond: cmp(getVar('tur'), 'EQ', num(3)), then: [ringFill(MOR)] },
          { cond: cmp(getVar('tur'), 'EQ', num(4)), then: [ringFill(BEYAZ)] },
        ]),
        ifBlock(cmp(getVar('tur'), 'GTE', num(5)), [
          stop(),
          note('C4', 150), note('E4', 150), note('G4', 150), note('C5', 400),
          scroll('NOBET TAMAM'),
          breakLoop(),
        ]),
        drive(55, 55), waitS(0.4),                    // banttan çık (çift sayma yok)
        setVar('siyah', num(0)),
      ],
      [cizgiAdimi(55, 35)]
    ),
  ]),
], ['tur', 'siyah']);

const G30 = program([
  // KURMAY SINAVI: sabit cevap YOK — emirler canlı gelir.
  // Bu iskelet sınav başlangıcı içindir; öğrenci emre göre doldurur.
  scroll('KURMAY SINAVI'),
  icon('triangle'),
  horn(),
  // Değerlendirme: doğru blok seçimi + çalışan çözüm + SÖZLÜ anlatım!
]);

// ════════════════════════════════════════════════════════════════════
// OP-6 · KARTAL GÖZÜ (ESP32-CAM)
// ════════════════════════════════════════════════════════════════════

const G31 = program([
  // Donanım görevi: kamera montajı + WiFi yayını. Kod: montaj test sinyali.
  scroll('KARTAL GOZU'),
  icon('bluetooth'),
  repeat(2, [tone(1000, 100), waitMs(150)]),
  // Kontrol listesi: goruntu akiyor mu? aci dogru mu? kablo palete degiyor mu?
]);

const G32 = G12;   // Kör Uçuş: 12. görevin kumanda programı — sınanan şey pilotluk!

const G33 = program([
  // Foto İstihbarat: kumanda sürüşü + hedef önünde OK = "çekim molası" işareti
  forever([
    ifChain(
      [
        { cond: irKey('UP'), then: [move('FWD', 60)] },
        { cond: irKey('DOWN'), then: [move('BWD', 60)] },
        { cond: irKey('LEFT'), then: [move('LEFT', 60)] },
        { cond: irKey('RIGHT'), then: [move('RIGHT', 60)] },
        { cond: irKey('OK'), then: [stop(), icon('full'), tone(1200, 100), waitS(2), mxClear()] },
      ],
      [stop()]
    ),
    waitMs(30),
  ]),
]);

const G34 = program([
  // Renk Kilidi: FPV ile doğru bölgeye sür, kumandayla rengi bildir
  icon('triangle'),
  forever([
    ifChain([
      { cond: irKey('1'), then: [ringFill(KIRMIZI), horn(), icon('yes')] },
      { cond: irKey('2'), then: [ringFill(MAVI), horn(), icon('yes')] },
      { cond: irKey('3'), then: [ringFill(SARI), horn(), icon('yes')] },
      { cond: irKey('OK'), then: [ringOff(), mxClear()] },
    ]),
    waitMs(30),
  ]),
]);

const G35 = program([
  // Hedef takibi pilotluk; yazılım = mesafe bandı göstergesi (hedef 20-40 cm)
  forever([
    progressV(arith('MULTIPLY', distanceCm(), num(2))),   // 0-50 cm → %0-100
    ifBlock(cmp(distanceCm(), 'LT', num(20)), [tone(600, 80)]),  // çok yakın uyarısı
    waitMs(100),
  ]),
]);

const G36 = program([
  setVar('mod', num(0)),   // 0 = OTONOM, 1 = MANUEL
  forever([
    ifBlock(irKey('OK'), [setVar('mod', num(1)), stop(), icon('no'), ringFill(SARI)]),
    ifBlock(irKey('3'), [setVar('mod', num(0)), icon('forward'), ringFill(YESIL)]),
    ifElse(cmp(getVar('mod'), 'EQ', num(0)),
      [ // OTONOM: çizgi takibi + engel güvenliği
        ifElse(obstacle(12),
          [stop(), ringFill(KIRMIZI), tone(700, 150)],
          [cizgiAdimi(55, 35)]
        ),
      ],
      [ // MANUEL: kumanda sürüşü
        ifChain(
          [
            { cond: irKey('UP'), then: [move('FWD', 60)] },
            { cond: irKey('DOWN'), then: [move('BWD', 60)] },
            { cond: irKey('LEFT'), then: [move('LEFT', 60)] },
            { cond: irKey('RIGHT'), then: [move('RIGHT', 60)] },
          ],
          [stop()]
        ),
      ]
    ),
    waitMs(30),
  ]),
], ['mod']);

// ════════════════════════════════════════════════════════════════════
// KÜTÜPHANE GİRDİLERİ
// ════════════════════════════════════════════════════════════════════

const F = (id: number, name: string, desc: string, steps: string[], blocks: WorkspaceStateJson): KitBlockFile =>
  ({ id: `bt-g${id}`, name: `G${id} · ${name}`, desc, steps, blocks });

export const BERRYTANK_SOLUTIONS: Kit = {
  id: 'berrytank-lms',
  name: 'RoboPANZER — Görev Cevapları',
  emoji: '🪖',
  desc: 'LMS "Çelik Palet Harekâtı" 36 görevin blok çözümleri (rx_bb_*)',
  files: [
    // OP-1
    F(1, 'Künye', 'Kayan yazı + yeşil halka + selam melodisi (sıralı komutlar)',
      ['Ekranda kaydır "T-07" (asker koduyla değiştir)', 'Halka yeşil', 'Do-Mi-Sol 300ms'], G1),
    F(2, 'Mors Telsizi', 'kisa/uzun DEĞİŞKENLERİYLE SOS — sayılar elle yazılmaz',
      ['kisa=200, uzun=600', '3x kısa → 3x uzun → 3x kısa (tekrar bloğu)', 'Süreler hep değişkenden'], G2),
    F(3, 'Karartma Protokolü', 'Işık sensörü + eğer/değilse: karanlıkta sessiz, ışıkta siren',
      ['Sonsuz döngü', 'Aydınlıksa: kırmızı + siren + ✗', 'Değilse: söndür + sustur + △', 'Eşiği (600) sınıfa göre ayarla'], G3),
    F(4, 'Şifreli Emir', 'adim değişkeniyle 3-5-7 sırası; VE operatörü + durum tutma',
      ['adim=0 başla', '3 doğruysa adim=1, 5 → 2, 7 → şifre çözüldü', 'OK = sıfırla (yanlış tuş örneği)', 'Tam çözümde her yanlış rakama dal eklenir'], G4),
    F(5, 'Radar İstasyonu', 'ışık farkı (sağ-sol) karşılaştırması → ok + sarı LED',
      ['fark > 200 → sağ ok, sağ LEDler', 'fark < -200 → sol ok, sol LEDler', 'değilse ■ + söndür'], G5),
    F(6, 'Sabotaj Sayacı', 'Butonla 5→1 geri sayım; bekleme = i x 200 ms (hızlanan tempo)',
      ['Buton basılınca for döngüsü 5→1', 'Çubuk + bip her adımda', 'Bekleme süresi çarpma bloğundan', 'Sonda patlama efekti'], G6),
    // OP-2
    F(7, 'İlk Ateşleme', 'sür 60/60 + 2sn + dur — sapmaya göre trim',
      ['İki palete %60', 'Sapıyorsa bir tarafı 1-2 puan oynat', 'Altın değerleri not ettir!'], G7),
    F(8, 'Manevra: Tank Dönüşü', 'don90 değişkeni; 180=don90x2, 360=x4 (çarpma bloğu)',
      ['sür 50/-50 = yerinde dönüş', 'don90 kronometreyle ölçülür', 'Süreler hep don90 x N'], G8),
    F(9, 'Mayın Slalomu', 'sag_kacis / sol_kacis FONKSİYONLARI + tekrar 3',
      ['İki fonksiyon tanımla (sağda ayrı bloklar)', 'Ana program: tekrar 3 [sağ, korna, sol, korna]', '12 blok yerine 6 — DRY!'], G9),
    F(10, 'Taktik Geri Çekilme', 'Geri git bloklamaz → motor dönerken flaş+siren döngüsü',
      ['geri git %60 (arka planda döner)', 'tekrar 6: kırmızı+bip / söndür+bip', 'dur + onay'], G10),
    F(11, 'Vites Kademeleri', 'hiz değişkeni: 1/2/3 tuşları 30/60/90; sürüş hızı değişkenden',
      ['Tuş → hiz + çubuk göstergesi + bip', '⬆ = ileri git hız%=hiz', 'OK = dur', 'Sürerken vites değişebilir!'], G11),
    F(12, 'Uzaktan Komuta', 'Tam kumanda + KRİTİK "değilse dur" dalı',
      ['⬆⬇⬅➡ hareket + yön ikonu', '5 = korna + kalp', 'Hiçbiri değilse DUR (güvenlik!)'], G12),
    // OP-3
    F(13, 'Hatta Bağlan', 'Tek sensörle KENAR takibi (bang-bang)',
      ['Siyahsa: sür 55/35 (sağa kavis)', 'Beyazsa: sür 35/55 (sola kavis)', 'Salınım çoksa hız farkını azalt'], G13),
    F(14, 'Hat Koptu!', 'kayip sayacı + until döngüsüyle arama manevrası',
      ['Beyazda sayaç +1, siyahta sıfır', 'kayip > 200 → dur + sarı + korna', 'Siyah bulunana kadar yerinde dön', 'Bulunca yeşil + devam'], G14),
    F(15, 'Kontrol Noktası Sayacı', 'siyah + nokta sayaçları; nokta kadar bip (tekrar N)',
      ['Kalın bant = siyah > 150', 'nokta+1, dur, nokta kez bip', 'Çubukta nokta sayısı', 'Bant bitene kadar yürü (çift sayma yok)'], G15),
    F(16, 'Ekspres Konvoy', 'hizli/yavas değişkenleriyle merkezi hız ayarı — optimizasyon',
      ['Takip kodu değişkenlerden beslenir', '3 denemede değerleri değiştir', 'Süreleri karşılaştır, kazananı açıklat'], G16),
    F(17, 'Tünel Geçişi', 'Aynı döngüde İKİ karar: ışık kontrolü + çizgi takibi',
      ['Karanlıksa: beyaz far %100 + ■', 'Aydınlıksa: söndür + ☀', 'Ardından çizgi adımı'], G17),
    F(18, 'Rota Değişim Emri', 'emir BAYRAĞI: komut saklanır, kalın bantta uygulanır',
      ['➡ tuşu → emir=1 + ok + bip (dönmez!)', 'Kalın bantta: emir=1 ise 90° dön + sıfırla', 'Emir yoksa düz geç'], G18),
    // OP-4
    F(19, 'Konvoy Kalkışı', '3-2-1 geri sayım (for) + korna + takip; göbekte çember normal',
      ['for 3→1: çubuk + bip + 1sn', 'Korna + ileri ikonu', 'Çizgi takibi göbeğe kadar'], G19),
    F(20, 'DUR-KALK Noktası', 'until( 3sn VEYA buton ) — iki tetikleyici birden',
      ['Kalın bantta dur + kırmızı + ✗', 'sayac>30 VEYA buton olana kadar bekle', 'Yeşil + korna + banttan çık'], G20),
    F(21, 'Mayınlı Bölge', 'Engel dalı HER ZAMAN İLK — güvenlik önceliği',
      ['engel < 12cm → dur + flaş + siren', 'Engel kalkana kadar bekle + 1sn doğrula', 'Değilse çizgi takibi'], G21),
    F(22, 'Renk İstihbaratı', 'Ham değer + % göstergesi + 3 eşikli sınıflandırma',
      ['Matris % = ham/655 (canlı keşif)', 'E1/E2/E3 eşiklerini ÖLÇÜP değiştir!', 'Koyu=dur · orta=korna+kalp · açık=sarı flaş'], G22),
    F(23, 'Cephane Teslimatı', '4 FONKSİYON: yukle_kontrol → git → teslim → don. Ana program 4 satır!',
      ['yukle: butonu bekle + korna', 'git: yavaş takip, ilk kalın bantta dur', 'teslim: mavi + 3 bip + kalp + 5sn', 'don: 180° + dönüş'], G23),
    F(24, 'Park Manevrası', 'Bip aralığı = mesafe x 15 ms (orantısal!) + break',
      ['mesafe > 6 → yavaş ileri + bip + mesafe*15ms bekle', 'mesafe ≤ 6 → dur + yeşil + marş', 'Döngüden çık'], G24),
    F(25, 'TAM TUR HAREKÂTI', 'Durum makinesi: engel → farlar → bant sayacı → takip; bitişte ZAFER',
      ['Öncelik 1: engel güvenliği', 'Öncelik 2: tünel farları', 'bant=1: DUR-KALK protokolü', 'Son bant: gökkuşağı + marş + ZAFER + dur'], G25),
    // OP-5
    F(26, 'Gece Harekâtı', 'Aynı mimari, gece parametreleri: far %40, kısık alarm',
      ['Farlar hep açık ama %40', 'Alarmlar loş + kısık', 'Eşikleri GECEYE göre yeniden ölç!'], G26),
    F(27, 'Dost mu Düşman mı?', 'OK = kesme; 5sn zaman aşımı; 3 dallı karar',
      ['OK → dur + △ + sarı + sorgu sesi', 'until(3 VEYA 9 VEYA 5sn)', '3=dost: yeşil+kalp+korna', '9/cevapsız=düşman: kırmızı + tam geri'], G27),
    F(28, 'Kod Kırıcı', 'rastgele 1-5 + o kadar bip; cevap=gizli karşılaştırması; skor x 20 göstergesi',
      ['gizli = rastgele(1,5), gizli kez bip', 'Rakam bekle, cevap değişkenine yaz', 'Doğru: skor+1 + %dolum · Yanlış: doğruyu çubukla göster', '5 doğruda zafer + çık'], G28),
    F(29, 'Devriye Modu', 'tur sayacı + tur başına renk + 5 turda nöbet devri; engel hep aktif',
      ['Her kalın bantta tur+1 + %dolum + rapor sesi', 'Tur rengi: mavi/sarı/mor/beyaz', 'tur≥5: dur + marş + NOBET TAMAM'], G29),
    F(30, 'KURMAY SINAVI', 'Sabit cevap YOK — canlı emirler. Bu iskelet sınav açılışıdır.',
      ['Eğitmen 3 emir seçer', 'Ölçüt: doğru blok + çalışan çözüm + SÖZLÜ anlatım', 'Anlatamayan terfi alamaz!'], G30),
    // OP-6
    F(31, 'Kartal Gözü: Montaj', 'Donanım görevi — kod sadece montaj test sinyali',
      ['Kamerayı taretine tak, kabloları şemaya göre bağla', 'WiFi yayınını tablette aç', 'Açı: hem zemin hem 1m ilerisi kadrajda', 'Test sinyali: yazı + 2 bip'], G31),
    F(32, 'Kör Uçuş (FPV)', 'Kod = G12 kumanda programı. Sınanan şey PİLOTLUK!',
      ['Tanka sırtın dönük, sadece ekrandan bak', 'Gecikmeyi öğren: komutu erken ver', 'Çarpma = 5sn ceza'], G32),
    F(33, 'Foto İstihbarat', 'Kumanda sürüşü + OK = çekim molası işareti',
      ['5 hedefe FPV ile git', 'OK: dur + ■ + bip + 2sn poz', 'Fotoğraf net + hedef merkezde', 'Künyeye pusula yönü yaz'], G33),
    F(34, 'Renk Kilidi', 'FPV ile doğru renk bölgesine sür; kumandayla rengi bildir',
      ['1=kırmızı 2=mavi 3=sarı → halka o renk + korna', 'Eğitmen doğrular', 'OK = temizle'], G34),
    F(35, 'Hedef Takibi', 'Pilotaj + destek yazılımı: mesafe bandı göstergesi (20-40cm)',
      ['Matris % = mesafe x 2', 'mesafe < 20 → çok yakın bip', 'Hedefi 2 dk kesintisiz izle'], G35),
    F(36, 'OTONOM KEŞİF (Final)', 'mod değişkeni: 0=otonom (çizgi+engel), 1=manuel (kumanda). OK/3 ile geçiş',
      ['OK → manuel + dur + sarı', '3 → otonom + yeşil', 'Otonom: çizgi takibi + engel güvenliği', 'Az müdahale = yüksek puan. TERFİ! 🎖️'], G36),
  ],
};
