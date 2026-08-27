# ============================================================
# RoboExx RoboCYTRON Kütüphanesi — v1.0.0
# ------------------------------------------------------------
# Cytron Maker Pi RP2040 robot kontrol kartı için MicroPython
# donanım kütüphanesi.
#
# Kart üzerindeki donanım (resmi şemadan doğrulanmıştır):
#   * Çift kanal DC motor sürücü  : M1A=GP8  M1B=GP9
#                                   M2A=GP10 M2B=GP11
#   * 4 servo çıkışı              : GP12 GP13 GP14 GP15
#   * 2 adet WS2812 RGB LED       : GP18
#   * Piezo buzzer (susturma anah.): GP22
#   * 2 kullanıcı butonu (aktif-0) : GP20  GP21
#   * Pil / Vin ölçümü (1/2 bölücü): GP29 (ADC3)
#   * 7 Grove portu               : aşağıdaki GROVE tablosuna bakın
#
# Ultrasonik, çizgi sensörü, potansiyometre gibi parçalar kartın
# üstünde YOKTUR — Grove portlarına takılır. Varsayılan pinler
# aşağıda tanımlı, istenirse çalışma anında değiştirilebilir.
#
# MicroPython v1.20+ / RP2040 hedeflenmiştir.
# (Kartın fabrika çıkışı CircuitPython'dur — önce MicroPython UF2
#  yüklenmelidir, bkz. ROBOCYTRON_KURULUM.md)
# ============================================================

import array
import time
import machine
import rp2
from machine import Pin, PWM, ADC, time_pulse_us
from utime import sleep_us, ticks_ms, ticks_diff

__version__ = "1.0.0"

# ------------------------------------------------------------
# Maker Pi RP2040 pin haritası
# ------------------------------------------------------------
PIN_M1A = 8      # Motor 1 (SOL)  ileri
PIN_M1B = 9      # Motor 1 (SOL)  geri
PIN_M2A = 10     # Motor 2 (SAĞ)  ileri
PIN_M2B = 11     # Motor 2 (SAĞ)  geri

SERVO_PINS = (12, 13, 14, 15)   # servo 1,2,3,4

PIN_NEOPIXEL = 18               # 2 adet WS2812
NEOPIXEL_COUNT = 2

PIN_BUZZER = 22                 # piezo (kartın yanındaki anahtar açık olmalı)

PIN_BUTTON_1 = 20               # GP20 — aktif düşük, dahili pull-up
PIN_BUTTON_2 = 21               # GP21 — aktif düşük, dahili pull-up

PIN_VBAT = 29                   # ADC3, kart üstünde 1/2 gerilim bölücü
VBAT_DIVIDER = 2.0
BATTERY_FULL_V = 4.2            # 1S Li-ion/LiPo dolu
BATTERY_EMPTY_V = 3.3           # boş kabul edilen

# Grove portları: (sinyal1, sinyal2)
GROVE = {
    1: (0, 1),      # UART0 TX/RX
    2: (2, 3),      # I2C1 SDA/SCL
    3: (4, 5),      # dijital (kart üstünde durum LED'leri var)
    4: (16, 17),    # dijital
    5: (6, 26),     # dijital + ADC0
    6: (26, 27),    # ADC0 + ADC1
    7: (7, 28),     # dijital + ADC2
}

# Kart üstünde OLMAYAN, Grove'a takılan parçaların varsayılan pinleri.
# Ultrasonik → Grove 3, çizgi sensörleri → Grove 6 (iki analog kanal).
PIN_TRIG = 4
PIN_ECHO = 5
PIN_LINE_L = 26                 # ADC0
PIN_LINE_R = 27                 # ADC1

MOTOR_PWM_HZ = 10000            # H-köprü sürücünün rahat çalıştığı frekans
SERVO_PWM_HZ = 50               # standart RC servo

# Yön sabitleri (eski API uyumu)
STOP, FWD, BWD, RIGHT, LEFT = 0, 1, 2, 3, 4


def constrain(x, lo, hi):
    return max(lo, min(hi, x))


def map_value(x, in_min, in_max, out_min, out_max):
    return (x - in_min) * (out_max - out_min) // (in_max - in_min) + out_min


