/**
 * Firmware (UF2) yükleme — Pico kart tipleri ve sunucu API'si.
 *
 * Akış:
 *  1. Server'dan /firmware/list → mevcut kartların en son sürümlerini al
 *  2. Kullanıcı kart seçer → BOOTSEL'i tutarak USB'ye takar
 *  3. RPI-RP2 (veya RP2350) sürücüsü görünür
 *  4. Kullanıcı File System Access API ile bu sürücüyü seçer
 *  5. /firmware/download/:board → UF2 binary indir
 *  6. UF2'yi sürücüye yaz → Pico otomatik resetlenir
 */

export type BoardId = 'RPI_PICO' | 'RPI_PICO_W' | 'RPI_PICO2' | 'RPI_PICO2_W';

export interface BoardOption {
  id: BoardId;
  name: string;              // "Raspberry Pi Pico W"
  shortName: string;         // "Pico W"
  hasWifi: boolean;
  chip: 'RP2040' | 'RP2350';
  volumeName: string;        // BOOTSEL modunda görünen sürücü adı
  description: string;
}

export const BOARDS: BoardOption[] = [
  {
    id: 'RPI_PICO',
    name: 'Raspberry Pi Pico',
    shortName: 'Pico',
    hasWifi: false,
    chip: 'RP2040',
    volumeName: 'RPI-RP2',
    description: 'Klasik Pico — kablosuz bağlantı yok',
  },
  {
    id: 'RPI_PICO_W',
    name: 'Raspberry Pi Pico W',
    shortName: 'Pico W',
    hasWifi: true,
    chip: 'RP2040',
    volumeName: 'RPI-RP2',
    description: 'WiFi + Bluetooth (LE) destekli — RoboExx için önerilen',
  },
  {
    id: 'RPI_PICO2',
    name: 'Raspberry Pi Pico 2',
    shortName: 'Pico 2',
    hasWifi: false,
    chip: 'RP2350',
    volumeName: 'RP2350',
    description: 'Yeni nesil çip, daha hızlı — kablosuz yok',
  },
  {
    id: 'RPI_PICO2_W',
    name: 'Raspberry Pi Pico 2 W',
    shortName: 'Pico 2 W',
    hasWifi: true,
    chip: 'RP2350',
    volumeName: 'RP2350',
    description: 'Yeni nesil + WiFi/Bluetooth',
  },
];

export interface FirmwareInfo {
  url: string;
  version: string;
  date: string;
  filename: string;
  name: string;
  error: string | null;
}

export interface FirmwareList {
  [boardId: string]: FirmwareInfo;
}

/** Server URL — VITE_COLLAB_URL'den HTTPS karşılığını çıkar */
function getServerBaseUrl(): string {
  // Önce env'den
  const envUrl = import.meta.env.VITE_COLLAB_URL;
  if (envUrl) {
    // wss://host → https://host
    return envUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  }
  // Localhost fallback
  if (typeof window === 'undefined') return 'http://localhost:1234';
  const host = window.location.hostname || 'localhost';
  return `http://${host}:1234`;
}

/** Mevcut kartların en son sürümlerini al */
export async function fetchFirmwareList(): Promise<FirmwareList> {
  const url = getServerBaseUrl() + '/firmware/list';
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Liste alınamadı (${res.status})`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.boards;
}

/** UF2'yi indir — progress callback ile */
export async function downloadFirmware(
  boardId: BoardId,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ buffer: ArrayBuffer; filename: string; version: string }> {
  const url = getServerBaseUrl() + '/firmware/download/' + boardId;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`İndirme başarısız (${res.status})`);
  }
  const filename = (res.headers.get('Content-Disposition') || '')
    .match(/filename="([^"]+)"/)?.[1] || 'firmware.uf2';
  const version = res.headers.get('X-Firmware-Version') || '';
  const total = parseInt(res.headers.get('Content-Length') || '0', 10);

  if (!res.body || !onProgress) {
    // progress yok — direkt al
    return { buffer: await res.arrayBuffer(), filename, version };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  // Birleştir
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return { buffer: merged.buffer, filename, version };
}

/** File System Access API destekliyor mu? */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Kullanıcıdan RPI-RP2 sürücüsünü seçmesini iste, UF2'yi yaz.
 * Pico otomatik reset olur, dirHandle invalid hâle gelir — normal davranış.
 */
export async function writeFirmwareToDrive(
  buffer: ArrayBuffer,
  filename: string = 'firmware.uf2',
): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Tarayıcı File System Access API desteklemiyor. Chrome/Edge gerekli.');
  }
  // @ts-expect-error — TS henüz bu API'yi tam tanımlamıyor
  const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(buffer);
  await writable.close();
}
