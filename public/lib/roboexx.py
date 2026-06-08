# ============================================================
# RoboExx Pico W Kütüphanesi
# ------------------------------------------------------------
# Tek dosya — RoboExx blok tabanlı programlama uygulaması
# tarafından üretilen kodlar bu kütüphaneyi kullanır.
#
# İçerik:
#   - ssd1306 OLED driver (gömülü, MicroPython resmi sürümü)
#   - OLED yazı + şekil + göz çizim helper'ları
#   - NeoPixel init helper
#   - Ultrasonik mesafe ölçer
#   - Pico W dahili sıcaklık sensörü
#   - PWM önbelleği (servo, buzzer, motor için)
#   - Map fonksiyonu (Arduino map)
#
# Yükleme:
#   RoboExx uygulamasında "Modülleri Yükle" butonu ile Pico'ya
#   otomatik aktarılır. Manuel yükleme için Thonny/mpremote ile
#   bu dosyayı /roboexx.py olarak Pico'nun köküne kopyala.
#
# Sürüm: 1.0.0
# ============================================================

__version__ = "1.0.0"

from machine import Pin, ADC, PWM, I2C
import time
import framebuf

# ============================================================
# SSD1306 OLED DRIVER (gömülü — MicroPython resmi sürümü)
# https://github.com/micropython/micropython-lib
# ============================================================

# Register tanımları
_SET_CONTRAST = const(0x81)
_SET_ENTIRE_ON = const(0xA4)
_SET_NORM_INV = const(0xA6)
_SET_DISP = const(0xAE)
_SET_MEM_ADDR = const(0x20)
_SET_COL_ADDR = const(0x21)
_SET_PAGE_ADDR = const(0x22)
_SET_DISP_START_LINE = const(0x40)
_SET_SEG_REMAP = const(0xA0)
_SET_MUX_RATIO = const(0xA8)
_SET_COM_OUT_DIR = const(0xC0)
_SET_DISP_OFFSET = const(0xD3)
_SET_COM_PIN_CFG = const(0xDA)
_SET_DISP_CLK_DIV = const(0xD5)
_SET_PRECHARGE = const(0xD9)
_SET_VCOM_DESEL = const(0xDB)
_SET_CHARGE_PUMP = const(0x8D)


class SSD1306(framebuf.FrameBuffer):
    def __init__(self, width, height, external_vcc):
        self.width = width
        self.height = height
        self.external_vcc = external_vcc
        self.pages = self.height // 8
        self.buffer = bytearray(self.pages * self.width)
        super().__init__(self.buffer, self.width, self.height, framebuf.MONO_VLSB)
        self.init_display()

    def init_display(self):
        for cmd in (
            _SET_DISP | 0x00,
            _SET_MEM_ADDR, 0x00,
            _SET_DISP_START_LINE | 0x00,
            _SET_SEG_REMAP | 0x01,
            _SET_MUX_RATIO, self.height - 1,
            _SET_COM_OUT_DIR | 0x08,
            _SET_DISP_OFFSET, 0x00,
            _SET_COM_PIN_CFG, 0x02 if self.height == 32 else 0x12,
            _SET_DISP_CLK_DIV, 0x80,
            _SET_PRECHARGE, 0x22 if self.external_vcc else 0xF1,
            _SET_VCOM_DESEL, 0x30,
            _SET_CONTRAST, 0xFF,
            _SET_ENTIRE_ON,
            _SET_NORM_INV,
            _SET_CHARGE_PUMP, 0x10 if self.external_vcc else 0x14,
            _SET_DISP | 0x01,
        ):
            self.write_cmd(cmd)
        self.fill(0)
        self.show()

    def poweroff(self):
        self.write_cmd(_SET_DISP | 0x00)

    def poweron(self):
        self.write_cmd(_SET_DISP | 0x01)

    def contrast(self, contrast):
        self.write_cmd(_SET_CONTRAST)
        self.write_cmd(contrast)

    def invert(self, invert):
        self.write_cmd(_SET_NORM_INV | (invert & 1))

    def show(self):
        x0 = 0
        x1 = self.width - 1
        if self.width == 64:
            x0 += 32
            x1 += 32
        self.write_cmd(_SET_COL_ADDR)
        self.write_cmd(x0)
        self.write_cmd(x1)
        self.write_cmd(_SET_PAGE_ADDR)
        self.write_cmd(0)
        self.write_cmd(self.pages - 1)
        self.write_data(self.buffer)


