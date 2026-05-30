# ============================================================
# RoboExx Pico W — BLE Boot Loader
# ------------------------------------------------------------
# Bu dosya Pico'ya `main.py` olarak yüklenir. Açılışta:
#   1) BLE GATT server başlatılır (IRQ tabanlı, her zaman aktif)
#   2) user_code.py varsa import edilip çalıştırılır
#
# Tarayıcı BLE üzerinden yeni kod gönderince:
#   1) Yükleme göstergesi (OLED + RGB)
#   2) user_code.py olarak yazılır
#   3) machine.reset() — cihaz yeniden başlar, yeni kod yüklenir
#
# Sürüm: 1.0.0
# ============================================================

import bluetooth
import struct
import time
import machine
import os
import micropython
from micropython import const

# RoboExx BLE Servis UUID'leri (RoboExx için özel üretilmiş)
_UART_SERVICE_UUID = bluetooth.UUID('6E400001-B5A3-F393-E0A9-E50E24DCCA9E')
_UART_RX_CHAR_UUID = bluetooth.UUID('6E400002-B5A3-F393-E0A9-E50E24DCCA9E')  # write
_UART_TX_CHAR_UUID = bluetooth.UUID('6E400003-B5A3-F393-E0A9-E50E24DCCA9E')  # notify

# BLE IRQ event sabitleri
_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

# BLE advertising flags
_FLAG_READ = const(0x0002)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)
_FLAG_WRITE = const(0x0008)
_FLAG_NOTIFY = const(0x0010)

# Protokol mesaj tipleri (1 bayt header)
MSG_BEGIN = 0x01   # yeni dosya başla: name_len(1) + name + total_size(4)
MSG_CHUNK = 0x02   # dosya parçası: offset(4) + data
MSG_END   = 0x03   # bitir, kaydet, reset
MSG_PING  = 0x04   # bağlantı testi
MSG_RESET = 0x05   # Pico'yu yeniden başlat (kullanıcı kodu çıkmak istiyorsa)
MSG_KEY   = 0x06   # klavye durumu: basılı tuşların ASCII string'i (örn "wa")
MSG_SENSOR_REQ = 0x07  # sensör değer talebi: payload = sensör listesi (struct)
MSG_SENSOR_REPLY = 0x14  # sensör değer cevabı: değerler (struct)

# Sensör tipleri (MSG_SENSOR_REQ payload'ında her sensör 4 byte: tip + pin1 + pin2 + ek)
SENSOR_DIGITAL = 0x01    # tek pin, 0/1 — line follower, buton
SENSOR_ANALOG = 0x02     # ADC pin (26-28) — LDR, potansiyometre
SENSOR_ULTRASONIC = 0x03 # trig + echo pin
SENSOR_TEMP_INTERNAL = 0x04  # dahili sıcaklık (pin yok)


def _measure_ultrasonic(trig_pin, echo_pin, timeout_us=30000):
    """Tek bir ultrasonik okuma yap, mm cinsinden döner. Timeout = 0xFFFF."""
    try:
        import machine, time
        trig = machine.Pin(trig_pin, machine.Pin.OUT)
        echo = machine.Pin(echo_pin, machine.Pin.IN)
        trig.value(0)
        time.sleep_us(2)
        trig.value(1)
        time.sleep_us(10)
        trig.value(0)
        # HIGH süresini ölç
        dur = machine.time_pulse_us(echo, 1, timeout_us)
        if dur < 0:
            return 0xFFFF  # zaman aşımı / yansıma yok
        # mm: dur (us) * 0.343 / 2  (ses hızı 343 m/s = 0.343 mm/us)
        mm = int(dur * 0.343 / 2)
        return min(mm, 65000)
    except Exception:
        return 0xFFFB

# Tarayıcıya bildirilecek durum kodları
STATUS_READY = 0x10
STATUS_RECEIVING = 0x11
STATUS_SAVED = 0x12
STATUS_ERROR = 0x13


def advertising_payload(name="RoboExx-Pico"):
    """
    Birincil reklam paketi — sadece flags + cihaz adı.
    31 byte sınırı: 3 (flags) + 14 (name 'RoboExx-Pico') = 17 byte. ✓
    UUID burada YOK — scan response'a koyduk.
    """
    payload = bytearray()
    def _append(adv_type, value):
        nonlocal payload
        payload += struct.pack("BB", len(value) + 1, adv_type) + value
    _append(0x01, struct.pack("B", 0x06))    # Flags: LE General Discoverable
    _append(0x09, name.encode())              # Cihaz adı (Complete Local Name)
    return payload


