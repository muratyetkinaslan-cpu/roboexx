/**
 * RoboExx Canlı Paylaşım — bağımsız Yjs WebSocket server
 *
 * y-websocket paketinin bundled server'ı bazı versiyonlarda mevcut değil
 * (bin/server.cjs yok, exports field utils.cjs'i bloke ediyor).
 * Bu yüzden minimum Yjs sync protocol'ünü kendimiz implement ediyoruz.
 *
 * Kullanılan paketler (hepsi yjs ekosistemi):
 *   - ws         : WebSocket server
 *   - yjs        : CRDT doc
 *   - y-protocols: sync + awareness wire protocol
 *   - lib0       : encoding/decoding utility
 *
 * Bu paketler y-websocket'in transitive dependency'leri, npm install ile
 * yüklenmiş olmalı. Eğer hata alırsanız: npm install
 *
 * Çevre değişkenleri:
 *   HOST — bind adresi (varsayılan 0.0.0.0, LAN için)
 *   PORT — port (varsayılan 1234)
 */

import http from 'node:http';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '1234', 10);

// Yjs wire protocol mesaj tipleri
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const WS_OPEN = 1;

/**
 * Bir oda — paylaşılan Y.Doc + awareness + bağlı client'lar.
 */
class Room {
  constructor(name) {
    this.name = name;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    // Server'ın kendi awareness state'i yok (sadece relay)
    this.awareness.setLocalState(null);
    // conn -> her conn'un sahip olduğu clientID'ler
    // (bağlantı kopunca o conn'a ait awareness state'leri temizlemek için)
    this.conns = new Map();

    // Doc update'leri tüm client'lara broadcast et
    this.doc.on('update', (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const msg = encoding.toUint8Array(encoder);
      this.broadcast(msg, origin);
    });

    // Awareness update'leri tüm client'lara broadcast et
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed);

      // origin bu conn'sa, o conn yeni clientID'ler ekledi/sildi — track et
      if (origin && this.conns.has(origin)) {
        const owned = this.conns.get(origin);
        added.forEach((id) => owned.add(id));
        removed.forEach((id) => owned.delete(id));
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      );
      const msg = encoding.toUint8Array(encoder);
      this.broadcast(msg, origin);
    });
  }

  broadcast(msg, except) {
    this.conns.forEach((_owned, conn) => {
      if (conn === except) return;
      if (conn.readyState !== WS_OPEN) return;
      try {
        conn.send(msg);
      } catch (e) {
        // Bozulan bağlantıyı temizle
        this.removeConnection(conn);
      }
    });
  }

  addConnection(conn) {
    this.conns.set(conn, new Set());

    // 1. Client'a sync-step-1 gönder (state vector iste)
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, this.doc);
    conn.send(encoding.toUint8Array(syncEncoder));

    // 2. Client'a mevcut awareness state'lerini gönder
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const awEncoder = encoding.createEncoder();
      encoding.writeVarUint(awEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(states.keys())
        )
      );
      conn.send(encoding.toUint8Array(awEncoder));
    }
  }

  removeConnection(conn) {
    const owned = this.conns.get(conn);
    this.conns.delete(conn);
    if (owned && owned.size > 0) {
      // Bu conn'a ait awareness state'leri temizle → diğer client'lara bildir
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        Array.from(owned),
        null
      );
    }
  }

  handleMessage(conn, data) {
    try {
      const message = new Uint8Array(data);
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        // origin olarak conn'u geçer — kendi conn'una echo etmesin
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
        // Cevap encoding'i 1 byte'tan büyükse (sadece type byte değil) gönder
        if (encoding.length(encoder) > 1) {
          conn.send(encoding.toUint8Array(encoder));
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          conn // origin
        );
      }
    } catch (err) {
      console.error('Mesaj hatası (oda: ' + this.name + '):', err.message);
    }
  }
}

const rooms = new Map();

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, new Room(name));
  return rooms.get(name);
}

// ─── HTTP + WebSocket server ───

/**
 * MicroPython UF2 firmware proxy.
 *
 * micropython.org CORS izin vermiyor — tarayıcı doğrudan fetch yapamıyor.
 * Bu yüzden sunucumuz proxy görevi görüyor:
 *   GET /firmware/list           → mevcut kartlar + en son sürüm bilgisi (JSON)
 *   GET /firmware/download/:board → UF2 binary (CORS header'lı)
 *
 * Liste 1 saat in-memory cache'lenir (her istek micropython.org'a gitmesin).
 */

const BOARD_IDS = ['RPI_PICO', 'RPI_PICO_W', 'RPI_PICO2', 'RPI_PICO2_W'];
const BOARD_NAMES = {
  RPI_PICO: 'Raspberry Pi Pico',
  RPI_PICO_W: 'Raspberry Pi Pico W',
  RPI_PICO2: 'Raspberry Pi Pico 2',
  RPI_PICO2_W: 'Raspberry Pi Pico 2 W',
};

let firmwareCache = { boards: null, fetchedAt: 0 };
const FIRMWARE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

