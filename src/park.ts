import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, DodecahedronGeometry, Group, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type BufferGeometry,
  type Material, type Scene,
} from 'three';
import { BOARDWALK, GRASS, TRAIL } from './protocol';

// A low-poly park by the lake in the spirit of Toronto's Harbourfront: a plank boardwalk with a stone edge,
// lamps, a row of street trees along the trail, a park with paths and tree clumps,
// and the green islands across the water. Only for looks: taps still land on the ground strips.
// shortcut: hand-placed shapes; Hoon's OpenStreetMap model can replace this later.

const flat = (color: string) => new MeshLambertMaterial({ color, flatShading: true });
const LEN = 60; // the ground strips are 60 m long, x -30..30

// Seeded, so every phone builds the same park.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Many copies of one shape, drawn in one go.
function many(geo: BufferGeometry, mat: Material, spots: { x: number; y: number; z: number; s?: number; r?: number }[]) {
  const m = new InstancedMesh(geo, mat, spots.length);
  const o = new Object3D();
  spots.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z);
    o.scale.setScalar(p.s ?? 1);
    o.rotation.set(0, p.r ?? 0, 0);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  return m;
}

// Wooden planks running across the boardwalk, drawn once on a small canvas.
function planks() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9a27e';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#b48c69';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 2, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(LEN / 0.6, 1); // a plank every 15 cm
  return t;
}

export function buildPark(scene: Scene, boardwalk: Mesh) {
  const rand = seeded(7);
  const park = new Group();

  (boardwalk.material as MeshLambertMaterial).map = planks();
  (boardwalk.material as MeshLambertMaterial).color = new Color('#ffffff');

  // Granite edge where the boardwalk meets the water, and mooring posts on it.
  const edge = new Mesh(new BoxGeometry(LEN, 0.36, 0.3), flat('#b9b2a8'));
  edge.position.set(0, -0.12, BOARDWALK.minZ + 0.15);
  park.add(edge);
  const posts: { x: number; y: number; z: number }[] = [];
  for (let x = -27; x <= 27; x += 9) posts.push({ x, y: 0.2, z: BOARDWALK.minZ + 0.15 });
  park.add(many(new CylinderGeometry(0.12, 0.14, 0.4, 8), flat('#4d4a48'), posts));

  // Lamps along the inland edge of the boardwalk, between the benches.
  const lamps: { x: number; y: number; z: number }[] = [];
  for (const x of [-24, -12, 12, 24]) lamps.push({ x, y: 0, z: BOARDWALK.maxZ - 0.4 });
  park.add(many(new CylinderGeometry(0.05, 0.07, 3.2, 6).translate(0, 1.6, 0), flat('#3f3d3b'), lamps));
  park.add(many(new BoxGeometry(0.3, 0.32, 0.3).translate(0, 3.3, 0), new MeshBasicMaterial({ color: '#ffe3a8' }), lamps));

  // The running trail's centre line, dashed.
  const dashes: { x: number; y: number; z: number }[] = [];
  for (let x = -29; x < 30; x += 2) dashes.push({ x, y: 0.005, z: (TRAIL.minZ + TRAIL.maxZ) / 2 });
  const dash = new PlaneGeometry(1, 0.08).rotateX(-Math.PI / 2);
  park.add(many(dash, new MeshBasicMaterial({ color: '#f1e6d6' }), dashes));

  // Paths through the park: a long one parallel to the shore and a few cutting across.
  const path = flat('#d8c7a6');
  const lay = (w: number, d: number, x: number, z: number, r = 0) => {
    const m = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), path);
    m.position.set(x, 0.004, z);
    m.rotation.y = r;
    park.add(m);
  };
  lay(LEN, 1.6, 0, 17);
  for (const x of [-20, 2, 22]) lay(1.4, 11, x, 11.5);
  lay(1.4, 16, -9, 26, 0.5);
  lay(1.4, 16, 13, 26, -0.4);

  // Trees: a straight row along the trail like Queens Quay, then clumps across the park.
  const trees: { x: number; z: number; s: number; r: number; now: number }[] = [];
  for (let x = -27; x <= 27; x += 6) trees.push({ x, z: GRASS.minZ + 1, s: 1, r: rand() * Math.PI, now: 1 });
  for (let i = 0; i < 70; i++) {
    const x = rand() * 56 - 28;
    const z = GRASS.minZ + 4 + rand() * 26;
    // keep the paths clear
    if (Math.abs(z - 17) < 1.8 || [-20, 2, 22].some((px) => Math.abs(x - px) < 1.6 && z < 17)) continue;
    trees.push({ x, z, s: 0.8 + rand() * 0.6, r: rand() * Math.PI, now: 1 });
  }
  const trunks = new InstancedMesh(new CylinderGeometry(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0), flat('#6b4f3a'), trees.length);
  const crowns = new InstancedMesh(new DodecahedronGeometry(1.1, 0).translate(0, 1.6, 0), flat('#ffffff'), trees.length);
  const greens = ['#7f9f63', '#6c8f58', '#94ad6c'].map((c) => new Color(c));
  trees.forEach((_, i) => crowns.setColorAt(i, greens[Math.floor(rand() * 3)]));
  park.add(trunks, crowns);
  const o = new Object3D();
  function placeTrees() {
    trees.forEach((t, i) => {
      o.position.set(t.x, 0, t.z);
      o.rotation.set(0, t.r, 0);
      o.scale.setScalar(t.s * t.now);
      o.updateMatrix();
      trunks.setMatrixAt(i, o.matrix);
      crowns.setMatrixAt(i, o.matrix);
    });
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
  }
  placeTrees();

  // Flower beds by the trail.
  const flowers: { x: number; y: number; z: number }[] = [];
  for (let x = -24; x <= 24; x += 12) flowers.push({ x: x + 3, y: 0.15, z: GRASS.minZ + 2.4 });
  park.add(many(new BoxGeometry(2.4, 0.3, 0.9), flat('#d98c8c'), flowers));

  // The islands across the bay: long, low and green, with trees.
  const islands = flat('#8fa883');
  for (const [x, w] of [[-45, 50], [20, 70]]) {
    const isl = new Mesh(new BoxGeometry(w, 1.2, 14), islands);
    isl.position.set(x, 0, -75);
    park.add(isl);
  }
  const far: { x: number; y: number; z: number; s: number }[] = [];
  for (let x = -68; x < 55; x += 2.5 + rand() * 2) far.push({ x, y: 1.4, z: -72 - rand() * 6, s: 1.2 + rand() });
  park.add(many(new DodecahedronGeometry(1.1, 0), flat('#7c9873'), far));

  scene.add(park);

  // Trees between the camera and you sink into the ground, so they never hide you; they grow back after.
  return {
    update(at: { x: number; z: number }, dt: number) {
      let moved = false;
      for (const t of trees) {
        const goal = t.z > at.z - 1 && t.z < at.z + 11 && Math.abs(t.x - at.x) < 3.5 ? 0 : 1;
        if (t.now === goal) continue;
        t.now = goal > t.now ? Math.min(1, t.now + dt * 3) : Math.max(0, t.now - dt * 3);
        moved = true;
      }
      if (moved) placeTrees();
    },
  };
}
