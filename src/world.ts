import {
  BoxGeometry, Color, Fog, Group, HemisphereLight, DirectionalLight, Mesh,
  MeshLambertMaterial, PlaneGeometry, Scene,
} from 'three';

// shortcut: placeholder shapes until Hoon's Maya models (glTF) are ready.

// The strip people can walk on, in metres. x runs along the shore, z toward the lake (negative).
const WALK = { minX: -28, maxX: 28, minZ: -2.5, maxZ: 2.5 };

export function clampToWalk(x: number, z: number) {
  return {
    x: Math.min(WALK.maxX, Math.max(WALK.minX, x)),
    z: Math.min(WALK.maxZ, Math.max(WALK.minZ, z)),
  };
}

const mat = (color: string) => new MeshLambertMaterial({ color });

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

export function buildWorld() {
  const scene = new Scene();
  const sky = '#f3d9c4';
  scene.background = new Color(sky);
  scene.fog = new Fog(sky, 30, 110);

  scene.add(new HemisphereLight('#fff4e6', '#5b7c99', 1.6));
  const sun = new DirectionalLight('#ffd8b0', 1.2);
  sun.position.set(-20, 30, -40);
  scene.add(sun);

  const lake = new Mesh(new PlaneGeometry(400, 400), mat('#6f9fbf'));
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = -0.3;
  scene.add(lake);

  const boardwalk = box(60, 0.3, 6, '#c9a27e', 0, -0.15, 0);
  scene.add(boardwalk);
  scene.add(box(60, 0.6, 30, '#9fb38a', 0, -0.2, 18)); // park behind the boardwalk

  // Benches face the lake. Each is one group so a tap anywhere on it counts.
  const benches: Group[] = [];
  for (const x of [-18, -6, 6, 18]) {
    const bench = new Group();
    bench.add(box(1.8, 0.1, 0.5, '#7a5a40', 0, 0.45, 0)); // seat
    bench.add(box(1.8, 0.5, 0.1, '#7a5a40', 0, 0.75, 0.25)); // back
    bench.add(box(0.1, 0.45, 0.4, '#4d3a2a', -0.8, 0.22, 0));
    bench.add(box(0.1, 0.45, 0.4, '#4d3a2a', 0.8, 0.22, 0));
    bench.position.set(x, 0, -1.8);
    scene.add(bench);
    benches.push(bench);
  }

  // A soft far shore across the lake, not real landmarks.
  [[-50, 6, 10], [-38, 10, 8], [-24, 4, 12], [-8, 14, 7], [6, 8, 10], [20, 18, 6], [34, 7, 12], [48, 11, 9]]
    .forEach(([x, h, w]) => scene.add(box(w, h, 6, '#b7a3a8', x, h / 2 - 0.3, -80)));

  return { scene, boardwalk, benches };
}
