# ============================================================
# RoboExx BerryBot Firmware — v2.0.0  (main.py)
# ------------------------------------------------------------
# Açılışta:
#   1) BLE modülü yapılandırılır, RoboExx bootloader servisi
#      bir donanım timer'ına bağlanır (HER ZAMAN dinlemede)
#   2) user_code.py varsa çalıştırılır (yoksa hazır modlar)
#
# Tarayıcı (roboexx ble-bridge.ts) AYNI protokolle konuşur:
#   MSG_BEGIN/CHUNK/END/PING/RESET/KEY/SENSOR_REQ
#   STATUS_READY/RECEIVING/SAVED/ERROR, SENSOR_REPLY
# Pico W sürümünden tek fark: veri GATT IRQ yerine UART'tan
# (şeffaf BLE modülü) gelir.
#
# Ek olarak resmi PicoBricks GO uygulamasının 0x52 paketleri
# de desteklenir — eski uygulama da çalışmaya devam eder.
#
# Buton: kısa bas -> mod değiştir, uzun bas (1sn) -> pil göstergesi
# ============================================================

import os
import time
import struct
import machine
from machine import Timer
from utime import ticks_ms, ticks_diff

from berrybot import BerryBot, constrain, STOP, FWD, BWD, RIGHT, LEFT

# ---------------- Protokol sabitleri (ble-bridge.ts ile birebir) ---------
MSG_BEGIN       = 0x01
MSG_CHUNK       = 0x02
MSG_END         = 0x03
MSG_PING        = 0x04
MSG_RESET       = 0x05
MSG_KEY         = 0x06
MSG_SENSOR_REQ  = 0x07
MSG_SENSOR_REPLY = 0x14

STATUS_READY     = 0x10
STATUS_RECEIVING = 0x11
STATUS_SAVED     = 0x12
STATUS_ERROR     = 0x13

SENSOR_DIGITAL   = 0x01
SENSOR_ANALOG    = 0x02
SENSOR_ULTRASONIC = 0x03
SENSOR_TEMP_INT  = 0x04
SENSOR_BATTERY   = 0x05   # RoboExx eki: pil yüzdesi (0xFFFF = ölçüm yok)

# Opsiyonel çerçeveli sarmalayıcı (berrybot-frame.ts): BB 66 len_lo len_hi payload chk
FRAME_MAGIC0 = 0xBB
FRAME_MAGIC1 = 0x66

STAY_FLAG = '.stay_bootloader'   # varsa: user_code çalıştırılmaz (tek seferlik)

CHUNK_SIZE = 200                 # tarayıcı sabiti — akış çözümlemede kullanılır

# ---------------- Donanım ----------------
def _read_device_name():
    """device_name.txt'den BLE cihaz adını oku (Modülleri Yükle yazar)."""
    try:
        with open('device_name.txt', 'r') as f:
            n = f.read().strip()
        # BLE reklam sınırı: en fazla 20 karakter, ASCII'ye indir
        n = ''.join(c if ord(c) < 128 else '_' for c in n)[:20]
        return n if n else 'RoboExx-Berry'
    except Exception:
        return 'RoboExx-Berry'


bot = BerryBot(ble_name=_read_device_name())
bot.ble.configure()

rgb_value = [[0, 0, 127]] * 7    # varsayılan mavi tema


