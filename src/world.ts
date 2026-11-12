import {
  BoxGeometry, Color, Fog, Group, HemisphereLight, DirectionalLight, Mesh,
  MeshLambertMaterial, PlaneGeometry, Scene,
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
