/**
 * Eğitmen Kütüphanesi — kit bazlı hazır kod dosyaları.
 *
 * Üç kit: RoboArm, BerryBot, Tank. Her kitin altında derste kullanılmaya
 * hazır MicroPython kod dosyaları bulunur. Eğitmen istediğini panoya
 * kopyalayabilir veya bağlı olduğu öğrencinin ekranına tek tıkla gönderebilir.
 *
 * Kodlar RoboExx kütüphanesini (roboexx.py — "Modülleri Yükle" ile karta
 * yazılır) kullanır ve blok uygulamasının ürettiği kodla aynı API'dedir.
 * Pin numaraları her dosyanın başındaki AYAR bölümünden değiştirilebilir.
 */

export interface KitCodeFile {
  id: string;
  /** Dosya adı (panelde görünen başlık) */
  name: string;
  /** Kısa açıklama — ne öğretir / ne yapar */
  desc: string;
  /** Hazır MicroPython kodu */
  code: string;
}

export interface Kit {
  id: string;
  name: string;
  /** Panel başlığındaki emoji */
  emoji: string;
  desc: string;
  files: KitCodeFile[];
}

// ════════════════════════════════════════════════════════════════════
// ROBOARM KİTİ — 4 eksenli robot kol (Taban GP0 · Omuz GP1 · Dirsek GP2 ·
// Gripper GP3, servo_angle ile doğrudan GPIO)
// ════════════════════════════════════════════════════════════════════

const ARM_TEST = `# ROBOARM · Kol Merkez ve Eksen Testi
# Tum servolari 90 dereceye (merkez) alir, sonra her ekseni
# sirayla test eder. Kolu ilk kurdugunuzda bununla baslayin.
from roboexx import *
import time

# ── AYAR: servo pinleri ─────────────────────────
TABAN   = 0   # GP0
OMUZ    = 1   # GP1
DIRSEK  = 2   # GP2
GRIPPER = 3   # GP3
# ────────────────────────────────────────────────

print("RoboArm testi basliyor...")

# 1) Hepsini merkeze al
for pin in (TABAN, OMUZ, DIRSEK, GRIPPER):
    servo_angle(pin, 90)
    time.sleep(0.4)
print("Tum eksenler 90 derecede (merkez)")
time.sleep(1)

# 2) Her ekseni sirayla 60 -> 120 -> 90 test et
isimler = ["Taban", "Omuz", "Dirsek", "Gripper"]
for i, pin in enumerate((TABAN, OMUZ, DIRSEK, GRIPPER)):
    print(isimler[i], "test ediliyor")
    for aci in (60, 120, 90):
        servo_angle(pin, aci)
        time.sleep(0.6)

print("Test bitti! Kol hazir.")
`;

const ARM_KEYBOARD = `# ROBOARM · Klavye ile Kol Kontrolu
# Bilgisayar klavyesiyle kolu canli surun:
#   A / D        -> Taban sola / saga
#   W / S        -> Omuz yukari / asagi
#   Yukari/Asagi -> Dirsek
#   BOSLUK       -> Gripper ac / kapa
# Not: "Calistir" ile baslatin; tuslar tarayicidan karta akar.
from roboexx import *
import time

# ── AYAR: servo pinleri ─────────────────────────
TABAN, OMUZ, DIRSEK, GRIPPER = 0, 1, 2, 3
ADIM = 2          # her dongude kac derece donsun
# ────────────────────────────────────────────────

taban, omuz, dirsek = 90, 90, 90
gripper_acik = True

for pin, aci in ((TABAN, taban), (OMUZ, omuz), (DIRSEK, dirsek)):
    servo_angle(pin, aci)
servo_angle(GRIPPER, 40)
print("Klavye kontrolu hazir: A/D W/S OK-YUKARI/OK-ASAGI BOSLUK")

while True:
    if tus_basili("a"): taban = min(180, taban + ADIM)
    if tus_basili("d"): taban = max(0,   taban - ADIM)
    if tus_basili("w"): omuz  = min(180, omuz  + ADIM)
    if tus_basili("s"): omuz  = max(0,   omuz  - ADIM)
    if tus_basili("\\x11"): dirsek = min(180, dirsek + ADIM)  # yukari ok
    if tus_basili("\\x12"): dirsek = max(0,   dirsek - ADIM)  # asagi ok

    if tus_basildi(" "):
        gripper_acik = not gripper_acik
        servo_angle(GRIPPER, 40 if gripper_acik else 100)
        print("Gripper:", "ACIK" if gripper_acik else "KAPALI")

    servo_angle(TABAN, taban)
    servo_angle(OMUZ, omuz)
    servo_angle(DIRSEK, dirsek)
    time.sleep(0.02)
`;

