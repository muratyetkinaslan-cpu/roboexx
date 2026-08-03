# RoboExx × BerryBot Entegrasyon Rehberi (v2.0.0)

BerryBot'u kendi platformumuz RoboExx'ten kontrol etmek için sıfırdan yazılmış
yazılım paketi. Resmi (Robotistan) kodun **kopyası değildir** — pin haritası ve
BLE modül davranışı resmi depodan doğrulandı, gerisi yeniden tasarlandı ve
resmi koddaki hatalar giderildi.

## Bu depodaki BerryBot dosyaları

| Dosya | Görevi |
|---|---|
| `public/lib/berrybot.py` | Donanım kütüphanesi v2 — "Modülleri Yükle" robota yazar |
| `public/lib/berrybot_main.py` | BLE bootloader + hazır modlar + pil göstergesi — robota `main.py` olarak yazılır |
| `src/bluetooth/berrybot-bridge.ts` | Pil sorgusu, yükleme hazırlığı, opsiyonel çerçeve |
| `src/blockly/berrybot-blocks.ts` | 🍓 BerryBot blok kategorisi + MicroPython üreticileri |
| Firmware UF2 | RP2040 + MicroPython (v1.20+). Resmi micropython.org RP2040 UF2'si de çalışır |

## Kullanıcı akışı (uygulama içinde)

1. Üst bardan hedef olarak **🍓 BerryBot** seç — araç kutusuna BerryBot kategorisi
   ve kod önizlemesine `from berrybot import ...` otomatik gelir.
