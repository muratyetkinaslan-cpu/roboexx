# BERRYBOT-BOOT v4 — BLE Boot Loader (bu satırdaki imza silinmemeli!)
######################################################################
#  BerryBot — BLE Boot Loader v4  (harici UART BLE modülü için)
#
#  v3'ün (kanıtlanmış) çekirdeği + RoboExx özellikleri:
#   • v3 mimarisi: flash'a YALNIZCA tek çekirdek çalışırken yazılır.
#     - YÜKLEME/BOŞTA MODU (çekirdek-0): tam protokol — BEGIN /
#       ACK'lı CHUNK2 / checksum'lu END2. Dosyalar burada yazılır.
#     - ÇALIŞMA MODU: kullanıcı kodu çekirdek-0'da; çekirdek-1'de GÖZCÜ
#       BLE'yi dinler. Gözcü ASLA flash'a yazmaz — yükleme isteği gelince
#       STATUS_REBOOTING yollar, watchdog SCRATCH register'ına işaret
#       koyar ve resetler. Robot yükleme modunda açılır; tarayıcı BEGIN'i
#       yeniden gönderir. BLE modülü Pico'dan bağımsız beslendiği için
#       bu resetlerde tarayıcı bağlantısı KOPMAZ.
#   • İşaretli (sıcak) açılışlarda AT yapılandırması atlanır — modül
#     zaten canlı ve şeffaf modda; yeniden yapılandırmak bağlantıyı bozar.
#   • v4 ekleri (boşta modunda): hazır modlar (buton ile: IR kumanda,
#     çizgi, ışık, sonik, sumo), 5x5 ekran ikonları + yükleme ilerlemesi,
#     RGB halka, uzun buton basışıyla pil göstergesi, PicoBricks GO
#     uygulaması (0x52 paketleri), canlı WASD sürüş (MSG_KEY) ve sensör
#     paneli + pil sorgusu (MSG_SENSOR_REQ) — sensör sorguları gözcüde de
#     çalışır (kod koşarken bile pil rozeti güncellenir).
#
#  Protokol (tarayıcı → robot):
#    MSG_BEGIN   0x01  name_len(1) + name + total(4, LE)
#    MSG_CHUNK   0x02  offset(4, LE) + data              (v1 uyumu)
#    MSG_END     0x03                                     (v1 uyumu)
#    MSG_PING    0x04  → STATUS_READY_V2
#    MSG_RESET   0x05  → machine.reset()
#    MSG_CHUNK2  0x06  offset(4, LE) + len(2, LE) + data → STATUS_ACK
#    MSG_END2    0x07  checksum(4, LE) → doğrula + kaydet
#    MSG_STOP    0x08  → kod çalıştırmadan boşta bekle
#    MSG_KEY     0x0B  len(1) + ascii basılı tuşlar (WASD canlı sürüş)
#    MSG_SENSOR  0x0C  n(1) + n×(tip,pin1,pin2) → 0x14 + n×uint16 LE
#      tipler: 1 dijital · 2 analog · 3 ultrasonik · 4 iç sıcaklık ·
#              5 pil yüzdesi (yoksa 0xFFFF)
#    0x52 ...          PicoBricks GO uygulaması paketleri (eski uyum)
#  Robot → tarayıcı: READY 0x10 · RECEIVING 0x11 · SAVED 0x12 ·
#    ERROR 0x13 · SENSOR_REPLY 0x14(+payload) · ACK 0x15 ·
#    READY_V2 0x16 · REBOOTING 0x17
######################################################################

import machine
import os
import time
import _thread
from machine import Pin, UART, mem32

# ---- BLE modülü (UART0) ----
_TX_PIN = 0
_RX_PIN = 1
_BAUD = 115200

# ---- NUS UUID'leri (ble-bridge ile aynı) ----
_BLE_SERVICE_UUID = "6E400001B5A3F393E0A9E50E24DCCA9E"
_BLE_RX_UUID = "6E400002B5A3F393E0A9E50E24DCCA9E"
_BLE_TX_UUID = "6E400003B5A3F393E0A9E50E24DCCA9E"
_DEFAULT_NAME = "RoboExx-Berry"

# ---- Protokol ----
MSG_BEGIN = 0x01
MSG_CHUNK = 0x02
MSG_END = 0x03
MSG_PING = 0x04
MSG_RESET = 0x05
MSG_CHUNK2 = 0x06
MSG_END2 = 0x07
MSG_STOP = 0x08
MSG_KEY = 0x0B
MSG_SENSOR = 0x0C
MSG_LEGACY = 0x52          # PicoBricks GO ('R')

