# Sing Word Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor the prediction at the exact time the last matched word was sung, from Whisper word timestamps, instead of the window cut time.

**Architecture:** The worker asks Infomaniak for `verbose_json` with word granularity and returns `{ text, words }`. `advance` takes the heard words as an array and also returns the index of the last matched heard word. `sing.js` turns that index into a time: cut time minus the audio left in the window after that word.

**Tech Stack:** Plain ES modules, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-15-sing-prediction-design.md`, rule 2, with this change: the anchor time is the end time of the last matched word, not the cut. The spike on 2026-10-15 showed Infomaniak returns `words: [{ start, end, word }]` only when `timestamp_granularities[]=word` is sent.

## Global Constraints

- `predict.js` does not change.
- No fallback when `words` is missing: worker and client deploy together.
- Commits: conventional, scope `sing`, `align` or `worker`, no attribution trailer.
- Comments: at most 3 lines, only for what the code cannot show.

## Review Focus

- A Whisper word that normalises to two words (`I'm` → `i`, `m`): both carry the same `end`, and the heard list lines up with what `advance` matches. Test in Task 3 (`heardWords`).
- A Whisper word that normalises to nothing (`...`): no entry, no shift of later indices. Same test.
- The earliest alignment: when the heard text repeats a word, `last` is the earliest heard index that completes the match, so the anchor is never later than the word. Test in Task 2.
- Infomaniak returns `data` as a JSON string: `words` must still come through. Test in Task 1.
- A window shorter than 6 s (the first windows): `wavSeconds` uses the blob size, not a constant. Test in Task 3.

---

### Task 1: Worker returns the words

**Files:**
- Modify: `worker/index.js`
- Test: `test/worker.test.js`

**Interfaces:**
- Produces: HTTP 200 body `{ text: string, words: [{ start, end, word }] }`.

- [ ] **Step 1: Change the tests**

In `test/worker.test.js`:

- In 'returns the text once the job succeeds', the expected body becomes `{ text: 'amazing grace', words: [] }`.
- In 'forwards the audio, language and prompt with the whisper model', replace the `response_format` line with:

```js
  assert.equal(sent.get('response_format'), 'verbose_json');
  assert.equal(sent.get('timestamp_granularities[]'), 'word');
```

- Replace the test 'accepts responses wrapped in result and data, and text as a JSON string' with:

```js
test('accepts responses wrapped in result and data, with the payload as a JSON string', async () => {
  mockFetch([
    { body: { result: 'success', data: { batch_id: 'b2' } } },
    { body: { result: 'success', data: { status: 'success', data: '{"text":"how sweet","words":[{"start":0,"end":0.4,"word":" how"}]}' } } },
  ]);
  const res = await worker.fetch(request(), env);
  assert.deepEqual(await res.json(), { text: 'how sweet', words: [{ start: 0, end: 0.4, word: ' how' }] });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/worker.test.js`
Expected: 3 FAIL (response_format, the two bodies).

- [ ] **Step 3: Change the worker**

In `worker/index.js`:

```js
    body.set('response_format', 'verbose_json');
    body.set('timestamp_granularities[]', 'word');
```

```js
      if (job.status === 'success') return reply(200, resultOf(job.data));
```

Replace `textOf` with:

```js
function resultOf(data) {
  const payload = typeof data === 'string' ? JSON.parse(data) : data;
  return { text: payload.text ?? '', words: payload.words ?? [] };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/worker.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add worker/index.js test/worker.test.js
git commit -m "feat(worker): return word timestamps from Infomaniak"
```

---

### Task 2: `advance` takes heard words and returns the last matched one

**Files:**
- Modify: `js/align.js`
- Test: `test/align.test.js`

**Interfaces:**
- Produces: `advance(words, cursor, heard: string[]) → { next: number, last: number }`. `last` is the index in `heard` of the last matched word, `-1` when nothing matched.

- [ ] **Step 1: Change the tests**

Every call `advance(X, Y, 'text')` becomes `advance(X, Y, normalise('text')).next`. Do it with:

```bash
sed -i '' -E "s/advance\(([a-z]+), ([0-9]+), ('[^']*')\)/advance(\1, \2, normalise(\3)).next/g" test/align.test.js
sed -i '' "s/advance(words, 0, tooLong)/advance(words, 0, normalise(tooLong)).next/" test/align.test.js
grep -c "normalise(" test/align.test.js   # 15 or more
```

Add one test:

```js
test('advance tells which heard word matched last, the earliest that completes the match', () => {
  const heard = normalise('la la amazing grace how sweet the sound sound sound');
  assert.deepEqual(advance(words, 0, heard), { next: 6, last: 7 });
  assert.deepEqual(advance(words, 0, normalise('hello there friends of mine')), { next: 0, last: -1 });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/align.test.js`
Expected: FAIL; `.next` of a number is `undefined`.

- [ ] **Step 3: Change `advance` and `lcs`**

```js
// Nobody sings 40 words in a 6 s window; longer text is Whisper hallucinating over the guitar.
export function advance(words, cursor, heard) {
  if (heard.length === 0 || heard.length > MAX_HEARD) return { next: cursor, last: -1 };

  const span = Math.ceil(heard.length * 1.5);
  const end = Math.min(words.length, cursor + LOOKAHEAD);
  let best = { count: 0, last: -1, heard: -1 };
  for (let start = Math.max(0, cursor - LOOKBACK); start < end; start++) {
    const slice = words.slice(start, start + span).map((w) => w.word);
    const { count, lastA, lastB } = lcs(heard, slice);
    if (count > best.count) best = { count, last: start + lastB, heard: lastA };
  }

  if (best.count < MIN_MATCH || best.count < heard.length * MIN_RATIO) return { next: cursor, last: -1 };
  return { next: Math.max(cursor, best.last + 1), last: best.heard };
}

// Longest common subsequence; lastA and lastB are the earliest indices at which the full count is reached.
function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  let i = n;
  while (i > 0 && dp[i - 1][m] === dp[n][m]) i--;
  let j = m;
  while (j > 0 && dp[n][j - 1] === dp[n][m]) j--;
  return { count: dp[n][m], lastA: i - 1, lastB: j - 1 };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/align.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/align.js test/align.test.js
git commit -m "feat(align): advance takes heard words and returns the last matched one"
```

