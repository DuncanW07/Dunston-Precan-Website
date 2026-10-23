import {
  Box3, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Raycaster, ShaderMaterial, SRGBColorSpace, Vector3,
} from '../../vendor/three.module.min.js';
import { STRAP } from './strap.js';

// F1-style circuit in the strap plane (watch face-on, mm): a straight out of the
// 6 o'clock lugs, a right-left-right sequence of flowing bends, then off screen.
// Positive curvature turns toward screen right.
const S0 = 3.6;
const LAYOUT = [ // [length, curvature]
  [150, 0], [70, 1 / 95], [26, 0], [95, -1 / 85], [26, 0], [120, 1 / 75], [420, 0],
];
const STEP = 1;
export const TRACK_Z = STRAP.ZC + STRAP.T0 / 2 + 0.12;

// integrate the centerline once, with eased curvature so bends blend in like real circuits
const kRaw = [];
for (const [len, k] of LAYOUT) for (let i = 0; i < len / STEP; i++) kRaw.push(k);
const N = kRaw.length;
const K = kRaw.map((_, i) => { let s = 0, n = 0; for (let j = -14; j <= 14; j++) { const v = kRaw[i + j]; if (v !== undefined) { s += v; n++; } } return s / n; });
const PX = new Float32Array(N + 1), PY = new Float32Array(N + 1), TH = new Float32Array(N + 1);
PX[0] = 0; PY[0] = -(STRAP.Y0 + S0); TH[0] = -Math.PI / 2;
for (let i = 0; i < N; i++) {
  TH[i + 1] = TH[i] + K[i] * STEP;
  const a = (TH[i] + TH[i + 1]) / 2;
  PX[i + 1] = PX[i] + Math.cos(a) * STEP; PY[i + 1] = PY[i] + Math.sin(a) * STEP;
}
export const TRACK_LEN = N * STEP;
const kAt = (s) => K[Math.min(Math.max(Math.round(s / STEP), 0), N - 1)];
const avgK = (s, w) => { let t = 0, n = 0; for (let d = -w; d <= w; d += 2) { t += kAt(s + d); n++; } return t / n; };

export function trackPoint(s) {
  const f = Math.min(Math.max(s / STEP, 0), N - 0.001), i = Math.floor(f), u = f - i;
  const th = TH[i] + (TH[i + 1] - TH[i]) * u;
  return { x: PX[i] + (PX[i + 1] - PX[i]) * u, y: PY[i] + (PY[i + 1] - PY[i]) * u, tx: Math.cos(th), ty: Math.sin(th), k: kAt(s) };
}

const widthAt = (s) => 21 + 9 * Math.min(Math.max((s - 70) / 140, 0), 1) ** 2;
const RUNOFF = 9;

// Racing line: outside on entry, clip the inside apex, run out wide on exit.
export function racingLine(s) {
  const hw = widthAt(s) / 2;
  const apex = avgK(s, 22) * 85, entry = avgK(s + 40, 18) * 85;
  return Math.max(-1, Math.min(1, apex * 1.1 - entry * 0.85)) * hw * 0.68; // + = left of travel
}

