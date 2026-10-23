import {
  BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CircleGeometry, Color, CurvePath,
  CylinderGeometry, DynamicDrawUsage, ExtrudeGeometry, Group, InstancedMesh, LineCurve3, Matrix4, Mesh,
  MeshStandardMaterial, Path, QuadraticBezierCurve3, Shape, TubeGeometry, Vector3,
} from '../../vendor/three.module.min.js';

// Strap dimensions (mm). The strap leaves the spring bars inside the 21 mm lugs.
const Y0 = 20.4, ZC = -4.6;
const W0 = 21, W1 = 18, T0 = 3.0, T1 = 2.5;
const TAIL = 40, OFF = 2.75, TIP = 9;
// Worn shape (y, z) of the 12 o'clock half, as if wrapped around a wrist below the caseback.
const LOOP = [[20.4, -4.6], [25.5, -6.6], [30.2, -11.6], [33.0, -19.5], [32.8, -28.2], [29.2, -36.2], [21.6, -42.6], [11.0, -46.3], [0, -47.3]];

const curve = new CatmullRomCurve3(LOOP.map(([y, z]) => new Vector3(0, y, z)), false, 'centripetal');
const LH = curve.getLength();
const _p = new Vector3(), _t = new Vector3();

function loopAt(u) {
  const k = Math.min(Math.max(u / LH, 0), 1);
  curve.getPointAt(k, _p); curve.getTangentAt(k, _t);
  return { y: _p.y, z: _p.z, ty: _t.y, tz: _t.z };
}
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

// Centerline of a strap half in its own positive-y frame; m = 0 worn, 1 lying flat.
function pathPoint(half, s, m, out) {
  let ly, lz;
  if (half === 12 || s <= LH) {
    const l = loopAt(Math.min(s, LH));
    ly = l.y; lz = l.z;
    if (half === 6) { const lift = smooth(LH - 14, LH, s) * OFF; ly -= l.tz * lift; lz += l.ty * lift; }
  } else {
    // tail runs back up the other side, outside the 12 o'clock half
    const l = loopAt(Math.max(LH - (s - LH), 0));
    ly = -l.y + l.tz * OFF; lz = l.z + l.ty * OFF;
  }
  return out.set(0, ly + (Y0 + s - ly) * m, lz + (ZC - lz) * m);
}

function widthAt(half, s, L) {
  let w = W0 + (W1 - W0) * Math.min(s / LH, 1);
  if (half === 6 && s > L - TIP) { const d = (s - (L - TIP)) / TIP; w *= Math.sqrt(Math.max(1 - d * d, 0.0004)); }
  return w;
}
function thickAt(half, s, L) {
  let t = T0 + (T1 - T0) * Math.min(s / LH, 1);
  if (half === 6 && s > L - TIP) t *= 1 - 0.25 * (s - (L - TIP)) / TIP;
  return t;
}

const KT = 7, KE = 7; // samples across top/bottom and around each edge

