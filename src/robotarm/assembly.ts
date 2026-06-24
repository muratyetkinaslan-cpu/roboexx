/**
 * RoboARM montaj rehberi verisi — yalnızca MEKANİK montaj (elektronik yok).
 *
 * Adımlar GERÇEK vidalı 3D modele (ROBOT_KOL_v.3mf → montaj.html) bağlıdır.
 * Her adımda viewer o aşamanın parçalarını gösterir, o aşamada takılacak
 * gerçek vidaları KIRMIZI yakar ve kamerayı o bölgeye çerçeveler.
 *
 * Sıra (alttan üste): taban → döner gövde + ana motor → kol → dirsek → gripper.
 */

export type ArmModelStep = 'taban' | 'govde' | 'kol' | 'dirsek' | 'gripper' | 'full';

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

const ROBOARM_STEPS: AssemblyStep[] = [
  {
    short: 'Taban',
    title: 'Tabanı yerleştir',
    subtitle: 'Kolun oturacağı tabanı zemine sabitle.',
    model: 'taban',
    steps: [
      'Taban silindirini düz bir masaya koy.',
      'Tabanın etrafındaki 4 köşe kulağından, deliklerden vida ile masaya/plakaya sabitle.',
      'Üstteki döner tablanın elinle serbestçe döndüğünü kontrol et.',
    ],
    parts: ['Taban', 'Döner tabla', '4× köşe vidası'],
    tip: 'Taban sağlam sabitlenmezse kol hareket ederken sallanır — 4 köşeyi de sıkıştır.',
    warn: 'Vidaları aşırı sıkma; baskılı parça çatlayabilir.',
  },
  {
    short: 'Gövde + Ana Motor',
    title: 'Döner gövde ve ana motor',
    subtitle: 'Ana servoyu/braketi döner gövdeye kırmızı işaretli vidalarla tak.',
    model: 'govde',
    steps: [
      'Servoyu 90°’ye getir (horn’u takmadan önce), sonra braketi döner gövdeye otur.',
      'Modelde KIRMIZI yanan vidaları sırayla tak — ana motor braketi bu vidalarla tutturulur.',
      'Servo milinin/horn’un tam oturduğundan emin ol.',
    ],
    parts: ['Ana motor (servo)', 'Braket', 'Kırmızı vidalar'],
    tip: 'Kırmızı işaretli her deliğe bir vida gelir; hepsini takmadan sonraki adıma geçme.',
  },
  {
    short: 'Kol',
    title: 'Kolu tak',
    subtitle: 'Kol linkini ana motorun miline/horn’una geçir.',
    model: 'kol',
    steps: [
      'Kol linkini servo horn’una geçir; servo 90°’deyken kol dik bakmalı.',
      'Horn’un merkez vidasıyla kolu mile sabitle.',
      'Kolu elinle hafifçe kaldırıp indirerek serbest hareket ettiğini kontrol et.',
    ],
    parts: ['Kol linki', 'Horn merkez vidası'],
    tip: 'Kolu 90°’de dik tak; böylece ileri ve geri eşit hareket alanın olur.',
  },
  {
    short: 'Dirsek Motoru',
    title: 'Dirsek motorunu tak',
    subtitle: 'Kolun ucundaki dirsek servosunu kırmızı vidalarla sabitle.',
    model: 'dirsek',
    steps: [
      'Dirsek servosunu kolun ucundaki yuvaya yerleştir.',
      'Modelde KIRMIZI yanan vidalarla servoyu sabitle.',
      'Ön kolu dirsek horn’una bağla ve elinle açıp kapatarak takılma olmadığını kontrol et.',
    ],
    parts: ['Dirsek servosu', 'Kırmızı vidalar', 'Ön kol'],
    tip: 'Dirsek zorlanıyorsa horn’u bir diş kaydırarak yeniden tak.',
  },
  {
    short: 'Gripper',
    title: 'Gripper ve kıskaç',
    subtitle: 'Ön kolun ucuna gripper servosunu kırmızı vidalarla tak, kıskacı kur.',
    model: 'gripper',
    steps: [
      'Gripper servosunu ön kolun ucuna, KIRMIZI yanan vidalarla monte et.',
      'Kıskaç parmaklarını dişlilere geçir; bir parmak horn’a, diğeri pivot vidasına oturur.',
      'Servo 90°’deyken kıskaç yarı açık olmalı; horn’u bu konumda tak.',
    ],
    parts: ['Gripper servosu', 'Kırmızı vidalar', 'Kıskaç'],
    tip: '90° = yarı açık takarsan açma/kapama için eşit hareket alanın olur.',
  },
  {
    short: 'Hazır — Dene',
    title: 'Kol tamam — simülasyona geç',
    subtitle: 'Montaj bitti. Tüm kolu döndürerek incele, sonra blok/IK ile dene.',
    model: 'full',
    steps: [
      'Tüm kolu modelde döndürerek incele — taban, gövde, kol, dirsek, gripper yerinde.',
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
      'Taban, gövde, kol, dirsek ve gripper olmak üzere 4 eksenli masaüstü robot kol. Gerçek vidalı 3D model üzerinde sırayla kur, sonra simülasyonla dene.',
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
