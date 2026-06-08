# Robot Kol Simülasyonu — Entegrasyon Notları

Blok tabanlı uygulamaya 3B robot kol simülasyonu eklendi. Servo blokları çalışınca
**gerçek kol** ve **simülasyon** birebir, karşılıklı oynar.

## Eklenen / değişen dosyalar

**Yeni:**
- `src/sim/armData.ts` — kolun 3B geometrisi + pivotlar + gripper ekseni + ROBOGPT logosu (otomatik üretildi).
- `src/sim/servoBus.ts` — servo durum yolu. Firmware'in seri porttan yankıladığı `@SV <id> <açı>` satırlarını parse eder.
- `src/sim/RobotArmSim.tsx` — React simülasyon komponenti. Three.js'i **CDN'den** yükler (yeni npm bağımlılığı yok), kolu kurar, canlı servo açılarıyla eksenleri sürer, **eksen↔servo eşleme** menüsü ve **tam ekran** düğmesi içerir.

**Değişen:**
- `src/components/Toolbar.tsx` — 🦾 **Robot Kol** düğmesi (sensör paneli yanına). `onRobotArm` + `robotArmActive` props.
- `src/App.tsx` — `simOpen` state; Toolbar'a bağlandı; `onText` içinde `@SV` satırları `parseServoLine` ile simülasyona yönlendirilir (monitöre yazılmaz); `.workspace-area` `simOpen` iken ikiye bölünür (solda bloklar, sağda sim).
- `src/styles.css` — bölünmüş ekran + `.arm-sim` panel stilleri (dosya sonuna eklendi).
- `public/lib/roboexx.py` — `servo_angle` ve `servo_v2` artık `@SV P<pin> <açı>` / `@SV M<num> <açı>` yankılar.
- `public/lib/pca9685.py` — `servo_v3` artık `@SV C<kanal> <açı>` yankılar.

## Nasıl çalışır

1. Öğrenci 🦾 düğmesine basar → ekran ikiye bölünür (sol blok, sağ 3B sim). İstenirse sim **tam ekran**.
2. Sağ paneldeki menülerden **hangi servo numarasını/pinini hangi eksene** taktığını seçer
   (Taban / Omuz / Dirsek / Gripper → P0…, M1…, C0…). Seçim tarayıcıda saklanır.
3. Blok kodu çalışır → Pico servoyu döndürür **ve** seri porttan `@SV …` yankılar.
4. Tarayıcı bu yankıyı parse eder → simülasyon aynı açıya **yumuşakça** gider.
   Sonuç: gerçek kol ile simülasyon birebir, karşılıklı oynar. Hangi servo bloğu olursa olsun çalışır.

## Çalıştırma

Yeni bağımlılık yok:
```
npm install
npm run dev      # veya: npm run build
```
Three.js çalışma anında CDN'den yüklenir (cdnjs r128).

## Notlar / sonraki adımlar
- Paket boyutu: `armData.ts` ~700 KB (geometri). İstenirse `RobotArmSim`'i `React.lazy` ile
  tembel yükleyerek ana paketten çıkarabilirsin.
- Gerçek fizik (çarpışma/yerçekimi/kavrama) için sonraki adım: Three + **Rapier** veya **cannon-es**,
  ve robotu **URDF** ile tanımlayıp IK'yı sağlamlaştırmak.
