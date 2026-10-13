# Sing Buffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sing sends a 6 s WAV window every 3 s from a ring buffer instead of back-to-back 6 s MediaRecorder chunks, so results arrive twice as often with the same accuracy.

**Architecture:** A one-file `AudioWorklet` posts raw mic blocks to the main thread. `js/capture.js` resamples them to 16 kHz, keeps the last 6 s in a ring, and every 3 s hands a WAV blob to `sing.js`, which uploads it as today. `advance()` in `js/align.js` learns to look 20 words back, because half of each window is words already behind the cursor. The lyric prompt is removed.

**Tech Stack:** Vanilla ES modules, no dependencies, `node --test`. Web Audio `AudioWorklet`. Cloudflare Worker (unchanged), deployed with `npx wrangler`.

**Spec:** `docs/superpowers/specs/2026-10-13-sing-buffer-design.md`

## Global Constraints

- **No dependencies, no build step.** Node built-ins only in tests. Files served are files written.
- **Everything runs from the repo root**, `/Users/sebastienjeanfavre/dev/ideas/JFavrites`. Tests: `node --test`.
- **No DOM or Web Audio access at module top level** in `js/align.js` or `js/capture.js`. Both are imported by `node --test`. Browser APIs only inside `startCapture`.
- **Constants:** `RATE = 16000`, `WINDOW_MS = 6000`, `HOP_MS = 3000` in `capture.js`; `LOOKBACK = 20` in `align.js`. Other `align.js` constants keep their values.
- **WAV format:** 16-bit PCM, mono, 16000 Hz. Upload file name `chunk.wav`.
- **No prompt field** is sent to the worker.
- **The worker does not change.**
- **Logging:** `sing.js` only, prefix `[sing]`, one `console.warn` per failed HTTP call with status and body.
- **Comments:** none by default; at most 3 lines, only for a constraint the code cannot show.
- **Commits:** conventional with a scope (`feat(sing):`, `refactor(align):`). No `Co-Authored-By` or other trailer.
- **A push to `main` deploys to production.** Do not push. Task 4 uses a preview version.

## Review Focus

- iOS can set the context to `interrupted` while the mic starts. Sing must not stop by itself in the first seconds. Pinned by the phone check in Task 4.
- Stop tapped while the worklet loads must leave no live mic and no open context. Pinned by the desktop check in Task 3 and the phone check in Task 4.
- A phone call or Siri during Sing must stop Sing, not resend the same window every 3 s. Pinned by the ring freshness test in Task 1 and the phone check in Task 4.
- A line sung again later in the song must move the cursor forward, not hold on its first occurrence. Pinned in Task 2.
- A late result made only of words behind the cursor must not move it. Pinned by the existing `advance never moves backwards` test, kept in Task 2.

---

### Task 1: Pure capture parts — resampler, ring, WAV

**Files:**
- Create: `js/capture.js`
- Test: `test/capture.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RATE` — `16000`
  - `resampler(inRate: number) => (input: Float32Array) => Float32Array`
  - `ring(size: number) => { push(samples: Float32Array): void, latest(): { samples: Float32Array, fresh: boolean } }`
  - `wav(samples: Float32Array) => Blob` (type `audio/wav`)

- [ ] **Step 1: Write the failing tests**

