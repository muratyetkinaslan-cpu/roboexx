/**
 * RoboARM montaj rehberi verisi.
 *
 * Her adım: başlık, alt başlık, sıralı talimatlar, parça/vida etiketleri,
 * ipucu/uyarı ve adıma özel bir şematik çizim (SVG id'si).
 *
 * Çizimler AssemblyGuide bileşeninde `STEP_ART[art]` ile render edilir.
 * 4 eksenli kol: Taban (J1) · Omuz (J2) · Dirsek (J3) · Gripper (J4).
 */

export interface AssemblyStep {
  /** Kısa kart etiketi (sol liste) */
  short: string;
  /** Büyük başlık */
  title: string;
  /** Tek satır özet */
  subtitle: string;
  /** Sıralı talimatlar */
  steps: string[];
  /** Bu adımda kullanılan parça/vida etiketleri (çip) */
  parts?: string[];
  /** Yeşil ipucu kutusu */
  tip?: string;
  /** Turuncu/kırmızı uyarı kutusu */
  warn?: string;
  /** Şematik çizim anahtarı */
  art: string;
}

export interface AssemblyKit {
  id: string;
  name: string;
  tagline: string;
  description: string;
  steps: AssemblyStep[];
  /** Henüz hazır değilse true (kart pasif) */
  comingSoon?: boolean;
}

/* ============================================================
   RoboARM — 4 eksenli masaüstü robot kol
   ============================================================ */