STATUS_READY = 0x10
STATUS_RECEIVING = 0x11
STATUS_SAVED = 0x12
STATUS_ERROR = 0x13
STATUS_SENSOR_REPLY = 0x14
STATUS_ACK = 0x15
STATUS_READY_V2 = 0x16
STATUS_REBOOTING = 0x17

CHUNK_SIZE = 200            # v1 uyumu — ble-bridge.ts ile aynı

# ---- Watchdog SCRATCH0: resetler arası hayatta kalan işaret ----
# (RP2040 donanım register'ı — flash'a/RAM'e yazmadan mod taşır.
#  pico-sdk SCRATCH4-7'yi kullanır; SCRATCH0 boştur. Güç kesilince sıfırlanır.)
_WD_SCRATCH0 = 0x4005800C
MAGIC_UPLOAD = 0x51CA0001   # gözcü: "yükleme isteği var, yükleme modunda aç"
MAGIC_NORUN = 0x51CA0002    # "Durdur": kodu çalıştırmadan boşta bekle
MAGIC_FAST = 0x51CA0003     # az önce kod kaydedildi: modül canlı, config atla


def _scratch_read():
    return mem32[_WD_SCRATCH0] & 0x7FFFFFFF


def _scratch_write(v):
    mem32[_WD_SCRATCH0] = v


def _read_device_name():
    try:
        with open("device_name.txt", "r") as f:
            name = f.read().strip()
        if name:
            return "".join(c if ord(c) < 128 else "_" for c in name)[:20]
    except Exception:
        pass
    return _DEFAULT_NAME


def _has_user_code():
    try:
        os.stat("user_code.py")
        return True
    except OSError:
        return False


# ============================================================
#  BLE modül katmanı (UART0)
# ============================================================
class BleUartModule:
    def __init__(self):
        # rxbuf BÜYÜK olmalı: flash yazarken gelen baytlar varsayılan
        # minicik tamponda kayboluyordu → bozuk yüklemeler.
        self.uart = UART(0, _BAUD, parity=None, stop=1, bits=8,
                         tx=Pin(_TX_PIN), rx=Pin(_RX_PIN),
                         rxbuf=4096, txbuf=512, timeout=20)

    def flush_rx(self):
        try:
            while self.uart.any() > 0:
                self.uart.read(64)
        except Exception:
            pass

    def _at(self, cmd, wait_ms=350):
        self.uart.write(cmd)
        time.sleep_ms(wait_ms)
        resp = b""
        try:
            while self.uart.any() > 0:
                d = self.uart.read(64)
                if d:
                    resp += d
        except Exception:
            pass
        return resp

    def _wait_module_awake(self, max_ms=6000):
        """Modül 'AT' → 'OK' diyene kadar bekle (soğuk açılışta geç uyanır).
        Erken gönderilen komutlar (TRANSENTER dahil) yoksa KAYBOLUR ve
        modül AT modunda kalır → BLE iki yönde de ölü görünür."""
        waited = 0
        while waited < max_ms:
            if b"OK" in self._at("AT\r\n", 250):
                return True
            time.sleep_ms(150)
            waited += 400
        return False

    def ensure_transparent(self, max_tries=3):
        """Şeffaf modda mıyız? DOĞRULA; değilsek gir.
        Test: AT modundaysa 'AT' yerel 'OK' döndürür; şeffaf moddaysa
        baytlar havaya gider, yerel cevap GELMEZ. ('AT\r\n' baytları
        tarayıcı tarafında durum filtresine takılır — zararsız.)"""
        for _ in range(max_tries):
            resp = self._at("AT\r\n", 300)
            if b"OK" not in resp:
                return True              # yerel cevap yok → şeffaf mod ✓
            # Hâlâ AT modunda → şeffafa geçmeyi dene
            self._at("AT+TRANSENTER\r\n", 400)
        # Son kontrol
        return b"OK" not in self._at("AT\r\n", 300)

    def configure(self, name):
        # Şeffaf moddan çıkmayı dene (önceki oturumdan kalmış olabilir)
        self._at("+++\r\n")
        time.sleep_ms(300)
        if not self._wait_module_awake():
            print("[BLE] UYARI: modül 'OK' demedi — yine de deneniyor")
        self._at("AT+BLENAME={}\r\n".format(name))
        self._at("AT+BLESERUUID={}\r\n".format(_BLE_SERVICE_UUID))
        self._at("AT+BLERXUUID={}\r\n".format(_BLE_RX_UUID))
        self._at("AT+BLETXUUID={}\r\n".format(_BLE_TX_UUID))
        self._at("AT+SYSIOMAP=1,4\r\n")
        self._at("AT+TRANSENTER\r\n")   # şeffaf moda gir → ham veri köprüsü
        if self.ensure_transparent():
            print("[BLE] Şeffaf mod DOĞRULANDI")
        else:
            print("[BLE] UYARI: şeffaf moda geçilemedi!")
        time.sleep_ms(200)
        self.flush_rx()

    # ---- Şeffaf modda ham veri ----
    def send(self, data):
        try:
            self.uart.write(data)
        except Exception:
            pass

    def read_exact(self, n, timeout_ms=4000):
        """UART'tan tam n bayt oku. Zaman aşımında None döner."""
        buf = bytearray()
        deadline = None if timeout_ms is None else time.ticks_add(time.ticks_ms(), timeout_ms)
        while len(buf) < n:
            if self.uart.any() > 0:
                chunk = self.uart.read(n - len(buf))
                if chunk:
                    buf += chunk
            else:
                if deadline is not None and time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                    return None
                time.sleep_ms(2)
        return bytes(buf)