class Half {
  constructor(half, mats) {
    this.half = half;
    this.sign = half === 12 ? 1 : -1;
    this.L = half === 12 ? LH - 0.4 : LH + TAIL;
    this.rows = Math.ceil(this.L / 0.9) + 1;
    const C = (this.C = KT * 2 + KE * 2);
    const n = this.rows * C;
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), aS = new Float32Array(n);
    const idx = [];
    const geom = new BufferGeometry();
    // strips: [first column, columns, material group] -> top, right edge, bottom, left edge
    for (const [c0, cn, g] of [[0, KT, 0], [KT, KE, 2], [KT + KE, KT, 1], [KT * 2 + KE, KE, 2]]) {
      const start = idx.length;
      for (let r = 0; r < this.rows - 1; r++) for (let c = 0; c < cn - 1; c++) {
        const a = r * C + c0 + c, b = (r + 1) * C + c0 + c, c1 = a + 1, d = b + 1;
        if (this.sign > 0) idx.push(a, c1, b, b, c1, d); else idx.push(a, b, c1, b, d, c1);
      }
      geom.addGroup(start, idx.length - start, g);
    }
    for (let r = 0; r < this.rows; r++) {
      const s = (r / (this.rows - 1)) * this.L;
      const w = widthAt(half, s, this.L);
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const k = c < KT ? c / (KT - 1) : c < KT + KE ? 1 : c < KT * 2 + KE ? 1 - (c - KT - KE) / (KT - 1) : 0;
        uv[i * 2] = ((k - 0.5) * w) / 26 + 0.5; uv[i * 2 + 1] = s / 26;
        aS[i] = half === 6 ? s : 1e5;
      }
    }
    geom.setIndex(idx);
    this.posAttr = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    this.norAttr = new BufferAttribute(this.nor, 3).setUsage(DynamicDrawUsage);
    geom.setAttribute('position', this.posAttr);
    geom.setAttribute('normal', this.norAttr);
    geom.setAttribute('uv', new BufferAttribute(uv, 2));
    geom.setAttribute('aS', new BufferAttribute(aS, 1));
    this.mesh = new Mesh(geom, [mats.top, mats.lining, mats.edge]);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.frames = new Array(this.rows);
  }

  update(m) {
    const { C, rows, L, sign } = this;
    const P = new Vector3(), A = new Vector3(), B = new Vector3();
    for (let r = 0; r < rows; r++) {
      const s = (r / (rows - 1)) * L;
      pathPoint(this.half, s, m, P);
      pathPoint(this.half, Math.max(s - 0.35, 0), m, A);
      pathPoint(this.half, s + 0.35, m, B);
      const ty = B.y - A.y, tz = B.z - A.z, tl = Math.hypot(ty, tz) || 1;
      const Ty = ty / tl, Tz = tz / tl, Ny = -Tz, Nz = Ty; // N = W x T, W = +x
      const w = widthAt(this.half, s, L), t = thickAt(this.half, s, L);
      const rr = Math.min(t / 2, w / 2), hw = w / 2 - rr;
      this.frames[r] = { py: P.y, pz: P.z, Ty, Tz, w, t };
      let c = 0;
      const put = (xc, yc, nx, nn) => {
        const i = (r * C + c++) * 3;
        this.pos[i] = xc; this.pos[i + 1] = sign * (P.y + Ny * yc); this.pos[i + 2] = P.z + Nz * yc;
        this.nor[i] = nx; this.nor[i + 1] = sign * Ny * nn; this.nor[i + 2] = Nz * nn;
      };
      for (let k = 0; k < KT; k++) put(-hw + (2 * hw * k) / (KT - 1), t / 2, 0, 1);
      for (let k = 0; k < KE; k++) { const a = Math.PI / 2 - (Math.PI * k) / (KE - 1); put(hw + rr * Math.cos(a), (t / 2) * Math.sin(a), Math.cos(a), Math.sin(a)); }
      for (let k = 0; k < KT; k++) put(hw - (2 * hw * k) / (KT - 1), -t / 2, 0, -1);
      for (let k = 0; k < KE; k++) { const a = -Math.PI / 2 - (Math.PI * k) / (KE - 1); put(-hw + rr * Math.cos(a), (t / 2) * Math.sin(a), Math.cos(a), Math.sin(a)); }
    }
    this.posAttr.needsUpdate = this.norAttr.needsUpdate = true;
  }

  // Position, tangent and top normal at arc length s, in strap coordinates.
  frameAt(s) {
    const { rows, L, sign } = this;
    const f = Math.min(Math.max(s / L, 0), 1) * (rows - 1);
    const i = Math.min(Math.floor(f), rows - 2), k = f - i;
    const a = this.frames[i], b = this.frames[i + 1];
    const lerp = (x, y) => x + (y - x) * k;
    const Ty = lerp(a.Ty, b.Ty), Tz = lerp(a.Tz, b.Tz), l = Math.hypot(Ty, Tz) || 1;
    return {
      p: new Vector3(0, sign * lerp(a.py, b.py), lerp(a.pz, b.pz)),
      T: new Vector3(0, (sign * Ty) / l, Tz / l),
      N: new Vector3(0, (sign * -Tz) / l, Ty / l),
      w: lerp(a.w, b.w), t: lerp(a.t, b.t),
    };
  }
}