const ROBOARM_STEPS: AssemblyStep[] = [
  {
    short: 'Kit & Hazırlık',
    title: 'Kit içeriği ve hazırlık',
    subtitle: 'Montaja başlamadan önce tüm parçaları tanı ve say.',
    art: 'kit',
    steps: [
      'Kit kutusunu boş bir masaya boşalt; parçaları gruplara ayır: gövde parçaları, servolar, hornlar, vidalar, elektronik.',
      'Servoları kontrol et: 2 adet MG996R (büyük, güçlü — taban ve omuz için), 2 adet MG90S (küçük — dirsek ve gripper için).',
      'Vidaları ayır: M3 (gövde/servo gövdesi sabitleme) ve M2 (servo horn vidaları, daha kısa).',
      'Elektroniği hazırla: Raspberry Pi Pico, PCA9685 16 kanal servo sürücü kart, jumper kablolar, 5–6V güç kaynağı.',
      'Aletleri hazırla: küçük yıldız (+) tornavida ve gerekiyorsa ince uçlu pense.',
    ],
    parts: ['2× MG996R', '2× MG90S', 'M3 vida', 'M2 vida', 'Servo horn', 'Pico', 'PCA9685'],
    tip: 'Küçük vidalar kolay kaybolur — magnetli bir kapakta veya bölmeli kutuda tut.',
    warn: 'Akrilik/plastik parçaları zorlamadan birleştir; vidaları aşırı sıkarsan çatlayabilir.',
  },
  {
    short: 'Servoları 90°',
    title: 'Servoları 90°’ye getir (montajdan ÖNCE)',
    subtitle: 'Hornları takmadan önce her servoyu tam ortaya (90°) sür.',
    art: 'center',
    steps: [
      'Henüz hiçbir horn’u takmadan, her servoyu sırayla PCA9685’in bir kanalına bağla.',
      'Bu rehberin sonundaki simülasyonu açıp “Tümü 90° (kalibrasyon)” düğmesine bas — ya da servoyu elle 90°’ye sürecek kısa bir kod çalıştır.',
      'Servo ortalanınca mili işaretle (kalemle küçük bir nokta) — hangi açının “orta” olduğunu unutmazsın.',
      'Dört servoyu da bu şekilde 90°’ye getir, sonra montaja geç.',
    ],
    parts: ['PCA9685', '4× Servo', '5–6V güç'],
    tip: 'Servo merkezdeyken horn’u taktığında eklem her iki yöne de eşit (≈90°) hareket eder.',
    warn: 'Bu adımı atlarsan horn yanlış açıda oturur; montaj sonrası eklem bir tarafa dayanır ve hareket alanı yarıya düşer.',
  },
  {
    short: 'Taban (J1)',
    title: 'Taban montajı — J1 (dönüş ekseni)',
    subtitle: 'Tüm kolun döndüğü zemin servosunu yerleştir.',
    art: 'base',
    steps: [
      'Taban servosunu (MG996R) taban plakasındaki yuvaya, mili yukarı bakacak şekilde yerleştir.',
      'Servonun gövdesini 4× M3 vida ile taban plakasına sabitle (servonun yan kulaklarındaki deliklerden).',
      'Servo zaten 90°’de olduğundan, döner tablayı/üst plakayı horn’a simetrik (düz) gelecek şekilde geçir.',
      'Döner tablayı horn’un merkez vidasıyla mile sıkıştır.',
      'Tablayı elinle hafifçe sağa-sola çevirip serbest döndüğünü kontrol et.',
    ],
    parts: ['MG996R (J1)', '4× M3 vida', 'Horn + merkez vida', 'Döner tabla'],
    tip: 'Döner tablayı takarken kolun “öne” bakacağı yönü belirle; 90° o yönün tam ortası olmalı.',
  },
  {
    short: 'Omuz (J2)',
    title: 'Omuz montajı — J2 (kaldırma ekseni)',
    subtitle: 'Alt kolu yukarı-aşağı kaldıran servoyu monte et.',
    art: 'shoulder',
    steps: [
      'Omuz braketini (dikey U parça) döner tablanın üzerine 2× M3 vida ile sabitle.',
      'Omuz servosunu (MG996R) brakete, mili dışa bakacak şekilde yerleştir ve M3 vidalarla sabitle.',
      'Alt kol linkini omuz horn’una geçir; servo 90°’deyken alt kol dik (yukarı) bakmalı.',
      'Horn’u merkez vidayla mile kilitle.',
    ],
    parts: ['MG996R (J2)', 'Omuz braketi', '2× M3 vida', 'Alt kol linki'],
    tip: 'Omuz en çok yük binen eklem — vidaların tam oturduğundan emin ol, ama yine de aşırı sıkma.',
    warn: 'Alt kolu ters (aşağı) takarsan kol çalışma alanının dışına çıkar; 90°’de daima dik olmalı.',
  },
  {
    short: 'Dirsek (J3)',
    title: 'Dirsek montajı — J3 (uzanma ekseni)',
    subtitle: 'Ön kolu açıp kapatan servoyu ekle.',
    art: 'elbow',
    steps: [
      'Dirsek servosunu (MG90S) alt kolun üst ucundaki yuvaya yerleştir, 2× M2 vida ile sabitle.',
      'Ön kolu (forearm) dirsek horn’una bağla; servo 90°’deyken ön kol alt kola ≈90° açıyla durmalı.',
      'Paralel bağlantı çubuğu (link rod) varsa, kolun düzlemini korumak için onu da yerine tak.',
      'Horn’u merkez vidasıyla sabitle ve dirseği elle açıp kapatarak takılma olmadığını kontrol et.',
    ],
    parts: ['MG90S (J3)', '2× M2 vida', 'Ön kol', 'Bağlantı çubuğu (varsa)'],
    tip: 'Dirsek hafif zorlanıyorsa horn’u bir diş kaydırarak yeniden tak — sürtünme kaybolur.',
  },
  {
    short: 'Gripper (J4)',
    title: 'Gripper montajı — J4 (kıskaç)',
    subtitle: 'Nesneyi tutan kıskacı kur ve ön kola bağla.',
    art: 'gripper',
    steps: [
      'Gripper servosunu (MG90S) ön kolun ucundaki yuvaya yerleştir ve M2 vidalarla sabitle.',
      'Kıskaç parmaklarını/dişlilerini birleştir — bir parmak servo horn’una, diğeri pivot vidasına oturur.',
      'Servo 90°’deyken kıskaç yarı açık olmalı; horn’u bu konumda mile tak.',
      'Kıskacı elle açıp kapatarak dişlilerin temiz kavradığını kontrol et.',
    ],
    parts: ['MG90S (J4)', '2× M2 vida', 'Kıskaç parmakları', 'Pivot vidası'],
    tip: '90° = yarı açık olacak şekilde takarsan, kapatma ve açma için eşit hareket alanın olur.',
  },
  {
    short: 'Kablolama',
    title: 'Elektronik ve kablolama',
    subtitle: 'Servoları PCA9685’e, sürücüyü Pico’ya bağla.',
    art: 'wiring',
    steps: [
      'Servo sinyal kablolarını PCA9685 kanallarına tak: J1→CH0, J2→CH1, J3→CH2, J4→CH3.',
      'Servoların kırmızı (+) ve kahverengi/siyah (−) kablolarının kanal pinlerine doğru sırada oturduğunu kontrol et.',
      'PCA9685’i Pico’ya bağla: SDA→GP4, SCL→GP5, VCC→3V3, GND→GND.',
      'Servo gücü için PCA9685’in V+ / GND klemensine harici 5–6V besleme bağla (USB tek başına yetmez).',
      'Tüm GND’leri ortakla (Pico GND, PCA GND, güç kaynağı GND aynı hatta).',
    ],
    parts: ['PCA9685', 'Pico', 'SDA→GP4', 'SCL→GP5', '5–6V besleme'],
    tip: 'Uygulamadaki Robot Kol panelinden PCA9685 SDA/SCL pinlerini ve adresi (0x40) ayarlayabilirsin.',
    warn: 'Dört servoyu yalnızca Pico/USB’den beslemeye çalışma — akım yetmez, Pico resetlenir. Mutlaka harici güç kullan.',
  },
  {
    short: 'Kalibrasyon',
    title: 'Kalibrasyon ve ilk test',
    subtitle: 'Gücü ver, kolu 90°’ye gönder, duruşu kontrol et.',
    art: 'calibrate',
    steps: [
      'Önce harici güç kaynağını, sonra Pico’nun USB’sini bağla.',
      'Uygulamadan Pico’ya bağlan ve Robot Kol panelinde “Tümü 90° (kalibrasyon)”a bas.',
      'Kol dik, simetrik ve sabit durmalı. Bir eklem eğik duruyorsa horn’u çıkar, servoyu yeniden 90°’ye sür ve horn’u düz tak.',
      'Küçük sapmalar için panelden ilgili eklemin “Ofset°” değerini ayarla; ters çalışan eklemde “Ters” kutusunu işaretle.',
    ],
    parts: ['Robot Kol paneli', 'Ofset° ayarı', '“Ters” seçeneği'],
    tip: 'Mekanik olarak horn’u doğru takmak en temiz çözüm; Ofset° ise ince ayar içindir (±birkaç derece).',
  },
  {
    short: 'Dene!',
    title: 'Hazır — simülasyona geç',
    subtitle: 'Kol kuruldu. Şimdi blok/IK ile dene ve gerçek kolu eşle.',
    art: 'done',
    steps: [
      'Simülasyonu aç: ekranda sanal kol gerçek kolunla aynı eklemlere sahip.',
      '“Tıkla-Git (IK)” ile sahnede bir noktaya tıkla — kol oraya gider; Pico bağlıysa gerçek kol da gider.',
      '“Nokta ekle” + “Tekrarla” ile pick & place döngüsü kur; “Küpü Al ve Tut” ile kavrama dene.',
      'Bloklarla kendi programını yaz ve gerçek kola yükle.',
    ],
    parts: ['Simülasyon', 'Tıkla-Git (IK)', 'Pick & place', 'Bloklar'],
    tip: 'Bağlantı varsa simülasyondaki her hareket aynı anda gerçek kola da gönderilir.',
  },
];

export const ASSEMBLY_KITS: AssemblyKit[] = [
  {
    id: 'roboarm',
    name: 'RoboARM',
    tagline: '4 Eksen · Servo Kontrollü',
    description:
      'Taban, omuz, dirsek ve gripper olmak üzere 4 eksenli masaüstü robot kol. Adım adım kurup simülasyonla eşleştir.',
    steps: ROBOARM_STEPS,
  },
  {
    id: 'robobot',
    name: 'RoboBOT',
    tagline: 'Çift Motor · Sürüş',
    description: 'Diferansiyel sürüşlü robot araç kiti. Montaj rehberi yakında.',
    steps: [],
    comingSoon: true,
  },
];

export function getKit(id: string): AssemblyKit | undefined {
  return ASSEMBLY_KITS.find((k) => k.id === id);
}