const ARM_WAVE = `# ROBOARM · Selam Ver (Demo Hareket)
# Kol once merkezlenir, sonra dirsegiyle el sallar.
# Veliler ve tanitim gunleri icin harika bir demo!
from roboexx import *
import time

TABAN, OMUZ, DIRSEK, GRIPPER = 0, 1, 2, 3

def yumusak(pin, bas, son, sure=0.6, adim=3):
    """Servoyu bas acidan son aciya yumusakca goturur."""
    if bas == son:
        return
    yon = adim if son > bas else -adim
    bekleme = sure / max(1, abs(son - bas) // abs(adim))
    a = bas
    while (yon > 0 and a < son) or (yon < 0 and a > son):
        a += yon
        servo_angle(pin, max(0, min(180, a)))
        time.sleep(bekleme)
    servo_angle(pin, son)

# Merkeze gel
for pin in (TABAN, OMUZ, DIRSEK):
    servo_angle(pin, 90)
    time.sleep(0.3)
servo_angle(GRIPPER, 40)
time.sleep(0.5)

# Kolu kaldir
yumusak(OMUZ, 90, 140, 0.8)

# 3 kere selam salla
for _ in range(3):
    yumusak(DIRSEK, 90, 130, 0.35)
    yumusak(DIRSEK, 130, 60, 0.35)
yumusak(DIRSEK, 60, 90, 0.3)

# Kolu indir
yumusak(OMUZ, 140, 90, 0.8)
print("Selam tamamlandi!")
`;

const ARM_PICK = `# ROBOARM · Nesne Al ve Birak
# Kol onundeki nesneyi alir, tabani cevirip yan tarafa birakir.
# Nesne konumuna gore ACILAR bolumundeki degerleri ayarlayin.
from roboexx import *
import time

TABAN, OMUZ, DIRSEK, GRIPPER = 0, 1, 2, 3

# ── ACILAR: kendi duzeneginize gore ayarlayin ──
ALMA_TABAN   = 90    # nesnenin oldugu yon
ALMA_OMUZ    = 55    # asagi uzanma
ALMA_DIRSEK  = 70
BIRAKMA_TABAN = 160  # birakilacak yon
GRIPPER_ACIK  = 40
GRIPPER_KAPALI = 100
# ───────────────────────────────────────────────

def git(pin, aci, bekle=0.5):
    servo_angle(pin, aci)
    time.sleep(bekle)

print("Nesne alma gorevi basliyor...")

# 1) Baslangic durusu — gripper acik, kol yukarida
git(GRIPPER, GRIPPER_ACIK, 0.3)
git(OMUZ, 120, 0.5)
git(DIRSEK, 90, 0.4)
git(TABAN, ALMA_TABAN, 0.8)

# 2) Nesneye uzan ve kavra
git(DIRSEK, ALMA_DIRSEK, 0.5)
git(OMUZ, ALMA_OMUZ, 0.8)
git(GRIPPER, GRIPPER_KAPALI, 0.6)
print("Nesne kavrandi")

# 3) Kaldir, tabani cevir
git(OMUZ, 120, 0.8)
git(TABAN, BIRAKMA_TABAN, 1.0)

# 4) Indir ve birak
git(OMUZ, ALMA_OMUZ + 10, 0.8)
git(GRIPPER, GRIPPER_ACIK, 0.5)
print("Nesne birakildi")

# 5) Merkeze don
git(OMUZ, 120, 0.6)
git(TABAN, 90, 0.8)
git(OMUZ, 90, 0.5)
git(DIRSEK, 90, 0.4)
print("Gorev tamamlandi!")
`;

