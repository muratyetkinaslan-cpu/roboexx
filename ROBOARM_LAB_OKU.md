# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Tam proje. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

---

## 🧊 Bu turda

### 1. Küp artık .3mf'in KENDİSİ

Geçen sefer ölçüleri doğru ama şekli yaklaşıktı (kutu + koni oyuklar).
Şimdi `ku_p.3mf` dosyasının **gerçek mesh'i** kullanılıyor:

```
8450 köşe / 16896 üçgen
ölçü      2.500 × 2.500 × 2.500 cm  →  25.0 mm ✓
merkezde  ✓ (three.js y-yukarı düzenine çevrildi)
oyuklar   +X yüzeyinde 78 köşe — detay korunmuş ✓
```

Mesh `public/robot/kup-mesh.json` dosyasında (375 KB, gzip 83 KB),
`arm-sim.html` açılışta `fetch` ile yüklüyor. Kaynak `.3mf` dosyası da
`public/robot/ku_p.3mf` içinde duruyor.

Başka küp boyutu seçilirse aynı mesh ölçekleniyor — şekil bozulmuyor.

### 2. Sehpa kaldırıldı, küp sürükleniyor

Küpün altındaki siyah kutu tamamen silindi. Küp **doğrudan zeminde**
duruyor.

**Küpe basıp çekince istediğin yere taşınıyor.** İmleç küpün üstüne
gelince el işaretine dönüşüyor. Masa sınırı 28 cm. Kol küpü tutuyorsa
sürüklenmiyor (önce bıraktırman gerekiyor).

### 3. Kodsuz modda gerçek kol birlikte oynuyor

Kodsuz tezgâhın en üstüne anahtar kondu:

> 🔗 **Gerçek kol BİRLİKTE oynuyor** — kaydırıcıyı çektiğinde açı anında
> karta gidiyor

Kart bağlı değilse "⛓️‍💥 Kart bağlı değil — sadece simülasyon" yazıyor ve
anahtar pasif kalıyor. Yeşil nokta bağlantı canlıyken yanıp sönüyor.
Tercih hatırlanıyor. "Hazır duruş" düğmesi de aynı anahtara uyuyor.

---

## Kavrama: sim ile gerçek aynı açıda tutar

Servo açısı **milimetre çene açıklığına** çevriliyor, küpün 25 mm'sine
göre karar veriliyor. Tutucunuzun iki noktasını **⚙️ Kurulum → 🧊 Küp**
sekmesinde ölçüp giriyorsunuz; panel size şunu yazıyor:

> **🤏 25 mm küpü tutmak için: tutucu 120°** · Bırakmak için: 132°

```
Varsayılan tutucu (82°=0mm → 150°=45mm)
  15 mm → 105°   25 mm → 120°   35 mm → 135°
  20 mm → 112°   30 mm → 127°   40 mm → 142°

Farklı tutucu (öğretmen ölçtü: 40°=2mm · 130°=38mm)
  25 mm küp → 98°  ·  doğrulama: 98°'de çene 25.2 mm ✓
```

---

## Önceki turlardan

**Kodlu mod** — solda bloklar, sağda üstte kol / altta üç sekme
(Görev & Hata · 🔌 Donanım · ⚙️ Kurulum). Çubuklar sürüklenebilir.

**Çıkış şeridi** — Görev sekmesinin üstünde RGB, buzzer, röle, sensörler.

**Donanım sekmesi** — RGB yanar, buzzer **gerçekten öter**, röle çeker.
Mesafe/LDR/pot/sıcaklık kaydırıcıları, IR kumanda tuşları, buton.

**⚙️ Kurulum** — kart (Arduino · RoboBricks · Raspberry/Waveshare normal
servo; PicoBricks "Sürücü Servo"), servo pinleri, donanım pinleri, küp ve
tutucu kalibrasyonu. Cevap anahtarları seçime göre çevrilir.

**🎯 Kalibre et** · **hatalar tek tek sırayla** (💡 İpucu → 🔎 Ne
yapmalıyım → ✅ Cevap) · **blok üstünde hata işareti** · **blok sesleri** ·
**👁 Görünüm** · **71 görevlik kütüphane** · **hedefe göre blok kutusu** ·
**USB/BLE seçim listesi** · **sakin topbar teması**.

---

## Test sonuçları

```
KÜP MESH       8450 köşe · 25.0 mm · merkezde · oyuklar korunmuş ✓
SEHPA          kalıntı yok ✓ · küp zeminde, sürüklenebilir
SİM ELEMANLARI eksik id yok · tüm fonksiyonlar yerinde ✓
KAVRAMA        6 boyut + özel kalibrasyon · hesap doğrulandı ✓
KURULUM        71 anahtar × 3 kurulum = 213/213 · hepsi 100
KÜTÜPHANE      71 görev · 71/71 çalışıyor
BUILD          ✓ tsc temiz · vite build başarılı
```

## Yeni ve değişen dosyalar

```
YENİ  public/robot/kup-mesh.json    .3mf'ten çıkarılmış gerçek mesh
YENİ  public/robot/ku_p.3mf         kaynak dosya
YENİ  src/robotarm/setup.ts         kart · pin · küp/tutucu kalibrasyonu
YENİ  src/components/SetupBar.tsx   kurulum · kalibrasyon · donanım · çıkış şeridi

DEĞİŞTİ  public/robot/arm-sim.html  gerçek mesh · sehpasız · sürüklenebilir küp
DEĞİŞTİ  src/components/ManualBench.tsx     gerçek kolla birlikte oynatma
DEĞİŞTİ  src/robotarm/vm.ts · checker.ts · hw-bench.ts
DEĞİŞTİ  src/components/RobotArmPanel.tsx · BlocklyWorkspace.tsx · Toolbar.tsx
DEĞİŞTİ  src/styles.css
```
