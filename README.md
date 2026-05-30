# RoboExx — Blok Tabanlı Programlama Uygulaması · v0.4

Pico (W) için blok tabanlı + MicroPython programlama ortamı.
**Web Serial üzerinden gerçek bağlantı, gerçek Run, gerçek Upload.**

## v0.4'te neler eklendi

- ✅ **Web Serial bağlantı:** `navigator.serial.requestPort()` ile gerçek bağlantı
  - Picker filtrelendi: sadece **Raspberry Pi (VID 0x2E8A)** cihazları görünür
  - "COM3" / "/dev/cu.usbmodem" yerine **"Raspberry Pi Pico W"** gibi anlaşılır isim gösterir
  - **Otomatik bağlanma:** Sayfa açıldığında daha önce yetkilendirilmiş cihaz varsa kendiliğinden bağlanır
  - **Hot-plug:** Pico USB'ye sonradan takılırsa fark eder, otomatik bağlanır
- ✅ **Run (gerçek):** Raw REPL üzerinden kodu RAM'de çalıştırır, çıktı anında Serial Monitor'e akar
- ✅ **Upload (gerçek):** Kod `main.py` olarak flash'a yazılır, Pico soft reset ile yeniden başlar
  - **Hız:** Tek seferde Python `bytes literal` olarak gönderilir, 1024-bayt chunk'larla → tipik kod <100ms'de yüklenir
- ✅ **Upload Overlay:** Yüzde, KB/saniye, ✓ Başarılı / ✗ Hata feedback'i
  - Başarıda yeşil tik animasyonu, 1.6sn sonra otomatik kapanır
  - Hatada kırmızı X + shake animasyonu + Pico hata mesajı
- ✅ **Stop butonu:** Çalıştırma sırasında Run yerine kırmızı Durdur butonu çıkar (Ctrl+C gönderir)
- ✅ **Serial Monitor:** Pico'dan gelen satırlar otomatik tipe göre renklenir
  - `Traceback` ve `*Error:` satırları kırmızı (error)
  - MicroPython banner system rengi
  - Komut input'unda Enter → Pico'ya `\r\n` ile gönderilir
- ✅ **Toolbar device pill:** Bağlantı durumunu gösteren büyük rozet
  - Cihaz yok / Bağlanılıyor… / **Raspberry Pi Pico W · BAĞLI · 115200**
  - Animasyonlu pulse efekti aktif bağlantıda

## Tarayıcı uyumu

- ✅ **Chrome / Edge** (Windows, Mac, Linux, Android)
- ❌ **Firefox / Safari** — Web Serial desteklemiyor (mesaj göstereceğiz)

## Kurulum

```bash
unzip roboexx-app.zip
cd roboexx-app
npm install      # postinstall otomatik blockly medya dosyalarını kopyalar
npm run dev
```

`http://localhost:5173`

## İlk kullanım

1. Pico'yu USB ile bağla (MicroPython firmware kurulu olmalı)
2. **Bağlan** butonuna tıkla
3. Açılan picker'da **"Raspberry Pi Pico W"** veya **"Raspberry Pi Pico"** seç
4. Bağlantı kuruldu — Serial Monitor'da Pico banner'ı görünür
5. Bloklarla program yaz veya Kod sekmesinden MicroPython yaz
6. **▶ Çalıştır** ile RAM'de test et (kart resetlenince kaybolur)
7. **⬆ Yükle** ile `main.py` olarak kalıcı yaz (kart bağımsız çalışır)

## Mimari

### Serial protokolü

```
Run akışı (Raw REPL):
  App           Pico
   │             │
   │── \r\x03\x03 ──→  (interrupt)
   │── \r\x01    ──→  (enter raw mode)
   │             ←──  "raw REPL; CTRL-B to exit\r\n>"
   │── <code>    ──→
   │── \x04      ──→  (execute)
   │             ←──  "OK<output>\x04<errors>\x04>"
   │── \r\x02    ──→  (exit raw mode)
   │             ←──  ">>>"

Upload akışı: Run + open('main.py','wb') + write + soft reset (Ctrl-D friendly mode)
```

### Klasör yapısı

```
src/
├── App.tsx                          ← Tüm state + olay yönetimi
├── serial/
│   ├── types.ts                     ← Port info, friendly name, bytes literal
│   └── bridge.ts                    ← SerialBridge class (singleton)
├── themes/                          ← 4 tema
├── blockly/                         ← Bloklar, generator, toolbox
└── components/
    ├── ActivityRail.tsx             ← Sol dikey nav
    ├── BlocklyWorkspace.tsx
    ├── CodeEditor.tsx               ← CodeMirror 6
    ├── CodePreview.tsx
    ├── ModeTabs.tsx
    ├── SerialMonitor.tsx
    ├── ThemeMenu.tsx
    ├── Toolbar.tsx                  ← Device pill, Run/Upload/Stop
    └── UploadOverlay.tsx            ← Yükleme modal'ı
```

## Yol haritası

| Adım | İçerik | Durum |
|------|--------|-------|
| 1 | İskele, Blockly, tema, 6 blok, kod önizleme | ✓ |
| 2 | 4 tema, MicroPython editörü, mod geçişi | ✓ |
| 3 | Activity Rail, Serial Monitor, SVG ikonlar | ✓ |
| **4** | **Web Serial bağlantı, Run, Upload, progress bar** | **✓** |
| 5 | Web Bluetooth + Pico W BLE GATT (Çalıştır/Yükle BLE üzerinden) | ⏳ |
| 6 | Karta özel sensör/aktüatör blokları (motor, servo, sensör) | ⏳ |
| 7 | Proje kaydet/yükle (localStorage → bulut) | ⏳ |
| 8 | Çoklu dosya desteği (lib/ klasörü, modüller) | ⏳ |

## Bilinen kısıtlamalar

- **Çok büyük kod (>50KB):** Tek hamlede gönderiliyor, Pico parser'ı zorlanabilir. Pratik bir limit değil; tipik öğrenci kodu <5KB.
- **Sonsuz döngülü kod Run'lanırsa** UI 60sn'ye kadar `busy` kalır. Stop butonu ile Ctrl+C gönderilir, normal döner.
- **Picker filtre:** Sadece Raspberry Pi VID'li cihazlar görünür. Başka USB-serial cihaz (örn. ESP32, Arduino) bağlamak için filtre kaldırılması gerekir (`src/serial/bridge.ts` → `requestAndConnect`).
