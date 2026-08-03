/**
 * BerryBot yardımcıları — RoboExx web tarafı.
 *
 * v4 protokolünde köprü (ble-bridge.ts) zaten BerryBot'un UART-BLE
 * modülüyle güvenilir konuşur (ACK + checksum + REBOOTING el sıkışması).
 * Burada yalnızca üst seviye yardımcılar kalır.
 */

import { BLEBridge } from './ble-bridge';

const SENSOR_BATTERY = 0x05; // firmware sensör tipi: pil yüzdesi

/**
 * Pil yüzdesini ister (0-100). Ölçüm donanımı yoksa veya yanıt gelmezse null.
 * Bootloader v4'te sorgu, kullanıcı kodu ÇALIŞIRKEN bile yanıtlanır (gözcü).
 */
export async function requestBattery(
  bridge: BLEBridge,
  timeoutMs = 1500
): Promise<number | null> {
  if (bridge.state !== 'connected') return null;
  return new Promise<number | null>((resolve) => {
    const prev = bridge.onSensorReply;
    const timer = setTimeout(() => {
      bridge.onSensorReply = prev;
      resolve(null);
    }, timeoutMs);
    bridge.onSensorReply = (payload) => {
      clearTimeout(timer);
      bridge.onSensorReply = prev;
      if (payload.length >= 2) {
        const v = payload[0] | (payload[1] << 8);
        resolve(v <= 100 ? v : null); // 0xFFFF vb. = ölçüm yok
      } else {
        resolve(null);
      }
    };
    bridge.requestSensors([[SENSOR_BATTERY, 0, 0]]);
  });
}