Create `test/capture.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE, resampler, ring, wav } from '../js/capture.js';

test('resampler turns a 44.1 kHz tone into the same tone at 16 kHz across block edges', () => {
  const inRate = 44100;
  const n = inRate * 2;
  const tone = (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t);
  const input = Float32Array.from({ length: n }, (_, k) => tone(k / inRate));
  const toRate = resampler(inRate);
  const parts = [];
  for (let k = 0; k < n; k += 128) parts.push(...toRate(input.subarray(k, k + 128)));

  assert.ok(Math.abs(parts.length - (n * RATE) / inRate) <= 1);
  const worst = Math.max(...parts.map((x, k) => Math.abs(x - tone(k / RATE))));
  assert.ok(worst < 1e-3, `worst error ${worst}`);
});

test('before the ring is full, latest returns only what was pushed', () => {
  const r = ring(4);
  r.push(Float32Array.of(1, 2));
  assert.deepEqual([...r.latest().samples], [1, 2]);
});

test('after the ring wraps, latest returns the newest samples in order', () => {
  const r = ring(4);
  r.push(Float32Array.of(1, 2, 3));
  r.push(Float32Array.of(4, 5, 6));
  assert.deepEqual([...r.latest().samples], [3, 4, 5, 6]);
});

test('a second read with no new samples is not fresh', () => {
  const r = ring(4);
  r.push(Float32Array.of(1));
  assert.equal(r.latest().fresh, true);
  assert.equal(r.latest().fresh, false);
});

test('wav writes clipped 16-bit samples behind a 16 kHz mono header', async () => {
  const view = new DataView(await wav(Float32Array.of(1, -1, 1.5, 0.5)).arrayBuffer());
  const text = (at) => String.fromCharCode(...new Uint8Array(view.buffer, at, 4));
  assert.equal(text(0), 'RIFF');
  assert.equal(text(8), 'WAVE');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8);
  assert.deepEqual([0, 1, 2, 3].map((k) => view.getInt16(44 + k * 2, true)), [32767, -32767, 32767, 16384]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/capture.test.js`
Expected: FAIL, `Cannot find module` for `js/capture.js`.

- [ ] **Step 3: Write the implementation**

Create `js/capture.js`:

```js
export const RATE = 16000;

export function resampler(inRate) {
  const step = inRate / RATE;
  let prev = 0;
  let pos = 1;
  return (input) => {
    const at = (k) => (k === 0 ? prev : input[k - 1]);
    const out = [];
    for (; pos < input.length; pos += step) {
      const k = Math.floor(pos);
      const f = pos - k;
      out.push(at(k) * (1 - f) + at(k + 1) * f);
    }
    pos -= input.length;
    prev = input[input.length - 1];
    return Float32Array.from(out);
  };
}

export function ring(size) {
  const data = new Float32Array(size);
  let head = 0;
  let filled = 0;
  let fresh = false;
  return {
    push(samples) {
      for (const x of samples) {
        data[head] = x;
        head = (head + 1) % size;
      }
      filled = Math.min(size, filled + samples.length);
      if (samples.length) fresh = true;
    },
    latest() {
      const samples = new Float32Array(filled);
      for (let k = 0; k < filled; k++) samples[k] = data[(head - filled + k + size) % size];
      const out = { samples, fresh };
      fresh = false;
      return out;
    },
  };
}

export function wav(samples) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * 0x7fff), true));
  return new Blob([view.buffer], { type: 'audio/wav' });
}
```

The resampler reads from a virtual array `[prev, ...input]`, so the
interpolation across a block edge uses the real previous sample.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test`
Expected: all tests PASS (59 old + 5 new).

- [ ] **Step 5: Commit**

```bash
git add js/capture.js test/capture.test.js
git commit -m "feat(sing): resampler, ring buffer and wav encoder for overlapping windows"
```

---

### Task 2: `advance()` looks back

**Files:**
- Modify: `js/align.js` (constants at the top, `advance`)
- Test: `test/align.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `advance(words, cursor, transcript) => number`. The signature does not change. It now matches from `cursor − LOOKBACK` and never returns less than `cursor`.

- [ ] **Step 1: Write the failing tests**

Add to `test/align.test.js`, after the test `a repeated line resolves to the nearest occurrence ahead`:

```js
test('a window that straddles a repeated line moves to the true place, not a later repeat', () => {
  const thrice = parse(`{title: Thrice}
{artist: Traditional}
{key: G}

Amazing grace how sweet the sound
That saved a wretch like me
Amazing grace how sweet the sound
That saved a wretch like me
Amazing grace how sweet the sound
That saved a wretch like me
`);
  const w = buildWords(thrice);
  assert.equal(advance(w, 12, 'wretch like me amazing grace how'), 15);
});

test('a window mostly behind the cursor still moves it past the new words', () => {
  assert.equal(advance(words, 15, 'a wretch like me i once was lost but now'), 18);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/align.test.js`
Expected: the two new tests FAIL. The first returns `27` (it jumps to the third repeat). The second returns `15` (3 of 10 words is under the 40 % ratio).