# ============================================================
# Motorlar — kart üstündeki çift kanal H-köprü
# ------------------------------------------------------------
# Her kanalın İKİ PWM girişi var. İleri gitmek için A'ya PWM
# verilir ve B sıfırlanır; geri için tersi. İkisi de 0 = serbest.
# ============================================================
class Motors:
    """Çift DC motor sürücü.

    Hız birimi: -100..100 (%). Pozitif = ileri.
        drive(sol, sag)   -> tank sürüşü
        left(%) / right(%)-> tek motor
        joystick(x, y)    -> 0-255 joystick değerinden arcade sürüş
        move(yön, hız)    -> eski API ile uyumluluk
        stop()
    """

    def __init__(self):
        self.m1a = PWM(Pin(PIN_M1A))
        self.m1b = PWM(Pin(PIN_M1B))
        self.m2a = PWM(Pin(PIN_M2A))
        self.m2b = PWM(Pin(PIN_M2B))
        for p in (self.m1a, self.m1b, self.m2a, self.m2b):
            p.freq(MOTOR_PWM_HZ)
            p.duty_u16(0)
        # Motor kabloları ters takıldıysa kodu değiştirmeden düzelt:
        self.invert_left = False
        self.invert_right = False
        # Bu yüzdenin altında motor dönmez; kalkış eşiği (%)
        self.min_duty_pct = 20
        self.stop()

    # --- alçak seviye ---
    def _duty(self, pct):
        """% (0-100) -> duty_u16, kalkış eşiği uygulanmış."""
        pct = constrain(abs(int(pct)), 0, 100)
        if pct == 0:
            return 0
        pct = self.min_duty_pct + pct * (100 - self.min_duty_pct) // 100
        return pct * 65535 // 100

    def _set_channel(self, a, b, pct, invert):
        if invert:
            pct = -pct
        d = self._duty(pct)
        if pct >= 0:
            a.duty_u16(d)
            b.duty_u16(0)
        else:
            a.duty_u16(0)
            b.duty_u16(d)

    # --- yüksek seviye ---
    def left(self, pct):
        """Sadece sol motor (M1): -100..100 (%)."""
        self._set_channel(self.m1a, self.m1b,
                          constrain(pct, -100, 100), self.invert_left)

    def right(self, pct):
        """Sadece sağ motor (M2): -100..100 (%)."""
        self._set_channel(self.m2a, self.m2b,
                          constrain(pct, -100, 100), self.invert_right)

    def drive(self, left_pct, right_pct):
        """Tank sürüşü: her motor -100..100."""
        self.left(left_pct)
        self.right(right_pct)

    def joystick(self, x, y):
        """Joystick: x,y 0..255 (128 = orta)."""
        mx = map_value(int(x), 0, 255, -100, 100)
        my = map_value(int(y), 0, 255, -100, 100)
        l = constrain(my + mx, -100, 100)
        r = constrain(my - mx, -100, 100)
        if abs(mx) < 8 and abs(my) < 8:      # ölü bölge
            l = r = 0
        self.drive(l, r)

    def move(self, direction, speed=100):
        """Eski API uyumluluğu. speed: 0..100 veya 0..65535."""
        speed = int(speed)
        if speed > 100:
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

    def brake(self):
        """Aktif fren — iki giriş de tam dolu."""
        for p in (self.m1a, self.m1b, self.m2a, self.m2b):
            p.duty_u16(65535)

    def stop(self):
        for p in (self.m1a, self.m1b, self.m2a, self.m2b):
            p.duty_u16(0)