// ════════════════════════════════════════════════════════════════════
// BERRYBOT KİTİ — PicoBricks motor sürücü (I2C, dc_motor 1/2),
// ultrasonik (Trig GP3 / Echo GP2), çizgi sensörleri GP26/GP27
// ════════════════════════════════════════════════════════════════════

const BERRY_TEST = `# BERRYBOT · Motor Testi
# Iki tekerin dogru yonde dondugunu kontrol eder:
# ileri -> geri -> sola don -> saga don -> dur.
# Bir teker ters donuyorsa asagida o motorun yonunu degistirin.
from roboexx import *
import time

# ── AYAR ────────────────────────────────────────
SOL_MOTOR = 1   # sol tekeri suren motor no (1 veya 2)
SAG_MOTOR = 2
HIZ = 60        # test hizi (0-100)
# ────────────────────────────────────────────────

def dur():
    dc_motor_stop_all()

print("Ileri...")
dc_motor(SOL_MOTOR, HIZ, "forward")
dc_motor(SAG_MOTOR, HIZ, "forward")
time.sleep(1.5)
dur(); time.sleep(0.5)

print("Geri...")
dc_motor(SOL_MOTOR, HIZ, "backward")
dc_motor(SAG_MOTOR, HIZ, "backward")
time.sleep(1.5)
dur(); time.sleep(0.5)

print("Sola donus...")
dc_motor(SOL_MOTOR, HIZ, "backward")
dc_motor(SAG_MOTOR, HIZ, "forward")
time.sleep(1)
dur(); time.sleep(0.5)

print("Saga donus...")
dc_motor(SOL_MOTOR, HIZ, "forward")
dc_motor(SAG_MOTOR, HIZ, "backward")
time.sleep(1)
dur()
print("Test bitti!")
`;

const BERRY_KEYBOARD = `# BERRYBOT · Klavye ile Surus (WASD)
# W ileri · S geri · A sola · D saga · tus birakinca durur.
# "Calistir" ile baslatin; tuslar tarayicidan karta akar.
from roboexx import *
import time

# ── AYAR ────────────────────────────────────────
SOL_MOTOR = 1
SAG_MOTOR = 2
HIZ = 70          # duz gidis hizi (0-100)
DONUS_HIZ = 55    # donus hizi
# ────────────────────────────────────────────────

print("WASD ile sur! (tuslari birakinca durur)")

while True:
    if tus_basili("w"):
        dc_motor(SOL_MOTOR, HIZ, "forward")
        dc_motor(SAG_MOTOR, HIZ, "forward")
    elif tus_basili("s"):
        dc_motor(SOL_MOTOR, HIZ, "backward")
        dc_motor(SAG_MOTOR, HIZ, "backward")
    elif tus_basili("a"):
        dc_motor(SOL_MOTOR, DONUS_HIZ, "backward")
        dc_motor(SAG_MOTOR, DONUS_HIZ, "forward")
    elif tus_basili("d"):
        dc_motor(SOL_MOTOR, DONUS_HIZ, "forward")
        dc_motor(SAG_MOTOR, DONUS_HIZ, "backward")
    else:
        dc_motor_stop_all()
    time.sleep(0.05)
`;