def _u32le(b):
    return b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)


def _u16le(b):
    return b[0] | (b[1] << 8)


# ============================================================
#  Sensör sorgusu (0x0C) — hem gözcü hem boşta modu kullanır.
#  Flash'a DOKUNMAZ → çekirdek-1'de de güvenlidir.
# ============================================================
def _handle_sensor_req(mod):
    head = mod.read_exact(1, timeout_ms=800)
    if head is None:
        return
    n = head[0]
    if n > 16:
        return
    body = mod.read_exact(3 * n, timeout_ms=800)
    if body is None:
        return
    reply = bytearray([STATUS_SENSOR_REPLY])
    for i in range(n):
        stype = body[3 * i]
        p1 = body[3 * i + 1]
        p2 = body[3 * i + 2]
        value = 0xFFFF
        try:
            if stype == 1:      # dijital
                value = machine.Pin(p1, machine.Pin.IN, machine.Pin.PULL_UP).value()
            elif stype == 2:    # analog
                value = machine.ADC(p1).read_u16() if 26 <= p1 <= 29 else 0xFFFE
            elif stype == 3:    # ultrasonik (mm)
                trig = machine.Pin(p1, machine.Pin.OUT)
                echo = machine.Pin(p2, machine.Pin.IN)
                trig.value(0); time.sleep_us(4)
                trig.value(1); time.sleep_us(10)
                trig.value(0)
                dur = machine.time_pulse_us(echo, 1, 15000)
                value = 0xFFFF if dur < 0 else min(int(dur * 0.343 / 2), 65000)
            elif stype == 4:    # iç sıcaklık ×100
                raw = machine.ADC(4).read_u16()
                t = 27 - (raw * 3.3 / 65535 - 0.706) / 0.001721
                value = max(0, min(65535, int(t * 100)))
            elif stype == 5:    # pil yüzdesi
                try:
                    from berrybot import Battery
                    p = Battery().percent()
                    value = 0xFFFF if p is None else p
                except Exception:
                    value = 0xFFFF
        except Exception:
            value = 0xFFFC
        reply.append(value & 0xFF)
        reply.append((value >> 8) & 0xFF)
    mod.send(bytes(reply))


