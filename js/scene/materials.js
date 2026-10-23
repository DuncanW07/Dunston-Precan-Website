import {
  AddEquation, CanvasTexture, Color, CustomBlending, LinearSRGBColorSpace, OneFactor, ZeroFactor, MeshPhysicalMaterial, MeshStandardMaterial,
  RepeatWrapping, SRGBColorSpace, TextureLoader,
} from '../../vendor/three.module.min.js';

// Materials follow the DP-41 CMF specification (Rev A, 21 Oct 2026) finish codes:
// F01 vertical dial brush, F02 mirror polish, F03 linear satin, F04 circular satin,
// F09 flush lume, F10 pad print, F11 factory movement finish, F12 calfskin.
// Colors stay with the Discipline product photos: green PVD case, silver details.

// Dial-plane mapping: CAD x,y (mm) to uv over the Ø32.6 dial.
export const DIAL_R = 16.3;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// F01: fine grain running 12 to 6, over the Côtes de Genève stripes (2.50 mm pitch).
function dialTextures(c1, c2, stripes = true) {
  const N = 2048, mmPerPx = (DIAL_R * 2) / N;
  const [cc, cx] = canvas(N), [rc, rx] = canvas(N), [bc, bx] = canvas(N);
  const a = new Color(c1), b = new Color(c2);
  const img = cx.createImageData(N, N), rimg = rx.createImageData(N, N), bimg = bx.createImageData(N, N);
  const col = new Float32Array(N * 3), rough = new Float32Array(N), grain = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i * mmPerPx - DIAL_R;
    const k = Math.round(x / 2.5), t = (x - k * 2.5) / 1.25;
    const base = stripes && (k & 1) ? b : a;
    const sheen = stripes ? 0.92 + 0.12 * Math.cos(t * Math.PI * 0.5) - 0.05 * t : 1;
    // brushed lay: many fine scratches of varying depth
    const g = 0.5 * hash(i) + 0.3 * hash(i * 3.1 + 7) + 0.2 * hash(Math.floor(i / 3) + 91);
    grain[i] = g;
    const shade = sheen * (0.95 + 0.1 * (g - 0.5)) * (stripes && Math.abs(t) > 0.975 ? 0.8 : 1);
    col[i * 3] = Math.min(255, base.r * 255 * shade); col[i * 3 + 1] = Math.min(255, base.g * 255 * shade); col[i * 3 + 2] = Math.min(255, base.b * 255 * shade);
    rough[i] = (stripes && (k & 1) ? 0.36 : 0.3) * 255 + 26 * (g - 0.5);
  }
  for (let j = 0; j < N; j++) {
    const wob = Math.sin(j * 0.013) * 0.6; // scratches are never perfectly straight
    for (let i = 0; i < N; i++) {
      const p = (j * N + i) * 4, ii = Math.min(N - 1, Math.max(0, Math.round(i + wob)));
      img.data[p] = col[ii * 3]; img.data[p + 1] = col[ii * 3 + 1]; img.data[p + 2] = col[ii * 3 + 2]; img.data[p + 3] = 255;
      rimg.data[p] = rimg.data[p + 1] = rimg.data[p + 2] = rough[ii]; rimg.data[p + 3] = 255;
      const h = grain[ii] * 255 * (0.85 + 0.15 * hash(ii * 13 + Math.floor(j / 40)));
      bimg.data[p] = bimg.data[p + 1] = bimg.data[p + 2] = h; bimg.data[p + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0); bx.putImageData(bimg, 0, 0);
  const map = new CanvasTexture(cc); map.colorSpace = SRGBColorSpace; map.anisotropy = 16;
  const roughnessMap = new CanvasTexture(rc); roughnessMap.colorSpace = LinearSRGBColorSpace; roughnessMap.anisotropy = 16;
  const bumpMap = new CanvasTexture(bc); bumpMap.colorSpace = LinearSRGBColorSpace; bumpMap.anisotropy = 16;
  return { map, roughnessMap, bumpMap };
}

// F04 concentric brushing: tangential anisotropy directions plus a ring-grain bump.
function circularTextures() {
  const N = 1024;
  const [c, x] = canvas(N), [gc, gx] = canvas(N);
  const img = x.createImageData(N, N), gimg = gx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N, v = 1 - (j + 0.5) / N;
    const px = u * 2 - 1, py = v * 2 - 1, r = Math.hypot(px, py) || 1;
    const p = (j * N + i) * 4;
    img.data[p] = ((-py / r) * 0.5 + 0.5) * 255;
    img.data[p + 1] = ((px / r) * 0.5 + 0.5) * 255;
    img.data[p + 2] = 255; img.data[p + 3] = 255;
    const ring = Math.floor(r * 1400);
    const g = (0.6 * hash(ring) + 0.4 * hash(ring * 0.37 + 5)) * 255;
    gimg.data[p] = gimg.data[p + 1] = gimg.data[p + 2] = g; gimg.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0); gx.putImageData(gimg, 0, 0);
  const dir = new CanvasTexture(c); dir.colorSpace = LinearSRGBColorSpace;
  const grain = new CanvasTexture(gc); grain.colorSpace = LinearSRGBColorSpace; grain.anisotropy = 16;
  return { dir, grain };
}