def scan_response_payload(service_uuid):
    """
    Scan response paketi — sadece 128-bit servis UUID.
    Tarayıcı namePrefix ile birincil paketten cihazı bulur, sonra
    scan response ile UUID'yi doğrular ve bağlanabilir.
    """
    payload = bytearray()
    b = bytes(service_uuid)
    if len(b) == 16:
        payload += struct.pack("BB", 17, 0x07) + b  # Complete List of 128-bit UUIDs
    return payload


class BLEUart:
    """BLE üzerinden UART benzeri veri alışverişi.

    write() ile parça parça veri alır, _on_complete callback'i tetikler
    dosya yazıldığında.
    """

    def __init__(self, ble, name="RoboExx-Pico"):
        self._ble = ble
        self._ble.active(True)
        self._ble.config(gap_name=name)
        self._ble.irq(self._irq)

        # GATT servis tanımla
        services = (
            (_UART_SERVICE_UUID, (
                (_UART_TX_CHAR_UUID, _FLAG_READ | _FLAG_NOTIFY),
                (_UART_RX_CHAR_UUID, _FLAG_WRITE | _FLAG_WRITE_NO_RESPONSE),
            )),
        )
        ((self._tx_handle, self._rx_handle),) = self._ble.gatts_register_services(services)
        # RX buffer — gelen veri için. append=False (her yazma yeni veridir),
        # 256 bayt yeterli (chunk'larımız max 200 bayt). 512+True macOS'ta
        # MTU pazarlığı sırasında servis keşfini bozabiliyor.
        self._ble.gatts_set_buffer(self._rx_handle, 256, False)

        # Reklamı başlat — birincil paket (flags+name) ve scan response (UUID)
        # 31 byte sınırı aşılmasın diye ikiye böldük.
        self._adv_payload = advertising_payload(name=name)
        self._scan_payload = scan_response_payload(_UART_SERVICE_UUID)
        self._connections = set()
        self._advertise()

        # Dosya alma state
        self._filename = None
        self._total_size = 0
        self._buffer = None
        self._received_bytes = 0
        self._show_progress = None  # callback (received, total)
        self._on_complete = None    # callback (filename)
        self._on_error = None       # callback (message)
        # MSG_END IRQ -> ana thread'e ertelemek için
        self._save_pending = False
        self._save_conn = None
        # MSG_SENSOR_REQ IRQ -> ana thread'e ertelemek için
        self._sensor_req_pending = None
        self._sensor_req_conn = None

    def set_callbacks(self, show_progress=None, on_complete=None, on_error=None):
        """Yükleme aşamalarında dış kodu bilgilendir."""
        self._show_progress = show_progress
        self._on_complete = on_complete
        self._on_error = on_error

    def _advertise(self, interval_us=500000):
        self._ble.gap_advertise(
            interval_us,
            adv_data=self._adv_payload,
            resp_data=self._scan_payload,
        )

    def _do_save(self, _arg):
        """
        Ana thread'de çalışır (micropython.schedule ile çağrılır).
        Dosyayı flash'a yazar, sync'ler, STATUS_SAVED gönderir, callback'i tetikler.
        IRQ context'inde yazma yapmak BLE stack'i bozar — bu yüzden buradayız.
        """
        if not self._save_pending:
            return
        self._save_pending = False
        conn_handle = self._save_conn
        # State'i hemen al, sıfırla (yarış önlemi)
        filename = self._filename
        buffer = self._buffer
        total_size = self._total_size
        self._buffer = None
        self._filename = None
        self._total_size = 0
        self._received_bytes = 0

        if buffer is None or filename is None:
            try: self._send(conn_handle, bytes([STATUS_ERROR]))
            except Exception: pass
            return

        try:
            with open(filename, 'wb') as f:
                f.write(buffer)
            # Flash sync — yazımın gerçekten flash'a indiğinden emin ol
            try:
                os.sync()
            except AttributeError:
                pass
            # Doğrula
            try:
                sz = os.stat(filename)[6]
                print("[BLE] Dosya kaydedildi:", filename, "boyut:", sz, "/", len(buffer))
                if sz != len(buffer):
                    print("[BLE] UYARI: yazılan boyut uyumsuz!")
            except Exception as _ve:
                print("[BLE] UYARI: doğrulama hatası:", _ve)
            # STATUS_SAVED gönder — App reset bekliyor
            try:
                self._send(conn_handle, bytes([STATUS_SAVED]))
            except Exception as _se:
                print("[BLE] STATUS_SAVED gönderme hatası:", _se)
            if self._show_progress:
                try: self._show_progress(total_size, total_size, 'saved')
                except Exception: pass
            if self._on_complete:
                try: self._on_complete(filename)
                except Exception as _ce: print("[BLE] on_complete hata:", _ce)
        except Exception as e:
            print("[BLE] END kaydetme hata:", e)
            try: self._send(conn_handle, bytes([STATUS_ERROR]))
            except Exception: pass
            if self._on_error:
                try: self._on_error(str(e))
                except Exception: pass

    def _do_read_sensors(self, _arg):
        """
        Ana thread'de çalışır. Tarayıcıdan gelen sensör listesini okur,
        her sensör için 2 byte değer (uint16 LE) gönderir.

        Sensör tipleri:
          0x01 SENSOR_DIGITAL    — pin1 = GP pin, 0 veya 1
          0x02 SENSOR_ANALOG     — pin1 = ADC pin (26-28), 0-65535
          0x03 SENSOR_ULTRASONIC — pin1 = trig, pin2 = echo, mm cinsinden mesafe
          0x04 SENSOR_TEMP_INT   — pin yok, dahili sıcaklık × 100
        """
        if not self._sensor_req_pending:
            return
        req = self._sensor_req_pending
        conn = self._sensor_req_conn
        self._sensor_req_pending = None
        if conn is None:
            return

        try:
            import machine
        except Exception:
            return

        # Cevap: [STATUS_REPLY_TAG: 0x14][n sensör × 2 byte]
        reply = bytearray([MSG_SENSOR_REPLY])
        i = 0
        while i + 2 < len(req):
            stype = req[i]
            pin1 = req[i+1]
            pin2 = req[i+2]
            value = 0xFFFF  # default = "okunamadı" işaretçisi
            try:
                if stype == SENSOR_DIGITAL:
                    p = machine.Pin(pin1, machine.Pin.IN, machine.Pin.PULL_UP)
                    value = p.value()  # 0 veya 1
                elif stype == SENSOR_ANALOG:
                    if pin1 < 26 or pin1 > 29:
                        value = 0xFFFE
                    else:
                        adc = machine.ADC(pin1)
                        value = adc.read_u16()  # 0-65535
                elif stype == SENSOR_ULTRASONIC:
                    value = _measure_ultrasonic(pin1, pin2)
                elif stype == SENSOR_TEMP_INTERNAL:
                    adc = machine.ADC(4)
                    raw = adc.read_u16()
                    volt = raw * 3.3 / 65535
                    temp = 27 - (volt - 0.706) / 0.001721
                    value = max(0, min(65535, int(temp * 100)))
                else:
                    value = 0xFFFD
            except Exception:
                value = 0xFFFC
            reply.append(value & 0xFF)
            reply.append((value >> 8) & 0xFF)
            i += 3

        try:
            self._send(conn, bytes(reply))
        except Exception as e:
            print("[BLE] sensör cevap gönderme hatası:", e)

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            conn_handle, _, _ = data
            self._connections.add(conn_handle)
            print("[BLE] Bağlandı:", conn_handle)
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn_handle, _, _ = data
            self._connections.discard(conn_handle)
            print("[BLE] Koptu:", conn_handle)
            self._advertise()
        elif event == _IRQ_GATTS_WRITE:
            conn_handle, value_handle = data
            if value_handle == self._rx_handle:
                self._handle_rx(conn_handle)

    def _send(self, conn_handle, data):
        """Tarayıcıya notify gönder (status update)."""
        try:
            self._ble.gatts_notify(conn_handle, self._tx_handle, data)
        except Exception as e:
            print("[BLE] notify hata:", e)

    def _handle_rx(self, conn_handle):
        """RX karakteristiğine yazılan veriyi al ve işle."""
        data = self._ble.gatts_read(self._rx_handle)
        if not data or len(data) < 1:
            return
        msg_type = data[0]

        if msg_type == MSG_PING:
            self._send(conn_handle, bytes([STATUS_READY]))
            return

        if msg_type == MSG_RESET:
            # Tarayıcı Pico'yu yeniden başlatmak istiyor
            print("[BLE] RESET komutu alındı")
            time.sleep_ms(100)
            machine.reset()
            return

        if msg_type == MSG_KEY:
            # data: [0x06][basılı tuşların ASCII byte'ları]
            # IRQ context — minimal iş. roboexx boot'ta pre-load edildiği için
            # bu import anlık (modül cache).
            try:
                keys_str = bytes(data[1:]).decode('ascii', 'ignore')
                if _roboexx_ref is not None:
                    _roboexx_ref.set_pressed_keys(keys_str)
            except Exception:
                pass
            return

        if msg_type == MSG_SENSOR_REQ:
            # data: [0x07][sensör listesi: her sensör 3 byte (type, pin1, pin2)]
            # IRQ context — sensör okumak biraz zaman alır, schedule ile ana thread'e
            self._sensor_req_pending = bytes(data[1:])
            self._sensor_req_conn = conn_handle
            try:
                micropython.schedule(self._do_read_sensors, 0)
            except Exception:
                pass
            return

        if msg_type == MSG_BEGIN:
            # data: [type(1)][name_len(1)][name][total_size(4)]
            try:
                name_len = data[1]
                self._filename = data[2:2 + name_len].decode()
                self._total_size = struct.unpack("<I", data[2 + name_len:2 + name_len + 4])[0]
                self._buffer = bytearray(self._total_size)
                self._received_bytes = 0
                print("[BLE] Yeni dosya:", self._filename, "boyut:", self._total_size)
                self._send(conn_handle, bytes([STATUS_RECEIVING]))
                if self._show_progress:
                    self._show_progress(0, self._total_size, 'begin')
            except Exception as e:
                print("[BLE] BEGIN hata:", e)
                self._send(conn_handle, bytes([STATUS_ERROR]))
            return

        if msg_type == MSG_CHUNK:
            # data: [type(1)][offset(4)][chunk_data]
            if self._buffer is None:
                self._send(conn_handle, bytes([STATUS_ERROR]))
                return
            try:
                offset = struct.unpack("<I", data[1:5])[0]
                chunk = data[5:]
                end = offset + len(chunk)
                if end > self._total_size:
                    raise ValueError("chunk taşması")
                self._buffer[offset:end] = chunk
                self._received_bytes += len(chunk)
                if self._show_progress:
                    self._show_progress(self._received_bytes, self._total_size, 'chunk')
            except Exception as e:
                print("[BLE] CHUNK hata:", e)
                self._send(conn_handle, bytes([STATUS_ERROR]))
            return

        if msg_type == MSG_END:
            # IRQ context'inde dosya yazımı YAPAMAYIZ — uzun sürer, BLE stack
            # bozulur. Yazma işini ana thread'e ertele. STATUS'u da ana thread
            # gönderecek.
            if self._buffer is None or self._filename is None:
                self._send(conn_handle, bytes([STATUS_ERROR]))
                return
            # Yazma için gerekli state'i kopyala (callback temizleyecek)
            self._save_pending = True
            self._save_conn = conn_handle
            try:
                micropython.schedule(self._do_save, 0)
            except Exception as _se:
                # schedule kuyruğu doluysa direkt çağır (IRQ'da risk)
                print("[BLE] schedule başarısız, direkt çağırılıyor:", _se)
                self._do_save(0)


