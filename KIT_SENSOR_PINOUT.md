# RoboExx Sensör Kiti — Pin Haritası ve Uyum Notları

Bu doküman, RoboExx blok tabanlı kodlama aracının **yeni sensör kiti** ile
uyumlu hale getirilmesi için yapılan değişiklikleri anlatır.

Referans: `RoboGPT_rev1.0_DEMO.ino` (kit ile fiilen test edilmiş demo yazılımı).

---

## 1. Pin Haritası

Bloklardaki varsayılan pinler artık bu tablo ile birebir aynıdır.

| Donanım | Pin | RoboExx bloğu |
|---|---|---|
| OLED SDA | GP4 | `OLED başlat · SDA pin` |
| OLED SCL | GP5 | `OLED başlat · SCL pin` |
| RGB LED (WS2812, 1 adet) | GP6 | `RGB LED başlat · pin` |
| Buton | GP7 | `Buton pin` |
| LED | GP10 | `LED pin` |
| DHT11 | GP11 | `DHT11 sıcaklık / nem` |
| MQ2 dijital (DO) | GP13 | `Dijital pin oku` |
| Servo 1–4 | GP14, GP15, GP21, GP22 | `Servo pin` |
| ESP-01 UART | TX=GP16, RX=GP17 | — |
| HC-SR04 TRIG | GP18 | `Ultrasonik mesafe · trig` |
| HC-SR04 ECHO | GP19 | `Ultrasonik mesafe · echo` |
| Buzzer | GP20 | `Buzzer ton` |
| Potansiyometre | GP26 (ADC0) | `Potansiyometre pin` |
| LDR | GP27 (ADC1) | `LDR ışık pin` |
| MQ2 analog (AO) | GP28 (ADC2) | `Analog pin oku` |

Bu değerler `roboexx.py` içinde `KIT_*` sabitleri olarak da tanımlıdır
(`KIT_RGB_PIN`, `KIT_BUTTON_PIN`, `KIT_LED_PIN`, ...).

---

## 2. Değiştirilen Varsayılan Pinler

| Blok | Eski | Yeni | Neden |
|---|---|---|---|
| `LED pin` | 7 | **10** | LED ve buton pinleri ters bağlıydı |
| `Buton pin` | 10 | **7** | LED ve buton pinleri ters bağlıydı |
| `NeoPixel başlat · pin` | 0 | **6** | Kitte RGB LED GP6'da |
| `Ultrasonik · trig` | 3 | **18** | `HCSR04_TRIG 18` |
| `Ultrasonik · echo` | 2 | **19** | `HCSR04_ECHO 19` |
| `Servo pin` | 15 | **14** | Kitin 1. servo çıkışı |

> Bu değişiklikler **yalnızca yeni sürüklenen blokları** etkiler.
> Kayıtlı projelerdeki blok alanları serileştirilmiş olduğu için
> eski değerlerini korur.

---

## 3. "RGB LED yanmıyor, beyaz kalıyor" — kök neden ve çözüm

### Neden

`rgb_set_all()`, `rgb_set_one()`, `rgb_clear()`, `rgb_rainbow()` fonksiyonları
şerit başlatılmamışsa şöyle davranıyordu:

```python
def rgb_set_all(r, g, b):
    if _np is None:
        return          # <-- sessizce hiçbir şey yapmaz
```

Öğrenci "RGB LED başlat" bloğunu koymayı unuttuğunda WS2812'ye **hiç veri
gitmiyordu**. WS2812 açılışta hattaki gürültüden rastgele bir değer latch'ler;
bu genellikle tam parlaklık beyazdır. Sonuç: LED beyaz yanıp kalıyor ve
bloklar hiçbir etki etmiyor gibi görünüyor.

### Çözüm (3 katman)

1. **`roboexx.py` — otomatik başlatma.** Tüm RGB fonksiyonları önce
   `_rgb_ensure()` çağırır. Şerit yoksa `KIT_RGB_PIN` (6) ve
   `KIT_RGB_COUNT` (1) ile kurulur. Başlat bloğu artık zorunlu değil.

2. **`roboexx.py` — kurulumda temizleme.** `neopixel_init()` idempotenttir
   (aynı pin+sayı ile tekrar çağrılırsa şeridi yeniden kurmaz, döngü içinde
   güvenlidir) ve her yeni kurulumda şeridi sıfırlayıp `write()` atar.
   Bu, açılıştaki rastgele/beyaz durumu ilk komutta siler.

