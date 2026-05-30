# ============================================================
#  berrybot.py — RoboExx için BerryBot kütüphanesi
#  Robotistan BerryBot araç kiti · Raspberry Pi Pico tabanlı
#
#  Bu modül BerryBot kartının tüm donanımını SABİT pinlerle
#  hazır kurar. Bloklar buradaki basit fonksiyonları çağırır;
#  öğrenci pin girmez.
#
#  Kullanım: RoboExx "Modülleri Yükle" ile Pico köküne atılır.
# ============================================================
import array
import time
import utime
import rp2
from machine import Pin, PWM, ADC, Timer, time_pulse_us
from utime import sleep_us

# ---- BerryBot kart pinleri (sabit — main.py ile birebir) ----
_MOTOR_A1 = 24
_MOTOR_A2 = 25
_MOTOR_B1 = 23
_MOTOR_B2 = 22
_MOTOR_PWMA = 15
_MOTOR_PWMB = 21
_BUZZER_PIN = 14
_NEOPIXEL_PIN = 6
_NEOPIXEL_COUNT = 7
_IR_PIN = 20
_TRIG_PIN = 8
_ECHO_PIN = 9
_LDR_L_PIN = 29
_LDR_R_PIN = 28
_LINE_L_PIN = 26
_LINE_R_PIN = 27
_BUTTON_PIN = 10
_ROW_PINS = [7, 11, 12, 13, 17]
_COL_PINS = [18, 19, 16, 2, 3]

# ---- Yön sabitleri ----
STOP = 0
FWD = 1
BWD = 2
RIGHT = 3
LEFT = 4

# ---- Hız seviyeleri (duty_u16) ----
SPEED_LOW = 47000
SPEED_MID = 50000
SPEED_MAX = 65000


# ============================================================
#  TB6612 — çift DC motor sürücü
# ============================================================
class TB6612:
    def __init__(self, AIN1, AIN2, BIN1, BIN2, PWMA, PWMB):
        self.MOTOR_A1 = Pin(AIN1, Pin.OUT)
        self.MOTOR_A2 = Pin(AIN2, Pin.OUT)
        self.MOTOR_B1 = Pin(BIN1, Pin.OUT)
        self.MOTOR_B2 = Pin(BIN2, Pin.OUT)
        self.PWM_A = PWM(Pin(PWMA))
        self.PWM_B = PWM(Pin(PWMB))
        self.PWM_A.freq(1000)
        self.PWM_B.freq(1000)
        self.PWM_A.duty_u16(0)
        self.PWM_B.duty_u16(0)

    def setMotorSpeed(self, left_speed, right_speed):
        if right_speed > 0:
            self.MOTOR_A1.value(0)
            self.MOTOR_A2.value(1)
            self.PWM_A.duty_u16(int(min(right_speed, 255) * 257))
        elif right_speed < 0:
            self.MOTOR_A1.value(1)
            self.MOTOR_A2.value(0)
            self.PWM_A.duty_u16(int(min(-right_speed, 255) * 257))
        else:
            self.PWM_A.duty_u16(0)
        if left_speed > 0:
            self.MOTOR_B1.value(0)
            self.MOTOR_B2.value(1)
            self.PWM_B.duty_u16(int(min(left_speed, 255) * 257))
        elif left_speed < 0:
            self.MOTOR_B1.value(1)
            self.MOTOR_B2.value(0)
            self.PWM_B.duty_u16(int(min(-left_speed, 255) * 257))
        else:
            self.PWM_B.duty_u16(0)

    def move(self, direction, speed):
        if direction == FWD:
            self.PWM_A.duty_u16(speed); self.PWM_B.duty_u16(speed)
            self.MOTOR_A1.value(1); self.MOTOR_A2.value(0)
            self.MOTOR_B1.value(1); self.MOTOR_B2.value(0)
        elif direction == BWD:
            self.PWM_A.duty_u16(speed); self.PWM_B.duty_u16(speed)
            self.MOTOR_A1.value(0); self.MOTOR_A2.value(1)
            self.MOTOR_B1.value(0); self.MOTOR_B2.value(1)
        elif direction == RIGHT:
            self.PWM_A.duty_u16(speed); self.PWM_B.duty_u16(speed)
            self.MOTOR_A1.value(1); self.MOTOR_A2.value(0)
            self.MOTOR_B1.value(0); self.MOTOR_B2.value(1)
        elif direction == LEFT:
            self.PWM_A.duty_u16(speed); self.PWM_B.duty_u16(speed)
            self.MOTOR_A1.value(0); self.MOTOR_A2.value(1)
            self.MOTOR_B1.value(1); self.MOTOR_B2.value(0)
        else:  # STOP
            self.PWM_A.duty_u16(0); self.PWM_B.duty_u16(0)
            self.MOTOR_A1.value(0); self.MOTOR_A2.value(0)
            self.MOTOR_B1.value(0); self.MOTOR_B2.value(0)


