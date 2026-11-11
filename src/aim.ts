import {
  BufferGeometry, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshLambertMaterial, RingGeometry, Scene,
  SphereGeometry, Vector3,
} from 'three';
import { WATER_Y } from './lake';

const POINTS = 24;
const FLIGHT_S = 0.8;

// Ripple Effect, aiming: a soft arc from your hand to a spot on the water,
// and a small stone that flies along it when you throw.
export function stoneAim(scene: Scene) {
  const arc = new Line(
    new BufferGeometry().setFromPoints(Array.from({ length: POINTS }, () => new Vector3())),
    new LineBasicMaterial({ color: '#fbfaf6', transparent: true, opacity: 0.8 }),
  );
  arc.frustumCulled = false; // its points change every aim
  const spotRing = new RingGeometry(0.3, 0.4, 32);
  spotRing.rotateX(-Math.PI / 2);
  const spot = new Mesh(spotRing, new MeshBasicMaterial({ color: '#fbfaf6', transparent: true, opacity: 0.8 }));
  const stone = new Mesh(new SphereGeometry(0.08, 8, 6), new MeshLambertMaterial({ color: '#8a8580' }));
  arc.visible = spot.visible = stone.visible = false;
  scene.add(arc, spot, stone);

  const from = new Vector3();
  const to = new Vector3();
  let peak = 0;
  let flight = -1; // seconds into the current throw, -1 when no stone is in the air
  const flightFrom = new Vector3();
  const flightTo = new Vector3();
  let flightPeak = 0;
  let onLand = () => {};

  const along = (a: Vector3, b: Vector3, h: number, t: number, out: Vector3) => {
    out.lerpVectors(a, b, t);
    out.y += Math.sin(Math.PI * t) * h;
    return out;
  };

  function aim(hand: Vector3, x: number, z: number) {
    from.copy(hand);
    to.set(x, WATER_Y, z);
    peak = Math.hypot(x - hand.x, z - hand.z) * 0.25;
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

  // Throws along the current arc; land() runs when the stone reaches the water.
  function throwStone(land: () => void) {
    flightFrom.copy(from);
    flightTo.copy(to);
    flightPeak = peak;
    flight = 0;
    onLand = land;
    stone.visible = true;
  }

  function update(dt: number) {
    if (flight < 0) return;
    flight += dt;
    const t = flight / FLIGHT_S;
    if (t >= 1) {
      flight = -1;
      stone.visible = false;
      onLand();
      return;
    }
    along(flightFrom, flightTo, flightPeak, t, stone.position);
  }

  return { aim, hide, throwStone, update, target: to };
}
