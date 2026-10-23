// Light effects: star glints that ride the light sweep across the watch, the white
// burst when the case opens, and whoosh speed lines for the strap-to-track moment
// and the fast stretches of the race. All are additive, so they only ever add light.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, SRGBColorSpace, Sprite, SpriteMaterial, Vector3,
} from '../../vendor/three.module.min.js';

function tex(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const starTex = () => tex((x, n) => {
  const h = n / 2;
  const core = x.createRadialGradient(h, h, 0, h, h, h);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.08, 'rgba(255,252,240,.85)');
  core.addColorStop(0.25, 'rgba(255,240,210,.18)'); core.addColorStop(1, 'rgba(255,240,210,0)');
  x.fillStyle = core; x.fillRect(0, 0, n, n);
  x.globalCompositeOperation = 'lighter';
  const ray = (ang, len, w, a) => {
    x.save(); x.translate(h, h); x.rotate(ang);
    const g = x.createLinearGradient(-len, 0, len, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, len, w, 0, 0, Math.PI * 2); x.fill(); x.restore();
  };
  ray(0, h, 2.2, 0.95); ray(Math.PI / 2, h, 2.2, 0.95); ray(Math.PI / 4, h * 0.45, 1.4, 0.45); ray(-Math.PI / 4, h * 0.45, 1.4, 0.45);
});

const glowTex = () => tex((x, n) => {
  const h = n / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,250,238,.75)');
  g.addColorStop(0.45, 'rgba(255,244,220,.2)'); g.addColorStop(1, 'rgba(255,244,220,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
});