# ============================================================
#  WS2812 — RGB LED şerit (7 piksel)
# ============================================================
@rp2.asm_pio(sideset_init=rp2.PIO.OUT_LOW, out_shiftdir=rp2.PIO.SHIFT_LEFT,
             autopull=True, pull_thresh=24)
def _ws2812_prog():
    T1 = 2
    T2 = 5
    T3 = 3
    wrap_target()
    label("bitloop")
    out(x, 1).side(0)[T3 - 1]
    jmp(not_x, "do_zero").side(1)[T1 - 1]
    jmp("bitloop").side(1)[T2 - 1]
    label("do_zero")
    nop().side(0)[T2 - 1]
    wrap()


class WS2812:
    def __init__(self, num_leds=7, pin_num=6, brightness=0.2):
        self.num_leds = num_leds
        self.brightness = brightness
        self.ar = array.array("I", [0 for _ in range(num_leds)])
        self.sm = rp2.StateMachine(0, _ws2812_prog, freq=8_000_000,
                                   sideset_base=Pin(pin_num))
        self.sm.active(1)

    def pixels_show(self):
        dimmer = array.array("I", [0 for _ in range(self.num_leds)])
        for i, c in enumerate(self.ar):
            r = int(((c >> 8) & 0xFF) * self.brightness)
            g = int(((c >> 16) & 0xFF) * self.brightness)
            b = int((c & 0xFF) * self.brightness)
            dimmer[i] = (g << 16) + (r << 8) + b
        self.sm.put(dimmer, 8)
        time.sleep_ms(10)

    def pixels_set(self, i, color):
        if 0 <= i < self.num_leds:
            self.ar[i] = (color[1] << 16) + (color[0] << 8) + color[2]

    def pixels_fill(self, color):
        for i in range(self.num_leds):
            self.pixels_set(i, color)


# ============================================================
#  HCSR04 — ultrasonik mesafe sensörü
# ============================================================
class HCSR04:
    def __init__(self, trigger_pin, echo_pin, echo_timeout_us=30000):
        self.echo_timeout_us = echo_timeout_us
        self.trigger = Pin(trigger_pin, mode=Pin.OUT, pull=None)
        self.trigger.value(0)
        self.echo = Pin(echo_pin, mode=Pin.IN, pull=None)

    def distance_cm(self):
        self.trigger.value(0)
        sleep_us(5)
        self.trigger.value(1)
        sleep_us(10)
        self.trigger.value(0)
        try:
            t = time_pulse_us(self.echo, 1, self.echo_timeout_us)
            if t < 0:
                return 500.0
            return (t / 2) / 29.1
        except OSError:
            return 500.0


# ============================================================
#  IR alıcı — NEC protokolü
# ============================================================
class IR_RX:
    number_1 = 0x45; number_2 = 0x46; number_3 = 0x47
    number_4 = 0x44; number_5 = 0x40; number_6 = 0x43
    number_7 = 0x07; number_8 = 0x15; number_9 = 0x09
    number_0 = 0x19
    number_ok = 0x1c
    number_up = 0x18; number_down = 0x52
    number_left = 0x08; number_right = 0x5a
    number_star = 0x16; number_hash = 0x0d


