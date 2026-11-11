import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial, Scene } from 'three';
import { BOAT_COLOURS } from './protocol';

const SPARKS = 80;
const LIFE_S = 2.2;
const GRAVITY = 3;

// Finishing a run together: soft bursts of light over the water, in the paper-boat colours.
export function fireworks(scene: Scene) {
  const bursts: { p: Points; v: Float32Array; age: number }[] = [];
  const queue: { at: number; x: number }[] = [];
  let now = 0;

  function burst(x: number) {
    const pos = new Float32Array(SPARKS * 3);
    const v = new Float32Array(SPARKS * 3);
    const y = 9 + Math.random() * 5;
    const z = -22 - Math.random() * 8;
    for (let i = 0; i < SPARKS; i++) {
      // Even spread over a sphere, all moving out at about the same speed.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = 5 + Math.random();
      v.set([r * Math.cos(a) * speed, u * speed, r * Math.sin(a) * speed], i * 3);
      pos.set([x, y, z], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    const colour = BOAT_COLOURS[Math.floor(Math.random() * BOAT_COLOURS.length)];
    const mat = new PointsMaterial({
      color: colour, size: 0.35, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
    });
    const p = new Points(geo, mat);
    scene.add(p);
    bursts.push({ p, v, age: 0 });
  }

  return {
    // About seven bursts over five seconds, spread along the shore in front of x.
    start(x: number) {
      for (let i = 0; i < 7; i++) queue.push({ at: now + i * 0.7 + Math.random() * 0.3, x: x + (Math.random() - 0.5) * 24 });
    },

    update(dt: number) {
      now += dt;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].at > now) continue;
        burst(queue[i].x);
        queue.splice(i, 1);
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += dt;
        if (b.age > LIFE_S) {
          scene.remove(b.p);
          b.p.geometry.dispose();
          (b.p.material as PointsMaterial).dispose();
          bursts.splice(i, 1);
          continue;
        }
        const pos = b.p.geometry.attributes.position as BufferAttribute;
        const drag = Math.exp(-1.8 * dt); // sparks slow down, then drift and fall
        for (let j = 0; j < SPARKS; j++) {
          b.v[j * 3] *= drag;
          b.v[j * 3 + 1] = b.v[j * 3 + 1] * drag - GRAVITY * dt;
          b.v[j * 3 + 2] *= drag;
          pos.setXYZ(j, pos.getX(j) + b.v[j * 3] * dt, pos.getY(j) + b.v[j * 3 + 1] * dt, pos.getZ(j) + b.v[j * 3 + 2] * dt);
        }
        pos.needsUpdate = true;
        (b.p.material as PointsMaterial).opacity = 1 - (b.age / LIFE_S) ** 2;
      }
    },
  };
}