# ============================================================
# Yükleme göstergesi (OLED + RGB) — opsiyonel, roboexx.py yüklüyse
# ============================================================

_ind_oled = None
_ind_rgb = None


def _init_indicators():
    """Görsel göstergeler için roboexx kütüphanesini yüklemeyi dene."""
    global _ind_oled, _ind_rgb
    try:
        import roboexx
        _ind_oled = roboexx
        _ind_rgb = roboexx
    except Exception:
        pass


def _show_upload_progress(received, total, phase):
    """Yükleme sırasında OLED + RGB göstergesi."""
    if _ind_oled is None:
        return
    try:
        if phase == 'begin':
            # OLED hazırla — varsa
            if hasattr(_ind_oled, 'oled') and _ind_oled.oled:
                _ind_oled.oled_clear()
                _ind_oled.oled_text('Kod yukleniyor', align='TOPCENTER', y=8, size=1)
                _ind_oled.oled_show()
            # RGB başlat — yoksa default pin 6, 8 LED
            if hasattr(_ind_rgb, '_np') and _ind_rgb._np is None:
                try:
                    _ind_rgb.rgb_init(6, 8)
                except Exception:
                    pass
        elif phase == 'chunk':
            pct = int((received / total) * 100) if total else 0
            # OLED progress bar
            if hasattr(_ind_oled, 'oled') and _ind_oled.oled:
                _ind_oled.oled_clear()
                _ind_oled.oled_text('Kod yukleniyor', align='TOPCENTER', y=8, size=1)
                _ind_oled.oled_text('{}%'.format(pct), align='CENTER', size=2)
                # Progress bar
                bar_w = int(108 * received / total) if total else 0
                _ind_oled.oled.rect(10, 50, 108, 8, 1)
                _ind_oled.oled.fill_rect(10, 50, bar_w, 8, 1)
                _ind_oled.oled_show()
            # RGB KITT animasyonu — mor (R=180, G=0, B=255)
            _rgb_kitt(received)
        elif phase == 'saved':
            # OLED "Yüklendi!"
            if hasattr(_ind_oled, 'oled') and _ind_oled.oled:
                _ind_oled.oled_clear()
                _ind_oled.oled_text('Yuklendi!', align='CENTER', size=2)
                _ind_oled.oled_show()
            # RGB tüm LED mor yan
            if hasattr(_ind_rgb, '_np') and _ind_rgb._np is not None:
                _ind_rgb.rgb_set_all(180, 0, 255)
    except Exception as e:
        print("[BLE] gösterge hata:", e)


