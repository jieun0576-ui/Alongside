import { DurableObject } from 'cloudflare:workers';
import {
  BOAT_EVERY_MS, BOAT_LIFE_S, MAX_BOATS, MAX_PEOPLE, MAX_PER_ADDRESS, STONE_EVERY_MS, STONE_REACH,
  cooled, parseClient, spend, type Budget, type Person, type ServerMsg,
} from '../src/protocol';

// What the room remembers about each socket. The address never leaves the server.
type Seat = { p: Person; ip: string; lastBoat?: number; lastStone?: number };
type StoredBoat = { x: number; c: number; born: number }; // born: ms since 1970

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
  private boats: StoredBoat[] | null = null; // kept in storage so they survive the room sleeping

  // Boats younger than 30 minutes, loaded once per wake-up.
  private async liveBoats() {
    this.boats ??= (await this.ctx.storage.get<StoredBoat[]>('boats')) ?? [];
    const cutoff = Date.now() - BOAT_LIFE_S * 1000;
    this.boats = this.boats.filter((b) => b.born > cutoff);
    return this.boats;
  }

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
    const now = Date.now();
    const boats = (await this.liveBoats()).map((b) => ({ x: b.x, c: b.c, age: (now - b.born) / 1000 }));
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ p: me, ip } satisfies Seat);
    server.send(JSON.stringify({ t: 'welcome', id: me.id, others, boats } satisfies ServerMsg));
    this.broadcast(server, { t: 'join', ...me });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const now = Date.now();
    const { budget, ok } = spend(this.budget.get(ws), now);
    this.budget.set(ws, budget);
    if (!ok) return; // over 10 a second: dropped
    const m = parseClient(raw);
    if (!m) return;
    const seat = ws.deserializeAttachment() as Seat;

    if (m.t === 'move') {
      seat.p = { ...seat.p, x: m.x, z: m.z, s: m.s };
      ws.serializeAttachment(seat);
      this.broadcast(ws, { t: 'move', ...seat.p });
    } else if (m.t === 'boat') {
      // Floating Thoughts: the server sets where the boat starts (in front of you), not the phone.
      if (!cooled(seat.lastBoat, now, BOAT_EVERY_MS)) return;
      seat.lastBoat = now;
      ws.serializeAttachment(seat);
      const boats = await this.liveBoats();
      boats.push({ x: seat.p.x, c: m.c, born: now });
      if (boats.length > MAX_BOATS) boats.splice(0, boats.length - MAX_BOATS);
      await this.ctx.storage.put('boats', boats);
      this.broadcast(null, { t: 'boat', b: { x: seat.p.x, c: m.c, age: 0 } });
    } else {
      // Ripple Effect: only within throwing reach of where you are.
      if (!cooled(seat.lastStone, now, STONE_EVERY_MS)) return;
      if (Math.hypot(m.x - seat.p.x, m.z - seat.p.z) > STONE_REACH) return;
      seat.lastStone = now;
      ws.serializeAttachment(seat);
      this.broadcast(ws, { t: 'ripple', x: m.x, z: m.z }); // the thrower already drew their own
    }
  }

  webSocketClose(ws: WebSocket) {
    this.budget.delete(ws);
    this.broadcast(ws, { t: 'leave', id: (ws.deserializeAttachment() as Seat).p.id });
  }

  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws);
  }

  // Sends to everyone except `from` (null: everyone).
  private broadcast(from: WebSocket | null, msg: ServerMsg) {
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
