import {
  BackSide, Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, SphereGeometry,
} from '../../vendor/three.module.min.js';

// Studio environment for reflections: the location photo wrapped as a dome,
// plus emissive softboxes so polished steel and sapphire get crisp highlights.
export function buildEnvironment(renderer, photo, { boxes = 1, tint = '#ffffff' } = {}) {
  const scene = new Scene();
  const dome = new Mesh(
    new SphereGeometry(100, 64, 32),
    new MeshBasicMaterial({ map: photo || null, color: photo ? tint : '#9aa59f', side: BackSide }),
  );
  scene.add(dome);

  const panel = (w, h, pos, look, intensity, color = '#ffffff') => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), side: DoubleSide }));
    m.position.set(...pos); m.lookAt(...look);
    scene.add(m);
  };
  if (boxes > 0) {
    panel(90, 24, [0, 70, 30], [0, 0, 0], 4.2 * boxes);              // overhead strip
    panel(30, 80, [-75, 10, 30], [0, 0, 0], 3.2 * boxes, '#fff1dc');  // warm key (sun side)
    panel(16, 70, [70, 0, 40], [0, 0, 0], 2.2 * boxes, '#e6f0ff');   // cool rim
    panel(60, 14, [0, -40, 70], [0, 0, 0], 1.4 * boxes);              // low front bounce
    panel(20, 20, [35, 45, -60], [0, 0, 0], 2.0 * boxes);             // back kicker
  }
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt.texture;
}