_kitt_step = 0


def _rgb_kitt(received):
    """KITT/Knight Rider efekti — soldan sağa kayan mor LED."""
    global _kitt_step
    if not hasattr(_ind_rgb, '_np') or _ind_rgb._np is None:
        return
    n = len(_ind_rgb._np)
    if n == 0:
        return
    _kitt_step = (_kitt_step + 1) % (n * 2)
    pos = _kitt_step if _kitt_step < n else (2 * n - 1 - _kitt_step)
    for i in range(n):
        # Mesafe arttıkça parlaklık azalır (3 LED'lik kuyruk)
        dist = abs(i - pos)
        if dist == 0:
            _ind_rgb._np[i] = (180, 0, 255)
        elif dist == 1:
            _ind_rgb._np[i] = (80, 0, 120)
        elif dist == 2:
            _ind_rgb._np[i] = (20, 0, 30)
        else:
            _ind_rgb._np[i] = (0, 0, 0)
    _ind_rgb._np.write()


def _cleanup_indicators():
    """OLED ve RGB'yi temizle — kullanıcı kodu temiz başlasın."""
    try:
        if _ind_oled and hasattr(_ind_oled, 'oled') and _ind_oled.oled:
            _ind_oled.oled_clear()
            _ind_oled.oled_show()
    except Exception:
        pass
    try:
        if _ind_rgb and hasattr(_ind_rgb, '_np') and _ind_rgb._np is not None:
            for i in range(len(_ind_rgb._np)):
                _ind_rgb._np[i] = (0, 0, 0)
            _ind_rgb._np.write()
    except Exception:
        pass


