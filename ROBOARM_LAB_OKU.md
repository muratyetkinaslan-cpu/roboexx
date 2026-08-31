# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Tam proje. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

Yeni paket eklenmedi. `tsc` + `vite build` çalıştırıldı, build başarılı.

---

## Bu turda eklenenler

### 🔌 Bütün çevre birimleri kodlu tarafta

Kodlu modun altında üç sekme var: **Görev & Hata · 🔌 Donanım · ⚙️ Kurulum**.

**Donanım sekmesi** kodun tamamını kartsız test etmenizi sağlar:

| Çıkış | Kodda çalışınca |
|---|---|
| RGB LED | Ampul o rengi alır, D9/D10/D11 bacakları yanar |
| Buzzer | **Gerçekten öter** (WebAudio) + frekans yazar |
| Röle | Aç/kapa göstergesi |

| Giriş | Nasıl değer verilir |
|---|---|
| 📏 Mesafe (HC-SR04) | Kaydırıcı 2-100 cm |
| 🌗 Işık (LDR) | Kaydırıcı 0-100 |
| 🎚 Potansiyometre | Kaydırıcı 0-100 |
| 🌡 Sıcaklık | Kaydırıcı -10…60 °C |
| 🔦 **IR kumanda** | ▲ ▼ ◀ ▶ OK 1 2 3 tuşları — koda kod gider |
| 🔘 Buton | Basılı tut |

IR kumanda için VM'e `rx_ir_read_code` desteği eklendi.
**Test:** IR kod 0 → servo komutu yok · IR kod 70 → Taban 150° ✓

### ⚙️ Kurulum: kart ve pin seçimi

Öğrenci hangi kartı kullandığını seçiyor, **cevap anahtarları ona göre
çevriliyor**:

| Kart | Servo bloğu | Varsayılan |
|---|---|---|
| 🔵 Arduino Uno | `rx_servo_angle` | D4 D5 D6 D7 |
| 🧱 RoboBricks | `rx_servo_angle` | D4 D5 D6 D7 (serbest) |
| 🍓 Raspberry / Waveshare | `rx_servo_angle` | GPIO serbest |
| 🟩 PicoBricks | **`rx_servo_v2`** (Sürücü Servo) | Kanal 1 2 3 4 |

Pinler de tek tek değiştirilebiliyor. PicoBricks seçen çocuk "Sürücü Servo"
bloğu yazınca **"yanlış blok" uyarısı almıyor**; D10'a takan çocuk
**"D10 pininde servo yok" uyarısı almıyor** — kontrol onun kurulumuna göre
yapılıyor.

**Test — 4 kart × 71 anahtar:**
```
arduino     71/71 anahtar kendini 100 aldı
robobricks  71/71   (pin 10-13)
waveshare   71/71   (GPIO 16-19)
picobricks  71/71   (rx_servo_v2'ye çevrildi)
```

### 🎯 Kalibre et

Kurulum sekmesindeki düğme **tüm servoları 90°'ye alır** — hem simülasyonda
hem karta komut göndererek. Çocuk kolu düz duruma getirip monte ediyor,
göreve oradan başlıyor. Kart bağlı değilse uyarı çıkıyor.

### ✨ Topbar teması

Hedef kart değişince topbarın zemini komple renk atıyordu. Artık:

- Zemin her temada **sakin** — vurgu rengi %4'ün altında
- Renk değişimi **ince bir üst çizgide** görünüyor, koca yüzeyde değil
- Gruplar arası kutu yerine **ince dikey çizgi**
- Düğmeler dolgu yerine **kenar + yumuşak hover**, `:focus-visible` halkası
- Hedef göstergesi dolu zemin yerine ince renkli kenar
- `prefers-reduced-motion` desteği

---

## Önceki turlardan

1. **Kütüphane 71 görev** — müfredatın tamamı, normal servo bloklarıyla.
2. **Kodlu ekran ikiye bölük** — solda bloklar, sağda üstte kol / altta panel.
3. **Üç alan da sürüklenebilir**, tercih hatırlanıyor.
4. **👁 Görünüm** — Servo Kontrolü paneli tamamen ya da parça parça gizlenir.
5. **Hatalar tek tek, sırayla** — 💡 İpucu → 🔎 Ne yapmalıyım → ✅ Cevap.
6. **Blok üstünde hata işareti** — kırmızı/sarı çerçeve + uyarı balonu.
7. **Blok kutusu hedefe göre filtreleniyor.**
8. **USB/BLE seçim listesi.**
9. **Menü z-index'i düzeltildi.**

---

## Test sonuçları

```
KART UYARLAMASI  4 kart × 71 anahtar = 284/284 · hepsi 100
IR KUMANDA       kod 0 → tepki yok · kod 70 → Taban 150° ✓
KÜTÜPHANE        71 görev · 71/71 çalışıyor
TOOLBOX          micropython ok · berrybot ok · robocytron ok
BUILD            ✓ tsc temiz · vite build başarılı
```

## Yeni ve değişen dosyalar

```
YENİ  src/robotarm/setup.ts          kart/pin seçimi + anahtar uyarlama
YENİ  src/components/SetupBar.tsx    kurulum çubuğu + kalibrasyon + donanım paneli

DEĞİŞTİ  src/robotarm/vm.ts          IR kumanda, servo v2 haritalama
DEĞİŞTİ  src/robotarm/checker.ts     kontrol kuruluma bağlandı
DEĞİŞTİ  src/robotarm/hw-bench.ts    IR kod girişi
DEĞİŞTİ  src/components/RobotArmPanel.tsx  alt sekmeler + kalibrasyon
DEĞİŞTİ  src/styles.css              topbar teması + yeni paneller
```
