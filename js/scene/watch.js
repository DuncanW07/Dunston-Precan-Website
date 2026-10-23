import {
  Box3, BufferAttribute, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3,
} from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/meshopt_decoder.module.js';
import { DIAL_R } from './materials.js';

// CAD part names (DP-41 Rev F STEP, tessellated). Coordinates in mm:
// x to 3:00, y to 12:00, z toward the crystal, z = 0 at the dial seat.
const N = {
  case: '01_case_middle', bezel: '02_bezel', crystal: '03_crystal', gasket: '04_crystal_gasket',
  rehaut: '05_inner_ring_rehaut', caseback: '06_caseback', window: '07_caseback_window',
  mvring: '08_movement_ring', crown: '09_crown_and_tube', l1: '10_dial_L1_base',
  l2: '11_dial_L2_centre_field', l3: '12_dial_L3_index_ring', markers: '13_hour_markers_and_tabs',
  ticks: '14_minute_ticks', plaque: '15_plaque', wordmark: '16_wordmark_applique',
  frame: '17_skeleton_frame_and_AUTOMATIC_bridge', hour: '18_hour_hand', minute: '19_minute_hand',
  secdisc: '20_seconds_disc', secfill: '21_seconds_disc_paint_fill', envelope: '99_movement_82S5_envelope_REFERENCE',
};
const SEC_C = [3.748, -4.621];
const CAD_MIN_DEG = 72;   // hands drawn at 10:12
const CAD_HOUR_DEG = 306;

// Exploded view, top of the stack first. dz in mm at full explosion.
// Copy uses the DP-41 drawings (Rev F) and the brand handoff.
export const EXPLODE = [
  { key: 'crystal', parts: ['crystal', 'gasket'], dz: 60, side: 'L', title: 'Sapphire crystal', text: 'Ø33.00 × 1.50 mm, anti-reflective inside' },
  { key: 'bezel', parts: ['bezel'], dz: 50, side: 'R', title: 'Fluted bezel', text: '72 sharp V-flutes in polished 316L steel' },
  { key: 'rehaut', parts: ['rehaut'], dz: 43 },
  { key: 'index', parts: ['l3', 'markers', 'markerLume', 'ticks'], dz: 36, side: 'L', title: 'Floating index ring', text: '12 polished applied indices, filled with lume' },
  { key: 'minute', parts: ['minute'], dz: 29, side: 'R', title: 'Ring-hub minute hand', text: 'Grade 5 titanium with polished bevels' },
  { key: 'hour', parts: ['hour'], dz: 24 },
  { key: 'wordmark', parts: ['wordmark', 'plaque'], dz: 18, side: 'L', title: 'Wordmark plaque', text: 'Electroformed nickel on a bevelled plaque' },
  { key: 'frame', parts: ['frame'], dz: 12, side: 'R', title: 'Skeleton frame', text: 'One piece with the AUTOMATIC key-bridge' },
  { key: 'seconds', parts: ['secdisc', 'secfill'], dz: 7, side: 'L', title: 'Numbered seconds disc', text: 'Ø7.40 mm, turning over the open heart' },
  { key: 'dial', parts: ['l2'], dz: 2, side: 'R', title: 'Côtes de Genève dial', text: 'Vertical stripes at a 2.50 mm pitch' },
  { key: 'dialbase', parts: ['l1'], dz: -2 },
  { key: 'movement', parts: ['movement', 'mvring'], dz: -12, side: 'L', title: 'Miyota 82S5 automatic', text: 'Japanese, self-winding, open heart, no battery' },
  { key: 'case', parts: ['case'], dz: -26, side: 'L', anchor: [-20.2, -6, -1], title: '41 mm 316L steel case', text: '47.6 mm lug to lug, 21 mm lugs, 11.52 mm thick' },
  { key: 'crown', parts: ['crown'], dz: -26, dx: 16, side: 'R', title: 'Screw-down crown', text: '22 teeth, DP monogram on the face' },
  { key: 'caseback', parts: ['caseback', 'window'], dz: -40, side: 'R', title: 'Display caseback', text: 'Sapphire window, six screws' },
];
export const EXPLODE_CENTER = 12; // mm, keeps the exploded stack centered
const SPREAD = 1.22;

