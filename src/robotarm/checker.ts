/**
 * ✅ GÖREV KONTROLÜ — öğrencinin programını cevap anahtarıyla karşılaştırır.
 *
 * Öğrenci ▶ Çalıştır'a bastığında simülasyon başlarken bu kontrol de arka
 * planda (sanal saatle, anında) koşar. Her bulgu, mümkünse onu üreten
 * BLOĞUN id'sini taşır → panel o bloğun üstüne uyarı koyar.
 *
 * ÜÇ KATMAN:
 *   1. DAVRANIŞ — iki program da sanal donanımda koşturulur, ürettikleri
 *      olay dizileri hizalanır. Farklı yazılmış ama aynı işi yapan kod
 *      tam puan alır; sadece görünüşü benzeyen kod almaz.
 *   2. YAPI     — görevin öğrettiği kavram (döngü, fonksiyon, değişken,
 *      sınırla) atlanmış mı; pinler doğru mu; tekrar sayısı tutuyor mu.
 *   3. GÜVENLİK — kolu bozan açılar, beklemesiz servo zinciri, beklemesiz
 *      sonsuz döngü.
 *
 * Doğrulama: 71 cevap anahtarının tamamı kendi kendine 100 puan alır
 * (yanlış alarm yok).
 */

import { calistir, bloklariAc, EKLEM_AD, MUFREDAT_PIN_EKLEM, type CalismaAlani, type BlokNode, type Olay } from './vm';
import { GUVENLI_ACI } from './hw-bench';

export type Onem = 'hata' | 'uyari' | 'ipucu' | 'iyi';

export interface Bulgu {
  onem: Onem;
  kod: string;
  /** Çocuğun anlayacağı kısa başlık. */
  baslik: string;
  /** Ne olduğu — teknik değil, gündelik dille. */
  aciklama: string;
  /** 1. kademe: yönlendiren soru. Cevabı vermez, düşündürür. */
  ipucu?: string;
  /** 2. kademe: somut düzeltme adımı. */
  cozum: string;
  /** 3. kademe: doğrudan cevap — hangi blok, hangi değer. */
  cevap?: string;
  /** Varsa: hatayı üreten bloğun id'si. Panel bu bloğu işaretler. */
  bid?: string;
}

export interface KontrolSonucu {
  puan: number;
  karar: 'tam' | 'kucuk_hata' | 'eksik' | 'yanlis' | 'bos';
  bulgular: Bulgu[];
  davranis: { puan: number; beklenen: number; eslesen: number; eksik: number; fazla: number } | null;
  senaryolar: Array<{ ad: string; puan: number }>;
  adimlar: Array<{ op: string; anahtar: string | null; ogrenci: string | null }>;
}

const PIN_OF = [4, 5, 6, 7];

/** Sensör kullanan görevler tek değerde ayırt edilemez → üç senaryo. */
const SENARYOLAR = [
  { ad: 'yakın', sensor: { mesafe: 3, pot: 5, ldr: 10, sicaklik: 20, buton: true, irKod: 70 } },
  { ad: 'orta', sensor: { mesafe: 20, pot: 50, ldr: 50, sicaklik: 24, buton: false, irKod: 0 } },
  { ad: 'uzak', sensor: { mesafe: 70, pot: 95, ldr: 90, sicaklik: 40, buton: false, irKod: 64 } },
];

const SENSOR_BLOKLARI = [
  'rx_ultrasonic_distance', 'rx_potentiometer', 'rx_ldr_read', 'rx_analog_read',
  'rx_digital_read', 'rx_button_pressed', 'rx_key_pressed',
  'rx_gamepad_pressed', 'rx_gamepad_just_pressed', 'rx_ir_read_code',
];

const CIKTI = ['servo', 'tone', 'rgb', 'relay', 'print', 'digital', 'pwm'];
const ciktiOlaylari = (iz: Olay[]) => iz.filter((e) => CIKTI.includes(e.k));

/** İki olayın "aynı iş" sayılması için imza. */
function imza(e: Olay): string {
  switch (e.k) {
    case 'servo': return `S${e.joint}:${e.val}`;
    case 'tone': return `T${Math.round((e.freq ?? 0) / 20)}`;
    case 'rgb': return `R${e.color ?? e.pin + ':' + e.val}`;
    case 'relay': return `L${e.val}`;
    case 'digital': return `D${e.pin}:${e.val}`;
    case 'pwm': return `W${e.pin}:${Math.round((e.val ?? 0) / 10)}`;
    case 'print': return `P${String(e.text ?? '').trim().toLowerCase().slice(0, 24)}`;
    default: return e.k;
  }
}

