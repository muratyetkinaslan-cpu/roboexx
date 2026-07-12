/**
 * RoboExx — Arduino derleme sunucusu (tek dosya, sıfır npm bağımlılığı)
 * =====================================================================
 *
 * Tarayıcı C++ derleyemez. Bu küçük servis, frontend'den gelen .ino kaynağını
 * `arduino-cli` ile derler ve Intel HEX döndürür. Frontend HEX'i WebSerial
 * (STK500v1) ile karta flash'lar.
 *
 * Sözleşme:
 *   POST /compile   body: { fqbn: string, source: string }
 *                   200:  { hex: string, stderr?: string }
 *                   4xx/5xx: { error: string }
 *   GET  /health    200:  { ok: true, cores: [...] }
 *
 * Gereksinimler:
 *   - Node 18+
 *   - arduino-cli kurulu ve PATH'te
 *   - AVR çekirdeği: arduino-cli core install arduino:avr
 *
 * Çalıştırma (npm install GEREKMEZ):
 *   node server/arduino-compile.js
 *   (PORT ortam değişkeni ile port seçilebilir, varsayılan 8080)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ARDUINO_CLI = process.env.ARDUINO_CLI || 'arduino-cli';
// İstersen kısıtla: ALLOWED_ORIGIN=https://senin-siten.vercel.app
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Güvenlik: yalnız izin verilen FQBN'ler derlenebilir.
const ALLOWED_FQBN = new Set([
  'arduino:avr:uno',
  'arduino:avr:nano:cpu=atmega328',
  'arduino:avr:nano:cpu=atmega328old',
  'arduino:avr:mega',
  'arduino:avr:nano',
]);

// ---- Basit HEX önbelleği (sınıfta 25 öğrenci aynı örneği yüklerken tek derleme) ----
const CACHE_MAX = 64;
const hexCache = new Map(); // hash -> { hex, stderr }
function cacheGet(key) {
  const v = hexCache.get(key);
  if (v) {
    // LRU: en sona taşı
    hexCache.delete(key);
    hexCache.set(key, v);
  }
  return v;
}
function cacheSet(key, val) {
  hexCache.set(key, val);
  if (hexCache.size > CACHE_MAX) {
    const oldest = hexCache.keys().next().value;
    hexCache.delete(oldest);
  }
}

// ---- Aynı anda tek derleme kuyruğu (zayıf sunucularda CPU patlamasın) ----
let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { maxBuffer: 1024 * 1024 * 16, timeout: 120_000, ...opts },
      (err, stdout, stderr) => {
        if (err) {
          err.stdout = stdout;
          err.stderr = stderr;
          return reject(err);
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleHealth(res) {
  try {
    const { stdout } = await run(ARDUINO_CLI, ['core', 'list', '--format', 'json']);
    let cores = [];
    try { cores = JSON.parse(stdout); } catch { /* yoksay */ }
    sendJson(res, 200, { ok: true, cores });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: 'arduino-cli bulunamadı: ' + e.message });
  }
}

async function handleCompile(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    const msg = e.message === 'BODY_TOO_LARGE' ? 'İstek çok büyük' : 'Geçersiz JSON';
    return sendJson(res, 400, { error: msg });
  }

  const { fqbn, source } = body || {};
  if (!fqbn || typeof fqbn !== 'string') {
    return sendJson(res, 400, { error: 'fqbn gerekli' });
  }
  if (!ALLOWED_FQBN.has(fqbn)) {
    return sendJson(res, 400, { error: 'İzin verilmeyen kart (fqbn): ' + fqbn });
  }
  if (!source || typeof source !== 'string') {
    return sendJson(res, 400, { error: 'source (kaynak kod) gerekli' });
  }
  if (source.length > 200_000) {
    return sendJson(res, 400, { error: 'Kaynak çok büyük' });
  }

  // Önbellek — aynı kod + kart daha önce derlenmişse anında döner
  const key = crypto.createHash('sha256').update(fqbn + '\u0000' + source).digest('hex');
  const cached = cacheGet(key);
  if (cached) {
    return sendJson(res, 200, cached);
  }

  try {
    const result = await enqueue(async () => {
      let dir;
      try {
        dir = await mkdtemp(path.join(tmpdir(), 'roboexx-ino-'));
        // arduino-cli, .ino dosyasının klasörle aynı adda olmasını ister.
        const sketchName = 'sketch';
        const sketchDir = path.join(dir, sketchName);
        await mkdir(sketchDir, { recursive: true });
        await writeFile(path.join(sketchDir, `${sketchName}.ino`), source, 'utf8');

        const buildDir = path.join(dir, 'build');
        let stderr = '';
        try {
          const out = await run(ARDUINO_CLI, [
            'compile',
            '--fqbn', fqbn,
            '--output-dir', buildDir,
            '--warnings', 'default',
            sketchDir,
          ]);
          stderr = out.stderr || '';
        } catch (e) {
          const detail = (e.stderr || e.stdout || e.message || '').toString();
          const err = new Error('Derleme hatası:\n' + detail);
          err.httpStatus = 422;
          throw err;
        }

        const hexPath = path.join(buildDir, `${sketchName}.ino.hex`);
        let hex;
        try {
          hex = await readFile(hexPath, 'utf8');
        } catch {
          const err = new Error('HEX üretilemedi (derleme çıktısı bulunamadı)');
          err.httpStatus = 500;
          throw err;
        }
        return { hex, stderr };
      } finally {
        if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    });

    cacheSet(key, result);
    return sendJson(res, 200, result);
  } catch (e) {
    return sendJson(res, e.httpStatus || 500, { error: e.message });
  }
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (req.method === 'GET' && (url === '/health' || url === '/')) {
    return void handleHealth(res);
  }
  if (req.method === 'POST' && url === '/compile') {
    return void handleCompile(req, res);
  }
  sendJson(res, 404, { error: 'Bulunamadı' });
});

server.listen(PORT, HOST, () => {
  console.log(`RoboExx Arduino derleme sunucusu http://${HOST}:${PORT} üzerinde çalışıyor`);
  console.log('  POST /compile   GET /health');
  console.log('  (npm install gerekmez — yalnız Node + arduino-cli yeterli)');
});
