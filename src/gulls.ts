import { DoubleSide, Group, Mesh, MeshLambertMaterial, PlaneGeometry, type Scene } from 'three';

// Seagulls circling lazily over the water, wings beating now and then.
const COUNT = 7;

export function seagulls(scene: Scene) {
  const mat = new MeshLambertMaterial({ color: '#fbf7f2', side: DoubleSide });
  const wing = new PlaneGeometry(0.55, 0.16).translate(0.275, 0, 0).rotateX(-Math.PI / 2); // hinged at the body
  const body = new PlaneGeometry(0.12, 0.4).rotateX(-Math.PI / 2);
  const gulls = Array.from({ length: COUNT }, () => {
    const g = new Group();
    const left = new Mesh(wing, mat);
    const right = new Mesh(wing, mat);
    right.scale.x = -1;
    g.add(left, right, new Mesh(body, mat));
    scene.add(g);
    return {
      g, left, right,
      cx: Math.random() * 50 - 25, // the middle of the circle it flies
      cz: -8 - Math.random() * 18,
      y: 5 + Math.random() * 4,
      r: 4 + Math.random() * 6,
      speed: (0.15 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1), // radians per second, either way round
      a: Math.random() * Math.PI * 2,
      flap: Math.random() * 10,
    };
  });

  return {
    update(dt: number) {
      for (const b of gulls) {
        b.a += b.speed * dt;
        b.flap += dt;
        b.g.position.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(b.a * 2) * 0.4, b.cz + Math.sin(b.a) * b.r);
        b.g.rotation.y = Math.atan2(-Math.sin(b.a) * b.speed, Math.cos(b.a) * b.speed); // facing where it flies
        // Beat for a couple of seconds, then glide with wings held up a little.
        const beating = b.flap % 5 < 2;
        const w = beating ? Math.sin(b.flap * 12) * 0.6 : 0.15;
        b.left.rotation.z = w;
        b.right.rotation.z = -w;
      }
    },
  };
}
