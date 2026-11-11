import type { ClientMsg, ServerMsg } from './protocol';

// One live connection to the waterfront room. If it drops or the room is full, it shows a quiet
// note and tries again, waiting longer each time: 3 s, 6 s, 12 s ... up to 1 min.
export function connect(onMessage: (m: ServerMsg) => void, onOpen: () => void) {
  const note = document.createElement('p');
  note.style.cssText =
    'position:fixed;left:16px;right:16px;bottom:24px;margin:0;text-align:center;' +
    'font:15px system-ui,sans-serif;color:#4d3a2a;display:none;pointer-events:none';
  document.body.appendChild(note);

  let ws: WebSocket;
  let wait = 3000;
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = onOpen;
    let full = false;
    ws.onmessage = (e) => {
      const m: ServerMsg = JSON.parse(e.data);
      if (m.t === 'full') full = true;
      if (m.t === 'welcome') {
        wait = 3000; // really in: reset the back-off
        note.style.display = 'none';
      }
      if (m.t !== 'full') onMessage(m);
    };
    ws.onclose = () => {
      note.textContent = full
        ? "The waterfront is full right now. You'll join when someone leaves."
        : 'Reconnecting to the others…';
      note.style.display = 'block';
      setTimeout(open, wait);
      wait = Math.min(wait * 2, 60_000);
    };
  };
  open();
  return (msg: ClientMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
}
