/**
 * BerryBot yardımcıları — RoboExx web tarafı (src/bluetooth/berrybot-bridge.ts)
 *
 * BerryBot, Pico W değildir: BLE, UART'a bağlı şeffaf bir modüldür ama
 * aynı Nordic UART UUID'lerini kullanır. Bu yüzden mevcut BLEBridge
 * HİÇ DEĞİŞMEDEN bağlanır ve kod yükler — firmware (main.py v2) aynı
 * MSG_* protokolünü UART üzerinden konuşur.
 *
 * Bu dosya üç ek özellik sağlar:
 *   1) prepareUpload()  — yüklemeden önce MSG_RESET gönderir; robot
 *      user_code çalıştırıyorsa bile temiz bootloader'a düşer,
 *      otomatik yeniden bağlanma sonrası yükleme %100 güvenli olur.
 *      (Zorunlu değil — firmware, kod çalışırken de yükleme alabilir.)
 *   2) requestBattery() — pil yüzdesini sorar (SENSOR_BATTERY = 0x05).
 *   3) frame()          — isteğe bağlı sağlamalı çerçeve sarmalayıcı
 *      (gürültülü BLE modüllerinde MSG_KEY / SENSOR_REQ için).
 */

import { BLEBridge } from './ble-bridge';

const MSG_RESET = 0x05;
const SENSOR_BATTERY = 0x05; // firmware'e eklenen RoboExx sensör tipi

/** Payload'ı [0xBB 0x66 len_lo len_hi payload xor] çerçevesine sarar. */
export function frame(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 5);
  out[0] = 0xbb;
  out[1] = 0x66;
  out[2] = payload.length & 0xff;
  out[3] = (payload.length >> 8) & 0xff;
  out.set(payload, 4);
  let chk = 0;
  for (const b of payload) chk ^= b;
  out[out.length - 1] = chk;
  return out;
}

/**
 * Yüklemeden önce çağır: robotu bootloader'a resetler ve otomatik
 * yeniden bağlanmayı bekler. Ardından normal bridge.uploadCode(...) çağrılır.
 */
export async function prepareUpload(bridge: BLEBridge): Promise<void> {
  // BLEBridge._writeRaw private — küçük bir any köprüsü:
  const b = bridge as any;
  if (bridge.state !== 'connected') return;
  b.expectReconnect = true;
  try {
    await b._writeRaw(new Uint8Array([MSG_RESET]));
  } catch {
    /* reset anında kopma normaldir */
  }
  // gattserverdisconnected -> _autoReconnect zaten kurulu; bağlanana
  // kadar bekle (en fazla 12 sn).
  const t0 = Date.now();
  while (bridge.state !== 'connected' && Date.now() - t0 < 12000) {
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Pil yüzdesini ister. Cevap onSensorReply üzerinden gelir; bu yardımcı
 * onu tek seferlik dinleyip Promise olarak döndürür.
 *
 * Dönen değer: 0-100 arası yüzde, ölçüm donanımı yoksa null.
 * (Firmware, berrybot.py içinde PIN_BATTERY = None ise 0xFFFF döndürür.)
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
    // Mevcut API'yi kullan: tek sensör [tip, pin1, pin2]
    bridge.requestSensors([[SENSOR_BATTERY, 0, 0]]);
  });
}

/**
 * Örnek kullanım (App.tsx / SensorDashboard):
 *
 *   import { requestBattery } from './bluetooth/berrybot-bridge';
 *   const pct = await requestBattery(bleBridge);
 *   setBatteryLabel(pct === null ? '—' : `%${pct}`);
 *
 * 10 sn'de bir yenilemek için setInterval yeterlidir. Robot ekranında
 * (5x5 matris) pil göstergesi zaten var: butona 1 sn uzun basınca
 * çubuk grafiği + kayan yüzde gösterilir.
 */
