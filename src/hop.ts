import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial, type Scene } from 'three';

// Two people bump into each other: they hop together and a few sparkles float up between them.
const SPARKS = 24;
const LIFE_S = 1.2;

export function sparkles(scene: Scene) {
  const live: { p: Points; v: Float32Array; age: number }[] = [];
  return {
    at(x: number, z: number) {
      const pos = new Float32Array(SPARKS * 3);
      const v = new Float32Array(SPARKS * 3);
      for (let i = 0; i < SPARKS; i++) {
        const a = Math.random() * Math.PI * 2;
        const out = 0.4 + Math.random() * 0.6;
        pos.set([x, 1 + Math.random() * 0.6, z], i * 3);
        v.set([Math.cos(a) * out, 0.6 + Math.random() * 0.9, Math.sin(a) * out], i * 3);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(pos, 3));
      const mat = new PointsMaterial({ color: '#ffe08a', size: 0.2, transparent: true, depthWrite: false, blending: AdditiveBlending });
      const p = new Points(geo, mat);
      scene.add(p);
      live.push({ p, v, age: 0 });
    },
    update(dt: number) {
      for (let i = live.length - 1; i >= 0; i--) {
        const s = live[i];
        s.age += dt;
        const pos = s.p.geometry.getAttribute('position') as BufferAttribute;
        for (let j = 0; j < SPARKS * 3; j++) (pos.array as Float32Array)[j] += s.v[j] * dt;
        pos.needsUpdate = true;
        (s.p.material as PointsMaterial).opacity = 1 - s.age / LIFE_S;
        if (s.age < LIFE_S) continue;
        scene.remove(s.p);
        s.p.geometry.dispose();
        (s.p.material as PointsMaterial).dispose();
        live.splice(i, 1);
      }
    },
  };
}