class SSD1306_I2C(SSD1306):
    def __init__(self, width, height, i2c, addr=0x3C, external_vcc=False):
        self.i2c = i2c
        self.addr = addr
        self.temp = bytearray(2)
        self.write_list = [b"\x40", None]
        super().__init__(width, height, external_vcc)

    def write_cmd(self, cmd):
        self.temp[0] = 0x80
        self.temp[1] = cmd
        self.i2c.writeto(self.addr, self.temp)

    def write_data(self, buf):
        self.write_list[1] = buf
        self.i2c.writevto(self.addr, self.write_list)


# ============================================================
# OLED YARDIMCILARI
# ============================================================

# ------------------------------------------------------------
# PAYLAŞIMLI I2C YÖNETİCİSİ
# ------------------------------------------------------------
# OLED, SHTC3 ve Motor sürücü v2 aynı I2C hattını paylaşır (GP4/GP5).
# Her biri ayrı I2C() nesnesi oluşturursa bus frekansı çakışır
# (OLED 400kHz ister, SHTC3/motor 100kHz). İkinci init bus'ı yeniden
# yapılandırır ve ilk aygıt bozuk çalışır (OLED yarım gösterir).
#
# Çözüm: bus başına TEK I2C nesnesi. İlk çağıran oluşturur, sonrakiler
# aynısını paylaşır. Ortak frekans 400kHz — OLED için gerekli, SHTC3
# ve motor sürücü de 400kHz'i sorunsuz kaldırır.
# ------------------------------------------------------------

_i2c_buses = {}  # bus_id -> I2C nesnesi


def get_i2c(sda_pin=4, scl_pin=5, bus=0, freq=400000):
    """
    Paylaşımlı I2C nesnesi döndür. Aynı bus için bir kez oluşturur,
    sonraki çağrılarda aynısını verir — frekans çakışması olmaz.
    """
    global _i2c_buses
    if bus not in _i2c_buses:
        _i2c_buses[bus] = I2C(bus, sda=Pin(sda_pin), scl=Pin(scl_pin), freq=freq)
    return _i2c_buses[bus]


# Global OLED referansı — rx_oled_init bu değişkene atar
oled = None


def oled_init(sda_pin, scl_pin, bus=0, width=128, height=64, addr=0x3C):
    """OLED başlatma. SDA/SCL pin numaraları, I2C bus, boyut, adres."""
    global oled
    i2c = get_i2c(sda_pin, scl_pin, bus)
    oled = SSD1306_I2C(width, height, i2c, addr=addr)
    oled.fill(0)
    oled.show()
    return oled


def oled_clear():
    """Tampondaki içeriği siler. show() ile ekrana yansıt."""
    if oled is None:
        return
    oled.fill(0)


def oled_show():
    """Tamponu ekrana yansıt."""
    if oled is None:
        return
    oled.show()


def oled_text(txt, x=0, y=0, size=1, align="TOPLEFT"):
    """
    Yazı çiz.
    Hizalama: TOPLEFT, CENTER, TOPCENTER, BOTTOMCENTER, TOPRIGHT
    Boyut: 1 (8x8), 2 (16x16), 3 (24x24)
    """
    if oled is None:
        return
    txt = str(txt)
    w_per_char = 8 * size
    h_per_char = 8 * size
    total_w = len(txt) * w_per_char
    sw, sh = oled.width, oled.height
    if align == "CENTER":
        x = (sw - total_w) // 2
        y = (sh - h_per_char) // 2
    elif align == "TOPCENTER":
        x = (sw - total_w) // 2
    elif align == "BOTTOMCENTER":
        x = (sw - total_w) // 2
        y = sh - h_per_char
    elif align == "TOPRIGHT":
        x = sw - total_w
    if size <= 1:
        oled.text(txt, x, y, 1)
        return
    # Büyütme: 8x8 fontu manuel scale et
    buf = bytearray(8 * len(txt))
    tmp = framebuf.FrameBuffer(buf, 8 * len(txt), 8, framebuf.MONO_VLSB)
    tmp.text(txt, 0, 0, 1)
    for cy in range(8):
        for cx in range(8 * len(txt)):
            if tmp.pixel(cx, cy):
                oled.fill_rect(x + cx * size, y + cy * size, size, size, 1)


def oled_scroll_text(txt, y=24, size=2, speed=30, direction="LEFT"):
    """
    Kayan yazı — metin ekranda soldan sağa veya sağdan sola hareket eder.
    Bir tam tur döngü: metnin tamamı ekrandan geçer.
    Bu fonksiyon BLOKLAYICI — bittiğinde döner.

    speed: piksel başına ms (büyük = yavaş). 30 = orta hız.
    direction: 'LEFT' (sağdan→sola, varsayılan) veya 'RIGHT' (soldan→sağa)
    """
    if oled is None:
        return
    txt = str(txt)
    w_per_char = 8 * size
    total_w = len(txt) * w_per_char
    sw = oled.width
    sh = oled.height

    if direction == "RIGHT":
        rng = range(-total_w, sw + 1)
    else:
        rng = range(sw, -total_w - 1, -1)

    for x in rng:
        oled.fill_rect(0, y, sw, size * 8, 0)
        oled_text(txt, x=x, y=y, size=size, align="TOPLEFT")
        oled.show()
        time.sleep_ms(speed)


