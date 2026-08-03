# 📱 Tablet desteği — WebUSB (CDC) fallback

Android tablette Chrome, **Web Serial API'yi desteklemez** (yalnız masaüstü);
BerryBot bu yüzden tablette "okunmuyordu". Çözüm: Android Chrome **WebUSB**
destekler ve Pico standart bir USB CDC cihazıdır → `src/serial/webusb-cdc.ts`
şimi, SerialBridge'in kullandığı port yüzeyini (open/readable/writable/
setSignals…) bir USBDevice üzerinde birebir taklit eder. Böylece:

- `navigator.serial` yoksa köprü otomatik WebUSB'ye düşer — Bağlan'a basınca
  Android'in USB cihaz seçici çıkar, öğrenci BerryBot'u seçer, aynı raw-REPL
  yüklemesi çalışır. Konsolda "📱 Tablet modu: WebUSB (CDC)" görünür.
- **Ekstra donanım/uygulama gerekmez** — yalnız OTG (USB-C→USB) kablosu.
- DTR/RTS SET_CONTROL_LINE_STATE ile kaldırılır (MicroPython DTR'siz çıktı
  basmaz); baud SET_LINE_CODING ile gönderilir; stall'da clearHalt yapılır.
- Masaüstü davranışı değişmez (gerçek Web Serial öncelikli); iPad'de USB
  yolu yoktur — orada Bluetooth kullanılır.

Tablet akışı: OTG ile bağla → Chrome'da RoboExx (HTTPS) → USB Bağlan →
"Modülleri Yükle" (ilk kurulum) → sonrası tamamen kablosuz (BLE).

---

# 🍓 BerryBot v4.1 — Ölü bildirim hattı için üç kademeli savunma

Sahadan gelen log kesinleştirdi: bu modülde telefon→robot yönü çalışıyor,
ama robot→telefon **notify hiç iletilmiyor** (abonelik "başarılı" görünse de
tek bir durum baytı gelmiyor). v4.1 bağlanınca hattı gerçekten test eder:

1. **Notify canlılık testi**: PING'e 3 denemede yanıt yoksa hat ölü sayılır.
2. **Okuma yoklaması (read-polling)**: bildirim karakteristiğinde `read`
   varsa 250 ms'de bir okunur; içerik değiştikçe durum baytları ve sensör
   cevapları bu yoldan işlenir (bazı modüller notify yerine sadece değer
   günceller). Çalışırsa konsolda "✓ Durum baytları okuma yoklamasıyla
   alınıyor" görünür ve ACK'lı güvenilir yükleme normal sürer.
3. **Kör mod**: o da sessizse köprü beklemeden, hız sınırlı yükler
   (roboexxkids'i "biraz da olsa" çalıştıran yol — artık bilinçli ve
   sağlamlaştırılmış): BEGIN aralıklı 3 kez gönderilir (koşan koddan
   yükleme moduna reset penceresini kapsar), parçalar yanıtlı yazma +
   bekleme ile gider. Robot dosyayı alınca **melodi çalar ve ekranda ✓**
   gösterir — başarı onayı robotun kendisidir.

---

# 🍓 BerryBot v4 — Güvenilir BLE yükleme (roboexxkids mimarisi + iyileştirmeler)

Kök neden bulundu: BerryBot'un BLE modülü **Pico'dan bağımsız beslenir** —
Pico resetlense bile tarayıcı bağlantısı kopmaz. Eski akış ise yüklemeden
önce robotu soğuk resetleyip AT yapılandırmasını yeniden çalıştırıyor, bu da
reklamı kesip yüklemeyi kilitliyordu ("durum 11 beklendi" hatası).

v4, roboexxkids'te kanıtlanmış v3 protokolünü temel alır ve geliştirir:

