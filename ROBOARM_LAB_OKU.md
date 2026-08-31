# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Tam proje. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

---

## 🧊 Bu turda: gerçek küp simülasyona girdi

`ku_p.3mf` dosyasını açıp ölçtüm ("küp v3", milimetre birimi, 8450 köşe /
16896 üçgen):

```
dış ölçü   25.0 × 25.0 × 25.0 mm
her yüzde  ~15 mm çapında, ~5 mm derinliğinde dairesel oyuk
kavrama    yan yüzler düz → 25 mm açıklıkta tutulur
```

Simülasyondaki küp **3 cm düz kutuydu**. Artık gerçek ölçülerle çiziliyor:
2.5 cm gövde + altı yüzdeki oyuklar (1 gövde + 6 oyuk parçası).
Dosyanın kendisi `public/robot/ku_p.3mf` içinde saklandı.

### Kavrama artık ölçüye bağlı

Eskiden simülasyon "açı 110°'nin altındaysa ve yakınsa tut" diyordu —
gerçekle ilgisi yoktu. Artık servo açısı **milimetre çene açıklığına**
çevriliyor ve küpün 25 mm'sine göre karar veriliyor.

Tutucunuzun iki noktasını **⚙️ Kurulum → 🧊 Küp** sekmesinde ölçüp
giriyorsunuz:

| Ölçüm | Varsayılan |
|---|---|
| Çeneler tam AÇIK · servo açısı / açıklık | 150° / 45 mm |
| Çeneler tam KAPALI · servo açısı / açıklık | 82° / 0 mm |

Aradaki değerler doğrusal hesaplanıyor ve panel size şunu yazıyor:

> **🤏 25 mm küpü tutmak için: tutucu 120°**
> Bırakmak için: 132°

**Bu açıyı koda yazınca hem simülasyonda hem gerçek kolda tutar** — çünkü
ikisi de aynı ölçüden hesaplanıyor.

Küp boyutu da seçilebilir (15–40 mm); açı ona göre yeniden hesaplanır.

### Test

```
KAVRAMA AÇISI (varsayılan tutucu 82°→150°)
  15 mm → 105°    25 mm → 120°    35 mm → 135°
  20 mm → 112°    30 mm → 127°    40 mm → 142°

FARKLI TUTUCU (öğretmen ölçtü: 40°=2mm · 130°=38mm)
  25 mm küp → tut 98°
  doğrulama: 98°'de çene açıklığı 25.2 mm ✓

KÜP GEOMETRİSİ
  1 gövde + 6 oyuk parçası ✓
```

---

## Önceki turlardan

**Kodlu mod** — solda bloklar, sağda üstte robot kol / altta üç sekme
(Görev & Hata · 🔌 Donanım · ⚙️ Kurulum). Çubuklar sürüklenebilir.

**Çıkış şeridi** — Görev sekmesinin üstünde RGB, buzzer, röle ve anlık
sensör değerleri.

**Donanım sekmesi** — kodda RGB yanınca ampul o rengi alır, buzzer
**gerçekten öter**. Mesafe/LDR/pot/sıcaklık kaydırıcıları, IR kumanda
tuşları, buton.

**⚙️ Kurulum** — kart seçimi (Arduino · RoboBricks · Raspberry/Waveshare
normal servo bloğu; PicoBricks "Sürücü Servo"), servo pinleri, donanım
pinleri (mesafe trig/echo, LDR, pot, sıcaklık, IR, buton, buzzer, RGB üç
bacağı, röle) ve küp/tutucu kalibrasyonu. Cevap anahtarları seçime göre
çevrilir.

**🎯 Kalibre et** — tüm servoları 90°'ye alır, simülasyonda ve kartta.

**Hatalar tek tek, sırayla** — 💡 İpucu → 🔎 Ne yapmalıyım → ✅ Cevap.
Hatalı blok kırmızı/sarı çerçevelenir.

**Blok sesleri** · **kodsuz mod** · **👁 Görünüm** · **71 görevlik
kütüphane** · **hedefe göre blok kutusu** · **USB/BLE seçim listesi** ·
**sakin topbar teması**.

---

## Test sonuçları

```
KÜP              25 mm, 6 oyuk · geometri doğru ✓
KAVRAMA          6 küp boyutu + özel kalibrasyon · hesap doğrulandı ✓
KURULUM          71 anahtar × 3 kurulum = 213/213 · hepsi 100
ÖZEL DEVRE       hiçbir pin varsayılan değil → 71/71
RGB / MESAFE     özel pinlerde doğru renk ve doğru tepki
BUILD            ✓ tsc temiz · vite build başarılı
```

## Yeni ve değişen dosyalar

```
YENİ  public/robot/ku_p.3mf         gerçek küp modeli (kaynak)
YENİ  src/robotarm/setup.ts         kart · pin · küp/tutucu kalibrasyonu
YENİ  src/components/SetupBar.tsx   kurulum · kalibrasyon · donanım · çıkış şeridi

DEĞİŞTİ  public/robot/arm-sim.html  gerçek küp + ölçüye bağlı kavrama
DEĞİŞTİ  src/robotarm/vm.ts         çevre pin haritası, IR, servo v2
DEĞİŞTİ  src/robotarm/checker.ts    kontrol kuruluma bağlı
DEĞİŞTİ  src/robotarm/hw-bench.ts   RGB/röle pinleri ayarlanabilir
DEĞİŞTİ  src/components/RobotArmPanel.tsx  sekmeler, kalibrasyon, küp bağlantısı
DEĞİŞTİ  src/components/BlocklyWorkspace.tsx  blok sesleri
DEĞİŞTİ  src/styles.css             topbar teması + paneller
```
