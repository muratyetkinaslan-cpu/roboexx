/**
 * 🦾 ROBOARM — 20 GÖREVLİK EĞİTİM SETİ
 *
 * NOT: Bütün görevler NORMAL SERVO BLOKLARIYLA yazılmıştır
 * (servo pin D4/D5/D6/D7 + bekle). Öğrencinin kendi görevlerinde
 * kullandığı bloklarla birebir aynı — kütüphaneden açtığı örnek ile
 * kendi yazacağı kod arasında fark yok.
 *
 * Kiti satın alan kişinin sırayla çalışabileceği, kolaydan zora 20 görev.
 * Her görev "Ekrana Yükle" ile hazır blok programı olarak açılır; Robot Kol
 * panelindeki ▶ "Simülasyonda çalıştır" ile KART OLMADAN denenir, kart
 * bağlıysa (Pico veya Arduino canlı sketch) gerçek kol da aynı anda oynar.
 *
 * Açı/süre değerleri sim geometrisine göre seçilmiş ÖRNEKLERDİR — gerçek
 * kolda küp boyutuna göre panelin Tıkla-Git (IK) özelliğiyle kalibre edilir.
 */
import type { KitBlockFile, WorkspaceStateJson } from './kits-blocks';

// ── yerel kurucular (kits-blocks desenleriyle birebir) ───────────────

type BlockNode = {
  type: string;
  x?: number; y?: number;
  deletable?: boolean;
  fields?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  next?: { block: BlockNode };
  extraState?: Record<string, unknown>;
};

const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });

function chain(list: BlockNode[]): BlockNode {
  // Kurucular çok bloklu zincir döndürebildiği için her öğenin SONUNA
  // bağlanır; yoksa çok bloklu bir öğenin kuyruğu düşer.
  const copy = list.map((b) => ({ ...b }));
  for (let i = 0; i < copy.length - 1; i++) {
    let kuyruk = copy[i];
    while (kuyruk.next) kuyruk = kuyruk.next.block;
    kuyruk.next = { block: copy[i + 1] };
  }
  return copy[0];
}

const varId = (name: string) => `arm_var_${name}`;

function program(body: BlockNode[], variables?: string[]): WorkspaceStateJson {
  const ws: WorkspaceStateJson = {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'rx_on_start', x: 40, y: 40, deletable: false,
        inputs: { DO: { block: chain(body) } },
      }],
    },
  };
  if (variables?.length) ws.variables = variables.map((n) => ({ name: n, id: varId(n) }));
  return ws;
}

// akış / zaman
const forever = (body: BlockNode[]): BlockNode => ({ type: 'rx_forever', inputs: { DO: { block: chain(body) } } });
const waitMs = (ms: number): BlockNode => ({ type: 'rx_delay_ms', inputs: { MS: num(ms) } });
const waitS = (s: number): BlockNode => ({ type: 'rx_delay_s', inputs: { S: num(s) } });
const repeat = (times: number, body: BlockNode[]): BlockNode => ({
  type: 'controls_repeat_ext', inputs: { TIMES: num(times), DO: { block: chain(body) } },
});
const ifBlock = (cond: object, then: BlockNode[]): BlockNode => ({
  type: 'controls_if', inputs: { IF0: cond, DO0: { block: chain(then) } },
});
const printText = (t: string): BlockNode => ({
  type: 'rx_print', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: t } } } },
});
const keyPressed = (key: string) => ({ block: { type: 'rx_key_pressed', fields: { KEY: key } } });

// değişkenler
const setVar = (name: string, value: object): BlockNode => ({
  type: 'variables_set', fields: { VAR: { id: varId(name) } }, inputs: { VALUE: value },
});
const getVar = (name: string) => ({ block: { type: 'variables_get', fields: { VAR: { id: varId(name) } } } });
const changeVar = (name: string, by: number): BlockNode => ({
  type: 'math_change', fields: { VAR: { id: varId(name) } }, inputs: { DELTA: num(by) },
});

// ── 🦾 KOL HAREKETLERİ — normal servo bloklarıyla ────────────────────
//
// Eskiden bu görevler `rx_arm_*` (armGit / armEksen / armTut) bloklarını
// kullanıyordu. Ama müfredatın 71 görevi ve gerçek Arduino kurulumu
// DOĞRUDAN servo bloklarıyla çalışıyor:
//
//   D4 taban · D5 omuz · D6 dirsek · D7 tutucu
//
// Öğrenci kütüphaneden görevi açıp sonra kendi görevini yazınca iki
// farklı blok setiyle karşılaşmasın diye bütün görevler normal servo
// bloklarına çevrildi. Cevap anahtarı artık öğrencinin yazacağı kodun
// aynısı.
type Curve = 'ease' | 'linear' | 'easein' | 'easeout';

