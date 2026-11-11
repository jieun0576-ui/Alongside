import { DurableObject } from 'cloudflare:workers';
import {
  AWAY_MS, BOAT_EVERY_MS, BOAT_LIFE_S, MAX_BOATS, MAX_PEOPLE, MAX_PER_ADDRESS, MAX_RUNNERS, RUN_PACE,
  STONE_EVERY_MS, STONE_REACH,
  cooled, isId, parseClient, spend, trailSpot, type Budget, type Person, type Runner, type ServerMsg, type Thumb,
} from '../src/protocol';

// What the room remembers about each socket. The address never leaves the server.
type Seat = {
  p: Person;
  ip: string;
  lastBoat?: number;
  lastStone?: number;
  thumb?: { host: string; at: number }; // Run Together: thumb raised (host === own id) or joined to a host
  run?: Run;
};
// Run Together: the server keeps the clock and the distance; the phone only says moving or resting.
// n = runner number (1-4, an identifier, not a rank), k = secret key for getting back in after a lost connection.
type Run = { id: string; ends: number; n: number; l: number; d: number; m: 0 | 1; since: number; k: string };
// A runner whose connection dropped: kept (in storage, so it survives the room sleeping) until `until`.
type Away = { p: Person; run: Run; until: number };
type StoredBoat = { x: number; c: number; born: number }; // born: ms since 1970

interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