class _NEC:
    def __init__(self, pin, callback):
        self._pin = pin
        self.callback = callback
        self._nedges = 68
        self._times = array.array('i', (0 for _ in range(70)))
        self.edge = 0
        self.tim = Timer(-1)
        pin.irq(handler=self._cb_pin,
                trigger=(Pin.IRQ_FALLING | Pin.IRQ_RISING))

    def _cb_pin(self, line):
        t = utime.ticks_us()
        if self.edge <= self._nedges:
            if not self.edge:
                self.tim.init(period=80, mode=Timer.ONE_SHOT,
                              callback=self._decode)
            self._times[self.edge] = t
            self.edge += 1
        if self.edge > 68:
            self.edge = 0

    def _decode(self, _):
        try:
            if self.edge > 68:
                self.edge = 0
                return
            width = utime.ticks_diff(self._times[2], self._times[1])
            if width > 3000 and self.edge >= 68:
                val = 0
                for e in range(3, 68 - 2, 2):
                    val >>= 1
                    if utime.ticks_diff(self._times[e + 1], self._times[e]) > 1120:
                        val |= 0x80000000
                cmd = (val >> 16) & 0xff
                addr = val & 0xff
                self.edge = 0
                self.callback(cmd, addr, 0)
                return
        except Exception:
            pass
        self.edge = 0


# ============================================================
#  LED Matris — 5x5, zamanlayıcı ile taranır
# ============================================================
class LEDMatrix:
    def __init__(self, row_pins, col_pins):
        self.row_pins = [Pin(p, Pin.OUT) for p in row_pins]
        self.col_pins = [Pin(p, Pin.OUT) for p in col_pins]
        self.led_row = 0
        self.buffer = [0] * 5

    def draw_screen(self, buf):
        for i in range(5):
            self.buffer[i] = buf[i]

    def clear(self):
        self.buffer = [0] * 5

    def _set_columns(self, b):
        for i in range(5):
            self.col_pins[i].value((~b >> i) & 0x01)

    def tick(self, timer):
        if self.led_row >= 5:
            self.led_row = 0
        self._set_columns(self.buffer[self.led_row])
        self.row_pins[self.led_row].value(1)
        time.sleep_ms(1)
        self.row_pins[self.led_row].value(0)
        self.led_row += 1


# ---- Hazır matris şekilleri (main.py ile aynı) ----
SHAPES = {
    'gulen':   [0x0A, 0x0A, 0x00, 0x11, 0x0E],
    'uzgun':   [0x00, 0x0A, 0x00, 0x0E, 0x11],
    'kalp':    [0x0A, 0x1F, 0x1F, 0x0E, 0x04],
    'evet':    [0x00, 0x01, 0x02, 0x14, 0x08],
    'hayir':   [0x11, 0x0A, 0x04, 0x0A, 0x11],
    'sol':     [0x04, 0x0E, 0x15, 0x04, 0x04],
    'sag':     [0x04, 0x04, 0x15, 0x0E, 0x04],
    'ileri':   [0x04, 0x02, 0x1F, 0x02, 0x04],
    'geri':    [0x04, 0x08, 0x1F, 0x08, 0x04],
    'dolu':    [0x1F, 0x1F, 0x1F, 0x1F, 0x1F],
    'bos':     [0x00, 0x00, 0x00, 0x00, 0x00],
    'gunes':   [0x15, 0x0E, 0x1F, 0x0E, 0x15],
    'ucgen':   [0x1F, 0x11, 0x11, 0x0A, 0x04],
}


