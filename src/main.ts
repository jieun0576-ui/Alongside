import {
  CapsuleGeometry, Group, Mesh, MeshLambertMaterial, Object3D, PerspectiveCamera,
  Raycaster, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { buildWorld, clampToWalk } from './world';

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for phone GPUs
document.body.appendChild(renderer.domElement);

const { scene, boardwalk, benches } = buildWorld();
const camera = new PerspectiveCamera(55, 1, 0.1, 300);

// You: a soft capsule for now.
const STAND_Y = 0.7;
const me = new Mesh(new CapsuleGeometry(0.25, 0.9, 4, 12), new MeshLambertMaterial({ color: '#f6f1ea' }));
me.position.set(3, STAND_Y, 1);
scene.add(me);

const WALK_SPEED = 1.6; // metres per second, an easy stroll
let target: { x: number; z: number } | null = null;
let benchToSit: Group | null = null;

function sit(seated: boolean) {
  me.scale.y = seated ? 0.7 : 1;
  me.position.y = seated ? 0.94 : STAND_Y; // seated: bottom of the capsule rests on the seat
}

// Tap (not drag) picks where to go.
const raycaster = new Raycaster();
const down = new Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
  raycaster.setFromCamera(
    new Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1),
    camera,
  );
  const hit = raycaster.intersectObjects([...benches, boardwalk], true)[0];
  if (!hit) return;
  let obj: Object3D | null = hit.object;
  while (obj && !benches.includes(obj as Group)) obj = obj.parent;
  sit(false);
  benchToSit = obj as Group | null;
  const p = benchToSit ? benchToSit.position : hit.point;
  target = clampToWalk(p.x, p.z);
});

const camGoal = new Vector3();
function update(dt: number) {
  if (target) {
    const dx = target.x - me.position.x;
    const dz = target.z - me.position.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
      me.position.x = target.x;
      me.position.z = target.z;
      target = null;
      if (benchToSit) sit(true);
    } else {
      me.position.x += (dx / dist) * step;
      me.position.z += (dz / dist) * step;
    }
  }
  // Camera eases along behind you, looking out over the lake.
  camGoal.set(me.position.x, 6, me.position.z + 10);
  camera.position.lerp(camGoal, 1 - Math.exp(-3 * dt));
  camera.lookAt(me.position.x, 0, me.position.z - 5);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 70 : 55; // phones held upright need a wider view
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

camera.position.set(3, 6, 11);
let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - last) / 1000, 0.1); // clamp so a paused tab doesn't jump
  last = t;
  update(dt);
  renderer.render(scene, camera);
});
