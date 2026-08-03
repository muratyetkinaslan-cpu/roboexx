# ============================================================
# RoboExx BerryBot Kütüphanesi — v2.0.0
# ------------------------------------------------------------
# BerryBot (Robotistan, RP2040) için sıfırdan yazılmış donanım
# kütüphanesi. Resmi kütüphanedeki hatalar giderildi:
#
#   * Motor yön pinleri: setMotorSpeed ile move() artık AYNI
#     yönü kullanıyor (resmi kodda joystick ileri = motor geri idi)
#   * LED matris timer'ı içindeki sleep_ms(1) kaldırıldı
#     (CPU'yu %20 bloke ediyordu, motorlarda titreme yapıyordu)
#   * BLE.read() içindeki time.sleep(0.5) kaldırıldı — okuma
#     artık bloklamıyor (resmi yazılımın kasılmasının ana sebebi)
#   * Ultrasonik okuma medyan filtreli, hataya dayanıklı
#
# MicroPython v1.20+ / RP2040 hedeflenmiştir.
# ============================================================

import array
import time
import machine
import rp2
from machine import Pin, PWM, ADC, UART, Timer, time_pulse_us
from utime import sleep_us, ticks_ms, ticks_us, ticks_diff

__version__ = "2.0.0"

# ------------------------------------------------------------
# BerryBot pin haritası (resmi karttan doğrulanmıştır)
# ------------------------------------------------------------
PIN_BLE_TX      = 0     # UART0 TX -> BLE modülü RX
PIN_BLE_RX      = 1     # UART0 RX <- BLE modülü TX
PIN_BUZZER      = 14
PIN_NEOPIXEL    = 6     # 7 adet WS2812
PIN_MOTOR_A1    = 24
PIN_MOTOR_A2    = 25
PIN_MOTOR_B1    = 23
PIN_MOTOR_B2    = 22
PIN_MOTOR_PWM_A = 15
PIN_MOTOR_PWM_B = 21
PIN_LDR_L       = 29    # ADC3
PIN_LDR_R       = 28    # ADC2
PIN_LINE_L      = 26    # ADC0
PIN_LINE_R      = 27    # ADC1
PIN_IR          = 20
PIN_ECHO        = 9
PIN_TRIG        = 8
PIN_BUTTON      = 10
MATRIX_ROWS     = (7, 11, 12, 13, 17)
MATRIX_COLS     = (18, 19, 16, 2, 3)

# Pil ölçümü: BerryBot'un 4 ADC kanalı da sensörlere ayrılmış
# durumda. Kartında VBAT gerilim bölücüsü bir ADC'ye bağlıysa
# buraya pin numarasını yazın (ör. 28'i LDR yerine pile bağladıysanız).
# None = pil ölçümü yok, ekranda "?" gösterilir.
PIN_BATTERY     = None
BATTERY_DIVIDER = 2.0        # bölücü oranı (ör. 2x100k -> 2.0)
BATTERY_FULL_V  = 4.2        # Li-ion dolu
BATTERY_EMPTY_V = 3.3        # Li-ion boş kabul edilen

# Yön sabitleri
STOP, FWD, BWD, RIGHT, LEFT = 0, 1, 2, 3, 4


def map_value(x, in_min, in_max, out_min, out_max):
    return (x - in_min) * (out_max - out_min) // (in_max - in_min) + out_min


def constrain(x, lo, hi):
    return max(lo, min(hi, x))