function ribbon() {
  const rows = N + 1;
  const pos = new Float32Array(rows * 6), uv = new Float32Array(rows * 4), sa = new Float32Array(rows * 2), ka = new Float32Array(rows * 2), wa = new Float32Array(rows * 2);
  const idx = [];
  for (let r = 0; r < rows; r++) {
    const s = r * STEP, p = trackPoint(s), hw = widthAt(s) / 2, w = hw + RUNOFF;
    const nx = -p.ty, ny = p.tx; // left of travel
    const kk = avgK(s, 10);
    for (let c = 0; c < 2; c++) {
      const side = c === 0 ? 1 : -1, i = r * 2 + c;
      pos[i * 3] = p.x + nx * w * side; pos[i * 3 + 1] = p.y + ny * w * side; pos[i * 3 + 2] = TRACK_Z;
      uv[i * 2] = w * side; uv[i * 2 + 1] = s; sa[i] = s; ka[i] = kk; wa[i] = hw;
    }
    if (r < rows - 1) { const a = r * 2, b = a + 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('aS', new BufferAttribute(sa, 1));
  g.setAttribute('aK', new BufferAttribute(ka, 1));
  g.setAttribute('aHW', new BufferAttribute(wa, 1));
  g.setIndex(idx);
  return g;
}

const trackVert = `
attribute float aS; attribute float aK; attribute float aHW;
varying vec2 vUv; varying float vS; varying float vK; varying float vHW; varying vec3 vW;
void main() {
  vUv = uv; vS = aS; vK = aK; vHW = aHW;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const trackFrag = `
uniform sampler2D uAsphalt; uniform float uReveal; uniform float uOpacity;
varying vec2 vUv; varying float vS; varying float vK; varying float vHW; varying vec3 vW;
void main() {
  if (vS > uReveal) discard;
  float d = vUv.x;                       // lateral mm, + = left of travel
  float ad = abs(d);
  vec3 col = texture2D(uAsphalt, vW.xy / 9.0).rgb * 0.72;
  col *= 1.0 - 0.12 * exp(-pow(d / (vHW * 0.35), 2.0)); // rubbered-in line
  // F1 green run-off, red apron further out on the outside of bends
  vec3 runoff = vec3(0.10, 0.52, 0.38) * (0.92 + 0.08 * texture2D(uAsphalt, vW.xy / 4.0).r);
  bool outside = (vK > 0.0 && d < 0.0) || (vK < 0.0 && d > 0.0);
  if (ad > vHW) col = runoff;
  if (ad > vHW + 4.5 && outside && abs(vK) > 0.004) col = vec3(0.80, 0.20, 0.17);
  if (ad > vHW - 0.7 && ad <= vHW) col = vec3(0.93);
  // red and white kerbs only on the inside of each bend
  bool inside = (vK > 0.004 && d > 0.0) || (vK < -0.004 && d < 0.0);
  if (inside && ad > vHW - 2.4 && ad < vHW + 1.6) {
    float band = mod(floor(vS / 1.9), 2.0);
    col = mix(vec3(0.80, 0.10, 0.12), vec3(0.95), band);
  }
  // chequered start line under the watch
  if (vS > 4.0 && vS < 6.4 && ad < vHW - 0.7) {
    float ch = mod(floor((d + vHW) * 0.85) + floor((vS - 4.0) / 0.8), 2.0);
    col = mix(vec3(0.05), vec3(0.93), ch);
  }
  float front = exp(-pow((uReveal - vS) * 1.4, 2.0));
  col += vec3(0.9, 0.85, 0.7) * front * 0.55 * step(uReveal, 900.0);
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Track {
  constructor(tex) {
    this.group = new Group();
    this.group.name = 'track';
    this.uniforms = { uAsphalt: { value: tex.asphalt }, uReveal: { value: -1 }, uOpacity: { value: 1 } };
    this.mat = new ShaderMaterial({ uniforms: this.uniforms, vertexShader: trackVert, fragmentShader: trackFrag, transparent: true, side: DoubleSide });
    this.road = new Mesh(ribbon(), this.mat);
    this.road.frustumCulled = false;
    this.group.add(this.road);

    this.grassMat = new MeshBasicMaterial({ map: tex.grass, transparent: true, opacity: 0, color: new Color(0.78, 0.82, 0.78), depthWrite: false });
    const g = new Mesh(new PlaneGeometry(2400, 2400), this.grassMat);
    tex.grass.repeat.set(2400 / 70, 2400 / 70);
    g.position.set(120, -200, STRAP.ZC - STRAP.T0 / 2 - 1.2);
    g.renderOrder = -2;
    this.grass = g;
    this.group.add(g);

    const sh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex.shadow, transparent: true, opacity: 0, depthWrite: false, color: '#000' }));
    sh.scale.set(40, 280, 1); sh.position.set(1.5, -20, g.position.z + 0.05); sh.renderOrder = -1;
    this.strapShadow = sh;
    this.group.add(sh);

    const carW = 7.4, carL = carW * (1132 / 640);
    this.car = new Group();
    const body = new Mesh(new PlaneGeometry(carW, carL), new MeshBasicMaterial({ map: tex.car, transparent: true, depthWrite: false, toneMapped: false }));
    body.position.z = 0.32; body.renderOrder = 3;
    const shadow = new Mesh(new PlaneGeometry(carW * 1.5, carL * 1.25), new MeshBasicMaterial({ map: tex.shadow, transparent: true, opacity: 0.75, depthWrite: false, color: '#000' }));
    shadow.position.set(0.4, -0.3, 0.05); shadow.renderOrder = 2;
    this.ghosts = [0.32, 0.16, 0.07].map((o, i) => {
      const m = new Mesh(body.geometry, new MeshBasicMaterial({ map: tex.car, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      m.position.z = 0.3 - i * 0.01; m.renderOrder = 2; m.userData.o = o; this.car.add(m); return m;
    });
    this.car.add(shadow, body);
    this.carBody = body; this.carShadow = shadow;
    this.car.position.z = TRACK_Z;
    this.group.add(this.car);
    this.setCar(-1, 0);
  }

  setReveal(s) { this.uniforms.uReveal.value = s; this.road.visible = s > 0; }
  setGrass(o) { this.grassMat.opacity = o; this.grass.visible = o > 0.002; this.strapShadow.material.opacity = 0.55 * o; this.strapShadow.visible = o > 0.002; }

  // Swap the top-down photo for a real 3D car (normalized to point along local -y).
  setCarModel(model) {
    this.carBody.visible = false;
    this.ghosts.forEach((g) => { g.visible = false; });
    this.model = model;
    this.dressRear(model); // measured in the model's own space, before it joins the scene
    this.car.add(model);
  }

  // Rear details from the reference photo: a slim light bar across the deck just under the
  // spoiler, and a cream plate low on the bumper between the exhausts. No maker badges.
  // The tail surface is measured from the mesh itself: the rearmost vertex near the center
  // line at each height.
  dressRear(model) {
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    const h = box.max.z - box.min.z, w = box.max.x - box.min.x;
    const pts = [];
    const v = new Vector3();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const pa = o.geometry.getAttribute('position');
      for (let i = 0; i < pa.count; i += 2) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.x - (box.min.x + w / 2)) < w * 0.2) pts.push(v.y, v.z); }
    });
    const tailAt = (z, band = h * 0.03) => {
      let best = -Infinity;
      for (let i = 0; i < pts.length; i += 2) if (Math.abs(pts[i + 1] - z) < band && pts[i] > best) best = pts[i];
      return best > -Infinity ? best : box.max.y;
    };
    // heights read off the reference: plate centered ~27% up, light bar ~57% up (below the wing)
    const zPlate = box.min.z + h * 0.27, zBar = box.min.z + h * 0.57;
    const cx = box.min.x + w / 2;

    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
    const paint = (letters) => {
      x.fillStyle = '#f3ecd9'; x.fillRect(0, 0, 512, 256);
      x.strokeStyle = '#0a3a25'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 236);
      x.fillStyle = '#0a3a25'; x.textAlign = 'center';
      x.font = '600 28px "Jost", sans-serif'; x.fillText('DUNSTON PRECAN', 256, 52);
      if (letters) letters(x); else { x.font = '700 140px "Cormorant Garamond", Georgia, serif'; x.fillText('DP', 256, 205); }
      t.needsUpdate = true;
    };
    paint();
    // the "D" and the "P" cut straight from the brand script
    fetch('assets/brand/dunston-precan-script.svg').then((r) => r.text()).then((svg) => {
      const d = svg.match(/ d="([^"]+)"/)[1];
      const [vx, vy, , vh] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
      const path = new Path2D(d);
      const glyph = (ctx, x0, x1, dx) => {
        const s = 168 / vh;
        ctx.save();
        ctx.translate(dx, 70); ctx.scale(s, s); ctx.translate(-x0, -vy);
        ctx.beginPath(); ctx.rect(x0, vy, x1 - x0, vh); ctx.clip();
        ctx.fill(path, 'evenodd');
        ctx.restore();
      };
      paint((ctx) => { glyph(ctx, vx, 905, 118); glyph(ctx, 1790, 2205, 258); });
    }).catch(() => {});
    const plate = new Mesh(new PlaneGeometry(w * 0.32, w * 0.16), new MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1, side: DoubleSide }));
    plate.rotation.x = -Math.PI / 2;
    plate.scale.set(-1, -1, 1); // faces the chase camera; flipped so it reads correctly from behind
    plate.position.set(cx, tailAt(zPlate) + 0.04, zPlate);
    model.add(plate);

    const bar = new Mesh(new BoxGeometry(w * 0.8, 0.05, h * 0.018), new MeshStandardMaterial({ color: '#3a0a0c', emissive: '#ff2a1f', emissiveIntensity: 1.6, roughness: 0.3 }));
    bar.position.set(cx, tailAt(zBar) + 0.02, zBar);
    model.add(bar);
  }

  // s = distance along the track; the car follows the racing line, not the centerline
  setCar(s, speed, rumble = 0, t = 0) {
    const on = s > 0;
    this.car.visible = on;
    if (!on) return;
    const [x, y] = carPosAt(s), [x2, y2] = carPosAt(s + 2);
    this.car.position.x = x; this.car.position.y = y;
    this.car.rotation.z = Math.atan2(x2 - x, -(y2 - y));
    const appear = Math.min(1, s / 10);
    this.carShadow.material.opacity = 0.75 * appear;
    if (this.model) {
      // engine and road vibration
      this.model.position.z = 0.06 * rumble * Math.sin(t * 71) + 0.04 * rumble * Math.sin(t * 113 + 1.1);
      this.model.rotation.y = 0.004 * rumble * Math.sin(t * 53);
      return;
    }
    this.carBody.material.opacity = appear;
    const streak = Math.min(1, speed / 900);
    this.ghosts.forEach((g, i) => { g.position.y = (i + 1) * 2.6 * streak; g.material.opacity = g.userData.o * streak * appear; });
  }
}

// car position on the racing line, in track coordinates
export function carPosAt(s) {
  const p = trackPoint(s), o = racingLine(s);
  return [p.x - p.ty * o, p.y + p.tx * o];
}

// camera stops following once the car is into the last bend
export const TRACK = { S0, TRACK_LEN, CAM_MAX: TRACK_LEN - 40 };
