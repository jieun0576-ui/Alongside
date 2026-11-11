import { DurableObject } from 'cloudflare:workers';
import {
  BOAT_EVERY_MS, BOAT_LIFE_S, INVITE_EVERY_MS, INVITE_LIFE_MS, MAX_BOATS, MAX_PEOPLE, MAX_PER_ADDRESS,
  MAX_RUNNERS, RUN_PACE, STONE_EVERY_MS, STONE_REACH,
  cooled, parseClient, spend, trailSpot, type Budget, type Person, type Runner, type ServerMsg,
} from '../src/protocol';

// What the room remembers about each socket. The address never leaves the server.
type Seat = {
  p: Person;
  ip: string;
  lastBoat?: number;
  lastStone?: number;
  lastInvite?: number;
  invite?: { to: string; d: number; at: number }; // the one open invitation you've sent
  // Run Together: the server keeps the clock and the distance; the phone only says moving or resting.
  run?: { id: string; ends: number; l: number; d: number; m: 0 | 1; since: number };
};
type StoredBoat = { x: number; c: number; born: number }; // born: ms since 1970

interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

// Where a runner is right now: distance grows at a steady pace only while their phone says moving.
function runner(seat: Seat, now: number): Runner {
  const r = seat.run!;
  const d = r.d + (r.m ? (RUN_PACE * (now - r.since)) / 1000 : 0);
  return { id: seat.p.id, d: Math.round(d * 100) / 100, m: r.m, l: r.l };
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
    const runners = seats.filter((s) => s.run).map((s) => runner(s, now));
    const boats = (await this.liveBoats()).map((b) => ({ x: b.x, c: b.c, age: (now - b.born) / 1000 }));
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ p: me, ip } satisfies Seat);
    server.send(JSON.stringify({ t: 'welcome', id: me.id, others, boats, runners } satisfies ServerMsg));
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
      if (seat.run) return; // while running, the run decides where you are
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
    } else if (m.t === 'invite') {
      // Run Together: one open invitation at a time, at most one every 5 s.
      if (!cooled(seat.lastInvite, now, INVITE_EVERY_MS)) return;
      const to = this.find(m.id);
      if (!to || to.ws === ws || to.seat.run) return;
      if (seat.run && this.members(seat.run.id).length >= MAX_RUNNERS) return;
      seat.lastInvite = now;
      // Inviting from inside a run asks them into it, for the time that's left.
      const d = seat.run ? Math.ceil((seat.run.ends - now) / 60_000) : m.d;
      seat.invite = { to: m.id, d, at: now };
      ws.serializeAttachment(seat);
      to.ws.send(JSON.stringify({ t: 'invite', id: seat.p.id, d } satisfies ServerMsg));
    } else if (m.t === 'accept') {
      const from = this.find(m.id);
      const inv = from?.seat.invite;
      if (!from || seat.run || !inv || inv.to !== seat.p.id || now - inv.at > INVITE_LIFE_MS) return;
      const host = from.seat;
      delete host.invite;
      if (!host.run) {
        host.run = { id: crypto.randomUUID(), ends: now + inv.d * 60_000, l: 0, d: 0, m: 0, since: now };
      }
      const run = host.run;
      const lanes = this.members(run.id).map((x) => x.seat.run!.l);
      if (lanes.length >= MAX_RUNNERS) return;
      const l = [0, 1, 2, 3].find((n) => !lanes.includes(n))!;
      // You join right beside the person who asked you.
      seat.run = { id: run.id, ends: run.ends, l, d: runner(host, now).d, m: 0, since: now };
      from.ws.serializeAttachment(host);
      ws.serializeAttachment(seat);
      this.broadcast(null, { t: 'runner', r: runner(host, now) });
      this.broadcast(null, { t: 'runner', r: runner(seat, now) });
      this.tellRun(run.id, now);
      await this.ctx.storage.setAlarm(Math.min(run.ends, (await this.ctx.storage.getAlarm()) ?? Infinity));
    } else if (m.t === 'motion') {
      if (!seat.run) return;
      seat.run.d = runner(seat, now).d;
      seat.run.m = m.m;
      seat.run.since = now;
      ws.serializeAttachment(seat);
      this.broadcast(null, { t: 'runner', r: runner(seat, now) });
    } else if (m.t === 'quit') {
      if (seat.run) this.endRun(ws, seat, now);
    } else {
      // Ripple Effect: only within throwing reach of where you are.
      if (!cooled(seat.lastStone, now, STONE_EVERY_MS)) return;
      if (Math.hypot(m.x - seat.p.x, m.z - seat.p.z) > STONE_REACH) return;
      seat.lastStone = now;
      ws.serializeAttachment(seat);
      this.broadcast(ws, { t: 'ripple', id: seat.p.id, x: m.x, z: m.z }); // the thrower already drew their own
    }
  }

  webSocketClose(ws: WebSocket) {
    this.budget.delete(ws);
    const seat = ws.deserializeAttachment() as Seat;
    this.broadcast(ws, { t: 'leave', id: seat.p.id });
    if (seat.run) this.tellRun(seat.run.id, Date.now(), ws);
  }

  // When a run's time is up, everyone in it stops where they are.
  async alarm() {
    const now = Date.now();
    let next = Infinity;
    for (const { ws, seat } of this.seats()) {
      if (!seat.run) continue;
      if (seat.run.ends <= now) this.endRun(ws, seat, now);
      else next = Math.min(next, seat.run.ends);
    }
    if (next < Infinity) await this.ctx.storage.setAlarm(next);
  }

  private seats() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, seat: ws.deserializeAttachment() as Seat }));
  }

  private find(id: string) {
    return this.seats().find((x) => x.seat.p.id === id);
  }

  private members(runId: string, without?: WebSocket) {
    return this.seats().filter((x) => x.seat.run?.id === runId && x.ws !== without);
  }

  // Tells each runner who is in their run and how long is left.
  private tellRun(runId: string, now: number, without?: WebSocket) {
    const members = this.members(runId, without);
    const msg = JSON.stringify({
      t: 'run', ids: members.map((x) => x.seat.p.id), left: (members[0]?.seat.run?.ends ?? now) - now,
    } satisfies ServerMsg);
    for (const x of members) x.ws.send(msg);
  }

  private endRun(ws: WebSocket, seat: Seat, now: number) {
    const r = runner(seat, now);
    const at = trailSpot(r.d, r.l);
    const runId = seat.run!.id;
    delete seat.run;
    seat.p = { ...seat.p, x: at.x, z: at.z, s: 0 };
    ws.serializeAttachment(seat);
    this.broadcast(null, { t: 'runEnd', id: seat.p.id, x: at.x, z: at.z });
    this.tellRun(runId, now);
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