/** Yakın ama birebir olmayan eşleşme (açı ±20°, frekans ±%10). */
function yakin(a: Olay, b: Olay): boolean {
  if (a.k !== b.k) return false;
  if (a.k === 'servo') return a.joint === b.joint && Math.abs((a.val ?? 0) - (b.val ?? 0)) <= 20;
  if (a.k === 'tone') return Math.abs((a.freq ?? 0) - (b.freq ?? 0)) <= Math.max(20, (b.freq ?? 0) * 0.1);
  if (a.k === 'rgb' || a.k === 'print') return true;
  return false;
}

interface Adim { op: 'eq' | 'near' | 'eksik' | 'fazla'; anahtar?: Olay; ogrenci?: Olay }

/** En uzun ortak alt dizi ile hizalama — eksik/fazla/kayık adımları bulur. */
function hizala(a: Olay[], o: Olay[]): Adim[] {
  const n = a.length, m = o.length;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = imza(a[i]) === imza(o[j]) ? dp[i + 1][j + 1] + 2
        : yakin(a[i], o[j]) ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const cikti: Adim[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (imza(a[i]) === imza(o[j])) { cikti.push({ op: 'eq', anahtar: a[i], ogrenci: o[j] }); i++; j++; }
    else if (yakin(a[i], o[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) { cikti.push({ op: 'near', anahtar: a[i], ogrenci: o[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { cikti.push({ op: 'eksik', anahtar: a[i] }); i++; }
    else { cikti.push({ op: 'fazla', ogrenci: o[j] }); j++; }
  }
  while (i < n) cikti.push({ op: 'eksik', anahtar: a[i++] });
  while (j < m) cikti.push({ op: 'fazla', ogrenci: o[j++] });
  return cikti;
}

const RENK_AD: Record<string, string> = {
  '#ff0000': 'kırmızı', '#00ff00': 'yeşil', '#0000ff': 'mavi',
  '#ffff00': 'sarı', '#ff00ff': 'mor', '#00ffff': 'camgöbeği',
  '#ffffff': 'beyaz', '#000000': 'kapalı',
};
const renkAdi = (h?: string) => RENK_AD[String(h).toLowerCase()] ?? h ?? '?';

export function olayMetni(e: Olay): string {
  switch (e.k) {
    case 'servo': return `${EKLEM_AD[e.joint ?? 0]} → ${e.val}°`;
    case 'tone': return `buzzer ${e.freq} Hz · ${e.dur} ms`;
    case 'rgb': return `ışık ${renkAdi(e.color)}`;
    case 'relay': return `röle ${e.val ? 'açık' : 'kapalı'}`;
    case 'digital': return `D${e.pin} ${e.val ? 'HIGH' : 'LOW'}`;
    case 'pwm': return `D${e.pin} PWM %${e.val}`;
    case 'print': return `yazdır "${e.text}"`;
    default: return e.k;
  }
}

/* ══ ANA KONTROL ══════════════════════════════════════════════════ */

export async function gorevKontrol(
  ogrenci: CalismaAlani,
  anahtar: CalismaAlani,
  /** Öğrencinin kurulumundan gelen servo pini → eklem haritası.
   *  Verilmezse müfredat varsayılanı (D4-D7) kullanılır. Pin uyarıları
   *  bu haritaya göre yapılır; yoksa D10'a takan çocuk haksız yere
   *  "D10 pininde servo yok" uyarısı alırdı. */
  pinEklem?: Record<number, number>,
): Promise<KontrolSonucu> {
  const HARITA = pinEklem && Object.keys(pinEklem).length ? pinEklem : MUFREDAT_PIN_EKLEM;
  const PIN_ADI = (p: number) => EKLEM_AD[HARITA[p] ?? 0];
  const bulgular: Bulgu[] = [];
  const ekle = (
    onem: Onem, kod: string, baslik: string, aciklama: string,
    cozum: string, bid?: string, ipucu?: string, cevap?: string,
  ) => bulgular.push({ onem, kod, baslik, aciklama, cozum, bid, ipucu, cevap });

  const oBlok = bloklariAc(ogrenci);
  const aBlok = bloklariAc(anahtar);

  if (oBlok.length === 0) {
    return {
      puan: 0, karar: 'bos',
      bulgular: [{
        onem: 'hata', kod: 'BOS', baslik: 'Henüz hiç blok koymamışsın',
        aciklama: 'Çalışma alanı boş. Yukarıdaki görev metnini oku, sonra soldaki renkli kutulardan blokları sürüklemeye başla.',
        cozum: 'Önce 🔁 Akış kategorisinden "Başlangıçta" bloğunu al.',
        ipucu: 'Her program "Başlangıçta" bloğuyla başlar. Onu bulup ekrana sürükle.',
        cevap: '1) 🔁 Akış → "Başlangıçta" bloğunu sürükle.\n2) ⚙ Servo → "servo pin açı" bloğunu içine tak.\n3) ⏱ Zaman → "bekle" bloğunu altına ekle.',
      }],
      davranis: null, senaryolar: [], adimlar: [],
    };
  }

  const baslangic = oBlok.find((b) => b.type === 'rx_on_start');
  if (!baslangic) {
    ekle('hata', 'BASLANGIC', '"Başlangıçta" bloğu yok',
      'Blokların "Başlangıçta" bloğunun İÇİNE takılı olması gerekir. Şu haliyle karta yüklense bile hiçbiri çalışmaz.',
      'Toolbox → Akış → "Başlangıçta" bloğunu al, bütün zinciri içine sürükle.');
  } else if (!baslangic.inputs?.DO?.block) {
    ekle('hata', 'BOS_BASLANGIC', 'Blokların boşta duruyor',
      'Bloklar ekranda var ama "Başlangıçta" bloğuna takılı değil. Takılı olmayan bloklar hiç çalışmaz.',
      'Blokları sürükleyip "Başlangıçta" bloğunun içine yapıştır.',
      baslangic.id,
      'Bloklar lego gibi birbirine geçmeli. Seninkiler ayrı ayrı mı duruyor?',
      'Blok yığınını tut, "Başlangıçta" bloğunun ağzına götür — tık diye geçtiğini göreceksin.');
  }

  /* ── 1. HER SENARYODA İKİ PROGRAMI DA KOŞTUR ── */
  const sensorlu = [...aBlok, ...oBlok].some((b) => SENSOR_BLOKLARI.includes(b.type));
  const senaryolar = sensorlu ? SENARYOLAR : [SENARYOLAR[1]];

  const kosular = [];
  for (const s of senaryolar) {
    const [ak, ok] = await Promise.all([
      calistir(anahtar, { live: false, tohum: 20260831, sensor: s.sensor, pinEklem: HARITA }),
      calistir(ogrenci, { live: false, tohum: 20260831, sensor: s.sensor, pinEklem: HARITA }),
    ]);
    const ac = ciktiOlaylari(ak.iz), oc = ciktiOlaylari(ok.iz);
    const ad = hizala(ac, oc);
    const eq = ad.filter((x) => x.op === 'eq').length;
    const nr = ad.filter((x) => x.op === 'near').length;
    const puan = ac.length === 0 ? (oc.length === 0 ? 100 : 60)
      : Math.round(((eq + nr * 0.6) / ac.length) * 100);
    kosular.push({ ad: s.ad, ak, ok, ac, oc, adimlar: ad, eq, nr, puan });
  }

  const enKotu = kosular.reduce((a, b) => (b.puan < a.puan ? b : a));
  const davranisPuan = Math.round(kosular.reduce((s, k) => s + k.puan, 0) / kosular.length);
  const { ak, ok, ac, oc, adimlar } = enKotu;

  if (kosular.length > 1) {
    const iyi = kosular.filter((k) => k.puan >= 85).map((k) => k.ad);
    const kotu = kosular.filter((k) => k.puan < 85).map((k) => k.ad);
    if (iyi.length && kotu.length) {
      ekle('hata', 'ESIK', 'Karşılaştırma sayısı yanlış',
        `Programın ${iyi.join(' ve ')} durumunda doğru çalışıyor ama ${kotu.join(' ve ')} durumunda yanlış davranıyor. "Eğer" bloğundaki sayı doğru değil. Tek bir mesafede denersen bu hatayı göremezsin — o yüzden simülasyon üç farklı mesafede denedi.`,
        'Görev metnindeki sayıyı "eğer" bloğuna birebir yaz.',
        oBlok.find((b) => b.type === 'logic_compare')?.id,
        'Görev metninde bir sayı geçiyor (kaç santimden yakınsa...). Senin "eğer" bloğunda aynı sayı yazıyor mu?',
        'Görev metnindeki eşik sayısını bul ve karşılaştırma bloğuna aynısını yaz.');
    }
  }

  if (ok.hata) {
    ekle('hata', 'CALISMIYOR', 'Program çalışırken durdu',
      `Simülasyon şu hatayı verdi: ${ok.hata}`,
      'Blokların bağlantılarını kontrol et.');
  }

  if (oc.length === 0 && ac.length > 0) {
    ekle('hata', 'HAREKET_YOK', 'Hiçbir şey olmuyor',
      'Program çalıştı ama kol kıpırdamadı, ses çıkmadı, ışık yanmadı. Komut blokların ya boşta duruyor ya da hiç yok.',
      'Komut bloklarını "Başlangıçta" bloğunun içine tak.',
      undefined,
      'Bloklarına bak: hepsi birbirine geçmiş mi, yoksa bazıları kenarda mı duruyor?',
      'Önce "Başlangıçta" bloğunu koy, sonra servo bloklarını içine sürükle.');
  }

  /* ── 2. DAVRANIŞ FARKLARI ── */
  const eksikler = adimlar.filter((x) => x.op === 'eksik');
  const fazlalar = adimlar.filter((x) => x.op === 'fazla');

  for (const x of adimlar) {
    if (x.op !== 'near' || !x.anahtar || !x.ogrenci) continue;
    const a = x.anahtar, o = x.ogrenci;
    if (a.k === 'servo') {
      const fark = Math.abs((a.val ?? 0) - (o.val ?? 0));
      ekle(fark > 10 ? 'uyari' : 'ipucu', 'ACI', `${EKLEM_AD[a.joint ?? 0]} açısı biraz kaymış`,
        `Bu adımda ${EKLEM_AD[a.joint ?? 0].toLowerCase()} ${a.val}° olmalı, sende ${o.val}° yazıyor.`,
        `Açıyı ${a.val} yap.`, o.bid,
        'Görev metnindeki sayılarla blokların içindeki sayıları tek tek karşılaştır.',
        `İşaretli bloktaki ${o.val} sayısını ${a.val} yap.`);
    } else if (a.k === 'tone') {
      ekle('uyari', 'FREKANS', 'Buzzer frekansı farklı',
        `Beklenen ${a.freq} Hz, senin kodunda ${o.freq} Hz.`,
        `Frekansı ${a.freq} yap.`, o.bid);
    } else if (a.k === 'rgb' && a.color !== o.color) {
      const dogruPin = a.color === '#ff0000' ? 9 : a.color === '#00ff00' ? 10 : a.color === '#0000ff' ? 11 : 0;
      ekle('uyari', 'RENK', `${renkAdi(a.color)} yanmalıydı, ${renkAdi(o.color)} yanıyor`,
        'RGB LED\'in üç bacağı var ve her biri ayrı bir renk yakar. Bir pin karışmış görünüyor.',
        `Bu adımda ${renkAdi(a.color)} yanmalı.`, o.bid,
        'RGB LED bir ampul değil, üç ampul: kırmızı, yeşil, mavi. Hangi pinin hangi rengi yaktığını kodsuz simülasyondan deneyebilirsin.',
        `🌈 D9 = kırmızı · D10 = yeşil · D11 = mavi\n\n` +
        (dogruPin ? `${renkAdi(a.color)} için D${dogruPin} AÇIK, diğer ikisi kapalı olmalı.` : ''));
    }
  }

  if (eksikler.length) {
    const ornek = eksikler.slice(0, 4).map((x) => '• ' + olayMetni(x.anahtar!)).join('\n');
    // Eksik adımın kendisi bir bloğa ait değil (yok zaten). Ama boşluktan
    // HEMEN ÖNCEKİ öğrenci bloğunu işaretleyebiliriz: "buraya eklemelisin".
    const ilkEksikIdx = adimlar.findIndex((x) => x.op === 'eksik');
    let capa: string | undefined;
    for (let i = ilkEksikIdx - 1; i >= 0; i--) {
      const b = adimlar[i].ogrenci?.bid;
      if (b) { capa = b; break; }
    }
    const sonMu = ilkEksikIdx === adimlar.length - eksikler.length;
    const ilkEksik = eksikler[0].anahtar!;
    ekle(eksikler.length > ac.length * 0.35 ? 'hata' : 'uyari', 'EKSIK',
      eksikler.length === 1 ? 'Bir adım eksik kalmış' : `${eksikler.length} adım eksik kalmış`,
      `Görev şunları da yapmanı istiyor ama programında yoklar:\n${ornek}` +
      (eksikler.length > 4 ? `\n…ve ${eksikler.length - 4} tane daha.` : ''),
      capa ? 'İşaretli bloğun altına eksik komutları ekle.' : 'Eksik komutları sıraya ekle.',
      capa,
      'Görev metnini yukarıdan tekrar oku ve programınla adım adım karşılaştır. Hangi cümlenin karşılığı blokta yok?',
      `İlk eksik adım şu: ${olayMetni(ilkEksik)}` +
      (ilkEksik.k === 'servo'
        ? `\n\nYani: "servo pin D${PIN_OF[ilkEksik.joint ?? 0]} açı ${ilkEksik.val}" bloğunu ekle.`
        : ilkEksik.k === 'tone'
          ? `\n\nYani: "buzzer ${ilkEksik.freq} Hz · ${ilkEksik.dur} ms" bloğunu ekle.`
          : ''));
  }
  if (fazlalar.length > Math.max(2, ac.length * 0.4)) {
    ekle('ipucu', 'FAZLA', `${fazlalar.length} fazladan komut var`,
      'Cevap anahtarında olmayan komutlar çalışıyor. Yanlış olmayabilir ama görevi karmaşıklaştırıyor.',
      'Görev metnindeki adımlarla birebir eşleştir, gereksizleri sil.',
      fazlalar[0].ogrenci?.bid);
  }

  const aImza = ac.map(imza), oImza = oc.map(imza);
  if ([...aImza].sort().join('|') === [...oImza].sort().join('|') && aImza.join('|') !== oImza.join('|')) {
    ekle('uyari', 'SIRA', 'Komutlar doğru ama sıraları karışık',
      'Bütün hareketler var, ancak çalışma sırası farklı. Kolun izlediği yol değişiyor.',
      'Blokları görev metnindeki sıraya göre yeniden diz.');
  }

  /* ── 3. KAVRAM ── */
  const say = (l: BlokNode[], t: string) => l.filter((b) => b.type === t).length;
  const KAVRAMLAR = [
    { tip: ['controls_repeat_ext', 'controls_repeat', 'controls_for'], ad: 'tekrar bloğu',
      neden: 'Aynı komutları tek tek kopyalamışsın. Bu görev sana kısayolu öğretiyor: bir kez yaz, kaç kez tekrarlayacağını söyle.',
      ipucu: 'Aynı hareketi 5 kez yapacaksan, blokları 5 kez kopyalamak yerine ne kullanabilirsin?',
      cevap: '🔁 Akış kategorisinden "tekrarla" bloğunu al. Kopyaladığın blokların BİR TANESİNİ içine koy, kalanları sil, tekrar sayısını yaz.' },
    { tip: ['procedures_defnoreturn', 'procedures_defreturn'], ad: 'fonksiyon',
      neden: 'Aynı hareket grubunu programın birkaç yerinde tekrarlıyorsun. Fonksiyon, o gruba bir isim verip her yerde o ismi çağırmanı sağlar.',
      ipucu: 'Bir hareket grubuna isim verebilseydin, sonra sadece ismini söyleyerek çağırabilirdin. Hangi kategoride?',
      cevap: '🧩 Fonksiyonlar kategorisinden "bir şey yap" bloğunu al, adını yaz, tekrar eden blokları içine taşı. Sonra o adı istediğin yere sürükle.' },
    { tip: ['variables_set'], ad: 'değişken',
      neden: 'Aynı sayıyı birçok blokta tekrar tekrar yazmışsın. Değişken, o sayıya bir isim verip tek yerden değiştirmeni sağlar.',
      ipucu: 'Bir sayıyı 6 blokta kullanıyorsun. Sonra fikrini değiştirirsen 6 yeri de tek tek düzeltmen gerekir. Daha kolay yolu ne?',
      cevap: '📦 Değişkenler kategorisinden yeni bir değişken oluştur, başlangıçta değerini ayarla, sonra sayı yerine değişkeni sürükle.' },
    { tip: ['controls_if'], ad: '"eğer" bloğu',
      neden: 'Bu görevde robot bir karar vermeli: sensör şunu söylerse şunu yap, demezse başka bir şey yap.',
      ipucu: 'Robot mesafeyi ölçüyor. Peki ölçtüğü sayıya göre farklı davranmasını nasıl sağlarsın?',
      cevap: '🔁 Akış kategorisinden "eğer ... ise" bloğunu al. Sensör bloğunu ve karşılaştırma bloğunu koşul yerine tak.' },
    { tip: ['math_constrain'], ad: '"sınırla" bloğu',
      neden: 'Açı bir değişkenden geliyor ve güvenli aralığın dışına çıkabilir. "Sınırla" bloğu kolu korur.',
      ipucu: 'Değişkenin değeri yanlışlıkla 200 olursa ne olur? Bunu nasıl engellersin?',
      cevap: '🔢 Matematik kategorisinden "sınırla" bloğunu al, değişkeni içine koy, alt sınır 30 üst sınır 150 yaz.' },
    { tip: ['rx_forever', 'controls_whileUntil'], ad: '"sürekli tekrarla" bloğu',
      neden: 'Sensör bir kez değil, sürekli okunmalı. Programın hiç durmadan dönmesi gerekiyor.',
      ipucu: 'Program bir kez çalışıp bitiyor. Sensörü sürekli dinlemesini nasıl sağlarsın?',
      cevap: '🔁 Akış kategorisinden "sürekli tekrarla" bloğunu al, sensör okuma ve karar bloklarını içine koy.' },
  ];
  for (const k of KAVRAMLAR) {
    const a = k.tip.reduce((s, t) => s + say(aBlok, t), 0);
    const o = k.tip.reduce((s, t) => s + say(oBlok, t), 0);
    if (a > 0 && o === 0) {
      ekle('hata', 'KAVRAM', k.ad.charAt(0).toLocaleUpperCase('tr') + k.ad.slice(1) + ' kullanman gerekiyor',
        k.neden,
        `Blok kutusundan ${k.ad} al, tekrar eden komutları içine koy.`,
        baslangic?.id,
        k.ipucu,
        k.cevap);
    }
  }

  const aTekrar = aBlok.find((b) => b.type === 'controls_repeat_ext');
  const oTekrar = oBlok.find((b) => b.type === 'controls_repeat_ext');
  if (aTekrar && oTekrar) {
    const an = tekrarSayisi(aTekrar), on = tekrarSayisi(oTekrar);
    if (an != null && on != null && an !== on) {
      ekle('uyari', 'TEKRAR', 'Tekrar sayısı yanlış',
        `Görev hareketin ${an} kez tekrarlanmasını istiyor, senin tekrar bloğunda ${on} yazıyor.`,
        `Tekrar bloğundaki sayıyı ${an} yap.`, oTekrar.id,
        'Görev metnini oku: kaç kez git-gel yapması gerekiyor?',
        `Sarı çerçeveli tekrar bloğundaki ${on} sayısını ${an} yap.`);
    }
  }

  /* ── 4. PİN ── */
  // PicoBricks'te servolar rx_servo_v2 ile sürülür; pin yerine kanal
  // numarası (SERVO_NUM) taşır. İki blok tipi de aynı şekilde denetlenir.
  const servoBlok = (l: BlokNode[]) => l.filter((b) => b.type === 'rx_servo_angle' || b.type === 'rx_servo_v2');
  const servoPin = (b: BlokNode) =>
    Number((b.fields as Record<string, unknown>)?.PIN ?? (b.fields as Record<string, unknown>)?.SERVO_NUM);
  const oPin = new Set(servoBlok(oBlok).map(servoPin));
  const aPin = new Set(servoBlok(aBlok).map(servoPin));

  for (const b of servoBlok(oBlok)) {
    const p = servoPin(b);
    if (!(p in HARITA)) {
      const liste = Object.keys(HARITA)
        .map((x) => `D${x} (${EKLEM_AD[HARITA[Number(x)]].toLowerCase()})`).join(', ');
      ekle('hata', 'PIN_YOK', `D${p} pininde servo yok`,
        `Servo bloğunda D${p} yazıyor. Senin kurulumunda servolar şu pinlerde: ${liste}.`,
        'Bloğun pin numarasını kurulumundaki pinlerden biriyle değiştir.', b.id,
        'Kurulum sekmesinden hangi pinleri seçtiğine bak.',
        `Kullanılabilir pinler: ${liste}`);
    }
  }
  // Anahtarda olup öğrencide olmayan pinler
  const eksikPin = [...aPin].filter((p) => !oPin.has(p));
  // Öğrencide olup anahtarda olmayan pinler
  const fazlaPin = [...oPin].filter((p) => !aPin.has(p));

  for (const p of eksikPin) {
    const eklemAd = PIN_ADI(p);
    // Öğrenci doğru pin yerine BAŞKA bir pin yazmışsa bu bir yazım hatasıdır;
    // "eksik" demek yerine yanlış bloğu gösterip doğru pini söylemek gerekir.
    const karisan = fazlaPin.length === eksikPin.length ? fazlaPin[eksikPin.indexOf(p)] : undefined;
    const yanlisBlok = karisan !== undefined
      ? servoBlok(oBlok).find((b) => Number(b.fields?.PIN) === karisan)
      : undefined;

    if (yanlisBlok) {
      ekle('hata', 'PIN_KARISIK', 'Yanlış parçayı oynatıyorsun',
        `Bu görev ${eklemAd.toLowerCase()} eklemini oynatmanı istiyor. Ama senin bloğunda D${karisan} yazıyor — o pin ${EKLEM_AD[MUFREDAT_PIN_EKLEM[karisan!] ?? 0].toLowerCase()} eklemine bağlı. Kol yanlış yere kıpırdıyor.`,
        `İşaretli bloğun pin numarasını ${p} yap.`, yanlisBlok.id,
        'Her eklem kartta ayrı bir pine bağlı. Kodsuz simülasyonu açıp kaydırıcıları oynatırsan hangi pinin neyi kıpırdattığını görebilirsin.',
        `🔌 Pin haritası: D4 taban · D5 omuz · D6 dirsek · D7 tutucu\n\nKırmızı çerçeveli bloktaki D${karisan} sayısını ${p} yap.`);
    } else {
      ekle('uyari', 'PIN_EKSIK', `${eklemAd} servosu (D${p}) hiç kullanılmamış`,
        `Görev ${eklemAd} eklemini de hareket ettirmeni istiyor ama D${p} pinine tek komut gitmiyor.`,
        `D${p} pinli bir servo bloğu ekle.`);
    }
  }
  for (const b of servoBlok(oBlok)) {
    const p = servoPin(b);
    if (aPin.size && !aPin.has(p) && p in HARITA) {
      ekle('ipucu', 'PIN_FAZLA', `${PIN_ADI(p)} (D${p}) bu görevde gerekli değil`,
        'Cevap anahtarı bu eklemi hiç oynatmıyor — yanlış eklemi sürüyor olabilirsin.',
        'Gerekli değilse bu bloğu kaldır.', b.id);
    }
  }

  /* ── 5. GÜVENLİK: açı ── */
  const guvensiz = ok.iz.filter((e) => {
    if (e.k !== 'servo') return false;
    const [lo, hi] = GUVENLI_ACI[e.joint ?? 0] ?? [0, 180];
    const v = e.ham ?? e.val ?? 90;
    return v < lo || v > hi;
  });
  if (guvensiz.length) {
    const g = guvensiz[0];
    const [lo, hi] = GUVENLI_ACI[g.joint ?? 0];
    ekle('hata', 'GUVENLIK', 'Bu açı kolu kırabilir',
      `${EKLEM_AD[g.joint ?? 0]} eklemine ${g.ham ?? g.val}° yazmışsın. Bu eklem sadece ${lo}° ile ${hi}° arasında dönebilir. Daha fazlasını zorlarsan gerçek kolda dişliler takılır ve servo bozulur.` +
      (guvensiz.length > 1 ? ` Bu ${guvensiz.length} yerde oluyor.` : ''),
      `Açıyı ${lo} ile ${hi} arasında bir sayı yap.`, g.bid,
      `Kolunu arkaya doğru ne kadar bükebilirsin? Robotun da bir sınırı var. Bu eklem için sınır ${lo}–${hi}°.`,
      `Kırmızı çerçeveli bloktaki sayıyı ${g.joint === 3 ? (Number(g.ham ?? g.val) < lo ? lo + 10 : hi - 10) : (Number(g.ham ?? g.val) < lo ? lo : hi)} veya yakın bir değer yap.`);
  }

  /* ── 6. GÜVENLİK: bekleme ──
     "Simülasyonda çalıştı ama gerçek kolda tutmadı" şikâyetinin 1 numaralı
     sebebi. Bekleme bir çıktı olayı olmadığı için davranış karşılaştırması
     bunu göremez; ayrı ölçülür. */
  const beklemeler = (r: typeof ok) => r.iz.filter((e) => e.k === 'wait' && (e.ms ?? 0) >= 100);
  const aBek = beklemeler(ak), oBek = beklemeler(ok);
  const aBekMs = aBek.reduce((s, e) => s + (e.ms ?? 0), 0);
  const oBekMs = oBek.reduce((s, e) => s + (e.ms ?? 0), 0);

  const zincirBoyu = (r: typeof ok): { en: number; bid?: string } => {
    let c = 0, en = 0, bid: string | undefined, ilk: string | undefined;
    for (const e of r.iz) {
      if (e.k === 'servo') { if (c === 0) ilk = e.bid; c++; if (c > en) { en = c; bid = ilk; } }
      else if ((e.k === 'wait' && (e.ms ?? 0) >= 100) || e.k === 'tone') c = 0;
    }
    return { en, bid };
  };
  const oZ = zincirBoyu(ok), aZ = zincirBoyu(ak);

  if (aBek.length > 0 && oBek.length === 0) {
    ekle('hata', 'BEKLEME_YOK', 'Bekleme bloğu koymayı unutmuşsun',
      'Robot kol bir yere gitmek için zamana ihtiyaç duyar. Sen ona "şuraya git" deyip hemen ardından "hayır, şuraya git" diyorsun. Kol yola çıkıyor ama varamadan yeni emir geliyor — sonuçta ara duraklara hiç uğramıyor.',
      `Her servo bloğunun altına bir "bekle" bloğu koy. Bu görevde ${aBek.length} tane gerekiyor.`,
      oZ.bid,
      'Sen de yürürken "sağa git" desem, adım atmadan hemen "sola git" desem ne olurdu? Kola adım atacak zaman nasıl verirsin?',
      `⏱ Zaman kategorisinden "bekle" bloğunu al. Her servo bloğunun ALTINA bir tane koy ve içine ${Math.round((aBekMs / Math.max(1, aBek.length)))} yaz (milisaniye).`);
  } else if (oZ.en >= 3 && oZ.en > aZ.en + 1) {
    ekle('uyari', 'BEKLEME_AZ', 'Servo komutları arasında bekleme eksik',
      `${oZ.en} servo komutu peş peşe, aralarında bekleme olmadan çalışıyor (cevap anahtarında en fazla ${aZ.en} tane). Kol bu hareketleri tek sıçramada birleştirir.`,
      'Peş peşe servo bloklarının arasına "bekle 500 ms" koy.', oZ.bid);
  } else if (aBekMs > 0 && oBekMs > 0 && oBekMs < aBekMs * 0.5) {
    ekle('ipucu', 'BEKLEME_KISA', 'Beklemeler çok kısa',
      `Programın toplam ${(oBekMs / 1000).toFixed(1)} sn bekliyor, cevap anahtarı ${(aBekMs / 1000).toFixed(1)} sn. Gerçek servo 60°'lik bir hareketi yaklaşık 0,3-0,5 sn'de tamamlar.`,
      'Bekleme sürelerini uzat.');
  }

  /* ── 7. Beklemesiz sonsuz döngü ── */
  const dongu = oBlok.find((b) => b.type === 'rx_forever' || b.type === 'controls_whileUntil');
  if (dongu) {
    const ic = bloklariAc({ blocks: { blocks: [dongu] } });
    const bekliyor = ic.some((b) => b.type === 'rx_delay_ms' || b.type === 'rx_delay_s' || b.type === 'rx_buzzer_tone');
    if (!bekliyor) {
      ekle('uyari', 'DONGU', '"Sürekli tekrarla" içinde bekleme yok',
        'Döngü saniyede binlerce kez dönüyor. Sensör okumaları taşar, servo komutları üst üste biner.',
        'Döngünün sonuna "bekle 50-200 ms" ekle.', dongu.id);
    }
  }

  /* ── 8. Yazdırma ── */
  if (ak.ciktilar.length && !ok.ciktilar.length) {
    ekle('ipucu', 'YAZDIRMA', 'Seri monitöre yazdırma yok',
      `Cevap anahtarı ${ak.ciktilar.length} satır yazdırıyor (ör. "${ak.ciktilar[0]}").`,
      '"yazdır" bloğuyla durum mesajı ekle.');
  }

  /* ── 9. Aynı bulguyu tekrarlama ── */
  const gorulen = new Map<string, Bulgu & { __n?: number }>();
  const tekil: Array<Bulgu & { __n?: number }> = [];
  for (const b of bulgular) {
    const k = b.kod + '|' + b.baslik;
    const v = gorulen.get(k);
    if (v) { v.__n = (v.__n ?? 1) + 1; continue; }
    const y = { ...b, __n: 1 };
    gorulen.set(k, y);
    tekil.push(y);
  }
  const son: Bulgu[] = tekil.map((b) => {
    const { __n, ...rest } = b;
    if ((__n ?? 1) > 1) rest.aciklama += `\n\nAynı hata programda ${__n} yerde tekrarlanıyor.`;
    return rest;
  });

  /* ── 10. Çift ceza temizliği ── */
  const pinHatasi = son.some((f) => f.kod === 'PIN_YOK' || f.kod === 'PIN_EKSIK' || f.kod === 'PIN_KARISIK');
  if (pinHatasi) {
    for (const f of son) {
      if (f.kod === 'EKSIK' && f.onem === 'hata') f.onem = 'uyari';
      if (f.kod === 'FAZLA') f.onem = 'ipucu';
      if (f.kod === 'PIN_FAZLA') f.onem = 'ipucu';
    }
  }

  /* ── PUAN ── */
  const AGIRLIK: Record<Onem, number> = { hata: 22, uyari: 9, ipucu: 3, iyi: 0 };
  let puan = Math.round(davranisPuan * 0.6 + 40);
  for (const f of son) puan -= AGIRLIK[f.onem];
  puan = Math.max(0, Math.min(100, puan));
  if (son.length === 0) puan = 100;

  const SIRA: Record<Onem, number> = { hata: 0, uyari: 1, ipucu: 2, iyi: 3 };
  son.sort((a, b) => SIRA[a.onem] - SIRA[b.onem]);

  if (puan >= 90) {
    son.unshift({
      onem: 'iyi', kod: 'TAMAM', baslik: 'Görev çalışıyor',
      aciklama: `Sanal kolda çalıştırıldı: beklenen ${ac.length} hareketin ${enKotu.eq + enKotu.nr} tanesi doğru üretildi. Gerçek kola geçebilirsin.`,
      cozum: '',
    });
  }

  return {
    puan,
    karar: puan >= 90 ? 'tam' : puan >= 70 ? 'kucuk_hata' : puan >= 45 ? 'eksik' : 'yanlis',
    bulgular: son,
    davranis: {
      puan: davranisPuan, beklenen: ac.length,
      eslesen: enKotu.eq + enKotu.nr, eksik: eksikler.length, fazla: fazlalar.length,
    },
    senaryolar: kosular.map((k) => ({ ad: k.ad, puan: k.puan })),
    adimlar: adimlar.slice(0, 60).map((x) => ({
      op: x.op,
      anahtar: x.anahtar ? olayMetni(x.anahtar) : null,
      ogrenci: x.ogrenci ? olayMetni(x.ogrenci) : null,
    })),
  };
}

function tekrarSayisi(n: BlokNode): number | null {
  const t = n.inputs?.TIMES;
  const b = t?.block || t?.shadow;
  const v = b?.fields?.NUM;
  return v == null ? null : Number(v);
}

export function kararMetni(k: KontrolSonucu['karar']): string {
  return {
    tam: 'Görev tamam',
    kucuk_hata: 'Küçük düzeltme gerek',
    eksik: 'Eksik adımlar var',
    yanlis: 'Görev henüz karşılanmıyor',
    bos: 'Program boş',
  }[k];
}

export { PIN_OF };