- **REBOOTING el sıkışması**: kod çalışırken BEGIN gelirse gözcü (çekirdek-1)
  0x17 yollar, watchdog **SCRATCH register'ına** işaret koyar ve resetler;
  robot yükleme modunda açılır (AT yapılandırması ATLANIR — bağlantı canlı
  kalır), tarayıcı BEGIN'i otomatik yeniden gönderir (10 deneme penceresi).
- **Parça başına ACK + END'de checksum**: UART tamponu taşamaz; bozuk aktarım
  diske asla yazılmaz, parça 3 kez yeniden denenir; MTU küçükse parça boyutu
  otomatik yarıya iner (20 bayta kadar).
- **Flash'a yalnız tek çekirdek çalışırken yazılır** (RP2040 XIP kısıtı);
  USB tarafı da yazmadan önce gözcüyü durdurur (`_watch_stop`).
- **USB/BLE birbirini bozmaz**: kullanıcı kodu her zaman `user_code.py`;
  `main.py` BERRYBOT-BOOT imzalı çalıştırıcıdır (bootloader ya da USB stub).
- **Durdur BLE'de çalışır** (MSG_STOP → kod başlatılmadan boşta bekleme).
- **Protokol sürümü otomatik algılanır** (PING → READY_V2); eski bootloader
  ve RoboExx Pico W ile v1 uyumu korunur.
- kids'in zayıf yanı olan bağlantı kararsızlığı bizim v2.2 katmanıyla
  kapatıldı: zaman aşımı sarmalayıcıları, aday servis listesi
  (Nordic + FFE0/FFF0/FFE5 + RN487x), yeteneğe göre karakteristik seçimi,
  notify'a 2 deneme + iyimser mod — otomatik yeniden bağlanma dahil.
- **v4 ekleri (kids'te olmayan)**: boşta modunda hazır modlar (buton: IR /
  çizgi / ışık / sonik / sumo — `berry_modes.py`), 5x5 ekranda yükleme
  ilerlemesi + ✓/✗, PicoBricks GO (0x52) uyumu, WASD canlı sürüş (0x0B),
  sensör paneli + **pil sorgusu kod çalışırken bile** (0x0C, gözcü yanıtlar),
  uzun buton basışıyla pil göstergesi.
- Masaüstü simülasyonla doğrulandı: ACK'lı yükleme, bozuk checksum reddi,
  sensör/pil cevabı.

**Kurulum:** uygulamayı yeni sürümle aç → robota bağlan (USB en garantisi) →
"Modülleri Yükle" (artık berrybot.py + berry_modes.py + main.py yazar) →
robot otomatik/elle resetlenir → BLE'de "✓ Güvenilir yükleme aktif" görünür.

---

# 🍓 BerryBot v2.2 — BLE bağlantısı: yeteneğe göre keşif

- Servis keşfi: Nordic UUID + FFE0/FFF0/FFE5/RN487x adayları, gerekirse tam tarama.
- Karakteristikler UUID yerine **özelliklerine göre** seçiliyor (ters RX/TX ve
  tek-karakteristikli modüller desteklenir); bulunanlar konsola loglanıyor.
- Bildirim kurulamazsa bağlantı düşürülmüyor: iyimser modda yükleme sürüyor.
- Otomatik yeniden bağlanma da aynı keşfi kullanıyor.
- Firmware: `+++` artık CRLF'siz + guard-time'lı; modül zaten yapılandırılmışsa
  AT adımları atlanıyor (her açılışta reklam kesintisi yok).

---

# 🍓 BerryBot v2.1 — BLE düzeltmesi + geniş blok seti

- **"GATT Error: Not Supported" çözüldü**: yazmalar karakteristiğin gerçek
  yeteneklerine göre seçiliyor; BerryBot hedefinde tüm mesajlar sağlamalı
  çerçeveyle **20 baytlık** GATT yazmaları halinde gidiyor (harici BLE-UART
  modüllerinin MTU 23 sınırıyla uyumlu). Bildirim aboneliği hata verirse
  otomatik ikinci deneme yapılıyor.