3. **`generator.ts` — üretilen koda güvence.** Herhangi bir RGB/NeoPixel
   renk bloğu kullanıldığında üretilen kodun başına
   `rgb_init(6, 1)` satırı düşer. Böylece karttaki `roboexx.py` eski
   sürüm olsa bile davranış doğrudur.

### Ek düzeltme: `rgb_brightness()`

Eski hâli mevcut renkleri **yerinde** ölçekliyordu:

```python
_np[i] = (int(r * scale), int(g * scale), int(b * scale))
```

Bu yüzden `rgb_brightness(50)` iki kez çağrılınca renk %25'e, üç kez
çağrılınca %12.5'e iniyordu — döngü içinde kullanıldığında LED tamamen
sönüyordu. Artık mantıksal renkler `_rgb_colors` içinde saklanır ve
parlaklık **yazma anında** uygulanır. Parlaklığı düşürüp yükseltince
orijinal renk geri gelir.

---

## 4. LDR yön düzeltmesi

Demo kod:

```c
lightPercent = constrain(map(ldrADC, 0, 4095, 100, 0), 0, 100);
```

Yani bu kartta **ışık arttıkça ADC değeri düşer** (PicoBricks'in tersi).
`ldr_read()` artık değeri ters çevirir:

```python
return 100 - int(_adc(pin).read_u16() * 100 / 65535)
```

Böylece bloğun etiketindeki *"yüksek değer = aydınlık"* ifadesi gerçekten
doğru olur.

> Farklı bir LDR bağlantısı kullanan bir kartta bunu geri almak için
> `roboexx.py` içindeki `ldr_read()` fonksiyonundan `100 - ` kısmını sil.

---

## 5. Buton mantığı

Demo kod butonu `pinMode(BUTTON_PIN, INPUT)` ile kurup `== HIGH` kontrol
ediyor → kartta **harici pull-down** var, basılı = HIGH.

`roboexx.py` içindeki `button_pressed()` zaten `Pin.PULL_DOWN` + `== 1`
kullanıyordu, yani mantık doğruydu. Sadece pin varsayılanı ve blok
açıklaması düzeltildi.

---

## 6. OLED: SH1106 desteği (opsiyonel)

Demo yazılımı `U8G2_SH1106_128X64_NONAME_F_HW_I2C` kullanıyor — yani kitteki
ekran büyük olasılıkla **SH1106** denetleyicilidir. RoboExx'te ise yalnızca
SSD1306 sürücüsü vardı.

Fark önemlidir: SH1106 yatay adresleme modunu (`0x20`) desteklemez ve
görünür alanı 2 piksel offsetlidir. SSD1306 sürücüsüyle sürüldüğünde tüm
framebuffer tek sayfaya yazılır → ekran bozuk/çöp görünür.

**Eklenen:** `SSD1306` sınıfına SH1106 init dizisi + sayfa-sayfa yazma
(`_show_sh1106`) desteği. "OLED başlat" bloğuna **Sürücü** açılır menüsü
eklendi (yeni blok değil, mevcut bloğa alan).

- Varsayılan **SSD1306** olarak bırakıldı → mevcut kullanıcılarda regresyon yok.
- Kitteki ekran bozuk çıkıyorsa menüden **SH1106** seç, tek tık.

---

## 7. Bootloader (`roboexx_main.py`)

BLE yükleme göstergesi sabit `rgb_init(6, 8)` çağırıyordu. Artık
`KIT_RGB_PIN` / `KIT_RGB_COUNT` sabitlerini okur ve tek LED'li kitte
KITT (kayan ışık) efekti yerine mor nabız gösterir.

---

## 8. Kullanıcının yapması gereken

Değişikliklerin karta inmesi için RoboExx'te **"Modülleri Yükle"**
butonuna basılmalı — bu, güncellenmiş `roboexx.py` ve `roboexx_main.py`
dosyalarını Pico'ya yazar. Bir kez yapılır.

---

## 9. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `public/lib/roboexx.py` | Kit pin sabitleri, RGB motoru yeniden yazıldı, LDR ters çevrildi, SH1106 sürücüsü, OLED lazy-init |
| `public/lib/roboexx_main.py` | Gösterge RGB'si kit haritasından okuyor, tek LED desteği |
| `src/blockly/blocks.ts` | LED/buton/NeoPixel/ultrasonik/servo varsayılan pinleri, OLED sürücü alanı, tooltip'ler |
| `src/blockly/generator.ts` | `KIT_PINS` haritası, `ensureRgbInit()`, OLED `driver` parametresi |

Yeni blok eklenmedi, blok silinmedi.
