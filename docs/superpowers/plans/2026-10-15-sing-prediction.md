# Sing Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Between transcription results, move the highlighted line forward at the measured chord speed of the song.

**Architecture:** A new pure module `js/predict.js` maps words and lines to global chord indices and turns two anchors into a predicted line. `js/sing.js` records an anchor per cursor move, runs a 250 ms tick, and paints a forward-only `shown` line.

**Tech Stack:** Plain ES modules, `node --test`. No build step.

**Spec:** `docs/superpowers/specs/2026-10-15-sing-prediction-design.md`

## Global Constraints

- Capture (`js/capture.js`), matching (`js/align.js`) and the worker do not change.
- Constants: `MIN_SPAN_MS = 10000`, `MAX_AHEAD = 2`, `TICK_MS = 250`.
- The confirmed line passed to `predictLine` is `currentLine(words, cursor)`, never `shown`.
- `shown` never decreases.
- Commits: conventional, scope `sing`, no attribution trailer.
- Comments: at most 3 lines, only for what the code cannot show.

## Review Focus

- A sheet line that puts a chord in the middle of a word (`a[F]gain`): the word takes the chord before it, the word count stays equal to `buildWords`. Test in Task 1.
- Decomposed accents in a sheet (`e` + combining mark): `chordMap` and `buildWords` must still count the same words. Covered by the all-songs test in Task 1; the regex includes `\p{M}`.
- Two anchors with the same chord (cursor moved inside one chord): speed 0, the line holds, no NaN. Test in Task 2.
- A result that arrives after `stopSing`: no anchor, no paint. The existing `session !== s` guard covers it; checked by hand in Task 3.
- `repaint()` from a transpose change while singing: paints `shown`, not the confirmed line. Checked by hand in Task 3.

---

### Task 1: `chordMap`

**Files:**
- Create: `js/predict.js`
- Test: `test/predict.test.js`

**Interfaces:**
- Consumes: `normalise` from `js/align.js`, `parse` from `js/chordpro.js`.
- Produces: `chordMap(song) → { wordChord: number[], lineStart: number[] }`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from '../js/chordpro.js';
import { buildWords } from '../js/align.js';
import { chordMap } from '../js/predict.js';

const song = parse(`{comment: Intro}
| [C] [G] |

{comment: Verse}
Oh [C]the sun is [G]up
[C]Now we [G]sing a[F]gain
No chords on this one
[C]Last [G]line
`);

// Chords: intro C=0 G=1, line 1 C=2 G=3, line 2 C=4 G=5 F=6, line 4 C=7 G=8.
test('each word takes the chord at or before it, a line without chords keeps the previous one', () => {
  const { wordChord } = chordMap(song);
  assert.deepEqual(wordChord, [
    1, 2, 2, 2, 3,
    4, 4, 5, 5,
    6, 6, 6, 6, 6,
    7, 8,
  ]);
});

test('the first word of a song before any chord takes chord 0', () => {
  const { wordChord } = chordMap(parse('Hey [C]you'));
  assert.deepEqual(wordChord, [0, 0]);
});

test('lineStart is the first chord of each line; a line without chords takes the count so far', () => {
  assert.deepEqual(chordMap(song).lineStart, [0, 2, 4, 7, 7]);
  assert.deepEqual(chordMap(parse('[C]a\nb')).lineStart, [0, 1]);
});