const basis = (T, N) => new Matrix4().makeBasis(new Vector3().crossVectors(T, N).normalize(), T, N);
const noWipe = (geo) => geo.setAttribute('aS', new BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1e5), 1));

function rrect(p, x, y, w, h, r) {
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
}

export class Strap {
  constructor(tex) {
    this.group = new Group();
    this.group.name = 'strap';
    this.wipe = { value: -1 };
    // CMF L02 chocolate full-grain calf, satin topcoat (F12); lining L02 matte smooth; edge paint matches the upper
    const top = new MeshStandardMaterial({ color: new Color(0.6, 0.6, 0.66), map: tex.leather, bumpMap: tex.leather, bumpScale: 2.4, roughness: 0.48, metalness: 0 });
    const lining = new MeshStandardMaterial({ color: '#402a1f', bumpMap: tex.leather, bumpScale: 0.5, roughness: 0.85 });
    const edge = new MeshStandardMaterial({ color: '#3a251a', roughness: 0.34, metalness: 0 });
    const stitch = new MeshStandardMaterial({ color: '#7b5a3b', roughness: 0.75 }); // S02, 0.45 mm thread
    const hole = new MeshStandardMaterial({ color: '#120a06', roughness: 0.9 });
    this.mats = { top, lining, edge, stitch, hole };
    // Wipe: the 6 o'clock half dissolves into the race track from the lugs outward.
    for (const mat of [top, lining, edge]) {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uWipe = this.wipe;
        sh.vertexShader = 'attribute float aS;\nvarying float vS;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vS = aS;');
        sh.fragmentShader = 'uniform float uWipe;\nvarying float vS;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vS < uWipe) discard;');
      };
      mat.customProgramCacheKey = () => 'strap-wipe';
    }
    this.h12 = new Half(12, this.mats);
    this.h6 = new Half(6, this.mats);
    this.group.add(this.h12.mesh, this.h6.mesh);

    // stitching along both edges, holes on the tail
    this.spots = [];
    for (const h of [this.h12, this.h6]) {
      const end = h.L - (h === this.h6 ? TIP + 1 : 1.5);
      for (let s = 2.5; s < end; s += 3.0) for (const side of [-1, 1]) this.spots.push({ h, s, side }); // 3.0 mm pitch
    }
    this.stitches = new InstancedMesh(new BoxGeometry(0.45, 2.1, 0.24), stitch, this.spots.length);
    this.holeS = [5, 11, 17, 23, 29].map((d) => LH + d);
    this.holes = new InstancedMesh(new CircleGeometry(0.85, 20), hole, this.holeS.length);
    for (const im of [this.stitches, this.holes]) { im.instanceMatrix.setUsage(DynamicDrawUsage); im.frustumCulled = false; this.group.add(im); }

    // leather keeper near the buckle
    const ks = new Shape(); rrect(ks, -10.4, -1.75, 20.8, 3.5, 1.2);
    const hole2 = new Path(); rrect(hole2, -9.6, -1.3, 19.2, 2.6, 0.9); ks.holes.push(hole2);
    this.keeper = new Mesh(new ExtrudeGeometry(ks, { depth: 3.2, bevelEnabled: false, curveSegments: 6 }), edge);
    noWipe(this.keeper.geometry);
    this.keeper.castShadow = true;
    this.keeper.matrixAutoUpdate = false;
    this.group.add(this.keeper);

    this.buckle = new Group();
    this.buckle.matrixAutoUpdate = false;
    this.group.add(this.buckle);
    this.m = -1;
  }

  setBuckleMaterial(mat) {
    this.buckle.clear();
    const hx = 10.5, y0 = -0.4, y1 = 8.6, rc = 3.2, P = (x, y) => new Vector3(x, y, 0);
    const path = new CurvePath();
    path.add(new LineCurve3(P(-hx, y0), P(hx, y0)));
    path.add(new LineCurve3(P(hx, y0), P(hx, y1 - rc)));
    path.add(new QuadraticBezierCurve3(P(hx, y1 - rc), P(hx, y1), P(hx - rc, y1)));
    path.add(new LineCurve3(P(hx - rc, y1), P(-hx + rc, y1)));
    path.add(new QuadraticBezierCurve3(P(-hx + rc, y1), P(-hx, y1), P(-hx, y1 - rc)));
    path.add(new LineCurve3(P(-hx, y1 - rc), P(-hx, y0)));
    const frame = new Mesh(new TubeGeometry(path, 140, 0.85, 14, true), mat);
    const pin = new Mesh(new CylinderGeometry(0.62, 0.62, 21.4, 16), mat);
    pin.rotation.z = Math.PI / 2;
    const tang = new Mesh(new BoxGeometry(0.9, 8.4, 0.7), mat);
    tang.position.set(0, 4.2, 0.9);
    for (const o of [frame, pin, tang]) { o.castShadow = true; this.buckle.add(o); }
  }

  layoutInstances() {
    const M = new Matrix4(), Z = new Matrix4().makeScale(0, 0, 0), wipe = this.wipe.value;
    this.spots.forEach((sp, i) => {
      if (sp.h === this.h6 && sp.s < wipe) { this.stitches.setMatrixAt(i, Z); return; }
      const f = sp.h.frameAt(sp.s);
      const across = new Vector3().crossVectors(f.T, f.N).normalize().multiplyScalar(sp.side * (f.w / 2 - 2.5)); // 2.5 mm inset
      M.copy(basis(f.T, f.N)).setPosition(f.p.add(f.N.clone().multiplyScalar(f.t / 2 + 0.05)).add(across));
      this.stitches.setMatrixAt(i, M);
    });
    this.holeS.forEach((s, i) => {
      if (s < wipe) { this.holes.setMatrixAt(i, Z); return; }
      const f = this.h6.frameAt(s);
      M.copy(basis(f.T, f.N)).setPosition(f.p.add(f.N.clone().multiplyScalar(f.t / 2 + 0.03)));
      this.holes.setMatrixAt(i, M);
    });
    this.stitches.instanceMatrix.needsUpdate = this.holes.instanceMatrix.needsUpdate = true;
  }

  update(m) {
    if (Math.abs(m - this.m) < 1e-4) return;
    this.m = m;
    this.h12.update(m); this.h6.update(m);
    this.layoutInstances();

    // keeper wraps both layers when worn, sits flat on the strap when laid out
    const lift = OFF * (1 - m);
    const fk = this.h12.frameAt(this.h12.L - 13);
    const Wk = new Vector3().crossVectors(fk.T, fk.N).normalize();
    this.keeper.matrix.makeBasis(Wk, fk.N, fk.T.clone().negate())
      .setPosition(fk.p.clone().add(fk.N.clone().multiplyScalar(lift / 2)))
      .multiply(new Matrix4().makeScale(1, 1 + lift / 3.5, 1))
      .multiply(new Matrix4().makeTranslation(0, 0, -1.6));
    this.keeper.matrixWorldNeedsUpdate = true;

    const fb = this.h12.frameAt(this.h12.L);
    this.buckle.matrix.copy(basis(fb.T, fb.N)).setPosition(fb.p.clone().add(fb.N.clone().multiplyScalar(OFF * 0.45 * (1 - m))));
    this.buckle.matrixWorldNeedsUpdate = true;
  }

  setWipe(s) {
    if (this.wipe.value === s) return;
    this.wipe.value = s;
    this.layoutInstances();
  }

  setOpacity(o) {
    const mats = [...Object.values(this.mats), ...this.buckle.children.map((c) => c.material)];
    for (const m of new Set(mats)) {
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = 1;
      m.opacity = o; m.transparent = o < 0.999; m.depthWrite = o > 0.6;
    }
    this.group.visible = o > 0.002;
  }
}

export const STRAP = { Y0, ZC, LH, TAIL, W0, T0, OFF };
