import {
  BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, RingGeometry, Scene,
} from 'three';
import { BOAT_COLOURS, BOAT_LIFE_S, MAX_BOATS, type Boat } from './protocol';

const WATER_Y = -0.28;
const DRIFT = 0.05; // metres per second out onto the lake: 90 m in 30 minutes, into the haze
const hull = new BoxGeometry(0.5, 0.08, 0.22);
const sail = new ConeGeometry(0.14, 0.3, 3);
const ring = new RingGeometry(0.92, 1, 48);
ring.rotateX(-Math.PI / 2);

// Floating Thoughts (paper boats) and Ripple Effect (stones), drawn on the lake.
export function lakeLife(scene: Scene) {
  const boats: { g: Group; x: number; born: number }[] = [];
  const rings: { m: Mesh; start: number }[] = [];
  let now = 0; // seconds, advanced by update()

  function dropBoat(i: number) {
    const b = boats[i];
    scene.remove(b.g);
    (b.g.children[0] as Mesh<BoxGeometry, MeshLambertMaterial>).material.dispose();
    boats.splice(i, 1);
  }

  // Same limit as the server, so every phone shows the same newest 50 boats.
  function addBoat(b: Boat) {
    if (boats.length >= MAX_BOATS) dropBoat(0); // boats arrive oldest first
    const mat = new MeshLambertMaterial({ color: BOAT_COLOURS[b.c] });
    const g = new Group();
    g.add(new Mesh(hull, mat));
    const s = new Mesh(sail, mat);
    s.position.y = 0.17;
    g.add(s);
    scene.add(g);
    boats.push({ g, x: b.x, born: now - b.age });
  }

  // Three soft rings spreading out; rings from different people simply overlap.
  function ripple(x: number, z: number) {
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(ring, new MeshBasicMaterial({ color: '#eef6fa', transparent: true, depthWrite: false }));
      m.position.set(x, WATER_Y + 0.01, z);
      m.visible = false;
      scene.add(m);
      rings.push({ m, start: now + i * 0.45 });
    }
  }

  function update(dt: number) {
    now += dt;
    for (let i = boats.length - 1; i >= 0; i--) {
      const b = boats[i];
      const age = now - b.born;
      if (age > BOAT_LIFE_S) {
        dropBoat(i);
        continue;
      }
      b.g.position.set(b.x + Math.sin(age / 7 + b.x) * 0.6, WATER_Y + Math.sin(age * 1.3) * 0.02, -3.5 - age * DRIFT);
      b.g.rotation.y = Math.sin(age / 5) * 0.3;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const t = (now - r.start) / 3; // each ring lives 3 s
      if (t < 0) continue;
      if (t > 1) {
        scene.remove(r.m);
        (r.m.material as MeshBasicMaterial).dispose();
        rings.splice(i, 1);
        continue;
      }
      r.m.visible = true;
      r.m.scale.setScalar(0.2 + t * 3.5);
      (r.m.material as MeshBasicMaterial).opacity = 0.7 * (1 - t);
    }
  }

  return { addBoat, ripple, update };
}
