# RoboExx — Kodlu / Kodsuz Simülasyon + Görev Kontrolü

Değişiklikler uygulanmış **tam RoboExx projesi**. Eski klasörün yerine koyun.

```bash
npm install
npm run dev
```

Yeni paket eklenmedi, `package.json` değişmedi.
`npx tsc --noEmit` ve `npx vite build` çalıştırıldı — build başarılı,
TS hata sayısı değişiklikten önceki halle birebir aynı (23, hepsi Blockly 11'in
kendi tip uyumsuzlukları).

---

## Bu turda istediğiniz 6 şey

### 1. Kodlu kısım sadeleştirildi

Sağ yarıda artık **sadece simülasyon** var. Görev metni, Çalıştır düğmesi ve
hata raporu oradan kaldırıldı. Sağ taraf: 3D kol + hata satırı + seri günlük.
Başka hiçbir şey yok.

### 2. Hatalar blok tarafında gösteriliyor

Görev seçici, ▶ Çalıştır ve hata raporu artık **blokların üstünde**
(`ArmTaskBar`). Çocuk hatayı okurken gözünü bloklardan ayırmıyor,
"şu bloğu düzelt" denince bloğa uzanabiliyor.

Hatalı bloklar ayrıca kırmızı (hata) / sarı (uyarı) çerçeveleniyor,
üstlerinde Blockly uyarı balonu çıkıyor, ekran ilk hataya kayıyor.

### 3. Kodsuz simülasyon: sadece kol ve parçalar

Kalibrasyon, pin eşlemesi, nokta tekrarı, küp yerleşimi, Tıkla-Git,
gripper ayarı, Arduino yükleyici — **hepsi kaldırıldı**. Kalan:

- **Robot kol** — dört eklem kaydırıcısı, her birinde pin numarası,
  ne işe yaradığı ve güvenli aralık yazıyor
- **RGB LED** — 6 hazır renk düğmesi + üç bacağı tek tek aç/kapat
- **Buzzer** — Do–Si nota düğmeleri, gerçekten ses çıkarıyor
- **Röle** — aç/kapat

Çocuk parçaları eliyle tanıyor, sonra kodlu moda geçince "servo pin D5"
bloğunun neyi oynattığını zaten biliyor.

### 4. Çocuk diline çevrildi + kademeli ipucu

Bir seferde **tek sorun** gösteriliyor — en önemlisi. Diğerleri katlı duruyor.
Yardım üç kademeli, çocuk istedikçe açılıyor:

| Kademe | Ne verir |
|---|---|
| 💡 **İpucu** | Düşündüren soru, cevabı vermez |
| 🔎 **Ne yapmalıyım** | Somut adım |
| ✅ **Cevabı göster** | Hangi blok, hangi sayı |

Gerçek örnek — bekleme bloğunu unutan çocuk:

> **📛 Bekleme bloğu koymayı unutmuşsun**
> Robot kol bir yere gitmek için zamana ihtiyaç duyar. Sen ona "şuraya git"
> deyip hemen ardından "hayır, şuraya git" diyorsun. Kol yola çıkıyor ama
> varamadan yeni emir geliyor — sonuçta ara duraklara hiç uğramıyor.
>
> 💡 *Sen de yürürken "sağa git" desem, adım atmadan hemen "sola git" desem
> ne olurdu? Kola adım atacak zaman nasıl verirsin?*
>
> 🔎 *Her servo bloğunun altına bir "bekle" bloğu koy. Bu görevde 2 tane
> gerekiyor.*
>
> ✅ *⏱ Zaman kategorisinden "bekle" bloğunu al. Her servo bloğunun ALTINA
> bir tane koy ve içine 1000 yaz (milisaniye).*

Başlıklar da değişti: "Servo güvenli açı aralığının dışında" yerine
**"Bu açı kolu kırabilir"**; "Yanlış servo pini" yerine
**"Yanlış parçayı oynatıyorsun"**.