2. USB ile bağlan → **Modülleri Yükle** → `berrybot.py` + `main.py` + cihaz adı yazılır.
3. RESET → robot BLE'de görünür → **Bluetooth ile bağlan**.
4. Bloklarını kur, **Yükle** → kod `user_code.py` olarak kablosuz gider, robot
   resetlenip çalıştırır. (Yüklemeden önce uygulama robotu otomatik olarak temiz
   bootloader'a resetler — kod çalışırken bile yükleme güvenlidir.)
5. BLE bağlıyken üst barda **🔋 pil rozeti** 10 sn'de bir güncellenir; robotta
   butona 1 sn basınca ekranda pil göstergesi çıkar.
6. Eğitmen Kütüphanesi → **🍓 BerryBot Kiti**: 6 hazır örnek (motor testi, WASD,
   engelden kaçma, çizgi izleme, IR kumanda, parti + pil).

## Kritik mimari bilgi: BerryBot ≠ Pico W

BerryBot'ta Bluetooth, **UART0'a (GP0/GP1, 115200) bağlı harici bir AT-komutlu
BLE modülüdür** ve şeffaf modda çalışır. Modül **Nordic UART UUID'lerini**
(6E400001/2/3-…) kullanır — yani RoboExx'in mevcut `ble-bridge.ts`'i **hiçbir
değişiklik yapılmadan** BerryBot'a bağlanır ve kod yükler. Cihaz adı:
**`RoboExx-Berry`**.

`roboexx_main.py` (Pico W sürümü, dahili `bluetooth` modülü) BerryBot'ta
**çalışmaz**; bu yüzden `main.py` v2, aynı MSG_* protokolünü UART akışı
üzerinden konuşur. UART akışında BLE paket sınırları kaybolduğu için firmware,
BEGIN/CHUNK/END mesajlarını **deterministik akış çözümleme** ile (CHUNK boyu =
`min(200, kalan)`, tarayıcıdaki `CHUNK_SIZE` sabitiyle birebir) ayrıştırır —
birleşik/parçalanmış paketlerde bile yükleme bozulmaz (masaüstü simülasyonla
test edildi). `CHUNK_SIZE`'ı web tarafında değiştirirseniz `main.py` içindeki
`CHUNK_SIZE` sabitini de değiştirin.

## Pin haritası (resmi karttan doğrulandı)

| Donanım | Pin |
|---|---|
| BLE modül UART0 | TX=GP0, RX=GP1 |
| Buzzer | GP14 |
| WS2812 halka (7 LED) | GP6 |
| Motor sürücü (TB6612) | A1=24 A2=25 B1=23 B2=22, PWM A=15 B=21 |
| Çizgi sensörleri | Sol=GP26 (ADC0), Sağ=GP27 (ADC1) |
| LDR (ışık) | Sol=GP29 (ADC3), Sağ=GP28 (ADC2) |
| IR alıcı | GP20 |
| Ultrasonik | TRIG=GP8, ECHO=GP9 |
| Buton | GP10 |
| 5x5 LED matris | Satır: 7,11,12,13,17 — Sütun: 18,19,16,2,3 |

## Kurulum akışı (kullanıcı, sizin sitenizden)

1. Firmware UF2'yi BOOTSEL ile yükle (sitemizden indirilir).
2. USB seri ile RoboExx'e bağlan → **Modülleri Yükle**: `berrybot.py` +
   `main.py` yazılır (mevcut FirmwareUploader/SerialBridge akışı aynen).
3. Reset → robot artık `RoboExx-Berry` adıyla BLE yayını yapar.
4. RoboExx'te **Bluetooth ile bağlan** → bloklardan üretilen kod
   `user_code.py` olarak kablosuz yüklenir; robot resetlenip kodu çalıştırır.

## Bluetooth'tan ekstra kod yükleme

- Bootloader servisi bir **donanım timer'ında** çalışır: robot hazır modda,
  hatta **kullanıcı kodu çalışırken bile** yeni yükleme kabul eder.
- Yükleme başlar başlamaz motorlar güvenlik için durdurulur, 5x5 ekranda
  **piksel piksel ilerleme çubuğu** gösterilir; kayıt sonrası ✓ + bip + reset.
- Aynı kanaldan `user_code.py` dışında `berrybot.py` ve `main.py` de
  gönderilebilir → **kütüphane OTA güncellemesi**.
- En garantili akış için web tarafında yüklemeden önce
  `prepareUpload(bridge)` çağırın (MSG_RESET → temiz bootloader → oto
  yeniden bağlan → yükle).
- Tarayıcı ekstra komutlar da gönderebilir: canlı **W-A-S-D sürüş** (MSG_KEY,
  600 ms veri gelmezse güvenli duruş) ve **sensör paneli** (MSG_SENSOR_REQ).
- Resmi **PicoBricks GO uygulaması da çalışmaya devam eder** (0x52 paketleri:
  joystick, modlar, korna, RGB, matris deseni desteklenir).

## Pil (şarj) göstergesi — dürüst durum

Gösterge yazılımı hazır: **butona 1 sn uzun basınca** ekranda 5 çubuklu pil
grafiği + kayan `%` yazısı çıkar; web tarafında `requestBattery(bridge)` ile
yüzde okunur (SENSOR_BATTERY = 0x05).

Ancak donanım kısıtı var: RP2040'ın 4 ADC girişinin **dördü de dolu**
(GP26/27 çizgi, GP28/29 LDR) ve resmi pin haritasında pile bağlı bir ölçüm
hattı görünmüyor. Bu yüzden:

- `berrybot.py` içinde `PIN_BATTERY = None` (varsayılan) → ekranda pil ikonu
  + `?`, web'de `null` döner. **Uydurma değer göstermiyoruz.**
- Kartı multimetreyle kontrol edin: VBAT'tan bir gerilim bölücü herhangi bir
  ADC pinine geliyorsa (veya siz LDR'lerden birini feda edip 100k+100k bölücü
  ile pile bağlarsanız) `PIN_BATTERY = 28` gibi ayarlayın ve
  `BATTERY_DIVIDER` oranını girin — gösterge anında gerçek yüzdeyle çalışır
  (Li-ion 3.3 V–4.2 V eğrisi, 8 örnek ortalamalı, motor gürültüsüne dayanıklı).

## Resmi kodda bulunup düzeltilen hatalar

1. **Motor yön çakışması:** `setMotorSpeed()` ileri yönü `move(FWD)`'un tersi
   pinlerle sürüyordu → uygulama joystick'inde ileri = geri. v2'de tek referans
   yön var, gerekirse `motors.invert_left/right` ile ayarlanır.
2. **`BLE.read()` içindeki `time.sleep(0.5)`:** her okuma tüm robotu yarım
   saniye donduruyordu ("tam çalışmıyor" hissinin ana nedeni). v2 okuması
   bloklamaz, boşluk-tabanlı paketleme kullanır.
3. **Matris timer'ında `sleep_ms(1)`:** 5 ms'lik kesmenin içinde 1 ms uyku =
   ~%20 CPU israfı + motor PWM titremesi. v2'de satır bir sonraki kesmeye
   kadar yanık kalır, 500 Hz titremesiz tarama.
4. **Ultrasonik:** zaman aşımında sabit uydurma değer yerine güvenli 400 cm +
   isteğe bağlı medyan filtre; `sonic` modunda 3 örnekli okuma ile hayalet
   engel tespiti giderildi.
5. **Joystick ölü bölgesi** eklendi (kol bırakılınca robot sürüklenmez),
   motor kalkış eşiği (`min_duty_pct`) ayrı ve doğru uygulanır.
