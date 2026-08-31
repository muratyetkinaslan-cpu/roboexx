# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Tam proje. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

Yeni paket eklenmedi. `tsc` + `vite build` çalıştırıldı, build başarılı.

---

## Bu turda

### 🔴 RGB hem görev hem donanım sekmesinde

Görev & Hata sekmesinin üstüne **çıkış şeridi** kondu: RGB ampulü + üç
bacağı, buzzer (Hz), röle, ve o anki sensör değerleri (📏 mesafe · 🌗 ışık ·
🔦 IR kodu). Çocuk hatayı okurken sekme değiştirmeden ışığın yanıp
yanmadığını görüyor. Değer **vermek** için Donanım sekmesi.

### ⚙️ Artık donanım pinleri de seçiliyor

Kurulum sekmesinde iki grup var:

- **Servo pinleri** — taban / omuz / dirsek / tutucu
- **Donanım pinleri** — 📏 mesafe (trig + echo), 🌗 LDR, 🎚 pot, 🌡 sıcaklık,
  🔦 IR kumanda, 🔘 buton, 🔔 buzzer, 🔴🟢🔵 RGB üç bacağı, ⚡ röle

Hepsinin varsayılanı var (Arduino Sensor Shield düzeni), ama öğrenci kendi
devresine göre değiştirebiliyor. "Varsayılana dön" düğmesi de var.

**Cevap anahtarları bu seçime göre çevriliyor.** Sensörü D14'e takan çocuk
"yanlış pin" uyarısı almıyor.

### Test: tamamen farklı bir devre

Servolar D10-D13, RGB D5/D6/D7, buzzer D3, mesafe trig14/echo15, LDR A0,
pot A2, IR D16, buton D17 — yani hiçbiri varsayılan değil:

```
71 ANAHTAR × 3 KURULUM
  arduino     71/71 anahtar kendini 100 aldı
  picobricks  71/71   (rx_servo_v2'ye çevrildi)
  ÖZEL DEVRE  71/71   (hiçbir pin varsayılan değil)

RGB ÖZEL PİNDE (D5/D6/D7)
  arduino  18 rgb olayı · #ff0000 #000000 #00ff00 #ffff00
  ÖZEL     18 rgb olayı · #ff0000 #000000 #00ff00 #ffff00   ← aynı renkler

MESAFE ÖZEL PİNDE (trig14/echo15)
  mesafe  3 cm → 57 buzzer olayı
  mesafe 60 cm → 49 buzzer olayı                            ← tepki veriyor
```

---

## Önceki turlardan

**Kodlu mod** — solda bloklar, sağda üstte robot kol / altta üç sekme
(Görev & Hata · 🔌 Donanım · ⚙️ Kurulum). Aradaki çubuklar sürüklenebilir,
tercih hatırlanıyor.

**Donanım sekmesi** — kodda RGB yanınca ampul o rengi alır, buzzer **gerçekten
öter**, röle çeker. Mesafe/LDR/pot/sıcaklık kaydırıcıları, IR kumanda tuşları
(▲▼◀▶ OK 1 2 3), buton. Kodun tamamı kartsız test edilir.

**Kart seçimi** — 🔵 Arduino · 🧱 RoboBricks · 🍓 Raspberry/Waveshare normal
servo bloğu; 🟩 PicoBricks "Sürücü Servo" (`rx_servo_v2`). Anahtar otomatik
çevrilir.

**🎯 Kalibre et** — tüm servoları 90°'ye alır, hem simülasyonda hem kartta.

**Hatalar tek tek, sırayla** — 💡 İpucu → 🔎 Ne yapmalıyım → ✅ Cevap.
Hatalı blok kırmızı/sarı çerçevelenir, üstünde uyarı balonu çıkar.

**Kodsuz mod** — sadece kol ve parçalar: dört eklem kaydırıcısı, RGB renk
düğmeleri, buzzer notaları, röle.

**👁 Görünüm** — simülasyondaki Servo Kontrolü paneli tamamen ya da parça
parça gizlenir.

**Kütüphane** — müfredatın 71 görevi, normal servo bloklarıyla.

**Blok kutusu hedefe göre filtrelenir** · **USB/BLE seçim listesi** ·
**topbar teması sakinleştirildi** · **menü z-index'i düzeltildi**.

---

## Test sonuçları

```
KURULUM UYARLAMASI  71 anahtar × 3 kurulum = 213/213 · hepsi 100
ÖZEL DEVRE          hiçbir pin varsayılan değil → 71/71
RGB / MESAFE        özel pinlerde doğru renk ve doğru tepki
KÜTÜPHANE           71 görev · 71/71 çalışıyor
TOOLBOX             micropython ok · berrybot ok · robocytron ok
BUILD               ✓ tsc temiz · vite build başarılı
```

## Yeni ve değişen dosyalar

```
YENİ  src/robotarm/setup.ts          kart + servo + çevre pinleri, anahtar uyarlama
YENİ  src/components/SetupBar.tsx    kurulum · kalibrasyon · donanım · çıkış şeridi

DEĞİŞTİ  src/robotarm/vm.ts          çevre pin haritası, IR, servo v2
DEĞİŞTİ  src/robotarm/checker.ts     kontrol kuruluma bağlı
DEĞİŞTİ  src/robotarm/hw-bench.ts    RGB/röle pinleri ayarlanabilir
DEĞİŞTİ  src/components/RobotArmPanel.tsx  sekmeler, kalibrasyon, çıkış şeridi
DEĞİŞTİ  src/styles.css              topbar teması + yeni paneller
```