# ============================================================
# Ana akış
# ============================================================

def _do_reset(_arg=None):
    """Asenkron reset — IRQ dışında, ana thread'de çalışır."""
    try:
        _cleanup_indicators()
    except Exception:
        pass
    # KRİTİK: flash sync'in kesin tamamlanması için 1sn bekle.
    # Aksi halde machine.reset() flash yazımının ortasında olabilir
    # ve user_code.py kaybolur.
    print("[BLE] Reset hazırlanıyor (flash sync bekleniyor)...")
    time.sleep_ms(1000)
    try:
        os.sync()
    except AttributeError:
        pass
    print("[BLE] Reset ediliyor, yeni kod yüklenecek...")
    machine.reset()


def _on_user_code_received(filename):
    """
    user_code yazıldı → reset planlanır.
    Bu fonksiyon BLE IRQ context'inde çağrılır; uzun iş yapmak yasak.
    micropython.schedule ile reset'i ana thread'e ertele.
    """
    print("[BLE] user_code.py kaydedildi, reset planlanıyor")
    try:
        micropython.schedule(_do_reset, 0)
    except Exception:
        # schedule kuyruğu doluysa direkt çağır (son çare)
        _do_reset()


def _read_device_name():
    """
    device_name.txt'den cihaz adını oku.
    Dosya yoksa veya okuma hatası → varsayılan 'RoboExx-Pico'.

    BLE advertising payload 31 byte sınırı:
      Flags (3) + Name header (2) = 5 byte tükendi
      Kalan name byte sayısı: 31 - 5 = 26 byte max
    Türkçe karakterler UTF-8'de 2 byte olduğu için ASCII'ye dönüştürüp
    byte uzunluğuna göre kırpıyoruz. Aksi halde advertising paketi sınırı
    aşar, servis keşfi macOS'ta bozulur.
    """
    # Türkçe karakter → ASCII karşılığı
    tr_map = {
        'ı':'i','İ':'I','ğ':'g','Ğ':'G','ü':'u','Ü':'U',
        'ş':'s','Ş':'S','ö':'o','Ö':'O','ç':'c','Ç':'C',
        '\u2019':"'", '\u2018':"'", '\u201C':'"', '\u201D':'"',
    }
    def _ascii_safe(s):
        out = ''
        for ch in s:
            if ch in tr_map:
                out += tr_map[ch]
            elif ord(ch) < 128:
                out += ch
            # 128+ ve map'te yoksa: at
        return out

    try:
        with open('device_name.txt', 'r') as f:
            name = f.read().strip()
        if name:
            name = _ascii_safe(name)
            # Byte uzunluğuna göre kırp (max 26)
            enc = name.encode('utf-8')
            if len(enc) > 26:
                enc = enc[:26]
                name = enc.decode('utf-8', 'ignore')
            return name if name else "RoboExx-Pico"
    except Exception:
        pass
    return "RoboExx-Pico"