/** Eklem sırası → Arduino pini. */
const EKSEN_PIN = [4, 5, 6, 7] as const;

/** Tek servo komutu: "servo pin D5 açı 120". */
const servo = (axis: 0 | 1 | 2 | 3, angle: number): BlockNode => ({
  type: 'rx_servo_angle', fields: { PIN: EKSEN_PIN[axis] }, inputs: { ANGLE: num(angle) },
});
/** Açısı değişkenden/ifadeden gelen servo komutu. */
const servoV = (axis: 0 | 1 | 2 | 3, angleV: object): BlockNode => ({
  type: 'rx_servo_angle', fields: { PIN: EKSEN_PIN[axis] }, inputs: { ANGLE: angleV },
});
/** "bekle N ms" — servonun hedefe varması için gereken süre. */
const wait = (ms: number): BlockNode => ({ type: 'rx_delay_ms', inputs: { MS: num(ms) } });

const armHome = (ms: number): BlockNode => chain([
  servo(0, 90), servo(1, 90), servo(2, 90), servo(3, 40), wait(ms),
]);

const armAxis = (axis: 0 | 1 | 2 | 3, angle: number, ms: number, _curve: Curve = 'ease'): BlockNode =>
  chain([servo(axis, angle), wait(ms)]);

/** Açısı değişkenden gelen eksen hareketi. */
const armAxisV = (axis: 0 | 1 | 2 | 3, angleV: object, ms: number, _curve: Curve = 'ease'): BlockNode =>
  chain([servoV(axis, angleV), wait(ms)]);

/** Dört ekseni birlikte sür. -1 = "bu ekseni değiştirme". */
const armPose = (t: number, o: number, d: number, g: number, ms: number, _curve: Curve = 'ease'): BlockNode => {
  const adimlar: BlockNode[] = [];
  ([t, o, d, g] as const).forEach((v, i) => {
    if (v >= 0) adimlar.push(servo(i as 0 | 1 | 2 | 3, v));
  });
  adimlar.push(wait(ms));
  return chain(adimlar);
};

const armGrip = (act: 'open' | 'close', ms: number): BlockNode =>
  chain([servo(3, act === 'open' ? 40 : 100), wait(ms)]);

/** El sallama: omuzu kaldır, dirseği ileri-geri oynat, indir. */
const armWave = (times: number): BlockNode => {
  const sallanma: BlockNode[] = [];
  for (let i = 0; i < Math.max(1, times); i++) {
    sallanma.push(servo(2, 130), wait(300), servo(2, 60), wait(300));
  }
  return chain([
    servo(1, 140), wait(600),
    ...sallanma,
    servo(2, 90), wait(250),
    servo(1, 90), wait(500),
  ]);
};

/** Küp alma sekansı: aç → yaklaş → in → kapat → kaldır. */
const armPick = (base: number, low: number): BlockNode => chain([
  servo(3, 40), wait(300),
  servo(0, base), servo(1, 120), servo(2, 80), wait(700),
  servo(1, low), servo(2, 70), wait(600),
  servo(3, 100), wait(400),
  servo(1, 120), servo(2, 90), wait(600),
]);

/** Küp bırakma sekansı: taşı → in → aç → kalk. */
const armPlace = (base: number, low: number): BlockNode => chain([
  servo(0, base), servo(1, 120), servo(2, 85), wait(800),
  servo(1, low), servo(2, 75), wait(600),
  servo(3, 40), wait(350),
  servo(1, 120), servo(2, 90), wait(550),
]);
// ── görev kurucusu ───────────────────────────────────────────────────

function task(
  n: number, emoji: string, title: string, desc: string,
  steps: string[], blocks: WorkspaceStateJson
): KitBlockFile {
  return {
    id: `arm-gorev-${String(n).padStart(2, '0')}`,
    name: `${emoji} Görev ${n} — ${title}`,
    desc, steps, blocks,
  };
}

// ════════════════════════════════════════════════════════════════════
// 20 GÖREV — kolaydan zora
// ════════════════════════════════════════════════════════════════════