// F03 linear satin: straight horizontal lay.
function linearGrain() {
  const N = 1024;
  const [c, x] = canvas(N);
  const img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) {
    const g = (0.55 * hash(j) + 0.45 * hash(j * 2.3 + 17)) * 255;
    for (let i = 0; i < N; i++) { const p = (j * N + i) * 4; img.data[p] = img.data[p + 1] = img.data[p + 2] = g * (0.9 + 0.1 * hash(Math.floor(i / 64) + j)); img.data[p + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  const t = new CanvasTexture(c); t.colorSpace = LinearSRGBColorSpace; t.anisotropy = 16;
  return t;
}

export function radialGradientTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  const [c, x] = canvas(256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.45).toFixed(3) + ')'));
  g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
}

const loader = new TextureLoader();
export function loadTex(url, { srgb = true, repeat = null } = {}) {
  return new Promise((res) => {
    loader.load(url, (t) => {
      if (srgb) t.colorSpace = SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
      t.anisotropy = 8;
      res(t);
    }, undefined, () => res(null));
  });
}

// Mirror-polished top faces, satin flanks (CMF: case top & lugs F02, case side F03),
// chosen per fragment from the object-space normal.
export function zoneByNormal(mat, { flatRough, sideRough, flatIsTop = true }) {
  const u = { uFlatR: { value: flatRough }, uSideR: { value: sideRough } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vObjN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vObjN = objectNormal;');
    sh.fragmentShader = 'uniform float uFlatR; uniform float uSideR; varying vec3 vObjN;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  float flatness = smoothstep(0.45, 0.8, ${flatIsTop ? 'vObjN.z' : 'abs(vObjN.z)'} / max(length(vObjN), 1e-4));
  roughnessFactor = mix(uSideR, uFlatR, flatness);`);
  };
  mat.customProgramCacheKey = () => `zone-${flatRough}-${sideRough}-${flatIsTop}`;
  return mat;
}

export const PALETTES = {
  discipline: {
    coating: '#2a5940',                     // green PVD over 316L (P01), per the product photo
    dial: ['#2a6a4b', '#215a3f'], base: '#0d1a13', // British Racing Green field, F01
    steel: '#c4c8cc',                       // M01 silver trim
    lume: '#efe2c0',                        // A01 ivory lume day color
    paint: '#15171a',
    leather: '#402a1f', stitch: '#7b5a3b',  // L02 chocolate calf, S02 thread
  },
};

export function makeMaterials(palette = PALETTES.discipline) {
  const dialTex = dialTextures(palette.dial[0], palette.dial[1], true);
  const plaqueTex = dialTextures(palette.dial[0], palette.dial[0], false); // same color batch, no stripes
  const circ = circularTextures();
  const lin = linearGrain();

  // case middle: polished top and lugs, horizontally brushed flanks
  const coating = zoneByNormal(new MeshPhysicalMaterial({
    color: palette.coating, metalness: 1, roughness: 0.05,
    clearcoat: 0.55, clearcoatRoughness: 0.06, envMapIntensity: 1.35,
  }), { flatRough: 0.05, sideRough: 0.3 });
  // bezel and crown: F02 mirror polish, crisp flute facets
  const coatingPolished = new MeshPhysicalMaterial({
    color: palette.coating, metalness: 1, roughness: 0.045, clearcoat: 0.6, clearcoatRoughness: 0.04, envMapIntensity: 1.45,
  });
  // caseback: circular brush
  const caseback = new MeshPhysicalMaterial({
    color: palette.coating, metalness: 1, roughness: 0.26, anisotropy: 0.7, anisotropyMap: circ.dir,
    bumpMap: circ.grain, bumpScale: 0.25, envMapIntensity: 1.2,
  });
  // chapter ring and inner ring: F04 concentric satin, silver M01
  const steelBrushedCirc = new MeshPhysicalMaterial({
    color: palette.steel, metalness: 1, roughness: 0.27, anisotropy: 0.85, anisotropyMap: circ.dir,
    bumpMap: circ.grain, bumpScale: 0.35, envMapIntensity: 1.15,
  });
  // AUTOMATIC key-bridge and skeleton frame: F03 linear satin
  const steelBrushed = new MeshPhysicalMaterial({
    color: palette.steel, metalness: 1, roughness: 0.3, anisotropy: 0.7, bumpMap: lin, bumpScale: 0.3, envMapIntensity: 1.15,
  });
  // hands, index frames, brand script: F02 mirror polish
  const steelPolished = new MeshPhysicalMaterial({
    color: '#dfe2e5', metalness: 1, roughness: 0.04, envMapIntensity: 1.5,
  });
  // minute hand: circular-satin raised ring with polished bevels
  const ringHand = zoneByNormal(new MeshPhysicalMaterial({
    color: '#dfe2e5', metalness: 1, roughness: 0.2, anisotropy: 0.8, anisotropyMap: circ.dir,
    bumpMap: circ.grain, bumpScale: 0.3, envMapIntensity: 1.4,
  }), { flatRough: 0.2, sideRough: 0.04 });
  const beadBlast = new MeshStandardMaterial({ color: '#dcdedf', metalness: 0.85, roughness: 0.5 });
  const paint = new MeshStandardMaterial({ color: palette.paint, metalness: 0.1, roughness: 0.6 });
  const dial = new MeshPhysicalMaterial({
    color: '#ffffff', map: dialTex.map, roughnessMap: dialTex.roughnessMap, roughness: 1,
    bumpMap: dialTex.bumpMap, bumpScale: 0.18,
    metalness: 0.28, anisotropy: 0.75, anisotropyRotation: Math.PI / 2,
    clearcoat: 0.25, clearcoatRoughness: 0.12, envMapIntensity: 1.0,
  });
  const plaque = dial.clone();
  plaque.map = plaqueTex.map; plaque.roughnessMap = plaqueTex.roughnessMap; plaque.bumpMap = plaqueTex.bumpMap;
  const dialBase = new MeshStandardMaterial({ color: palette.base, metalness: 0.4, roughness: 0.6 });
  // F09 flush lume: ivory by day, green at night
  const lume = new MeshStandardMaterial({
    color: palette.lume, metalness: 0, roughness: 0.55, emissive: new Color('#9ff0b4'), emissiveIntensity: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  // F10 pad-printed minute ticks: lume color, no glow
  const tickInk = new MeshStandardMaterial({ color: palette.lume, metalness: 0, roughness: 0.6 });
  // AR-coated sapphire: only its reflections are added over the dial, no haze.
  // uSweep drives a soft glint that travels across the crystal.
  const sweep = { uSweep: { value: -40 }, uSweepI: { value: 0 } };
  const glass = new MeshPhysicalMaterial({
    color: '#000000', metalness: 0, roughness: 0.03, ior: 1.77, specularIntensity: 0.22,
    envMapIntensity: 0.14, transparent: true, depthWrite: false,
    // add color, keep the canvas alpha untouched so it composites over the page
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
  });
  glass.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, sweep);
    sh.vertexShader = 'varying vec3 vObjP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vObjP = position;');
    sh.fragmentShader = 'uniform float uSweep; uniform float uSweepI; varying vec3 vObjP;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
  float along = dot(vObjP.xy, normalize(vec2(0.82, 0.57)));
  float band = exp(-pow((along - uSweep) / 0.75, 2.0)) + 0.45 * exp(-pow((along - uSweep + 3.2) / 0.3, 2.0)) + 0.12 * exp(-pow((along - uSweep) / 4.0, 2.0));
  float edge = smoothstep(17.2, 14.0, length(vObjP.xy));
  outgoingLight += vec3(1.0, 0.97, 0.9) * band * edge * uSweepI;
  #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'sapphire-sweep';
  const rubber = new MeshStandardMaterial({ color: '#0b0c0d', roughness: 0.8, metalness: 0 });
  const pom = new MeshStandardMaterial({ color: '#2b2e30', roughness: 0.6, metalness: 0.1 });
  const movementSide = new MeshStandardMaterial({ color: '#b8bcbf', metalness: 0.9, roughness: 0.35 });

  return {
    coating, coatingPolished, caseback, steelBrushedCirc, steelBrushed, steelPolished, ringHand, beadBlast, paint,
    dial, plaque, dialBase, lume, tickInk, glass, rubber, pom, movementSide, sweep, palette,
  };
}
