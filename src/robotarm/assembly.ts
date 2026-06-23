/**
 * RoboARM montaj rehberi verisi.
 *
 * Her adım gerçek 3D simülasyon modeline bağlıdır (`model` → arm-sim.html
 * "rx:assembly" adımı). Sim o adımda ilgili parçaları sırayla gösterir,
 * vidalanacak yerleri kırmızı işaretler ve kamerayı uygun açıya alır.
 *
 * 4 eksen: Taban (J1) · Omuz (J2) · Dirsek (J3) · Gripper (J4).
 * Elektronik/kablolama bu rehbere dahil DEĞİLDİR — yalnızca mekanik montaj.
 */

/** arm-sim.html montaj modundaki adım anahtarları */
export type ArmModelStep = 'base' | 'shoulder' | 'elbow' | 'gripper' | 'full';

export interface AssemblyStep {
  /** Kısa kart etiketi (sol liste) */
  short: string;
  /** Büyük başlık */
  title: string;
  /** Tek satır özet */
  subtitle: string;
  /** Sıralı talimatlar */
  steps: string[];
  /** Bu adımdaki parça/vida etiketleri (çip) */
  parts?: string[];
  /** Yeşil ipucu kutusu */
  tip?: string;
  /** Turuncu uyarı kutusu */
  warn?: string;
  /** 3D modelde gösterilecek montaj adımı */
  model: ArmModelStep;
}

export interface AssemblyKit {
  id: string;
  name: string;
  tagline: string;
  description: string;
  steps: AssemblyStep[];
  comingSoon?: boolean;
}

/* ============================================================
   RoboARM — 4 eksenli masaüstü robot kol (mekanik montaj)
   ============================================================ */
const ROBOARM_STEPS: AssemblyStep[] = [
  {
    short: 'Taban & J1 Motoru',
    title: 'Taban ve taban motoru (J1)',
    subtitle: 'Tüm kolun döndüğü taban servosunu yerleştir — modele tepeden bak.',
    model: 'base',
    steps: [
      'Taban plakasını düz bir zemine koy.',
      'Taban servosunu (MG996R) tabanın ortasındaki yuvaya, mili yukarı bakacak şekilde otur.',
      'Modelde kırmızı işaretli 4 noktaya M3 vida ile servoyu tabana sabitle — “buraya vida” demektir.',
      'Döner tablayı servo horn’una geçir ve horn’un merkez vidasıyla mile sıkıştır.',
    ],
    parts: ['MG996R (J1)', '4× M3 vida', 'Döner tabla'],
    tip: 'Horn’u takmadan önce servoyu 90°’ye getir; böylece kol her iki yöne eşit döner.',
    warn: 'Vidaları aşırı sıkma — plastik/akrilik taban çatlayabilir.',
  },
  {
    short: 'Omuz (J2)',
    title: 'Omuz montajı (J2)',
    subtitle: 'Alt kolu kaldıran servoyu döner tablaya monte et.',
    model: 'shoulder',
    steps: [
      'Omuz servosunu (MG996R) döner tabla üzerindeki dikey brakete yerleştir.',
      'Modeldeki kırmızı işaretli deliklere M3 vida ile servoyu sabitle.',
      'Alt kol linkini omuz horn’una tak; servo 90°’deyken alt kol dik (yukarı) bakmalı.',
      'Horn’u merkez vidayla mile kilitle.',
    ],
    parts: ['MG996R (J2)', 'M3 vida', 'Alt kol'],
    tip: 'Omuz en çok yük binen eklem — vidaların tam oturduğundan emin ol.',
    warn: 'Alt kolu 90°’de daima dik tak; ters takarsan kol çalışma alanı dışına çıkar.',
  },
  {
    short: 'Dirsek (J3)',
    title: 'Dirsek montajı (J3)',
    subtitle: 'Ön kolu açıp kapatan servoyu alt kolun ucuna ekle.',
    model: 'elbow',
    steps: [
      'Dirsek servosunu (MG90S) alt kolun üst ucundaki yuvaya yerleştir.',
      'Modeldeki kırmızı işaretli noktalara M2 vida ile sabitle.',
      'Ön kolu (forearm) dirsek horn’una bağla; 90°’de alt kola ≈90° açı yapmalı.',
      'Horn’u merkez vidayla sabitle, dirseği elle açıp kapatarak takılma olmadığını kontrol et.',
    ],
    parts: ['MG90S (J3)', '2× M2 vida', 'Ön kol'],
    tip: 'Dirsek hafif zorlanıyorsa horn’u bir diş kaydırarak yeniden tak.',
  },
  {
    short: 'Gripper (J4)',
    title: 'Gripper montajı (J4)',
    subtitle: 'Nesneyi tutan kıskacı kur ve ön kolun ucuna bağla.',
    model: 'gripper',
    steps: [
      'Gripper servosunu (MG90S) ön kolun ucundaki yuvaya monte et (M2 vida).',
      'Kıskaç parmaklarını modeldeki kırmızı işaretli pivotlara otur — bir parmak horn’a, diğeri pivot vidasına gelir.',
      'Servo 90°’deyken kıskaç yarı açık olmalı; horn’u bu konumda mile tak.',
      'Kıskacı elle açıp kapatarak dişlilerin temiz kavradığını kontrol et.',
    ],
    parts: ['MG90S (J4)', 'M2 vida', 'Kıskaç parmakları'],
    tip: '90° = yarı açık olacak şekilde takarsan açma/kapama için eşit hareket alanın olur.',
  },
  {
    short: 'Hazır — Dene',
    title: 'Kol tamam — simülasyona geç',
    subtitle: 'Montaj bitti. Tüm kolu gör, sonra blok/IK ile dene.',
    model: 'full',
    steps: [
      'Tüm kolu modelde döndürerek incele — taban, omuz, dirsek, gripper yerinde.',
      '“Simülasyonu Aç ve Dene” ile kontrol paneline geç.',
      '“Tıkla-Git (IK)” ile sahnede bir noktaya tıkla; Pico bağlıysa gerçek kol da gider.',
      'Bloklarla program yaz veya “Küpü Al ve Tut” ile kavrama dene.',
    ],
    parts: ['Simülasyon', 'Tıkla-Git (IK)', 'Bloklar'],
    tip: 'Bağlantı varsa simülasyondaki her hareket aynı anda gerçek kola da gönderilir.',
  },
];

export const ASSEMBLY_KITS: AssemblyKit[] = [
  {
    id: 'roboarm',
    name: 'RoboARM',
    tagline: '4 Eksen · Servo Kontrollü',
    description:
      'Taban, omuz, dirsek ve gripper olmak üzere 4 eksenli masaüstü robot kol. Gerçek 3D model üzerinde adım adım kur, sonra simülasyonla dene.',
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
