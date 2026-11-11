// Shared by the phone and the server. The server trusts nothing a phone sends:
// every message goes through parseMove before anyone else sees it.

// The strip people can walk on, in metres. x runs along the shore, z toward the lake (negative).
export const WALK = { minX: -28, maxX: 28, minZ: -2.5, maxZ: 2.5 };
export const MAX_PEOPLE = 30; // per waterfront
export const MAX_MSGS_PER_SEC = 10;

// Where someone is heading, and whether they sit down when they get there.
export type Pose = { x: number; z: number; s: 0 | 1 };
export type Person = Pose & { id: string };

export type ServerMsg =
  | { t: 'welcome'; id: string; others: Person[] }
  | ({ t: 'join' } & Person)
  | ({ t: 'move' } & Person)
  | { t: 'leave'; id: string };

export function inWalk(x: number, z: number) {
  return x >= WALK.minX && x <= WALK.maxX && z >= WALK.minZ && z <= WALK.maxZ;
}

// The only message a phone may send: {"t":"move","x":..,"z":..,"s":0|1}.
export function parseMove(raw: unknown): Pose | null {
  if (typeof raw !== 'string' || raw.length > 100) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const { t, x, z, s } = m as Record<string, unknown>;
  if (t !== 'move' || typeof x !== 'number' || typeof z !== 'number') return null;
  if (!inWalk(x, z) || (s !== 0 && s !== 1)) return null;
  // Rebuild the object so no extra fields ride along to other phones.
  return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, s };
}
