import {
  CapsuleGeometry, Group, Mesh, MeshLambertMaterial, Object3D, PerspectiveCamera,
  Raycaster, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { buildWorld, clampToWalk } from './world';
import { connect } from './net';
import { lakeLife } from './lake';
import { BOAT_COLOURS, BOAT_EVERY_MS, STONE_REACH, inLake, type Pose } from './protocol';

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for phone GPUs
document.body.appendChild(renderer.domElement);

const { scene, boardwalk, benches, lake } = buildWorld();
const life = lakeLife(scene);
const camera = new PerspectiveCamera(55, 1, 0.1, 300);

// Everyone, you included, is a soft capsule walking toward a goal and maybe sitting there.
const STAND_Y = 0.7;
const WALK_SPEED = 1.6; // metres per second, an easy stroll
const body = new CapsuleGeometry(0.25, 0.9, 4, 12);
type Walker = { mesh: Mesh; goal: Pose; arrived: boolean };

function sit(w: Walker, seated: boolean) {
  w.mesh.scale.y = seated ? 0.7 : 1;
  w.mesh.position.y = seated ? 0.94 : STAND_Y; // seated: bottom of the capsule rests on the seat
}

function addWalker(color: string, at: Pose): Walker {
  const mesh = new Mesh(body, new MeshLambertMaterial({ color }));
  mesh.position.set(at.x, STAND_Y, at.z);
  scene.add(mesh);
  const w = { mesh, goal: at, arrived: true };
  sit(w, at.s === 1);
  return w;
}

function setGoal(w: Walker, goal: Pose) {
  sit(w, false);
  w.goal = goal;
  w.arrived = false;
}

function step(w: Walker, dt: number) {
  if (w.arrived) return;
  const p = w.mesh.position;
  const dx = w.goal.x - p.x;
  const dz = w.goal.z - p.z;
  const dist = Math.hypot(dx, dz);
  const stride = WALK_SPEED * dt;
  if (dist <= stride) {
    p.x = w.goal.x;
    p.z = w.goal.z;
    w.arrived = true;
    if (w.goal.s) sit(w, true);
  } else {
    p.x += (dx / dist) * stride;
    p.z += (dz / dist) * stride;
  }
}

const me = addWalker('#f6f1ea', { x: Math.round(Math.random() * 800 - 400) / 100, z: 1, s: 0 }); // spread arrivals out
const others = new Map<string, Walker>();

function removeOther(id: string) {
  const w = others.get(id);
  if (!w) return;
  scene.remove(w.mesh);
  (w.mesh.material as MeshLambertMaterial).dispose();
  others.delete(id);
}

const send = connect(
  (m) => {
    if (m.t === 'welcome') {
      for (const id of [...others.keys()]) removeOther(id); // fresh list after a reconnect
      for (const o of m.others) others.set(o.id, addWalker('#e3d3c0', o));
      if (!boatsLoaded) m.boats.forEach(life.addBoat); // boats already afloat when you arrive
      boatsLoaded = true;
    } else if (m.t === 'join') {
      removeOther(m.id);
      others.set(m.id, addWalker('#e3d3c0', m));
    } else if (m.t === 'move') {
      const w = others.get(m.id);
      if (w) setGoal(w, { x: m.x, z: m.z, s: m.s });
    } else if (m.t === 'leave') {
      removeOther(m.id);
    } else if (m.t === 'boat') {
      life.addBoat(m.b);
    } else if (m.t === 'ripple') {
      life.ripple(m.x, m.z);
    }
  },
  () => send({ t: 'move', ...me.goal }), // tell the room where you are as soon as you connect
);
let boatsLoaded = false;

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
  const hit = raycaster.intersectObjects([...benches, boardwalk, lake], true)[0];
  if (!hit) return;
  if (hit.object === lake) {
    // Ripple Effect: tap the lake to throw a stone, if it's within reach.
    const { x, z } = hit.point;
    const p = me.goal; // measured the same way as the server does: from where you're heading
    if (!inLake(x, z) || Math.hypot(x - p.x, z - p.z) > STONE_REACH) return;
    life.ripple(x, z);
    send({ t: 'stone', x, z });
    return;
  }
  let obj: Object3D | null = hit.object;
  while (obj && !benches.includes(obj as Group)) obj = obj.parent;
  const p = obj ? obj.position : hit.point;
  setGoal(me, { ...clampToWalk(p.x, p.z), s: obj ? 1 : 0 });
  send({ t: 'move', ...me.goal });
});

// Floating Thoughts: pick a colour and let a paper boat go. No words, only colour.
const boatButton = document.createElement('button');
boatButton.textContent = 'Release a boat';
const palette = document.createElement('div');
const pill = 'border:none;border-radius:999px;font:15px system-ui,sans-serif;';
boatButton.style.cssText = `position:fixed;right:16px;bottom:64px;padding:10px 16px;background:#fbfaf6;color:#4d3a2a;${pill}`;
palette.style.cssText = 'position:fixed;right:16px;bottom:116px;display:none;gap:10px;';
for (const [i, colour] of BOAT_COLOURS.entries()) {
  const dot = document.createElement('button');
  dot.ariaLabel = `Boat colour ${i + 1}`;
  dot.style.cssText = `width:36px;height:36px;padding:0;background:${colour};box-shadow:0 0 0 2px #fff8;${pill}`;
  dot.onclick = () => {
    send({ t: 'boat', c: i }); // the boat appears when the room sends it back to everyone
    palette.style.display = 'none';
    boatButton.disabled = true; // one boat per 10 s, same as the server allows
    boatButton.style.opacity = '0.5';
    setTimeout(() => {
      boatButton.disabled = false;
      boatButton.style.opacity = '1';
    }, BOAT_EVERY_MS);
  };
  palette.appendChild(dot);
}
boatButton.onclick = () => (palette.style.display = palette.style.display === 'flex' ? 'none' : 'flex');
document.body.append(palette, boatButton);

const camGoal = new Vector3();
function update(dt: number) {
  step(me, dt);
  life.update(dt);
  for (const w of others.values()) step(w, dt);
  // Camera eases along behind you, looking out over the lake.
  camGoal.set(me.mesh.position.x, 6, me.mesh.position.z + 10);
  camera.position.lerp(camGoal, 1 - Math.exp(-3 * dt));
  camera.lookAt(me.mesh.position.x, 0, me.mesh.position.z - 5);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 70 : 55; // phones held upright need a wider view
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

camera.position.set(me.mesh.position.x, 6, 11);
let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - last) / 1000, 0.1); // clamp so a paused tab doesn't jump
  last = t;
  update(dt);
  renderer.render(scene, camera);
});
