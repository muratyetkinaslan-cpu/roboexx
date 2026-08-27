# 🤖 RoboCYTRON — Cytron Maker Pi RP2040 desteği

RoboExx'e eklenen dördüncü kod hedefi. RoboPANZER ile aynı desende
kurulmuştur: kendi blok dosyası, kendi MicroPython kütüphanesi, kendi
toolbox kategorileri.

---

## 1. Hangi işletim sistemini (firmware) yükleyeceğiz?

**MicroPython — standart Raspberry Pi Pico UF2'si.**

Kart fabrikadan **CircuitPython** yüklü gelir. RoboExx'in seri köprüsü
MicroPython'ın *raw REPL*'ini kullandığı için CircuitPython ile
çalışmaz — üzerine yazmanız gerekir.

Cytron bu kart için ayrı bir MicroPython derlemesi yayınlamaz; donanım
RP2040 + 2 MB flash ile birebir Pico olduğundan `RPI_PICO` UF2'si
sorunsuz çalışır. `firmware/types.ts` içindeki kart kaydı bu yüzden
`firmwareId: 'RPI_PICO'` taşır.

### Kurulum adımları

1. Kartı mikro-USB ile bilgisayara tak, **güç anahtarını AÇ**.
2. **BOOT** düğmesini basılı tutarken **RST**'ye bir kez bas ve bırak.
   Bilgisayarda **`RPI-RP2`** adında bir disk belirir.
3. RoboExx'te üst çubuktan **Araçlar › Firmware Yükle** →
   **Cytron Maker Pi RP2040** kartını seç.
4. Açılan pencerede `RPI-RP2` sürücüsünü seç. UF2 yazılır, kart
   kendiliğinden yeniden başlar. (`CIRCUITPY` diski kaybolur — normal.)
5. Üst çubuktan hedefi **🤖 RoboCYTRON** yap, **Bağlan**'a bas.
6. **Araçlar › Modülleri Yükle** — dört dosya karta yazılır:
   `robocytron.py`, `roboexx.py`, `songs.py`, `pca9685.py`.
   Bu adım kart başına **bir kez** yeterlidir.
7. Artık blokları sürükleyip **Yükle**'ye basabilirsin.

> Chrome veya Edge gerekir (File System Access + Web Serial API).
> Firefox/Safari desteklemez.

Elle yapmak isterseniz: micropython.org/download/RPI_PICO adresinden
en son `.uf2` dosyasını indirip `RPI-RP2` diskine kopyalamak da aynı
işi görür.

---

## 2. Pin haritası

Zephyr'in `maker_pi_rp2040.dts` dosyası ve Cytron'un kendi deposundan
doğrulanmıştır.

| Donanım | Pin | Not |
|---|---|---|
| Motor 1 (sol) | M1A = **GP8**, M1B = **GP9** | çift PWM, 10 kHz |
| Motor 2 (sağ) | M2A = **GP10**, M2B = **GP11** | çift PWM, 10 kHz |
| Servo 1–4 | **GP12 GP13 GP14 GP15** | 50 Hz, 500–2500 µs |
| RGB LED ×2 (WS2812) | **GP18** | GRB sırası, PIO ile sürülür |
| Buzzer | **GP22** | yan taraftaki susturma anahtarı AÇIK olmalı |
| Buton 1 / 2 | **GP20** / **GP21** | aktif düşük, dahili pull-up |
| Pil / Vin ölçümü | **GP29** (ADC3) | kart üstü 1/2 gerilim bölücü |

### Grove portları

| Port | Pinler | Özellik |
|---|---|---|
| 1 | GP0 / GP1 | UART0 TX/RX |
| 2 | GP2 / GP3 | I2C1 SDA/SCL (Qwiic/STEMMA uyumlu) |
| 3 | GP4 / GP5 | dijital — **ultrasonik için varsayılan** |
| 4 | GP16 / GP17 | dijital |
| 5 | GP6 / GP26 | dijital + ADC0 |
| 6 | GP26 / GP27 | ADC0 + ADC1 — **çizgi sensörü için varsayılan** |
| 7 | GP7 / GP28 | dijital + ADC2 |

Ultrasonik, çizgi sensörü ve potansiyometre kartın üstünde **yoktur**;
Grove portlarına takılır. Blok kategorilerindeki *"pinleri ayarla"*
blokları ile hangi porta taktığını seçebilirsin.

---

## 3. Eklenen bloklar

Toolbox'ta 9 yeni kategori (`rx_cy_*` önekli, 40 blok):

