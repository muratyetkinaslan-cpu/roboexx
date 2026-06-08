import { useEffect, useRef, useState } from 'react';
import { ARM_DATA, ARM_H, ARM_LOGO } from './armData';
import { getServo, onServo, seenIds } from './servoBus';

// Three.js'i bağımlılık eklemeden CDN'den bir kez yükle
let threeP: Promise<any> | null = null;
function loadThree(): Promise<any> {
  const w = window as any;
  if (w.THREE) return Promise.resolve(w.THREE);
  if (threeP) return threeP;
  threeP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => res(w.THREE);
    s.onerror = () => rej(new Error('three.js yüklenemedi'));
    document.head.appendChild(s);
  });
  return threeP;
}

// Eşleme menüsündeki servo seçenekleri:
// P = Pico GPIO pini (servo_angle), M = motor sürücü servosu (servo_v2), C = PCA9685 kanalı (servo_v3)
const PIN_IDS = Array.from({ length: 23 }, (_, i) => 'P' + i);
const MOTOR_IDS = ['M1', 'M2', 'M3'];
const CH_IDS = Array.from({ length: 16 }, (_, i) => 'C' + i);
const PRESET_IDS = [...PIN_IDS, ...MOTOR_IDS, ...CH_IDS];

const JOINTS = [
  { key: 'base', label: 'Taban — yaw (Y)' },
  { key: 'shoulder', label: 'Omuz — pitch (Z)' },
  { key: 'elbow', label: 'Dirsek — pitch (Z)' },
  { key: 'grip', label: 'Gripper — aç/kapa' },
] as const;

type Mapping = { base: string; shoulder: string; elbow: string; grip: string };
const DEFAULT_MAP: Mapping = { base: 'P0', shoulder: 'P1', elbow: 'P2', grip: 'P3' };