### 5. Eğitmen kütüphanesi normal servo bloklarına çevrildi

`src/library/roboarm-tasks.ts` içindeki 20 görev `rx_arm_*` bloklarını
kullanıyordu. Hepsi **normal servo bloklarıyla** yeniden yazıldı:

```
servo pin D4 açı 30
bekle 1000 ms
servo pin D5 açı 120
...
```

Artık çocuğun kütüphaneden açtığı örnek ile kendi yazacağı kod aynı
bloklardan oluşuyor. **20/20 görev test edildi, hepsi çalışıyor.**

### 6. Blok kutusu hedefe göre filtreleniyor

| Seçim | Görünen kit kategorileri |
|---|---|
| MicroPython | *(hiçbiri)* |
| Arduino | *(hiçbiri)* |
| 🪖 RoboPANZER | yalnız RoboPANZER |
| 🤖 RoboCYTRON | yalnız RoboCYTRON |

Genel kategoriler (Servo, Buzzer, RGB, Mesafe…) her hedefte duruyor.
Hedef değişince kutu anında yenileniyor.

---

## Ayrıca: servo davranışı düzeltildi

Önemli bir doğruluk hatası buldum. Gerçek kartta `servo.write()` **anında
döner**, servo kendi hızıyla yol alır. Yani:

```
servo(D4, 30); servo(D5, 60); servo(D6, 90); bekle(1000);
```

üç eklemi **aynı anda** hareket ettirir. Simülasyon bunları sırayla
oynatıyordu. Düzeltildi: komut sadece hedefi yazıyor, hareket bekleme
blokları sırasında oluyor. Beklemesiz kod hâlâ hedefe varamıyor —
çocuk sorunu kartsız görüyor.

---

## Test sonuçları

```
TOOLBOX FİLTRESİ
 micropython  RoboPANZER:yok  RoboCYTRON:yok  genel Servo:var
 arduino      RoboPANZER:yok  RoboCYTRON:yok  genel Servo:var
 berrybot     RoboPANZER:VAR  RoboCYTRON:yok  genel Servo:var
 robocytron   RoboPANZER:yok  RoboCYTRON:VAR  genel Servo:var

EĞİTMEN KÜTÜPHANESİ   20/20 görev çalıştı, hepsi normal servo bloklarıyla
MÜFREDAT              71/71 görev simülasyonda çalıştı
YANLIŞ ALARM          71/71 cevap anahtarı kendini 100 aldı
BLOK İŞARETLEME       test edilen 10 öğrenci hatasının hepsi doğru bloğa bağlandı
```

---

## Değişen ve eklenen dosyalar

```
YENİ  public/cevap_anahtari/roboarm-gorevler.json   71 görev + cevap anahtarı
YENİ  src/robotarm/vm.ts                            blok yorumlayıcı
YENİ  src/robotarm/checker.ts                       görev kontrolü + kademeli ipucu
YENİ  src/robotarm/tasks.ts                         görev yükleyici
YENİ  src/robotarm/hw-bench.ts                      sanal donanım
YENİ  src/robotarm/block-marks.ts                   blok üstü hata işaretleme
YENİ  src/components/ArmTaskBar.tsx                 görev + hata paneli (blok tarafı)
YENİ  src/components/ManualBench.tsx                kodsuz tezgâh

DEĞİŞTİ  src/components/RobotArmPanel.tsx           kodlu/kodsuz mod
DEĞİŞTİ  src/components/BlocklyWorkspace.tsx        hedefe göre toolbox
DEĞİŞTİ  src/blockly/toolbox.ts                     toolboxForTarget()
DEĞİŞTİ  src/library/roboarm-tasks.ts               normal servo bloklarına çevrildi
DEĞİŞTİ  src/App.tsx                                mod + görev durumu
DEĞİŞTİ  src/styles.css                             yeni stiller sona eklendi
```

Başka hiçbir dosyaya dokunulmadı.
