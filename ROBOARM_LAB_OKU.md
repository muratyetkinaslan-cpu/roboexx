# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Tam proje. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

---

## 🔧 Bu turda: servo açısı hatası düzeltildi

**Sorun:** Koda "servo 150°" yazınca simülasyonda kol sadece birkaç derece
oynuyordu.

**Sebep:** Geçen turlarda servo davranışını gerçekçi yapmıştım — `servo.write()`
komutu anında döner, servo kendi hızıyla (300°/sn) yola çıkar, yolu bekleme
blokları sırasında alır. Ama **program bitince** kalan yolu tamamlamıyordu.
Beklemesiz yazılmış kodda servo yolun sadece ilk 16 ms'sini gidiyordu:

```
BEKLEMESİZ: servo 150   →   son açı 94.8°   ✗   (4.8° oynadı)
```

**Düzeltme:** Program bittiğinde servolar hedefe varana kadar sürmeye devam
ediyor — gerçek kartta da öyle olur, komut verilince servo akım kesilene
kadar hedefine gider. Durdur'a basılsa bile son komut tamamlanıyor.

### Test — ders bozulmadan düzeldi

```
DOĞRU KOD (beklemeli)
  30°'ye uğradı ✓ · 60°'ye uğradı ✓ · son 150° ✓

HATALI KOD (beklemesiz)
  ara duraklar atlandı ✓   ← "bekleme koy" dersi korundu
  son poz 150° ✓           ← artık doğru yere varıyor

ÇOK EKLEMLİ (üçü peş peşe + tek bekleme)
  Taban 30° · Omuz 120° · Dirsek 60°   ← üçü BİRLİKTE hareket ediyor ✓

KISA BEKLEME (100 ms)
  150°'ye varamadı ✓ (bekleme yetersiz) · son poz 30° ✓
```

Kontrol motoru bundan etkilenmiyor — o komut edilen değerleri karşılaştırır,
kolun anlık konumunu değil. **71/71 anahtar hâlâ kendini 100 alıyor.**

---

## Önceki turlardan

**🧊 Küp** — `ku_p.3mf`'in gerçek mesh'i (8450 köşe, 25.0 mm, oyuklar
korunmuş). Sehpa yok, küp zeminde ve **sürüklenebilir**. Kavrama servo
açısını milimetre çene açıklığına çevirip küpün ölçüsüne göre karar
veriyor — **⚙️ Kurulum → 🧊 Küp**'te kalibre edilince sim ile gerçek aynı
açıda tutuyor (varsayılanla 25 mm → 120°).

**Kodsuz mod** — 🔗 anahtarı açıkken kaydırıcı gerçek kola da gidiyor.
Dört eklem, RGB renkleri, buzzer notaları, röle.

**Kodlu mod** — solda bloklar, sağda üstte kol / altta üç sekme
(Görev & Hata · 🔌 Donanım · ⚙️ Kurulum). Çubuklar sürüklenebilir.

**⚙️ Kurulum** — kart (Arduino · RoboBricks · Raspberry/Waveshare normal
servo; PicoBricks "Sürücü Servo"), servo pinleri, donanım pinleri, küp ve
tutucu kalibrasyonu. Cevap anahtarları seçime göre çevrilir. 🎯 Kalibre et
tüm servoları 90°'ye alır.

**Hatalar tek tek sırayla** — 💡 İpucu → 🔎 Ne yapmalıyım → ✅ Cevap.
Hatalı blok kırmızı/sarı çerçevelenir.

**Blok sesleri** · **👁 Görünüm** · **71 görevlik kütüphane** · **hedefe
göre blok kutusu** · **USB/BLE seçim listesi** · **sakin topbar teması**.

---

## Test sonuçları

```
SERVO AÇISI    beklemesiz 150° → 150° ✓ · ara duraklar atlanıyor ✓
KURULUM        71 anahtar × 3 kurulum = 213/213 · hepsi 100
KÜTÜPHANE      71 görev · 71/71 çalışıyor
KÜP MESH       8450 köşe · 25.0 mm · oyuklar korunmuş ✓
TOOLBOX        micropython ok · berrybot ok · robocytron ok
BUILD          ✓ tsc temiz · vite build başarılı
```