test('chordMap gives one chord per word for every song in songs/', () => {
  for (const file of readdirSync('songs').filter((f) => f.endsWith('.chordpro'))) {
    const s = parse(readFileSync(`songs/${file}`, 'utf8'));
    assert.equal(chordMap(s).wordChord.length, buildWords(s).length, file);
  }
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/predict.test.js`
Expected: FAIL, `Cannot find module '../js/predict.js'`.

- [ ] **Step 3: Write `chordMap`**

```js
import { normalise } from './align.js';

const WORD_RE = /[\p{L}\p{N}\p{M}]+/gu;

export function chordMap(song) {
  const wordChord = [];
  const lineStart = [];
  let count = 0;
  for (const section of song.sections) {
    for (const { lyric, chords } of section.lines) {
      lineStart.push(count);
      for (const m of lyric.matchAll(WORD_RE)) {
        let chord = count - 1;
        for (const c of chords) if (c.index <= m.index) chord++;
        for (const _ of normalise(m[0])) wordChord.push(Math.max(0, chord));
      }
      count += chords.length;
    }
  }
  return { wordChord, lineStart };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/predict.test.js`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add js/predict.js test/predict.test.js
git commit -m "feat(sing): map words and lines to chord indices"
```

---

### Task 2: `predictLine`

**Files:**
- Modify: `js/predict.js`
- Test: `test/predict.test.js`

**Interfaces:**
- Consumes: `lineStart` from Task 1.
- Produces: `predictLine(lineStart, first, last, now, line) → number`. `first` and `last` are `{ t, chord }` or `null`; `t` and `now` in ms.

- [ ] **Step 1: Write the failing tests**

Append to `test/predict.test.js`:

```js
import { predictLine } from '../js/predict.js';

// Lines start at chords 0, 4, 8, 14, 18, 22. Anchors give 1 chord per second.
const starts = [0, 4, 8, 14, 18, 22];
const first = { t: 0, chord: 0 };
const last = { t: 10000, chord: 10 };

test('no prediction without anchors or with anchors less than 10 s apart', () => {
  assert.equal(predictLine(starts, null, null, 20000, 2), 2);
  assert.equal(predictLine(starts, first, { t: 9000, chord: 9 }, 20000, 2), 2);
  assert.equal(predictLine(starts, first, last, 10000, 2), 2);
});

test('the line moves when the predicted chord reaches the next line', () => {
  assert.equal(predictLine(starts, first, last, 13000, 2), 2);
  assert.equal(predictLine(starts, first, last, 14000, 2), 3);
});

test('the prediction stops MAX_AHEAD lines past the confirmed line and at the last line', () => {
  assert.equal(predictLine(starts, first, last, 110000, 2), 4);
  assert.equal(predictLine(starts, first, last, 110000, 4), 5);
  assert.equal(predictLine(starts, first, last, 110000, 5), 5);
});

test('two anchors on the same chord hold the line', () => {
  assert.equal(predictLine(starts, { t: 0, chord: 9 }, { t: 10000, chord: 9 }, 60000, 2), 2);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/predict.test.js`
Expected: the 4 new tests FAIL with `predictLine is not a function`.

- [ ] **Step 3: Write `predictLine`**

Append to `js/predict.js`:

```js
const MIN_SPAN_MS = 10000;
const MAX_AHEAD = 2;

export function predictLine(lineStart, first, last, now, line) {
  if (!first || last.t - first.t < MIN_SPAN_MS) return line;
  const speed = (last.chord - first.chord) / (last.t - first.t);
  const chord = last.chord + speed * (now - last.t);
  const cap = Math.min(line + MAX_AHEAD, lineStart.length - 1);
  let shown = line;
  while (shown < cap && lineStart[shown + 1] <= chord) shown++;
  return shown;
}
```

Move the two constants to the top of the file, next to `WORD_RE`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/predict.test.js`
Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
git add js/predict.js test/predict.test.js
git commit -m "feat(sing): predict the line from two anchors and the chord speed"
```

---

### Task 3: Wire the prediction into `sing.js`

**Files:**
- Modify: `js/sing.js`

**Interfaces:**
- Consumes: `chordMap`, `predictLine` from `js/predict.js`.

- [ ] **Step 1: Import and constant**

At the top of `js/sing.js`:

```js
import { buildWords, currentLine, advance, startCursor } from './align.js';
import { chordMap, predictLine } from './predict.js';
import { startCapture } from './capture.js';
```

After `const SLOW_MS = 6000;` add `const TICK_MS = 250;`.

- [ ] **Step 2: Session fields and tick**

Replace the session literal in `startSing`:

```js
  const bar = document.getElementById('bar').offsetHeight;
  const top = [...document.querySelectorAll('p.line')].find((p) => p.getBoundingClientRect().bottom > bar);
  const cursor = startCursor(words, Number(top?.dataset.line ?? 0));
  const s = {
    words,
    ...chordMap(song),
    language: song.language,
    cursor,
    shown: currentLine(words, cursor),
    first: null,
    last: null,
    tick: 0,
    failures: 0,
    inFlight: 0,
    stream,
    context,
    stopCapture: null,
    lock: navigator.wakeLock ? navigator.wakeLock.request('screen').catch(() => null) : Promise.resolve(null),
  };
  session = s;
  s.tick = setInterval(
    () => show(s, predictLine(s.lineStart, s.first, s.last, performance.now(), currentLine(s.words, s.cursor))),
    TICK_MS,
  );
```

Keep `paint(s);` where it is, after `document.addEventListener('visibilitychange', onHidden);`.

Change the window callback:

```js
      (blob) => s.inFlight < MAX_IN_FLIGHT && send(s, blob, performance.now()),
```

In `stopSing`, after `s.stopCapture?.();` add `clearInterval(s.tick);`.

- [ ] **Step 3: Carry the window time to the result**

```js
async function send(s, blob, t) {
  s.inFlight++;
  const slow = setTimeout(() => session === s && showStatus('Slow transcription…'), SLOW_MS);
  try {
    await transcribe(s, blob, t);
  } finally {
    s.inFlight--;
    clearTimeout(slow);
  }
}

async function transcribe(s, blob, t) {
```

Replace the end of `transcribe`:

```js
  const next = advance(s.words, s.cursor, text);
  if (next <= s.cursor) return;
  s.cursor = next;
  const anchor = { t, chord: s.wordChord[next - 1] };
  s.first ??= anchor;
  s.last = anchor;
  show(s, currentLine(s.words, next));
  if (currentLine(s.words, s.cursor) === s.words.at(-1).line) stopSing();
```

- [ ] **Step 4: `show` and `paint`**

Replace `paint`:

```js
function show(s, line) {
  if (line <= s.shown) return;
  s.shown = line;
  paint(s);
}

function paint(s) {
  for (const p of document.querySelectorAll('p.line')) {
    p.classList.toggle('sung', Number(p.dataset.line) < s.shown);
  }
  const el = document.querySelector(`p.line[data-line="${s.shown}"]`);
  scrollTo({
    top: scrollY + el.getBoundingClientRect().top - innerHeight * SCROLL_FROM_TOP,
    behavior: 'smooth',
  });
}
```

`s.line` is gone; `shown` replaces it.

- [ ] **Step 5: Check by reading**

- `grep -n "s.line\b" js/sing.js` prints nothing.
- A result after `stopSing`: `transcribe` returns at `if (session !== s) return;` before the anchor. The tick was cleared, so no paint.
- `repaint()` calls `paint(session)`, which uses `shown`.

- [ ] **Step 6: Run the whole suite**

Run: `node --test`
Expected: 73 pass (65 before plus 8).

- [ ] **Step 7: Smoke test in headless Chrome**

Run the existing smoke script from the scratchpad against `python3 -m http.server 8765` as in the buffer plan (fake mic, port 9333). Expected: Sing starts, sends windows, no console error from `predict.js` or `sing.js`. Stop when the page shows "Listening".

- [ ] **Step 8: Commit**

```bash
git add js/sing.js
git commit -m "feat(sing): move the shown line between results at the chord speed"
```

---

### Task 4: Phone preview with the debug patch (throwaway)

**Files:**
- Scratchpad only: `add_debug.py` copied to `add_debug2.py`. Never commit the patched `js/sing.js`.

- [ ] **Step 1: Update the patch for the new code**

Copy `add_debug.py` to `add_debug2.py` and change these replacements:

- `"      (blob) => s.inFlight < MAX_IN_FLIGHT && send(s, blob),\n"` becomes
  `"      (blob) => s.inFlight < MAX_IN_FLIGHT && send(s, blob, performance.now()),\n"`, with the same `debug({ ev: 'skip', ... })` branch.
- After the `res` event, add one more `rep`:

```python
rep("  s.first ??= anchor;\n  s.last = anchor;\n",
    "  s.first ??= anchor;\n  s.last = anchor;\n  debug({ ev: 'anchor', chord: anchor.chord, lag: Math.round(performance.now() - t), speed: s.first === anchor ? 0 : +((s.last.chord - s.first.chord) / (s.last.t - s.first.t) * 1000).toFixed(2) });\n")
rep("  if (line <= s.shown) return;\n  s.shown = line;\n",
    "  if (line <= s.shown) return;\n  s.shown = line;\n  debug({ ev: 'show', line, confirmed: currentLine(s.words, s.cursor) });\n")
```

- [ ] **Step 2: Apply, upload a preview, revert**

```bash
python3 "$SCRATCH/add_debug2.py"
grep -c "debug(" js/sing.js        # expect 10 or more
npx wrangler versions upload 2>&1 | tail -5
git checkout js/sing.js
```

Give the preview URL (`https://<id8>-jfavrites.sebastien-jeanfavre.workers.dev`) to the owner.

- [ ] **Step 3: Phone test (owner)**

- L'horloge tourne: the line moves during "dam dam déo".
- Let It Be: lines with many chords.
- Read the log: `anchor` speed should settle after 20–30 s; `show` events should come between `res` events, not only with them.
- Tune `MAX_AHEAD`, or subtract `HOP_MS / 2` from `t`, only if the log shows the need.