| Kategori | İçerik |
|---|---|
| 🤖 RoboCYTRON Motor | ileri/geri/sağ/sol, süreli git, tank sürüş, dur, fren, tek motor, yön ters çevir, her şeyi durdur |
| 🤖 RoboCYTRON Servo | açı, yumuşak süpürme, ortala, sinyali kes, darbe (µs), son açı |
| 🤖 RoboCYTRON RGB LED | boya, tek LED, gökkuşağı, söndür, parlaklık, R/G/B sayılarıyla |
| 🤖 RoboCYTRON Ses | korna, nota, frekans+süre, sesi kes |
| 🤖 RoboCYTRON Buton | basılı mı, yeni basıldı mı, basılana kadar bekle |
| 🤖 RoboCYTRON Mesafe | pin ayarı, engel var mı, cm, mm |
| 🤖 RoboCYTRON Çizgi | pin ayarı, siyahta mı, ham değer, eşik |
| 🤖 RoboCYTRON Grove | Grove pin seçici, analog oku |
| 🤖 RoboCYTRON Pil | yüzde, voltaj |

Her kategoride önce **yüksek seviye** (çocuk dostu), sonra
**alçak seviye** blokları var — RoboPANZER'daki düzenle aynı.

### Örnek üretilen kod

```python
import time
from roboexx import *
from robocytron import RoboCytron
bot = RoboCytron()

while True:
  if bot.sonar.obstacle(int(20)):
    bot.motors.stop()
    bot.buzzer.horn()
  bot.motors.drive(int(70), int(70))
  time.sleep(1)
  bot.motors.stop()
```

---

## 4. Kütüphane API'si (`robocytron.py`)

`RoboCytron` bir **singleton**'dur — kaç kez çağrılırsa çağrılsın aynı
örnek döner, böylece PIO state machine ve PWM iki kez kurulmaz.
Ultrasonik ve çizgi sensörü **tembel** kurulur: ilk kullanıldıklarında
pin ayrılır, kullanılmazsa o pinlere hiç dokunulmaz.

```python
from robocytron import RoboCytron
bot = RoboCytron()

bot.motors.drive(60, -60)        # tank sürüş, -100..100
bot.motors.invert_left = True    # kablo ters takıldıysa
bot.motors.brake()               # aktif fren

bot.servos.angle(1, 90)          # port 1-4, açı 0-180
bot.servos.sweep(2, 0, 180, 800) # yumuşak hareket
bot.servos.off()                 # hepsini serbest bırak

bot.pixels.fill((0, 0, 255)); bot.pixels.show()
bot.pixels.set_brightness(20)
bot.pixels.rainbow()             # döngü içinde çağır, bloklamaz

bot.buzzer.tone(440, 200)
bot.buzzer.play(['C5', 'E5', 'G5'])

bot.buttons.pressed(1)           # şu an basılı mı
bot.buttons.just_pressed(1)      # kenar tespiti

bot.sonar.set_pins(4, 5)         # Grove 3
bot.sonar.distance_cm()

bot.line.set_pins(26, 27)        # Grove 6
bot.line.on_line()               # (sol, sağ)

bot.battery_pct(); bot.battery_v()
bot.analog(28)                   # herhangi bir Grove analog pini
bot.stop_all()
```

---

## 5. Sık karşılaşılan sorunlar

| Belirti | Sebep / çözüm |
|---|---|
| Ses çıkmıyor | Kartın yan tarafındaki **buzzer susturma anahtarı** kapalı. |
| Motor dönmüyor | Vmotor girişten gelir. USB'den beslerken motorlar zayıf kalır — LiPo veya Vin (3.6–6 V) bağla. |
| Motor ters dönüyor | `rx_cy_motor_invert` bloğunu programın başında bir kez kullan. |
| Motor çok yavaşta duruyor | `Motors.min_duty_pct` (varsayılan %20) kalkış eşiğini yükselt. |
| `ImportError: no module named 'robocytron'` | **Araçlar › Modülleri Yükle** adımı atlanmış. |
| Kartta `CIRCUITPY` diski var | Hâlâ CircuitPython yüklü — 1. bölümdeki firmware adımlarını uygula. |
| Çizgi sensörü hep aynı sonucu veriyor | `rx_cy_line_threshold` ile eşiği pistin zeminine göre ayarla (varsayılan 50000). |

---

## 6. Değiştirilen dosyalar

**Yeni**

- `public/lib/robocytron.py` — donanım kütüphanesi (607 satır)
- `src/blockly/robocytron-blocks.ts` — bloklar + üreticiler + toolbox
- `scripts/cytron-test.ts` — 40 bloğun kod üretim testi
  (`npx tsx scripts/cytron-test.ts`)

**Düzenlenen**

- `src/blockly/codegen.ts` — `robocytron` hedefi + mod anahtarı
- `src/blockly/toolbox.ts` — kategori enjeksiyonu
- `src/components/Toolbar.tsx` — hedef seçici + araç menüsü ipucu
- `src/components/FirmwareUploader.tsx` — `firmwareKey()` kullanımı
- `src/firmware/types.ts` — `MAKER_PI_RP2040` kartı + `firmwareId` alanı
- `src/App.tsx` — hedef etiketleri + `runUploadRoboCytronLibrary()`
- `src/styles.css` — mor topbar teması (`data-target="robocytron"`)
