/**
 * RoboExx marka konfigürasyonu.
 *
 * Logo özelleştirme:
 *   1. Logo dosyanı `public/brand/` klasörüne koy
 *   2. Aşağıdaki `logo` ayarını güncelle
 *   3. Sayfayı yenile
 */

export interface RgbHeadOptions {
  /** Logo'nun sol kısmının yüzde kaçı kafa? Default: 24 */
  widthPercent?: number;
  /** Tam bir RGB döngüsünün süresi (saniye). Default: 10 */
  speed?: number;
}

export interface BrandingConfig {
  logo:
    | { mode: 'icon'; src: string; srcLight?: string; size?: number; hideWordmark?: boolean }
    | {
        mode: 'wordmark';
        src: string;
        /** Açık tema için ayrı logo (yoksa src kullanılır) */
        srcLight?: string;
        width: number;
        height: number;
        /** Kafa kısmını RGB animasyonlu yap */
        rgbHead?: boolean | RgbHeadOptions;
      }
    | { mode: 'default' };
  productName: string;
  productSubtitle: string;
}

export const branding: BrandingConfig = {
  // ✅ AKTİF — Wordmark + RGB kafa
  logo: {
    mode: 'wordmark',
    src: '/brand/logo.svg',
    srcLight: '/brand/logo-light.svg',  // açık temada bu kullanılır (yoksa src)
    width: 210,
    height: 56,
    rgbHead: { widthPercent: 24, speed: 10 },
  },

  // ---- ALTERNATİFLER ----

  // RGB ve ateş yok, sade wordmark:
  // logo: { mode: 'wordmark', src: '/brand/logo.svg', width: 210, height: 56 },

  // Sadece kutu içinde ikon:
  // logo: { mode: 'icon', src: '/brand/logo.svg', size: 24, hideWordmark: true },

  productName: 'RoboExx',
  productSubtitle: 'Pico W',
};
