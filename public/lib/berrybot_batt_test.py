# ============================================================
# BerryBot Pil Hattı Tespit Testi — berrybot_batt_test.py
# ------------------------------------------------------------
# Amaç: BerryBot kartında pile bağlı bir ADC hattı var mı, varsa
# hangi pin ve bölücü oranı ne — bunu ölçerek bulmak.
#
# NASIL KULLANILIR (USB ile, RoboExx'te "Çalıştır" veya Thonny):
#   1. Robotu USB YERİNE PİLDEN çalıştır (güç anahtarı açık,
#      USB sadece veri için takılı kalabilir — BerryBot'ta USB
#      veri hattı ayrıdır; emin değilsen önce USB'de bir,
#      pilde bir çalıştırıp değerleri karşılaştır).
#   2. Bu dosyayı çalıştır. 4 ADC kanalını 10 sn boyunca yazdırır.
#   3. Motorlara dokunma, sensörlerin önünü kapatma.
#   4. PİL HATTI ŞÖYLE ANLAŞILIR:
#      - Sensör kanalları (çizgi/LDR) el salladıkça OYNAR.
#      - Pil hattı SABİT durur ve voltajı pil gerilimine oranlıdır:
#        tam dolu Li-ion ~4.2V → 2'ye bölücüyle ADC ~2.1V ~ 41700 ham.
#      - Robota yük bindir (elinle tekeri hafif tut, motoru döndür):
#        pil hattı 0.1-0.3V DÜŞER, sensör kanalları düşmez.
#   5. Böyle bir kanal bulursan berrybot.py başında:
#        PIN_BATTERY   = <pin>       (26/27/28/29)
#        BATTERY_DIVIDER = <oran>    (pil V / ölçülen V; multimetreyle
#                                     pil uçlarını ölçüp oranla)
#      yap, Modülleri Yükle ile tekrar yükle — gösterge çalışır.
#
#   Hiçbir kanal pil gibi davranmıyorsa kartta hazır hat yok demektir.
#   Çözüm: LDR'lerden birini feda et — BAT+ → 100kΩ → GP28 → 100kΩ → GND
#   bölücüsü lehimle, PIN_BATTERY = 28, BATTERY_DIVIDER = 2.0.
#   (3.3V üstü gerilimi ASLA bölücüsüz ADC'ye verme!)
# ============================================================

import time
from machine import ADC

PINS = (26, 27, 28, 29)
adcs = {p: ADC(p) for p in PINS}

print("Pin | ham (0-65535) | ADC volt | 2x bölücü varsayımıyla pil V")
print("-" * 62)
for i in range(20):                      # 10 saniye, 0.5 sn'de bir
    row = []
    for p in PINS:
        s = 0
        for _ in range(16):              # 16 örnek ortalaması
            s += adcs[p].read_u16()
        raw = s // 16
        v = raw * 3.3 / 65535
        row.append("GP%d:%6d %.2fV (pil? %.2fV)" % (p, raw, v, v * 2))
    print(" | ".join(row))
    time.sleep(0.5)

print()
print("Sabit kalan ve pil gerilimiyle orantili kanal = pil hatti.")
print("Bulursan: berrybot.py -> PIN_BATTERY = <pin>, BATTERY_DIVIDER = <oran>")
