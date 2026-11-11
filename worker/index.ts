import { DurableObject } from 'cloudflare:workers';
import { MAX_MSGS_PER_SEC, MAX_PEOPLE, parseMove, type Person, type ServerMsg } from '../src/protocol';

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

// One waterfront. Uses Cloudflare's hibernating websockets, so an idle room costs nothing.
export class Room extends DurableObject<Env> {
  private budget = new Map<WebSocket, { second: number; count: number }>();

  async fetch() {
    if (this.ctx.getWebSockets().length >= MAX_PEOPLE) return new Response('Waterfront is full', { status: 503 });
    const { 0: client, 1: server } = new WebSocketPair();
    // The server picks your id, so nobody can speak for someone else.
    const me: Person = { id: crypto.randomUUID(), x: 3, z: 1, s: 0 };
    const others = this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as Person);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    server.send(JSON.stringify({ t: 'welcome', id: me.id, others } satisfies ServerMsg));
    this.broadcast(server, { t: 'join', ...me });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.withinBudget(ws)) return;
    const pose = parseMove(raw);
    if (!pose) return;
    const me: Person = { ...(ws.deserializeAttachment() as Person), ...pose };
    ws.serializeAttachment(me);
    this.broadcast(ws, { t: 'move', ...me });
  }

  webSocketClose(ws: WebSocket) {
    this.budget.delete(ws);
    this.broadcast(ws, { t: 'leave', id: (ws.deserializeAttachment() as Person).id });
  }

  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws);
  }

  // At most MAX_MSGS_PER_SEC per phone; extra messages are dropped.
  private withinBudget(ws: WebSocket) {
    const second = Math.floor(Date.now() / 1000);
    const b = this.budget.get(ws);
    if (!b || b.second !== second) {
      this.budget.set(ws, { second, count: 1 });
      return true;
    }
    return ++b.count <= MAX_MSGS_PER_SEC;
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
