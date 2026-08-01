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
