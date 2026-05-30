import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Vite config — HTTPS ZORUNLU.
 *
 * Web Serial API "secure context" gerektirir. localhost zaten secure'dır
 * ama LAN IP'leri (192.168.x.x gibi) HTTPS olmadan secure değildir.
 * Birden fazla cihazdan erişim için (öğretmen+öğrenci aynı ağdayken)
 * HTTPS zorunlu.
 *
 * `@vitejs/plugin-basic-ssl` self-signed sertifika üretir. İlk açılışta
 * Chrome "Güvensiz" der → "İleri" → "Yine de devam" → kabul edersiniz.
 * Sonraki açılışlarda hatırlar.
 */
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5173,
    host: true,  // tüm network interface'lerinde dinle (LAN IP üzerinden erişim için)
    https: true, // self-signed cert ile HTTPS
    open: true,
    // Collab sunucusunu (ws://127.0.0.1:1234) WSS olarak Vite üstünden proxy'le.
    // 127.0.0.1 zorunlu — Node 20'de "localhost" IPv6 (::1) olarak çözülür ve
    // collab server IPv4 dinlediği için ECONNREFUSED hatası alırız.
    proxy: {
      '/collab': {
        target: 'ws://127.0.0.1:1234',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/collab/, ''),
      },
    },
  },
});