---

### Task 3: Anchor at the word time in `sing.js`

**Files:**
- Modify: `js/capture.js`, `js/sing.js`
- Test: `test/capture.test.js`, `test/predict.test.js`

**Interfaces:**
- Consumes: `{ text, words }` from Task 1, `{ next, last }` from Task 2.
- Produces: `wavSeconds(blob)` in `capture.js`; `heardWords(words)` in `predict.js`.

- [ ] **Step 1: Write the failing tests**

Append to `test/capture.test.js`:

```js
test('wavSeconds reads the length of a window from the blob size', () => {
  assert.equal(wavSeconds(wav(new Float32Array(RATE * 3))), 3);
  assert.equal(wavSeconds(wav(new Float32Array(8000))), 0.5);
});
```

Add `wavSeconds` to the import at the top of the file.

Append to `test/predict.test.js`:

```js
test('heardWords expands each Whisper word into normalised words that keep its end time', () => {
  const heard = heardWords([
    { start: 0, end: 0.3, word: " I'm" },
    { start: 0.3, end: 0.5, word: ' ...' },
    { start: 0.5, end: 0.9, word: ' tired' },
  ]);
  assert.deepEqual(heard, [
    { word: 'i', end: 0.3 },
    { word: 'm', end: 0.3 },
    { word: 'tired', end: 0.9 },
  ]);
});
```

Add `heardWords` to the import from `../js/predict.js`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/capture.test.js test/predict.test.js`
Expected: both files fail to load (missing exports).

- [ ] **Step 3: Write `wavSeconds` and `heardWords`**

In `js/capture.js`, after `wav`:

```js
export function wavSeconds(blob) {
  return (blob.size - 44) / (2 * RATE);
}
```

In `js/predict.js`:

```js
export function heardWords(words) {
  return words.flatMap((w) => normalise(w.word).map((word) => ({ word, end: w.end })));
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/capture.test.js test/predict.test.js`
Expected: all pass.

- [ ] **Step 5: Wire `sing.js`**

Imports:

```js
import { buildWords, currentLine, advance, startCursor } from './align.js';
import { chordMap, predictLine, heardWords } from './predict.js';
import { startCapture, wavSeconds } from './capture.js';
```

Replace the end of `transcribe`:

```js
  let words;
  try {
    ({ words } = await res.json());
  } catch {
    failed(s);
    return;
  }
  if (session !== s) return;
  s.failures = 0;
  showStatus('Listening');
  const heard = heardWords(words);
  const { next, last } = advance(s.words, s.cursor, heard.map((h) => h.word));
  if (next <= s.cursor) return;
  s.cursor = next;
  const anchor = { t: t - (wavSeconds(blob) - heard[last].end) * 1000, chord: s.wordChord[next - 1] };
  s.first ??= anchor;
  s.last = anchor;
  show(s, currentLine(s.words, next));
  if (currentLine(s.words, s.cursor) === s.words.at(-1).line) stopSing();
```

- [ ] **Step 6: Run the whole suite**

Run: `node --test`
Expected: 76 pass.

- [ ] **Step 7: Smoke test in headless Chrome**

Run `smoke7.mjs` from the scratchpad with the fake fetch changed to return `{ text, words }` where `words` is the line split on spaces, each with `end: 5.5`. Expected: no exception, `shown` only goes up.

- [ ] **Step 8: Commit**

```bash
git add js/capture.js js/predict.js js/sing.js test/capture.test.js test/predict.test.js
git commit -m "feat(sing): anchor the prediction at the time of the last matched word"
```

---

### Task 4: Phone preview with the debug patch (throwaway)

**Files:**
- Scratchpad only: `add_debug3.py` from `add_debug2.py`. Never commit the patched `js/sing.js`.

- [ ] **Step 1: Update the patch**

In the copy, change the `res` replacement so it matches the new code:

```python
rep("  const heard = heardWords(words);\n  const { next, last } = advance(s.words, s.cursor, heard.map((h) => h.word));\n",
    "  const heard = heardWords(words);\n  const { next, last } = advance(s.words, s.cursor, heard.map((h) => h.word));\n  debug({ ev: 'res', kb: size, ms: Date.now() - sentAt, from: s.cursor, to: Math.max(next, s.cursor), text: heard.map((h) => h.word).join(' ') });\n")
```

and remove the old `res` replacement that mentions `const next = advance(s.words, s.cursor, text);`. In the `anchor` event, replace `lag: Math.round(performance.now() - t)` with `lag: Math.round(performance.now() - anchor.t)`.

- [ ] **Step 2: Apply, upload, revert**

```bash
python3 "$SCRATCH/add_debug3.py"
grep -c "debug(" js/sing.js        # 11
(cd worker && npx wrangler versions upload 2>&1 | grep "Preview URL")
git checkout js/sing.js
```

- [ ] **Step 3: Phone test (owner)**

Same songs. In the log, `lag` is now the real age of the anchor (3–6 s). Compare the `show` times with the previous log.