# ============================================================
# BLE Bootloader servisi — timer'dan beslenir, her yerde aktif
# ============================================================
class BLEService:
    def __init__(self, bot):
        self.bot = bot
        self.uploading = False
        # dosya alma durumu
        self._fname = None
        self._total = 0
        self._buf = None
        self._got = 0
        # canlı klavye
        self.pressed_keys = ''
        self.keys_at = 0
        # eski GO uygulaması durumu
        self.legacy_mode = 0        # 0 yok, 1 sonic, 2 çizgi, 3 ışık, 4 sumo
        self.legacy_active = False
        # akış tamponu (deterministik CHUNK çözümü için)
        self._stream = bytearray()

    # ---------- gönderim ----------
    def notify(self, data):
        try:
            self.bot.ble.write(data)
        except Exception:
            pass

    def status(self, code):
        self.notify(bytes([code]))

    # ---------- ana giriş: timer her 20ms çağırır ----------
    def poll(self, _t=None):
        try:
            burst = self.bot.ble.read_burst()
            if burst:
                self._handle_burst(burst)
        except Exception as e:
            print("[BLE] poll hata:", e)

    def _handle_burst(self, data):
        # Yükleme sırasında CHUNK'lar arka arkaya UART'ta birleşebilir;
        # akış tamponuna ekle ve deterministik çöz.
        self._stream += data
        while self._stream:
            consumed = self._parse_one(self._stream)
            if consumed <= 0:
                break
            self._stream = self._stream[consumed:]
        # Çözümlenemeyen artık — bir sonraki patlamada sınır kaybolmasın
        if len(self._stream) > 4096:
            self._stream = bytearray()

    def _parse_one(self, b):
        """Tampondan tek mesaj işle; tüketilen bayt sayısını döndür.
        0 = eksik veri (bekle), tam çözülemeyen tekil baytlar 1 tüketir."""
        t = b[0]

        # --- çerçeveli sarmalayıcı ---
        if t == FRAME_MAGIC0:
            if len(b) < 4:
                return 0
            if b[1] != FRAME_MAGIC1:
                return 1
            ln = b[2] | (b[3] << 8)
            if len(b) < 4 + ln + 1:
                return 0
            payload = bytes(b[4:4 + ln])
            chk = b[4 + ln]
            x = 0
            for v in payload:
                x ^= v
            if x == chk:
                self._dispatch(payload)
            else:
                self.status(STATUS_ERROR)
            return 4 + ln + 1

        # --- ham protokol ---
        if t == MSG_PING or t == MSG_END or t == MSG_RESET:
            self._dispatch(bytes(b[0:1]))
            return 1

        if t == MSG_BEGIN:
            # [01][name_len][name][size:4]
            if len(b) < 2:
                return 0
            nl = b[1]
            need = 2 + nl + 4
            if len(b) < need:
                return 0
            self._dispatch(bytes(b[:need]))
            return need

        if t == MSG_CHUNK:
            # [02][offset:4][data] — veri uzunluğu: min(CHUNK_SIZE, kalan)
            if self._buf is None or len(b) < 5:
                return 0 if len(b) < 5 else 1
            offset = struct.unpack("<I", b[1:5])[0]
            dlen = min(CHUNK_SIZE, self._total - offset)
            if dlen < 0:
                return 1
            need = 5 + dlen
            if len(b) < need:
                return 0
            self._dispatch(bytes(b[:need]))
            return need

        if t == MSG_KEY or t == MSG_SENSOR_REQ or t == 0x52:
            # Uzunluk bilgisi yok — patlama sınırı = mesaj sınırı varsayılır.
            self._dispatch(bytes(b))
            return len(b)

        return 1  # tanınmayan bayt — atla

    # ---------- mesaj işleyiciler ----------
    def _dispatch(self, data):
        t = data[0]
        if t == MSG_PING:
            self.status(STATUS_READY)
        elif t == MSG_RESET:
            # Bootloader'da kal (user_code'u bir kereliğine atla) ve resetle
            try:
                with open(STAY_FLAG, 'w') as f:
                    f.write('1')
            except Exception:
                pass
            self.bot.stop_all()
            time.sleep_ms(100)
            machine.reset()
        elif t == MSG_BEGIN:
            self._on_begin(data)
        elif t == MSG_CHUNK:
            self._on_chunk(data)
        elif t == MSG_END:
            self._on_end()
        elif t == MSG_KEY:
            self._on_keys(data)
        elif t == MSG_SENSOR_REQ:
            self._on_sensors(data)
        elif t == 0x52:
            self._on_legacy(data)

    def _on_begin(self, data):
        try:
            nl = data[1]
            self._fname = data[2:2 + nl].decode()
            self._total = struct.unpack("<I", data[2 + nl:2 + nl + 4])[0]
            self._buf = bytearray(self._total)
            self._got = 0
            self.uploading = True
            self.bot.stop_all()                    # güvenlik: motorları durdur
            if self.bot.matrix:
                self.bot.matrix.progress(0)
            print("[BLE] Yeni dosya:", self._fname, self._total, "bayt")
            self.status(STATUS_RECEIVING)
        except Exception as e:
            print("[BLE] BEGIN hata:", e)
            self.status(STATUS_ERROR)

    def _on_chunk(self, data):
        if self._buf is None:
            self.status(STATUS_ERROR)
            return
        try:
            offset = struct.unpack("<I", data[1:5])[0]
            chunk = data[5:]
            end = offset + len(chunk)
            if end > self._total:
                raise ValueError("chunk taşması")
            self._buf[offset:end] = chunk
            self._got += len(chunk)
            if self.bot.matrix and self._total:
                self.bot.matrix.progress(self._got * 100 // self._total)
        except Exception as e:
            print("[BLE] CHUNK hata:", e)
            self.status(STATUS_ERROR)

    def _on_end(self):
        if self._buf is None or self._fname is None:
            self.status(STATUS_ERROR)
            return
        fname, buf = self._fname, self._buf
        self._fname = None; self._buf = None
        try:
            with open(fname, 'wb') as f:
                f.write(buf)
            try:
                os.sync()
            except AttributeError:
                pass
            sz = os.stat(fname)[6]
            print("[BLE] Kaydedildi:", fname, sz, "/", len(buf))
            if sz != len(buf):
                raise OSError("boyut uyuşmadı")
            self.status(STATUS_SAVED)
            if self.bot.matrix:
                self.bot.matrix.show('yes')
            self.bot.buzzer.beep(80, 1500)
            time.sleep_ms(300)                     # tarayıcı SAVED'i alsın
            machine.reset()                        # yeni kodla yeniden başla
        except Exception as e:
            print("[BLE] END hata:", e)
            self.uploading = False
            self.status(STATUS_ERROR)
            if self.bot.matrix:
                self.bot.matrix.show('no')

    def _on_keys(self, data):
        try:
            self.pressed_keys = bytes(data[1:]).decode('ascii', 'ignore').lower()
            self.keys_at = ticks_ms()
        except Exception:
            self.pressed_keys = ''

    def drive_from_keys(self):
        """W-A-S-D canlı kontrol. Ana döngüden çağrılır."""
        # 600ms'dir tuş verisi gelmediyse güvenli dur
        if not self.pressed_keys or ticks_diff(ticks_ms(), self.keys_at) > 600:
            return False
        k = self.pressed_keys
        y = 100 if 'w' in k else (-100 if 's' in k else 0)
        x = 60 if 'd' in k else (-60 if 'a' in k else 0)
        left = constrain(y + x, -100, 100)
        right = constrain(y - x, -100, 100)
        self.bot.motors.drive(left, right)
        return True

    def _on_sensors(self, req):
        reply = bytearray([MSG_SENSOR_REPLY])
        i = 1
        while i + 2 < len(req):
            stype, p1, p2 = req[i], req[i + 1], req[i + 2]
            value = 0xFFFF
            try:
                if stype == SENSOR_DIGITAL:
                    value = machine.Pin(p1, machine.Pin.IN,
                                        machine.Pin.PULL_UP).value()
                elif stype == SENSOR_ANALOG:
                    value = machine.ADC(p1).read_u16() if 26 <= p1 <= 29 else 0xFFFE
                elif stype == SENSOR_ULTRASONIC:
                    value = self.bot.sonar.distance_mm()
                elif stype == SENSOR_TEMP_INT:
                    raw = machine.ADC(4).read_u16()
                    temp = 27 - (raw * 3.3 / 65535 - 0.706) / 0.001721
                    value = max(0, min(65535, int(temp * 100)))
                elif stype == SENSOR_BATTERY:
                    pct = self.bot.battery.percent()
                    value = pct if pct is not None else 0xFFFF
                else:
                    value = 0xFFFD
            except Exception:
                value = 0xFFFC
            reply.append(value & 0xFF)
            reply.append((value >> 8) & 0xFF)
            i += 3
        self.notify(bytes(reply))

    # ---------- Eski PicoBricks GO paketleri (0x52 ...) ----------
    def _on_legacy(self, b):
        global rgb_value
        if len(b) < 3:
            return
        if b[1] == 2:                               # tekil komutlar / modlar
            c = b[2]
            if c == 99:                             # mod çıkışı
                self.legacy_mode = 0
                self.bot.motors.stop()
            elif c == 1:
                self.bot.ring.off()
            elif c == 90:
                self.bot.ring.set_all(rgb_value); self.bot.ring.show()
            elif c == 2:
                self.bot.buzzer.horn()
            elif c == 4:
                self.legacy_mode = 1
            elif c == 8:
                self.legacy_mode = 2
            elif c == 16:
                self.legacy_mode = 3
            elif c == 32:
                self.legacy_mode = 4
        elif b[1] == 3 and len(b) >= 4:             # joystick
            self.legacy_mode = 0
            if b[2] == 0 and b[3] == 0:
                self.bot.motors.stop()
            else:
                self.bot.motors.joystick(b[2], b[3])
        elif b[1] == 7 and len(b) >= 6:             # tek RGB LED rengi
            idx = constrain(b[2] - 1, 0, 6)
            rgb_value[idx] = [b[3], b[4], b[5]]
            self.bot.ring.set_all(rgb_value); self.bot.ring.show()
        elif b[1] == 6 and len(b) >= 7:             # kullanıcı matris deseni
            if self.bot.matrix:
                self.bot.matrix.show(list(b[2:7]))


svc = BLEService(bot)
ble_timer = Timer(-1)
ble_timer.init(period=20, mode=Timer.PERIODIC, callback=svc.poll)


# Pil göstergesi artık kütüphanede: bot.show_battery()
def show_battery():
    bot.show_battery()


# ============================================================
# Hazır modlar (buton ile gezilir)
# ============================================================
Max, Mid, Low = 100, 76, 72             # yüzde hızlar
TRACKER_TH = 50000
LDR_TH = 250
LDR_TOL = 5000

_line_dir = [STOP]


def mode_ir():
    code = bot.ir.read()
    if code is None:
        return
    IR = bot.ir
    if code == IR.KEY_UP:
        bot.motors.move(FWD, Max); time.sleep_ms(500); bot.motors.stop()
    elif code == IR.KEY_DOWN:
        bot.motors.move(BWD, Max); time.sleep_ms(500); bot.motors.stop()
    elif code == IR.KEY_LEFT:
        bot.motors.move(LEFT, Max); time.sleep_ms(130); bot.motors.stop()
    elif code == IR.KEY_RIGHT:
        bot.motors.move(RIGHT, Max); time.sleep_ms(130); bot.motors.stop()
    else:
        bot.motors.stop()


def mode_line():
    l_on, r_on = bot.line.on_line()
    if l_on and r_on:
        d = FWD
    elif r_on:
        d = RIGHT
    elif l_on:
        d = LEFT
    elif _line_dir[0] != STOP:
        d = BWD
    else:
        d = STOP
    if d != _line_dir[0]:
        _line_dir[0] = d
        bot.motors.move(d, Low if d == BWD else Mid)
    time.sleep_ms(15)


def mode_light():
    L, R = bot.light.raw()
    dist = bot.sonar.distance_cm()
    if L >= LDR_TH and R >= LDR_TH:
        if dist < 10:
            bot.motors.stop(); time.sleep_ms(20)
            bot.motors.move(LEFT, Mid); time.sleep_ms(500)
            bot.motors.stop()
        elif R - L >= LDR_TOL:
            bot.motors.move(RIGHT, Mid)
        elif L - R >= LDR_TOL:
            bot.motors.move(LEFT, Mid)
        elif L >= 10000 and R >= 10000:
            bot.motors.move(FWD, Max)
        else:
            bot.motors.stop()
    else:
        bot.motors.stop()
    time.sleep_ms(20)


_sumo_cnt = [0]


def mode_sumo():
    dist = bot.sonar.distance_cm()
    l_on, r_on = bot.line.on_line()
    if l_on or r_on:                       # kenar çizgisi -> geri kaç
        bot.motors.move(BWD, Mid)
        time.sleep_ms(500 if dist <= 15 else 100)
    elif dist <= 15:                       # rakip önde -> it!
        bot.motors.move(FWD, Max)
        time.sleep_ms(300)
    else:                                  # rakibi ara
        _sumo_cnt[0] += 1
        if _sumo_cnt[0] >= 3:
            _sumo_cnt[0] = 0
            bot.motors.move(FWD, Mid); time.sleep_ms(100)
        else:
            bot.motors.move(LEFT, Mid); time.sleep_ms(100)
            bot.motors.stop()
    time.sleep_ms(15)


_sonic_left = [0]


def mode_sonic():
    if bot.sonar.distance_cm(samples=3) > 12:
        bot.motors.move(FWD, Max)
    else:
        bot.motors.stop(); time.sleep_ms(300)
        bot.motors.move(BWD, Max); time.sleep_ms(120)
        bot.motors.stop(); time.sleep_ms(150)
        bot.motors.move(LEFT, Mid)
        time.sleep_ms(500 if _sonic_left[0] == 0 else 1000)
        _sonic_left[0] ^= 1
        bot.motors.stop(); time.sleep_ms(200)


MODES = [
    (None,       'bluetooth'),   # 0: BLE / boşta
    (mode_ir,    'ir'),
    (mode_line,  'tracker'),
    (mode_light, 'sunny'),
    (mode_sonic, 'sonic'),
    (mode_sumo,  'triangle'),
]
berry_mode = [0]


# --- buton: kısa = mod, uzun (1sn) = pil göstergesi ---
def check_button():
    if not bot.button.value():
        return
    t0 = ticks_ms()
    while bot.button.value():
        if ticks_diff(ticks_ms(), t0) > 1000:
            bot.stop_all()
            show_battery()
            while bot.button.value():
                time.sleep_ms(20)
            bot.matrix.show(MODES[berry_mode[0]][1])
            return
        time.sleep_ms(20)
    bot.stop_all()
    berry_mode[0] = (berry_mode[0] + 1) % len(MODES)
    bot.matrix.show(MODES[berry_mode[0]][1])
    bot.buzzer.beep(40, 1200)
    time.sleep_ms(150)


# ============================================================
# Açılış
# ============================================================
def _boot():
    bot.ring.set_all(rgb_value); bot.ring.show()
    bot.buzzer.boot_jingle()

    # STAY bayrağı: tarayıcı MSG_RESET gönderdiyse user_code'u atla
    stay = STAY_FLAG in os.listdir()
    if stay:
        try:
            os.remove(STAY_FLAG)
        except Exception:
            pass

    # Kullanıcı kodu varsa çalıştır (bootloader timer'ı arka planda
    # dinlemeye devam eder — kod çalışırken bile yeni yükleme alınır)
    if not stay and 'user_code.py' in os.listdir():
        bot.matrix.show('smile')
        try:
            print("[BOOT] user_code.py çalıştırılıyor")
            import user_code                       # noqa: F401
        except Exception as e:
            print("[BOOT] user_code hatası:", e)
            bot.stop_all()
            bot.matrix.show('no')
            time.sleep(1)
        # Kod bittiğinde/bozulduğunda hazır modlara düş
        bot.matrix.show(MODES[berry_mode[0]][1])

    # ---- hazır modlar + BLE canlı kontrol döngüsü ----
    bot.matrix.show(MODES[berry_mode[0]][1])
    while True:
        if svc.uploading:                          # yükleme sürüyor: dokunma
            time.sleep_ms(50)
            continue
        check_button()
        if berry_mode[0] == 0:
            # BLE modu: klavye (WASD) canlıysa sür, eski GO modu seçiliyse çalıştır
            if not svc.drive_from_keys():
                if svc.legacy_mode == 1:
                    mode_sonic()
                elif svc.legacy_mode == 2:
                    mode_line()
                elif svc.legacy_mode == 3:
                    mode_light()
                elif svc.legacy_mode == 4:
                    mode_sumo()
                else:
                    time.sleep_ms(10)
        else:
            fn = MODES[berry_mode[0]][0]
            if fn:
                fn()
        time.sleep_ms(2)


try:
    _boot()
except KeyboardInterrupt:
    bot.stop_all()
    ble_timer.deinit()
    raise