const BERRY_OBSTACLE = `# BERRYBOT · Engelden Kacan Robot
# Ultrasonik sensor onunde engel gorunce durur, geri gelir,
# rastgele bir yone doner ve yola devam eder.
from roboexx import *
import time
import random

# ── AYAR ────────────────────────────────────────
SOL_MOTOR = 1
SAG_MOTOR = 2
TRIG = 3          # ultrasonik Trig pini
ECHO = 2          # ultrasonik Echo pini
HIZ = 60
ENGEL_CM = 15     # bu mesafeden yakinsa engel say
# ────────────────────────────────────────────────

def ileri():
    dc_motor(SOL_MOTOR, HIZ, "forward")
    dc_motor(SAG_MOTOR, HIZ, "forward")

def geri():
    dc_motor(SOL_MOTOR, HIZ, "backward")
    dc_motor(SAG_MOTOR, HIZ, "backward")

def don(sola):
    if sola:
        dc_motor(SOL_MOTOR, HIZ, "backward")
        dc_motor(SAG_MOTOR, HIZ, "forward")
    else:
        dc_motor(SOL_MOTOR, HIZ, "forward")
        dc_motor(SAG_MOTOR, HIZ, "backward")

print("Engelden kacan robot basladi!")

while True:
    mesafe = ultrasonic_distance(TRIG, ECHO)
    if 0 < mesafe < ENGEL_CM:   # -1 = olcum hatasi, engel sayilmaz
        print("Engel! Mesafe:", mesafe, "cm")
        dc_motor_stop_all()
        time.sleep(0.2)
        geri()
        time.sleep(0.5)
        don(random.choice((True, False)))
        time.sleep(0.6)
        dc_motor_stop_all()
        time.sleep(0.1)
    else:
        ileri()
    time.sleep(0.05)
`;

const BERRY_LINE = `# BERRYBOT · Cizgi Izleyen Robot
# GP26/GP27'deki TCRT5000 cizgi sensorleriyle siyah cizgiyi izler.
# ESIK degerini pistinize gore ayarlayin: sensor cizgi ustundeyken
# okunan degeri gorup ortasindan bir esik secin.
from roboexx import *
from machine import ADC
import time

# ── AYAR ────────────────────────────────────────
SOL_MOTOR = 1
SAG_MOTOR = 2
SOL_SENSOR = 26   # GP26 = ADC0
SAG_SENSOR = 27   # GP27 = ADC1
HIZ = 55
DONUS_HIZ = 60
ESIK = 30000      # bunun USTU = siyah cizgi (0-65535)
# ────────────────────────────────────────────────

sol_adc = ADC(SOL_SENSOR)
sag_adc = ADC(SAG_SENSOR)

def cizgide(adc):
    return adc.read_u16() > ESIK

print("Cizgi izleme basladi! (degerleri gormek icin robotu cizgiye koyun)")

while True:
    sol = cizgide(sol_adc)
    sag = cizgide(sag_adc)

    if sol and sag:
        # Ikisi de cizgide -> kavsak/kalin cizgi, duz git
        dc_motor(SOL_MOTOR, HIZ, "forward")
        dc_motor(SAG_MOTOR, HIZ, "forward")
    elif sol:
        # Cizgi solda kaldi -> sola kivril
        dc_motor(SOL_MOTOR, 0, "forward")
        dc_motor(SAG_MOTOR, DONUS_HIZ, "forward")
    elif sag:
        # Cizgi sagda kaldi -> saga kivril
        dc_motor(SOL_MOTOR, DONUS_HIZ, "forward")
        dc_motor(SAG_MOTOR, 0, "forward")
    else:
        # Cizgi yok -> duz devam (kisa kopmalari tolere et)
        dc_motor(SOL_MOTOR, HIZ, "forward")
        dc_motor(SAG_MOTOR, HIZ, "forward")
    time.sleep(0.02)
`;

// ════════════════════════════════════════════════════════════════════
// TANK KİTİ — L9110 motor sürücü (her palet için IA/IB pin çifti)
// ════════════════════════════════════════════════════════════════════

/** L9110 yardımcı fonksiyonları — blok uygulamasının ürettiği kodla aynı mantık */
const L9110_HELPER = `from machine import Pin, PWM
import time

_pwm = {}
def _motor_pwm(p):
    o = _pwm.get(p)
    if o is None:
        o = PWM(Pin(p)); o.freq(1000); _pwm[p] = o
    return o

def _pin_dusuk(p):
    o = _pwm.pop(p, None)
    if o:
        try: o.duty_u16(0); o.deinit()
        except Exception: pass
    Pin(p, Pin.OUT).value(0)

def palet(ia, ib, hiz, yon):
    """L9110 palet kontrolu. yon: 1=ileri, -1=geri, 0=dur(fren). hiz: 0-100"""
    hiz = max(0, min(100, int(hiz)))
    if hiz == 0 or yon == 0:
        # FREN: iki giris HIGH = kisa devre freni (coast degil!)
        _pin_dusuk(ia); _pin_dusuk(ib)
        pa = Pin(ia, Pin.OUT); pb = Pin(ib, Pin.OUT)
        pa.value(1); pb.value(1)
        time.sleep_ms(60)
        pa.value(0); pb.value(0)
        return
    hi = ia if yon > 0 else ib
    lo = ib if yon > 0 else ia
    _pin_dusuk(lo)
    if hiz >= 100:
        o = _pwm.pop(hi, None)
        if o:
            try: o.deinit()
            except Exception: pass
        Pin(hi, Pin.OUT).value(1)
    else:
        _motor_pwm(hi).duty_u16(hiz * 65535 // 100)
`;