export const ROBOARM_TASKS: KitBlockFile[] = [

  task(1, '🎯', 'Merhaba Kol (merkez)', 
    'İlk adım: kolu güvenli merkez pozuna al ve mesaj yazdır.',
    ['Kolu merkeze al bloğunu kullan (800 ms)',
     'Konsola "Merhaba!" yazdır',
     'Simülasyonda çalıştır — 4 servo da 90°\'ye yumuşakça gelmeli'],
    program([
      printText('Merhaba! Kol merkeze geliyor...'),
      armHome(800),
      printText('Hazirim.'),
    ])),

  task(2, '🧭', 'Taban Turu',
    'Taban servosunu tanı: sola bak, sağa bak, merkeze dön.',
    ['Taban 30° (sol uç) → 1 sn bekle',
     'Taban 150° (sağ uç) → 1 sn bekle',
     'Merkeze (90°) dön — hangi yön hangi açı, not al'],
    program([
      armHome(600),
      armAxis(0, 30, 900), waitS(1),
      armAxis(0, 150, 1200), waitS(1),
      armAxis(0, 90, 800),
      printText('Taban turu tamam.'),
    ])),

  task(3, '💪', 'Omuz Kaldır-İndir',
    'Omuz eksenini keşfet — kolu yukarı kaldır, öne indir.',
    ['Omuz 140° = yukarı, 60° = öne eğik',
     'Aralarda 1 sn bekle, hareketi izle',
     'Deney: süreyi 400 ms yap — fark ne?'],
    program([
      armHome(600),
      armAxis(1, 140, 900), waitS(1),
      armAxis(1, 60, 900), waitS(1),
      armAxis(1, 90, 700),
    ])),

  task(4, '🦴', 'Dirsek Testi',
    'Dirsek eksenini dene ve üç eksenin farkını kavra.',
    ['Dirsek 130° → 55° → 90°',
     'Omuz sabitken dirsek ucu nasıl çiziyor, gözle',
     'Bonus: önce omzu 120° yap, dirseği tekrar dene'],
    program([
      armHome(600),
      armAxis(2, 130, 800), waitMs(600),
      armAxis(2, 55, 800), waitMs(600),
      armAxis(2, 90, 600),
    ])),

  task(5, '🤏', 'Gripper Ritmi',
    'Kıskacı tanı: 3 kez aç-kapa (tekrar bloğuyla).',
    ['Tekrar 3 kez: kapa (400 ms) → aç (400 ms)',
     'Aralara 300 ms bekleme koy',
     'Gerçek kolda parmağını UZAK tut!'],
    program([
      armHome(600),
      repeat(3, [
        armGrip('close', 400), waitMs(300),
        armGrip('open', 400), waitMs(300),
      ]),
      printText('Gripper testi bitti.'),
    ])),

  task(6, '🧘', 'İlk Poz',
    'Dört ekseni TEK blokla aynı anda hedefe götür (poz bloğu).',
    ['Poz: taban 120, omuz 110, dirsek 70, gripper 40 · 1200 ms',
     'Sonra merkeze dön',
     'Eksen eksen gitmekle farkını karşılaştır'],
    program([
      armHome(700),
      armPose(120, 110, 70, 40, 1200),
      waitS(1),
      armHome(900),
    ])),

  task(7, '〰', 'Eğri Laboratuvarı',
    'Aynı omuz hareketi 4 eğriyle: doğrusal, S, yavaş başla, yavaş bitir.',
    ['Her eğri için: 140° git → 90° dön',
     'Hangisi robotik, hangisi doğal duruyor?',
     'Küpe inişte neden "yavaş bitir" güvenli? Tartış'],
    program([
      armHome(600),
      printText('1) dogrusal'), armAxis(1, 140, 900, 'linear'), armAxis(1, 90, 900, 'linear'),
      printText('2) S egrisi'), armAxis(1, 140, 900, 'ease'), armAxis(1, 90, 900, 'ease'),
      printText('3) yavas basla'), armAxis(1, 140, 900, 'easein'), armAxis(1, 90, 900, 'easein'),
      printText('4) yavas bitir'), armAxis(1, 140, 900, 'easeout'), armAxis(1, 90, 900, 'easeout'),
    ])),

  task(8, '👋', 'Selam Robotu',
    'Hazır "selam salla" hareketiyle tanıtım demosu yap.',
    ['Merkeze al → 2 kez selam salla',
     'Sonuna kendi mesajını yazdır',
     'Fuar/tanıtım masası için süper demo!'],
    program([
      armHome(700),
      armWave(2),
      printText('RoboArm hazir!'),
    ])),

  task(9, '🐢', 'Yavaş mı Hızlı mı?',
    'Aynı yay iki hızda: 2000 ms ve 300 ms — titreme deneyi.',
    ['Taban 40→140: önce 2000 ms, sonra 300 ms',
     'Gerçek kolda hangisi gövdeyi sarsıyor?',
     'Sonuç: ağır yükte süreyi UZAT'],
    program([
      armHome(600),
      printText('Yavas tur (2000 ms)'),
      armAxis(0, 40, 1000), armAxis(0, 140, 2000), 
      printText('Hizli tur (300 ms)'),
      armAxis(0, 40, 300), armAxis(0, 140, 300),
      armAxis(0, 90, 700),
    ])),

  task(10, '🔁', 'Kare Devriye',
    '4 pozdan oluşan turu tekrar bloğuyla 2 kez dolaş.',
    ['Pozları sırayla zincirle (4 poz bloğu)',
     'Hepsini "tekrar 2 kez" içine al',
     'Kendi 5. pozunu ekleyip rotayı büyüt'],
    program([
      armHome(600),
      repeat(2, [
        armPose(60, 120, 70, 40, 800),
        armPose(60, 90, 110, 40, 800),
        armPose(120, 90, 110, 40, 800),
        armPose(120, 120, 70, 40, 800),
      ]),
      armHome(800),
    ])),

  task(11, '🧊', 'Küpü Kavra',
    'Otomatik "küpü al" bloğu: yaklaş → yavaş alçal → kavra → kaldır.',
    ['Merkeze al, sonra Küpü al (taban 90, alçalma 55)',
     'Sim küpü kavrayamazsa alçalma açısını 50-60 arasında dene',
     'Gerçek kolda açıyı Tıkla-Git ile bul, buraya yaz'],
    program([
      armHome(700),
      printText('Kupe uzaniyorum...'),
      armPick(90, 55),
      printText('Kavradim ve kaldirdim!'),
    ])),

  task(12, '🚚', 'Küpü Taşı',
    'Tam servis: al (90°) → taşı → bırak (160°) → merkeze dön.',
    ['Küpü al + Küpü bırak bloklarını zincirle',
     'Bırakma tabanını 160° yap (yan bölge)',
     'Bitişte merkez + selam'],
    program([
      armHome(700),
      armPick(90, 55),
      armPlace(160, 60),
      printText('Teslim edildi.'),
      armHome(800),
      armWave(1),
    ])),

  task(13, '🏭', 'Bant Simülasyonu',
    'A noktasından B\'ye 3 sefer taşıma turu (üretim bandı gibi).',
    ['Tekrar 3 kez: al(90) → bırak(160) → merkez',
     'Gerçekte her turda küpü A\'ya sen geri koy',
     'Tur sayacını konsola yazdır (kaçıncı sefer?)'],
    program([
      setVar('tur', num(0)),
      armHome(700),
      repeat(3, [
        changeVar('tur', 1),
        printText('Yeni tur basliyor'),
        armPick(90, 55),
        armPlace(160, 60),
        armHome(700),
      ]),
      printText('Banttaki 3 kup tasindi!'),
    ], ['tur'])),

  task(14, '🕹', 'Vinç Operatörü (Tuşlar)',
    'Klavyeyle canlı sür: A/D taban, W/S omuz, Q aç / E kapa.',
    ['Sürekli döngü + "tuş basılı mı?" blokları',
     'Sim panelini açıkken tuşlara bas — kol anında döner',
     'Kart bağlıysa gerçek kol da seninle oynar'],
    program([
      armHome(600),
      printText('A/D taban · W/S omuz · Q ac · E kapa'),
      forever([
        ifBlock(keyPressed('a'), [armAxis(0, 150, 250, 'easeout')]),
        ifBlock(keyPressed('d'), [armAxis(0, 30, 250, 'easeout')]),
        ifBlock(keyPressed('w'), [armAxis(1, 140, 250, 'easeout')]),
        ifBlock(keyPressed('s'), [armAxis(1, 60, 250, 'easeout')]),
        ifBlock(keyPressed('q'), [armGrip('open', 200)]),
        ifBlock(keyPressed('e'), [armGrip('close', 200)]),
      ]),
    ])),

  task(15, '🎚', 'Milimetrik Kapama',
    'Değişkenle gripper\'ı 10\'ar derece adımlarla hassas kapat.',
    ['"aci" değişkeni 40\'tan başlar',
     'Tekrar 6 kez: aci\'yı 10 artır → gripper eksenini aci\'ya götür',
     'Yumurta gibi kırılganları böyle kavrarsın!'],
    program([
      armHome(600),
      setVar('aci', num(40)),
      repeat(6, [
        changeVar('aci', 10),
        armAxisV(3, getVar('aci'), 250, 'easeout'),
        waitMs(250),
      ]),
      printText('Hassas kavrama tamam (100 derece).'),
      armGrip('open', 500),
    ], ['aci'])),

  task(16, '💃', 'Kol Dansı',
    'Pozlar + selam + tempoyla 15 saniyelik koreografi tasarla.',
    ['Verilen 6 adımlık dansı çalıştır',
     'Kendi 2 hareketini ekle',
     'Süreleri müziğin temposuna uydur'],
    program([
      armHome(600),
      armPose(60, 130, 60, 100, 700), 
      armPose(120, 130, 60, 40, 700),
      armPose(90, 80, 130, 100, 600),
      armWave(2),
      armPose(150, 110, 80, 40, 800, 'easeout'),
      armPose(30, 110, 80, 100, 800, 'easeout'),
      armHome(900),
      printText('Dans bitti — alkis!'),
    ])),

  task(17, '🗼', 'İstif Ustası',
    'Aynı alma noktasından 3 farklı bırakma açısına sırala (140/160/180*).',
    ['3 taşıma: bırak tabanı 140 → 160 → 175',
     'Gerçekte 3 küple oyna; simde her turu gözle',
     '*Panelden "180° duruş" açıksa arka bölge de kullanılır'],
    program([
      armHome(700),
      armPick(90, 55), armPlace(140, 60),
      armPick(90, 55), armPlace(160, 60),
      armPick(90, 55), armPlace(175, 60),
      armHome(800),
      printText('3 kup siralandi.'),
    ])),

  task(18, '🪶', 'Yumuşak İniş Yarışı',
    'Küpe inişte "yavaş başla" ile "yavaş bitir"i yarıştır.',
    ['Aynı iniş (omuz 120→55) iki eğriyle',
     'Gerçek kolda hangisi küpü devirmiyor?',
     'Kuralı yaz: inişte daima ________'],
    program([
      armHome(600),
      printText('1) yavas basla ile inis'),
      armAxis(1, 120, 600), armAxis(1, 55, 1000, 'easein'),
      armAxis(1, 120, 600),
      printText('2) yavas bitir ile inis'),
      armAxis(1, 55, 1000, 'easeout'),
      armAxis(1, 90, 700),
      printText('Hangisi daha guvenliydi?'),
    ])),

  task(19, '🛰', 'Gözcü Kol',
    'Sürekli tarama devriyesi: taban 50↔130, her uçta rapor.',
    ['Sürekli döngüde iki uç arasında süpür',
     'Her uçta konsola konum yazdır',
     'Durdurmak için ■ Durdur — döngü sonsuz!'],
    program([
      armHome(600),
      armAxis(1, 120, 700),
      forever([
        armAxis(0, 50, 1400, 'ease'),
        printText('Sol bolge tarandi'),
        armAxis(0, 130, 1400, 'ease'),
        printText('Sag bolge tarandi'),
      ]),
    ])),

  task(20, '🏆', 'FİNAL — Tam Görev',
    'Hepsi bir arada: kalibrasyon → çift taşıma → hassas kapanış → şov.',
    ['Merkez + gripper testi (kalibrasyon)',
     'Küpü 90°\'den al, 150°\'ye bırak; geri al, 90°\'ye iade et',
     '3 selam + merkez — sertifikanı hak ettin! 🎓'],
    program([
      printText('FINAL GOREV basliyor'),
      armHome(800),
      armGrip('close', 350), armGrip('open', 350),
      printText('Kalibrasyon OK — tasima 1'),
      armPick(90, 55), armPlace(150, 60),
      printText('Tasima 2 — iade'),
      armPick(150, 55), armPlace(90, 60),
      armHome(800),
      armWave(3),
      printText('TEBRIKLER! 20 gorev tamamlandi.'),
    ])),
];