const ringTex = () => tex((x, n) => {
  const h = n / 2, g = x.createRadialGradient(h, h, h * 0.8, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,246,228,.35)'); g.addColorStop(1, 'rgba(255,246,228,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
}, 512);

const dotTex = () => tex((x, n) => {
  const h = n / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
}, 64);

const streakTex = () => tex((x, n) => {
  const g = x.createLinearGradient(0, 0, 0, n);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,.85)'); g.addColorStop(0.92, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(n * 0.3, 0, n * 0.4, n);
  const side = x.createLinearGradient(0, 0, n, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.5, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = side; x.fillRect(0, 0, n, n);
}, 128);

const additive = (o) => Object.assign({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }, o);

// ------------------------------------------------------------------ glints
// Positions in watch coordinates (mm): flute crests, crown, lug bevels, crystal edge.
// Each glint rides on its part, so it follows the explosion.
const GLINT_POINTS = [
  [13.4, 14.2, 3.5, "bezel"], [-17.6, 9.2, 3.4, "bezel"], [18.9, -4.6, 3.3, "bezel"], [-6.5, -18.6, 3.4, "bezel"],
  [24.2, 1.4, -2.0, "crown"], [-11.8, 23.2, -1.2, "case"], [11.6, 13.0, 4.3, "crystal"], [-14.2, -7.6, 4.2, "crystal"],
  [9.0, 1.6, 2.1, "minute"], [-3.2, 9.6, 0.95, "wordmark"],
];
const SWEEP_DIR = [0.82, 0.57];

export class Glints {
  constructor(parts) {
    const map = starTex();
    this.items = GLINT_POINTS.map((p, i) => {
      const s = new Sprite(new SpriteMaterial(additive({ map, opacity: 0, depthTest: true })));
      const host = parts[p[3]];
      s.position.set(p[0], p[1], p[2]);
      if (host.userData.pivot) s.position.x -= host.userData.pivot[0], s.position.y -= host.userData.pivot[1];
      s.renderOrder = 9;
      s.userData = { along: p[0] * SWEEP_DIR[0] + p[1] * SWEEP_DIR[1], phase: i * 1.7, small: p[3] === "minute" || p[3] === "wordmark" };
      host.add(s);
      return s;
    });
  }
  // sweep: position of the light band along SWEEP_DIR (mm); strength 0..1
  update(t, sweep, strength) {
    for (const s of this.items) {
      const d = (s.userData.along - sweep) / 3.2;
      const ride = Math.exp(-d * d);
      const sparkle = Math.pow(Math.max(0, Math.sin(t * 1.9 + s.userData.phase)), 40) * 0.55;
      const v = strength * Math.min(1, ride + sparkle);
      s.material.opacity = v;
      s.visible = v > 0.01;
      const k = (s.userData.small ? 0.55 : 1) * (3.2 + 5.5 * v);
      s.scale.set(k, k, 1);
      s.material.rotation = 0.15 * Math.sin(t * 0.7 + s.userData.phase);
    }
  }
}

// ------------------------------------------------------------------ burst
export class Burst {
  constructor(scene) {
    this.group = new Group();
    this.flash = new Sprite(new SpriteMaterial(additive({ map: glowTex(), depthTest: false })));
    this.ring = new Sprite(new SpriteMaterial(additive({ map: ringTex(), depthTest: false })));
    this.flash.renderOrder = this.ring.renderOrder = 20;
    const N = 900;
    this.dirs = new Float32Array(N * 3); this.speed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // biased outward in the dial plane, like the case opening
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      this.dirs[i * 3] = r * Math.cos(a); this.dirs[i * 3 + 1] = r * Math.sin(a); this.dirs[i * 3 + 2] = u * 0.5; // disc facing the viewer
      this.speed[i] = 0.35 + Math.pow(Math.random(), 1.6) * 1.2;
    }
    this.geo = new BufferGeometry();
    this.pos = new Float32Array(N * 3);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.sparks = new Points(this.geo, new PointsMaterial(additive({ map: dotTex(), size: 2.1, sizeAttenuation: true, color: new Color(1, 0.97, 0.9), depthTest: false })));
    this.sparks.frustumCulled = false; this.sparks.renderOrder = 21;
    this.group.add(this.flash, this.ring, this.sparks);
    this.group.visible = false;
    scene.add(this.group);
  }
  // b: 0..1 progress of the burst
  update(b, center, camera) {
    const on = b > 0 && b < 1;
    this.group.visible = on;
    if (!on) return 0;
    this.group.position.copy(center);
    const flash = b < 0.12 ? b / 0.12 : Math.pow(1 - (b - 0.12) / 0.88, 2.2);
    this.flash.material.opacity = flash;
    const fs = 30 + 190 * Math.pow(b, 0.5);
    this.flash.scale.set(fs, fs, 1);
    const rb = Math.min(1, b / 0.7);
    this.ring.material.opacity = Math.pow(1 - rb, 1.6) * 0.9;
    const rs = 20 + 330 * (1 - Math.pow(1 - rb, 3));
    this.ring.scale.set(rs, rs, 1);
    const travel = 1 - Math.pow(1 - b, 3);
    // orient the spark cloud to the camera so the disc of sparks reads as a ring burst
    const q = camera.quaternion;
    const v = new Vector3();
    for (let i = 0; i < this.speed.length; i++) {
      v.set(this.dirs[i * 3], this.dirs[i * 3 + 1], this.dirs[i * 3 + 2]).applyQuaternion(q).multiplyScalar(travel * 150 * this.speed[i]);
      this.pos[i * 3] = v.x; this.pos[i * 3 + 1] = v.y; this.pos[i * 3 + 2] = v.z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.sparks.material.opacity = Math.pow(1 - b, 1.3) * Math.min(1, b / 0.05);
    this.sparks.material.size = 1.8 + 3.6 * (1 - b);
    return flash;
  }
}

// ------------------------------------------------------------------ whoosh lines
export class SpeedLines {
  constructor(parent, count = 90) {
    this.n = count;
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial(additive({ map: streakTex(), depthTest: true })), count);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 15;
    this.seed = Array.from({ length: count }, () => ({ lat: Math.random() * 2 - 1, ph: Math.random(), rate: 0.6 + Math.random() * 0.9, len: 0.5 + Math.random(), z: Math.random(), b: 0.4 + Math.random() * 0.6 }));
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, new Color(0, 0, 0));
    parent.add(this.mesh);
    this.m = new Matrix4(); this.q = new Quaternion(); this.c = new Color();
  }
  // center: point on the ground (track coords), dir: unit travel direction (x, y),
  // intensity 0..1, span: [lateral, length] in mm
  update(t, center, dir, intensity, span, z0, eye) {
    this.mesh.visible = intensity > 0.01;
    if (!this.mesh.visible) return;
    const [lat, len] = span;
    const ang = Math.atan2(dir[1], dir[0]) - Math.PI / 2;
    this.q.setFromAxisAngle(new Vector3(0, 0, 1), ang);
    const nx = -dir[1], ny = dir[0];
    this.seed.forEach((s, i) => {
      const f = ((s.ph + t * s.rate * (0.6 + intensity)) % 1);
      const along = (0.5 - f) * len;                 // rushes from ahead to behind
      const side = s.lat * lat;
      if (Math.abs(s.lat) < 0.18) { this.mesh.setColorAt(i, this.c.setScalar(0)); }
      const L = len * 0.14 * s.len * (0.5 + intensity), W = 0.3 + 0.25 * s.b;
      // stand each streak up toward the camera around its own length
      const P = new Vector3(center.x + dir[0] * along + nx * side, center.y + dir[1] * along + ny * side, z0 + s.z * 7);
      const D = new Vector3(dir[0], dir[1], 0), toEye = eye ? eye.clone().sub(P) : new Vector3(0, 0, 1);
      const Wv = new Vector3().crossVectors(D, toEye).normalize(), Nv = new Vector3().crossVectors(Wv, D);
      this.m.makeBasis(Wv.multiplyScalar(W), D.multiplyScalar(L), Nv).setPosition(P);
      this.mesh.setMatrixAt(i, this.m);
      const fade = Math.sin(Math.PI * f);
      const k = Math.abs(s.lat) < 0.18 ? 0 : intensity * fade * s.b;
      this.mesh.setColorAt(i, this.c.setScalar(k));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