const TANK_TEST = `# TANK · Palet Motor Testi (L9110)
# Iki paletin dogru yonde dondugunu kontrol eder.
# Bir palet ters donuyorsa o paletin IA/IB pinlerini yer degistirin.
${L9110_HELPER}
# ── AYAR: L9110 pinleri ─────────────────────────
SOL_IA, SOL_IB = 6, 7     # sol palet
SAG_IA, SAG_IB = 8, 9     # sag palet
HIZ = 60
# ────────────────────────────────────────────────

def dur():
    palet(SOL_IA, SOL_IB, 0, 0)
    palet(SAG_IA, SAG_IB, 0, 0)

print("Ileri...")
palet(SOL_IA, SOL_IB, HIZ, 1)
palet(SAG_IA, SAG_IB, HIZ, 1)
time.sleep(1.5)
dur(); time.sleep(0.5)

print("Geri...")
palet(SOL_IA, SOL_IB, HIZ, -1)
palet(SAG_IA, SAG_IB, HIZ, -1)
time.sleep(1.5)
dur(); time.sleep(0.5)

print("Yerinde sola donus...")
palet(SOL_IA, SOL_IB, HIZ, -1)
palet(SAG_IA, SAG_IB, HIZ, 1)
time.sleep(1)
dur(); time.sleep(0.5)

print("Yerinde saga donus...")
palet(SOL_IA, SOL_IB, HIZ, 1)
palet(SAG_IA, SAG_IB, HIZ, -1)
time.sleep(1)
dur()
print("Test bitti!")
`;

const TANK_KEYBOARD = `# TANK · Klavye ile Tank Surusu (WASD)
# W ileri · S geri · A yerinde sola · D yerinde saga.
# Paletli aracin en keyifli yani: yerinde donus!
# "Calistir" ile baslatin; tuslar tarayicidan karta akar.
${L9110_HELPER}
# ── AYAR: L9110 pinleri ─────────────────────────
SOL_IA, SOL_IB = 6, 7
SAG_IA, SAG_IB = 8, 9
HIZ = 75
DONUS_HIZ = 65
# ────────────────────────────────────────────────

from roboexx import *   # klavye fonksiyonlari icin

print("WASD ile tanki sur! (tuslari birakinca durur)")

while True:
    if tus_basili("w"):
        palet(SOL_IA, SOL_IB, HIZ, 1)
        palet(SAG_IA, SAG_IB, HIZ, 1)
    elif tus_basili("s"):
        palet(SOL_IA, SOL_IB, HIZ, -1)
        palet(SAG_IA, SAG_IB, HIZ, -1)
    elif tus_basili("a"):
        palet(SOL_IA, SOL_IB, DONUS_HIZ, -1)
        palet(SAG_IA, SAG_IB, DONUS_HIZ, 1)
    elif tus_basili("d"):
        palet(SOL_IA, SOL_IB, DONUS_HIZ, 1)
        palet(SAG_IA, SAG_IB, DONUS_HIZ, -1)
    else:
        palet(SOL_IA, SOL_IB, 0, 0)
        palet(SAG_IA, SAG_IB, 0, 0)
    time.sleep(0.05)
`;