# ============================================================
# Motorlar — TB6612FNG
# ============================================================
class Motors:
    """Çift DC motor sürücü.

    Hız birimi: -100..100 (%). Pozitif = ileri.
    drive(sol, sağ)  -> tank sürüşü
    joystick(x, y)   -> 0-255 joystick değerinden arcade sürüş
    move(yön, hız)   -> eski API ile uyumluluk (hız 0..65535 de kabul edilir)
    """

    def __init__(self):
        self.a1 = Pin(PIN_MOTOR_A1, Pin.OUT)   # sağ motor
        self.a2 = Pin(PIN_MOTOR_A2, Pin.OUT)
        self.b1 = Pin(PIN_MOTOR_B1, Pin.OUT)   # sol motor
        self.b2 = Pin(PIN_MOTOR_B2, Pin.OUT)
        self.pwm_a = PWM(Pin(PIN_MOTOR_PWM_A))
        self.pwm_b = PWM(Pin(PIN_MOTOR_PWM_B))
        self.pwm_a.freq(1000)
        self.pwm_b.freq(1000)
        # Gerekirse motor yönlerini ters çevirmek için:
        self.invert_left = False
        self.invert_right = False
        # %'den küçük hızlarda motor dönmez; min kalkış eşiği (%)
        self.min_duty_pct = 25
        self.stop()

    # --- alçak seviye ---
    def _duty(self, pct):
        """% (0-100) -> duty_u16, kalkış eşiği uygulanmış."""
        pct = constrain(abs(pct), 0, 100)
        if pct == 0:
            return 0
        pct = self.min_duty_pct + pct * (100 - self.min_duty_pct) // 100
        return pct * 65535 // 100

    def _set_right(self, pct):
        fwd = pct >= 0
        if self.invert_right:
            fwd = not fwd
        # move(FWD) referans yönü: A1=1, A2=0  (resmi move() ile aynı)
        self.a1.value(1 if fwd else 0)
        self.a2.value(0 if fwd else 1)
        self.pwm_a.duty_u16(self._duty(pct))

    def _set_left(self, pct):
        fwd = pct >= 0
        if self.invert_left:
            fwd = not fwd
        self.b1.value(1 if fwd else 0)
        self.b2.value(0 if fwd else 1)
        self.pwm_b.duty_u16(self._duty(pct))

    # --- yüksek seviye ---
    def left(self, pct):
        """Sadece sol motor: -100..100 (%)."""
        self._set_left(constrain(pct, -100, 100))

    def right(self, pct):
        """Sadece sağ motor: -100..100 (%)."""
        self._set_right(constrain(pct, -100, 100))

    def drive(self, left_pct, right_pct):
        """Tank sürüşü: her motor -100..100."""
        self._set_left(constrain(left_pct, -100, 100))
        self._set_right(constrain(right_pct, -100, 100))

    def joystick(self, x, y):
        """PicoBricks GO / RoboExx joystick: x,y 0..255 (128 = orta)."""
        mx = map_value(x, 0, 255, -100, 100)
        my = map_value(y, 0, 255, -100, 100)
        left = constrain(my + mx, -100, 100)
        right = constrain(my - mx, -100, 100)
        # Küçük ölü bölge — kolu bırakınca tam dursun
        if abs(mx) < 8 and abs(my) < 8:
            left = right = 0
        self.drive(left, right)

    def move(self, direction, speed=100):
        """Eski API uyumluluğu. speed: 0..100 veya 0..65535."""
        if speed > 100:                       # eski u16 değerleri
            speed = speed * 100 // 65535
        if direction == FWD:
            self.drive(speed, speed)
        elif direction == BWD:
            self.drive(-speed, -speed)
        elif direction == RIGHT:
            self.drive(speed, -speed)
        elif direction == LEFT:
            self.drive(-speed, speed)
        else:
            self.stop()

    def stop(self):
        self.pwm_a.duty_u16(0)
        self.pwm_b.duty_u16(0)
        self.a1.value(0); self.a2.value(0)
        self.b1.value(0); self.b2.value(0)