def _start_ble():
    """BLE bootloader başlat."""
    _init_indicators()
    ble = bluetooth.BLE()
    device_name = _read_device_name()
    print("[BLE] Cihaz adı:", device_name)
    uart = BLEUart(ble, name=device_name)
    uart.set_callbacks(
        show_progress=_show_upload_progress,
        on_complete=_on_user_code_received,
    )
    print("[BLE] RoboExx Pico W advertising başladı")
    return uart


def _run_user_code_body(code_str):
    """Verilen kod string'ini exec ile çalıştırır. Her thread'den çağrılabilir."""
    try:
        print("[Boot] user_code.py çalıştırılıyor...")
        exec(code_str, {'__name__': '__main__'})
        print("[Boot] user_code.py BİTTİ (normal çıkış)")
    except Exception as e:
        print("=" * 50)
        print("[Boot] user_code.py HATA:")
        import sys
        sys.print_exception(e)
        print("=" * 50)
        try:
            from machine import Pin
            led = Pin('LED', Pin.OUT) if hasattr(Pin, 'board') else Pin(25, Pin.OUT)
            for _ in range(6):
                led.value(1); time.sleep_ms(120)
                led.value(0); time.sleep_ms(120)
        except Exception:
            pass


def _run_user_code():
    """user_code.py varsa core0'da çalıştır (geriye uyumluluk için)."""
    try:
        os.stat('user_code.py')
    except OSError:
        print("[Boot] user_code.py yok, sadece BLE dinleniyor")
        return
    with open('user_code.py') as f:
        code = f.read()
    _run_user_code_body(code)


def _run_user_code_on_core1():
    """
    user_code.py'yi Pico W'nin İKİNCİ çekirdeğinde (core1) çalıştırır.
    KRİTİK: dosyayı core0'da oku, içeriği core1 thread'ine string olarak ver.
    İki ayrı os.stat / open çağrısı arasında littlefs cache race yaşanmasın diye.
    """
    try:
        import _thread
    except ImportError:
        print("[Boot] _thread yok, kullanıcı kodu core0'da çalışacak (BLE yavaşlayabilir)")
        _run_user_code()
        return
    # KRİTİK: dosyayı core0'da OKU. Eğer flash'ta gerçekten yoksa, burada hata gelir.
    try:
        with open('user_code.py') as f:
            code = f.read()
    except OSError:
        print("[Boot] user_code.py yok, sadece BLE dinleniyor")
        return
    print("[Boot] user_code.py CORE1'de çalıştırılıyor (boyut:", len(code), "byte)")
    try:
        _thread.start_new_thread(_run_user_code_body, (code,))
    except Exception as e:
        print("[Boot] core1 başlatma HATA:", e, "— core0'a düşülüyor")
        _run_user_code_body(code)


