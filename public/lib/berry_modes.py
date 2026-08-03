# ============================================================
# berry_modes.py — Bootloader v4'ün boşta modu davranışları
# ------------------------------------------------------------
# _idle_mode() mesaj beklerken her ~20 ms'de bir Modes.step()
# çağırır. Bloklamayı EN AZA indirmek esastır: uzun sleep'ler
# BLE mesajlarını geciktirir (BEGIN el sıkışması yine tolere
# eder ama gerek yok).
#
# İçerik:
#   • Buton: kısa basış → mod değiştir, 1 sn uzun basış → pil göstergesi
#   • Modlar: 0 BLE/boşta · 1 IR kumanda · 2 çizgi · 3 ışık · 4 sonik · 5 sumo
#   • WASD canlı sürüş (MSG_KEY) — 600 ms veri gelmezse güvenli duruş
#   • PicoBricks GO (0x52) paketleri: joystick, modlar, korna, RGB, matris
# ============================================================

import time
from utime import ticks_ms, ticks_diff
from berrybot import constrain

FWD, BWD, RIGHT, LEFT, STOP = 1, 2, 3, 4, 0
Max, Mid, Low = 100, 76, 72
LDR_TH = 250
LDR_TOL = 5000

_ICONS = ['bluetooth', 'ir', 'tracker', 'sunny', 'sonic', 'triangle']


