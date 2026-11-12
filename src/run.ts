import { RUN_MINUTES, type ClientMsg, type Thumb } from './protocol';

// Run Together, the phone side: raised thumbs, the host's choices, the time left, and whether you're moving.
// The phone never says how far or how fast; it only says "moving" or "resting".
const MOVING_SPREAD = 1.8; // m/s²: how much the phone must shake (spread of readings over 2 s) to count as moving
const OVERDUE_MS = 3000; // if the room hasn't ended the run this long after time is up, nudge it
const font = 'font:15px system-ui,sans-serif;color:#4d3a2a;';
const pill = 'border:none;border-radius:999px;padding:10px 16px;background:#fbfaf6;color:#4d3a2a;font:15px system-ui,sans-serif;';
const THUMB = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>';

type Screen = { x: number; y: number } | null; // where someone's head is on screen, or null when off screen

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

const text = (t: string) => Object.assign(document.createElement('span'), { textContent: t });

export function runTogether(send: (m: ClientMsg) => void, headOf: (id: string) => Screen, myId: () => string) {
  const raise = button('Up for a run?', () => {
    unlock();
    send({ t: 'raise' });
  });
  raise.style.cssText += 'position:fixed;right:16px;top:16px;'; // top corner: the bottom is for boats and stones
  document.body.appendChild(raise);
  const lobby = panel('bottom:120px;');
  const timer = panel('top:16px;');
  const toast = panel('top:76px;pointer-events:none;'); // below the top buttons
  const fallback = button("I'm resting", () => setMoving(moving ? 0 : 1)); // for phones without a motion sensor
  const clock = text('');
  clock.style.padding = '10px 4px';
  const quit = button('Leave run', () => send({ t: 'quit' }));

  // Thumbs in the air, and runner numbers (only shown to the runners themselves).
  const thumbs = new Map<string, { host: string; el: HTMLButtonElement; x: number; y: number; placed: boolean }>();
  const numbers: HTMLSpanElement[] = [];
  let runIds: string[] = [];

  // When my run ends, by this page's clock (performance.now() ms), or 0 when not running. Kept as an end
  // time, not a countdown, so the timer keeps going while you're on another page or app.
  let endAt = 0;
  let nudged = false;
  let key = '';
  let duration = RUN_MINUTES[1];
  let moving: 0 | 1 = 0;
  let audio: AudioContext | null = null;
  let wake: { release(): Promise<void> } | null = null;
  let sensed = false;
  let samples: { t: number; a: number }[] = [];

  function say(t: string) {
    toast.textContent = t;
    toast.style.display = 'flex';
    setTimeout(() => (toast.style.display = 'none'), 4000);
  }

  // iOS only lets a page read motion, and play sound, after a tap; so both are asked for on the taps that lead to a run.
  function unlock() {
    const DM = typeof DeviceMotionEvent === 'undefined'
      ? undefined
      : (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> });
    DM?.requestPermission?.().catch(() => {});
    audio ??= new AudioContext();
  }

  function setMoving(m: 0 | 1) {
    if (m === moving || !endAt) return;
    moving = m;
    fallback.textContent = m ? "I'm moving" : "I'm resting";
    send({ t: 'motion', m });
  }

  // Moving = the phone has been shaking for the last 2 seconds, the way it does in a pocket while jogging.
  addEventListener('devicemotion', (e) => {
    const g = e.accelerationIncludingGravity;
    if (!endAt || !g || g.x === null) return;
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
      wake = (await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<typeof wake> } })
        .wakeLock?.request('screen')) ?? null;
    } catch {
      // not allowed or not supported: the run still works while the screen stays on
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (endAt && document.visibilityState === 'visible') keepAwake();
  });

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

  // What I see at the bottom while my thumb is up: the host's choices, or a way to step out.
  function showLobby() {
    const mine = thumbs.get(myId());
    raise.style.display = mine || endAt ? 'none' : '';
    if (!mine) return void (lobby.style.display = 'none');
    if (mine.host === myId()) {
      const joined = [...thumbs.values()].filter((t) => t.host === myId()).length - 1;
      lobby.replaceChildren(
        text(joined ? `${joined} joined` : 'Waiting for others…'),
        ...RUN_MINUTES.map((d) => {
          const b = button(`${d} min`, () => {
            duration = d;
            showLobby();
          });
          if (d === duration) b.style.background = '#e9dccb';
          return b;
        }),
        button(joined ? 'Start' : 'Run alone', () => send({ t: 'start', d: duration })),
        button('Cancel', () => send({ t: 'lower' })),
      );
    } else {
      lobby.replaceChildren(text('Waiting for the host to start'), button('Leave', () => send({ t: 'lower' })));
    }
    lobby.style.display = 'flex';
  }

  function setThumb(id: string, host: string | null) {
    const t = thumbs.get(id);
    if (!host) {
      t?.el.remove();
      thumbs.delete(id);
    } else if (t) {
      t.host = host;
    } else {
      const el = document.createElement('button');
      el.innerHTML = THUMB;
      el.ariaLabel = 'Raised thumb';
      el.style.cssText = 'position:fixed;width:40px;height:40px;padding:0;border:none;background:none;' +
        'filter:drop-shadow(0 0 3px #0006);display:none;';
      // Tap someone's thumb to join their run; tap your own to lower it.
      el.onclick = () => {
        const me = myId();
        const mine = thumbs.get(me);
        if (id === me) return send({ t: 'lower' });
        if (!mine && !endAt) {
          unlock();
          send({ t: 'join', id: thumbs.get(id)!.host });
        }
      };
      document.body.appendChild(el);
      thumbs.set(id, { host, el, x: 0, y: 0, placed: false });
    }
    showLobby();
  }

  return {
    get running() {
      return endAt > 0;
    },
    key: () => key,
    feel,
    onThumb: setThumb,

    // A fresh connection: start from the room's list of raised thumbs.
    onWelcome(list: Thumb[]) {
      for (const id of [...thumbs.keys()]) setThumb(id, null);
      for (const t of list) setThumb(t.id, t.host);
      showLobby();
    },

    // You're in a run (or someone joined, left or came back).
    onRun(ids: string[], msLeft: number, k: string) {
      if (!endAt) {
        showHowTo();
        keepAwake();
        samples = [];
        sensed = false;
        moving = 0;
        fallback.textContent = "I'm resting";
        fallback.style.display = 'none';
        setTimeout(() => {
          if (endAt && !sensed) fallback.style.display = 'inline-block';
        }, 3000);
      }
      endAt = performance.now() + msLeft;
      nudged = false;
      key = k;
      runIds = ids;
      for (const n of numbers.splice(0)) n.remove();
      for (const [i] of ids.entries()) {
        const n = text(String(i + 1));
        n.style.cssText = `position:fixed;display:none;width:24px;height:24px;border-radius:50%;background:#fbfaf6;` +
          `text-align:center;line-height:24px;pointer-events:none;${font}`;
        document.body.appendChild(n);
        numbers.push(n);
      }
      timer.replaceChildren(clock, fallback, quit);
      timer.style.display = 'flex';
      showLobby();
    },

    onEnd(together: boolean) {
      endAt = 0;
      key = '';
      runIds = [];
      for (const n of numbers.splice(0)) n.remove();
      timer.style.display = 'none';
      fallback.style.display = 'none';
      wake?.release().catch(() => {});
      wake = null;
      say(together ? 'Time is up. You all made it here together.' : 'You left the run');
      showLobby();
    },

    update(dt: number) {
      // Thumbs ride above heads; a joiner's thumb drifts over to gather beside the host's.
      const groups = new Map<string, number>();
      for (const [id, t] of thumbs) {
        const order = id === t.host ? 0 : (groups.get(t.host) ?? 0) + 1;
        if (id !== t.host) groups.set(t.host, order);
        const anchor = headOf(t.host);
        const own = headOf(id);
        if (!anchor || !own) {
          t.el.style.display = 'none';
          continue;
        }
        const side = order % 2 ? -1 : 1;
        const tx = anchor.x - 20 + side * Math.ceil(order / 2) * 30;
        const ty = anchor.y - 44;
        if (!t.placed) Object.assign(t, { x: own.x - 20, y: own.y - 44, placed: true });
        const k = 1 - Math.exp(-3 * dt);
        t.x += (tx - t.x) * k;
        t.y += (ty - t.y) * k;
        t.el.style.display = 'block';
        t.el.style.transform = `translate(${t.x}px,${t.y}px)`;
        t.el.style.left = t.el.style.top = '0';
      }
      // Runner numbers: identifiers, not ranks.
      numbers.forEach((n, i) => {
        const at = runIds[i] ? headOf(runIds[i]) : null;
        n.style.display = at ? 'block' : 'none';
        if (at) n.style.transform = `translate(${at.x - 12}px,${at.y - 34}px)`;
        n.style.left = n.style.top = '0';
      });
      if (!endAt) return;
      const left = Math.max(0, endAt - performance.now());
      const s = Math.ceil(left / 1000);
      clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      // The room ends the run on its own; if that's late, any message makes it finish.
      if (!nudged && performance.now() - endAt > OVERDUE_MS) {
        nudged = true;
        send({ t: 'motion', m: moving });
      }
    },
  };
}