# ============================================================
# 5x5 LED Matris — donanım timer'lı, bloklamayan tarama
# ============================================================
class Matrix5x5:
    """5x5 LED matris.

    show(ikon)          -> 5 baytlık desen çiz (her bayt bir satır, bit0=ilk sütun)
    set_pixel(x, y, v)  -> tek pikseli aç/kapat
    clear()             -> temizle
    bar(n)              -> 0-5 satırlık dolum (pil/ilerleme göstergesi)
    progress(pct)       -> % ilerlemeyi 25 piksellik dolum olarak göster
    scroll(text)        -> kayan yazı (bloklar, kısa metinler için)
    """

    # Hazır ikonlar
    ICONS = {
        'smile':    [0x0A, 0x0A, 0x00, 0x11, 0x0E],
        'sad':      [0x00, 0x0A, 0x00, 0x0E, 0x11],
        'heart':    [0x0A, 0x1F, 0x1F, 0x0E, 0x04],
        'yes':      [0x00, 0x01, 0x02, 0x14, 0x08],
        'no':       [0x11, 0x0A, 0x04, 0x0A, 0x11],
        'left':     [0x04, 0x0E, 0x15, 0x04, 0x04],
        'right':    [0x04, 0x04, 0x15, 0x0E, 0x04],
        'forward':  [0x04, 0x02, 0x1F, 0x02, 0x04],
        'backward': [0x04, 0x08, 0x1F, 0x08, 0x04],
        'full':     [0x1F, 0x1F, 0x1F, 0x1F, 0x1F],
        'empty':    [0x00, 0x00, 0x00, 0x00, 0x00],
        'bluetooth':[0x1F, 0x00, 0x0E, 0x00, 0x04],
        'ir':       [0x1F, 0x11, 0x1F, 0x11, 0x1F],
        'tracker':  [0x07, 0x04, 0x1F, 0x04, 0x07],
        'sunny':    [0x15, 0x0E, 0x1F, 0x0E, 0x15],
        'sonic':    [0x04, 0x0E, 0x1B, 0x0E, 0x04],
        'triangle': [0x1F, 0x11, 0x11, 0x0A, 0x04],
        'battery':  [0x0E, 0x1F, 0x11, 0x11, 0x1F],
        'question': [0x0E, 0x11, 0x04, 0x00, 0x04],
        'upload':   [0x04, 0x0E, 0x15, 0x04, 0x1C],
    }

    # 3x5 mini font (kayan yazı için) — sadece gerekli karakterler
    FONT3X5 = {
        '0': (7,5,5,5,7), '1': (2,6,2,2,7), '2': (7,1,7,4,7),
        '3': (7,1,7,1,7), '4': (5,5,7,1,1), '5': (7,4,7,1,7),
        '6': (7,4,7,5,7), '7': (7,1,2,2,2), '8': (7,5,7,5,7),
        '9': (7,5,7,1,7), '%': (5,1,2,4,5), '?': (7,1,3,0,2),
        '-': (0,0,7,0,0), ' ': (0,0,0,0,0), '!': (2,2,2,0,2),
    }

    def __init__(self, row_pins=MATRIX_ROWS, col_pins=MATRIX_COLS, timer_id=-1):
        self.rows = [Pin(p, Pin.OUT, value=0) for p in row_pins]
        self.cols = [Pin(p, Pin.OUT, value=1) for p in col_pins]
        self.buf = bytearray(5)
        self._row = 0
        self._timer = Timer(timer_id)
        # 5 satır x ~500Hz yenileme -> titremesiz görüntü
        self._timer.init(freq=500, mode=Timer.PERIODIC, callback=self._tick)

    def _tick(self, t):
        # Önceki satırı kapat (hayalet görüntüyü önler)
        self.rows[self._row].value(0)
        self._row = (self._row + 1) % 5
        b = self.buf[self._row]
        # Sütunlar aktif-düşük
        for i in range(5):
            self.cols[i].value(0 if (b >> i) & 1 else 1)
        self.rows[self._row].value(1)
        # NOT: burada sleep YOK — satır, bir sonraki tick'e kadar yanık kalır.

    def show(self, pattern):
        if isinstance(pattern, str):
            pattern = self.ICONS.get(pattern, self.ICONS['question'])
        for i in range(5):
            self.buf[i] = pattern[i] & 0x1F

    def clear(self):
        for i in range(5):
            self.buf[i] = 0

    def set_pixel(self, x, y, on=1):
        if 0 <= x < 5 and 0 <= y < 5:
            if on:
                self.buf[y] |= (1 << x)
            else:
                self.buf[y] &= ~(1 << x) & 0x1F

    def set_row(self, y, bits):
        """Bir satırı 5 bitlik desenle doldur (bit0 = en soldaki sütun)."""
        if 0 <= y < 5:
            self.buf[y] = bits & 0x1F

    def bar(self, n):
        """Alttan yukarı n satır dolu (0..5). Pil göstergesi için ideal."""
        n = constrain(n, 0, 5)
        for i in range(5):
            self.buf[4 - i] = 0x1F if i < n else 0x00

    def progress(self, pct):
        """0-100 arası ilerlemeyi 25 piksel olarak soldan doldurur."""
        lit = constrain(pct, 0, 100) * 25 // 100
        for y in range(5):
            row = 0
            for x in range(5):
                if y * 5 + x < lit:
                    row |= (1 << x)
            self.buf[y] = row
    def scroll(self, text, speed_ms=120):
        """Kayan yazı — bloklar. Kısa metin/rakamlar için (ör. pil %)."""
        cols = []
        for ch in str(text).upper():
            g = self.FONT3X5.get(ch, self.FONT3X5['?'])
            for x in range(3):
                col = 0
                for y in range(5):
                    if (g[y] >> (2 - x)) & 1:
                        col |= (1 << y)
                cols.append(col)
            cols.append(0)
        cols = [0]*5 + cols + [0]*5
        for start in range(len(cols) - 4):
            for y in range(5):
                row = 0
                for x in range(5):
                    if (cols[start + x] >> y) & 1:
                        row |= (1 << x)
                self.buf[y] = row
            time.sleep_ms(speed_ms)

    def deinit(self):
        self._timer.deinit()
        for r in self.rows:
            r.value(0)