class Modes:
    def __init__(self, bot, mod):
        self.bot = bot
        self.mod = mod                 # BleUartModule (legacy okuma için)
        self.mode = 0
        self.keys = ''
        self.keys_at = 0
        self.keys_active = False
        self.legacy_mode = 0           # GO uygulaması: 1 sonik 2 çizgi 3 ışık 4 sumo
        self._line_dir = STOP
        self._sumo_cnt = 0
        self._sonic_left = 0
        self._sonic_state = 0          # bloklamayan sonik durum makinesi
        self._sonic_t = 0
        self._btn_down_at = None
        self._rgb = [[0, 0, 127]] * 7
        if bot.matrix:
            bot.matrix.show(_ICONS[0])
        bot.ring.set_all(self._rgb)
        bot.ring.show()

    # -------------------- dış API --------------------
    def set_keys(self, keys_bytes):
        try:
            self.keys = keys_bytes.decode('ascii', 'ignore').lower()
        except Exception:
            self.keys = ''
        self.keys_at = ticks_ms()

    def handle_legacy(self, mod):
        """0x52 başlığı okundu; kalan baytları kısa boşluk penceresiyle al."""
        buf = bytearray([0x52])
        deadline = time.ticks_add(ticks_ms(), 30)
        while ticks_diff(deadline, ticks_ms()) > 0 and len(buf) < 10:
            if mod.uart.any():
                b = mod.uart.read(1)
                if b:
                    buf += b
                    deadline = time.ticks_add(ticks_ms(), 15)
            else:
                time.sleep_ms(1)
        self._legacy_dispatch(buf)

    def step(self):
        """~20 ms'de bir çağrılır. Kısa tutulmalı."""
        self._check_button()
        if self.mode == 0:
            if self._drive_from_keys():
                return
            if self.legacy_mode == 1:
                self._mode_sonic()
            elif self.legacy_mode == 2:
                self._mode_line()
            elif self.legacy_mode == 3:
                self._mode_light()
            elif self.legacy_mode == 4:
                self._mode_sumo()
        elif self.mode == 1:
            self._mode_ir()
        elif self.mode == 2:
            self._mode_line()
        elif self.mode == 3:
            self._mode_light()
        elif self.mode == 4:
            self._mode_sonic()
        elif self.mode == 5:
            self._mode_sumo()

    # -------------------- buton --------------------
    def _check_button(self):
        pressed = self.bot.button.value() == 1
        now = ticks_ms()
        if pressed and self._btn_down_at is None:
            self._btn_down_at = now
        elif pressed and self._btn_down_at is not None:
            if ticks_diff(now, self._btn_down_at) > 1000:
                # uzun basış → pil göstergesi
                self.bot.stop_all()
                self.bot.show_battery()
                while self.bot.button.value():
                    time.sleep_ms(20)
                self._btn_down_at = None
                if self.bot.matrix:
                    self.bot.matrix.show(_ICONS[self.mode])
        elif (not pressed) and self._btn_down_at is not None:
            if ticks_diff(now, self._btn_down_at) > 40:   # debounce
                self.bot.stop_all()
                self.mode = (self.mode + 1) % 6
                self.legacy_mode = 0
                self._line_dir = STOP
                if self.bot.matrix:
                    self.bot.matrix.show(_ICONS[self.mode])
                self.bot.buzzer.beep(40, 1200)
            self._btn_down_at = None

    # -------------------- WASD --------------------
    def _drive_from_keys(self):
        if not self.keys or ticks_diff(ticks_ms(), self.keys_at) > 600:
            if self.keys_active:
                self.bot.motors.stop()
                self.keys_active = False
            return False
        k = self.keys
        y = 100 if 'w' in k else (-100 if 's' in k else 0)
        x = 60 if 'd' in k else (-60 if 'a' in k else 0)
        self.bot.motors.drive(constrain(y + x, -100, 100),
                              constrain(y - x, -100, 100))
        self.keys_active = True
        return True

    # -------------------- GO uygulaması --------------------
    def _legacy_dispatch(self, b):
        if len(b) < 3:
            return
        bot = self.bot
        if b[1] == 2:
            c = b[2]
            if c == 99:
                self.legacy_mode = 0
                bot.motors.stop()
            elif c == 1:
                bot.ring.off()
            elif c == 90:
                bot.ring.set_all(self._rgb); bot.ring.show()
            elif c == 2:
                bot.buzzer.horn()
            elif c == 4:
                self.legacy_mode = 1
            elif c == 8:
                self.legacy_mode = 2
            elif c == 16:
                self.legacy_mode = 3
            elif c == 32:
                self.legacy_mode = 4
        elif b[1] == 3 and len(b) >= 4:
            self.legacy_mode = 0
            if b[2] == 0 and b[3] == 0:
                bot.motors.stop()
            else:
                bot.motors.joystick(b[2], b[3])
        elif b[1] == 7 and len(b) >= 6:
            idx = constrain(b[2] - 1, 0, 6)
            self._rgb[idx] = [b[3], b[4], b[5]]
            bot.ring.set_all(self._rgb); bot.ring.show()
        elif b[1] == 6 and len(b) >= 7 and bot.matrix:
            bot.matrix.show(list(b[2:7]))

    # -------------------- hazır modlar --------------------
    def _mode_ir(self):
        bot = self.bot
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
        elif code == IR.KEY_OK:
            bot.buzzer.horn()

    def _mode_line(self):
        bot = self.bot
        l_on, r_on = bot.line.on_line()
        if l_on and r_on:
            d = FWD
        elif r_on:
            d = RIGHT
        elif l_on:
            d = LEFT
        elif self._line_dir != STOP:
            d = BWD
        else:
            d = STOP
        if d != self._line_dir:
            self._line_dir = d
            bot.motors.move(d, Low if d == BWD else Mid)

    def _mode_light(self):
        bot = self.bot
        L, R = bot.light.raw()
        if L >= LDR_TH and R >= LDR_TH:
            if bot.sonar.distance_cm() < 10:
                bot.motors.stop(); time.sleep_ms(20)
                bot.motors.move(LEFT, Mid); time.sleep_ms(400)
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

    def _mode_sumo(self):
        bot = self.bot
        dist = bot.sonar.distance_cm()
        l_on, r_on = bot.line.on_line()
        if l_on or r_on:
            bot.motors.move(BWD, Mid)
            time.sleep_ms(400 if dist <= 15 else 100)
            bot.motors.stop()
        elif dist <= 15:
            bot.motors.move(FWD, Max); time.sleep_ms(250)
        else:
            self._sumo_cnt += 1
            if self._sumo_cnt >= 3:
                self._sumo_cnt = 0
                bot.motors.move(FWD, Mid); time.sleep_ms(100)
            else:
                bot.motors.move(LEFT, Mid); time.sleep_ms(100)
                bot.motors.stop()

    def _mode_sonic(self):
        """Bloklamayan engelden kaçma — durum makinesi (step başına <1ms)."""
        bot = self.bot
        now = ticks_ms()
        st = self._sonic_state
        if st == 0:                                     # ilerle / engel ara
            if bot.sonar.distance_cm() > 12:
                bot.motors.move(FWD, Max)
            else:
                bot.motors.stop()
                self._sonic_state = 1
                self._sonic_t = now
        elif st == 1 and ticks_diff(now, self._sonic_t) > 250:
            bot.motors.move(BWD, Max)
            self._sonic_state = 2
            self._sonic_t = now
        elif st == 2 and ticks_diff(now, self._sonic_t) > 120:
            bot.motors.stop()
            self._sonic_state = 3
            self._sonic_t = now
        elif st == 3 and ticks_diff(now, self._sonic_t) > 150:
            bot.motors.move(LEFT, Mid)
            self._sonic_state = 4
            self._sonic_t = now
            self._sonic_dur = 500 if self._sonic_left == 0 else 1000
            self._sonic_left ^= 1
        elif st == 4 and ticks_diff(now, self._sonic_t) > getattr(self, '_sonic_dur', 500):
            bot.motors.stop()
            self._sonic_state = 0