- [ ] **Step 3: Write the implementation**

In `js/align.js`, add the constant under `LOOKAHEAD`:

```js
const LOOKAHEAD = 60;
const LOOKBACK = 20;
```

Replace the body of `advance` (keep the comment above it for now; Task 3 changes it):

```js
export function advance(words, cursor, transcript) {
  const heard = normalise(transcript);
  if (heard.length === 0 || heard.length > MAX_HEARD) return cursor;

  const span = Math.ceil(heard.length * 1.5);
  const end = Math.min(words.length, cursor + LOOKAHEAD);
  let best = { count: 0, last: -1 };
  for (let start = Math.max(0, cursor - LOOKBACK); start < end; start++) {
    const slice = words.slice(start, start + span).map((w) => w.word);
    const { count, last } = lcs(heard, slice);
    const ahead = start + last >= cursor;
    if (count > best.count || (count === best.count && ahead && best.last < cursor)) {
      best = { count, last: start + last };
    }
  }

  if (best.count < MIN_MATCH || best.count < heard.length * MIN_RATIO) return cursor;
  return Math.max(cursor, best.last + 1);
}
```

Why the tie rule: the existing test `a repeated line resolves to the nearest
occurrence ahead` sings line 1 again with the cursor at 6. The first
occurrence, behind the cursor, has the same count. Without the tie rule it
wins and the cursor holds.

- [ ] **Step 4: Run all tests**

Run: `node --test`
Expected: all PASS. In particular these old tests must still pass:
`advance never moves backwards`, `a repeated line resolves to the nearest
occurrence ahead`, `a repeated phrase consumes only as many repetitions as
were sung`, `advance at the end of the words returns the cursor`.

- [ ] **Step 5: Commit**

```bash
git add js/align.js test/align.test.js
git commit -m "fix(align): look back over the overlap so repeats do not pull the cursor ahead"
```

---

### Task 3: Sing records through the worklet, no prompt

**Files:**
- Create: `js/capture-worklet.js`
- Modify: `js/capture.js` (add constants and `startCapture`)
- Modify: `js/sing.js` (whole file below)
- Modify: `js/align.js` (remove `lyricLines`, `promptFor`, `PROMPT_WORDS`; new `MAX_HEARD` comment)
- Modify: `test/align.test.js` (remove prompt tests, rewrite echo test)

**Interfaces:**
- Consumes: `resampler`, `ring`, `wav`, `RATE` from Task 1; `advance` from Task 2.
- Produces: `startCapture(context: AudioContext, stream: MediaStream, onWindow: (blob: Blob) => void) => Promise<() => void>`. Calls `onWindow` every `HOP_MS` with the last `WINDOW_MS` of audio, only if new audio arrived. The returned function stops it.

- [ ] **Step 1: Update the align tests**

In `test/align.test.js`:

- Change the import to:

```js
import {
  normalise, buildWords, currentLine, advance, startCursor,
} from '../js/align.js';
```

- Delete these three tests: `lyricLines keeps one entry per rendered line`,
  `promptFor starts one line before the current line and skips empty lines`,
  `promptFor stops once it holds about 150 words`.
- Replace the test `a transcript that echoes the prompt holds the cursor` with:

```js
test('a transcript longer than anyone sings in one window holds the cursor', () => {
  const tooLong = words.slice(0, 41).map((w) => w.word).join(' ');
  assert.equal(advance(words, 0, tooLong), 0);
});
```

- [ ] **Step 2: Remove the prompt code from `align.js`**

In `js/align.js`:

- Delete `const PROMPT_WORDS = 150;`.
- Delete the functions `lyricLines` and `promptFor`.
- Replace the comment above `advance` with:

```js
// Nobody sings 40 words in a 6 s window; longer text is Whisper hallucinating over the guitar.
```

- [ ] **Step 3: Run the tests**

Run: `node --test`
Expected: all PASS.

- [ ] **Step 4: Create the worklet**

Create `js/capture-worklet.js`:

```js
// The input arrays are reused between calls, so post a copy.
registerProcessor('capture', class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
});
```

- [ ] **Step 5: Add `startCapture` to `capture.js`**

Under `export const RATE = 16000;` add:

```js
const WINDOW_MS = 6000;
const HOP_MS = 3000;
```

At the end of the file add:

```js
export async function startCapture(context, stream, onWindow) {
  await context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url).href);
  const node = new AudioWorkletNode(context, 'capture');
  const source = context.createMediaStreamSource(stream);
  const toRate = resampler(context.sampleRate);
  const buffer = ring((RATE * WINDOW_MS) / 1000);
  node.port.onmessage = (e) => buffer.push(toRate(e.data));
  source.connect(node);
  // A worklet with no output connection may not run.
  node.connect(context.destination);
  const timer = setInterval(() => {
    const { samples, fresh } = buffer.latest();
    if (fresh) onWindow(wav(samples));
  }, HOP_MS);
  return () => {
    clearInterval(timer);
    node.port.onmessage = null;
    source.disconnect();
    node.disconnect();
  };
}
```

- [ ] **Step 6: Replace `js/sing.js`**

Write the whole file:

```js
import { buildWords, currentLine, advance, startCursor } from './align.js';
import { startCapture } from './capture.js';

const WORKER_URL = '/transcribe';
const PASSWORD_KEY = 'sing-password';
const FAILURES_TO_STOP = 3;
const MESSAGE_MS = 3000;
const SCROLL_FROM_TOP = 0.3;

let session = null;
let generation = 0;

export function isSinging() {
  return session !== null;
}

export async function startSing(song) {
  const password = localStorage.getItem(PASSWORD_KEY) || prompt('Password');
  if (!password) return;
  localStorage.setItem(PASSWORD_KEY, password);

  const words = buildWords(song);
  if (words.length === 0) return;

  const started = generation;
  // iOS starts audio only from a tap, so the context must exist before the first await.
  const context = new AudioContext();
  context.resume();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    context.close();
    showStatus('Microphone blocked', MESSAGE_MS);
    return;
  }
  if (session || started !== generation) {
    context.close();
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  const bar = document.getElementById('bar').offsetHeight;
  const top = [...document.querySelectorAll('p.line')].find((p) => p.getBoundingClientRect().bottom > bar);
  const s = {
    words,
    language: song.language,
    cursor: startCursor(words, Number(top?.dataset.line ?? 0)),
    line: -1,
    failures: 0,
    stream,
    context,
    stopCapture: null,
    lock: navigator.wakeLock ? navigator.wakeLock.request('screen').catch(() => null) : Promise.resolve(null),
  };
  session = s;
  document.getElementById('sing').textContent = 'Stop';
  document.getElementById('sing').classList.add('singing');
  showStatus('Listening');
  document.addEventListener('visibilitychange', onHidden);
  context.onstatechange = () => {
    if (session === s && context.state !== 'running') stopSing('Audio interrupted');
  };
  paint(s);

  try {
    s.stopCapture = await startCapture(context, stream, (blob) => send(s, blob));
  } catch {
    if (session === s) stopSing('Audio failed');
    return;
  }
  if (session !== s) s.stopCapture();
}

export function stopSing(message = '') {
  generation++;
  if (!session) return;
  const s = session;
  session = null;
  s.stopCapture?.();
  s.context.close();
  s.stream.getTracks().forEach((track) => track.stop());
  s.lock.then((lock) => lock?.release());
  document.removeEventListener('visibilitychange', onHidden);
  document.getElementById('sing').textContent = 'Sing';
  document.getElementById('sing').classList.remove('singing');
  showStatus(message, MESSAGE_MS);
}

export function repaint() {
  if (session) paint(session);
}

function onHidden() {
  if (document.hidden) stopSing();
}

async function send(s, blob) {
  const form = new FormData();
  form.set('file', blob, 'chunk.wav');
  if (s.language) form.set('language', s.language);

  let res;
  try {
    res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'X-Password': localStorage.getItem(PASSWORD_KEY) ?? '' },
      body: form,
    });
  } catch {
    failed(s);
    return;
  }
  if (session !== s) return;
  if (res.status === 401) {
    localStorage.removeItem(PASSWORD_KEY);
    stopSing('Wrong password');
    return;
  }
  if (!res.ok) {
    console.warn('[sing]', res.status, await res.text());
    failed(s);
    return;
  }

  let text;
  try {
    ({ text } = await res.json());
  } catch {
    failed(s);
    return;
  }
  if (session !== s) return;
  s.failures = 0;
  const next = advance(s.words, s.cursor, text);
  if (next <= s.cursor) return;
  s.cursor = next;
  paint(s);
  if (currentLine(s.words, s.cursor) === s.words.at(-1).line) stopSing();
}

function failed(s) {
  if (session !== s) return;
  s.failures++;
  if (s.failures >= FAILURES_TO_STOP) stopSing('Transcription failed');
}

function paint(s) {
  const line = currentLine(s.words, s.cursor);
  for (const p of document.querySelectorAll('p.line')) {
    const n = Number(p.dataset.line);
    p.classList.toggle('sung', n < line);
  }
  if (line === s.line) return;
  s.line = line;
  const el = document.querySelector(`p.line[data-line="${line}"]`);
  scrollTo({
    top: scrollY + el.getBoundingClientRect().top - innerHeight * SCROLL_FROM_TOP,
    behavior: 'smooth',
  });
}

function showStatus(text, ms = 0) {
  const status = document.getElementById('status');
  clearTimeout(showStatus.timer);
  status.textContent = text;
  status.hidden = !text;
  if (text && ms) showStatus.timer = setTimeout(() => showStatus(''), ms);
}
```

