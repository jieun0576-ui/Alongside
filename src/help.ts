import { GLASS, LIGHT_TEXT } from './style';

// Right after choosing a character, a short guide, one step at a time:
// 1. walk (moves on once you've tapped the ground and got there),
// 2. stones and boats, with an arrow pointing at the water's edge (moves on after a throw, a boat, or "Next"),
// 3. running together, with an arrow pointing at "Up for a run?" ("Got it" ends it).
type Point = { x: number; y: number };
const STEPS = [
  ['👆', 'Walk', 'Tap the ground to walk there. Tap a bench to sit.'],
  ['🪨', 'By the water', 'Walk to the water’s edge, where the arrow points. There you can throw a stone or release a boat.'],
  ['⛵', 'By the water', 'Tap “Throw a stone”, tap the lake to aim, then swipe up from your head. Or tap “Release a boat” and pick a colour.'],
  ['🏃', 'Run together', 'Tap “Up for a run?” and others can join you. Keep your phone with you as you move.'],
];
// An arrow pointing down; turned around to point up.
const ARROW = '<svg width="28" height="40" viewBox="0 0 28 40" fill="none" stroke="#fff" stroke-width="4" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v33M3 25l11 11 11-11"/></svg>';

export function startGuide(waterOnScreen: () => Point, runButton: HTMLElement) {
  let step = 0;
  let walked = false;
  let shown = -1;

  const card = document.createElement('div');
  card.style.cssText =
    'position:fixed;left:16px;right:16px;top:72px;margin:0 auto;max-width:360px;z-index:6;box-sizing:border-box;' +
    'border-radius:20px;background:#000000b3;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;' +
    `${LIGHT_TEXT}font-size:15px;`;
  const arrow = document.createElement('div');
  arrow.style.cssText = 'position:fixed;z-index:6;pointer-events:none;filter:drop-shadow(0 0 3px #0006);display:none;';
  arrow.innerHTML = ARROW;
  arrow.firstElementChild!.animate([{ transform: 'translateY(-8px)' }, { transform: 'translateY(0)' }], {
    duration: 600, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out',
  });
  document.body.append(card, arrow);

  const done = () => {
    step = 4;
    card.remove();
    arrow.remove();
  };
  function draw(n: number) {
    shown = n;
    const [icon, name, how] = STEPS[n];
    card.style.top = n === 3 ? '116px' : '72px'; // leaves room for the arrow up to the run button
    card.innerHTML = `<span style="font-size:24px;line-height:1.2;text-shadow:none">${icon}</span>` +
      `<span style="flex:1"><b style="display:block;font-size:16px">${name}</b>` +
      `<span style="font-weight:500;opacity:.9;line-height:1.35">${how}</span></span>`;
    if (n === 0) return; // walking is how you move on
    const b = document.createElement('button');
    b.textContent = n === 3 ? 'Got it' : 'Next';
    b.style.cssText = `${GLASS}align-self:flex-end;padding:8px 16px;white-space:nowrap;`;
    b.onclick = () => (n === 3 ? done() : (step = 3));
    card.append(b);
  }
  function point(at: Point, up: boolean) {
    // The tip sits on the spot, kept inside the screen.
    const x = Math.min(innerWidth - 30, Math.max(2, at.x - 14));
    const y = Math.min(innerHeight - 44, Math.max(2, up ? at.y : at.y - 40));
    arrow.style.left = `${x}px`;
    arrow.style.top = `${y}px`;
    arrow.style.transform = up ? 'rotate(180deg)' : '';
    arrow.style.display = 'block';
  }

  return {
    walked() {
      walked = true;
    },
    // A stone thrown or a boat let go: on to running.
    used() {
      if (step === 1) step = 3;
    },
    update(nearWater: boolean, arrived: boolean) {
      if (step === 4) return;
      if (step === 0 && walked && arrived) step = 1;
      const n = step === 1 && nearWater ? 2 : step;
      if (n !== shown) draw(n);
      arrow.style.display = 'none';
      if (n === 1) point(waterOnScreen(), false);
      if (n === 3) {
        const r = runButton.getBoundingClientRect();
        if (r.width) point({ x: r.left + r.width / 2, y: r.bottom + 4 }, true);
      }
    },
  };
}
