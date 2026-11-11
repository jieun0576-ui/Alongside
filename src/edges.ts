import { Camera, Vector3 } from 'three';

const MARGIN = 24; // px from the screen edge
const v = new Vector3();

// Running partners out of view: their runner number sits on the screen edge, with a small point toward them.
export function edgeMarkers() {
  const marks = new Map<string, { el: HTMLDivElement; num: HTMLSpanElement }>();

  function mark(id: string) {
    let m = marks.get(id);
    if (!m) {
      const el = document.createElement('div');
      el.innerHTML = '<svg width="36" height="36" viewBox="0 0 36 36" style="position:absolute;inset:0">' +
        '<path d="M30 13l5 5-5 5z" fill="#fbfaf6"/><circle cx="18" cy="18" r="12" fill="#fbfaf6"/></svg>';
      el.style.cssText = 'position:fixed;left:0;top:0;width:36px;height:36px;pointer-events:none;display:none;' +
        'filter:drop-shadow(0 0 2px #0004);';
      const num = document.createElement('span');
      num.style.cssText = 'position:absolute;inset:0;font:600 14px/36px system-ui,sans-serif;text-align:center;color:#4d3a2a;';
      el.appendChild(num);
      document.body.appendChild(el);
      m = { el, num };
      marks.set(id, m);
    }
    return m;
  }

  // people: everyone to point at, with the label to show (their runner number).
  return {
    update(people: { id: string; at: Vector3; label: string }[], camera: Camera) {
      for (const [id, m] of marks) {
        if (!people.some((p) => p.id === id)) {
          m.el.remove();
          marks.delete(id);
        }
      }
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      for (const p of people) {
        v.copy(p.at).setY(1).project(camera);
        const behind = v.z > 1;
        let dx = v.x * cx;
        let dy = -v.y * cy;
        if (behind) {
          dx = -dx;
          dy = -dy;
        }
        const m = mark(p.id);
        if ((!behind && Math.abs(dx) < cx && Math.abs(dy) < cy) || (dx === 0 && dy === 0)) {
          m.el.style.display = 'none';
          continue;
        }
        // Slide along the line from the centre until it meets the edge; the point turns toward them, the number stays upright.
        const k = Math.min((cx - MARGIN) / Math.abs(dx || 1e-6), (cy - MARGIN) / Math.abs(dy || 1e-6));
        const a = Math.atan2(dy, dx);
        m.num.textContent = p.label;
        m.num.style.transform = `rotate(${-a}rad)`;
        m.el.style.display = 'block';
        m.el.style.transform = `translate(${cx + dx * k - 18}px,${cy + dy * k - 18}px) rotate(${a}rad)`;
      }
    },
  };
}