export function RobotArmSim() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const [mapping, setMapping] = useState<Mapping>(() => {
    try {
      const s = localStorage.getItem('roboexx.armMap');
      if (s) return { ...DEFAULT_MAP, ...JSON.parse(s) };
    } catch {}
    return DEFAULT_MAP;
  });
  const [ids, setIds] = useState<string[]>(PRESET_IDS);
  const [vals, setVals] = useState<Record<string, number>>({});
  const mappingRef = useRef(mapping);
  mappingRef.current = mapping;

  useEffect(() => {
    try { localStorage.setItem('roboexx.armMap', JSON.stringify(mapping)); } catch {}
  }, [mapping]);

  // Gerçek koldan gelen servo id'lerini menüye ekle + canlı değerleri göster
  useEffect(() => {
    setIds(Array.from(new Set([...PRESET_IDS, ...seenIds()])));
    return onServo((id, angle) => {
      setIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setVals((prev) => ({ ...prev, [id]: angle }));
    });
  }, []);

  // Three.js sahnesini bir kez kur
  useEffect(() => {
    let disposed = false;
    let renderer: any = null;
    let raf = 0;
    let ro: ResizeObserver | null = null;

    loadThree().then((THREE) => {
      if (disposed || !hostRef.current) return;
      const host = hostRef.current;
      const D: any = ARM_DATA;
      const H: number = ARM_H;
      const W = () => Math.max(2, host.clientWidth);
      const Ht = () => Math.max(2, host.clientHeight);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0c0f14);
      scene.fog = new THREE.Fog(0x0c0f14, H * 3.5, H * 8.5);

      let aspect = W() / Ht();
      let viewSize = H * 1.7;
      const camera = new THREE.OrthographicCamera(
        -viewSize * aspect, viewSize * aspect, viewSize, -viewSize, -2000, 4000
      );

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W(), Ht());
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      host.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';

      scene.add(new THREE.HemisphereLight(0x9fb6d6, 0x141820, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(H, H * 1.6, H * 0.9);
      key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
      const dd = H * 1.6;
      Object.assign(key.shadow.camera, { near: 1, far: H * 6, left: -dd, right: dd, top: dd, bottom: -dd });
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xff8a3d, 0.4);
      rim.position.set(-H, H * 0.6, -H); scene.add(rim);

      // 200 cm ölçüm zemini
      const FIELD = 200;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD, FIELD),
        new THREE.MeshStandardMaterial({ color: 0x222b39, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; floor.receiveShadow = true; scene.add(floor);
      const gFine = new THREE.GridHelper(FIELD, FIELD, 0x3a4760, 0x33405a); gFine.position.y = -0.02; scene.add(gFine);
      const gMaj = new THREE.GridHelper(FIELD, FIELD / 10, 0x90a8cf, 0x6f86ad); scene.add(gMaj);

      const logoTex = new THREE.TextureLoader().load(ARM_LOGO);
      const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(H * 3, H * 3),
        new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, opacity: 0.92, depthWrite: false }));
      logoPlane.position.set(0, H * 1.05, -H * 2.0); scene.add(logoPlane);

      function mkLabel(txt: string, color: string, size: number) {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d')!; x.fillStyle = color;
        x.font = 'bold 74px Chakra Petch,Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(txt, 64, 64);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
        s.scale.set(size, size, 1); return s;
      }
      const AX = H * 1.1; scene.add(new THREE.AxesHelper(AX));
      ([['X', '#ff5555', [AX + 2, 0, 0]], ['Y', '#5dff7a', [0, AX + 2, 0]], ['Z', '#5db8ff', [0, 0, AX + 2]]] as any[])
        .forEach((a) => { const l = mkLabel(a[0], a[1], 3.2); l.position.set(a[2][0], a[2][1], a[2][2]); scene.add(l); });
      for (let d = 20; d <= 100; d += 20) {
        [[d, 0, 0], [-d, 0, 0], [0, 0, d], [0, 0, -d]].forEach((p) => {
          const l = mkLabel(String(d), '#7f8da0', 5); l.position.set(p[0], 0.3, p[2]); scene.add(l);
        });
      }
      const cmNote = mkLabel('cm', '#9aa6b6', 5); cmNote.position.set(112, 0.3, 0); scene.add(cmNote);

      const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 1, side: THREE.DoubleSide });
      const backWall = new THREE.Mesh(new THREE.PlaneGeometry(H * 6.5, H * 4.2), wallMat);
      backWall.position.set(0, H * 1.4, -H * 2.25); backWall.receiveShadow = true; scene.add(backWall);
      function textPanel(txt: string, color: string, w: number) {
        const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
        const x = c.getContext('2d')!; x.fillStyle = color;
        x.font = 'bold 110px Chakra Petch,Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(txt, 512, 128);
        return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      }
      const title = textPanel('RobotArm Training', '#ff6a1a', H * 2.8); title.position.set(0, H * 2.55, -H * 2.18); scene.add(title);
      const baseTxt = textPanel('ROBOGPT  TRAINING', '#ff6a1a', 48); baseTxt.rotation.x = -Math.PI / 2; baseTxt.position.set(0, 0.07, 26); scene.add(baseTxt);

      // ---- rig ----
      const root = new THREE.Group(); scene.add(root);
      const byGroup: any = { base: [], j1: [], j2: [], j3: [], grip: [] };
      D.parts.forEach((p: any) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p.pos), 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(p.idx), 1)); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.color, metalness: 0.45, roughness: 0.55 }));
        m.castShadow = m.receiveShadow = true; m.name = p.name; root.add(m); byGroup[p.group].push(m);
      });
      const P = D.pivots;
      const J = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
      J[0].position.set(P.j1[0], P.j1[1], P.j1[2]); root.add(J[0]);
      J[1].position.set(P.j2[0] - P.j1[0], P.j2[1] - P.j1[1], P.j2[2] - P.j1[2]); J[0].add(J[1]);
      J[2].position.set(P.j3[0] - P.j2[0], P.j3[1] - P.j2[1], P.j3[2] - P.j2[2]); J[1].add(J[2]);
      scene.updateMatrixWorld(true);
      byGroup.j1.forEach((m: any) => J[0].attach(m));
      byGroup.j2.forEach((m: any) => J[1].attach(m));
      byGroup.j3.forEach((m: any) => J[2].attach(m));
      const j3wp = new THREE.Vector3(); J[2].getWorldPosition(j3wp);
      const GC = D.grip.centers, GMAX = D.grip.max, GMID = D.grip.midz;
      const GAX = new THREE.Vector3(D.grip.axisvec[0], D.grip.axisvec[1], D.grip.axisvec[2]).normalize();
      const fingers: any[] = [];
      byGroup.grip.forEach((m: any) => {
        const c = GC[m.name] || [0, 0, 0];
        const grp = new THREE.Group(); grp.position.set(c[0] - j3wp.x, c[1] - j3wp.y, c[2] - j3wp.z); J[2].add(grp);
        grp.attach(m); fingers.push({ grp, sign: c[2] > GMID ? 1 : -1 });
      });

      const angles = [90, 90, 90, 82];     // canlı (yumuşatılmış)
      const axisArr = ['y', 'z', 'z'];
      const deg = (x: number) => (x * Math.PI) / 180;
      function apply() {
        J.forEach((g, i) => { g.rotation.set(0, 0, 0); (g.rotation as any)[axisArr[i]] = deg(angles[i] - 90); });
        const gt = Math.max(0, Math.min(1, (angles[3] - 82) / (150 - 82)));
        const grot = deg(gt * GMAX);
        fingers.forEach((f) => { f.grp.quaternion.setFromAxisAngle(GAX, f.sign * grot); });
      }
      apply();

      // ---- kamera (ortografik izometrik) + yörünge ----
      let radius = H * 5, theta = Math.PI / 4, phi = 0.955;
      const target = new THREE.Vector3(0, H * 0.55, 0);
      function cam() {
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.sin(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.cos(theta)
        );
        camera.lookAt(target);
      }
      function updateOrtho() {
        aspect = W() / Ht();
        camera.left = -viewSize * aspect; camera.right = viewSize * aspect;
        camera.top = viewSize; camera.bottom = -viewSize; camera.updateProjectionMatrix();
      }
      updateOrtho();
      const el = renderer.domElement as HTMLCanvasElement;
      let drag = false, px = 0, py = 0;
      el.addEventListener('pointerdown', (e) => { drag = true; px = e.clientX; py = e.clientY; });
      window.addEventListener('pointerup', () => { drag = false; });
      window.addEventListener('pointermove', (e) => {
        if (!drag) return;
        theta -= (e.clientX - px) * 0.008; phi -= (e.clientY - py) * 0.008;
        phi = Math.max(0.25, Math.min(1.45, phi)); px = e.clientX; py = e.clientY;
      });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        viewSize = Math.max(H * 0.4, Math.min(140, viewSize * (1 + e.deltaY * 0.0012)));
        updateOrtho();
      }, { passive: false });

      ro = new ResizeObserver(() => { renderer.setSize(W(), Ht()); updateOrtho(); });
      ro.observe(host);

      function tick() {
        raf = requestAnimationFrame(tick);
        const mp = mappingRef.current;
        const want = [getServo(mp.base), getServo(mp.shoulder), getServo(mp.elbow), getServo(mp.grip)];
        for (let j = 0; j < 4; j++) {
          if (want[j] !== undefined) angles[j] += (Math.max(0, Math.min(180, want[j]!)) - angles[j]) * 0.35;
        }
        apply(); cam(); renderer.render(scene, camera);
      }
      tick();
    }).catch((err) => console.error(err));

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (renderer) { try { renderer.dispose(); } catch {} renderer.domElement?.remove(); }
    };
  }, []);

  return (
    <div className={'arm-sim' + (fs ? ' arm-sim--fs' : '')}>
      <div className="arm-sim__canvas" ref={hostRef} />
      <div className="arm-sim__panel">
        <div className="arm-sim__row arm-sim__head">
          <span>Eksen → Servo eşlemesi</span>
          <button className="arm-sim__fs" onClick={() => setFs((v) => !v)}>
            {fs ? '⤢ Küçült' : '⤢ Tam ekran'}
          </button>
        </div>
        {JOINTS.map((j) => {
          const cur = (mapping as any)[j.key] as string;
          const live = vals[cur];
          return (
            <label key={j.key} className="arm-sim__row">
              <span className="arm-sim__lbl">{j.label}</span>
              <select
                value={cur}
                onChange={(e) => setMapping((m) => ({ ...m, [j.key]: e.target.value }))}
              >
                <option value="">—</option>
                {ids.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              <span className="arm-sim__val">{live === undefined ? '–' : Math.round(live) + '°'}</span>
            </label>
          );
        })}
        <div className="arm-sim__hint">
          Servo bloklarını çalıştır → gerçek kol oynar, aynı açı buraya gelir, simülasyon birebir oynar.
          P = Pico pini, M = motor servosu, C = PCA9685 kanalı.
        </div>
      </div>
    </div>
  );
}
