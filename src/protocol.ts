// Shared by the phone and the server. The server trusts nothing a phone sends:
// every message goes through parseClient before anyone else sees it.

// The ground, in metres, from the lake inland: boardwalk 5 m, running trail 3 m, grass 30 m.
// x runs along the shore, z toward the lake (negative).
export const BOARDWALK = { minZ: -3, maxZ: 2 };
export const TRAIL = { minZ: 2, maxZ: 5 };
export const GRASS = { minZ: 5, maxZ: 35 };
// Where people can walk: all three, kept half a metre in from the edges.
export const WALK = { minX: -28, maxX: 28, minZ: BOARDWALK.minZ + 0.5, maxZ: GRASS.maxZ - 0.5 };
// Where stones can land: the lake in front of the boardwalk.
export const LAKE = { minX: -40, maxX: 40, minZ: -30, maxZ: -3 };
export const STONE_REACH = 20; // metres from where you stand
export const MAX_PEOPLE = 30; // per waterfront
export const MAX_MSGS_PER_SEC = 10;
export const MAX_PER_ADDRESS = 4; // a family or a cafe on one Wi-Fi can still come together
export const BOAT_EVERY_MS = 10_000; // one boat per person per 10 s
export const STONE_EVERY_MS = 1_000;
export const BOAT_LIFE_S = 30 * 60; // boats float away after 30 minutes
export const MAX_BOATS = 50; // oldest drops off first
// Run Together
export const RUN_MINUTES = [5, 10, 20];
export const MAX_RUNNERS = 4;
export const RUN_PACE = 2.5; // metres per second while your phone says you're moving: an easy jog
export const INVITE_EVERY_MS = 5_000;
export const INVITE_LIFE_MS = 60_000;

// Floating Thoughts: a boat is only ever one of these colours, never free text.
export const BOAT_COLOURS = ['#f2c6c2', '#f6dfa4', '#bfe0c5', '#b9d4ee', '#d8c8ec', '#fbfaf6'];

// Where someone is heading, and whether they sit down when they get there.
export type Pose = { x: number; z: number; s: 0 | 1 };
export type Person = Pose & { id: string };
export type Boat = { x: number; c: number; age: number }; // age in seconds when sent

// Where someone is in a run: d = metres along the trail when sent, m = 1 while moving, l = lane 0-3.
export type Runner = { id: string; d: number; m: 0 | 1; l: number };

export type ClientMsg =
  | ({ t: 'move' } & Pose)
  | { t: 'boat'; c: number }
  | { t: 'stone'; x: number; z: number }
  | { t: 'invite'; id: string; d: number } // ask someone to run for d minutes
  | { t: 'accept'; id: string } // say yes to that person's invitation
  | { t: 'motion'; m: 0 | 1 } // my phone says I'm moving (1) or resting (0)
  | { t: 'quit' }; // leave my run early

export type ServerMsg =
  | { t: 'welcome'; id: string; others: Person[]; boats: Boat[]; runners: Runner[] }
  | ({ t: 'join' } & Person)
  | ({ t: 'move' } & Person)
  | { t: 'leave'; id: string }
  | { t: 'boat'; b: Boat }
  | { t: 'ripple'; id: string; x: number; z: number } // id: who threw it, so phones can draw the stone's flight
  | { t: 'invite'; id: string; d: number } // someone asks you to run for d minutes
  | { t: 'runner'; r: Runner } // someone started, moved or paused in a run (sent to everyone)
  | { t: 'run'; ids: string[]; left: number } // to the runners only: who is in your run, ms left
  | { t: 'runEnd'; id: string; x: number; z: number } // a run ended for this person; they stand here
  | { t: 'full' }; // sent just before the server closes a socket it has no room for

export function inWalk(x: number, z: number) {
  return x >= WALK.minX && x <= WALK.maxX && z >= WALK.minZ && z <= WALK.maxZ;
}

export function inLake(x: number, z: number) {
  return x >= LAKE.minX && x <= LAKE.maxX && z >= LAKE.minZ && z <= LAKE.maxZ;
}

const num = (v: unknown): v is number => typeof v === 'number';
const cm = (v: number) => Math.round(v * 100) / 100;
// Ids are the server's own random UUIDs.
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);

// The trail is walked back and forth: metres run -> x along the shore. Lanes sit side by side.
export function trailSpot(d: number, lane: number) {
  const len = WALK.maxX - WALK.minX;
  const t = d % (2 * len);
  return { x: t < len ? WALK.minX + t : WALK.maxX - (t - len), z: TRAIL.minZ + 0.6 + lane * 0.6 };
}

// The only messages a phone may send. Anything else, or any extra field, is dropped.
export function parseClient(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > 100) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const { t, x, z, s, c, id, d } = m as Record<string, unknown>;
  // Each branch rebuilds the object so no extra fields ride along to other phones.
  if (t === 'move' && num(x) && num(z) && inWalk(x, z) && (s === 0 || s === 1)) return { t, x: cm(x), z: cm(z), s };
  if (t === 'boat' && Number.isInteger(c) && (c as number) >= 0 && (c as number) < BOAT_COLOURS.length) {
    return { t, c: c as number };
  }
  if (t === 'stone' && num(x) && num(z) && inLake(x, z)) return { t, x: cm(x), z: cm(z) };
  if (t === 'invite' && isId(id) && RUN_MINUTES.includes(d as number)) return { t, id, d: d as number };
  if (t === 'accept' && isId(id)) return { t, id };
  if (t === 'motion' && (m as Record<string, unknown>).m === 0) return { t, m: 0 };
  if (t === 'motion' && (m as Record<string, unknown>).m === 1) return { t, m: 1 };
  if (t === 'quit') return { t };
  return null;
}

// Per-phone message budget: at most MAX_MSGS_PER_SEC in each clock second.
export type Budget = { second: number; count: number };
export function spend(b: Budget | undefined, nowMs: number): { budget: Budget; ok: boolean } {
  const second = Math.floor(nowMs / 1000);
  const count = b && b.second === second ? b.count + 1 : 1;
  return { budget: { second, count }, ok: count <= MAX_MSGS_PER_SEC };
}

// True when enough time has passed since the last boat or stone.
export function cooled(last: number | undefined, nowMs: number, everyMs: number) {
  return last === undefined || nowMs - last >= everyMs;
}
