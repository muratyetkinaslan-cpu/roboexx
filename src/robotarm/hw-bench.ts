/**
 * 🔌 SANAL DONANIM TEZGÂHI — RoboArm simülasyonu için çevre birimleri.
 *
 * SORUN: Kol paneli yalnızca 🦾 `rx_arm_*` bloklarını tanıyordu. Müfredatın
 * 71 görevi ise `rx_servo_angle` (D4-D7), buzzer (D8), 3 pinli RGB (D9-D11),
 * röle (D3), buton (D2), HC-SR04 (D12/D13) ve analog girişler (A0-A2)
 * kullanıyor. Bu bloklar panelde `noopAsync` idi: öğrenci görevi yazıp
 * "Simülasyonda çalıştır"a basıyor, kol kıpırdamıyordu.
 *
 * BU DOSYA: Arduino Uno + Sensor Shield kurulumunun sanal karşılığını tutar.
 * Panel buradan okur, blok programı buraya yazar.
 *
 * PİN HARİTASI (müfredat v3 ile birebir):
 *   D2  buton          D8  buzzer        D12 HC-SR04 trig
 *   D3  röle           D9  RGB kırmızı   D13 HC-SR04 echo
 *   D4  taban servo    D10 RGB yeşil     A0 (26) potansiyometre
 *   D5  omuz servo     D11 RGB mavi      A1 (27) LDR
 *   D6  dirsek servo                     A2 (28) LM35 sıcaklık
 *   D7  tutucu servo
 */

/** Servo pini → kol eklemi. Panelin eklem ayarlarından bağımsızdır:
 *  müfredat sabit pin kullandığı için burada da sabittir. */
export const SERVO_PIN_JOINT: Record<number, number> = { 4: 0, 5: 1, 6: 2, 7: 3 };

export const PIN = {
  buton: 2, role: 3, buzzer: 8,
  rgbR: 9, rgbG: 10, rgbB: 11,
  trig: 12, echo: 13,
  pot: 26, ldr: 27, lm35: 28,
} as const;

/** Kolun bozulmaması için müfredatın güvenli açı aralıkları. */
export const GUVENLI_ACI: Record<number, [number, number]> = {
  0: [30, 150], 1: [30, 150], 2: [30, 150], 3: [40, 140],
};

export interface BenchState {
  /** RGB modülünün üç bacağı (dijital) */
  rgb: { 9: 0 | 1; 10: 0 | 1; 11: 0 | 1 };
  /** WS2812 bloğu kullanılırsa doğrudan renk */
  rgbHex: string | null;
  role: 0 | 1;
  buzzer: { freq: number } | null;
  /** Diğer pinlerin son yazılan değeri (LED, PWM vb.) */
  pinler: Record<number, number>;
  /** Kullanıcının panelden ayarladığı giriş değerleri */
  girisler: { mesafe: number; pot: number; ldr: number; sicaklik: number; buton: boolean; irKod: number };
  /** Güvenli aralık dışına çıkan komutlar — panelde uyarı olarak gösterilir */
  uyarilar: string[];
}

function bosDurum(): BenchState {
  return {
    rgb: { 9: 0, 10: 0, 11: 0 },
    rgbHex: null,
    role: 0,
    buzzer: null,
    pinler: {},
    girisler: { mesafe: 20, pot: 50, ldr: 50, sicaklik: 24, buton: false, irKod: 0 },
    uyarilar: [],
  };
}

type Dinleyici = (s: BenchState) => void;

/**
 * Tek örnekli (singleton) tezgâh. React tarafı `abone` ile dinler,
 * blok programı `yaz*` metotlarıyla yazar.
 */
class HardwareBench {
  private s: BenchState = bosDurum();
  private dinleyiciler = new Set<Dinleyici>();
  /** Ses için tek osilatör — her tone çağrısında yeniden kurulmaz. */
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  durum(): BenchState { return this.s; }

  abone(fn: Dinleyici): () => void {
    this.dinleyiciler.add(fn);
    return () => { this.dinleyiciler.delete(fn); };
  }

  private yayinla(): void {
    this.s = { ...this.s };
    for (const fn of this.dinleyiciler) fn(this.s);
  }

  sifirla(): void {
    const girisler = this.s.girisler;      // kullanıcının slider ayarları korunur
    this.sustur();
    this.s = { ...bosDurum(), girisler };
    this.yayinla();
  }

  // ── Programın yazdıkları ────────────────────────────────────────

  /** RGB bacaklarının pinleri — kurulumdan gelir. */
  private rgbPin: [number, number, number] = [PIN.rgbR, PIN.rgbG, PIN.rgbB];
  private rolePin: number = PIN.role;

