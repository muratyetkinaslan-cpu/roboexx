/**
 * RoboExx — Arduino derleme sunucusu (tek dosya, bağımsız)
 * ========================================================
 *
 * Tarayıcı C++ derleyemez. Bu küçük servis, frontend'den gelen .ino kaynağını
 * `arduino-cli` ile derler ve Intel HEX döndürür. Frontend HEX'i WebSerial
 * (STK500v1) ile karta flash'lar.
 *
 * Bu dosya, mevcut işbirliği (Yjs) sunucusundan AYRIDIR. İstersen ayrı bir
 * Render/Railway servisi olarak çalıştır.
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
 * Çalıştırma:
 *   npm install express cors
 *   node server/arduino-compile.js
 *   (PORT ortam değişkeni ile port seçilebilir, varsayılan 8080)
 *
 * Kurulum ayrıntıları için aynı klasördeki ARDUINO_COMPILE_SERVER.md dosyasına bak.
 */

const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const { mkdtemp, writeFile, readFile, rm } = require('fs/promises');
const { tmpdir } = require('os');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ARDUINO_CLI = process.env.ARDUINO_CLI || 'arduino-cli';
// Güvenlik: yalnız izin verilen FQBN'ler derlenebilir.
const ALLOWED_FQBN = new Set([
  'arduino:avr:uno',
  'arduino:avr:nano:cpu=atmega328',
  'arduino:avr:nano:cpu=atmega328old',
  'arduino:avr:mega',
  'arduino:avr:nano',
]);

const app = express();
app.use(cors()); // İstersen { origin: 'https://senin-sitende.vercel.app' } ile kısıtla
app.use(express.json({ limit: '1mb' }));

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 16, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

app.get('/health', async (_req, res) => {
  try {
    const { stdout } = await run(ARDUINO_CLI, ['core', 'list', '--format', 'json']);
    let cores = [];
    try { cores = JSON.parse(stdout); } catch { /* yoksay */ }
    res.json({ ok: true, cores });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'arduino-cli bulunamadı: ' + e.message });
  }
});

app.post('/compile', async (req, res) => {
  const { fqbn, source } = req.body || {};
  if (!fqbn || typeof fqbn !== 'string') {
    return res.status(400).json({ error: 'fqbn gerekli' });
  }
  if (!ALLOWED_FQBN.has(fqbn)) {
    return res.status(400).json({ error: 'İzin verilmeyen kart (fqbn): ' + fqbn });
  }
  if (!source || typeof source !== 'string') {
    return res.status(400).json({ error: 'source (kaynak kod) gerekli' });
  }
  if (source.length > 200_000) {
    return res.status(400).json({ error: 'Kaynak çok büyük' });
  }

  let dir;
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'roboexx-ino-'));
    // arduino-cli, .ino dosyasının kendi adıyla aynı klasörde olmasını ister.
    const sketchName = 'sketch';
    const sketchDir = path.join(dir, sketchName);
    await run('mkdir', ['-p', sketchDir]).catch(() => {});
    const inoPath = path.join(sketchDir, `${sketchName}.ino`);
    await writeFile(inoPath, source, 'utf8');

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
      // Derleme hatası — derleyici çıktısını döndür
      const detail = (e.stderr || e.stdout || e.message || '').toString();
      return res.status(422).json({ error: 'Derleme hatası:\n' + detail });
    }

    // Çıktı HEX dosyasını bul (sketch.ino.hex)
    const hexPath = path.join(buildDir, `${sketchName}.ino.hex`);
    let hex;
    try {
      hex = await readFile(hexPath, 'utf8');
    } catch {
      return res.status(500).json({ error: 'HEX üretilemedi (derleme çıktısı bulunamadı)' });
    }

    return res.json({ hex, stderr });
  } catch (e) {
    return res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`RoboExx Arduino derleme sunucusu :${PORT} üzerinde çalışıyor`);
  console.log(`  POST /compile  GET /health`);
});
