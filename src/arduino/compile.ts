/**
 * Arduino derleme istemcisi.
 *
 * Tarayıcıda C++ derleyemeyiz; .ino kaynağı bir derleme sunucusuna gönderilir
 * (arduino-cli çalıştıran küçük bir Node servisi — bkz. server/arduino-compile.js)
 * ve karşılığında Intel HEX alınır. HEX, STK500 ile karta flash'lanır.
 *
 * Derleme sunucusu URL'i:
 *   1. localStorage 'roboexx.arduino-compile-url'  (kullanıcı ayarı)
 *   2. import.meta.env.VITE_ARDUINO_COMPILE_URL     (deploy ayarı)
 * İkisi de yoksa kullanıcıya "URL ayarla veya .ino indir" seçeneği sunulur.
 */

const LS_KEY = 'roboexx.arduino-compile-url';
const SS_DISCOVERED_KEY = 'roboexx.arduino-compile-url.discovered';

/**
 * Öğretmen için kolaylık: siteyi `?derleme=https://sunucu` (veya `?compile=`)
 * ile açmak URL'i kalıcı kaydeder. Sınıfa tek link paylaşmak yeterli olur.
 */
function readUrlFromQuery(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const u = q.get('derleme') || q.get('compile');
    if (u && u.trim()) {
      const clean = u.trim();
      localStorage.setItem(LS_KEY, clean);
      return clean;
    }
  } catch {
    /* yoksay */
  }
  return null;
}

export function getCompileUrl(): string | null {
  const fromQuery = readUrlFromQuery();
  if (fromQuery) return fromQuery;
  try {
    const fromLs = localStorage.getItem(LS_KEY);
    if (fromLs && fromLs.trim()) return fromLs.trim();
  } catch {
    /* yoksay */
  }
  const fromEnv = (import.meta as any).env?.VITE_ARDUINO_COMPILE_URL;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  // Daha önce otomatik keşfedilmiş bir adres varsa kullan
  try {
    const disc = sessionStorage.getItem(SS_DISCOVERED_KEY);
    if (disc && disc.trim()) return disc.trim();
  } catch {
    /* yoksay */
  }
  return null;
}

