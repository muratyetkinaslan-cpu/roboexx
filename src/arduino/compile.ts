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

export function getCompileUrl(): string | null {
  try {
    const fromLs = localStorage.getItem(LS_KEY);
    if (fromLs && fromLs.trim()) return fromLs.trim();
  } catch {
    /* yoksay */
  }
  const fromEnv = (import.meta as any).env?.VITE_ARDUINO_COMPILE_URL;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
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
 * .ino kaynağını derleme sunucusuna gönderir, Intel HEX döndürür.
 * Sunucu sözleşmesi:
 *   POST {url}/compile
 *   body: { fqbn: string, source: string }
 *   200: { hex: string, stderr?: string }
 *   4xx/5xx: { error: string }
 */
export async function compileArduino(
  source: string,
  fqbn: string
): Promise<CompileResult> {
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
