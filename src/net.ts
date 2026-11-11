import type { Pose, ServerMsg } from './protocol';

// One live connection to the waterfront room. Reconnects quietly if it drops.
export function connect(onMessage: (m: ServerMsg) => void, onOpen: () => void) {
  let ws: WebSocket;
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = onOpen;
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => setTimeout(open, 3000);
  };
  open();
  return (pose: Pose) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'move', ...pose }));
  };
}