function toFloat(geom, name) {
  const a = geom.getAttribute(name);
  if (!a) return;
  const arr = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) { arr[i * 3] = a.getX(i); arr[i * 3 + 1] = a.getY(i); arr[i * 3 + 2] = a.getZ(i); }
  geom.setAttribute(name, new BufferAttribute(arr, 3));
}

function planarUV(geom, R = DIAL_R) {
  const p = geom.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + R) / (R * 2);
    uv[i * 2 + 1] = (p.getY(i) + R) / (R * 2);
  }
  geom.setAttribute('uv', new BufferAttribute(uv, 2));
}

export async function loadWatch(url, M, tex) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const root = new Group();
  root.name = 'DP-41';
  const parts = {};

  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    o.updateWorldMatrix(true, false);
    const g = o.geometry;
    toFloat(g, 'position'); toFloat(g, 'normal');
    g.applyMatrix4(o.matrixWorld);
    const key = Object.keys(N).find((k) => N[k] === o.name);
    if (!key) continue;
    const mesh = new Mesh(g);
    mesh.name = key;
    parts[key] = mesh;
  }

  // Applied hour indices: polished frame (F02) with a flush lume fill (F09) inset on top.
  if (parts.markers) {
    const lumeGeo = parts.markers.geometry.clone();
    const p = lumeGeo.getAttribute('position');
    const step = Math.PI / 6, sums = new Map();
    const keyOf = (i) => Math.round(Math.atan2(p.getY(i), p.getX(i)) / step);
    for (let i = 0; i < p.count; i++) {
      const k = keyOf(i), s = sums.get(k) || [0, 0, 0];
      s[0] += p.getX(i); s[1] += p.getY(i); s[2]++; sums.set(k, s);
    }
    const RING_SLOPE = (1.96 - 1.16) / (15.9 - 12.87);
    for (let i = 0; i < p.count; i++) {
      const k = keyOf(i), s = sums.get(k), a = k * step;
      const cx = s[0] / s[2], cy = s[1] / s[2], ur = [Math.cos(a), Math.sin(a)], ut = [-ur[1], ur[0]];
      const dx = p.getX(i) - cx, dy = p.getY(i) - cy;
      const dr = dx * ur[0] + dy * ur[1], dt = dx * ut[0] + dy * ut[1];
      const dr2 = dr * 0.8, dt2 = dt * 0.56;
      p.setXYZ(i, cx + ur[0] * dr2 + ut[0] * dt2, cy + ur[1] * dr2 + ut[1] * dt2, p.getZ(i) + (dr2 - dr) * RING_SLOPE + 0.012);
    }
    p.needsUpdate = true;
    parts.markerLume = new Mesh(lumeGeo);
    parts.markerLume.name = 'markerLume';
  }

  // Materials per part, from the CMF finish schedule
  const assign = {
    case: M.coating, bezel: M.coatingPolished, crown: M.coatingPolished, caseback: M.caseback,
    crystal: M.glass, window: M.glass, gasket: M.rubber, rehaut: M.steelBrushedCirc,
    mvring: M.pom, l1: M.dialBase, l2: M.dial, l3: M.steelBrushedCirc, markers: M.steelPolished, markerLume: M.lume,
    ticks: M.tickInk, plaque: M.plaque, wordmark: M.steelPolished, frame: M.steelBrushed, hour: M.steelPolished,
    minute: M.ringHand, secdisc: M.beadBlast, secfill: M.paint,
  };
  for (const [k, m] of Object.entries(parts)) {
    if (assign[k]) m.material = assign[k];
    if (['l2', 'l3', 'rehaut', 'plaque', 'frame', 'minute', 'hour'].includes(k)) planarUV(m.geometry);
    if (k === 'caseback') planarUV(m.geometry, 19.3);
    m.geometry.computeBoundingBox();
    const glassy = k === 'crystal' || k === 'window';
    m.castShadow = !glassy && k !== 'envelope';
    m.receiveShadow = !glassy;
  }

  // The CAD ships the Miyota 82S5 as an envelope; dress it with the real thing.
  if (parts.envelope) {
    const mv = new Group();
    const H = 5.67, R = 13.0;
    const geo = new CylinderGeometry(R, R, H, 96, 1, false);
    const front = new MeshStandardMaterial({ map: tex.movementFront, metalness: 0.6, roughness: 0.34, alphaTest: 0.4, emissive: '#ffffff', emissiveMap: tex.movementFront, emissiveIntensity: 0.12 });
    const back = new MeshStandardMaterial({ map: tex.movementBack, metalness: 0.6, roughness: 0.3, alphaTest: 0.4, emissive: '#ffffff', emissiveMap: tex.movementBack, emissiveIntensity: 0.1 });
    const body = new Mesh(geo, [M.movementSide, front, back]);
    body.rotation.x = Math.PI / 2;
    body.position.z = -H / 2 - 0.02;
    body.castShadow = body.receiveShadow = true;
    mv.add(body);
    mv.name = 'movement';
    parts.movement = mv;
    parts.envelope.geometry.dispose();
    delete parts.envelope;
  }

  // Seconds disc turns about its own pinion.
  for (const k of ['secdisc', 'secfill']) {
    parts[k].geometry.translate(-SEC_C[0], -SEC_C[1], 0);
    parts[k].userData.pivot = [SEC_C[0], SEC_C[1]];
  }

  // Explode groups
  const groups = EXPLODE.map((g) => {
    const box = new Box3();
    g.parts.forEach((k) => {
      const p = parts[k];
      if (!p) return;
      if (p.isMesh) {
        const b = p.geometry.boundingBox.clone();
        if (p.userData.pivot) b.translate(new Vector3(p.userData.pivot[0], p.userData.pivot[1], 0));
        box.union(b);
      } else box.union(new Box3(new Vector3(-13, -13, -5.67), new Vector3(13, 13, 0)));
    });
    let anchor;
    if (g.anchor) anchor = new Vector3(...g.anchor);
    else {
      const cy = (box.min.y + box.max.y) / 2;
      const x = g.side === 'L' ? box.min.x * 0.9 : box.max.x * 0.9;
      anchor = new Vector3(x, cy * 0.6, box.max.z);
    }
    return { ...g, box, anchor };
  });

  for (const [k, p] of Object.entries(parts)) {
    const pv = p.userData.pivot;
    p.userData.base = new Vector3(pv ? pv[0] : 0, pv ? pv[1] : 0, 0);
    p.position.copy(p.userData.base);
    root.add(p);
  }

  const api = {
    root, parts, groups,
    explode: 0,
    setExplode(e) {
      api.explode = e;
      const shift = -EXPLODE_CENTER * e;
      for (const g of groups) {
        for (const k of g.parts) {
          const p = parts[k]; if (!p) continue;
          p.position.z = p.userData.base.z + g.dz * SPREAD * e + shift;
          p.position.x = p.userData.base.x + (g.dx || 0) * e;
        }
      }
    },
    anchorWorld(g, out = new Vector3()) {
      out.copy(g.anchor);
      out.z += (g.dz * SPREAD - EXPLODE_CENTER) * api.explode;
      out.x += (g.dx || 0) * api.explode;
      return root.localToWorld(out);
    },
    setTime(d = new Date()) {
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      const rad = Math.PI / 180;
      parts.minute.rotation.z = -((m / 60) * 360 - CAD_MIN_DEG) * rad;
      parts.hour.rotation.z = -((h / 12) * 360 - CAD_HOUR_DEG) * rad;
      parts.secdisc.rotation.z = parts.secfill.rotation.z = -(s / 60) * Math.PI * 2;
    },
    setLume(v) { M.lume.emissiveIntensity = v; },
  };
  api.setExplode(0);
  api.setTime();
  return api;
}
