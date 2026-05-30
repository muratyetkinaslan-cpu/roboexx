# Brand klasörü

Buraya kendi logo dosyalarını koy. Sonra `src/config/branding.ts` içinden seç.

## Logo dosyası önerileri

### Mod A — sadece ikon (turuncu kutu içinde)

**Önerilen format:** SVG (vektör, ölçeklenebilir, en net görünüm)

**Boyut:** 20-24 px arası içerik alanı. Konteyner 36×36 px ama içinde padding olduğu için
ikonun kendisi 20-24 px arasında olmalı (Material/Lucide ikon standartları gibi).

**PNG kullanırsan:** En az 72×72 px (retina ekranlarda net görünmesi için 2x-3x boyut).
Şeffaf arka plan olmalı (turuncu kutu zaten arkasında var).

**Örnek dosya:** `logo.svg` (24×24 viewBox)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <!-- senin logon -->
</svg>
```

### Mod B — wordmark (logo + RoboExx yazısı tek görselde)

**Önerilen boyut:** 160×40 px (4:1 oran). 200×50, 240×60 gibi katları da olur.

**Format:** SVG (en iyi) veya PNG (şeffaf arka plan, 320×80 minimum retina için).

**Örnek dosya:** `logo-wordmark.svg`

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" fill="none">
  <!-- ikon + yazı tek görsel -->
</svg>
```

## Kullanım

`src/config/branding.ts` aç ve `logo` satırını güncelle:

```ts
// Sadece ikon
logo: { mode: 'icon', src: '/brand/logo.svg', size: 22 },

// Veya wordmark
logo: { mode: 'wordmark', src: '/brand/logo-wordmark.png', width: 160, height: 40 },
```

Vite'in `public/` klasöründeki dosyalar `/` yoluyla servis edilir, bu yüzden `src` her zaman `/brand/...` ile başlar.