/** Bir adayın gerçekten derleme sunucusu olup olmadığını hızlıca kontrol et. */
async function probeHealth(base: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(base.replace(/\/+$/, '') + '/health', {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const j = await res.json().catch(() => null);
    return !!j?.ok;
  } catch {
    return false;
  }
}

/**
 * Ayarlı URL yoksa bilinen adaylarda derleme sunucusu arar:
 *   1. Sitenin kendi origin'i (ters proxy arkasında birlikte deploy edilmişse)
 *   2. localhost:8080 (öğretmen makinesinde / yerel kurulumda)
 * Bulursa sessionStorage'a yazar ve döndürür.
 */
export async function discoverCompileUrl(): Promise<string | null> {
  const existing = getCompileUrl();
  if (existing) {
    // Ayarlı ama ölü olabilir — yine de döndür, hata mesajı derlemede çıkar.
    return existing;
  }
  const candidates: string[] = [];
  try {
    candidates.push(window.location.origin);
  } catch {
    /* yoksay */
  }
  candidates.push('http://localhost:8080', 'http://127.0.0.1:8080');

  for (const base of candidates) {
    if (await probeHealth(base)) {
      try {
        sessionStorage.setItem(SS_DISCOVERED_KEY, base);
      } catch {
        /* yoksay */
      }
      return base;
    }
  }
  return null;
}

export function setCompileUrl(url: string): void {
  try {
    localStorage.setItem(LS_KEY, url.trim());
  } catch {
    /* yoksay */
  }
}

export interface CompileResult {
  hex: string;
  /** Derleyici stderr/uyarıları (varsa) */
  stderr?: string;
}

/**
 * Derleme + otomatik uyandırma:
 * Render'ın ücretsiz planı 15 dk boşta kalınca uyur; ilk istek 502/timeout
 * alabilir. Bu sarmalayıcı, ağ hatası veya 5xx durumunda /health'i yoklayarak
 * sunucu uyanana kadar (en çok ~90 sn) bekler ve derlemeyi otomatik yineler.
 * Öğrenci hata görmez, sadece "sunucu uyanıyor…" mesajı görür.
 */
export async function compileArduinoWithWake(
  source: string,
  fqbn: string,
  onStatus?: (msg: string) => void
): Promise<CompileResult> {
  try {
    return await compileArduino(source, fqbn);
  } catch (e) {
    const msg = (e as Error).message || '';
    const isDown =
      msg !== 'NO_COMPILE_URL' &&
      (msg.includes('ulaşılamadı') || /HTTP 50[234]/.test(msg));
    if (!isDown) throw e;

    const base = getCompileUrl();
    if (!base) throw e;

    onStatus?.('Derleme sunucusu uyandırılıyor… (ücretsiz sunucu uykudan kalkıyor, ~30 sn)');
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await probeHealth(base, 5000)) {
        onStatus?.('Sunucu uyandı, derleniyor…');
        return await compileArduino(source, fqbn);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(
      'Derleme sunucusu 90 saniyede uyanmadı. Sunucu panelinden çalıştığını kontrol et: ' + base
    );
  }
}

/**
 * .ino kaynağını derleme sunucusuna gönderir, Intel HEX döndürür.
 * Sunucu sözleşmesi:
 *   POST {url}/compile
 *   body: { fqbn: string, source: string }
 *   200: { hex: string, stderr?: string }
 *   4xx/5xx: { error: string }
 */
// ---- HEX önbelleği (aynı blokları tekrar yüklerken derleme bekletme) ----

const HEX_CACHE_KEY = 'roboexx.arduino-hex-cache';
const HEX_CACHE_MAX = 4;

async function hashSource(fqbn: string, source: string): Promise<string> {
  const data = new TextEncoder().encode(fqbn + '\u0000' + source);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type HexCache = Array<{ key: string; hex: string; t: number }>;

function readHexCache(): HexCache {
  try {
    const raw = localStorage.getItem(HEX_CACHE_KEY);
    if (raw) return JSON.parse(raw) as HexCache;
  } catch {
    /* yoksay */
  }
  return [];
}

function writeHexCache(cache: HexCache): void {
  try {
    localStorage.setItem(HEX_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* kota dolarsa sessizce vazgeç */
  }
}

export async function compileArduino(
  source: string,
  fqbn: string
): Promise<CompileResult> {
  // Önbellekte var mı?
  let cacheKey: string | null = null;
  try {
    cacheKey = await hashSource(fqbn, source);
    const hit = readHexCache().find((e) => e.key === cacheKey);
    if (hit) return { hex: hit.hex };
  } catch {
    /* crypto yoksa önbelleksiz devam */
  }

  const base = getCompileUrl();
  if (!base) {
    throw new Error('NO_COMPILE_URL');
  }
  const url = base.replace(/\/+$/, '') + '/compile';

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fqbn, source }),
    });
  } catch (e) {
    throw new Error(
      `Derleme sunucusuna ulaşılamadı (${url}). Sunucu açık mı ve HTTPS/CORS ayarları doğru mu? ${
        (e as Error).message
      }`
    );
  }

  if (!res.ok) {
    let msg = `Derleme hatası (HTTP ${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* yoksay */
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data?.hex) {
    throw new Error('Sunucu HEX döndürmedi');
  }

  // Önbelleğe yaz (LRU: en yeni başa, fazlası atılır)
  if (cacheKey) {
    const cache = readHexCache().filter((e) => e.key !== cacheKey);
    cache.unshift({ key: cacheKey, hex: data.hex, t: Date.now() });
    writeHexCache(cache.slice(0, HEX_CACHE_MAX));
  }

  return { hex: data.hex, stderr: data.stderr };
}

/** .ino dosyasını tarayıcıdan indirir (sunucu olmadan da kullanılabilir). */
export function downloadIno(source: string, name = 'roboexx_sketch'): void {
  const blob = new Blob([source], { type: 'text/x-arduino' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.ino`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
