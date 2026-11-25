import { GLASS, LIGHT_TEXT } from './style';

// Right after choosing a character: a short card on what you can do here, in the same dark box as the picker.
const TIPS: [string, string, string][] = [
  ['👆', 'Walk', 'Tap the ground to walk there. Tap a bench to sit.'],
  ['🪨', 'Throw a stone', 'By the water, tap “Throw a stone”, tap the lake to aim, then swipe up from your head.'],
  ['⛵', 'Release a boat', 'By the water, tap “Release a boat” and pick a colour.'],
  ['🏃', 'Run together', 'Tap “Up for a run?” and others can join you. Keep your phone with you as you move.'],
];

export function showHelp() {
  const layer = document.createElement('div');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:10;display:flex;justify-content:center;align-items:center;' +
    `padding:16px;background:#0000002e;${LIGHT_TEXT}font-size:15px;`;
  const box = document.createElement('div');
  box.style.cssText =
    'width:min(360px,100%);border-radius:24px;background:#000000cc;padding:20px 20px 22px;' +
    'display:flex;flex-direction:column;gap:14px;box-shadow:0 8px 30px #0004;';
  const title = document.createElement('p');
  title.textContent = 'What you can do here';
  title.style.cssText = 'margin:0 0 2px;font-size:20px;letter-spacing:.5px;text-align:center;';
  box.append(title);
  for (const [icon, name, how] of TIPS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;align-items:flex-start;';
    row.innerHTML = `<span style="font-size:24px;line-height:1.2;text-shadow:none">${icon}</span>` +
      `<span><b style="display:block;font-size:16px">${name}</b>` +
      `<span style="font-weight:500;opacity:.9;line-height:1.35">${how}</span></span>`;
    box.append(row);
  }
  const ok = document.createElement('button');
  ok.textContent = 'Got it';
  ok.style.cssText = `${GLASS}align-self:center;margin-top:4px;padding:12px 32px;font-size:16px;border-radius:16px;`;
  ok.onclick = () => layer.remove();
  box.append(ok);
  layer.append(box);
  document.body.append(layer);
}