# ============================================================
# BAŞLANGIÇ
# ============================================================

print("RoboExx Pico W — BLE bootloader başlıyor...")

# roboexx kütüphanesini boot'ta pre-load et — MSG_KEY IRQ handler'ı bunu
# cache'ten alacak (anlık). roboexx yüklenmemişse klavye desteği devre dışı,
# her şey eskisi gibi çalışır.
_roboexx_ref = None
try:
    import roboexx as _roboexx_ref
    print("[Boot] roboexx kütüphanesi yüklendi (klavye desteği aktif)")
except Exception as _re:
    print("[Boot] roboexx kütüphanesi yok — klavye desteği devre dışı:", _re)

_uart = _start_ble()

# USB SERİ AKTİVİTE TESPİTİ — başlangıçta 2 saniye dinle.
# Bilgisayar bağlıysa ve uygulama (Modülleri Yükle vs.) Ctrl-C gönderiyorsa
# stdin'de byte birikir. Bu durumda user_code'u BAŞLATMA — Pico REPL'e
# açık kalsın, USB upload sorunsuz çalışsın.
# USB takılı değilse 2sn sessizce geçer, user_code core1'de başlar (BLE modu).
_skip_user_code = False
try:
    import select
    import sys
    print("[Boot] USB aktivite kontrolü (2 sn)...")
    _poll = select.poll()
    _poll.register(sys.stdin, select.POLLIN)
    _t0 = time.ticks_ms()
    while time.ticks_diff(time.ticks_ms(), _t0) < 2000:
        if _poll.poll(50):  # 50ms timeout
            # USB'den byte geldi — bilgisayar bağlı ve aktif
            _ = sys.stdin.read(1)
            # Kalan byte'ları da yut ki REPL'i karıştırmasın
            while _poll.poll(10):
                try: sys.stdin.read(1)
                except: break
            _skip_user_code = True
            print("[Boot] USB aktivitesi tespit edildi — user_code BAŞLATILMIYOR")
            print("[Boot] Pico REPL'de hazır, uygulama upload yapabilir")
            break
except Exception as _e:
    print("[Boot] USB tespiti atlandı:", _e)

if not _skip_user_code:
    print("BLE aktif, kullanıcı kodu core1'de başlatılıyor...")
    _run_user_code_on_core1()
    print("[Boot] BLE bekleme moduna geçildi (core0)")
    # Core0: USB seri stdin'den klavye mesajlarını dinle.
    # Protokol: \x06 + ASCII tuşlar + \n  (örn b"\x06wa\n")
    # Tarayıcı her 50ms gönderir. Diğer baytlar yutulur (REPL karışmasın).
    try:
        import select as _select
        import sys as _sys
        _kbp = _select.poll()
        _kbp.register(_sys.stdin, _select.POLLIN)
        _kb_buf = ''
        _kb_in_msg = False
        while True:
            evs = _kbp.poll(500)  # 500ms timeout
            if not evs:
                continue
            try:
                ch = _sys.stdin.read(1)
            except Exception:
                continue
            if not ch:
                continue
            if ch == '\x06':
                # MSG_KEY başlangıcı
                _kb_in_msg = True
                _kb_buf = ''
            elif _kb_in_msg:
                if ch == '\n':
                    # mesaj bitti
                    if _roboexx_ref is not None:
                        try:
                            _roboexx_ref.set_pressed_keys(_kb_buf)
                        except Exception:
                            pass
                    _kb_in_msg = False
                    _kb_buf = ''
                else:
                    if len(_kb_buf) < 32:
                        _kb_buf += ch
            # else: REPL bytes — yut (kullanıcının yazıp duracağı yok zaten)
    except Exception as _kbe:
        print("[Boot] USB klavye dinleyici hata:", _kbe)
        while True:
            time.sleep(1)
else:
    # USB modu — script çık, MicroPython REPL'e dönsün
    print("[Boot] Script çıkıyor, REPL açık")