/**
 * micropython.org/download/<BOARD>/ sayfasını çek, en son UF2 URL'ini parse et.
 * Returns: { url, version, date, size } veya null.
 */
async function fetchLatestFirmwareInfo(boardId) {
  const pageUrl = `https://micropython.org/download/${boardId}/`;
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'RoboExx-Firmware-Fetcher/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Sayfa alınamadı: ${pageUrl} (${res.status})`);
  }
  const html = await res.text();
  // İlk UF2 link'i = latest. URL kalıbı: RPI_PICO_W-YYYYMMDD-vX.Y.Z.uf2
  const regex = new RegExp(
    `https:\\/\\/micropython\\.org\\/resources\\/firmware\\/(${boardId}-(\\d{8})-(v[^"]+?))\\.uf2`,
    'i'
  );
  const match = html.match(regex);
  if (!match) {
    throw new Error(`UF2 link bulunamadı: ${boardId}`);
  }
  return {
    url: `https://micropython.org/resources/firmware/${match[1]}.uf2`,
    version: match[3],
    date: match[2],
    filename: `${match[1]}.uf2`,
  };
}

async function getFirmwareList(force = false) {
  const now = Date.now();
  if (!force && firmwareCache.boards && now - firmwareCache.fetchedAt < FIRMWARE_CACHE_TTL_MS) {
    return firmwareCache.boards;
  }
  const boards = {};
  for (const id of BOARD_IDS) {
    try {
      const info = await fetchLatestFirmwareInfo(id);
      boards[id] = { ...info, name: BOARD_NAMES[id], error: null };
    } catch (err) {
      console.error(`[firmware] ${id} parse hatası:`, err.message);
      boards[id] = { name: BOARD_NAMES[id], error: err.message };
    }
  }
  firmwareCache = { boards, fetchedAt: now };
  return boards;
}

const server = http.createServer(async (req, res) => {
  // CORS — her route için
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  // GET /firmware/list — JSON: hangi kartlar var, en son sürümler
  if (url.pathname === '/firmware/list') {
    try {
      const boards = await getFirmwareList();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ boards }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /firmware/download/:board — UF2 binary proxy
  const downloadMatch = url.pathname.match(/^\/firmware\/download\/([A-Z0-9_]+)$/i);
  if (downloadMatch) {
    const boardId = downloadMatch[1].toUpperCase();
    if (!BOARD_IDS.includes(boardId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Geçersiz kart: ' + boardId }));
      return;
    }
    try {
      const boards = await getFirmwareList();
      const info = boards[boardId];
      if (!info || info.error) {
        throw new Error(info?.error || 'Bilinmeyen hata');
      }
      console.log(`[firmware] proxy başladı: ${boardId} ← ${info.url}`);
      const upstream = await fetch(info.url, {
        headers: { 'User-Agent': 'RoboExx-Firmware-Fetcher/1.0' },
      });
      if (!upstream.ok) {
        throw new Error(`Upstream ${upstream.status}`);
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length,
        'Content-Disposition': `attachment; filename="${info.filename}"`,
        'X-Firmware-Version': info.version,
      });
      res.end(buf);
      console.log(`[firmware] proxy tamam: ${boardId} (${buf.length} bytes)`);
    } catch (err) {
      console.error(`[firmware] download hatası:`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Default — health check
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('RoboExx Live Share server is running.\n');
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (conn, req) => {
  // URL'den oda adını çıkar (ws://host:port/ROOMNAME)
  const url = new URL(req.url, 'http://localhost');
  const roomName = decodeURIComponent(url.pathname.slice(1)) || 'default';
  const room = getRoom(roomName);
  room.addConnection(conn);

  conn.binaryType = 'arraybuffer';
  conn.on('message', (data) => room.handleMessage(conn, data));
  conn.on('close', () => {
    room.removeConnection(conn);
    if (room.conns.size === 0) {
      rooms.delete(roomName);
    }
  });
  conn.on('error', (err) => {
    console.error('Conn error (oda: ' + roomName + '):', err.message);
  });
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// ─── Start ───

server.listen(PORT, HOST, () => {
  const ifs = os.networkInterfaces();
  const lanIps = [];
  Object.values(ifs).forEach((addrs) => {
    (addrs || []).forEach((a) => {
      if (a.family === 'IPv4' && !a.internal) lanIps.push(a.address);
    });
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RoboExx Live Share sunucusu hazır');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  WebSocket adresleri:');
  console.log('    Yerel  : ws://localhost:' + PORT);
  lanIps.forEach((ip) => {
    console.log('    LAN    : ws://' + ip + ':' + PORT);
  });
  if (lanIps.length > 0) {
    console.log('');
    console.log('  Tarayıcı (öğretmen/öğrenci):');
    lanIps.forEach((ip) => {
      console.log('    http://' + ip + ':5173');
    });
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Bekleniyor... (CTRL+C ile durdur)');
});

// Hata yakalama
process.on('uncaughtException', (err) => {
  console.error('Kritik hata:', err);
});
