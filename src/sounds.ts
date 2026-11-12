// Hoon's sound effects (public/sounds). Phones only allow sound after a tap, so nothing loads
// or plays until the first one; after that, sounds can play at any time, even ones others cause.
type Name = 'boat' | 'click' | 'firework' | 'ripple' | 'walk' | 'wave';
const NAMES: Name[] = ['boat', 'click', 'firework', 'ripple', 'walk', 'wave'];

let ctx: AudioContext | null = null;
const buffers = new Map<Name, AudioBuffer>();
const loops = new Map<Name, AudioBufferSourceNode>();

function start() {
  if (ctx) {
    if (ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {});
    return;
  }
  ctx = new AudioContext();
  for (const n of NAMES) {
    fetch(`/sounds/${n}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .then((buf) => buffers.set(n, buf))
      .catch(() => {}); // a sound that fails to load just stays quiet
  }
}
for (const e of ['pointerdown', 'click']) addEventListener(e, start, true);
// Quiet while the page is hidden (another app, or the phone locked); back on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) ctx?.suspend().catch(() => {});
  else ctx?.resume().catch(() => {});
});
// Every button gives a soft click.
addEventListener('click', (e) => {
  if ((e.target as Element).closest?.('button')) sound('click', 0.5);
}, true);

export function sound(n: Name, volume = 1) {
  const buf = buffers.get(n);
  if (!ctx || !buf) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(ctx.destination);
  src.start();
  return src;
}

// A looping sound that plays while `on` is true (call it every frame; it only acts on a change).
export function hold(n: Name, on: boolean, volume = 1) {
  const now = loops.get(n);
  if (on === !!now) return;
  if (now) {
    now.stop();
    loops.delete(n);
    return;
  }
  const src = sound(n, volume);
  if (!src) return;
  src.loop = true;
  loops.set(n, src);
}