# ============================================================
#  YÜKLEME / BOŞTA MODU — tek çekirdek → flash yazımı GÜVENLİ
#  Mesaj beklerken hazır modları (IR/çizgi/ışık/sonik/sumo) çalıştırır.
# ============================================================
def _idle_mode(mod, forever):
    """Tam protokolü konuş; dosyaları al/yaz; boşta hazır modları koştur.
    forever=False → gözcü isteğiyle girildi; 25 sn sessizlik olur ve
    kullanıcı kodu varsa normal moda dön."""
    print("[Boot] Yükleme/boşta modu" + ("" if forever else " (25sn pencere)"))

    # --- Donanımı hazırla (matris ikonu, RGB, modlar) ---
    bot = None
    modes = None
    try:
        from berrybot import BerryBot
        bot = BerryBot(init_ble=False)      # UART'a DOKUNMA — mod bizim
        import berry_modes
        modes = berry_modes.Modes(bot, mod)
    except Exception as e:
        print("[Boot] Donanım katmanı yüklenemedi (yalın bootloader):", e)

    filename = None
    total = 0
    buffer = None
    idle_ms = 0
    uploading = False
    ping_beeped = False

    while True:
        first = mod.read_exact(1, timeout_ms=20 if (modes and not uploading) else 1000)
        if first is None:
            if modes and not uploading:
                try:
                    modes.step()            # buton + aktif mod + WASD zaman aşımı
                except Exception:
                    pass
                idle_ms += 20
            else:
                idle_ms += 1000
            if not forever and idle_ms >= 25000 and _has_user_code():
                print("[Boot] Sessizlik — normal moda dönülüyor")
                _scratch_write(MAGIC_FAST)
                machine.reset()
            continue
        idle_ms = 0
        msg = first[0]

        try:
            if msg == MSG_PING:
                mod.send(bytes([STATUS_READY_V2]))
                if not ping_beeped and bot:
                    # Tarayıcı bağlandı ve ilk PING ulaştı → çift blip.
                    # Bip duyuluyorsa telefon→robot hattı KESİN çalışıyor.
                    ping_beeped = True
                    bot.buzzer.beep(35, 1568)
                    time.sleep_ms(40)
                    bot.buzzer.beep(35, 2093)

            elif msg == MSG_RESET:
                time.sleep_ms(120)
                machine.reset()

            elif msg == MSG_STOP:
                forever = True
                if bot:
                    bot.stop_all()

            elif msg == MSG_BEGIN:
                hdr = mod.read_exact(1)
                if hdr is None:
                    continue
                name_b = mod.read_exact(hdr[0])
                size_b = mod.read_exact(4)
                if name_b is None or size_b is None:
                    mod.send(bytes([STATUS_ERROR]))
                    continue
                filename = name_b.decode()
                total = _u32le(size_b)
                if total > 128 * 1024:
                    mod.send(bytes([STATUS_ERROR]))
                    filename = None
                    buffer = None
                    continue
                buffer = bytearray(total)
                uploading = True
                if bot:
                    bot.stop_all()
                    if bot.matrix:
                        bot.matrix.progress(0)
                    bot.buzzer.beep(80, 880)
                mod.send(bytes([STATUS_RECEIVING]))

            elif msg == MSG_CHUNK2:
                # v2: açık uzunluk + her parçaya ACK → akış kontrolü
                head = mod.read_exact(6)
                if head is None or buffer is None:
                    mod.send(bytes([STATUS_ERROR]))
                    continue
                offset = _u32le(head)
                dlen = _u16le(head[4:6])
                data = mod.read_exact(dlen)
                if data is None:
                    mod.send(bytes([STATUS_ERROR]))
                    continue
                end = offset + len(data)
                if end <= total:
                    buffer[offset:end] = data
                if bot and bot.matrix and total:
                    bot.matrix.progress(min(end, total) * 100 // total)
                mod.send(bytes([STATUS_ACK]))

            elif msg == MSG_CHUNK:
                # v1 (eski tarayıcı uyumu): uzunluk örtük, ACK yok
                off_b = mod.read_exact(4)
                if off_b is None or buffer is None:
                    mod.send(bytes([STATUS_ERROR]))
                    continue
                offset = _u32le(off_b)
                dlen = total - offset
                if dlen > CHUNK_SIZE:
                    dlen = CHUNK_SIZE
                data = mod.read_exact(dlen)
                if data is None:
                    mod.send(bytes([STATUS_ERROR]))
                    continue
                end = offset + len(data)
                if end <= total:
                    buffer[offset:end] = data
                if bot and bot.matrix and total:
                    bot.matrix.progress(min(end, total) * 100 // total)

            elif msg == MSG_END2:
                sum_b = mod.read_exact(4)
                if sum_b is None or buffer is None or filename is None:
                    mod.send(bytes([STATUS_ERROR]))
                    continue
                expect = _u32le(sum_b)
                s = 0
                for byt in buffer:
                    s = (s + byt) & 0xFFFFFFFF
                if s != expect:
                    # Bozuk aktarım → dosya YAZILMAZ; tarayıcı tekrar dener
                    mod.send(bytes([STATUS_ERROR]))
                    if bot and bot.matrix:
                        bot.matrix.show('no')
                    filename = None
                    buffer = None
                    uploading = False
                    continue
                _save(filename, buffer, mod, bot)
                filename = None
                buffer = None
                uploading = False

            elif msg == MSG_END:
                # v1: checksum yok
                if buffer is None or filename is None:
                    mod.send(bytes([STATUS_ERROR]))
                    continue
                _save(filename, buffer, mod, bot)
                filename = None
                buffer = None
                uploading = False

            elif msg == MSG_KEY:
                ln = mod.read_exact(1, timeout_ms=300)
                if ln is None:
                    continue
                keys = mod.read_exact(ln[0], timeout_ms=300) if ln[0] else b""
                if modes and not uploading:
                    modes.set_keys(keys)

            elif msg == MSG_SENSOR:
                _handle_sensor_req(mod)

            elif msg == MSG_LEGACY:
                if modes and not uploading:
                    modes.handle_legacy(mod)

            # tanınmayan bayt → yoksay (şeffaf mod çöpü olabilir)
        except Exception as e:
            print("[Boot] mesaj hatası:", e)
            try:
                mod.send(bytes([STATUS_ERROR]))
            except Exception:
                pass
            filename = None
            buffer = None
            uploading = False


def _save(filename, buffer, mod, bot=None):
    """Dosyayı yaz (tek çekirdek — güvenli). user_code.py ise resetle."""
    try:
        with open(filename, "wb") as f:
            f.write(buffer)
    except Exception:
        mod.send(bytes([STATUS_ERROR]))
        return
    mod.send(bytes([STATUS_SAVED]))
    if bot:
        if bot.matrix:
            bot.matrix.show('yes')
        bot.buzzer.beep(90, 1319)
        bot.buzzer.beep(140, 1760)
    if filename == "user_code.py":
        # SAVED baytı UART→modül→BLE yolunu tamamlasın, sonra temiz reset.
        # MAGIC_FAST: modül canlı → açılışta AT yapılandırması atlanır,
        # tarayıcı bağlantısı korunur.
        time.sleep_ms(450)
        _scratch_write(MAGIC_FAST)
        machine.reset()
    # Kütüphane dosyaları: reset YOK — "Modülleri Yükle" zinciri bozulmasın.
    # Zincirin sonunda tarayıcı MSG_RESET gönderir.


# ============================================================
#  GÖZCÜ — çekirdek-1, kullanıcı kodu koşarken. ASLA flash'a yazmaz!
# ============================================================
# USB tarafı flash'a yazmadan önce bu bayrağı True yapar (raw REPL'den
# `_watch_stop = True`) — gözcü çekirdek-1'den çekilir.
_watch_stop = False


def _watcher(mod):
    while not _watch_stop:
        b = mod.read_exact(1, timeout_ms=400)
        if b is None:
            continue
        c = b[0]
        if c == MSG_PING:
            mod.send(bytes([STATUS_READY_V2]))
        elif c == MSG_BEGIN:
            # Yükleme isteği: flash'a burada DOKUNMA. Tarayıcıya
            # "yeniden başlıyorum" de, SCRATCH'e işaret koy, resetle.
            mod.send(bytes([STATUS_REBOOTING]))
            time.sleep_ms(150)          # bayt hattı tamamlasın
            _scratch_write(MAGIC_UPLOAD)
            machine.reset()
        elif c == MSG_STOP:
            mod.send(bytes([STATUS_REBOOTING]))
            time.sleep_ms(120)
            _scratch_write(MAGIC_NORUN)
            machine.reset()
        elif c == MSG_RESET:
            time.sleep_ms(120)
            machine.reset()
        elif c == MSG_SENSOR:
            # Pil rozeti + sensör paneli kod koşarken de çalışsın.
            # Flash'a dokunmaz → çekirdek-1'de güvenli.
            try:
                _handle_sensor_req(mod)
            except Exception:
                pass
        elif c == MSG_KEY:
            # Tuş verisini akıştan temizle (kod koşarken sürüş gözcüde yapılmaz)
            ln = mod.read_exact(1, timeout_ms=200)
            if ln is not None and ln[0]:
                mod.read_exact(ln[0], timeout_ms=200)
        # diğer baytlar (yarım kalmış akış çöpü) → yoksay


# ============================================================
#  Kullanıcı kodu (çekirdek-0)
# ============================================================
def _run_user_code():
    try:
        print("[Boot] user_code.py çalıştırılıyor...")
        with open("user_code.py") as f:
            code = f.read()
        exec(code, {"__name__": "__main__"})
        print("[Boot] user_code.py bitti — robot boşta, BLE dinleniyor")
    except Exception as e:
        print("[Boot] user_code.py HATA:", e)
    # KeyboardInterrupt (USB Ctrl-C) bilerek YAKALANMAZ → REPL'e düşer.


# ============================================================
#  BAŞLANGIÇ
# ============================================================
print("BerryBot — BLE bootloader v4.1 başlıyor...")
print("__RX_BOOT__ berry v4.1")
_magic = _scratch_read()
_scratch_write(0)   # işaret tek kullanımlık
_name = _read_device_name()

_mod = BleUartModule()
if _magic in (MAGIC_UPLOAD, MAGIC_NORUN, MAGIC_FAST):
    # Bu açılışa bir BLE mesajı sebep oldu → modül canlı, yapılandırılmış
    # ve şeffaf modda. Tekrar AT göndermek hem yavaş hem bağlantıyı bozar.
    print("[BLE] Hızlı açılış — modül yapılandırması atlandı")
    _mod.flush_rx()
    # Ucuz sigorta: şeffaf mod gerçekten açık mı? Değilse düzelt.
    if not _mod.ensure_transparent(max_tries=2):
        print("[BLE] Sıcak açılışta şeffaf mod kayıptı — yeniden yapılandırılıyor")
        _mod.configure(_name)
else:
    print("[BLE] Cihaz adı:", _name, "— modül yapılandırılıyor...")
    time.sleep_ms(1500)         # soğuk açılışta modülün açılmasını bekle
    _mod.configure(_name)

if _magic == MAGIC_UPLOAD:
    _idle_mode(_mod, forever=not _has_user_code())       # tek çekirdek
elif _magic == MAGIC_NORUN:
    print("[Boot] Durduruldu — kod otomatik başlatılmayacak")
    _idle_mode(_mod, forever=True)                       # tek çekirdek
elif _has_user_code():
    # USB PENCERESİ (v4.1): bilgisayar bağlı ve RoboExx uygulaması
    # konuşuyorsa (reset sonrası uygulama 100 ms'de bir poke gönderir)
    # kullanıcı kodunu VE core1 gözcüsünü HİÇ başlatma — REPL boş kalsın.
    # Neden kritik: core1'de gözcü koşarken friendly REPL'de Ctrl-D (soft
    # reset) RP2040'ta SONSUZA DEK bloklanır → kart seri hatta ölür ve tek
    # çare fiziksel RESET olurdu. USB'de core1'i hiç doğurmayarak bu tuzak
    # kökten kapanır. (Uygulamanın poke'u Ctrl-C ise KeyboardInterrupt
    # script'i burada keser — sonuç aynı: temiz, boş REPL. Bu yüzden
    # KeyboardInterrupt bilerek YAKALANMAZ.)
    # Pil ile açılışta (USB yok) pencere 1.5 sn sessiz geçer, robot normal
    # başlar — BLE kullanıcıları etkilenmez.
    _usb_pc = False
    try:
        import select as _sel
        import sys as _sys
        _p = _sel.poll()
        _p.register(_sys.stdin, _sel.POLLIN)
        _t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), _t0) < 1500:
            if _p.poll(50):
                try:
                    _sys.stdin.read(1)
                except Exception:
                    pass
                while _p.poll(5):
                    try:
                        _sys.stdin.read(1)
                    except Exception:
                        break
                _usb_pc = True
                break
    except Exception:
        pass
    if _usb_pc:
        print("[Boot] USB aktivitesi — kullanıcı kodu başlatılmadı, REPL açık")
        print("__RX_REPL__")
        # Script burada biter → MicroPython REPL'i uygulamaya kalır.
    else:
        # ÇALIŞMA MODU: gözcü çekirdek-1'de, kullanıcı kodu çekirdek-0'da.
        try:
            _thread.start_new_thread(_watcher, (_mod,))
            print("[BLE] Gözcü aktif — kod çalışırken bile yükleme yapılabilir")
        except Exception as e:
            print("[BLE] Gözcü başlatılamadı:", e)
        _run_user_code()
        # Kod bitti/çöktü → boşta bekle (yeniden başlatma YOK). Gözcü hâlâ
        # dinliyor; yeni yükleme gelirse yükleme moduna resetler.
        while True:
            time.sleep_ms(500)
else:
    # Hiç kod yok → doğrudan boşta modunda süresiz dinle (tek çekirdek)
    _idle_mode(_mod, forever=True)
