# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Tam proje. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

Yeni paket eklenmedi. `tsc` + `vite build` çalıştırıldı, build başarılı.

---

## Bu turda düzeltilenler

### 🔴 Kol görünmüyordu + Çalıştır çalışmıyordu — AYNI SEBEP

Bir önceki turda `arm-sim.html` içinden "Küp Koy / Öğret / Tekrarla /
Hedefe Git / Demo / Küpü Tut" düğmelerini **DOM'dan sildim**. Ama sayfanın
JavaScript'i o düğmelere hâlâ bağlanıyordu:

```js
document.getElementById('demo').addEventListener('click', ...)
```

Eleman yok olunca `null.addEventListener` hatası fırladı ve **script komple
durdu**. Üç sonucu birden oldu:

- 3B sahne hiç çizilmedi → **kol görünmüyordu**
- `rx:ready` gönderilemedi → panel "yükleniyor"da takıldı
- `hazirMi={simReady}` false kaldığı için **▶ Çalıştır devre dışıydı**

**Düzeltme:** Düğmeler DOM'a geri kondu, `display:none` ile gizlendi.
Görünmüyorlar, JS de patlamıyor.

**Doğrulama:** Script'in kullandığı 17 `getElementById` ve 4 `querySelector`
hedefi tek tek tarandı — hepsi HTML'de mevcut, eksik yok.

**Ayrıca sağlamlaştırıldı:**
- ▶ Çalıştır artık simülasyonun hazır olmasına bağlı değil. Program sanal
  donanımda koşuyor, simülasyon sadece gösterim. (three.js CDN'den geliyor —
  internetsiz sınıfta çocuk hiç çalıştıramazdı.)
- `rx:ready` riskli koddan **önce** de gönderiliyor.

**Uçtan uca test — "görev seç → Çalıştır":**
```
1) SİMÜLASYON  → 3 eklem komutu · hata yok · son poz Taban 150°
2) KONTROL     → 78/100 · 1 sorun
   "Bekleme bloğu koymayı unutmuşsun" → blok b2 · ipucu ✓ · cevap ✓
```

### 🔌 USB/BLE seçim listesi oldu
Topbar'daki iki düğmelik toggle tek açılır listeye indirildi
(🔌 USB / 📶 BLE). Bağlıyken devre dışı kalıyor, yer kaplamıyor.

---

## Önceki turlarda yapılanlar

1. **Kütüphane 20 → 71 görev** — müfredatın tamamı cevap anahtarlarıyla,
   hepsi normal servo bloklarıyla (`rx_arm_*` yok).
2. **Kodlu modda donanım görünüyor** — RGB, buzzer, sensör kaydırıcıları.
3. **Hata paneli simülasyonun altında** — sağ taraf yatayda ikiye bölük.
4. **Üç alan da sürüklenebilir:**
```
┌──────────────┬╫┬──────────────────┐
│   BLOKLAR    │║│   ROBOT KOL      │
│              │║├══════════════════┤ ← sürükle
│              │║│  GÖREV + HATA    │
└──────────────┴╫┴──────────────────┘
                 ↑ sürükle
```
5. **👁 Görünüm menüsü** — Servo Kontrolü panelinin tamamı ya da parçaları
   (dört kaydırıcı, seri satırı, düğme, durum, koordinat) tek tek gizlenir.
6. **Yardım metni kaldırıldı** — "Eklemler / Küp Koy / Küpü Tut / Öğret /
   Tekrarla / Kol küçük…" kutusu ve ipucu satırı silindi.
7. **Menü z-index düzeltildi** — simülasyon açıkken topbar menüleri açılıyor.
8. **Hatalar tek tek, sırayla** — bir sorun düzeltilince sıradaki çıkar.
   Yardım üç kademeli: 💡 İpucu → 🔎 Ne yapmalıyım → ✅ Cevap.
9. **Blok kutusu hedefe göre filtreleniyor** — MicroPython/Arduino'da kit
   kategorileri gizli; RoboPANZER'de sadece RoboPANZER, RoboCYTRON'da
   sadece RoboCYTRON.

---

## Test sonuçları

```
KÜTÜPHANE      71 görev · 71/71 çalışıyor · rx_arm kalıntısı yok
YANLIŞ ALARM   71/71 cevap anahtarı kendini 100 aldı
SİM ELEMANLARI 17 id + 4 querySelector · eksik yok
TOOLBOX        micropython ok · berrybot ok · robocytron ok
BUILD          ✓ vite build başarılı (zip'ten çıkarılıp tekrar denendi)
```

## Değişen ve eklenen dosyalar

```
YENİ  public/cevap_anahtari/roboarm-gorevler.json
YENİ  src/robotarm/vm.ts · checker.ts · tasks.ts · hw-bench.ts · block-marks.ts
YENİ  src/components/ArmTaskBar.tsx · ManualBench.tsx

DEĞİŞTİ  src/components/RobotArmPanel.tsx    kodlu/kodsuz + görünüm + bölme
DEĞİŞTİ  src/components/BlocklyWorkspace.tsx hedefe göre toolbox
DEĞİŞTİ  src/components/Toolbar.tsx          USB/BLE seçim listesi
DEĞİŞTİ  src/blockly/toolbox.ts              toolboxForTarget()
DEĞİŞTİ  src/library/roboarm-tasks.ts        20 → 71 görev
DEĞİŞTİ  src/App.tsx                         mod + dikey uzatma çubuğu
DEĞİŞTİ  src/styles.css                      stiller + menü z-index
DEĞİŞTİ  public/robot/arm-sim.html           yardım metni yok, rx:ui, düğmeler gizli
```
