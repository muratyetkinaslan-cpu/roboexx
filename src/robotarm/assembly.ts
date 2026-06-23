/**
 * RoboARM montaj rehberi verisi — yalnızca MEKANİK montaj (elektronik yok).
 *
 * Her adım gerçek 3D simülasyon modeline bağlıdır (`model` → arm-sim.html
 * "rx:assembly" adımı). Sim parçaları GERÇEK sırayla gösterir, vidalanacak
 * yerleri kırmızı işaretler ve kamerayı uygun açıya alır.
 *
 * Gerçek montaj sırası (alttan üste):
 *   taban → taban dönüş motoru (MG90S, 2 vida) → üst kapak →
 *   kol motoru (MG996R, yatay 4 vida) → üst MG90S (dirsek, 2 vida) → gripper (MG90S).
 */

/** arm-sim.html montaj modundaki adım anahtarları */
export type ArmModelStep = 'taban' | 'kapak' | 'kol' | 'dirsek' | 'gripper' | 'full';

export interface AssemblyStep {
  short: string;
  title: string;
  subtitle: string;
  steps: string[];
  parts?: string[];
  tip?: string;
  warn?: string;
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
   RoboARM — gerçek montaj sırası
   ============================================================ */
const ROBOARM_STEPS: AssemblyStep[] = [
  {
    short: 'Taban Motoru (MG90S)',
    title: 'Taban dönüş motoru — alttaki MG90S',
    subtitle: 'En alta, tabanı döndürecek MG90S servoyu 2 vidayla tak.',
    model: 'taban',
    steps: [
      'Taban plakasını düz zemine koy.',
      'En alttaki MG90S servoyu (taban dönüş motoru) yuvasına, mili yukarı bakacak şekilde yerleştir.',
      'Modelde kırmızı işaretli 2 noktaya vida ile servoyu tabana sabitle.',
    ],
    parts: ['MG90S (taban)', '2× vida'],
    tip: 'Horn’u takmadan önce servoyu 90°’ye getir — taban her iki yöne eşit döner.',
    warn: 'Vidaları aşırı sıkma; taban plakası çatlayabilir.',
  },
  {
    short: 'Üst Kapak',
    title: 'Üst kapağı tak',
    subtitle: 'Taban motorunun üstüne döner kapağı oturt ve ortadan vidala.',
    model: 'kapak',
    steps: [
      'Üst kapağı (döner gövde) MG90S servonun miline/horn’una geçirerek ortaya otur.',
      'Modelde kırmızı işaretli noktalardan kapağı vidayla sabitle.',
      'Kapağı elinle hafifçe çevir; tabanla birlikte serbest döndüğünü kontrol et.',
    ],
    parts: ['Üst kapak', 'Merkez vida'],
    tip: 'Kapak servo horn’una tam oturmalı; yoksa dönüşte boşluk olur.',
  },
  {
    short: 'Kol Motoru (MG996R)',
    title: 'Kol motoru — MG996R (yatay)',
    subtitle: 'Kolu kaldıracak güçlü MG996R servoyu yatay olarak 4 vidayla tak.',
    model: 'kol',
    steps: [
      'MG996R servoyu üst kapağın üzerine yatay (yatık) konumda yerleştir.',
      'Modelde kırmızı işaretli 4 noktaya vida ile servoyu sabitle.',
      'Kol linkini MG996R horn’una tak; servo 90°’deyken kol dik bakmalı.',
    ],
    parts: ['MG996R (kol)', '4× vida', 'Kol linki'],
    tip: 'MG996R en çok yük binen motor — 4 vidanın da tam oturduğundan emin ol.',
    warn: 'Servoyu yatay yönde doğru çevir; ters takarsan kol ileri yerine geri kalkar.',
  },
  {
    short: 'Üst MG90S (Dirsek)',
    title: 'Üst MG90S — dirsek motoru',
    subtitle: 'Kolun ucuna, ön kolu hareket ettiren üst MG90S’i 2 vidayla tak.',
    model: 'dirsek',
    steps: [
      'Üstteki MG90S servoyu kol linkinin ucundaki yuvaya yerleştir.',
      'Modelde kırmızı işaretli 2 noktaya vida ile sabitle.',
      'Ön kolu horn’a bağla; 90°’de kola ≈90° açı yapmalı.',
    ],
    parts: ['MG90S (dirsek)', '2× vida', 'Ön kol'],
    tip: 'Dirsek zorlanıyorsa horn’u bir diş kaydırarak yeniden tak.',
  },
  {
    short: 'Gripper (MG90S)',
    title: 'Gripper motoru ve kıskaç',
    subtitle: 'Ön kolun ucuna gripper MG90S’i tak, kıskacı kur.',
    model: 'gripper',
    steps: [
      'Gripper MG90S servoyu ön kolun ucuna 2 vidayla monte et (kırmızı işaretler).',
      'Kıskaç parmaklarını dişlilere geçir; bir parmak horn’a, diğeri pivot vidasına oturur.',
      'Servo 90°’deyken kıskaç yarı açık olmalı; horn’u bu konumda tak.',
    ],
    parts: ['MG90S (gripper)', '2× vida', 'Kıskaç parmakları'],
    tip: '90° = yarı açık takarsan açma/kapama için eşit hareket alanın olur.',
  },
  {
    short: 'Hazır — Dene',
    title: 'Kol tamam — simülasyona geç',
    subtitle: 'Montaj bitti. Tüm kolu gör, sonra blok/IK ile dene.',
    model: 'full',
    steps: [
      'Tüm kolu modelde döndürerek incele — taban, kol, dirsek, gripper yerinde.',
      '“Simülasyonu Aç ve Dene” ile kontrol paneline geç.',
      '“Tıkla-Git (IK)” ile bir noktaya tıkla; Pico bağlıysa gerçek kol da gider.',
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
      'Taban, kol, dirsek ve gripper olmak üzere 4 eksenli masaüstü robot kol. Gerçek 3D model üzerinde sırayla kur, sonra simülasyonla dene.',
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
