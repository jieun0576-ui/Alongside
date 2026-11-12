import {
  BackSide, BoxGeometry, CircleGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Scene, SphereGeometry,
} from 'three';
import { BOARDWALK, GRASS, TRAIL, WALK } from './protocol';
import { buildPark } from './park';

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

// A big dome around everything, coloured by height, with the sun and its glow.
function sunsetSky() {
  const g = new Group();
  const dome = new SphereGeometry(250, 32, 16);
  const pos = dome.getAttribute('position');
  const colours: number[] = [];
  const low = new Color('#ffb36b'), mid = new Color('#f09a9a'), high = new Color('#59688f'), c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 250); // 0 at the horizon, 1 straight up
    if (h < 0.15) c.lerpColors(low, mid, h / 0.15);
    else c.lerpColors(mid, high, Math.min(1, (h - 0.15) / 0.5));
    colours.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new Float32BufferAttribute(colours, 3));
  g.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false })));
  const disc = (r: number, color: string, opacity: number, y: number, z: number) => {
    const m = new Mesh(new CircleGeometry(r, 32), new MeshBasicMaterial({ color, transparent: true, opacity, fog: false }));
    m.position.set(-25, y, z);
    return m;
  };
  g.add(disc(30, '#ffcf8a', 0.35, 14, -232), disc(11, '#ffe6a6', 1, 14, -230)); // glow, then the sun
  return g;
}

export function buildWorld() {
  const scene = new Scene();
  // Always sunset: the sun sits low over the lake, the sky glows from orange at the horizon to dusk blue.
  const haze = '#f2b48c';
  scene.background = new Color(haze);
  scene.fog = new Fog(haze, 30, 110);
  scene.add(sunsetSky());

  scene.add(new HemisphereLight('#ffe2c4', '#6a6f8f', 1.8));
  const sun = new DirectionalLight('#ffb070', 1.5);
  sun.position.set(-10, 12, -60); // low, from across the lake
  scene.add(sun);

  const lake = new Mesh(new PlaneGeometry(400, 400), mat('#a3a9cc'));
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = -0.3;
  scene.add(lake);

  // Boardwalk, running trail and grass, side by side, all with their top at y = 0.
  const strip = (r: { minZ: number; maxZ: number }, thick: number, color: string) =>
    box(60, thick, r.maxZ - r.minZ, color, 0, -thick / 2, (r.minZ + r.maxZ) / 2);
  const ground = [strip(BOARDWALK, 0.3, '#c9a27e'), strip(TRAIL, 0.3, '#b07f68'), strip(GRASS, 0.6, '#9fb38a')];
  scene.add(...ground);

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

  const park = buildPark(scene, ground[0]);

  return { scene, ground, benches, lake, park };
}