Compared with the old file: `CHUNK_MS`, `recordChunk`, the recorder, the
timer, `lyrics`, `lyricLines` and `promptFor` are gone. The rest is
unchanged except the start order, `onstatechange`, `chunk.wav`, and the
`console.warn`.

- [ ] **Step 7: Check that nothing still uses removed names**

Run: `grep -rn "promptFor\|lyricLines\|PROMPT_WORDS\|CHUNK_MS\|recordChunk\|MediaRecorder" js test`
Expected: no output.

- [ ] **Step 8: Run all tests**

Run: `node --test`
Expected: all PASS.

- [ ] **Step 9: Desktop smoke check**

There is no `/transcribe` on the local server, so each call gets 404. That
proves windows are built and sent, and it tests the failure path.

1. Run `npm run serve` and open `http://localhost:8000` in desktop Chrome.
2. Open a song, tap **Sing**, type any password, and allow the mic.
3. In DevTools Network: a `transcribe` POST appears every 3 s. The first
   body is about 94 KB (3 s), the next ones about 188 KB (6 s).
4. In Console: one `[sing] 404 …` warning per call.
5. After the third failure, about 6–9 s after the start, Sing stops with
   "Transcription failed". The mic indicator in the tab goes off.
6. Tap **Sing** and then **Stop** at once. The mic indicator must go off,
   and no `transcribe` request appears afterwards.

- [ ] **Step 10: Commit**

```bash
git add js/capture-worklet.js js/capture.js js/sing.js js/align.js test/align.test.js
git commit -m "feat(sing): overlapping 6 s wav windows every 3 s, without the lyric prompt"
```

---

### Task 4: Phone test on a preview version

No code. The user does the phone part. Do not push to `main`.

- [ ] **Step 1: Upload a preview version**

Run: `cd worker && npx wrangler versions upload --message "sing buffer preview"`
Expected: a `Version Preview URL` like `https://<id>-jfavrites.sebastien-jeanfavre.workers.dev`.

- [ ] **Step 2: Hand the URL to the user with this checklist**

On the iPhone, open the preview URL, open a song with a repeated chorus and
a guitar solo, tap **Sing** (the preview asks for the password again), and
play the whole song. Check:

- Sing does not stop by itself in the first seconds.
- The lag feels shorter than in production.
- No sung words are lost.
- The cursor holds during the solo.
- The chorus does not jump ahead.
- Stop during the first second leaves the mic indicator off.
- A phone call or Siri during Sing stops it with "Audio interrupted".
- Optional: Safari Web Inspector shows no `[sing] 502` warnings.

- [ ] **Step 3: Record the result**

If all checks pass, ask the user whether to push to `main`, which deploys.
If recognition is worse than production, the spec's follow-up applies: send
the lyrics already sung as the prompt. Write that as a new small spec; do not
patch it in here.
