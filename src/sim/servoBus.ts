// Servo durum yolu (servo bus)
// Firmware her servo hareketinde seri porttan "@SV <id> <açı>" yankılar.
// App.tsx gelen metinde bu satırları parse edip setServo çağırır; simülasyon dinler.
// Böylece blok kodu çalışınca hem gerçek kol hem simülasyon birebir oynar.

type Listener = (id: string, angle: number) => void;

const state: Record<string, number> = {};
const ids = new Set<string>();
const listeners = new Set<Listener>();

export function setServo(id: string, angle: number): void {
  state[id] = angle;
  ids.add(id);
  listeners.forEach((l) => l(id, angle));
}

export function getServo(id: string | undefined): number | undefined {
  if (!id) return undefined;
  return state[id];
}

export function seenIds(): string[] {
  return [...ids];
}

export function onServo(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// Bir seri-port satırını parse et. Servo yankısıysa true döner.
// Kabul edilen biçimler: "@SV P0 90", "@SV M1 120", "@SV C3 45"
const RE = /@SV\s+([A-Za-z]?\d+)\s+(-?\d+(?:\.\d+)?)/;
export function parseServoLine(line: string): boolean {
  const m = line.match(RE);
  if (!m) return false;
  setServo(m[1], parseFloat(m[2]));
  return true;
}
