# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Değişiklikler uygulanmış **tam RoboExx projesi**. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

Yeni paket eklenmedi. `npx tsc --noEmit` + `npx vite build` çalıştırıldı,
build başarılı; TS hata sayısı değişiklikten önceki halle aynı (23, hepsi
Blockly 11'in kendi tip uyumsuzlukları).

---

## Bu turdaki 8 düzeltme

### 1. Eğitmen kütüphanesi: 20 değil, 71 görev
`src/library/roboarm-tasks.ts` elle yazılmış 20 görev içeriyordu. Artık
müfredatın **71 görevinin tamamı** cevap anahtarlarıyla orada
(1. İlk Hareket … 71. Mezuniyet). Hepsi normal servo bloklarıyla.
**Test: 71/71 görev simülasyonda çalışıyor, rx_arm_* kalıntısı yok.**

### 2. Kodlu modda donanım görünüyor
RGB, buzzer, sensör kaydırıcıları artık kodlu modda da var — kodun doğru
çalışıp çalışmadığını oradan görüyorsunuz.

### 3. Robot kol görünmüyor sorunu düzeltildi
Görev/hata çubuğu blok sütununa konmuştu ama o sütun `display:flex`
değildi; çubuk tüm alanı kaplayıp kolu ittiriyordu. Çubuk artık
simülasyonun altında (aşağıya bakın).

### 4. Hata paneli simülasyonun altında
Sağ taraf yatayda ikiye bölündü: üstte robot kol, altta görev metni +
▶ Çalıştır + hata. Aradaki çubuk sürüklenebilir.

### 5. Üç alan da sürüklenerek ayarlanıyor
```
┌──────────────┬╫┬──────────────────┐
│              │║│   ROBOT KOL      │
│   BLOKLAR    │║├══════════════════┤ ← sürükle
│              │║│  GÖREV + HATA    │
└──────────────┴╫┴──────────────────┘
                 ↑ sürükle
```
İki tercih de hatırlanıyor.

### 6. Servo Kontrolü paneli gizlenebilir — tamamı ya da parça parça
Simülasyonun sağ üstünde **👁 Görünüm** düğmesi. Panelin tamamını
kapatabilir ya da tek tek gizleyebilirsiniz: taban / omuz / dirsek /
tutucu kaydırıcısı, seri satırı, Sıfırla düğmesi, durum satırı,
koordinatlar. Seçim hatırlanıyor.

### 7. Şu metin komple kaldırıldı
`arm-sim.html` içindeki "Eklemler / Küp Koy / Küpü Tut / Öğret /
Tekrarla / Kol küçük…" yardım kutusu ve üstteki ipucu satırı silindi.
Küp Koy, Öğret, Tekrarla, Hedefe Git, Demo, Küpü Tut düğmeleri de
kaldırıldı — sadece Sıfırla kaldı.

### 8. Simülasyon açıkken menüler açılmıyordu
`.tb-dd-menu` z-index 200'dü ama simülasyon iframe'i kendi yığın bağlamını
kurup üstünü örtüyordu. `.toolbar`'a `position:relative; z-index:100`,
`.workspace-area`'ya `z-index:0` verildi. Menüler artık her durumda açılıyor.

### Ayrıca: hatalar tek tek, sırayla
Bir seferde **tek sorun** gösteriliyor. Çocuk onu düzeltip tekrar
çalıştırınca sıradaki çıkıyor:

> **Bekleme bloğu koymayı unutmuşsun**
> Robot kol bir yere gitmek için zamana ihtiyaç duyar…
> [💡 İpucu ver] → [🔎 Ne yapmalıyım?] → [✅ Cevabı göster]
>
> *Önce bunu düzelt, sonra tekrar ▶ Çalıştır'a bas. Sonra 2 şeye daha bakacağız.*

### Ve: blok kutusu hedefe göre filtreleniyor
MicroPython/Arduino → RoboPANZER ve RoboCYTRON gizli.
RoboPANZER → sadece RoboPANZER. RoboCYTRON → sadece RoboCYTRON.

---

## Test sonuçları

```
KÜTÜPHANE      71 görev · 71/71 çalışıyor · rx_arm kalıntısı yok
YANLIŞ ALARM   71/71 cevap anahtarı kendini 100 aldı
TOOLBOX        micropython ok · berrybot ok · robocytron ok
BUILD          ✓ tsc temiz · vite build başarılı
```

---

## Değişen ve eklenen dosyalar

```
YENİ  public/cevap_anahtari/roboarm-gorevler.json   71 görev + cevap anahtarı
YENİ  src/robotarm/vm.ts                            blok yorumlayıcı
YENİ  src/robotarm/checker.ts                       görev kontrolü + kademeli ipucu
YENİ  src/robotarm/tasks.ts                         görev yükleyici
YENİ  src/robotarm/hw-bench.ts                      sanal donanım
YENİ  src/robotarm/block-marks.ts                   blok üstü hata işaretleme
YENİ  src/components/ArmTaskBar.tsx                 görev + hata paneli
YENİ  src/components/ManualBench.tsx                kodsuz tezgâh

DEĞİŞTİ  src/components/RobotArmPanel.tsx           kodlu/kodsuz + görünüm + bölme
DEĞİŞTİ  src/components/BlocklyWorkspace.tsx        hedefe göre toolbox
DEĞİŞTİ  src/blockly/toolbox.ts                     toolboxForTarget()
DEĞİŞTİ  src/library/roboarm-tasks.ts               20 → 71 görev
DEĞİŞTİ  src/App.tsx                                mod + dikey uzatma çubuğu
DEĞİŞTİ  src/styles.css                             yeni stiller + menü z-index
DEĞİŞTİ  public/robot/arm-sim.html                  yardım metni kaldırıldı, rx:ui
```

## Yapamadığım tek şey

**USB/BLE bölümünü option list yapma** — o arayüzü kod tabanında
bulamadım (`Toolbar.tsx`/`ActivityRail.tsx` içinde arattım, USB/BLE
etiketli bir bölüm çıkmadı). Ekran görüntüsü ya da hangi panelde
olduğunu söylerseniz onu da yaparım.
