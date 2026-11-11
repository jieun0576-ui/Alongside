import { Camera, Vector3 } from 'three';

const MARGIN = 22; // px from the screen edge
const v = new Vector3();

// Small arrows on the screen edges pointing toward people who are out of view.
export function edgeMarkers() {
  const marks = new Map<string, HTMLDivElement>();

  function mark(id: string) {
    let m = marks.get(id);
    if (!m) {
      m = document.createElement('div');
      m.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="#fbfaf6cc"/>' +
        '<path d="M8 6l6 5-6 5" fill="none" stroke="#4d3a2a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      m.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;pointer-events:none;display:none;';
      document.body.appendChild(m);
      marks.set(id, m);
    }
    return m;
  }

  return {
    update(people: Map<string, { mesh: { position: Vector3 } }>, camera: Camera) {
      for (const [id, m] of marks) {
        if (!people.has(id)) {
          m.remove();
          marks.delete(id);
        }
      }
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      for (const [id, p] of people) {
        v.copy(p.mesh.position).setY(1).project(camera);
        const behind = v.z > 1;
        let dx = v.x * cx;
        let dy = -v.y * cy;
        if (behind) {
          dx = -dx;
          dy = -dy;
        }
        const m = mark(id);
        const inView = !behind && Math.abs(dx) < cx && Math.abs(dy) < cy;
        if (inView || (dx === 0 && dy === 0)) {
          m.style.display = 'none';
          continue;
        }
        // Slide the arrow along the line from the centre until it meets the edge.
        const k = Math.min((cx - MARGIN) / Math.abs(dx || 1e-6), (cy - MARGIN) / Math.abs(dy || 1e-6));
        const x = cx + dx * k;
        const y = cy + dy * k;
        m.style.display = 'block';
        m.style.transform = `translate(${x - 11}px,${y - 11}px) rotate(${Math.atan2(dy, dx)}rad)`;
      }
    },
  };
}