const TANK_OBSTACLE = `# TANK · Engelden Kacan Tank
# Ultrasonik sensor engel gorunce tank durur, geri gelir ve
# yerinde donerek yeni yon secer.
${L9110_HELPER}
# ── AYAR ────────────────────────────────────────
SOL_IA, SOL_IB = 6, 7
SAG_IA, SAG_IB = 8, 9
TRIG = 3          # ultrasonik Trig pini
ECHO = 2          # ultrasonik Echo pini
HIZ = 65
ENGEL_CM = 20
# ────────────────────────────────────────────────

from roboexx import *   # ultrasonic_distance icin
import random

def dur():
    palet(SOL_IA, SOL_IB, 0, 0)
    palet(SAG_IA, SAG_IB, 0, 0)

print("Engelden kacan tank basladi!")

while True:
    mesafe = ultrasonic_distance(TRIG, ECHO)
    if 0 < mesafe < ENGEL_CM:   # -1 = olcum hatasi, engel sayilmaz
        print("Engel! Mesafe:", mesafe, "cm")
        dur()
        time.sleep(0.2)
        # geri gel
        palet(SOL_IA, SOL_IB, HIZ, -1)
        palet(SAG_IA, SAG_IB, HIZ, -1)
        time.sleep(0.6)
        # rastgele yone yerinde don
        yon = random.choice((1, -1))
        palet(SOL_IA, SOL_IB, HIZ, -yon)
        palet(SAG_IA, SAG_IB, HIZ, yon)
        time.sleep(0.7)
        dur()
        time.sleep(0.1)
    else:
        palet(SOL_IA, SOL_IB, HIZ, 1)
        palet(SAG_IA, SAG_IB, HIZ, 1)
    time.sleep(0.05)
`;

// ════════════════════════════════════════════════════════════════════

export const KITS: Kit[] = [
  {
    id: 'roboarm',
    name: 'RoboArm Kiti',
    emoji: '🦾',
    desc: '4 eksenli robot kol · servo GP0–GP3',
    files: [
      { id: 'arm-test',     name: 'Kol Merkez ve Eksen Testi', desc: 'Tüm servoları merkezler, her ekseni sırayla test eder', code: ARM_TEST },
      { id: 'arm-keyboard', name: 'Klavye ile Kol Kontrolü',   desc: 'WASD + ok tuşları + boşluk ile canlı kol sürüşü', code: ARM_KEYBOARD },
      { id: 'arm-wave',     name: 'Selam Ver (Demo Hareket)',  desc: 'Kol el sallar — tanıtım günleri için demo', code: ARM_WAVE },
      { id: 'arm-pick',     name: 'Nesne Al ve Bırak',         desc: 'Kavra → taşı → bırak görev dizisi', code: ARM_PICK },
    ],
  },
  {
    id: 'berrybot',
    name: 'BerryBot Kiti',
    emoji: '🍓',
    desc: '2 tekerlekli robot · I2C motor sürücü',
    files: [
      { id: 'berry-test',     name: 'Motor Testi',            desc: 'İleri/geri/dönüş — teker yönlerini doğrular', code: BERRY_TEST },
      { id: 'berry-keyboard', name: 'Klavye ile Sürüş (WASD)', desc: 'W/A/S/D ile canlı sürüş, tuş bırakınca durur', code: BERRY_KEYBOARD },
      { id: 'berry-obstacle', name: 'Engelden Kaçan Robot',   desc: 'Ultrasonik ile engel görünce kaçar', code: BERRY_OBSTACLE },
      { id: 'berry-line',     name: 'Çizgi İzleyen Robot',    desc: 'TCRT5000 sensörlerle siyah çizgi takibi', code: BERRY_LINE },
    ],
  },
  {
    id: 'tank',
    name: 'Tank Kiti',
    emoji: '🛡️',
    desc: 'Paletli araç · L9110 motor sürücü',
    files: [
      { id: 'tank-test',     name: 'Palet Motor Testi',           desc: 'İki paletin yönünü doğrular (L9110)', code: TANK_TEST },
      { id: 'tank-keyboard', name: 'Klavye ile Tank Sürüşü (WASD)', desc: 'Yerinde dönüşlü canlı tank sürüşü', code: TANK_KEYBOARD },
      { id: 'tank-obstacle', name: 'Engelden Kaçan Tank',         desc: 'Ultrasonik ile engel algıla, geri gel, dön', code: TANK_OBSTACLE },
    ],
  },
];
