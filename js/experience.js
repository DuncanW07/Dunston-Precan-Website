// Scroll-driven DP-41 sequence: hero on the beach, a full turn, the exploded
// view at night, the strap laid flat, the strap becoming a race track, and the
// hand-off to the collection.
import {
  DirectionalLight, Euler, Group, HemisphereLight, Mesh, NeutralToneMapping,
  MeshBasicMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Quaternion, Scene,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from '../vendor/three.module.min.js';
import { loadTex, makeMaterials, radialGradientTexture } from './scene/materials.js';
import { buildEnvironment } from './scene/env.js';
import { loadWatch } from './scene/watch.js';
import { Strap } from './scene/strap.js';
import { Track, trackPoint, carPosAt, carHeadingAt, TRACK, TRACK_Z } from './scene/track.js';
import { Glints, Burst, SpeedLines } from './scene/effects.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';

// Monotone cubic (PCHIP) through [x, y] keys: smooth, never overshoots.
function pchip(keys) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; d[i] = (y[i + 1] - y[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (t) => {
    if (t <= x[0]) return [y[0], 0];
    if (t >= x[n - 1]) return [y[n - 1], 0];
    let i = 0; while (t > x[i + 1]) i++;
    const u = (t - x[i]) / h[i], u2 = u * u, u3 = u2 * u;
    const v = (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h[i] * m[i + 1];
    const dv = ((6 * u2 - 6 * u) * y[i] + (3 * u2 - 4 * u + 1) * h[i] * m[i] + (-6 * u2 + 6 * u) * y[i + 1] + (3 * u2 - 2 * u) * h[i] * m[i + 1]) / h[i];
    return [v, dv];
  };
}

// The drive: launch, brake into bend 1 for the first insight, flat out through
// bend 2, brake again for the second insight, then gone. [progress, mm along track]
const DRIVE = pchip([
  [0.69, 4], [0.712, 40], [0.732, 150], [0.748, 172], [0.786, 198],
  [0.8, 226], [0.822, 340], [0.838, 358], [0.884, 386], [0.896, 440], [0.912, TRACK.TRACK_LEN],
]);
const CAM_RELEASE = 0.889; // camera lets the car go here

async function loadCarModel(url) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.loadAsync(url);
    return g.scene;
  } catch { return null; }
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const V = (x, y, z) => new Vector3(x, y, z);
const Q = (x, y, z) => new Quaternion().setFromEuler(new Euler(x, y, z, 'YXZ'));
const qAxis = (axis, a) => new Quaternion().setFromAxisAngle(axis, a);
const Y = V(0, 1, 0), Z = V(0, 0, 1);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Rig poses
const Q_HERO = Q(0.1, -0.44, 0.02); // dial turned toward the viewer, strap lining still in view
const Q_EXPLODE = Q(-1.02, 0.4, 0);
const Q_FACE = new Quaternion();

export async function startExperience({ onProgress, onReady, onCollection }) {
  const canvas = $('#gl');
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return { ok: false };
  }
  const mobile = matchMedia('(max-width: 760px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.6 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 6000);

  // ---- assets
  let loaded = 0;
  const total = 10;
  const tick = (x) => { loaded++; onProgress?.(loaded / total); return x; };
  const [leather, asphalt, grass, car, mvFront, mvBack, heroPhoto, duskPhoto] = await Promise.all([
    loadTex('assets/tex/leather.jpg', { repeat: [1, 1] }).then(tick),
    loadTex('assets/tex/asphalt.jpg', { repeat: [1, 1] }).then(tick),
    loadTex('assets/tex/grass.jpg', { repeat: [1, 1] }).then(tick),
    loadTex('assets/img/car.webp').then(tick),
    loadTex('assets/tex/movement-front.webp').then(tick),
    loadTex('assets/tex/movement-back.webp').then(tick),
    loadTex('assets/img/hero-beach-1280.webp').then(tick),
    loadTex('assets/img/dusk-beach-1280.webp').then(tick),
  ]);
  const shadowTex = radialGradientTexture('rgba(0,0,0,0.6)');
  const M = makeMaterials();
  const watch = await loadWatch('assets/models/dp41.glb', M, { movementFront: mvFront, movementBack: mvBack }).then(tick);

  // crisp studio softboxes over a dimmed beach dome: clean highlights, warm undertone
  const envDay = buildEnvironment(renderer, heroPhoto, { boxes: 1.7, tint: '#6f6a62' });
  const envNight = buildEnvironment(renderer, duskPhoto, { boxes: 1.7, tint: '#cfd8d4' });
  const envStudio = buildEnvironment(renderer, null, { boxes: 1.2 });
  scene.environment = envDay;
  tick();

  // ---- scene graph
  const rig = new Group();
  scene.add(rig);
  rig.add(watch.root);

  const strap = new Strap({ leather });
  const buckleMat = M.steelPolished.clone();
  strap.setBuckleMaterial(buckleMat);
  strap.update(0);
  rig.add(strap.group);

  const track = new Track({ asphalt, grass, car, shadow: shadowTex });
  rig.add(track.group);
  // the 3D coupe, if present (already oriented and scaled at build time); the photo is the fallback
  const carModel = await loadCarModel('assets/models/car.glb');
  if (carModel) {
    // generated material ships with a 2x specular boost that bleaches the paint; give it a real clear coat
    carModel.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = o.material;
      if (m.specularColor) m.specularColor.setScalar(1);
      Object.assign(m, { specularIntensity: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25, side: 2 }); // mesh normals are mixed
      m.needsUpdate = true;
    });
    track.setCarModel(carModel);
  }

  const glints = new Glints(watch.parts);
  const burst = new Burst(scene);
  const lines = new SpeedLines(rig);
  const flashEl = $('.flash');

  // contact shadow on the sand (hero)
  const contact = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: '#1a120a' }));
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = -5;
  scene.add(contact);

  // lights
  const hemi = new HemisphereLight('#fff6e6', '#2e3a31', 0.55);
  const key = new DirectionalLight('#fff0da', 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 900 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 3;
  const rim = new DirectionalLight('#dfeaff', 1.3);
  // soft fill from the viewer's side so the dial reads even when the watch turns away from the key
  const fill = new DirectionalLight('#fff7ea', 1.4);
  scene.add(hemi, key, key.target, rim, rim.target, fill, fill.target);

  // ---- DOM hooks
  const stage = $('#stage');
  const pin = $('.stage-pin');
  const heroEls = $$('[data-hero]');
  const passages = $$('[data-p]').map((el) => ({ el, r: el.dataset.p.split(',').map(Number) }));
  const bgDusk = $('.bg-dusk'), bgDeep = $('.bg-deep'), bgHero = $('.bg-hero');
  const panel = $('.collection-panel');
  const cue = $('.scroll-cue');
  const labelsBox = $('.labels'), svg = $('.leaders');
  const labels = watch.groups.filter((g) => g.title).map((g) => {
    const el = document.createElement('div');
    el.className = 'label ' + (g.side === 'L' ? 'is-left' : 'is-right');
    el.innerHTML = `<span class="label-t"></span><span class="label-d"></span>`;
    el.querySelector('.label-t').textContent = g.title;
    el.querySelector('.label-d').textContent = g.text;
    labelsBox.appendChild(el);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '3');
    svg.append(line, dot);
    return { g, el, line, dot, y: 0 };
  });

  // ---- layout
  let W = 1, H = 1, aspect = 1;
  function resize() {
    W = pin.clientWidth; H = pin.clientHeight; aspect = W / H;
    renderer.setSize(W, H, false);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    labels.forEach((l) => { l.h = l.el.offsetHeight; });
  }
  addEventListener('resize', resize);
  resize();
  // portrait screens need the camera further back
  const fit = (base) => (aspect >= 1 ? 1 : clamp(base / aspect, 1, 2.2));

  // ---- scroll with inertia
  let target = 0, smooth = 0, last = performance.now();
  const stageRange = () => {
    const r = stage.getBoundingClientRect();
    return { top: r.top + scrollY, len: stage.offsetHeight - innerHeight };
  };
  let range = stageRange();
  addEventListener('resize', () => { range = stageRange(); });
  // the race is 10% shorter to scroll than the rest of the timeline
  const TRACK_FROM = 0.6, RACE_SCALE = 0.9, OLD_LEN = TRACK_FROM + (1 - TRACK_FROM) * RACE_SCALE;
  const readScroll = () => {
    const v = clamp((scrollY - range.top) / range.len) * OLD_LEN;
    target = clamp(v < TRACK_FROM ? v : TRACK_FROM + (v - TRACK_FROM) / RACE_SCALE);
  };
  addEventListener('scroll', readScroll, { passive: true });
  readScroll();
  smooth = target;

  let introT = reduced ? 1 : 0;
  let introStart = Infinity;

  // reduced motion: hold on a few key states and cut between them
  const KEYS = [0, 0.41, 0.6, 1];
  const snap = (p) => KEYS.reduce((a, k) => (Math.abs(k - p) < Math.abs(a - p) ? k : a), 0);

  const tmpQ = new Quaternion(), camPos = V(0, 0, 300), camTgt = V(0, 0, 0), camUp = V(0, 1, 0);
  let camS = 60, envIsNight = false, hidden = false;
  const sweepStart = { t: Infinity };

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (reduced) smooth = snap(target);
    else {
      const jump = Math.abs(target - smooth) > 0.35;
      smooth = jump ? target : smooth + (target - smooth) * (1 - Math.exp(-dt * 3.2));
    }
    if (!reduced) introT = clamp((now - introStart) / 2600);
    if (introStart === Infinity) introStart = now + 250;
    const p = smooth;
    const pinBelow = scrollY > range.top + range.len + innerHeight * 1.2;
    if (pinBelow) { if (!hidden) { hidden = true; } requestAnimationFrame(frame); return; }
    hidden = false;
    update(p, now / 1000);
    const dbg = window.__dp;
    if (dbg?.cam) { camera.position.set(...dbg.cam[0]); camera.lookAt(...dbg.cam[1]); }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function update(p, t) {
    const intro = easeOut(introT);
    // --- channel values
    const heroOut = seg(p, 0.012, 0.06);
    const spin = ease(seg(p, 0.04, 0.215));
    const shiftIn = ease(seg(p, 0.045, 0.09)) * (1 - ease(seg(p, 0.165, 0.215)));
    const toDark = ease(seg(p, 0.19, 0.275));
    const toExplodePose = ease(seg(p, 0.2, 0.29));
    const strapOut = ease(seg(p, 0.2, 0.25));
    const explode = ease(seg(p, 0.28, 0.37)) * (1 - ease(seg(p, 0.465, 0.52)));
    const hold = seg(p, 0.29, 0.5);
    const labelVis = seg(p, 0.335, 0.37) * (1 - seg(p, 0.445, 0.47));
    const back = ease(seg(p, 0.5, 0.6));
    const strapIn = ease(seg(p, 0.515, 0.56));
    const morph = ease(seg(p, 0.535, 0.61));
    const toTrack = ease(seg(p, 0.605, 0.67));
    const grassIn = ease(seg(p, 0.6, 0.66));
    const wipe = seg(p, 0.635, 0.705);
    const race = seg(p, 0.69, 0.9);
    const collect = ease(seg(p, 0.892, 0.918));
    const chase = ease(seg(p, 0.71, 0.736));      // car is halfway down the screen: zoom in behind it
    const burstB = seg(p, 0.276, 0.335);          // the case opening

    // --- rig orientation
    const idle = reduced ? 0 : (1 - heroOut) * Math.sin(t * 0.5) * 0.05;
    const qHeroSpin = qAxis(Y, spin * Math.PI * 2 + idle).multiply(Q_HERO);
    const qIntro = Q(0.5 * (1 - intro), -2.1 * (1 - intro), 0);
    let q = qIntro.multiply(qHeroSpin);
    const qEx = Q_EXPLODE.clone().multiply(qAxis(Z, hold * 0.9));
    q = tmpQ.copy(q).slerp(qEx, toExplodePose);
    if (back > 0) {
      // settle into a three-quarter hero angle with the strap laid out, then square up for the track
      const hold34 = 1 - toTrack;
      q = Q(0.3 * hold34, -0.42 * hold34, 0.06 * hold34).multiply(qEx.clone().slerp(Q_FACE, back)).multiply(qAxis(Z, (1 - back) * Math.PI * 2));
    }
    rig.quaternion.copy(q);

    // --- rig position
    const portrait = aspect < 1;
    const shiftX = portrait ? 0 : 30;
    const heroPos = V(shiftX * shiftIn, -13 + 8 * shiftIn + (reduced ? 0 : Math.sin(t * 0.8) * 0.6 * (1 - heroOut)), 0);
    const introPos = V(0, 40, -620);
    const pos = introPos.lerp(heroPos, intro);
    pos.lerp(V(0, 0, 0), toExplodePose);
    rig.position.copy(pos);

    // --- watch parts
    watch.setExplode(explode);
    watch.setTime();
    watch.setLume(toDark * (1 - back) * 0.85);

    // --- strap
    strap.setOpacity(clamp(back > 0 ? strapIn : 1 - strapOut));
    strap.group.position.set(0, 0, -26 * strapOut * (1 - strapIn));
    strap.update(back > 0 ? morph : 0);
    const wipeS = wipe > 0 ? lerp(-1, 132, wipe) : -1;
    strap.setWipe(wipeS);
    track.setReveal(wipe > 0 ? lerp(-1, 132, wipe) + seg(p, 0.7, 0.75) * TRACK.TRACK_LEN : -1);
    track.setGrass(grassIn);
    track.group.visible = p > 0.58;

    // --- car: speed follows the scroll, braking for each insight
    let carS = -1, speed = 0;
    if (race > 0) [carS, speed] = DRIVE(p);
    const fast = clamp((speed - 1500) / 7000);    // 0 crawling .. 1 flat out
    const rumble = reduced ? 0 : chase * (0.25 + 0.75 * fast);
    track.setCar(carS, speed / 8, rumble, t);

    // --- camera
    const fHero = fit(0.72), fEx = fit(0.9);
    const heroCam = { pos: V(0, 3, 218 * fHero), tgt: V(0, 0, 0) };
    const exCam = { pos: V(0, -2, 300 * fEx), tgt: V(0, 4, 0) };
    const faceCam = { pos: V(0, -6, 225 * fit(0.75)), tgt: V(0, -4, 0) };
    camPos.copy(heroCam.pos).lerp(exCam.pos, toExplodePose).lerp(faceCam.pos, back);
    camTgt.copy(heroCam.tgt).lerp(exCam.tgt, toExplodePose).lerp(faceCam.tgt, back);
    if (toTrack > 0) {
      // follow the car down the straight and into the bend
      const desired = race > 0 ? clamp(carS - 8, 60, TRACK.CAM_MAX) : 60;
      camS = race > 0 ? Math.max(camS + (desired - camS) * 0.32, 60) : 60;
      const cp = trackPoint(camS);
      const hgt = lerp(118, 158, seg(camS, 120, 260)) * fit(0.6);
      const tgt = V(cp.x, cp.y, TRACK_Z);
      camPos.lerp(V(tgt.x, tgt.y - 2, TRACK_Z + hgt), toTrack);
      camTgt.lerp(tgt, toTrack);
    } else camS = 60;
    camUp.set(0, 1, 0);
    if (chase > 0 && carS > 0) {
      // ride along: low behind the car, looking down the road; let it go at the end
      const sCam = Math.min(carS, DRIVE(CAM_RELEASE)[0]);
      // follow on the smoothed heading, a beat behind the car, like a chase car would
      const [cx, cy] = carPosAt(sCam), hc = carHeadingAt(Math.max(sCam - 6, 0));
      const fx = Math.cos(hc), fy = Math.sin(hc);
      const fc = fit(0.7); // portrait screens: sit further back
      const behind = carModel ? 36 * fc : 0, up = carModel ? 21 * fc : 62 * fc, ahead = carModel ? 12 : 0;
      const chasePos = V(cx - fx * behind, cy - fy * behind, TRACK_Z + up);
      // keep the car in frame while the camera swings in, then look down the road
      const lead = ahead * chase * chase;
      const chaseTgt = V(cx + fx * lead, cy + fy * lead, TRACK_Z + (carModel ? 2 : 0));
      // rumble: fast, irregular shake that grows with speed
      const a = rumble * (carModel ? 0.32 : 0.5);
      chasePos.x += a * (Math.sin(t * 43) * 0.6 + Math.sin(t * 71 + 2) * 0.4);
      chasePos.y += a * (Math.sin(t * 37 + 1) * 0.5 + Math.sin(t * 89) * 0.5);
      chasePos.z += a * 0.7 * Math.sin(t * 59 + 0.5);
      // glide in along a rising arc: back and up the slope, then settle in behind the car
      const arc = V(cx - fx * behind * 1.6, cy - fy * behind * 1.6, TRACK_Z + up * 2.6);
      const u = chase, a0 = (1 - u) * (1 - u), a1 = 2 * u * (1 - u), a2 = u * u;
      camPos.set(camPos.x * a0 + arc.x * a1 + chasePos.x * a2, camPos.y * a0 + arc.y * a1 + chasePos.y * a2, camPos.z * a0 + arc.z * a1 + chasePos.z * a2);
      camTgt.lerp(chaseTgt, chase);
      // without a 3D car, a top-down chase turned to the car's heading
      const chaseUp = carModel ? V(0, 0, 1) : V(fx, fy, 0);
      camUp.lerp(chaseUp, chase).normalize();
      const roll = rumble * 0.006 * Math.sin(t * 31);
      camUp.applyAxisAngle(V(fx, fy, 0), roll);
    }
    camera.up.copy(camUp);
    camera.position.copy(camPos);
    camera.lookAt(camTgt);

    // --- whoosh lines: as the strap becomes the track, and on the fast stretches
    const whooshWipe = reduced ? 0 : Math.sin(Math.PI * clamp((p - 0.632) / 0.08)) * (p > 0.632 && p < 0.712 ? 1 : 0);
    if (chase > 0.05 && carS > 0) {
      const [cx, cy] = carPosAt(carS), [x2, y2] = carPosAt(carS + 3);
      const dl = Math.hypot(x2 - cx, y2 - cy) || 1;
      lines.update(t, { x: cx, y: cy }, [(x2 - cx) / dl, (y2 - cy) / dl], reduced ? 0 : chase * clamp((fast - 0.25) / 0.5) * 0.95, [26, 150], TRACK_Z + 0.4, camera.position);
    } else {
      lines.update(t * 1.6, { x: 0, y: camTgt.y }, [0, 1], whooshWipe, [46, 170], TRACK_Z + 0.6, camera.position);
    }

    // --- the case opening: white burst
    const flash = burst.update(reduced ? 0 : burstB, rig.position, camera);
    if (flashEl) flashEl.style.opacity = (flash * 0.55).toFixed(3);

    // --- light sweep and glints: glistening across the crystal, bezel and crown
    if (sweepStart.t === Infinity && introT > 0.75) sweepStart.t = t;
    const cyc = sweepStart.t === Infinity ? -1 : ((t - sweepStart.t) % 6.5) / 1.7;
    const sweepPos = window.__dp?.sweep ?? (!reduced && cyc >= 0 && cyc <= 1 ? lerp(-27, 27, ease(cyc)) : 99);
    const heroLight = (1 - toDark) * intro, nightLight = toDark * (1 - back) * 0.65;
    M.sweep.uSweep.value = sweepPos;
    M.sweep.uSweepI.value = heroLight * 0.7 + nightLight * 0.35;
    glints.update(t, sweepPos, clamp(heroLight + nightLight * (0.4 + explode)) * (1 - back));
    scene.environmentRotation.y = reduced ? 0 : Math.sin(t * 0.22) * 0.45 * (1 - toDark);

    // --- lights follow the rig
    const c = rig.position;
    key.position.set(c.x - 140, c.y + 180, c.z + 160);
    key.target.position.copy(c);
    if (toTrack > 0) { key.position.set(camTgt.x - 80, camTgt.y + 120, 260); key.target.position.copy(camTgt); }
    rim.position.set(c.x + 160, c.y + 40, c.z - 140); rim.target.position.copy(c);
    fill.position.copy(camera.position).add(V(-30, 40, 0)); fill.target.position.copy(c);
    fill.intensity = lerp(1.5, 0.5, toDark) * (1 - grassIn) + back * 0.6 * (1 - toTrack);
    key.intensity = lerp(lerp(2.4, 2.9, toDark), 2.1, back);
    key.color.set(toDark > 0.5 && back < 0.5 ? '#e8efff' : '#fff0da');
    rim.intensity = lerp(1.3, 3.2, toDark * (1 - back)) + 2.4 * back * (1 - toTrack);
    hemi.intensity = lerp(lerp(0.55, 0.3, toDark), 0.5, Math.max(back * 0.6, grassIn));
    // beach reflections by day, moonlit at night, a neutral studio once the strap is laid out
    const envName = back >= 0.5 ? 'studio' : toDark > 0.5 ? 'night' : 'day';
    if (envName !== envIsNight) { scene.environment = { day: envDay, night: envNight, studio: envStudio }[envName]; envIsNight = envName; }
    scene.environmentIntensity = envName === 'night' ? lerp(1.0, 1.25, explode) : envName === 'studio' ? 1.05 : lerp(1, 0.8, toDark);

    // contact shadow under the hero
    contact.visible = toExplodePose < 0.99;
    contact.material.opacity = 0.55 * (1 - toExplodePose) * intro;
    contact.position.set(rig.position.x, rig.position.y - 37, rig.position.z - 16);
    contact.scale.set(120, 76, 1);

    // --- DOM
    // the headline is up first; the tagline and buttons follow the watch in
    heroEls.forEach((el) => {
      const ramp = el.dataset.hero === 'foot' && !reduced ? clamp(introT * 1.8 - 0.7) : 1;
      el.style.cssText = `opacity:${(1 - heroOut) * ramp};filter:blur(${heroOut * 10}px);transform:translateY(${-heroOut * 30}px)`;
    });
    if (cue) cue.style.opacity = String(1 - seg(p, 0.005, 0.03));
    for (const { el, r } of passages) {
      const a = seg(p, r[0], r[1]), b = seg(p, r[2], r[3]);
      const o = a * (1 - b);
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translateY(${(1 - a) * 26 - b * 26}px)`;
      el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
    }
    bgDusk.style.opacity = toDark.toFixed(3);
    bgDeep.style.opacity = clamp(ease(seg(p, 0.235, 0.3)) * 0.82 - back * 0.22).toFixed(3);
    bgHero.style.opacity = (1 - toDark * 0.999).toFixed(3);
    canvas.style.opacity = (1 - ease(seg(p, 0.908, 0.92))).toFixed(3);
    // the collection opens out of the spot where the car disappears
    if (collect > 0 && collect < 1) {
      const [cx, cy] = carPosAt(Math.max(carS, 1));
      proj.set(cx, cy, TRACK_Z).applyMatrix4(rig.matrixWorld).project(camera);
      const sx = clamp((proj.x * 0.5 + 0.5) * W, 0, W), sy = clamp((-proj.y * 0.5 + 0.5) * H, 0, H);
      const r = Math.hypot(Math.max(sx, W - sx), Math.max(sy, H - sy)) * collect;
      panel.style.clipPath = `circle(${r.toFixed(1)}px at ${sx.toFixed(1)}px ${sy.toFixed(1)}px)`;
    } else panel.style.clipPath = collect >= 1 ? 'none' : 'circle(0px at 50% 50%)';
    panel.classList.toggle('is-live', p > 0.918);
    panel.style.visibility = collect > 0.001 ? 'visible' : 'hidden';
    onCollection?.(p > 0.918);

    // --- labels
    layoutLabels(labelVis);
  }

  const proj = new Vector3();
  function layoutLabels(vis) {
    labelsBox.style.opacity = vis.toFixed(3);
    svg.style.opacity = vis.toFixed(3);
    labelsBox.style.visibility = svg.style.visibility = vis > 0.001 ? 'visible' : 'hidden';
    if (vis <= 0.001) return;
    rig.updateMatrixWorld(true);
    const narrow = W < 760;
    const gap = narrow ? 40 : 58;
    for (const side of ['L', 'R']) {
      const items = labels.filter((l) => l.g.side === side);
      for (const l of items) {
        watch.anchorWorld(l.g, proj);
        proj.project(camera);
        l.ax = (proj.x * 0.5 + 0.5) * W; l.ay = (-proj.y * 0.5 + 0.5) * H;
        l.y = l.ay;
      }
      items.sort((a, b) => a.ay - b.ay);
      // relax so labels never overlap
      const top = narrow ? 70 : 96, bottom = H - (narrow ? 30 : 50);
      for (let it = 0; it < 8; it++) {
        for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
        const over = items.length ? items[items.length - 1].y - bottom : 0;
        if (over > 0) items.forEach((l) => { l.y -= over; });
        for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].y - items[i].y < gap) items[i].y = items[i + 1].y - gap;
        if (items.length && items[0].y < top) { const d = top - items[0].y; items.forEach((l) => { l.y += d; }); }
      }
      const margin = narrow ? 12 : Math.max(28, W * 0.06);
      const colX = side === 'L' ? margin : W - margin;
      const lineX = side === 'L' ? Math.min(W * (narrow ? 0.3 : 0.27), l0(items) - 20) : Math.max(W * (narrow ? 0.7 : 0.73), r0(items) + 20);
      for (const l of items) {
        l.el.style.transform = `translate(${side === 'L' ? colX : colX - l.el.offsetWidth}px, ${l.y - 12}px)`;
        const ex = side === 'L' ? lineX : lineX;
        l.line.setAttribute('d', `M${l.ax.toFixed(1)},${l.ay.toFixed(1)} L${ex.toFixed(1)},${l.y.toFixed(1)} L${(side === 'L' ? colX + Math.min(l.el.offsetWidth, W * 0.2) + 8 : colX - Math.min(l.el.offsetWidth, W * 0.2) - 8).toFixed(1)},${l.y.toFixed(1)}`);
        l.dot.setAttribute('cx', l.ax.toFixed(1)); l.dot.setAttribute('cy', l.ay.toFixed(1));
      }
    }
  }
  const l0 = (items) => Math.min(...items.map((l) => l.ax));
  const r0 = (items) => Math.max(...items.map((l) => l.ax));

  if (new URLSearchParams(location.search).has('debug')) {
    window.__dp = {
      scene, camera, rig, watch, strap, track, renderer, M, update,
      state: () => ({ target, smooth, range, scrollY }),
      skipIntro: () => { introStart = -1e9; introT = 1; },
      go: (p) => { range = stageRange(); scrollTo(0, range.top + p * range.len); readScroll(); smooth = target; },
      renderAt: (p, frames = 1) => {
        // p is timeline progress; invert the race compression to find the scroll position
        const raw = (p < TRACK_FROM ? p : TRACK_FROM + (p - TRACK_FROM) * RACE_SCALE) / OLD_LEN;
        range = stageRange(); scrollTo(0, range.top + raw * range.len); readScroll(); smooth = target;
        for (let i = 0; i < frames; i++) update(p, performance.now() / 1000);
        renderer.render(scene, camera);
      },
    };
  }

  // warm up shaders, then go
  renderer.compile(scene, camera);
  onReady?.();
  requestAnimationFrame(frame);

  return {
    ok: true,
    jumpTo(p) { range = stageRange(); scrollTo({ top: range.top + p * range.len, behavior: 'auto' }); },
    range: () => stageRange(),
  };
}
