"""
PCA9685 16-kanal I2C PWM/Servo sürücüsü — RoboExx için MicroPython kütüphanesi.

Adafruit PCA9685 ve uyumlu kartları destekler. Pico W üzerinde I2C0 (GP4/GP5)
veya I2C1 (GP6/GP7, GP10/GP11 vs.) kullanılabilir.

Kullanım — RoboExx Blokları'ndan üretilen kod:
    from pca9685 import init_pca9685, servo_v3
    init_pca9685(sda=4, scl=5, addr=0x40, freq=50)   # bir kez, başlangıçta
    servo_v3(0, 90)                                   # kanal 0, 90°
    servo_v3(1, 45)                                   # kanal 1, 45°
    servo_v3(2, 120)                                  # kanal 2, 120°

`init_pca9685()` çağrılmadan da servo_v3 çalışır — ilk çağrıda default config
ile otomatik başlatılır (geriye dönük uyum).
"""

from machine import Pin, I2C
import time

# Modül-level cache — tek I2C bus + tek PCA9685 instance
_pca = None
_cur_cfg = None  # (sda, scl, addr, freq)
_default_cfg = (4, 5, 0x40, 50)  # init_pca9685() ile değiştirilebilir


class PCA9685:
    """Minimal PCA9685 sürücüsü — servo amaçlı.

    Datasheet referans register'lar:
      MODE1      = 0x00
      PRESCALE   = 0xFE
      LED0_ON_L  = 0x06  (her kanal 4 byte: ON_L, ON_H, OFF_L, OFF_H)
    """

    MODE1 = 0x00
    PRESCALE = 0xFE
    LED0_ON_L = 0x06

    def __init__(self, i2c, address=0x40):
        self.i2c = i2c
        self.address = address
        # Sleep modundan çık + auto-increment etkin
        self._write8(self.MODE1, 0x00)
        time.sleep_ms(5)

    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.address, reg, bytes([value & 0xFF]))

    def _read8(self, reg):
        return self.i2c.readfrom_mem(self.address, reg, 1)[0]

    def set_pwm_freq(self, freq_hz):
        """Servo için 50 Hz, motor için 1000 Hz tipik."""
        # prescale = round(25MHz / (4096 * freq)) - 1
        prescale = int(round(25000000.0 / (4096.0 * freq_hz)) - 1)
        if prescale < 3:
            prescale = 3
        if prescale > 255:
            prescale = 255
        old_mode = self._read8(self.MODE1)
        # Sleep'e geç, prescale yaz, geri dön
        self._write8(self.MODE1, (old_mode & 0x7F) | 0x10)
        self._write8(self.PRESCALE, prescale)
        self._write8(self.MODE1, old_mode)
        time.sleep_ms(5)
        # Restart
        self._write8(self.MODE1, old_mode | 0xA1)

    def set_pwm(self, channel, on, off):
        """0..15 kanal, on/off 0..4095."""
        if channel < 0 or channel > 15:
            return
        base = self.LED0_ON_L + 4 * channel
        self.i2c.writeto_mem(
            self.address, base,
            bytes([on & 0xFF, (on >> 8) & 0x0F, off & 0xFF, (off >> 8) & 0x0F])
        )

    def set_off(self, channel):
        """Bir kanalı tamamen kapat (servo gücünü serbest bırakır)."""
        self.set_pwm(channel, 0, 0)


def _ensure():
    """I2C ve PCA9685 nesnesini hazır tut (sadece default_cfg değiştiyse yeniden başlat)."""
    global _pca, _cur_cfg
    cfg = _default_cfg
    if _pca is not None and _cur_cfg == cfg:
        return _pca
    sda, scl, addr, freq = cfg
    # Pico'da SDA pin'inden I2C bus ID seçimi
    # GP0/1, GP4/5, GP8/9, GP12/13, GP16/17, GP20/21 → I2C0
    # GP2/3, GP6/7, GP10/11, GP14/15, GP18/19, GP26/27 → I2C1
    i2c_id = 0 if (sda % 4) == 0 else 1
    try:
        i2c = I2C(i2c_id, sda=Pin(sda), scl=Pin(scl), freq=400000)
    except Exception:
        # Bus ID otomatik seçim hatalıysa diğerini dene
        i2c_id = 1 - i2c_id
        i2c = I2C(i2c_id, sda=Pin(sda), scl=Pin(scl), freq=400000)
    _pca = PCA9685(i2c, address=addr)
    _pca.set_pwm_freq(freq)
    _cur_cfg = cfg
    return _pca


def init_pca9685(sda=4, scl=5, addr=0x40, freq=50):
    """PCA9685'i belirli pin/adres/frekans ile başlat (bir kez, başlangıçta çağır).

    Bu fonksiyon modül-level config'i set eder; sonraki servo_v3() çağrıları
    aynı config'i kullanır.

    Parametreler:
      sda    : I2C SDA pin numarası (default 4 — Pico'da GP4)
      scl    : I2C SCL pin numarası (default 5 — Pico'da GP5)
      addr   : I2C adresi (default 0x40 — Adafruit varsayılan)
      freq   : PWM frekansı Hz (default 50 — servo standardı)
    """
    global _default_cfg
    _default_cfg = (sda, scl, addr, freq)
    # Hemen başlat ki ilk servo çağrısı gecikmesin
    _ensure()


def _angle_to_ticks(angle_deg, min_us=500, max_us=2500, freq_hz=50):
    """0..180° → PCA9685 4096-tick pulse karşılığı."""
    if angle_deg < 0:
        angle_deg = 0
    elif angle_deg > 180:
        angle_deg = 180
    pulse_us = min_us + (max_us - min_us) * angle_deg / 180.0
    period_us = 1000000.0 / freq_hz
    ticks = int(round(pulse_us / period_us * 4096))
    if ticks < 0:
        ticks = 0
    elif ticks > 4095:
        ticks = 4095
    return ticks


def servo_v3(channel, angle):
    """PCA9685 kanalına servo açısı yaz.

    channel : 0-15
    angle   : 0-180 derece

    Pin/adres ayarları için önce init_pca9685() çağırın. Çağrılmamışsa
    default config (SDA=4, SCL=5, 0x40, 50 Hz) otomatik kullanılır.
    """
    pca = _ensure()
    freq = _default_cfg[3]
    ticks = _angle_to_ticks(angle, freq_hz=freq)
    pca.set_pwm(channel, 0, ticks)
    print("@SV C%d %d" % (channel, max(0, min(180, int(angle)))))  # simülasyon senkronu


def servo_v3_off(channel):
    """Belirli kanalın PWM'ini durdur (servonun gücünü serbest bırakır)."""
    pca = _ensure()
    pca.set_off(channel)