// Where a runner is right now: distance grows at a steady pace only while their phone says moving.
function runner(p: Person, r: Run, now: number, away = false): Runner {
  const d = r.d + (r.m ? (RUN_PACE * (now - r.since)) / 1000 : 0);
  return { id: p.id, d: Math.round(d * 100) / 100, m: r.m, l: r.l, ...(away ? { a: 1 as const } : {}) };
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
    const now = Date.now();
    // Back after a lost connection, mid-run? The key (only ever sent to that runner) gives back your place.
    const key = new URL(req.url).searchParams.get('k');
    const aways = await this.aways();
    const back = key && isId(key) ? aways.find((a) => a.run.k === key && a.until > now) : undefined;
    if (back) await this.setAways(aways.filter((a) => a !== back));
    // The server picks your id, so nobody can speak for someone else.
    const me: Person = back?.p ?? { id: crypto.randomUUID(), x: 3, z: 1, s: 0 };
    const others = [...seats.map((s) => s.p), ...aways.filter((a) => a !== back).map((a) => a.p)];
    const runners = [
      ...seats.filter((s) => s.run).map((s) => runner(s.p, s.run!, now)),
      ...aways.filter((a) => a !== back).map((a) => runner(a.p, a.run, now, true)),
    ];
    const thumbs: Thumb[] = seats.filter((s) => s.thumb).map((s) => ({ id: s.p.id, host: s.thumb!.host }));
    const boats = (await this.liveBoats()).map((b) => ({ x: b.x, c: b.c, age: (now - b.born) / 1000 }));
    this.ctx.acceptWebSocket(server);
    const seat: Seat = { p: me, ip, ...(back ? { run: back.run } : {}) };
    server.serializeAttachment(seat);
    server.send(JSON.stringify({ t: 'welcome', id: me.id, others, boats, runners, thumbs } satisfies ServerMsg));
    this.broadcast(server, { t: 'join', ...me });
    if (back) {
      this.broadcast(null, { t: 'runner', r: runner(me, back.run, now) });
      this.tellRun(back.run.id, now);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const now = Date.now();
    const { budget, ok } = spend(this.budget.get(ws), now);
    this.budget.set(ws, budget);
    if (!ok) return; // over 10 a second: dropped
    const m = parseClient(raw);
    if (!m) return;
    // If the time is up but the wake-up hasn't happened yet, finish the run now.
    if (((ws.deserializeAttachment() as Seat).run?.ends ?? Infinity) <= now) await this.alarm();
    const seat = ws.deserializeAttachment() as Seat;

    if (m.t === 'move') {
      if (seat.run) return; // while running, the run decides where you are
      seat.p = { ...seat.p, x: m.x, z: m.z, s: m.s };
      ws.serializeAttachment(seat);
      this.broadcast(ws, { t: 'move', ...seat.p });
    } else if (m.t === 'boat') {
      if (seat.run) return; // no boats or stones while running
      // Floating Thoughts: the server sets where the boat starts (in front of you), not the phone.
      if (!cooled(seat.lastBoat, now, BOAT_EVERY_MS)) return;
      seat.lastBoat = now;
      ws.serializeAttachment(seat);
      const boats = await this.liveBoats();
      boats.push({ x: seat.p.x, c: m.c, born: now });
      if (boats.length > MAX_BOATS) boats.splice(0, boats.length - MAX_BOATS);
      await this.ctx.storage.put('boats', boats);
      this.broadcast(null, { t: 'boat', b: { x: seat.p.x, c: m.c, age: 0 } });
    } else if (m.t === 'raise') {
      // Run Together, step 1: raise a thumb so others can see you're looking for running partners.
      if (seat.thumb || seat.run) return;
      this.setThumb(ws, seat, seat.p.id, now);
    } else if (m.t === 'join') {
      // Step 2: tap someone's raised thumb to join them.
      const host = this.find(m.id);
      if (seat.thumb || seat.run || !host || host.ws === ws || host.seat.thumb?.host !== m.id) return;
      if (this.lobby(m.id).length >= MAX_RUNNERS) return;
      this.setThumb(ws, seat, m.id, now);
    } else if (m.t === 'lower') {
      if (!seat.thumb) return;
      // The host lowering their thumb cancels it for everyone who joined.
      const group = seat.thumb.host === seat.p.id ? this.lobby(seat.p.id) : [{ ws, seat }];
      for (const x of group) this.setThumb(x.ws, x.seat, null, now);
    } else if (m.t === 'start') {
      // Step 3: the host starts. Everyone who joined goes to the start of the trail, two by two.
      if (seat.thumb?.host !== seat.p.id) return;
      const group = this.lobby(seat.p.id).sort((a, b) => a.seat.thumb!.at - b.seat.thumb!.at);
      const id = crypto.randomUUID();
      const ends = now + m.d * 60_000;
      const pairs = Math.ceil(group.length / 2);
      group.forEach((x, i) => {
        this.setThumb(x.ws, x.seat, null, now);
        const d = (pairs - 1 - Math.floor(i / 2)) * 1.5; // first pair in front
        x.seat.run = { id, ends, n: i + 1, l: i % 2, d, m: 0, since: now, k: crypto.randomUUID() };
        x.ws.serializeAttachment(x.seat);
        this.broadcast(null, { t: 'runner', r: runner(x.seat.p, x.seat.run, now) });
      });
      this.tellRun(id, now);
      await this.wakeAt(ends);
    } else if (m.t === 'motion') {
      if (!seat.run) return;
      seat.run.d = runner(seat.p, seat.run, now).d;
      seat.run.m = m.m;
      seat.run.since = now;
      ws.serializeAttachment(seat);
      this.broadcast(null, { t: 'runner', r: runner(seat.p, seat.run, now) });
    } else if (m.t === 'quit') {
      // Leaving early is always allowed; the others keep running.
      if (seat.run) this.endRun(ws, seat, now, trailSpot(runner(seat.p, seat.run, now).d, seat.run.l), 0);
    } else {
      // Ripple Effect: only within throwing reach of where you are, and not while running.
      if (seat.run) return;
      if (!cooled(seat.lastStone, now, STONE_EVERY_MS)) return;
      if (Math.hypot(m.x - seat.p.x, m.z - seat.p.z) > STONE_REACH) return;
      seat.lastStone = now;
      ws.serializeAttachment(seat);
      this.broadcast(ws, { t: 'ripple', id: seat.p.id, x: m.x, z: m.z }); // the thrower already drew their own
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.budget.delete(ws);
    const seat = ws.deserializeAttachment() as Seat;
    const now = Date.now();
    if (seat.thumb) {
      const group = seat.thumb.host === seat.p.id ? this.lobby(seat.p.id) : [{ ws, seat }];
      for (const x of group) this.setThumb(x.ws, x.seat, null, now);
    }
    if (seat.run && seat.run.ends > now) {
      // Step 7: a runner who drops out keeps their place for a minute; their avatar waits, faded.
      const run = { ...seat.run, d: runner(seat.p, seat.run, now).d, m: 0 as const, since: now };
      await this.setAways([...(await this.aways()), { p: seat.p, run, until: now + AWAY_MS }]);
      this.broadcast(ws, { t: 'runner', r: runner(seat.p, run, now, true) });
      await this.wakeAt(now + AWAY_MS);
    } else {
      this.broadcast(ws, { t: 'leave', id: seat.p.id });
    }
  }

  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws);
  }

  // Ends runs whose time is up (everyone together) and lets go of runners who never came back.
  async alarm() {
    const now = Date.now();
    const done = new Set<string>();
    for (const { seat } of this.seats()) if (seat.run && seat.run.ends <= now) done.add(seat.run.id);
    let aways = await this.aways();
    for (const a of aways) if (a.run.ends <= now) done.add(a.run.id);
    for (const id of done) this.finishTogether(id, now);
    const gone = aways.filter((a) => done.has(a.run.id) || a.until <= now);
    aways = aways.filter((a) => !gone.includes(a));
    await this.setAways(aways);
    for (const a of gone) {
      this.broadcast(null, { t: 'leave', id: a.p.id });
      if (!done.has(a.run.id)) this.tellRun(a.run.id, now);
    }
    const next = Math.min(
      ...this.seats().flatMap((x) => (x.seat.run ? [x.seat.run.ends] : [])),
      ...aways.flatMap((a) => [a.run.ends, a.until]),
    );
    if (next < Infinity) await this.ctx.storage.setAlarm(next);
  }

  // Step 8: when the time is up, everyone in the run meets at the same spot by the water.
  private finishTogether(runId: string, now: number) {
    const group = this.members(runId).sort((a, b) => a.seat.run!.n - b.seat.run!.n);
    group.forEach((x, i) => this.endRun(x.ws, x.seat, now, { x: (i - (group.length - 1) / 2) * 1.2, z: -1.6 }, 1));
  }

  private endRun(ws: WebSocket, seat: Seat, now: number, spot: { x: number; z: number }, f: 0 | 1) {
    const runId = seat.run!.id;
    const at = { x: Math.round(spot.x * 100) / 100, z: spot.z };
    delete seat.run;
    seat.p = { ...seat.p, x: at.x, z: at.z, s: 0 };
    ws.serializeAttachment(seat);
    this.broadcast(null, { t: 'runEnd', id: seat.p.id, x: at.x, z: at.z, f });
    if (!f) this.tellRun(runId, now);
  }

  private async wakeAt(t: number) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || t < current) await this.ctx.storage.setAlarm(t);
  }

  private async aways() {
    return (await this.ctx.storage.get<Away[]>('aways')) ?? [];
  }

  private async setAways(a: Away[]) {
    await this.ctx.storage.put('aways', a);
  }

  private setThumb(ws: WebSocket, seat: Seat, host: string | null, now: number) {
    if (host) seat.thumb = { host, at: now };
    else delete seat.thumb;
    ws.serializeAttachment(seat);
    this.broadcast(null, { t: 'thumb', id: seat.p.id, host });
  }

  private seats() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, seat: ws.deserializeAttachment() as Seat }));
  }

  private find(id: string) {
    return this.seats().find((x) => x.seat.p.id === id);
  }

  // Everyone whose thumb is with this host, the host included.
  private lobby(hostId: string) {
    return this.seats().filter((x) => x.seat.thumb?.host === hostId);
  }

  private members(runId: string) {
    return this.seats().filter((x) => x.seat.run?.id === runId);
  }

  // Tells each runner who is in their run and how long is left. ids[n - 1] is runner number n
  // ('' once they've left), so numbers never shift.
  private async tellRun(runId: string, now: number) {
    const members = this.members(runId);
    const all = [...members.map((x) => x.seat), ...(await this.aways()).filter((a) => a.run.id === runId)];
    const ids = ['', '', '', ''].slice(0, Math.max(...all.map((x) => x.run!.n)));
    for (const x of all) ids[x.run!.n - 1] = x.p.id;
    for (const x of members) {
      const r = x.seat.run!;
      try {
        x.ws.send(JSON.stringify({ t: 'run', ids, left: r.ends - now, k: r.k } satisfies ServerMsg));
      } catch {
        // already closing
      }
    }
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