# ============================================================
# WS2812 RGB halka (7 LED) — PIO tabanlı
# ============================================================
@rp2.asm_pio(sideset_init=rp2.PIO.OUT_LOW, out_shiftdir=rp2.PIO.SHIFT_LEFT,
             autopull=True, pull_thresh=24)
def _ws2812_pio():
    T1 = 2; T2 = 5; T3 = 3
    wrap_target()
    label("bitloop")
    out(x, 1)               .side(0)    [T3 - 1]
    jmp(not_x, "do_zero")   .side(1)    [T1 - 1]
    jmp("bitloop")          .side(1)    [T2 - 1]
    label("do_zero")
    nop()                   .side(0)    [T2 - 1]
    wrap()


class NeoRing:
    """7'li WS2812 halka.

    set(i, (r,g,b)) / fill((r,g,b)) / show()
    set_all(liste)  -> 7 renklik listeyi tek seferde uygular
    rainbow(step)   -> bloklamadan gökkuşağı animasyonu (döngüde çağır)
    off()
    """

    def __init__(self, n=7, pin=PIN_NEOPIXEL, brightness=0.2, sm_id=0):
        self.n = n
        self.brightness = brightness
        self.ar = array.array("I", [0] * n)
        self.sm = rp2.StateMachine(sm_id, _ws2812_pio, freq=8_000_000,
                                   sideset_base=Pin(pin))
        self.sm.active(1)
        self._hue = 0
        self._last = ticks_ms()

    def set(self, i, color):
        r, g, b = color
        self.ar[i] = (g << 16) | (r << 8) | b

    def fill(self, color):
        for i in range(self.n):
            self.set(i, color)

    def set_all(self, colors):
        for i in range(min(self.n, len(colors))):
            self.set(i, colors[i])

    def show(self):
        dim = array.array("I", [0] * self.n)
        br = self.brightness
        for i, c in enumerate(self.ar):
            r = int(((c >> 8) & 0xFF) * br)
            g = int(((c >> 16) & 0xFF) * br)
            b = int((c & 0xFF) * br)
            dim[i] = (g << 16) | (r << 8) | b
        self.sm.put(dim, 8)

    def off(self):
        self.fill((0, 0, 0))
        self.show()

    def set_brightness(self, pct):
        """Parlaklık: 0-100 (%). Bir sonraki show() ile uygulanır."""
        self.brightness = max(0, min(100, pct)) / 100
        self.show()

    @staticmethod
    def wheel(pos):
        pos = pos % 256
        if pos < 85:
            return (255 - pos * 3, pos * 3, 0)
        if pos < 170:
            pos -= 85
            return (0, 255 - pos * 3, pos * 3)
        pos -= 170
        return (pos * 3, 0, 255 - pos * 3)

    def rainbow(self, interval_ms=60, step=8):
        """Bloklamayan gökkuşağı — ana döngüden sürekli çağırın."""
        now = ticks_ms()
        if ticks_diff(now, self._last) < interval_ms:
            return
        self._last = now
        self._hue = (self._hue + step) % 256
        for i in range(self.n):
            self.set(i, self.wheel(self._hue + i * 256 // self.n))
        self.show()


# ============================================================
# Buzzer — nota, bip, melodi
# ============================================================
class Buzzer:
    NOTES = {'C4': 262, 'D4': 294, 'E4': 330, 'F4': 349, 'G4': 392,
             'A4': 440, 'B4': 494, 'C5': 523, 'D5': 587, 'E5': 659,
             'F5': 698, 'G5': 784, 'A5': 880, 'B5': 988, 'C6': 1047}

    def __init__(self, pin=PIN_BUZZER):
        self.pwm = PWM(Pin(pin))
        self.pwm.freq(1000)
        self.pwm.duty_u16(0)

    def tone(self, freq, ms=None, duty=32768):
        if freq <= 0:
            self.stop()
        else:
            self.pwm.freq(int(freq))
            self.pwm.duty_u16(duty)
        if ms is not None:
            time.sleep_ms(ms)
            self.stop()

    def stop(self):
        self.pwm.duty_u16(0)

    def beep(self, ms=100, freq=1000):
        self.tone(freq, ms)

    def horn(self):
        self.tone(700, 300)

    def play(self, melody, tempo_ms=180):
        """melody: ['C4','E4','G4', 0, 'C5'] gibi (0 = sus)."""
        for n in melody:
            f = self.NOTES.get(n, 0) if isinstance(n, str) else n
            self.tone(f, tempo_ms)
            time.sleep_ms(20)

    def boot_jingle(self):
        self.play(['C5', 'E5', 'G5'], 90)


# ============================================================
# Ultrasonik HC-SR04 — medyan filtreli
# ============================================================
class Ultrasonic:
    def __init__(self, trig=PIN_TRIG, echo=PIN_ECHO, timeout_us=15000):
        self.trig = Pin(trig, Pin.OUT, value=0)
        self.echo = Pin(echo, Pin.IN)
        self.timeout_us = timeout_us

    def _pulse(self):
        self.trig.value(0); sleep_us(4)
        self.trig.value(1); sleep_us(10)
        self.trig.value(0)
        t = time_pulse_us(self.echo, 1, self.timeout_us)
        return t  # <0 = zaman aşımı

    def distance_cm(self, samples=1):
        """cm cinsinden mesafe. Yansıma yoksa 400 döner (asla çökmez)."""
        vals = []
        for _ in range(samples):
            t = self._pulse()
            if t > 0:
                vals.append(t / 58.0)
            if samples > 1:
                sleep_us(500)
        if not vals:
            return 400.0
        vals.sort()
        return vals[len(vals) // 2]

    def obstacle(self, cm=15):
        """Önünde cm'den yakın engel var mı? (3 örnekli, güvenilir)"""
        return self.distance_cm(samples=3) < cm

    def distance_mm(self):
        t = self._pulse()
        return 0xFFFF if t < 0 else min(int(t * 0.343 / 2), 65000)


# ============================================================
# Analog sensörler: çizgi ve ışık
# ============================================================
class LineSensors:
    def __init__(self, threshold=50000):
        self.left = ADC(Pin(PIN_LINE_L))
        self.right = ADC(Pin(PIN_LINE_R))
        self.threshold = threshold

    def raw(self):
        return self.left.read_u16(), self.right.read_u16()

    def on_line(self):
        """(sol_cizgide, sag_cizgide) — True = siyah çizgi görüyor."""
        l, r = self.raw()
        return l >= self.threshold, r >= self.threshold


class LightSensors:
    def __init__(self):
        self.left = ADC(PIN_LDR_L)
        self.right = ADC(PIN_LDR_R)

    def raw(self):
        return self.left.read_u16(), self.right.read_u16()

    def diff(self):
        """Sağ - sol ışık farkı. Pozitif = sağ taraf daha aydınlık."""
        l, r = self.raw()
        return r - l

    def is_bright(self, threshold=10000):
        """Ortam eşikten aydınlık mı? (iki LDR ortalaması)"""
        l, r = self.raw()
        return (l + r) // 2 >= threshold


# ============================================================
# Pil ölçümü (opsiyonel — PIN_BATTERY ayarlıysa)
# ============================================================
class Battery:
    """Li-ion pil yüzdesi. PIN_BATTERY = None ise percent() -> None."""

    def __init__(self, pin=PIN_BATTERY, divider=BATTERY_DIVIDER):
        self.adc = ADC(pin) if pin is not None else None
        self.divider = divider

    def voltage(self):
        if self.adc is None:
            return None
        # 8 örnek ortalaması — motor gürültüsünü bastırır
        s = 0
        for _ in range(8):
            s += self.adc.read_u16()
        raw = s // 8
        return raw * 3.3 / 65535 * self.divider

    def percent(self):
        v = self.voltage()
        if v is None:
            return None
        pct = (v - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100
        return int(constrain(pct, 0, 100))


# ============================================================
# IR Alıcı — NEC protokolü (temizlenmiş)
# ============================================================
class IRRemote:
    # Kumanda tuş kodları
    KEY_1, KEY_2, KEY_3 = 0x45, 0x46, 0x47
    KEY_4, KEY_5, KEY_6 = 0x44, 0x40, 0x43
    KEY_7, KEY_8, KEY_9 = 0x07, 0x15, 0x09
    KEY_OK   = 0x1C
    KEY_UP   = 0x18
    KEY_DOWN = 0x52
    KEY_LEFT = 0x08
    KEY_RIGHT = 0x5A
    REPEAT = -1

    def __init__(self, pin=PIN_IR, callback=None):
        self._pin = Pin(pin, Pin.IN)
        self.callback = callback
        self._times = array.array('i', (0 for _ in range(69)))
        self._edge = 0
        self._addr = 0
        self._tim = Timer(-1)
        self.last_code = 0
        self._new = False
        self._pin.irq(handler=self._cb_pin,
                      trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING)

    def _cb_pin(self, line):
        t = ticks_us()
        if self._edge <= 68:
            if not self._edge:
                self._tim.init(period=80, mode=Timer.ONE_SHOT,
                               callback=self._decode)
            self._times[self._edge] = t
            self._edge += 1
        if self._edge > 68:
            self._edge = 0

    def _decode(self, _):
        cmd = None
        try:
            width = ticks_diff(self._times[1], self._times[0])
            if width < 4000:
                raise ValueError
            width = ticks_diff(self._times[2], self._times[1])
            if width > 3000:
                if self._edge < 68:
                    raise ValueError
                val = 0
                for e in range(3, 66, 2):
                    val >>= 1
                    if ticks_diff(self._times[e + 1], self._times[e]) > 1120:
                        val |= 0x80000000
                addr = val & 0xFF
                c = (val >> 16) & 0xFF
                if c != ((val >> 24) ^ 0xFF) & 0xFF:
                    raise ValueError
                if addr != ((val >> 8) ^ 0xFF) & 0xFF:
                    addr |= val & 0xFF00
                self._addr = addr
                cmd = c
            elif width > 1700 and self._edge == 4:
                cmd = self.last_code  # tekrar (tuş basılı tutuluyor)
        except ValueError:
            cmd = None
        self._edge = 0
        if cmd is not None and cmd >= 0:
            self.last_code = cmd
            self._new = True
            if self.callback:
                try:
                    self.callback(cmd, self._addr)
                except Exception:
                    pass

    def read(self):
        """Yeni tuş geldiyse kodu döndürür, yoksa None. (Poll tarzı kullanım)"""
        if self._new:
            self._new = False
            return self.last_code
        return None

    def pressed(self, code):
        """Belirli tuşa YENİ basıldı mı? (Bloklar için — okuyunca temizler)"""
        if self._new and self.last_code == code:
            self._new = False
            return True
        return False

    def close(self):
        self._pin.irq(handler=None)
        self._tim.deinit()


# Bloklardan kullanılan IR tuş adları
IR_KEYS = {
    'UP': IRRemote.KEY_UP, 'DOWN': IRRemote.KEY_DOWN,
    'LEFT': IRRemote.KEY_LEFT, 'RIGHT': IRRemote.KEY_RIGHT,
    'OK': IRRemote.KEY_OK,
    '1': IRRemote.KEY_1, '2': IRRemote.KEY_2, '3': IRRemote.KEY_3,
    '4': IRRemote.KEY_4, '5': IRRemote.KEY_5, '6': IRRemote.KEY_6,
    '7': IRRemote.KEY_7, '8': IRRemote.KEY_8, '9': IRRemote.KEY_9,
}


# ============================================================
# BLE UART modülü (AT komutlu, şeffaf mod)
# ============================================================
class BLEModule:
    """BerryBot'un harici BLE-UART köprüsü.

    Modül şeffaf moda alınır: tarayıcının Nordic UART RX
    karakteristiğine yazdığı her şey UART0'dan ham bayt olarak
    gelir; UART0'a yazdığımız her şey TX karakteristiğinden
    notify olarak tarayıcıya gider.

    read_burst(): bloklamadan, "sessizlik boşluğu" ile paket
    sınırlarını yakalayarak tam mesajları döndürür.
    """

    def __init__(self, name="RoboExx-Berry", uart_id=0,
                 tx=PIN_BLE_TX, rx=PIN_BLE_RX, baud=115200):
        self.uart = UART(uart_id, baud, tx=Pin(tx), rx=Pin(rx),
                         timeout=5, rxbuf=1024)
        self.name = name
        self._buf = bytearray()
        self._last_rx = ticks_ms()
        self.gap_ms = 12   # bu kadar sessizlik = mesaj bitti

    def _at(self, cmd, wait_ms=120):
        self.uart.write(cmd + "\r\n")
        t0 = ticks_ms()
        resp = b''
        while ticks_diff(ticks_ms(), t0) < wait_ms:
            if self.uart.any():
                resp += self.uart.read()
        return resp

    def configure(self):
        """Modülü isimlendir, Nordic UART UUID'lerini ayarla, şeffaf moda geç."""
        self._at('+++', 200)                 # önce şeffaf moddan çık (varsa)
        self._at('AT')
        self._at('AT+BLENAME=' + self.name)
        self._at('AT+BLESERUUID=6E400001B5A3F393E0A9E50E24DCCA9E')
        self._at('AT+BLERXUUID=6E400002B5A3F393E0A9E50E24DCCA9E')
        self._at('AT+BLETXUUID=6E400003B5A3F393E0A9E50E24DCCA9E')
        self._at('AT+SYSIOMAP=1,4')          # bağlantı LED'i
        self._at('AT+TRANSENTER')            # şeffaf mod: artık ham veri
        # AT cevap artıklarını temizle
        time.sleep_ms(100)
        while self.uart.any():
            self.uart.read()
        self._buf = bytearray()

    def write(self, data):
        """Tarayıcıya notify olarak gider."""
        self.uart.write(data)

    def read_burst(self):
        """Tamamlanmış bir veri patlaması (BLE yazması) döndürür ya da None.

        Bloklamaz. UART'ta gap_ms süredir yeni bayt gelmediyse eldeki
        tamponu tek mesaj olarak teslim eder.
        """
        if self.uart.any():
            self._buf += self.uart.read()
            self._last_rx = ticks_ms()
            return None                      # hâlâ akıyor olabilir
        if self._buf and ticks_diff(ticks_ms(), self._last_rx) >= self.gap_ms:
            out = bytes(self._buf)
            self._buf = bytearray()
            return out
        return None


# ============================================================
# BerryBot — hepsi bir arada
# ============================================================
_singleton = None


class BerryBot:
    """Tüm donanımı tek nesnede toplar. SINGLETON'dur: bootloader ve
    kullanıcı kodu BerryBot() çağırdığında AYNI örnek döner — böylece
    PIO state machine / timer'lar iki kez kurulmaz.

        from berrybot import BerryBot
        bot = BerryBot()
        bot.matrix.show('smile')
        bot.motors.drive(60, 60)
        print(bot.sonar.distance_cm())
    """

    def __new__(cls, *args, **kwargs):
        global _singleton
        if _singleton is None:
            _singleton = super().__new__(cls)
        return _singleton

    def __init__(self, ble_name="RoboExx-Berry", start_matrix=True):
        if getattr(self, '_ready', False):
            return                      # singleton zaten kuruldu
        self._ready = True
        self.motors = Motors()
        self.matrix = Matrix5x5() if start_matrix else None
        self.ring = NeoRing()
        self.buzzer = Buzzer()
        self.sonar = Ultrasonic()
        self.line = LineSensors()
        self.light = LightSensors()
        self.ir = IRRemote()
        self.battery = Battery()
        self.button = Pin(PIN_BUTTON, Pin.IN)
        self.ble = BLEModule(name=ble_name)

    def stop_all(self):
        self.motors.stop()
        self.buzzer.stop()

    def battery_pct(self):
        """Pil yüzdesi (0-100). Ölçüm donanımı yoksa -1."""
        p = self.battery.percent()
        return -1 if p is None else p

    def battery_v(self):
        """Pil voltajı (V, ondalıklı). Ölçüm donanımı yoksa -1."""
        v = self.battery.voltage()
        return -1 if v is None else round(v, 2)

    def show_battery(self):
        """5x5 ekranda pil göstergesi: çubuk grafik + kayan yüzde."""
        if self.matrix is None:
            return
        p = self.battery.percent()
        if p is None:
            self.matrix.show('battery')
            time.sleep(0.8)
            self.matrix.scroll('?')
        else:
            self.matrix.bar((p + 19) // 20)
            time.sleep(1.2)
            self.matrix.scroll('%d%%' % p)
