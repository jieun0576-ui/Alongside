import {
  BufferGeometry, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshLambertMaterial, RingGeometry, Scene,
  SphereGeometry, Vector3,
} from 'three';
import { WATER_Y } from './lake';

const POINTS = 24;
const FLIGHT_S = 0.8;
const stoneGeo = new SphereGeometry(0.08, 8, 6);
const stoneMat = new MeshLambertMaterial({ color: '#8a8580' });

// Ripple Effect, aiming: a soft arc from your hand to a spot on the water,
// and small stones flying along arcs, thrown by you or anyone else.
export function stoneAim(scene: Scene) {
  const arc = new Line(
    new BufferGeometry().setFromPoints(Array.from({ length: POINTS }, () => new Vector3())),
    new LineBasicMaterial({ color: '#fbfaf6', transparent: true, opacity: 0.8 }),
  );
  arc.frustumCulled = false; // its points change every aim
  const spotRing = new RingGeometry(0.3, 0.4, 32);
  spotRing.rotateX(-Math.PI / 2);
  const spot = new Mesh(spotRing, new MeshBasicMaterial({ color: '#fbfaf6', transparent: true, opacity: 0.8 }));
  arc.visible = spot.visible = false;
  scene.add(arc, spot);

  const from = new Vector3();
  const to = new Vector3();
  // Stones in the air, yours and other people's; each lands on the water and then runs land().
  const flights: { m: Mesh; from: Vector3; to: Vector3; peak: number; t: number; land: () => void }[] = [];

  const arcHeight = (a: Vector3, b: Vector3) => Math.hypot(b.x - a.x, b.z - a.z) * 0.25;
  const along = (a: Vector3, b: Vector3, h: number, t: number, out: Vector3) => {
    out.lerpVectors(a, b, t);
    out.y += Math.sin(Math.PI * t) * h;
    return out;
  };

  function aim(hand: Vector3, x: number, z: number) {
    from.copy(hand);
    to.set(x, WATER_Y, z);
    const peak = arcHeight(from, to);
    const pos = arc.geometry.attributes.position;
    const p = new Vector3();
    for (let i = 0; i < POINTS; i++) {
      along(from, to, peak, i / (POINTS - 1), p);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    spot.position.set(x, WATER_Y + 0.02, z);
    arc.visible = spot.visible = true;
  }

  function hide() {
    arc.visible = spot.visible = false;
  }

  // A stone flies from a hand to a spot on the water.
  function fly(hand: Vector3, x: number, z: number, land: () => void) {
    const m = new Mesh(stoneGeo, stoneMat);
    const target = new Vector3(x, WATER_Y, z);
    m.position.copy(hand);
    scene.add(m);
    flights.push({ m, from: hand.clone(), to: target, peak: arcHeight(hand, target), t: 0, land });
  }

  // Throws your own stone along the arc you aimed.
  const throwStone = (land: () => void) => fly(from, to.x, to.z, land);

  function update(dt: number) {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt / FLIGHT_S;
      if (f.t >= 1) {
        scene.remove(f.m);
        flights.splice(i, 1);
        f.land();
        continue;
      }
      along(f.from, f.to, f.peak, f.t, f.m.position);
    }
  }

  return { aim, hide, fly, throwStone, update, target: to };
}