def oled_circle(xc, yc, r, color=1, fill=False):
    """Daire çiz (midpoint algoritması)."""
    if oled is None:
        return
    x = 0
    y = r
    d = 3 - 2 * r
    while y >= x:
        if fill:
            oled.hline(xc - x, yc + y, 2 * x + 1, color)
            oled.hline(xc - x, yc - y, 2 * x + 1, color)
            oled.hline(xc - y, yc + x, 2 * y + 1, color)
            oled.hline(xc - y, yc - x, 2 * y + 1, color)
        else:
            oled.pixel(xc + x, yc + y, color)
            oled.pixel(xc - x, yc + y, color)
            oled.pixel(xc + x, yc - y, color)
            oled.pixel(xc - x, yc - y, color)
            oled.pixel(xc + y, yc + x, color)
            oled.pixel(xc - y, yc + x, color)
            oled.pixel(xc + y, yc - x, color)
            oled.pixel(xc - y, yc - x, color)
        x += 1
        if d > 0:
            y -= 1
            d = d + 4 * (x - y) + 10
        else:
            d = d + 4 * x + 6


def oled_image(img_bytes, x=0, y=0, width=None, height=None):
    """
    Mono bitmap çiz. img_bytes: VLSB framebuf formatında bytes/bytearray.
    width/height belirtilmezse OLED'in tam boyutu kullanılır.
    """
    if oled is None:
        return
    w = width if width else oled.width
    h = height if height else oled.height
    fb = framebuf.FrameBuffer(bytearray(img_bytes), w, h, framebuf.MONO_VLSB)
    oled.blit(fb, x, y)


