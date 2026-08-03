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

## BLE "GATT Error: Not Supported" düzeltmesi (v2.1)

BerryBot'un harici BLE-UART modülünde iki kısıt var: RX karakteristiği çoğu
üretimde **write-without-response desteklemez** ve BLE paket boyutu **20 bayt**
(MTU 23) ile sınırlıdır. Eski köprü 200 baytlık paketleri
`writeValueWithoutResponse` ile yazmaya çalışınca Chrome "GATT Error: Not
Supported" veriyordu. Çözüm (`ble-bridge.ts` + `App.tsx`):

- Yazma yöntemi artık karakteristiğin **properties**'ine bakılarak seçilir;
  yine de hata gelirse yanıtlı `writeValue`'ya düşülür.
- Bildirim aboneliği (CCCD) başarısız olursa 600 ms sonra bir kez daha denenir.
- Hedef **🍓 BerryBot** iken köprü otomatik olarak: her mesajı sağlamalı
  `[BB 66 len payload xor]` çerçevesine sarar ve **20 baytlık GATT yazmaları**
  halinde gönderir. Firmware çerçeveleri UART akışından deterministik çözer —
  paket sınırı/MTU sorunu tamamen ortadan kalkar. (Firmware v2 çerçeveli ve
  ham protokolün ikisini de kabul eder; eski PicoBricks GO da çalışmaya devam eder.)

### v4 — güvenilir yükleme ("durum 11 beklendi" çözümü)

Bağlantı kurulduğu hâlde yükleme "BLE zaman aşımı: durum 11 beklendi" ile
düşüyorsa: robot kod çalıştırıyordur ve eski akış yüklemeden önce robotu
soğuk resetleyip AT yapılandırmasını yeniden çalıştırarak bağlantıyı
bozuyordu. v4'te (roboexxkids'in kanıtlanmış mimarisi geliştirmelerle):
kod çalışırken BEGIN gelirse robot 0x17 REBOOTING yollar, watchdog SCRATCH
işaretiyle yükleme modunda yeniden açılır (AT atlanır, bağlantı kopmaz) ve
tarayıcı BEGIN'i otomatik tekrarlar; parçalar ACK'lı, dosya checksum'lı
gider. **Modülleri Yükle'yi bir kez çalıştırınca** robot v4'e geçer ve
konsolda "✓ Güvenilir yükleme aktif" görünür. v4 zinciri artık üç dosya
yazar: `berrybot.py` + `berry_modes.py` + `main.py`.

### v2.2 — yeteneğe göre keşif (kalıcı "Not Supported" için)

"Not Supported" bağlantı aşamasında da gelebiliyor: bazı modüllerde RX/TX
karakteristik ROLLERİ Nordic düzeninin tersidir ya da modül fabrika
varsayılan servisiyle (FFE0/FFF0/FFE5, RN487x) açılır — o zaman köprü
"notify" başlatmaya çalıştığı karakteristikte bu hatayı alır. v2.2'de köprü:

- Bilinen tüm UART servislerini sırayla dener, bulamazsa cihazdaki servisleri tarar.
- Karakteristikleri **UUID'ye değil yeteneğine göre** seçer: yazılabilir olan →
  yazma kanalı, notify/indicate olan → bildirim kanalı (tek karakteristik
  ikisini de taşıyorsa o kullanılır).
- Bildirim aboneliği 2 denemede de olmazsa bağlantıyı KESMEZ; "iyimser mod"da
  devam eder — kod yükleme yine çalışır, sadece durum onayları beklenmez.
- Konsol paneline **teşhis logu** basar: bulunan servis, her karakteristiğin
  UUID'si ve özellikleri (`[write,notify]` gibi), seçilen kanallar.

Robot tarafında da `berrybot.py` v2.2: modül şeffaf moddaysa `+++` artık
CRLF'siz ve bekleme süreli gönderilir; AT yanıt vermiyorsa (fabrika ayarı
zaten doğru) yapılandırma atlanır — her açılışta reklam kesilip tarayıcı
bağlantısı düşürülmez. **Modülleri Yükle'yi bir kez daha çalıştırıp robotu
kapat-aç** ki bu sürüm robota geçsin.

Hâlâ olmuyorsa: işletim sisteminin Bluetooth ayarlarından cihazı "unut",
robotu kapat-aç, sayfayı yenile (macOS BLE önbelleği inatçıdır) ve konsol
panelindeki "karakteristik …" satırlarını bize gönder — hangi modül olduğunu
oradan birebir görürüz.

## Blok seti (v2.1) — ayrı kategoriler, alçak + yüksek seviye

Araç kutusunda artık 9 ayrı 🍓 kategori var; her birinde önce yüksek seviye
(çocuk dostu) bloklar, altında "Alçak seviye" etiketiyle ham bloklar bulunur:

- **Motor**: yön+hız, süreli git (X sn gidip dur), tank sürüşü (sol/sağ %),
  dur · alçak: tek motor (-100..100)
- **LED Matris**: ikon, kayan yazı, çubuk (0-5), % dolum, temizle · alçak:
  piksel (x,y), satır deseni (5 bit sayı)
- **RGB LED**: paletle boya, tek LED, gökkuşağı, söndür, parlaklık % · alçak:
  R,G,B sayılarıyla boya / tek LED
- **Ses**: korna, nota (Do-Si dropdown) · alçak: frekans+süre, sesi kes
- **Mesafe**: engel var mı? (<X cm, 3 örnekli), mesafe cm · alçak: mesafe mm
- **Çizgi**: çizgide mi? (bool) · alçak: ham analog, eşik ayarla
- **Işık (LDR)**: aydınlık mı? (eşikli bool), ışık farkı (sağ-sol) · alçak: ham analog
- **Kumanda + Buton**: IR tuşuna basıldı mı?, buton · alçak: son tuş kodu
- **Pil**: pil yüzdesi, ekranda pili göster · alçak: pil voltajı (V)

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

### Nasıl denerim? (adım adım)

1. Robotu **pilden** çalıştır, USB'yi veri için bağla.
2. RoboExx'te USB bağlan → `public/lib/berrybot_batt_test.py` içeriğini kod
   editörüne yapıştırıp **Çalıştır** (veya Thonny ile çalıştır). Script 4 ADC
   kanalını 10 sn boyunca yazdırır.
3. Sensörlerin önünde el salla, tekerlere hafif yük bindir:
   - El salladıkça **oynayan** kanallar sensördür.
   - **Sabit duran** ve motor yükünde 0.1-0.3 V **düşen** kanal pil hattıdır.
4. Multimetreyle pil uçlarını ölç, script'in gösterdiği ADC voltajına böl →
   `BATTERY_DIVIDER` oranın budur. `berrybot.py` başında `PIN_BATTERY` ve
   oranı gir, **Modülleri Yükle** ile tekrar yaz — rozet ve ekran göstergesi
   anında gerçek değeri gösterir.
5. Hiçbir kanal pil gibi davranmıyorsa kartta hazır hat yok: en temiz çözüm
   sağ LDR'yi feda etmek — `BAT+ → 100kΩ → GP28 → 100kΩ → GND` bölücüsü
   lehimle, `PIN_BATTERY = 28`, `BATTERY_DIVIDER = 2.0`. (3.3 V üstünü asla
   bölücüsüz ADC'ye verme.)

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