- **9 ayrı 🍓 kategori**: Motor, LED Matris, RGB LED, Ses, Mesafe, Çizgi,
  Işık (LDR), Kumanda+Buton, Pil — her birinde yüksek seviye + "Alçak seviye"
  etiketli ham bloklar (18 yeni blok).
- **Pil testi**: `public/lib/berrybot_batt_test.py` — pil hattını ADC
  taramasıyla bulma prosedürü (bkz. BERRYBOT.md).

---

# 🍓 BerryBot Entegrasyonu

**Robotistan BerryBot artık RoboExx'in yerlisi.** Üst bardaki hedef anahtarına
**🍓 BerryBot** eklendi; seçilince:

- Araç kutusunda **🍓 BerryBot kategorisi**: sür/dön, tank sürüşü, 5x5 ekran
  (ikon · piksel · kayan yazı), RGB halka (boya · gökkuşağı), korna, mesafe,
  çizgi, ışık, IR kumanda tuşu, buton, **pil yüzdesi** ve **ekranda pil göster** blokları.
- **Modülleri Yükle** artık BerryBot paketini yazar: `berrybot.py` (v2 kütüphane)
  + `main.py` (UART-BLE bootloader) + cihaz adı.
- **Bluetooth'tan kod yükleme**: BerryBot Pico W değildir — BLE'si UART'a bağlı
  şeffaf modüldür ama aynı Nordic UART UUID'lerini kullandığı için mevcut
  `ble-bridge.ts` değişmeden çalışır; robot tarafındaki yeni bootloader aynı
  MSG_* protokolünü UART akışından deterministik çözer. Yükleme, kullanıcı kodu
  çalışırken bile alınır; uygulama yüklemeden önce robotu otomatik resetler.
- **Pil göstergesi**: BLE bağlıyken üst barda 🔋 rozeti (10 sn'de bir sorgulanır,
  SENSOR_BATTERY=0x05), robotta uzun buton basışıyla ekranda çubuk + % gösterimi.
  Not: BerryBot kartında hazır VBAT-ADC hattı yoksa `berrybot.py` içinde
  `PIN_BATTERY` ayarlanana kadar "—" gösterilir (bkz. BERRYBOT.md).
- **Eğitmen Kütüphanesi**: BerryBot Kiti gerçek `rx_bb_*` bloklarıyla yeniden
  yazıldı + 2 yeni örnek (IR kumanda, parti + pil).
