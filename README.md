# RoboExx — Raspberry Pi Pico W için Blok Tabanlı Programlama

Çocuklar için Türkçe blok tabanlı Python programlama ortamı. Raspberry Pi Pico W ve PicoBricks/BerryBot kitleri ile çalışır.

## Özellikler

- **Blok tabanlı kodlama** — Scratch tarzı sürükle-bırak, otomatik MicroPython üretir
- **Çift bağlantı** — USB seri veya Bluetooth (BLE) ile Pico'ya yükleme
- **Canlı klavye + gamepad kontrolü** — robotu W-A-S-D veya Xbox/PS kumandasıyla sür
- **36 hazır şarkı** — buzzerdan çalınabilir
- **Sensörler ve aktüatörler** — LED, RGB (WS2812), buzzer, servo, DC motor, ultrasonik mesafe, LDR, buton

## Tarayıcı gereksinimleri

**Chrome veya Edge (masaüstü)** kullanmanız gerekiyor.

- Web Bluetooth ve Web Serial API gerekir
- Firefox ve Safari desteklemiyor
- Mobil tarayıcılar sınırlı (Android Chrome çalışır, iOS desteklemez)

## Kurulum (kullanıcılar için)

1. Pico W'ye MicroPython firmware'i yüklenmiş olmalı (resmi UF2'den)
2. Pico'yu USB ile bilgisayara bağla
3. RoboExx'i tarayıcıda aç
4. "Bağlan" → seri portu seç
5. "Modülleri Yükle" → PicoBricks veya BerryBot seç → kütüphane + BLE bootloader yüklenir
6. Pico'ya RESET bas
7. Artık BLE üzerinden kablosuz çalışabilir (kit varsa pille besle)

## Geliştirme

```bash
npm install
npm start              # vite + collab sunucu (Live Share için)
# veya sadece frontend:
npm run dev
```

`npm start` HTTPS ile localhost:5173'te açar.

## Deploy (Vercel)

```bash
npm i -g vercel
vercel
```

Veya GitHub push → Vercel otomatik build. Ayarlar `vercel.json`'da hazır.
