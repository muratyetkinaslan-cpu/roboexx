/**
 * Intel HEX ayrıştırıcı — arduino-cli'nin ürettiği .hex dosyasını
 * düz bayt dizisine çevirir (flash'a yazmak için).
 */

export interface ParsedHex {
  /** Program verisi (0 adresinden itibaren, boşluklar 0xFF ile dolu) */
  data: Uint8Array;
  /** Başlangıç adresi (genelde 0) */
  startAddress: number;
}

export function parseIntelHex(hexText: string): ParsedHex {
  const lines = hexText.split(/\r?\n/);
  let extendedBase = 0;
  let minAddr = Infinity;
  let maxAddr = 0;
  const chunks: Array<{ addr: number; bytes: number[] }> = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line[0] !== ':') continue;

    const bytes: number[] = [];
    for (let i = 1; i < line.length; i += 2) {
      bytes.push(parseInt(line.substr(i, 2), 16));
    }
    if (bytes.length < 5) continue;

    const len = bytes[0];
    const addr = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const dataBytes = bytes.slice(4, 4 + len);

    // checksum doğrula
    const checksum = bytes[4 + len];
    let sum = 0;
    for (let i = 0; i < 4 + len; i++) sum += bytes[i];
    sum = (-sum) & 0xff;
    if (sum !== checksum) {
      throw new Error(`Intel HEX checksum hatası: ${line.slice(0, 16)}…`);
    }

    if (type === 0x00) {
      // veri kaydı
      const fullAddr = extendedBase + addr;
      chunks.push({ addr: fullAddr, bytes: dataBytes });
      if (fullAddr < minAddr) minAddr = fullAddr;
      if (fullAddr + dataBytes.length > maxAddr) maxAddr = fullAddr + dataBytes.length;
    } else if (type === 0x01) {
      // dosya sonu
      break;
    } else if (type === 0x02) {
      // genişletilmiş segment adresi
      extendedBase = ((dataBytes[0] << 8) | dataBytes[1]) << 4;
    } else if (type === 0x04) {
      // genişletilmiş lineer adres
      extendedBase = ((dataBytes[0] << 8) | dataBytes[1]) << 16;
    }
    // type 0x03 / 0x05 (start address) yoksayılır
  }

  if (chunks.length === 0) {
    throw new Error('HEX dosyasında veri yok');
  }

  const start = 0; // AVR flash 0'dan başlar
  const size = maxAddr - start;
  const data = new Uint8Array(size).fill(0xff);
  for (const c of chunks) {
    const off = c.addr - start;
    for (let i = 0; i < c.bytes.length; i++) {
      data[off + i] = c.bytes[i];
    }
  }

  return { data, startAddress: start };
}
