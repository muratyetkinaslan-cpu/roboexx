/**
 * RoboARM montaj rehberi verisi — yalnızca MEKANİK montaj (elektronik yok).
 *
 * Adımlar GERÇEK vidalı 3D modele (ROBOARM_v1.3mf → montaj.html) bağlıdır.
 * Viewer her adımda o aşamanın parçalarını gösterir, motorları SİYAH çizer,
 * o adımda takılacak gerçek vidaları parlayan yakar; vidalar yanıp sönerek
 * ve takılma yönünde girip çıkarak nereye takılacağını gösterir (animasyon).
 *
 * Sıra: taban → döner gövde+ana motor → kol aparatı → dirsek motoru →
 *       dirsek aparatı → gripper motoru → gripper kıskacı.
 */

export type ArmModelStep =
  | 'taban' | 'govde' | 'kol'
  | 'dirsek_motor' | 'dirsek_aparat'
  | 'gripper_motor' | 'gripper_aparat'
  | 'full';

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
  id: string; name: string; tagline: string; description: string;
  steps: AssemblyStep[]; comingSoon?: boolean;
}

const ROBOARM_STEPS: AssemblyStep[] = [
  {
    short: 'Taban + Motor',
    title: 'Taban ve taban motoru (MG90S)',
    subtitle: 'Tabanı sabitle, tabanı döndürecek siyah motoru 2 kırmızı vidayla tak.',
    model: 'taban',
    steps: [
      'Taban silindirini düz bir masaya koy; 4 köşe kulağından masaya sabitle.',
      'Siyah taban motorunu (MG90S) yuvasına yerleştir.',
      'parlayan 2 vidayı, gösterdikleri yere tak.',
    ],
    parts: ['Taban', 'Taban motoru (siyah)', '2× kırmızı vida'],
    tip: 'Motoru takmadan önce 90°’ye getir; taban her iki yöne eşit döner.',
    warn: 'Vidaları aşırı sıkma; baskılı parça çatlayabilir.',
  },
  {
    short: 'Gövde + Ana Motor',
    title: 'Döner gövde ve ana motor (MG996R)',
    subtitle: 'Ana motoru döner gövdeye 4 köşe vidasıyla sabitle (ortaya vida yok).',
    model: 'govde',
    steps: [
      'Döner gövdeyi taban motorunun üstüne otur.',
      'Siyah ana motoru (MG996R) gövdeye yerleştir.',
      'parlayan 4 köşe vidasını tak — ortaya vida gelmez, yalnız 4 köşe.',
    ],
    parts: ['Döner gövde', 'Ana motor (siyah)', '4× köşe vidası'],
    tip: 'Sadece 4 köşeyi vidala; merkez deliği boş kalır (oraya kol aparatı gelecek).',
  },
  {
    short: 'Kol Aparatı',
    title: 'Kol aparatını tak',
    subtitle: 'Kol aparatını ana motorun üstüne otur, ortadan tek vidayla sabitle.',
    model: 'kol',
    steps: [
      'Kol aparatını ana motorun miline/horn’una geçir; motor 90°’deyken kol dik bakmalı.',
      'parlayan merkez vidasını aparatın üstünden tak.',
      'Kolu elinle kaldırıp indirerek serbest hareket ettiğini kontrol et.',
    ],
    parts: ['Kol aparatı', '1× merkez vida'],
    tip: 'Önce aparatı tam otur, sonra üstündeki tek vidayı sık.',
  },
  {
    short: 'Dirsek Motoru',
    title: 'Dirsek motorunu tak',
    subtitle: 'Önce dirsek motorunu yerine vidalarıyla tak.',
    model: 'dirsek_motor',
    steps: [
      'Siyah dirsek motorunu (MG90S) kolun ucundaki yuvaya yerleştir.',
      'parlayan vidalarla motoru sabitle.',
      'Motoru hareket ettirmeden önce 90°’ye getir.',
    ],
    parts: ['Dirsek motoru (siyah)', 'Kırmızı vidalar'],
    tip: 'Bu adımda sadece motor takılır; aparat bir sonraki adımda gelir.',
  },
  {
    short: 'Dirsek Aparatı',
    title: 'Dirsek aparatını tak',
    subtitle: 'Motor yerine oturduktan sonra dirsek aparatını/ön kolu tak.',
    model: 'dirsek_aparat',
    steps: [
      'Dirsek aparatını (ön kol) motorun horn’una bağla.',
      'parlayan vidayla aparatı sabitle.',
      'Dirseği elinle açıp kapatarak takılma olmadığını kontrol et.',
    ],
    parts: ['Dirsek aparatı', 'Kırmızı vida'],
    tip: 'Aparat zorlanıyorsa horn’u bir diş kaydırarak yeniden tak.',
  },
  {
    short: 'Gripper Motoru',
    title: 'Gripper motorunu tak',
    subtitle: 'Gripper motorunu gövdeye 2 vidayla tak; ortadaki yuvarlak yere mil (silindir) girer.',
    model: 'gripper_motor',
    steps: [
      'Siyah gripper motorunu (MG90S) gövdesine yerleştir.',
      'Parlayan 2 vidayla motoru sabitle (ortaya vida gelmez).',
      'Ortadaki yuvarlak yuvaya mili (silindir şaft) tak — burası vida değildir.',
    ],
    parts: ['Gripper motoru (siyah)', '2× vida', 'Mil (silindir)'],
    tip: 'Ortadaki yuvarlak boşluğa vida değil, silindir mil girer; kıskaç bir sonraki adımda buraya oturur.',
  },
  {
    short: 'Gripper Kıskacı',
    title: 'Kıskacı (aparatı) tak',
    subtitle: 'Kıskacı motora oturt ve ortasından tek vidayla sabitle.',
    model: 'gripper_aparat',
    steps: [
      'Kıskaç parmaklarını/aparatını motorun miline (ortaya) oturt.',
      'Parlayan merkez vidasını ortadan tak — gripper böylece servoya bağlanır.',
      'Kıskacı elle açıp kapatarak temiz kavradığını kontrol et.',
    ],
    parts: ['Kıskaç aparatı', '1× merkez vida'],
    tip: 'Önce kıskacı mile otur, sonra ortadaki tek vidayı sık.',
  },
  {
    short: 'Hazır — Dene',
    title: 'Kol tamam — simülasyona geç',
    subtitle: 'Montaj bitti. Tüm kolu döndürerek incele, sonra dene.',
    model: 'full',
    steps: [
      'Tüm kolu modelde döndürerek incele — her parça yerinde.',
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
    id: 'roboarm', name: 'RoboARM', tagline: '4 Eksen · Servo Kontrollü',
    description:
      'Taban, gövde, kol, dirsek ve gripper olmak üzere 4 eksenli masaüstü robot kol. Gerçek vidalı 3D model üzerinde adım adım kur (motorlar siyah, vidalar kırmızı yanıp söner), sonra simülasyonla dene.',
    steps: ROBOARM_STEPS,
  },
  {
    id: 'robobot', name: 'RoboBOT', tagline: 'Çift Motor · Sürüş',
    description: 'Diferansiyel sürüşlü robot araç kiti. Montaj rehberi yakında.',
    steps: [], comingSoon: true,
  },
];

export function getKit(id: string): AssemblyKit | undefined {
  return ASSEMBLY_KITS.find((k) => k.id === id);
}