# ============================================================
#  BerryBot — kart genelinde tek nesne, sabit pinli kurulum
# ============================================================
class BerryBot:
    def __init__(self):
        self.motor = TB6612(_MOTOR_A1, _MOTOR_A2, _MOTOR_B1, _MOTOR_B2,
                            _MOTOR_PWMA, _MOTOR_PWMB)
        self.sensor = HCSR04(_TRIG_PIN, _ECHO_PIN, echo_timeout_us=10000)
        self.rgb = WS2812(_NEOPIXEL_COUNT, _NEOPIXEL_PIN, 0.2)
        self.matrix = LEDMatrix(_ROW_PINS, _COL_PINS)
        self.ldr_left = ADC(_LDR_L_PIN)
        self.ldr_right = ADC(_LDR_R_PIN)
        self.line_left = ADC(Pin(_LINE_L_PIN))
        self.line_right = ADC(Pin(_LINE_R_PIN))
        self.button = Pin(_BUTTON_PIN, Pin.IN)
        self.buzzer = PWM(Pin(_BUZZER_PIN))
        self.buzzer.freq(1000)
        self.buzzer.duty_u16(0)
        self._ir_data = 0
        self._ir = None
        # LED matris tarama zamanlayıcısı
        self._mtimer = Timer(-1)
        self._mtimer.init(period=5, mode=Timer.PERIODIC,
                          callback=self.matrix.tick)

    # ---- Hareket ----
    def ileri(self, hiz=SPEED_MAX):
        self.motor.move(FWD, hiz)

    def geri(self, hiz=SPEED_MAX):
        self.motor.move(BWD, hiz)

    def sag(self, hiz=SPEED_MID):
        self.motor.move(RIGHT, hiz)

    def sol(self, hiz=SPEED_MID):
        self.motor.move(LEFT, hiz)

    def dur(self):
        self.motor.move(STOP, 0)

    def motor_sur(self, sol_hiz, sag_hiz):
        """Sol ve sağ motoru ayrı sürer (-255..255)."""
        self.motor.setMotorSpeed(sol_hiz, sag_hiz)

    # ---- Mesafe ----
    def mesafe(self):
        """Ultrasonik mesafe — santimetre."""
        return self.sensor.distance_cm()

    # ---- Çizgi sensörü ----
    def cizgi_sol(self):
        return self.line_left.read_u16()

    def cizgi_sag(self):
        return self.line_right.read_u16()

    # ---- Işık (LDR) ----
    def isik_sol(self):
        return self.ldr_left.read_u16()

    def isik_sag(self):
        return self.ldr_right.read_u16()

    # ---- Buton ----
    def buton_basili(self):
        return self.button.value() == 1

    # ---- Buzzer ----
    def korna(self):
        self.buzzer.duty_u16(32768)
        time.sleep(0.3)
        self.buzzer.duty_u16(0)

    def ses(self, frekans, sure_ms):
        self.buzzer.freq(int(frekans))
        self.buzzer.duty_u16(32768)
        time.sleep_ms(int(sure_ms))
        self.buzzer.duty_u16(0)

    # ---- RGB şerit ----
    def rgb_tum(self, r, g, b):
        self.rgb.pixels_fill((r, g, b))
        self.rgb.pixels_show()

    def rgb_piksel(self, indeks, r, g, b):
        self.rgb.pixels_set(indeks, (r, g, b))
        self.rgb.pixels_show()

    def rgb_kapat(self):
        self.rgb.pixels_fill((0, 0, 0))
        self.rgb.pixels_show()

    # ---- LED matris ----
    def matris_sekil(self, ad):
        self.matrix.draw_screen(SHAPES.get(ad, SHAPES['bos']))

    def matris_temizle(self):
        self.matrix.clear()

    # ---- IR alıcı ----
    def ir_basla(self):
        def _cb(cmd, addr, ctrl):
            self._ir_data = cmd
        self._ir = _NEC(Pin(_IR_PIN, Pin.IN), _cb)

    def ir_tus(self):
        """Son alınan IR tuş kodunu döndürür (okuyunca sıfırlanır)."""
        v = self._ir_data
        self._ir_data = 0
        return v
