import { DurableObject } from 'cloudflare:workers';
import {
  MAX_PEOPLE, MAX_PER_ADDRESS, parseMove, spend, type Budget, type Person, type ServerMsg,
} from '../src/protocol';

// What the room remembers about each socket. The address never leaves the server.
type Seat = { p: Person; ip: string };

interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

// Static files (the website) are served by Cloudflare before this runs; only /ws reaches here.
export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    // Browsers on other sites can't open our socket. Scripts can, which is why the room checks every message.
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
    // shortcut: one shared waterfront; the 31st visitor is turned away instead of getting a second copy.
    return env.ROOM.get(env.ROOM.idFromName('waterfront')).fetch(req);
  },
};

// Say "full" over the socket so the phone can tell the visitor, then close it.
// (A plain HTTP error would look the same to the browser as being offline.)
function turnAway() {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.send(JSON.stringify({ t: 'full' } satisfies ServerMsg));
  server.close(4000, 'full');
  return new Response(null, { status: 101, webSocket: client });
}

// One waterfront. Uses Cloudflare's hibernating websockets, so an idle room costs nothing.
export class Room extends DurableObject<Env> {
  private budget = new Map<WebSocket, Budget>();

  async fetch(req: Request) {
    const seats = this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as Seat);
    if (seats.length >= MAX_PEOPLE) return turnAway();
    // Set by Cloudflare's edge, so a phone can't fake it. One script can't fill the room.
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (seats.filter((s) => s.ip === ip).length >= MAX_PER_ADDRESS) return turnAway();
    const { 0: client, 1: server } = new WebSocketPair();
    // The server picks your id, so nobody can speak for someone else.
    const me: Person = { id: crypto.randomUUID(), x: 3, z: 1, s: 0 };
    const others = seats.map((s) => s.p);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ p: me, ip } satisfies Seat);
    server.send(JSON.stringify({ t: 'welcome', id: me.id, others } satisfies ServerMsg));
    this.broadcast(server, { t: 'join', ...me });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const { budget, ok } = spend(this.budget.get(ws), Date.now());
    this.budget.set(ws, budget);
    if (!ok) return; // over 10 a second: dropped
    const pose = parseMove(raw);
    if (!pose) return;
    const seat = ws.deserializeAttachment() as Seat;
    const me: Person = { ...seat.p, ...pose };
    ws.serializeAttachment({ p: me, ip: seat.ip } satisfies Seat);
    this.broadcast(ws, { t: 'move', ...me });
  }

  webSocketClose(ws: WebSocket) {
    this.budget.delete(ws);
    this.broadcast(ws, { t: 'leave', id: (ws.deserializeAttachment() as Seat).p.id });
  }

  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws);
  }

  private broadcast(from: WebSocket, msg: ServerMsg) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === from) continue;
      try {
        ws.send(text);
      } catch {
        // already closing; its own close event cleans up
      }
    }
  }
}
