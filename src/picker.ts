import { CHARACTERS } from './protocol';

// Opening screen: arrows to look through the characters, "This one" to step onto the waterfront.
// The whole screen is covered, so nothing behind it can be tapped until you've chosen.
export function pickCharacter(start: number, onShow: (k: number) => void, onPick: (k: number) => void) {
  let k = start;
  const layer = document.createElement('div');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:10;display:flex;background:linear-gradient(#f6e0cf 72px,#f6e0cf00 130px);' +
    'flex-direction:column;justify-content:space-between;align-items:center;' +
    'padding:max(24px,env(safe-area-inset-top)) 16px max(32px,env(safe-area-inset-bottom));' +
    'font:15px system-ui,sans-serif;color:#4d3a2a;';
  const title = document.createElement('p');
  title.textContent = 'Who will you be?';
  title.style.cssText = 'margin:0;padding:8px 18px;border-radius:999px;background:#fbfaf6d0;font-size:17px;';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:14px;align-items:center;';
  const pill = 'border:none;border-radius:999px;background:#fbfaf6;color:#4d3a2a;font:inherit;';
  const arrow = (text: string, label: string, by: number) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.ariaLabel = label;
    b.style.cssText = `${pill}width:48px;height:48px;font-size:24px;line-height:1;`;
    b.onclick = () => {
      k = (k + by + CHARACTERS.length) % CHARACTERS.length;
      onShow(k);
    };
    return b;
  };
  const choose = document.createElement('button');
  choose.textContent = 'This one';
  choose.style.cssText = `${pill}padding:12px 26px;font-weight:600;`;
  choose.onclick = () => {
    layer.remove();
    onPick(k);
  };
  row.append(arrow('‹', 'Previous character', -1), choose, arrow('›', 'Next character', 1));
  layer.append(title, row);
  document.body.appendChild(layer);
}
