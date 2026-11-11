import { RUN_MINUTES, type ClientMsg } from './protocol';

// Run Together, the phone side: invitations, the time left, and whether you're moving.
// The phone never says how far or how fast; it only says "moving" or "resting".
const MOVING_SPREAD = 1.2; // m/s²: how much the phone must shake (spread of readings over 2 s) to count as moving
const font = 'font:15px system-ui,sans-serif;color:#4d3a2a;';
const pill = 'border:none;border-radius:999px;padding:10px 16px;background:#fbfaf6;color:#4d3a2a;font:15px system-ui,sans-serif;';

function panel(css: string) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:16px;right:16px;display:none;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;${font}${css}`;
  document.body.appendChild(el);
  return el;
}

function button(text: string, onclick: () => void) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = pill;
  b.onclick = onclick;
  return b;
}

export function runTogether(send: (m: ClientMsg) => void) {
  const picker = panel('bottom:120px;');
  const card = panel('bottom:120px;');
  const timer = panel('top:16px;');
  const toast = panel('top:16px;pointer-events:none;');
  const fallback = button("I'm resting", () => setMoving(moving ? 0 : 1)); // for phones without a motion sensor

  let left = 0; // ms left in my run, or 0 when not running
  let moving: 0 | 1 = 0;
  let audio: AudioContext | null = null;
  let wake: { release(): Promise<void> } | null = null;
  let sensed = false;
  let samples: { t: number; a: number }[] = [];
  let cardTimer = 0;

  function say(text: string) {
    toast.textContent = text;
    toast.style.display = 'flex';
    setTimeout(() => (toast.style.display = 'none'), 3000);
  }

  // iOS only lets a page read motion, and play sound, after a tap; so both are asked for on the tap that starts a run.
  function unlock() {
    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    DM.requestPermission?.().catch(() => {});
    audio ??= new AudioContext();
  }

  function setMoving(m: 0 | 1) {
    if (m === moving || !left) return;
    moving = m;
    fallback.textContent = m ? "I'm moving" : "I'm resting";
    send({ t: 'motion', m });
  }

  // Moving = the phone has been shaking for the last 2 seconds, the way it does in a hand or pocket while jogging.
  addEventListener('devicemotion', (e) => {
    const g = e.accelerationIncludingGravity;
    if (!left || !g || g.x === null) return;
    sensed = true;
    fallback.style.display = 'none';
    const t = e.timeStamp;
    samples.push({ t, a: Math.hypot(g.x!, g.y!, g.z!) });
    samples = samples.filter((s) => t - s.t < 2000);
    if (samples.length < 10) return;
    const mean = samples.reduce((n, s) => n + s.a, 0) / samples.length;
    const spread = Math.sqrt(samples.reduce((n, s) => n + (s.a - mean) ** 2, 0) / samples.length);
    setMoving(spread > MOVING_SPREAD ? 1 : 0);
  });

  // Keep the screen on during a run; a locked phone stops the page.
  async function keepAwake() {
    try {
      wake = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<typeof wake> } })
        .wakeLock?.request('screen') ?? null;
    } catch {
      // not allowed or not supported: the run still works while the screen stays on
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (left && document.visibilityState === 'visible') keepAwake();
  });

  const quit = button('Leave run', () => send({ t: 'quit' }));
  const clock = document.createElement('span');
  clock.style.cssText = 'padding:10px 4px;';

  // A soft two-note chime (and a short buzz where phones allow it) when everyone in the run is moving.
  function feel() {
    navigator.vibrate?.([60, 80, 60]);
    if (!audio) return;
    const now = audio.currentTime;
    for (const [i, f] of [660, 880].entries()) {
      const o = audio.createOscillator();
      const v = audio.createGain();
      o.frequency.value = f;
      v.gain.setValueAtTime(0.0001, now + i * 0.18);
      v.gain.exponentialRampToValueAtTime(0.15, now + i * 0.18 + 0.03);
      v.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.6);
      o.connect(v).connect(audio.destination);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.7);
    }
  }

  return {
    get running() {
      return left > 0;
    },
    feel,

    // You tapped someone: choose how long to run.
    offerInvite(id: string) {
      picker.replaceChildren(
        Object.assign(document.createElement('span'), { textContent: 'Run together?' }),
        ...RUN_MINUTES.map((d) =>
          button(`${d} min`, () => {
            unlock();
            send({ t: 'invite', id, d });
            picker.style.display = 'none';
            say('Invitation sent');
          }),
        ),
        button('×', () => (picker.style.display = 'none')),
      );
      card.style.display = 'none';
      picker.style.display = 'flex';
    },

    // Someone asked you. Saying nothing is fine too: it fades after a minute.
    onInvite(id: string, d: number) {
      card.replaceChildren(
        Object.assign(document.createElement('span'), { textContent: `Someone would like to run with you · ${d} min` }),
        button('Run', () => {
          unlock();
          send({ t: 'accept', id });
          card.style.display = 'none';
        }),
        button('Not now', () => (card.style.display = 'none')),
      );
      picker.style.display = 'none';
      card.style.display = 'flex';
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => (card.style.display = 'none'), 60_000);
    },

    // You're in a run (or someone joined or left it).
    onRun(msLeft: number) {
      if (!left) {
        keepAwake();
        samples = [];
        sensed = false;
        moving = 0;
        fallback.style.display = 'none';
        fallback.textContent = "I'm resting";
        setTimeout(() => {
          if (left && !sensed) fallback.style.display = 'inline-block';
        }, 3000);
      }
      left = msLeft;
      card.style.display = 'none';
      timer.replaceChildren(clock, fallback, quit);
      timer.style.display = 'flex';
    },

    onEnd() {
      left = 0;
      timer.style.display = 'none';
      fallback.style.display = 'none';
      wake?.release().catch(() => {});
      wake = null;
      say('Run finished');
    },

    update(dt: number) {
      if (!left) return;
      left = Math.max(1, left - dt * 1000); // the server says when it's really over
      const s = Math.ceil(left / 1000);
      clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
  };
}
