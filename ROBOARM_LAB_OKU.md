# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Bu, değişiklikler uygulanmış **tam RoboExx projesidir**. Eski klasörün
yerine koyup çalıştırabilirsiniz.

```bash
npm install
npm run dev
```

Yeni paket eklenmedi; `package.json` değişmedi.

**Doğrulandı:** `npx tsc --noEmit` ve `npx vite build` çalıştırıldı.
Build başarılı; TS hata sayısı değişikliklerden önceki halle birebir aynı
(23 — hepsi Blockly 11'in kendi tip uyumsuzlukları, bu işle ilgisiz).

---

## Değişen ve eklenen dosyalar

```
YENİ  public/cevap_anahtari/roboarm-gorevler.json   71 görev + cevap anahtarı
YENİ  src/robotarm/vm.ts                            blok yorumlayıcı
YENİ  src/robotarm/checker.ts                       görev kontrol motoru
YENİ  src/robotarm/tasks.ts                         görev yükleyici
YENİ  src/robotarm/hw-bench.ts                      sanal donanım (RGB/buzzer/röle/sensör)
YENİ  src/robotarm/block-marks.ts                   blok üstü hata işaretleme
YENİ  src/components/TaskPanel.tsx                  görev seçici + kontrol raporu
YENİ  src/components/HardwareStrip.tsx              donanım şeridi

DEĞİŞTİ  src/components/RobotArmPanel.tsx           kodlu/kodsuz mod (848 → 987 satır)
DEĞİŞTİ  src/App.tsx                                mod durumu + düzen (2132 → 2144 satır)
DEĞİŞTİ  src/styles.css                             yeni stiller sona eklendi (6977 → 7400 satır)
```

Başka hiçbir dosyaya dokunulmadı.

---

## Simülasyon artık ikiye ayrıldı

Robot Kol panelinin başlığında iki düğme var: **Kodlu · Kodsuz**.
Seçim hatırlanır.

### 🕹 Kodsuz

Eskisinin aynısı. Kaydırıcılar, Tıkla-Git (IK), nokta tekrarı, küp alma,
eklem–servo eşlemesi, gripper ayarı. Kod yazmadan kolu tanımak için.
Kod okunmayacağı için simülasyona daha çok yer verilir (%62).

### ⌨ Kodlu — istediğiniz ekran

Ekran tam ortadan ikiye bölünür:

```
┌───────────────────────┬────────────────────────────────┐
│                       │ [Görev 12 ▾]  ▶ Çalıştır       │
│                       ├────────────────────────────────┤
│      BLOKLAR          │ 🚦 Durum Işığı      ★★  15 dk  │
│      (Blockly)        │ RGB modülü D9(R), D10(G)...    │
│                       ├────────────────────────────────┤
│   hatalı bloklar      │                                │
│   kırmızı/sarı        │      RoboArm 3D simülasyon     │
│   çerçeveli           │                                │
│                       ├────────────────────────────────┤
│                       │ 🔴 RGB  🔊 1000Hz  ⚡ röle     │
│                       ├────────────────────────────────┤
│                       │ 78  Küçük düzeltme gerek       │
│                       │ [HATA] Hiç bekleme bloğu yok   │
└───────────────────────┴────────────────────────────────┘
```

---

## ▶ Çalıştır'a basınca üç şey aynı anda olur

1. **Program cevap anahtarıyla karşılaştırılır** — anında, sanal saatle.
2. **Hatalı bloklar işaretlenir** — kırmızı (hata) veya sarı (uyarı) çerçeve,
   üstlerinde Blockly uyarı balonu. Tıklayınca açıklama çıkar. Ekran ilk
   hatalı bloğa kayar.
3. **Simülasyon canlı oynar** — kol hareket eder, RGB yanar, buzzer gerçekten
   ses çıkarır, çalışan blok vurgulanır.

Sağ alttaki rapor her hatayı yazıyla da anlatır: ne yanlış, neden önemli,
ne yapması gerek. Yanındaki **"bloğu göster"** düğmesi o bloğa götürür.

Örnek çıktı:

> **[HATA] Yanlış servo pini — D5 yazılmış, D4 olmalı**
> Taban eklemi D4 pininde. Senin bloğunda D5 yazıyor, yani Omuz eklemini
> sürüyorsun. Kol görevdeki hareketi yapmıyor.
> Pin haritası: D4 taban · D5 omuz · D6 dirsek · D7 tutucu
> **Ne yapmalısın:** İşaretli bloğun pin alanını 4 yap.

---

## Görev seçimi

Sağ üstteki açılır listede **71 görevin tamamı** var, bölümlere ayrılmış
(Servo Temelleri, Buzzer, RGB LED, Döngü ve Değişken, Buton,
Potansiyometre, Mesafe Sensörü, Gamepad, Işık Sensörü, Seri Monitör,
Sıcaklık ve Röle, Parkur, Otomasyon, Final).

Seçince görev metni, zorluk yıldızı, süresi ve kazanımları altında çıkar.
Öğrencinin seçimi hatırlanır.

Veri `public/cevap_anahtari/roboarm-gorevler.json` içinde: LMS'teki
müfredat v3 metinleri + 71 cevap anahtarı, tek dosyada (397 KB, gzip 36 KB).
Bir kez indirilir, JS paketini büyütmez.

---

## Neden görevler simülasyonda çalışmıyordu

`RobotArmPanel.tsx`'te `servo`, `tone`, `rgbAll`, `digitalWrite` hepsi
`noopAsync` idi. Kol simülasyonu yalnızca `rx_arm_*` bloklarını tanıyordu.
71 cevap anahtarını taradım — müfredat bambaşka bloklar kullanıyor:

| Blok | Kullanım |
|---|---|
| `rx_servo_angle` (D4-D7) | **478 kez** |
| `rx_digital_write` (RGB D9/D10/D11) | 108 |
| `rx_buzzer_tone` / `note` / `off` | 68 |
| ultrasonik, buton, pot, LDR, röle | 60+ |
| **`rx_arm_*`** | **0 kez** |

Öğrenci görevi doğru yazıyor, kol kıpırdamıyordu.

Artık blok programı `vm.ts` ile doğrudan yorumlanıyor: her blok tipi
sanal donanıma bağlı, her olay onu üreten bloğun id'sini taşıyor.
Eski `rx_arm_*` blokları da destekleniyor — Eğitmen Kütüphanesi'ndeki
20 görevlik set aynen çalışmaya devam ediyor.

Servolar gerçek hızıyla (300°/sn) hareket eder. Beklemesiz yazılmış kod
simülasyonda da hedefe varamaz — öğrenci sorunu kart olmadan görür.

---

## Kontrol motoru

Üç katman:

1. **Davranış** — öğrencinin ve anahtarın programı sanal donanımda ayrı ayrı
   koşturulur, olay dizileri hizalanır. *Farklı yazılmış ama aynı işi yapan
   kod tam puan alır.*
2. **Yapı** — döngü/fonksiyon/değişken/sınırla atlanmış mı, pinler doğru mu,
   tekrar sayısı tutuyor mu.
3. **Güvenlik** — güvenli açı dışına çıkan komut (taban/omuz/dirsek 30-150°,
   tutucu 40-140°), beklemesiz servo zinciri, beklemesiz sonsuz döngü.

Sensörlü görevler tek değerde ayırt edilemediği için üç senaryoda
(yakın/orta/uzak) ayrı ayrı çalıştırılır — eşik hataları böyle yakalanır.

### Test sonuçları

**Yanlış alarm testi: 71/71 cevap anahtarı kendi kendine 100 puan alıyor.**
(Bu test iki gerçek hata yakaladı ve düzeltildi: Blockly `controls_if`'in
else dalını `elseCount` ile serileştiriyor — Görev 10 hiç ses üretmiyordu;
ve rastgele blok içeren Görev 19 tohumlanmadığı için kendini tutturamıyordu.)

**Tipik öğrenci hataları** — her biri bir bloğa bağlanıyor:

| Hata | Puan | Teşhis | Blok |
|---|---|---|---|
| Beklemeleri koymadı | 78 | Hiç bekleme bloğu yok | ✓ |
| D4 yerine D5 yazdı | 3 | Yanlış servo pini — D5 yazılmış, D4 olmalı | ✓ |
| Son adımı unuttu | 71 | 1 adım eksik — işaretli bloğun ardına ekle | ✓ |
| Açıyı 175 yaptı | 49 | Güvenli açı aralığı dışında (30-150°) | ✓ |
| Döngü yerine kopyaladı | 78 | Tekrar bloğu kullanılmamış | ✓ |
| Tekrar sayısını 3 yazdı | 45 | Tekrar sayısı farklı | ✓ |
| Tutucu kapanmıyor | 86 | 1 adım eksik | ✓ |
| Buzzer koymadı | 76 | 3 adım eksik | ✓ |
| Eşiği 25 yazdı | 48 | Sensör eşiği yanlış — "orta" durumda bozuluyor | ✓ |
| RGB pinini karıştırdı | 89 | Yanlış renk yanıyor: yeşil yerine mavi | ✓ |

---

## LMS tarafı

Bu paket sadece RoboExx. Cevap anahtarları LMS'ten çıkarılıp buraya kondu —
öğretmenin ayrıca bir şey yapmasına gerek yok, kontrol öğrencinin ekranında
çalışıyor.

LMS'e "öğretmen onaydan önce görsün" özelliğini de bağlamak isterseniz aynı
`checker.ts` sunucusuz çalışıyor; söyleyin, onay kuyruğuna takayım.
