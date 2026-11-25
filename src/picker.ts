import {
  DirectionalLight, Group, HemisphereLight, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { CHARACTERS } from './protocol';
import { dropLook, makeLook, play, type Look } from './characters';

// Opening screen: a dark, see-through box over the waterfront with your character in the middle and the
// ones before and after it on each side. Its own little 3D view, so nobody else in the room overlaps it.
// Arrows (or a tap on a side character) change it; "This one" steps you onto the waterfront.
// The whole screen is covered, so nothing behind it can be tapped until you've chosen.
const SIDE_X = 1.35;

export function pickCharacter(start: number, onShow: (k: number) => void, onPick: (k: number) => void) {
  let k = start;
  const wrap = (n: number) => (n + CHARACTERS.length) % CHARACTERS.length;

  const layer = document.createElement('div');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;justify-content:center;align-items:center;' +
    'gap:18px;padding:max(24px,env(safe-area-inset-top)) 16px max(32px,env(safe-area-inset-bottom));' +
    'background:#0000002e;font:15px system-ui,sans-serif;color:#fbfaf6;';
  const box = document.createElement('div');
  box.style.cssText =
    'width:min(360px,100%);border-radius:24px;background:#000000cc;display:flex;flex-direction:column;' +
    'align-items:center;padding:18px 0 20px;gap:14px;box-shadow:0 8px 30px #0004;';
  const title = document.createElement('p');
  title.textContent = 'Choose your character';
  title.style.cssText = 'margin:0;font-size:18px;font-weight:600;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:min(300px,45vh);display:block;touch-action:manipulation;';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:14px;align-items:center;';
  const pill = 'border:none;border-radius:999px;background:#fbfaf6;color:#4d3a2a;font:inherit;';
  // The arrows sit at the box's left and right edges, half way up.
  const arrow = (text: string, label: string, by: number) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.ariaLabel = label;
    b.style.cssText = `${pill}position:absolute;top:50%;${by < 0 ? 'left' : 'right'}:8px;` +
      'transform:translateY(-50%);width:40px;height:40px;font-size:22px;line-height:1;opacity:.92;';
    b.onclick = () => show(wrap(k + by));
    return b;
  };
  const choose = document.createElement('button');
  choose.textContent = 'This one';
  choose.style.cssText = `${pill}padding:12px 26px;font-weight:600;`;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:100%;';
  stage.append(canvas, arrow('‹', 'Previous character', -1), arrow('›', 'Next character', 1));
  row.append(choose);
  box.append(title, stage, row);
  layer.append(box);
  document.body.appendChild(layer);

  // The little stage inside the box: transparent, so the dark box shows through.
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new Scene();
  scene.add(new HemisphereLight('#fff1e2', '#6a6f8f', 2));
  const sun = new DirectionalLight('#ffd2a8', 1.4);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.0, 5.4);
  camera.lookAt(0, 0.75, 0);

  // Three spots: previous (left), chosen (middle, bigger and in front), next (right).
  const spots = [-1, 0, 1].map((side) => {
    const g = new Group();
    g.position.set(side * SIDE_X, 0, side ? -0.9 : 0);
    g.scale.setScalar(side ? 0.72 : 1);
    g.rotation.y = side * -0.35; // turned slightly toward the middle
    scene.add(g);
    return { g, side, look: undefined as Look | undefined };
  });

  let shown = 0; // ignores slow loads from an earlier choice
  function show(next: number) {
    k = next;
    onShow(k);
    const ask = ++shown;
    for (const s of spots) {
      makeLook(wrap(k + s.side))
        .then((look) => {
          if (ask !== shown || !running) return dropLook(look);
          if (s.look) {
            s.g.remove(s.look.model);
            dropLook(s.look);
          }
          s.look = look;
          // The ones on the sides are darker, so the chosen one stands out.
          if (s.side) for (const m of look.materials) (m as MeshStandardMaterial).color.multiplyScalar(0.5);
          s.g.add(look.model);
          play(look, 'idle');
        })
        .catch(() => {}); // a character that fails to load leaves its spot empty
    }
  }

  // A tap on a side character picks it.
  canvas.addEventListener('click', (e) => {
    const x = (e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth;
    if (x < 0.3) show(wrap(k - 1));
    else if (x > 0.7) show(wrap(k + 1));
  });

  let running = true;
  let last = performance.now();
  function frame(t: number) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    for (const s of spots) s.look?.mixer.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  choose.onclick = () => {
    running = false;
    for (const s of spots) if (s.look) dropLook(s.look);
    renderer.dispose();
    renderer.forceContextLoss(); // phones allow only a few 3D views at once
    layer.remove();
    onPick(k);
  };

  show(k);
}
