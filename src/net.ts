import type { Pose, ServerMsg } from './protocol';

// One live connection to the waterfront room. If it can't connect (room full, or offline),
// it shows a quiet note and tries again, waiting longer each time: 3 s, 6 s, 12 s ... up to 1 min.
export function connect(onMessage: (m: ServerMsg) => void, onOpen: () => void) {
  const note = document.createElement('p');
  note.textContent = "The waterfront is busy or out of reach. You'll join the others when there's room.";
  note.style.cssText =
    'position:fixed;left:16px;right:16px;bottom:24px;margin:0;text-align:center;' +
    'font:15px system-ui,sans-serif;color:#4d3a2a;display:none;pointer-events:none';
  document.body.appendChild(note);

  let ws: WebSocket;
  let wait = 3000;
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      wait = 3000;
      note.style.display = 'none';
      onOpen();
    };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      note.style.display = 'block';
      setTimeout(open, wait);
      wait = Math.min(wait * 2, 60_000);
    };
  };
  open();
  return (pose: Pose) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'move', ...pose }));
  };
}