  /** Kurulum değişince çağrılır: hangi pin hangi bacak? */
  pinAyarla(c: { rgbR: number; rgbG: number; rgbB: number; role: number }): void {
    this.rgbPin = [c.rgbR, c.rgbG, c.rgbB];
    this.rolePin = c.role;
  }

  dijitalYaz(pin: number, deger: number): void {
    const v = deger ? 1 : 0;
    const idx = this.rgbPin.indexOf(pin);
    if (idx >= 0) {
      // Panel her zaman 9/10/11 anahtarlarıyla gösterir; pin değişse bile
      // kırmızı/yeşil/mavi sırası korunur.
      const anahtar = [9, 10, 11][idx];
      this.s.rgb = { ...this.s.rgb, [anahtar]: v } as BenchState['rgb'];
      this.s.rgbHex = null;
      this.yayinla();
      return;
    }
    if (pin === this.rolePin) { this.s.role = v as 0 | 1; this.yayinla(); return; }
    if (pin === PIN.rgbR || pin === PIN.rgbG || pin === PIN.rgbB) {
      this.s.rgb = { ...this.s.rgb, [pin]: v } as BenchState['rgb'];
      this.s.rgbHex = null;
    } else if (pin === PIN.role) {
      this.s.role = v as 0 | 1;
    } else {
      this.s.pinler = { ...this.s.pinler, [pin]: v };
    }
    this.yayinla();
  }

  pwmYaz(pin: number, oran: number): void {
    this.s.pinler = { ...this.s.pinler, [pin]: Math.max(0, Math.min(100, Math.round(oran))) };
    this.yayinla();
  }

  /** WS2812 blokları için doğrudan renk. */
  rgbRenk(hex: string | null): void {
    this.s.rgbHex = hex;
    if (hex === '#000000' || hex === null) this.s.rgb = { 9: 0, 10: 0, 11: 0 };
    this.yayinla();
  }

  ot(freq: number): void {
    this.s.buzzer = { freq: Math.round(freq) };
    this.yayinla();
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.ctx.destination);
        this.osc = this.ctx.createOscillator();
        this.osc.type = 'square';
        this.osc.connect(this.gain);
        this.osc.start();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.osc!.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.005);
      this.gain!.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.005);
    } catch { /* ses cihazı yoksa sessiz devam */ }
  }

  sustur(): void {
    if (this.s.buzzer) { this.s.buzzer = null; this.yayinla(); }
    try {
      if (this.ctx && this.gain) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    } catch { /* yoksay */ }
  }

  /** Güvenli açı dışına çıkan servo komutunu kaydeder (panelde uyarı olur). */
  aciUyar(eklem: number, aci: number): void {
    const [lo, hi] = GUVENLI_ACI[eklem] ?? [0, 180];
    if (aci >= lo && aci <= hi) return;
    const ad = ['Taban', 'Omuz', 'Dirsek', 'Tutucu'][eklem] ?? '?';
    const msg = `${ad} ${aci}° — güvenli aralık ${lo}-${hi}°`;
    if (this.s.uyarilar.includes(msg)) return;
    this.s.uyarilar = [...this.s.uyarilar.slice(-4), msg];
    this.yayinla();
  }

  // ── Programın okudukları ────────────────────────────────────────

  oku(alan: keyof BenchState['girisler']): number | boolean { return this.s.girisler[alan]; }

  girisAyarla<K extends keyof BenchState['girisler']>(alan: K, deger: BenchState['girisler'][K]): void {
    this.s.girisler = { ...this.s.girisler, [alan]: deger };
    this.yayinla();
  }

  /** Analog pin numarasına göre doğru girişi döndürür. */
  analogOku(pin: number): number {
    if (pin === PIN.ldr) return this.s.girisler.ldr;
    if (pin === PIN.lm35) return this.s.girisler.sicaklik;
    return this.s.girisler.pot;
  }
}

export const bench = new HardwareBench();

/** RGB bacaklarından görüntülenecek renk. */
export function rgbRengi(s: BenchState): string {
  if (s.rgbHex) return s.rgbHex;
  const r = s.rgb[9] ? 255 : 0, g = s.rgb[10] ? 255 : 0, b = s.rgb[11] ? 255 : 0;
  return `rgb(${r},${g},${b})`;
}
export function rgbAcikMi(s: BenchState): boolean {
  return !!(s.rgbHex && s.rgbHex !== '#000000') || !!(s.rgb[9] || s.rgb[10] || s.rgb[11]);
}
