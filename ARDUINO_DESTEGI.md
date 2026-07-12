# RoboExx — Arduino Desteği (Değişiklik Özeti)

Aynı bloklardan artık **iki kart** hedeflenebilir: **Pico (MicroPython)** ve **Arduino (C++)**.
Toolbar'daki **🐍 Pico / 🔌 Arduino** anahtarıyla geçiş yapılır; bloklar aynı kalır, sadece üretilen kod dili değişir.

## YENİ Bloklar
- **L9110 Motor** — IA/IB pin, yön (ileri/geri), hız (0–100)
- **L9110 Dur**
- **Enkoder** — başlat (pin), sayaç, hız (puls/sn), sıfırla
  → Arduino'da kesme (interrupt) tabanlı; enkoder pinleri **2 ve 3** olmalı (Uno/Nano interrupt pinleri).

## YENİ Dosyalar
- src/blockly/arduino-generator.ts — Bloklardan Arduino C++ üretici (L9110, enkoder, tüm temel bloklar + Pico'ya özel bloklar için güvenli yorum)
- src/blockly/codegen.ts — Hedef seçici (micropython | arduino), hata olursa çökmeden boş döner
- src/arduino/boards.ts — Uno / Nano (yeni) / Nano (eski) tanımları
- src/arduino/intelhex.ts — Intel HEX çözümleyici
- src/arduino/stk500.ts — WebSerial STK500v1 flasher (npm bağımlılığı yok)
- src/arduino/compile.ts — Derleme sunucusu istemcisi + .ino indirme
- src/components/ArduinoUploader.tsx — "Arduino'ya Yükle" popup'ı
- server/arduino-compile.js — arduino-cli derleme sunucusu (opsiyonel)
- server/ARDUINO_COMPILE_SERVER.md — Sunucu kurulum rehberi

## DEĞİŞEN Dosyalar
- src/blockly/blocks.ts — L9110 + enkoder blok tanımları
- src/blockly/generator.ts — L9110 + enkoder MicroPython üreticileri (kendi kendine yeten; roboexx.py değişmedi)
- src/blockly/toolbox.ts — "L9110 Motor" ve "Enkoder" kategorileri
- src/components/BlocklyWorkspace.tsx — hedef-duyarlı kod üretimi (target prop + regenerate)
- src/components/Toolbar.tsx — Pico/Arduino anahtarı + "Arduino'ya Yükle" butonu
- src/App.tsx — codeTarget state, ArduinoUploader, hedefe göre önizleme/yükleme yönlendirme
- src/styles.css — Arduino popup + hedef anahtarı stilleri

## Nasıl Kullanılır
1. Bloklarını sürükle (Pico'da çalışan her şey aynı kalır).
2. Toolbar'dan **🔌 Arduino** seç.
3. **Arduino'ya Yükle** → kartını seç (Uno/Nano):
   - **Hızlı yol (sunucusuz):** ".ino indir" → Arduino IDE ile aç → Yükle.
   - **Tek tık:** Derleme sunucusu URL'i ayarla → "Derle ve Yükle" (WebSerial ile doğrudan flash, Chrome/Edge).
4. L9110 bağlantısı: IA/IB pinleri kartta **PWM destekli** olmalı (örn. Uno'da 3,5,6,9,10,11). Enkoder pinleri **2/3**.

## Doğrulama
- `npm run build` (vite) ✓ başarılı — sıfır yeni tip hatası (mevcut Blockly 11 uyarıları hariç).
- Headless üretim testi: L9110 + enkoder + on_start/forever → temiz, derlenebilir C++ üretildi (setup/loop, ISR'lı enkoder, analogWrite'lı L9110).

---

# GÜNCELLEME — Öğrenci Dostu Yükleme Akışı (v2)

Öğrenciler artık Pico'daki gibi **önce portu seçip** tek tıkla yükleme yapar.

## Yeni akış (öğrencinin gördüğü)
1. **Arduino'yu tak** → "Arduino'ya Yükle" → **Portu Seç** (dialog yalnız Arduino
   benzeri USB cihazları listeler — yanlış port seçmek neredeyse imkânsız).
2. Kart **USB çipinden otomatik tanınır** (orijinal Arduino → Uno, CH340 → klon
   Nano, FTDI → eski Nano) ve önceden seçilir. Öğrenci isterse değiştirir.
3. **⚡ Karta Yükle** — derle + flash + çalıştır. Bitti.

Bir sonraki yüklemede port dialogu **hiç açılmaz**: daha önce izin verilen port
otomatik hatırlanır, öğrenci sadece "Yükle"ye basar.

## Güvenilirlik iyileştirmeleri
- **Otomatik bootloader hızı:** Nano'da eski/yeni bootloader bilinmese de olur —
  sync başarısız olursa diğer hız (115200 ↔ 57600) otomatik denenir.
- **Dayanıklı sync:** 8 deneme + ortada ek reset darbesi (ilk DTR'yi kaçıran
  klonlar için).
- **HEX önbelleği (2 katman):** Aynı blokları tekrar yüklerken derleme beklenmez
  (tarayıcı localStorage). Sunucu tarafında da önbellek var: 25 öğrenci aynı
  örneği yüklerken **tek** derleme yapılır.
- **Derleme kuyruğu:** Sunucuda derlemeler sıraya alınır, zayıf makine boğulmaz.
- Hata ekranında çocuklara yönelik **kontrol listesi** (veri taşımayan kablo,
  açık kalan Seri Monitör, yanlış port…).

## Sıfır ayar (öğretmen için)
Derleme sunucusu URL'i şu sırayla **kendiliğinden** bulunur:
1. `?derleme=https://sunucu` linki → kalıcı kaydolur. **Sınıfa tek link paylaş.**
2. Popup'tan elle girilen URL (localStorage)
3. Build ortam değişkeni `VITE_ARDUINO_COMPILE_URL`
4. Otomatik keşif: sitenin origin'i ve `localhost:8080` `/health` ile yoklanır.

Yerelde çalıştırmak (npm install **gerekmez**, yalnız Node + arduino-cli):
```bash
npm run arduino-server     # http://localhost:8080 — frontend otomatik bulur
```

## Düzeltilen hata
`server/arduino-compile.js` daha önce `require()` kullandığı için
(`server/package.json` → `"type": "module"`) **hiç başlamıyordu**; ayrıca
express/cors kurulumu istiyordu. Yeni sürüm ESM + **sıfır npm bağımlılığı**
(saf `node:http`).

## Deploy
`render.yaml` artık iki servis içerir; `roboexx-arduino-compile` Docker ile
arduino-cli kurulu gelir (bkz. `server/compile-deploy/Dockerfile`). Render →
Blueprint → Apply, çıkan adresi `?derleme=` ile paylaş. Ayrıntı:
`server/ARDUINO_COMPILE_SERVER.md`.

---

# GÜNCELLEME v3 — Arduino'da Canlı Klavye + Gamepad 🎮

Pico'daki canlı sürüş artık Arduino'da da çalışıyor. Aynı protokol kullanıldı:
tarayıcı her 50 ms'de basılı tuş kümesini `\x06<tuşlar>\n` paketiyle gönderir.

## Nasıl çalışır
1. Bloklarını kur: ör. *sürekli tekrarla → eğer 🎮 Gamepad [⬆] basılı mı? → motor ileri*.
2. **Arduino'ya Yükle** → yükleme biter bitmez uygulama **aynı portu 115200
   baud ile açık tutar** ve "🎮 Canlı kontrol aktif" gösterir.
3. Popup'ı kapat, gamepad/klavyeyle sür. Kablo takılı kaldığı sürece çalışır.
4. Tekrar yüklemek istersen sadece "Yükle"ye bas — canlı bağlantı otomatik
   kapatılır, flash yapılır, sonra yeniden açılır.

## Teknik değişiklikler
- `src/blockly/arduino-generator.ts` — `rx_key_pressed`, `rx_key_just_pressed`,
  `rx_gamepad_pressed`, `rx_gamepad_just_pressed` artık gerçek C++ üretir:
  `rxTusBasili(ch)` / `rxTusBasildi(ch)` + bloklamayan `__rxPumpKeys()` seri
  okuyucu (roboexx.py'deki `_pump_serial_keys`'in C++ karşılığı). Bu bloklar
  kullanılınca `Serial.begin(115200)` otomatik eklenir ve `loop()` başında
  pump çağrılır.
- `src/arduino/livelink.ts` (YENİ) — flash sonrası portu 115200 ile açık tutan
  tekil canlı bağlantı; gelen veriyi boşaltır (tampon tıkanmaz), yazma hatasında
  kendini kapatır.
- `src/components/ArduinoUploader.tsx` — flash öncesi canlı bağlantıyı kapatır
  (port tek sahipli), başarıdan sonra otomatik açar; "🎮 Canlı kontrol aktif" notu.
- `src/App.tsx` — tuş/gamepad döngüsü artık Pico bağlı olmasa da Arduino canlı
  bağlantısı açıkken çalışır ve paketleri ona da gönderir. Sağ alttaki basılı
  tuş göstergesi Arduino modunda da görünür.

## Notlar
- Canlı kontrol **USB kablosu takılıyken** çalışır (Arduino'da BLE yok).
- Port açılırken kart bir kez resetlenir (DTR) — bootloader ~1 sn bekleyip
  programı başlatır, normaldir.
- `Serial.print` blokları canlı bağlantıyla çakışmaz; kartın gönderdiği veri
  tarayıcıda sessizce boşaltılır.

---

# GÜNCELLEME v4 — Canlı Kontrol Kararlılığı (titreme/reset düzeltmesi)

**Belirti:** Gamepad'le sürerken motorlar aralıklı duruyor/başlıyor, "resetleniyor
gibi" titriyordu (Pico'da yoktu).

**Kök neden:** Arduino'nun donanım seri RX tamponu **64 bayt**. Bloklarda
`delay()` (bekle) çalışırken kart paketleri okuyamıyor → tampon taşıyor →
paketler ortadan bölünüyor → kart bir paketliğine "tuş bırakıldı" sanıp motoru
durduruyor. Pico'da MicroPython'un büyük USB CDC tamponu bunu gizliyordu.

**Düzeltmeler (üretilen C++ içinde, otomatik):**
1. **rxDelay():** Canlı tuş kullanılan programlarda tüm `delay(...)` çağrıları
   otomatik olarak `rxDelay(...)`'e çevrilir — bekleme sırasında da seri
   paketler okunur, tampon hiç taşmaz. (`delayMicroseconds` etkilenmez.)
2. **Bozuk paket çöpe:** Tampon sınırını aşan (bölünmüş/birleşmiş) paketler
   uygulanmaz; önceki tuş durumu korunur.
3. **Bırakma debounce'u:** Bir tuş ancak **2 ardışık geçerli pakette** yoksa
   bırakılmış sayılır — tek paketlik kayıp artık titreme yaratamaz.
   (Basma anlıktır, gecikme hissedilmez; bırakma en çok ~100 ms.)
4. **Güvenli duruş:** 500 ms hiç paket gelmezse (kablo çekildi, sekme kapandı)
   tüm tuşlar bırakılır → robot kontrolsüz gitmez.

Pump mantığı masaüstünde g++ ile birim testinden geçirildi (bozuk paket,
debounce, failsafe, yarım paket senaryoları).

**Ayrıca bilinen donanım notu:** Uno/Nano'da `Servo` kütüphanesi Timer1
kullanır; servo bağlıyken **9 ve 10 numaralı pinlerde `analogWrite` (PWM)
çalışmaz**. L9110/motor hız pinlerini 3, 5, 6 veya 11'e alın — servo+motor
birlikte kullanılıp motor "garip" davranıyorsa sebep budur.

---

# GÜNCELLEME v5 — Zorlanınca Reset (brownout) Dayanıklılığı

**Belirti:** Robot kol zorlanınca Arduino resetleniyor.

**Kök neden (donanım):** Servolar zorlanınca ani yüksek akım çeker, 5V hattı
çöker (brownout) ve işlemci resetlenir. Bu yazılımla önlenemez — çözüm besleme:
servo gücünü Arduino'nun 5V pininden DEĞİL, ayrı kaynaktan ver (GND'ler ortak),
servo hattına 470–1000 µF kondansatör koy.

**Yazılım güvenlik ağı (bu sürümde eklendi):**
- Reset sırasında USB-seri çipi de düşerse canlı bağlantı kopuyordu; artık
  `livelink` aynı USB cihazına (VID/PID) **20 sn boyunca 2 sn arayla otomatik
  yeniden bağlanır** — öğrenci hiçbir şey yapmadan gamepad geri gelir.
- USB düşmeden resetlenirse zaten kendini toparlıyordu: tarayıcı her 50 ms'de
  tam durumu gönderdiği için sketch yeniden başlar başlamaz kontrol devam eder.
- Manuel kapatma (yeni flash öncesi) otomatik yeniden bağlanmayı iptal eder.
