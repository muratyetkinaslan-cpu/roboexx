# RoboExx — Arduino Derleme Sunucusu Kurulumu

Tarayıcı C++ derleyemediği için, bloklardan üretilen Arduino (`.ino`) kodunu
`arduino-cli` ile derleyen küçük bir sunucu gerekir. Sunucu Intel **HEX** döndürür,
frontend bu HEX'i WebSerial (STK500v1) ile karta yükler.

> Not: Bu sunucu **olmadan da** uygulama çalışır — kullanıcı bloklardan üretilen
> kodu **`.ino` olarak indirip** Arduino IDE ile yükleyebilir. Sunucu yalnızca
> "tek tıkla derle + yükle" akışı için gereklidir.

## Frontend sunucuyu nasıl bulur? (öğrenciler için sıfır ayar)

Sırasıyla denenir:

1. **`?derleme=` linki** — Siteyi `https://site-adresin/?derleme=https://sunucu-adresi`
   ile açan herkeste URL kalıcı kaydolur. **Sınıfa bu linki paylaşmak yeterlidir.**
2. `localStorage` (popup'taki "sunucu URL'i ayarla")
3. Build sırasında `VITE_ARDUINO_COMPILE_URL` ortam değişkeni
4. **Otomatik keşif:** sitenin kendi origin'i ve `http://localhost:8080`
   `/health` ile yoklanır — yerelde `node server/arduino-compile.js` çalışıyorsa
   hiçbir ayar yapmadan bulunur.

## 1. Gereksinimler

- Node.js 18+
- [`arduino-cli`](https://arduino.github.io/arduino-cli/latest/installation/)
- **npm install GEREKMEZ** — sunucu sıfır bağımlılıklı tek dosyadır.

## 2. arduino-cli kurulumu

```bash
# Linux/macOS
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
export PATH="$PWD/bin:$PATH"   # veya bin/ klasörünü PATH'e ekle

# Windows (PowerShell): winget install ArduinoSA.CLI

arduino-cli config init
arduino-cli core update-index
arduino-cli core install arduino:avr   # Uno / Nano / Mega
```

Doğrula:

```bash
arduino-cli core list
```

## 3. Sunucuyu çalıştır

```bash
node server/arduino-compile.js
# -> RoboExx Arduino derleme sunucusu http://0.0.0.0:8080 üzerinde çalışıyor
```

Sağlık kontrolü:

```bash
curl http://localhost:8080/health
```

Ortam değişkenleri:

- `PORT` — dinlenecek port (varsayılan 8080)
- `ARDUINO_CLI` — arduino-cli yolu PATH'te değilse
- `ALLOWED_ORIGIN` — CORS kısıtı (varsayılan `*`; üretimde site adresini ver)

## 4. Deploy (Render — tek tık)

Repo kökündeki `render.yaml` iki servis tanımlar: canlı paylaşım sunucusu ve
**`roboexx-arduino-compile`** (Docker, `server/compile-deploy/Dockerfile`).
Render → New → Blueprint → repo seç → Apply. Çıkan adresi (`https://roboexx-arduino-compile.onrender.com`)
`?derleme=` linkiyle sınıfa paylaş veya build'e `VITE_ARDUINO_COMPILE_URL` olarak ver.

Notlar:

- **HTTPS şart:** Site HTTPS ise tarayıcı `http://` sunucuya istek atamaz
  (mixed content). Render zaten HTTPS verir. (İstisna: `http://localhost` her zaman serbesttir.)
- Render free plan uyur; ilk istek ~30 sn gecikebilir. Ders öncesi
  `/health` adresini bir kez açmak sunucuyu uyandırır.

## Güvenlik ve performans

- Sadece izin verilen FQBN'ler derlenir (`ALLOWED_FQBN`).
- Kaynak boyutu sınırlıdır (200 KB), derleme 120 sn'de zaman aşımına uğrar.
- Derlemeler tek tek kuyruğa alınır (zayıf sunucuda CPU patlamaz).
- **HEX önbelleği:** aynı kod + kart ikinci kez istendiğinde anında döner —
  25 öğrenci aynı örneği yüklerken tek derleme yapılır. (Tarayıcı tarafında da
  ayrıca önbellek vardır.)
- Her derleme geçici klasörde yapılır ve sonrasında silinir.
- Halka açık dağıtımda `ALLOWED_ORIGIN` ile origin kısıtla.
