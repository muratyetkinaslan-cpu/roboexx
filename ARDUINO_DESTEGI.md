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