- Resmi PicoBricks GO uygulaması da çalışmaya devam eder (0x52 paketleri
  bootloader'da desteklenir).
- Resmi BerryBot yazılımındaki hatalar kütüphanede giderildi: ters motor yönü
  (joystick), bloklayan BLE okuması (0.5 sn), matris timer'ındaki sleep,
  filtresiz ultrasonik. Ayrıntı: **BERRYBOT.md**.

---

# RoboExx 2.12.0 — Değişiklik Notları

## 1) Pico Yükleme Sorunu Çözüldü (artık RESET tuşuna gerek yok)
- Ctrl-C kesme sekansı sabırlı hale getirildi (aralıklarla 3 kez, mpremote yöntemi).
- **YENİ STRATEJİ 4:** Diğer stratejiler başarısız olursa uygulama karta
  `machine.reset()` göndererek YAZILIMSAL RESET atıyor, USB yeniden
  numaralanınca **otomatik yeniden bağlanıp** yüklemeye devam ediyor.
- Seri yazmaya 4sn zaman aşımı — uygulama artık "Meşgul"de takılı kalmaz.
- Read-loop jenerasyon sayacı ile reset sonrası okuma çakışması engellendi.

## 2) Live Share Tamamen Onarıldı (öğrenci kodu artık SİLİNMEZ)
- **READY kapısı:** İlk senkron tamamlanıp odadaki kod çekilene kadar hiçbir
  push kabul edilmez — öğretmenin bağlanma anındaki boş ekranı öğrencinin
  kodunu hiçbir yarış durumunda ezemez.
- **Sahip tohumlaması:** Boş odayı yalnızca odanın sahibi (öğrenci) doldurur.
- Senkron akışı bridge'in içine taşındı (eski yarış durumu kalktı).
- Sekme pasif→aktif geçişinde workspace bağlantısının kopuk kalması düzeltildi.

## 3) Şifreli Eğitmen Alanı + BLOK Tabanlı Kit Kütüphanesi
- Öğretmen girişi **eğitmen şifresi** ister (oturum başına bir kez;
  sekme kapanınca yeniden sorulur). Öğrenciler eğitmen alanını hiç göremez.
- Sol menüde sadece öğretmenlerde görünen **"Eğitmen Kütüphanesi"**:
  Tüm hazır programlar artık **BLOK TABANLI** — "Ekrana Yükle" ile bloklar
  doğrudan çalışma alanına gelir, kod önizlemesi ve MicroPython üretimi
  uygulamanın kendi bloklarından otomatik yapılır.
  - 🦾 **RoboArm Kiti (4):** Kol Merkez ve Eksen Testi · Klavye ile Kol
    Kontrolü (A/D-W/S-↑↓-Q/E) · Selam Ver Demo · Nesne Al ve Bırak
  - 🍓 **BerryBot Kiti (4):** Motor Testi · Klavye ile Sürüş (WASD) ·
    Engelden Kaçan Robot · Çizgi İzleyen Robot
  - 🛡️ **Tank Kiti (3):** Palet Motor Testi · Klavye ile Tank Sürüşü ·
    Engelden Kaçan Tank
- Her dosyada adım özeti + **📋 Kopyala** (uygulama panosuna) ve
  **➤ Ekrana Yükle** (bağlıysan öğrencinin ekranına anında Live Share ile).
- 11 blok programının tamamı, uygulamadaki gerçek blok tanımlarına karşı
  otomatik doğrulayıcıyla (alan/giriş/dropdown) test edildi.

## 4) Öğretmen Blok Kopyala / Yapıştır (YENİ)
Öğretmenin "bağlantıyı kesip kendi ekranımdaki kodu çocuğun ekranına
yapıştıramıyorum" sorunu çözüldü:
- **Sınıf panelinde** öğretmene özel iki buton: **📋 Blokları Kopyala**
  (ekrandaki tüm blokları uygulama panosuna alır — oda değişse de kaybolmaz)
  ve **📥 Yapıştır** (panodakini şu anki ekrana yükler; öğrenciye bağlıysan
  bloklar anında öğrencinin ekranına yansır, üzerine yazmadan önce onay sorar).
- "Şu an bağlısın" kutusunda ayrıca **📥 Bu Ekrana Yapıştır** kısayolu.
- **Otomatik kolaylıklar:** Öğretmen bir öğrenciye bağlanırken kendi
  ekranındaki bloklar OTOMATİK panoya alınır; "Bağlantıyı Kes" deyince
  öğretmenin kendi ekranı otomatik geri yüklenir — kendi kodun asla kaybolmaz.
- Eğitmen Kütüphanesi'ndeki "Kopyala" da aynı panoyu doldurur; istediğin
  hazır programı önce panoya alıp sonra istediğin öğrenciye yapıştırabilirsin.

## Dosyalar
- Değişen: `src/serial/bridge.ts`, `src/collab/blockly-sync.ts`,
  `src/collab/livesync.ts`, `src/App.tsx`, `src/components/LoginModal.tsx`,
  `src/components/ActivityRail.tsx`, `src/components/ClassroomPanel.tsx`,
  `src/styles.css`, `package.json`
- Yeni: `src/config/teacherAuth.ts`, `src/library/kits-blocks.ts`,
  `src/components/TeacherLibraryPanel.tsx`

---

# RoboExx 2.13.0 — Ek Değişiklikler

## 5) Arduino Zamanlama Düzeltmeleri (milisaniyeler artık TAM)
- **Kök neden bulundu:** Blockly değişkenleri Arduino'da `float` üretiliyor;
  `delay()` kesirli değeri AŞAĞI yuvarlıyordu. float 0.7 aslında 0.6999999…
  olduğundan hesaplanan süreler sistematik 1 ms eksik çalışıyordu
  (700 yerine 699 ms). Tüm bekleme/buzzer sürelerine **+0.5 yuvarlama** eklendi.
- **Aralıklı derleme hatası giderildi:** Canlı klavye modunda `delay()` →
  `rxDelay()` dönüşümü, yardımcı fonksiyonların tanım sırasına göre
  "rxDelay not declared" hatası üretebiliyordu ("bazen yüklenmiyor"un nedeni).
  Artık dosya başına **ileri bildirimler** ekleniyor + canlı tuş yardımcıları
  her zaman en başa yazılıyor — sıra bağımsız, g++ ile test edildi.
- **rxDelay hassaslaştırıldı:** bitişi millis() sınırında tam yakalar,
  uzun beklemede CPU'yu boşa döndürmez, son milisaniyede ince taramaya geçer.

## 6) Sabit Derleme Sunucusu + Arduino ile Simülasyon
- Derleme adresi artık SORULMUYOR: `https://roboexx-arduino-compile.onrender.com`
  sabit varsayılan. (İstenirse ?derleme= / ayarlar ile hâlâ değiştirilebilir.)
- **Simülasyon Arduino bloklarıyla çalışmıyordu — düzeltildi:**
  - Kök neden: `L9110 motor` bloklarının ve birkaç sensörün sim eşlemesi
    yoktu / adları yanlıştı → kod üretici patlıyor, sim hiç başlamıyordu.
  - L9110 blokları artık sim'de paletleri/tekerleri sürüyor (küçük IA = sol).
  - **Klavye ile OYNAMA geldi:** `Tuş basılı mı?` blokları sim'de gerçek
    WASD/ok tuşlarını okuyor — robot simülasyonda klavyeyle sürülebiliyor.
  - Emniyet ağı: eşlenmemiş herhangi bir blok sim'i artık ASLA kilitlemez.

## 7) 🦾 Robot Kol Otomatik Hareket Blokları (YENİ KATEGORİ)
Blok menüsüne "🦾 Robot Kol" kategorisi eklendi — bilimsel hareket motoru:
- **🦾 Kol pozu** — 4 ekseni AYNI ANDA, seçilen eğriyle yumuşakça götürür
- **🦾 Kol ekseni** — tek ekseni eğriyle sür (taban/omuz/dirsek/gripper)
- **Hareket eğrileri:** — doğrusal · 〰 S eğrisi · ◞ yavaş başla · ◠ yavaş bitir
- **🧊 Küpü al** — tek blokla bilimsel kavrama dizisi: gripper aç → S
  eğrisiyle yaklaş → "yavaş bitir" eğrisiyle çarpmadan alçal → kavra → kaldır
- **🧊 Küpü bırak** — taşı, yumuşak alçal, bırak, kalk
- **🦾 Kolu merkeze al · Gripper aç/kapa · Selam salla** — hazır hareketler
- **🦾 Kol pinleri** — pin ayarı (varsayılan GP0-3; Arduino'da 3,5,6,9)
- Hem MicroPython hem Arduino kod üretir; @SV telemetrisi sayesinde
  **3D robot kol simülasyonu hareketleri canlı izler**.
- Eğitmen Kütüphanesi'ne 2 yeni hazır ders: **🧊 Küp Görevi (Otomatik
  Bloklar)** ve **〰 Hareket Eğrisi Deneyi** (4 eğriyi karşılaştırmalı dener).
- Doğrulama: Python kütüphanesi çalıştırılarak, C++ kütüphanesi g++ ile
  derlenerek, 13 hazır blok programının tamamı otomatik linter'la test edildi.
