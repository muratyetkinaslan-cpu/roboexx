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

const server = http.createServer((req, res) => {
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
