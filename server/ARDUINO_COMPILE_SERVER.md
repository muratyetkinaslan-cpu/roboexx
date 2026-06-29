# RoboExx — Arduino Derleme Sunucusu Kurulumu

Tarayıcı C++ derleyemediği için, bloklardan üretilen Arduino (`.ino`) kodunu
`arduino-cli` ile derleyen küçük bir sunucu gerekir. Sunucu Intel **HEX** döndürür,
frontend bu HEX'i WebSerial (STK500v1) ile karta yükler.

> Not: Bu sunucu **olmadan da** uygulama çalışır — kullanıcı bloklardan üretilen
> kodu **`.ino` olarak indirip** Arduino IDE ile yükleyebilir. Sunucu yalnızca
> "tek tıkla derle + yükle" akışı için gereklidir.

## 1. Gereksinimler

- Node.js 18+
- [`arduino-cli`](https://arduino.github.io/arduino-cli/latest/installation/)

## 2. arduino-cli kurulumu

```bash
# Linux/macOS
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
export PATH="$PWD/bin:$PATH"   # veya bin/ klasörünü PATH'e ekle

arduino-cli config init
arduino-cli core update-index
arduino-cli core install arduino:avr   # Uno / Nano / Mega (ATmega328P, vb.)
```

Doğrula:

```bash
arduino-cli core list
```

## 3. Sunucuyu çalıştır

```bash
cd server
npm install express cors
node arduino-compile.js
# -> RoboExx Arduino derleme sunucusu :8080 üzerinde çalışıyor
```

Sağlık kontrolü:

```bash
curl http://localhost:8080/health
```

## 4. Frontend'i bağla

Uygulamada **Arduino'ya Yükle** popup'ını aç → **sunucu URL'i ayarla** ve sunucu
adresini gir (örn. `http://localhost:8080` veya yayınladığın HTTPS adresi).
URL `localStorage`'a (`roboexx.arduino-compile-url`) kaydedilir.

Alternatif: derleme sırasında ortam değişkeni ver:

```bash
VITE_ARDUINO_COMPILE_URL=https://senin-derleme-sunucun.org npm run build
```

## 5. Deploy (Render / Railway / VPS)

- Bu servis, mevcut **işbirliği (Yjs) sunucusundan ayrıdır**; ayrı bir servis
  olarak deploy etmek en temizidir.
- Docker imajında `arduino-cli` + `arduino:avr` çekirdeğinin kurulu olması gerekir.
- `PORT` ortam değişkenini platform veriyorsa otomatik kullanılır.
- **HTTPS şart**: Site HTTPS ise (Vercel), tarayıcı `http://` derleme sunucusuna
  istek atmayı (mixed content) engeller. Derleme sunucusunu da HTTPS yap.
- **CORS**: Varsayılan tüm originlere açık. Üretimde `arduino-compile.js` içinde
  `cors({ origin: 'https://senin-sitende.vercel.app' })` ile kısıtla.

### Örnek Dockerfile

```dockerfile
FROM node:20-bullseye
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh -s 0.35.3 \
 && mv bin/arduino-cli /usr/local/bin/
RUN arduino-cli core update-index && arduino-cli core install arduino:avr
WORKDIR /app
COPY server/arduino-compile.js ./arduino-compile.js
RUN npm init -y && npm install express cors
EXPOSE 8080
CMD ["node", "arduino-compile.js"]
```

## Güvenlik notları

- Sadece izin verilen FQBN'ler derlenir (`ALLOWED_FQBN`).
- Kaynak boyutu sınırlıdır (200 KB).
- Her derleme geçici klasörde yapılır ve sonrasında silinir.
- Herkese açık bir derleme sunucusu, gelen kodu derler. Halka açık dağıtımda
  oran sınırlama (rate limit) ve origin kısıtlaması eklemen önerilir.
