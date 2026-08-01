# RoboExx 2.11.0 — Değişiklik Notları

## 1) Pico Yükleme Sorunu Çözüldü (artık RESET tuşuna gerek yok)
**Sorun:** Birkaç kod yüklemesinden sonra Pico bazen REPL'e dönmüyor, yükleme
yapılamıyor ve kartı fiziksel olarak resetlemek gerekiyordu.

**Çözüm (`src/serial/bridge.ts`):**
- Kesme sekansı sabırlı hale getirildi: Ctrl-C artık aralıklarla 3 kez
  gönderiliyor (mpremote yöntemi) — sıkı döngüler bile kesiliyor.
- **YENİ STRATEJİ 4:** Diğer tüm stratejiler başarısız olursa uygulama
  karta `machine.reset()` göndererek YAZILIMSAL RESET atıyor, USB'nin
  yeniden numaralanmasını bekleyip **otomatik yeniden bağlanıyor** ve
  yüklemeye devam ediyor. Yani RESET tuşuna basma işini artık uygulama
  kendisi yapıyor.
- Seri porta yazmaya 4sn zaman aşımı eklendi — USB yığını sıkışırsa
  uygulama sonsuza dek "Meşgul"de kalmıyor.
- Read-loop jenerasyon sayacı: reset sonrası eski okuma döngüsünün yeni
  portla çakışması engellendi.

## 2) Live Share Tamamen Onarıldı (öğrenci kodu artık SİLİNMEZ)
**Sorun:** Öğretmen öğrencinin ekranına bağlanırken bazen öğrencinin kodu
siliniyordu.

**Kök neden:** Bağlanma sırasında öğretmenin workspace'i önce boşaltılıyor,
bu boş hal 400ms sonra sunucuya gönderiliyordu. Sunucu senkronizasyonu bu
süreden uzun sürerse (okul Wi-Fi'ı) boş gönderim öğrencinin kodunu eziyordu.

**Çözüm (`src/collab/blockly-sync.ts`, `src/App.tsx`):**
- **READY kapısı:** İlk senkron tamamlanıp odadaki kod çekilene kadar hiçbir
  push kabul edilmiyor. Bağlanma anındaki tüm yerel event'ler yutulur.
- **Sahip tohumlaması:** Boş odayı yalnızca odanın sahibi (öğrenci)
  doldurabilir; öğretmen misafir olduğu odaya asla otomatik yazamaz.
- Senkron dinlemesi bridge'in içine taşındı — bridge geç kurulsa bile akış
  bozulmuyor (eski yarış durumu kalktı).
- Sekme pasif→aktif geçişinde workspace bağlantısının kopuk kalması
  düzeltildi (öğrenci artık kendi odasına her zaman yeniden bağlanır).

## 3) Şifreli Eğitmen Alanı + Kit Kod Kütüphanesi (YENİ)
- Öğretmen girişi artık **eğitmen şifresi** ister (sabit şifre; oturum
  boyunca bir kez doğrulanır, sekme kapanınca tekrar sorulur).
- Sol menüde sadece öğretmenlerde görünen **"Eğitmen Kütüphanesi"** paneli:
  - 🦾 **RoboArm Kiti** — Kol Merkez Testi · Klavye ile Kol Kontrolü ·
    Selam Ver Demo · Nesne Al ve Bırak
  - 🍓 **BerryBot Kiti** — Motor Testi · Klavye ile Sürüş (WASD) ·
    Engelden Kaçan Robot · Çizgi İzleyen Robot
  - 🛡️ **Tank Kiti** — Palet Motor Testi · Klavye ile Tank Sürüşü ·
    Engelden Kaçan Tank
- Her kod dosyası için: kod önizleme, **📋 Kopyala** (panoya) ve
  **➤ Ekrana Gönder** butonları.
- **Ekrana Gönder:** Öğretmen bir öğrencinin workspace'ine bağlıysa kod
  anında **öğrencinin Kod sekmesine yapıştırılır** (Live Share üzerinden);
  bağlı değilse öğretmenin kendi editörüne yüklenir. Öğrenci ekranında
  "📥 ... kodunu gönderdi" bildirimi görünür.
- Tüm hazır kodların Python sözdizimi derleyiciyle doğrulandı; pin
  ayarları her dosyanın başındaki AYAR bölümünden değiştirilebilir.

## Dosyalar
- Değişen: `src/serial/bridge.ts`, `src/collab/blockly-sync.ts`,
  `src/collab/livesync.ts`, `src/App.tsx`, `src/components/LoginModal.tsx`,
  `src/components/ActivityRail.tsx`, `src/styles.css`, `package.json`
- Yeni: `src/config/teacherAuth.ts`, `src/library/kits.ts`,
  `src/components/TeacherLibraryPanel.tsx`