// At the start of a run: a little figure jogging in place with a phone in hand, for a few seconds.
function showHowTo() {
  const card = document.createElement('div');
  card.style.cssText =
    'position:fixed;z-index:5;left:50%;top:50%;transform:translate(-50%,-50%);padding:18px 26px 14px;border-radius:24px;' +
    'background:#fbfaf6e8;pointer-events:none;text-align:center;font:15px system-ui,sans-serif;color:#4d3a2a;';
  card.innerHTML = `<svg width="96" height="120" viewBox="0 0 96 120" fill="none" stroke="#4d3a2a" stroke-width="6"
    stroke-linecap="round" stroke-linejoin="round">
    <style>
      .bob { animation: bob .5s ease-in-out infinite alternate; }
      .legA { transform-origin: 48px 70px; animation: leg .5s ease-in-out infinite alternate; }
      .legB { transform-origin: 48px 70px; animation: leg .5s ease-in-out infinite alternate-reverse; }
      @keyframes bob { from { transform: translateY(0) } to { transform: translateY(-5px) } }
      @keyframes leg { from { transform: rotate(-25deg) } to { transform: rotate(25deg) } }
    </style>
    <g class="legA"><path d="M48 70 L44 92 L48 112"/></g>
    <g class="legB"><path d="M48 70 L52 92 L48 112"/></g>
    <g class="bob">
      <circle cx="48" cy="16" r="10"/>
      <path d="M48 28 V70"/>
      <path d="M48 38 L30 52 L40 64"/>
      <path d="M48 38 L64 50 L70 40"/>
      <rect x="64" y="22" width="14" height="22" rx="3" fill="#4d3a2a" stroke-width="3"/>
    </g>
  </svg><div style="margin-top:6px">Move with your phone</div>`;
  document.body.appendChild(card);
  card.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 4500 })
    .onfinish = () => card.remove();
}
