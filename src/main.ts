import {
  CapsuleGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PerspectiveCamera,
  Raycaster, RingGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { buildWorld, clampToWalk } from './world';
import { connect } from './net';
import { lakeLife } from './lake';
import { stoneAim } from './aim';
import { BOAT_COLOURS, BOAT_EVERY_MS, STONE_EVERY_MS, STONE_REACH, inLake, type Pose } from './protocol';

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for phone GPUs
document.body.appendChild(renderer.domElement);

const { scene, ground, benches, lake } = buildWorld();
const life = lakeLife(scene);
const stones = stoneAim(scene);
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
      const w = others.get(m.id);
      if (w) stones.fly(w.mesh.position.clone().setY(1.2), m.x, m.z, () => life.ripple(m.x, m.z));
      else life.ripple(m.x, m.z);
    }
  },
  () => send({ t: 'move', ...me.goal }), // tell the room where you are as soon as you connect
);
let boatsLoaded = false;

// A small ring where you tapped, fading out over a second.
const tapRing = new RingGeometry(0.18, 0.26, 32);
tapRing.rotateX(-Math.PI / 2);
const tapMark = new Mesh(tapRing, new MeshBasicMaterial({ color: '#fbfaf6', transparent: true, depthWrite: false }));
tapMark.visible = false;
scene.add(tapMark);
let tapAge = 1;

// Ripple Effect: in aim mode you stay put, tap the water to aim, and swipe up from your head to throw.
const NEAR_WATER_Z = -1.2; // the front of the boardwalk, benches included
let aiming = false;
let lastThrow = -Infinity;
const hand = () => me.mesh.position.clone().setY(1.2);
const head = new Vector3();
let swipeFromHead = false;
function headOnScreen() {
  head.copy(me.mesh.position).setY(1.4).project(camera);
  return { x: ((head.x + 1) / 2) * innerWidth, y: ((1 - head.y) / 2) * innerHeight };
}

// Tap (not drag) picks where to go.
const raycaster = new Raycaster();
const down = new Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  down.set(e.clientX, e.clientY);
  const h = headOnScreen();
  swipeFromHead = aiming && Math.hypot(e.clientX - h.x, e.clientY - h.y) < 80;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (swipeFromHead && down.y - e.clientY > 40) return throwStone();
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
  raycaster.setFromCamera(
    new Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1),
    camera,
  );
  const hit = raycaster.intersectObjects([...benches, ...ground, lake], true)[0];
  if (!hit) return;
  if (aiming) {
    // You can't walk while aiming; only taps on the water count, within reach.
    if (hit.object !== lake) return;
    // A tap too far out aims at the farthest you can throw, in the same direction.
    const p = me.goal; // measured the same way as the server does: from where you're heading
    const d = Math.hypot(hit.point.x - p.x, hit.point.z - p.z);
    const k = Math.min(1, (STONE_REACH - 0.5) / d);
    const x = p.x + (hit.point.x - p.x) * k;
    const z = p.z + (hit.point.z - p.z) * k;
    if (inLake(x, z)) stones.aim(hand(), x, z);
    return;
  }
  if (hit.object === lake) return;
  let obj: Object3D | null = hit.object;
  while (obj && !benches.includes(obj as Group)) obj = obj.parent;
  const p = obj ? obj.position : hit.point;
  setGoal(me, { ...clampToWalk(p.x, p.z), s: obj ? 1 : 0 });
  send({ t: 'move', ...me.goal });
  tapMark.position.set(me.goal.x, 0.01, me.goal.z);
  tapAge = 0;
});

function throwStone() {
  const now = performance.now();
  if (now - lastThrow < STONE_EVERY_MS) return; // same pace the server allows
  lastThrow = now;
  const { x, z } = stones.target;
  send({ t: 'stone', x, z });
  stones.throwStone(() => life.ripple(x, z));
}

// The buttons only appear once you're standing or sitting by the water.
const tools = document.createElement('div');
tools.style.cssText = 'position:fixed;right:16px;bottom:64px;display:none;gap:10px;';
const pill = 'border:none;border-radius:999px;font:15px system-ui,sans-serif;';
const button = (text: string) => {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = `padding:10px 16px;background:#fbfaf6;color:#4d3a2a;${pill}`;
  return b;
};
const stoneButton = button('Throw a stone');
const boatButton = button('Release a boat');
// While aiming, a white arrow keeps rising from your head: swipe up here to throw.
const arrow = document.createElement('div');
arrow.innerHTML = '<svg width="28" height="44" viewBox="0 0 28 44" fill="none" stroke="#fff" stroke-width="4" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M14 41V5M3 15 14 4l11 11"/></svg>';
arrow.style.cssText = 'position:fixed;display:none;pointer-events:none;filter:drop-shadow(0 0 3px #0005);';
arrow.firstElementChild!.animate(
  [{ transform: 'translateY(10px)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translateY(-40px)', opacity: 0 }],
  { duration: 1400, iterations: Infinity, easing: 'ease-out' },
);

stoneButton.onclick = () => {
  aiming = !aiming;
  stoneButton.textContent = aiming ? 'Done' : 'Throw a stone';
  boatButton.style.display = aiming ? 'none' : '';
  arrow.style.display = aiming ? 'block' : 'none';
  palette.style.display = 'none';
  if (aiming) stones.aim(hand(), me.mesh.position.x, -8); // start straight out in front of you
  else stones.hide();
};

// Floating Thoughts: pick a colour and let a paper boat go. No words, only colour.
const palette = document.createElement('div');
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
tools.append(stoneButton, boatButton);
document.body.append(palette, tools, arrow);

let nearWater = false;
function showTools() {
  const near = aiming || (me.arrived && me.mesh.position.z <= NEAR_WATER_Z);
  if (near === nearWater) return;
  nearWater = near;
  tools.style.display = near ? 'flex' : 'none';
  if (!near) palette.style.display = 'none';
}

const camGoal = new Vector3();
function update(dt: number) {
  step(me, dt);
  life.update(dt);
  stones.update(dt);
  showTools();
  if (aiming) {
    const h = headOnScreen();
    arrow.style.left = `${h.x - 14}px`;
    arrow.style.top = `${h.y - 44}px`;
  }
  tapAge += dt;
  tapMark.visible = tapAge < 1;
  (tapMark.material as MeshBasicMaterial).opacity = 0.8 * (1 - tapAge);
  for (const w of others.values()) step(w, dt);
  // Camera eases along behind you, looking out over the lake.
  // While aiming it steps to the side, so the stone's arc can be seen.
  if (aiming) camGoal.set(me.mesh.position.x + 6, 5, me.mesh.position.z + 7);
  else camGoal.set(me.mesh.position.x, 6, me.mesh.position.z + 10);
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