# ============================================================
# Servolar — 4 kanal (GP12..GP15)
# ============================================================
class Servos:
    """4 servo çıkışı. Port numarası 1-4.

        angle(1, 90)        -> 1. servoyu 90 dereceye götür
        pulse_us(1, 1500)   -> alçak seviye: darbe genişliği
        sweep(1, 0, 180, 1000) -> yumuşak süpürme
        off(1) / off()      -> sinyali kes (servo serbest kalır)
    """

    MIN_US = 500      # 0 derece
    MAX_US = 2500     # 180 derece

    def __init__(self, pins=SERVO_PINS):
        self._pins = pins
        self._pwm = [None] * len(pins)
        self._last = [90] * len(pins)

    def _get(self, port):
        i = constrain(int(port), 1, len(self._pins)) - 1
        if self._pwm[i] is None:
            p = PWM(Pin(self._pins[i]))
            p.freq(SERVO_PWM_HZ)
            p.duty_u16(0)
            self._pwm[i] = p
        return i, self._pwm[i]

    def pulse_us(self, port, us):
        """Alçak seviye: darbe genişliği (500-2500 µs)."""
        i, p = self._get(port)
        us = constrain(int(us), self.MIN_US, self.MAX_US)
        p.duty_ns(us * 1000)
        return us

    def angle(self, port, deg):
        """Servoyu 0-180 derece arası bir açıya götür."""
        deg = constrain(int(deg), 0, 180)
        i, _ = self._get(port)
        self._last[i] = deg
        us = self.MIN_US + (self.MAX_US - self.MIN_US) * deg // 180
        self.pulse_us(port, us)
        return deg

    def read(self, port):
        """En son yazılan açı (geri besleme değil, hafızadaki değer)."""
        i, _ = self._get(port)
        return self._last[i]

    def sweep(self, port, start, end, ms=1000, steps=None):
        """start -> end arası yumuşak hareket (bloklar)."""
        start = constrain(int(start), 0, 180)
        end = constrain(int(end), 0, 180)
        ms = max(20, int(ms))
        if steps is None:
            steps = max(2, min(90, abs(end - start)))
        delay = ms // steps
        for s in range(steps + 1):
            self.angle(port, start + (end - start) * s // steps)
            time.sleep_ms(delay)

    def center(self):
        """Dört servoyu da 90 dereceye getir."""
        for port in range(1, len(self._pins) + 1):
            self.angle(port, 90)

    def off(self, port=None):
        """Sinyali kes. port=None ise hepsi."""
        ports = range(1, len(self._pins) + 1) if port is None else (port,)
        for pt in ports:
            _, p = self._get(pt)
            p.duty_u16(0)


# ============================================================
# WS2812 RGB LED (2 adet, GP18) — PIO tabanlı
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


class Pixels:
    """Kart üstündeki 2 RGB LED (WS2812).

        fill((r,g,b)) / set(i,(r,g,b)) / show()
        rainbow()      -> bloklamayan animasyon (döngüde çağır)
        set_brightness(pct)
        off()
    """

    def __init__(self, n=NEOPIXEL_COUNT, pin=PIN_NEOPIXEL,
                 brightness=0.2, sm_id=0):
        self.n = n
        self.brightness = brightness
        self.ar = array.array("I", [0] * n)
        self.sm = rp2.StateMachine(sm_id, _ws2812_pio, freq=8_000_000,
                                   sideset_base=Pin(pin))
        self.sm.active(1)
        self._hue = 0
        self._last = ticks_ms()

    def set(self, i, color):
        if 0 <= i < self.n:
            r, g, b = color
            self.ar[i] = (int(g) << 16) | (int(r) << 8) | int(b)

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
        """Parlaklık: 0-100 (%)."""
        self.brightness = constrain(int(pct), 0, 100) / 100
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

    def rainbow(self, interval_ms=60, step=10):
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
# Buzzer (GP22) — kartın yanındaki susturma anahtarı AÇIK olmalı
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
        freq = int(freq)
        if freq <= 0:
            self.stop()
        else:
            self.pwm.freq(freq)
            self.pwm.duty_u16(duty)
        if ms is not None:
            time.sleep_ms(int(ms))
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
# Butonlar (GP20 / GP21) — aktif düşük, dahili pull-up
# ============================================================
class Buttons:
    """İki kullanıcı butonu.

        pressed(1)      -> şu anda basılı mı?
        just_pressed(1) -> yeni basıldı mı? (okuyunca temizlenir)
        wait(1)         -> basılana kadar bekle
    """

    def __init__(self, pins=(PIN_BUTTON_1, PIN_BUTTON_2)):
        self._pins = [Pin(p, Pin.IN, Pin.PULL_UP) for p in pins]
        self._prev = [1] * len(pins)

    def _idx(self, which):
        return constrain(int(which), 1, len(self._pins)) - 1

    def raw(self, which=1):
        return self._pins[self._idx(which)].value()

    def pressed(self, which=1):
        return self.raw(which) == 0

    def just_pressed(self, which=1):
        """Kenar tespiti — basılı tutmak bir kez sayılır."""
        i = self._idx(which)
        v = self._pins[i].value()
        new = (v == 0 and self._prev[i] == 1)
        self._prev[i] = v
        return new

    def wait(self, which=1, timeout_ms=None):
        t0 = ticks_ms()
        while not self.pressed(which):
            if timeout_ms is not None and ticks_diff(ticks_ms(), t0) > timeout_ms:
                return False
            time.sleep_ms(10)
        return True


# ============================================================
# Pil / besleme ölçümü (GP29, kart üstü 1/2 bölücü)
# ============================================================
class Battery:
    def __init__(self, pin=PIN_VBAT, divider=VBAT_DIVIDER):
        self.adc = ADC(Pin(pin))
        self.divider = divider

    def voltage(self):
        s = 0
        for _ in range(8):             # motor gürültüsünü bastır
            s += self.adc.read_u16()
        return s // 8 * 3.3 / 65535 * self.divider

    def percent(self):
        v = self.voltage()
        pct = (v - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100
        return int(constrain(pct, 0, 100))


# ============================================================
# Ultrasonik HC-SR04 (Grove portuna takılır) — medyan filtreli
# ============================================================
class Ultrasonic:
    def __init__(self, trig=PIN_TRIG, echo=PIN_ECHO, timeout_us=15000):
        self.set_pins(trig, echo)
        self.timeout_us = timeout_us

    def set_pins(self, trig, echo):
        """Sensörü başka bir Grove portuna taşıdıysanız çağırın."""
        self.trig = Pin(int(trig), Pin.OUT, value=0)
        self.echo = Pin(int(echo), Pin.IN)

    def _pulse(self):
        self.trig.value(0); sleep_us(4)
        self.trig.value(1); sleep_us(10)
        self.trig.value(0)
        return time_pulse_us(self.echo, 1, self.timeout_us)

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

    def distance_mm(self):
        t = self._pulse()
        return 0xFFFF if t < 0 else min(int(t * 0.343 / 2), 65000)

    def obstacle(self, cm=15):
        """Önünde cm'den yakın engel var mı? (3 örnekli, güvenilir)"""
        return self.distance_cm(samples=3) < cm


# ============================================================
# Analog çizgi sensörleri (Grove'a takılır — varsayılan GP26/GP27)
# ============================================================
class LineSensors:
    def __init__(self, left=PIN_LINE_L, right=PIN_LINE_R, threshold=50000):
        self.set_pins(left, right)
        self.threshold = threshold

    def set_pins(self, left, right):
        self.left = ADC(Pin(int(left)))
        self.right = ADC(Pin(int(right)))

    def raw(self):
        return self.left.read_u16(), self.right.read_u16()

    def on_line(self):
        """(sol_cizgide, sag_cizgide) — True = siyah çizgi görüyor."""
        l, r = self.raw()
        return l >= self.threshold, r >= self.threshold


# ============================================================
# RoboCytron — hepsi bir arada (SINGLETON)
# ============================================================
_singleton = None


class RoboCytron:
    """Cytron Maker Pi RP2040'ın tüm donanımını tek nesnede toplar.

        from robocytron import RoboCytron
        bot = RoboCytron()
        bot.motors.drive(60, 60)
        bot.servos.angle(1, 90)
        bot.pixels.fill((0, 0, 255)); bot.pixels.show()
        bot.buzzer.horn()
        print(bot.sonar.distance_cm())

    SINGLETON'dur: kaç kez RoboCytron() çağrılırsa çağrılsın aynı
    örnek döner, böylece PIO state machine / PWM iki kez kurulmaz.

    Ağır olmayan parçalar (motor, RGB, buzzer, buton, pil) hemen
    kurulur. Karta takılı olmayabilecek parçalar (ultrasonik, çizgi)
    TEMBEL kurulur — ilk kullanıldıklarında pin ayrılır.
    """

    def __new__(cls, *args, **kwargs):
        global _singleton
        if _singleton is None:
            _singleton = super().__new__(cls)
        return _singleton

    def __init__(self, start_pixels=True):
        if getattr(self, '_ready', False):
            return
        self._ready = True
        self.motors = Motors()
        self.servos = Servos()
        self.pixels = Pixels() if start_pixels else None
        self.buzzer = Buzzer()
        self.buttons = Buttons()
        self.battery = Battery()
        self._sonar = None
        self._line = None

    # --- tembel kurulan sensörler ---
    @property
    def sonar(self):
        if self._sonar is None:
            self._sonar = Ultrasonic()
        return self._sonar

    @property
    def line(self):
        if self._line is None:
            self._line = LineSensors()
        return self._line

    # --- kısa yollar ---
    def stop_all(self):
        self.motors.stop()
        self.buzzer.stop()
        self.servos.off()
        if self.pixels:
            self.pixels.off()

    def battery_pct(self):
        return self.battery.percent()

    def battery_v(self):
        return round(self.battery.voltage(), 2)

    def analog(self, pin):
        """Herhangi bir Grove analog pinini oku (GP26/27/28/29)."""
        return ADC(Pin(int(pin))).read_u16()

    def grove(self, port):
        """Grove port numarasından (1-7) pin çiftini döndürür."""
        return GROVE.get(int(port), (None, None))