def oled_shape(shape, x, y, size=20, color=1):
    """Şekil çiz. shape: CIRCLE/CIRCLE_FILL/RECT/RECT_FILL/LINE/PIXEL"""
    if oled is None:
        return
    if shape == "CIRCLE":
        r = max(1, size // 2)
        oled_circle(x + r, y + r, r, color, False)
    elif shape == "CIRCLE_FILL":
        r = max(1, size // 2)
        oled_circle(x + r, y + r, r, color, True)
    elif shape == "RECT":
        oled.rect(x, y, size, size, color)
    elif shape == "RECT_FILL":
        oled.fill_rect(x, y, size, size, color)
    elif shape == "LINE":
        oled.hline(x, y, size, color)
    elif shape == "PIXEL":
        oled.pixel(x, y, color)


def oled_eyes(kind):
    """
    Göz ifadesi çiz. (128x64 ekran için tasarlandı, 128x32'de de çalışır)
    kind: NORMAL, LEFT, RIGHT, UP, DOWN, SLEEP, SURPRISED, LOVE,
          ANGRY, CLOSED, SAD, HAPPY
    """
    if oled is None:
        return
    sw, sh = oled.width, oled.height
    # Ekran boyutuna göre orantılı pozisyon
    LX = sw // 4
    RX = sw - sw // 4
    CY = sh // 2
    R = min(sw // 7, sh // 3, 18)
    P = max(R // 3, 5)
    OFF = R // 2

    if kind == "CLOSED":
        oled.fill_rect(LX - R, CY - 1, 2 * R, 3, 1)
        oled.fill_rect(RX - R, CY - 1, 2 * R, 3, 1)
        return
    if kind == "SLEEP":
        for dx in range(-R, R + 1):
            h = int((R * R - dx * dx) ** 0.5)
            oled.pixel(LX + dx, CY + h, 1)
            oled.pixel(RX + dx, CY + h, 1)
        oled.hline(LX - R, CY, 2 * R, 1)
        oled.hline(RX - R, CY, 2 * R, 1)
        return

    # Genel: iki dolu cember (göz beyazı)
    oled_circle(LX, CY, R, 1, True)
    oled_circle(RX, CY, R, 1, True)

    px, py = 0, 0
    if kind == "LEFT":
        px = -OFF
    elif kind == "RIGHT":
        px = OFF
    elif kind == "UP":
        py = -OFF
    elif kind == "DOWN":
        py = OFF
    elif kind == "LOVE":
        for cx in (LX, RX):
            oled_circle(cx - 4, CY - 2, 5, 0, True)
            oled_circle(cx + 4, CY - 2, 5, 0, True)
            for dy in range(0, 10):
                ww = 10 - dy
                oled.hline(cx - ww // 2, CY + dy - 2, ww, 0)
        return
    elif kind == "SURPRISED":
        oled_circle(LX, CY, P + 3, 0, True)
        oled_circle(RX, CY, P + 3, 0, True)
        return
    elif kind == "ANGRY":
        oled_circle(LX, CY + 2, P, 0, True)
        oled_circle(RX, CY + 2, P, 0, True)
        for t in range(4):
            oled.line(LX - R, CY - R + t - 2, LX + R // 2, CY - R // 2 + t - 2, 0)
            oled.line(RX - R // 2, CY - R // 2 + t - 2, RX + R, CY - R + t - 2, 0)
        return
    elif kind == "SAD":
        oled_circle(LX, CY + OFF, P, 0, True)
        oled_circle(RX, CY + OFF, P, 0, True)
        for t in range(3):
            oled.line(LX - R + 2, CY + R - t, LX + R - 2, CY + R + 4 - t, 0)
            oled.line(RX - R + 2, CY + R + 4 - t, RX + R - 2, CY + R - t, 0)
        return
    elif kind == "HAPPY":
        for cx in (LX, RX):
            for dx in range(-R, R + 1):
                h = int((R * R - dx * dx) ** 0.5)
                oled.vline(cx + dx, CY, h, 1)
        return

    # NORMAL veya yön (LEFT/RIGHT/UP/DOWN) — pupil çizimi
    oled_circle(LX + px, CY + py, P, 0, True)
    oled_circle(RX + px, CY + py, P, 0, True)


# ============================================================
# PWM CACHE (servo, buzzer, motor için)
# ============================================================

_pwm_cache = {}


def pwm_get(pin, freq=1000):
    """PWM nesnesini önbellekten al veya oluştur."""
    if pin not in _pwm_cache:
        p = PWM(Pin(pin))
        p.freq(freq)
        _pwm_cache[pin] = p
    return _pwm_cache[pin]


def pwm_write(pin, duty):
    """PWM duty cycle ayarla (0-65535)."""
    pwm_get(pin).duty_u16(duty)


def servo_angle(pin, angle):
    """Servo'yu 0-180° arası bir açıya döndür."""
    if pin not in _pwm_cache:
        p = PWM(Pin(pin))
        p.freq(50)
        _pwm_cache[pin] = p
    a = max(0, min(180, angle))
    duty = int(1638 + (a / 180) * (8192 - 1638))
    _pwm_cache[pin].duty_u16(duty)
    print("@SV P%d %d" % (pin, a))  # simülasyon senkronu


def buzzer_tone(pin, freq, dur_ms):
    """Buzzer'da belirli frekansta ton çal, süre dolunca sus."""
    if pin not in _pwm_cache:
        _pwm_cache[pin] = PWM(Pin(pin))
    p = _pwm_cache[pin]
    p.freq(int(freq))
    p.duty_u16(32768)
    time.sleep_ms(int(dur_ms))
    p.duty_u16(0)


def buzzer_off(pin):
    """Buzzer'ı sustur."""
    if pin in _pwm_cache:
        _pwm_cache[pin].duty_u16(0)


# ============================================================
# LED (onboard)
# ============================================================


def led_init():
    """Onboard LED — Pico W'de 'LED' string, Pico'da pin 25."""
    try:
        return Pin("LED", Pin.OUT)
    except Exception:
        return Pin(25, Pin.OUT)


# ============================================================
# BUTON
# ============================================================

_btn_cache = {}


def button_pressed(pin):
    """PicoBricks butonu — basılınca pin HIGH olur (harici pull-down).
    'Dijital pin oku' ile aynı elektriksel davranış: basılı = 1."""
    if pin not in _btn_cache:
        _btn_cache[pin] = Pin(pin, Pin.IN, Pin.PULL_DOWN)
    return _btn_cache[pin].value() == 1


# ============================================================
# ULTRASONİK (HC-SR04)
# ============================================================


def ultrasonic_distance(trig_pin, echo_pin):
    """HC-SR04 ile cm cinsinden mesafe ölçer. Hata = -1."""
    trig = Pin(trig_pin, Pin.OUT)
    echo = Pin(echo_pin, Pin.IN)
    trig.value(0)
    time.sleep_us(2)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    t0 = time.ticks_us()
    while echo.value() == 0:
        if time.ticks_diff(time.ticks_us(), t0) > 30000:
            return -1
    start = time.ticks_us()
    while echo.value() == 1:
        if time.ticks_diff(time.ticks_us(), start) > 30000:
            return -1
    elapsed = time.ticks_diff(time.ticks_us(), start)
    return elapsed / 58.0


# ============================================================
# PICO DAHİLİ SICAKLIK SENSÖRÜ
# ============================================================

_temp_sensor = None


def internal_temp():
    """Pico chip sıcaklığını °C cinsinden okur (ortam sıcaklığı değil)."""
    global _temp_sensor
    if _temp_sensor is None:
        _temp_sensor = ADC(4)
    raw = _temp_sensor.read_u16() * 3.3 / 65535
    return 27 - (raw - 0.706) / 0.001721


# ============================================================
# POTANSİYOMETRE — 0-100 normalize
# ============================================================


def potentiometer(pin):
    """ADC pininden 0-100 arası okuma."""
    return int(ADC(pin).read_u16() * 100 / 65535)


# ============================================================
# MAP (Arduino map fonksiyonu)
# ============================================================


def rx_map(v, fl, fh, tl, th):
    """v değerini [fl,fh] aralığından [tl,th] aralığına eşler."""
    if fh - fl == 0:
        return tl
    return (v - fl) * (th - tl) / (fh - fl) + tl


# ============================================================
# NEOPIXEL (lazy import — sadece kullanılırsa yüklenir)
# ============================================================

_neopixel_mod = None
_np = None


def neopixel_init(pin, count):
    """NeoPixel şerit başlat. Global _np değişkenine atar."""
    global _neopixel_mod, _np
    if _neopixel_mod is None:
        import neopixel as _neopixel_mod
    _np = _neopixel_mod.NeoPixel(Pin(pin), count)
    return _np


def neopixel_set(index, r, g, b):
    """Bir LED rengini ayarla. Önce neopixel_init çağrılmış olmalı."""
    if _np is not None:
        _np[index] = (r, g, b)


def neopixel_show():
    """Tüm LED renklerini şeride gönder."""
    if _np is not None:
        _np.write()


# ============================================================
# RÖLE (basit GPIO açma/kapama, varsayılan aktif-HIGH)
# ============================================================

_relay_cache = {}


def relay_set(pin, state):
    """Röleyi aç (state=True/1) veya kapat (state=False/0)."""
    if pin not in _relay_cache:
        _relay_cache[pin] = Pin(pin, Pin.OUT)
    _relay_cache[pin].value(1 if state else 0)


def relay_toggle(pin):
    """Röle durumunu tersine çevir."""
    if pin not in _relay_cache:
        _relay_cache[pin] = Pin(pin, Pin.OUT)
        _relay_cache[pin].value(0)
        return
    _relay_cache[pin].value(0 if _relay_cache[pin].value() else 1)


# ============================================================
# LDR (Light Dependent Resistor) — analog okuma 0-100
# ============================================================


def ldr_read(pin):
    """LDR'den 0-100 arası ışık şiddeti okur. Yüksek = aydınlık."""
    return int(ADC(pin).read_u16() * 100 / 65535)


# ============================================================
# DHT11 — sıcaklık + nem (1-wire, ucuz)
# ============================================================

_dht_cache = {}


def dht11_read(pin):
    """
    DHT11 sensöründen sıcaklık (°C) ve nem (%) okur.
    Geri dönüş: (sicaklik, nem) tuple — hata varsa (-1, -1)
    """
    import dht
    if pin not in _dht_cache:
        _dht_cache[pin] = dht.DHT11(Pin(pin))
    try:
        _dht_cache[pin].measure()
        return (_dht_cache[pin].temperature(), _dht_cache[pin].humidity())
    except Exception:
        return (-1, -1)


def dht11_temp(pin):
    """Sadece sıcaklık döndürür (°C). Hata = -1."""
    return dht11_read(pin)[0]


def dht11_humidity(pin):
    """Sadece nem döndürür (%). Hata = -1."""
    return dht11_read(pin)[1]


# ============================================================
# SHTC3 — sıcaklık + nem (I2C, hassas)
# ============================================================

_shtc3 = None


class _SHTC3Driver:
    """SHTC3 I2C sıcaklık + nem sensörü için minimal driver."""

    ADDR = 0x70
    CMD_WAKE = b"\x35\x17"
    CMD_SLEEP = b"\xB0\x98"
    CMD_MEASURE = b"\x7C\xA2"

    def __init__(self, i2c):
        self.i2c = i2c

    def _crc8(self, data):
        crc = 0xFF
        for b in data:
            crc ^= b
            for _ in range(8):
                crc = ((crc << 1) ^ 0x31) if (crc & 0x80) else (crc << 1)
                crc &= 0xFF
        return crc

    def measure(self):
        self.i2c.writeto(self.ADDR, self.CMD_WAKE)
        time.sleep_ms(1)
        self.i2c.writeto(self.ADDR, self.CMD_MEASURE)
        time.sleep_ms(20)
        data = self.i2c.readfrom(self.ADDR, 6)
        self.i2c.writeto(self.ADDR, self.CMD_SLEEP)
        # data[0:2] = temp raw, [2] = crc; [3:5] = humidity raw, [5] = crc
        t_raw = (data[0] << 8) | data[1]
        h_raw = (data[3] << 8) | data[4]
        temp = -45 + 175 * t_raw / 65535.0
        hum = 100 * h_raw / 65535.0
        return (temp, hum)


def shtc3_init(sda_pin=4, scl_pin=5, bus=0):
    """SHTC3 sensörünü başlat (varsayılan SDA=GP4, SCL=GP5)."""
    global _shtc3
    i2c = get_i2c(sda_pin, scl_pin, bus)
    _shtc3 = _SHTC3Driver(i2c)


def shtc3_read():
    """SHTC3'ten sıcaklık+nem oku. Önce shtc3_init() çağırılmış olmalı."""
    if _shtc3 is None:
        shtc3_init()
    try:
        return _shtc3.measure()
    except Exception:
        return (-1, -1)


def shtc3_temp():
    """Sadece sıcaklık döndürür (°C). Hata = -1."""
    return shtc3_read()[0]


def shtc3_humidity():
    """Sadece nem döndürür (%). Hata = -1."""
    return shtc3_read()[1]


# ============================================================
# IR ALICI — NEC protokolü (kumanda komut okuma)
# ============================================================

_ir_pin = None
_ir_buffer = []
_ir_last_code = 0
_ir_last_time = 0


def _ir_irq(pin):
    """IR pin değişiklik kesmesi — düşen/yükselen kenarlarda zaman damgası alır."""
    global _ir_buffer
    _ir_buffer.append(time.ticks_us())


def ir_init(pin):
    """IR alıcısı başlat (TSOP38xx gibi). Varsayılan: GP0"""
    global _ir_pin, _ir_buffer
    _ir_pin = Pin(pin, Pin.IN, Pin.PULL_UP)
    _ir_buffer = []
    _ir_pin.irq(trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=_ir_irq)


def ir_read_code():
    """
    Son alınan kumanda kodunu döndürür (NEC formatında 32-bit int).
    Yeni kod yoksa 0 döner.
    """
    global _ir_buffer, _ir_last_code, _ir_last_time
    if _ir_pin is None:
        return 0
    now = time.ticks_us()
    if len(_ir_buffer) < 67:
        if len(_ir_buffer) > 0 and time.ticks_diff(now, _ir_buffer[-1]) > 50000:
            _ir_buffer = []
        return 0
    edges = _ir_buffer[:]
    _ir_buffer = []
    # NEC: 9ms start mark + 4.5ms space + 32 bit (her bit 562us mark + space)
    # Yüksek/düşük: bit=0 → 562us space, bit=1 → 1687us space
    if len(edges) < 67:
        return 0
    code = 0
    try:
        for i in range(32):
            t_space = time.ticks_diff(edges[3 + i * 2], edges[2 + i * 2])
            bit = 1 if t_space > 1000 else 0
            code = (code << 1) | bit
    except Exception:
        return 0
    # Tekrarlanan kod filtre (300ms içinde aynı)
    if code == _ir_last_code and time.ticks_diff(now, _ir_last_time) < 300000:
        return 0
    _ir_last_code = code
    _ir_last_time = now
    return code


# ============================================================
# WS2812 RGB LED — Scratch-tarzı kolay komutlar
# (Mevcut neopixel_* fonksiyonları korunur, bu yeni ek)
# ============================================================


def rgb_init(pin=6, count=8):
    """WS2812 RGB LED şeritini başlat. Varsayılan: pin GP6, 8 LED."""
    return neopixel_init(pin, count)


def rgb_set_all(r, g, b):
    """Tüm LED'leri aynı renge boya ve göster."""
    if _np is None:
        return
    for i in range(len(_np)):
        _np[i] = (r, g, b)
    _np.write()


def rgb_set_one(index, r, g, b):
    """Tek bir LED'i boya ve hemen göster."""
    if _np is None:
        return
    if 0 <= index < len(_np):
        _np[index] = (r, g, b)
        _np.write()


def rgb_clear():
    """Tüm LED'leri kapat."""
    rgb_set_all(0, 0, 0)


def rgb_rainbow(step=0):
    """
    Tüm şeride gökkuşağı yay. step parametresi animasyon için —
    döngüde step'i artırarak çağırınca renkler kayar.
    """
    if _np is None:
        return
    n = len(_np)
    for i in range(n):
        h = ((i * 256 // n) + step) % 256
        # HSV → RGB (basit, max parlaklık)
        region = h // 43
        rem = (h - region * 43) * 6
        if region == 0:    _np[i] = (255, rem, 0)
        elif region == 1:  _np[i] = (255 - rem, 255, 0)
        elif region == 2:  _np[i] = (0, 255, rem)
        elif region == 3:  _np[i] = (0, 255 - rem, 255)
        elif region == 4:  _np[i] = (rem, 0, 255)
        else:              _np[i] = (255, 0, 255 - rem)
    _np.write()


def rgb_brightness(percent):
    """Mevcut renkleri yüzdeye ölçekle (0-100). Yeni renk uygulamadan."""
    if _np is None:
        return
    scale = max(0, min(100, percent)) / 100.0
    for i in range(len(_np)):
        r, g, b = _np[i]
        _np[i] = (int(r * scale), int(g * scale), int(b * scale))
    _np.write()


# ============================================================
# MOTOR DRIVER v2 — PicoBricks/I2C tabanlı motor sürücü
# (I2C adres 0x22, SDA=GP4 SCL=GP5 default)
# ------------------------------------------------------------
# 5-byte komut paketi: [0x26, type, val1, val2, XOR_checksum]
# Servo: type = servoNum+2 (yani servo 1 → type=3, servo 2 → type=4, servo 3 → type=5)
# DC motor: type = dcNum (1 veya 2)
# ============================================================

_motor_i2c = None

# DC motorun fiilen dönmeye başladığı minimum PWM (0-255 byte).
# Bunun altında motor statik sürtünmeyi yenemez. Kullanıcının %1-100 isteği
# bu değer ile 255 (tam PWM) arasına eşlenir.
# Motor güçsüzse 110-130'a çıkar, çok güçlüyse 60-70'e indir.
_MOTOR_MIN = 90


def motor_init(sda_pin=4, scl_pin=5, bus=0):
    """Motor sürücü I2C bağlantısını başlat."""
    global _motor_i2c
    _motor_i2c = get_i2c(sda_pin, scl_pin, bus)


def _motor_send(type_byte, val1, val2):
    """5-byte paketi I2C üzerinden gönder."""
    global _motor_i2c
    if _motor_i2c is None:
        motor_init()
    buf = bytearray(5)
    buf[0] = 0x26
    buf[1] = type_byte
    buf[2] = val1
    buf[3] = val2
    buf[4] = buf[1] ^ buf[2] ^ buf[3]
    try:
        _motor_i2c.writeto(0x22, buf, False)
    except Exception as e:
        print("[Motor] I2C hata:", e)


def servo_v2(servo_num, angle):
    """
    Motor sürücü üzerindeki servoyu kontrol et (0-180°).
    servo_num: 1, 2 veya 3
    angle: 0-180
    """
    angle = max(0, min(180, int(angle)))
    _motor_send(servo_num + 2, 0, angle)
    print("@SV M%d %d" % (servo_num, angle))  # simülasyon senkronu


def dc_motor(motor_num, speed, direction):
    """
    DC motor kontrolü.
    motor_num: 1 veya 2
    speed: 0-100 (yüzde) — kullanıcının istediği oran
    direction: 'forward' veya 'backward' (veya 0/1)

    PicoBricks motor modülü firmware'i hız byte'ını 0-255 PWM duty olarak
    kullanır. Yüzdeyi (0-100) bu aralığa ölçeklemek gerekir, yoksa %100
    bile motora ~%39 PWM gönderilir → motor zayıf döner.
    Ayrıca düşük PWM'de DC motor statik sürtünmeyi yenemez; 1-100 isteği
    _MOTOR_MIN..255 aralığına eşlenir. %0 ise tam durur.
    """
    speed = max(0, min(100, int(speed)))
    if speed > 0:
        # 1..100 → _MOTOR_MIN..255 doğrusal eşleme (PWM duty)
        speed = _MOTOR_MIN + (speed - 1) * (255 - _MOTOR_MIN) // 99
    if isinstance(direction, str):
        dir_byte = 0 if direction == 'forward' else 1
    else:
        dir_byte = 1 if direction else 0
    _motor_send(motor_num, speed, dir_byte)


def dc_motor_stop(motor_num):
    """DC motoru durdur (speed=0)."""
    _motor_send(motor_num, 0, 0)


def dc_motor_stop_all():
    """Tüm DC motorları durdur."""
    _motor_send(1, 0, 0)
    _motor_send(2, 0, 0)

# ============================================================
# Klavye kontrolü (bilgisayardan gelen tuşlar — BLE/USB üzerinden)
# ============================================================
# main.py bootloader bilgisayardan gelen MSG_KEY mesajını alır ve
# burada bir state'i günceller. Kullanıcı kodu bu state'i okur.
#
# Akış:
#   - Bilgisayar her 50ms basılı tuşları gönderir (örn "wa", boş "")
#   - Pico set_pressed_keys() ile state'i günceller
#   - tus_basili("w") → o anda basılı mı (sürekli sorgulanabilir)
#   - tus_basildi("w") → en son okumadan beri basıldı mı (tek seferlik)

_pressed_keys = set()     # şu an basılı olan tuşlar (küçük harf)
_pressed_once = set()     # son okumadan beri yeni basılanlar

# --- USB seri klavye "pump" altyapısı --------------------------------
# İki ayrı senaryo var:
#   1) Bağımsız çalışma (main.py bootloader): core0'daki dinleyici stdin'i
#      okur, set_pressed_keys() çağırır. Bu durumda pump KAPATILIR
#      (disable_serial_pump) — çift okuma/race olmasın.
#   2) Canlı "Çalıştır" (raw REPL exec): bootloader çalışmaz, stdin'i kimse
#      okumaz. Bu durumda tus_basili/tus_basildi her çağrıldığında pump
#      stdin'den \x06...\n paketlerini bloklamadan çeker. Böylece tuşlar
#      tüketilir (REPL'e sızıp "NameError" üretmez) ve state güncellenir.
# BLE modunda tuşlar MSG_KEY ile gelir; stdin boş olur, pump zararsız.
_serial_pump_enabled = True
_kb_in_msg = False
_kb_buf = ''
try:
    import select as _select
    import sys as _sys
    _kb_poll = _select.poll()
    _kb_poll.register(_sys.stdin, _select.POLLIN)
except Exception:
    _kb_poll = None


def disable_serial_pump():
    """Bootloader kendi stdin dinleyicisini çalıştırırken çağırır;
    tus_basili içindeki otomatik stdin okuması kapanır (çift okuma olmaz)."""
    global _serial_pump_enabled
    _serial_pump_enabled = False


def _pump_serial_keys():
    """USB seri stdin'inde bekleyen \\x06...\\n klavye paketlerini bloklamadan
    oku ve state'i güncelle. Veri yoksa anında döner."""
    global _kb_in_msg, _kb_buf
    if not _serial_pump_enabled or _kb_poll is None:
        return
    # Mevcut tüm baytları boşalt (sızıntı olmasın) — sınırlı döngü
    for _ in range(256):
        if not _kb_poll.poll(0):   # 0ms timeout → tamamen bloklamasız
            break
        try:
            ch = _sys.stdin.read(1)
        except Exception:
            break
        if not ch:
            break
        if ch == '\x06':
            _kb_in_msg = True
            _kb_buf = ''
        elif _kb_in_msg:
            if ch == '\n':
                set_pressed_keys(_kb_buf)
                _kb_in_msg = False
                _kb_buf = ''
            elif len(_kb_buf) < 32:
                _kb_buf += ch
        # else: framing dışı bayt — yut (REPL'e sızmasın)


def set_pressed_keys(keys_str):
    """
    main.py bootloader veya _pump_serial_keys tarafından çağrılır.
    keys_str = "wa" gibi basılı tuşların concat string'i. Yeni basılan
    tuşları _pressed_once'a ekler (tek-seferlik tetikleme için).
    """
    global _pressed_keys, _pressed_once
    new_keys = set(keys_str.lower())
    # Yeni basılanlar = şimdi basılı ama önceden basılı olmayan
    just_pressed = new_keys - _pressed_keys
    _pressed_once |= just_pressed
    _pressed_keys = new_keys


def klavye_guncelle():
    """Bekleyen USB seri tuşlarını işle. tus_basili/tus_basildi bunu otomatik
    çağırır; istersen döngünde elle de çağırabilirsin."""
    _pump_serial_keys()


def tus_basili(key):
    """Tuş şu anda basılı mı? (basılı tuttuğun sürece True döner)"""
    _pump_serial_keys()
    return key.lower() in _pressed_keys


def tus_basildi(key):
    """
    Tuşa son okumadan beri basıldı mı? (Bir kere True döner, sonra reset)
    Tek seferlik tetikleme için — örneğin "Sıçra" gibi anlık komutlar.
    """
    _pump_serial_keys()
    k = key.lower()
    if k in _pressed_once:
        _pressed_once.discard(k)
        return True
    return False
