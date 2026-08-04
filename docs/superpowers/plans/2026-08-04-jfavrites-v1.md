# JFavrites v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app that shows chords over lyrics for a curated songbook, transposes to any key, and shares a song-plus-key as a single link.

**Architecture:** No server, no database, no build step. Song files are ChordPro text in `songs/`, listed by `songs/index.json`. The browser fetches a song file, parses it to a structure, and renders chord/lyric chunks. All state lives in the URL hash (`#slug/+2`), so a share link carries the key. A separate Claude Code skill writes song files offline; the app never scrapes anything.

**Tech Stack:** Vanilla ES modules, no dependencies, no bundler. `node --test` for unit tests. `python3 -m http.server` locally. Netlify Drop for hosting.

## Global Constraints

- **No dependencies.** No npm packages in the app or the tests. Node built-ins only.
- **No build step.** Files served are files written. ES modules loaded natively via `<script type="module">`.
- **Song files must be valid ChordPro.** No invented directives. Custom metadata uses `{meta: name value}`.
- **Only these directives are read:** `{title:}`, `{artist:}`, `{key:}`, `{comment:}`, `{meta: style ...}`. Unrecognised directives are ignored, never errors.
- **No defensive error handling.** Two user-facing failure messages exist and no others: `Could not load songbook.` and `Song not found.` No retries, no logging, no fallbacks. This bars handling of failures that have not been shown to happen; it does not bar guards that keep the app correct, such as ignoring a fetch whose result arrives after the route has already changed.
- **No DOM access in `transpose.js` or `chordpro.js`.** They must import and run under `node --test`. `render.js` may use `document` inside functions but never at module top level.
- **Text content is set via `textContent`, never `innerHTML`.**
- **Sample song must be public domain.** Amazing Grace (Traditional) is the fixture, so no copyrighted lyrics enter the repo or the tests.
- **Node 18 or newer** — `node:test` is required. Check with `node --version` before starting.
- **Everything runs from the repo root**, `/Users/sebastienjeanfavre/dev/ideas/JFavrites`.

## Scope discipline

This is a prototype for playing music with family. Four tasks build working
software; two finish it. If a step feels like it is protecting against something
that has not happened yet, it does not belong here.

---

### Task 1: Transposition engine

The only module with real musical logic. Pure functions, no DOM, tested thoroughly — this is where a bug is both likely and invisible.

**Files:**
- Create: `package.json`
- Create: `js/transpose.js`
- Test: `test/transpose.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `transposeChord(chord: string, semitones: number, preferFlats: boolean): string` — shifts a chord's root and slash bass, preserves quality text, returns the input unchanged if it does not match the chord grammar
  - `transposeKey(key: string, semitones: number): string` — shifts a key name like `"C"` or `"Am"`, choosing the conventional spelling for the resulting key
  - `prefersFlats(key: string): boolean` — true for keys conventionally written with flats

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "jfavrites",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 8000"
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `test/transpose.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { transposeChord, transposeKey, prefersFlats } from '../js/transpose.js';

test('prefersFlats identifies the conventionally flat keys', () => {
  assert.equal(prefersFlats('F'), true);
  assert.equal(prefersFlats('Bb'), true);
  assert.equal(prefersFlats('Dm'), true);
  assert.equal(prefersFlats('G'), false);
  assert.equal(prefersFlats('Am'), false);
});

test('transposeKey moves major and minor keys', () => {
  assert.equal(transposeKey('C', 0), 'C');
  assert.equal(transposeKey('C', 2), 'D');
  assert.equal(transposeKey('C', 1), 'Db');
  assert.equal(transposeKey('Am', 3), 'Cm');
  assert.equal(transposeKey('G', -1), 'Gb');
});

test('transposeKey keeps sharp spellings where they are conventional', () => {
  assert.equal(transposeKey('Am', 4), 'C#m');
  assert.equal(transposeKey('Em', 2), 'F#m');
});

test('transposeChord shifts the root and keeps the quality text', () => {
  assert.equal(transposeChord('C', 2, false), 'D');
  assert.equal(transposeChord('Am', 3, false), 'Cm');
  assert.equal(transposeChord('C#m7', 3, false), 'Em7');
  assert.equal(transposeChord('Fsus4', 2, false), 'Gsus4');
  assert.equal(transposeChord('Bbmaj7', 1, false), 'Bmaj7');
  assert.equal(transposeChord('Gdim', 1, false), 'G#dim');
});

test('transposeChord shifts slash bass notes too', () => {
  assert.equal(transposeChord('C#m7/G#', 3, false), 'Em7/B');
  assert.equal(transposeChord('C/E', 5, false), 'F/A');
  assert.equal(transposeChord('Bb/D', 2, false), 'C/E');
});

test('spelling follows the preferFlats flag', () => {
  assert.equal(transposeChord('C', 1, true), 'Db');
  assert.equal(transposeChord('C', 1, false), 'C#');
});

test('transposition wraps around the octave in both directions', () => {
  assert.equal(transposeChord('B', 1, false), 'C');
  assert.equal(transposeChord('C', -1, false), 'B');
  assert.equal(transposeChord('C', 12, false), 'C');
  assert.equal(transposeChord('C', -13, false), 'B');
});

test('every root shifts correctly across all twelve semitones', () => {
  const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let i = 0; i < 12; i++) {
    for (let n = 0; n < 12; n++) {
      assert.equal(transposeChord(roots[i], n, false), roots[(i + n) % 12]);
    }
  }
});

test('transposing up then back down returns the original chord', () => {
  for (const n of [1, 2, 5, 7, 11]) {
    const up = transposeChord('C', n, prefersFlats(transposeKey('C', n)));
    assert.equal(transposeChord(up, -n, prefersFlats('C')), 'C');
  }
});

test('chords that do not match the grammar pass through unchanged', () => {
  assert.equal(transposeChord('N.C.', 2, false), 'N.C.');
  assert.equal(transposeChord('%', 2, false), '%');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/transpose.js`

- [ ] **Step 4: Write the implementation**

Create `js/transpose.js`:

```js
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Keys a musician conventionally writes with flats. Everything else takes sharps.
const FLAT_KEYS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm',
]);

// root, accidental, quality/extension, optional slash bass
const CHORD_RE = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/;
const KEY_RE = /^([A-G])([#b]?)(m?)$/;

const mod12 = (n) => ((n % 12) + 12) % 12;

function pitchOf(letter, accidental) {
  return mod12(PITCH[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
}

export function prefersFlats(key) {
  return FLAT_KEYS.has(key);
}

export function transposeChord(chord, semitones, preferFlats) {
  const m = CHORD_RE.exec(chord);
  if (!m) return chord;
  const [, root, acc, quality, bassRoot, bassAcc] = m;
  const names = preferFlats ? FLAT : SHARP;
  let out = names[mod12(pitchOf(root, acc) + semitones)] + quality;
  if (bassRoot) out += '/' + names[mod12(pitchOf(bassRoot, bassAcc) + semitones)];
  return out;
}

export function transposeKey(key, semitones) {
  const m = KEY_RE.exec(key);
  if (!m) return key;
  const [, root, acc, minor] = m;
  const pitch = mod12(pitchOf(root, acc) + semitones);
  // Pick the spelling by asking which name the resulting key itself uses.
  const flatName = FLAT[pitch] + minor;
  return FLAT_KEYS.has(flatName) ? flatName : SHARP[pitch] + minor;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 10 tests, 0 failures

- [ ] **Step 6: Commit**

```bash
git add package.json js/transpose.js test/transpose.test.js
git commit -m "Add transposition engine

Chord and key transposition with enharmonic spelling chosen by the target
key, so transposing up a semitone from C yields Db rather than C#."
```

---

### Task 2: ChordPro parser

Turns song text into the structure the renderer consumes.

**Files:**
- Create: `js/chordpro.js`
- Create: `songs/amazing-grace.chordpro`
- Test: `test/chordpro.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `parse(text: string): Song`
  - `Song` = `{ title: string, artist: string, key: string, styles: string[], sections: Section[] }`
  - `Section` = `{ label: string, lines: Line[] }`
  - `Line` = `{ lyric: string, chords: Chord[] }`
  - `Chord` = `{ index: number, chord: string }` where `index` is a character offset into `lyric`

- [ ] **Step 1: Create the sample song**

Amazing Grace is public domain, so it can live in the repo and in tests without a copyright question. Create `songs/amazing-grace.chordpro`:

```
{title: Amazing Grace}
{artist: Traditional}
{key: G}
{meta: style traditional}
{meta: style singalong}

{comment: Verse 1}
A[G]mazing grace how [G7]sweet the [C]sound
That [G]saved a wretch like [Em]me [D]
I [G]once was lost but [G7]now am [C]found
Was [G]blind but [D]now I [G]see

{comment: Verse 2}
'Twas [G]grace that taught my [G7]heart to [C]fear
And [G]grace my fears re[Em]lieved [D]
How [G]precious did that [G7]grace ap[C]pear
The [G]hour I [D]first be[G]lieved
```

- [ ] **Step 2: Write the failing tests**

Create `test/chordpro.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../js/chordpro.js';

const SONG = `{title: Amazing Grace}
{artist: Traditional}
{key: G}
{meta: style traditional}
{meta: style singalong}

{comment: Verse 1}
A[G]mazing grace how [G7]sweet the [C]sound
`;

test('parses the metadata directives', () => {
  const s = parse(SONG);
  assert.equal(s.title, 'Amazing Grace');
  assert.equal(s.artist, 'Traditional');
  assert.equal(s.key, 'G');
});

test('repeated meta style directives collect into a list', () => {
  assert.deepEqual(parse(SONG).styles, ['traditional', 'singalong']);
});

test('chords carry their character index into the lyric', () => {
  const line = parse(SONG).sections[0].lines[0];
  assert.equal(line.lyric, 'Amazing grace how sweet the sound');
  assert.deepEqual(line.chords, [
    { index: 1, chord: 'G' },
    { index: 18, chord: 'G7' },
    { index: 28, chord: 'C' },
  ]);
});

test('comment directives label a section', () => {
  const s = parse(SONG);
  assert.equal(s.sections.length, 1);
  assert.equal(s.sections[0].label, 'Verse 1');
});

test('a blank line starts a new unlabelled section', () => {
  const s = parse('{key: C}\n[C]one\n\n[G]two\n');
  assert.equal(s.sections.length, 2);
  assert.equal(s.sections[0].label, '');
  assert.equal(s.sections[0].lines[0].lyric, 'one');
  assert.equal(s.sections[1].lines[0].lyric, 'two');
});

test('chord-only lines preserve the spacing between chords', () => {
  const line = parse('{key: C}\n[C]    [G]\n').sections[0].lines[0];
  assert.equal(line.lyric, '    ');
  assert.deepEqual(line.chords, [
    { index: 0, chord: 'C' },
    { index: 4, chord: 'G' },
  ]);
});

test('unknown directives are ignored rather than treated as errors', () => {
  const s = parse('{title: X}\n{tempo: 120}\n{key: C}\n[C]hi\n');
  assert.equal(s.title, 'X');
  assert.equal(s.sections.length, 1);
  assert.equal(s.sections[0].lines[0].lyric, 'hi');
});

test('key falls back to the first chord when the directive is absent', () => {
  assert.equal(parse('{title: X}\n[Am7]hello [C]world\n').key, 'Am');
  assert.equal(parse('{title: X}\n[Cmaj7]hello\n').key, 'C');
  assert.equal(parse('{title: X}\n[Bb]hello\n').key, 'Bb');
});

test('key falls back to C when there are no chords at all', () => {
  assert.equal(parse('{title: X}\nno chords here\n').key, 'C');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/chordpro.js`

- [ ] **Step 4: Write the implementation**

Create `js/chordpro.js`:

```js
const DIRECTIVE_RE = /^\{\s*([a-z_]+)\s*:\s*(.*?)\s*\}$/i;
const CHORD_TOKEN_RE = /\[([^\]]+)\]/g;
// Root plus 'm', but not the 'm' that starts 'maj'.
const CHORD_TO_KEY_RE = /^([A-G][#b]?)(m(?!aj))?/;

export function parse(text) {
  const song = { title: '', artist: '', key: '', styles: [], sections: [] };
  let section = null;

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();

    if (trimmed === '') {
      section = null;
      continue;
    }

    const directive = DIRECTIVE_RE.exec(trimmed);
    if (directive) {
      applyDirective(song, directive[1].toLowerCase(), directive[2], (label) => {
        section = { label, lines: [] };
        song.sections.push(section);
      });
      continue;
    }

    if (!section) {
      section = { label: '', lines: [] };
      song.sections.push(section);
    }
    section.lines.push(parseLine(raw));
  }

  if (!song.key) song.key = firstChordAsKey(song);
  return song;
}

function applyDirective(song, name, value, startSection) {
  if (name === 'title') song.title = value;
  else if (name === 'artist') song.artist = value;
  else if (name === 'key') song.key = value;
  else if (name === 'comment' || name === 'c') startSection(value);
  else if (name === 'meta') {
    const [metaName, ...rest] = value.split(/\s+/);
    if (metaName === 'style' && rest.length) song.styles.push(rest.join(' '));
  }
}

function parseLine(raw) {
  const chords = [];
  let lyric = '';
  let cursor = 0;
  CHORD_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = CHORD_TOKEN_RE.exec(raw)) !== null) {
    lyric += raw.slice(cursor, match.index);
    chords.push({ index: lyric.length, chord: match[1] });
    cursor = match.index + match[0].length;
  }
  lyric += raw.slice(cursor);
  return { lyric, chords };
}

function firstChordAsKey(song) {
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.chords.length) {
        const m = CHORD_TO_KEY_RE.exec(line.chords[0].chord);
        if (m) return m[1] + (m[2] ? 'm' : '');
      }
    }
  }
  return 'C';
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — transpose and chordpro tests all green

- [ ] **Step 6: Commit**

```bash
git add js/chordpro.js test/chordpro.test.js songs/amazing-grace.chordpro
git commit -m "Add ChordPro parser and a public-domain sample song

Falls back to the first chord when {key:} is missing, since enharmonic
spelling depends on it and scraped tonality fields are unreliable."
```

---

### Task 3: Renderer

Turns a parsed song plus a semitone offset into DOM. `splitLine` is exported and tested because its index arithmetic is where a chord silently lands one character off — the one rendering bug that survives a visual check.

**Files:**
- Create: `js/render.js`
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: `transposeChord`, `transposeKey`, `prefersFlats` from `js/transpose.js`; the `Song` shape from `js/chordpro.js`
- Produces:
  - `renderSong(song: Song, semitones: number): DocumentFragment`
  - `splitLine(line: Line): Chunk[]` where `Chunk` = `{ chord: string, text: string }`

- [ ] **Step 1: Write the failing tests**

Create `test/render.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLine } from '../js/render.js';

test('a line with no chords is a single chordless chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'hello world', chords: [] }),
    [{ chord: '', text: 'hello world' }],
  );
});

test('text before the first chord becomes a chordless chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'Amazing', chords: [{ index: 1, chord: 'G' }] }),
    [{ chord: '', text: 'A' }, { chord: 'G', text: 'mazing' }],
  );
});

test('a chord at index zero produces no leading chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'hello', chords: [{ index: 0, chord: 'C' }] }),
    [{ chord: 'C', text: 'hello' }],
  );
});

test('each chunk runs to the next chord', () => {
  assert.deepEqual(
    splitLine({
      lyric: 'ab cd ef',
      chords: [{ index: 0, chord: 'C' }, { index: 3, chord: 'G' }],
    }),
    [{ chord: 'C', text: 'ab ' }, { chord: 'G', text: 'cd ef' }],
  );
});

test('a chord at the end of the line yields an empty trailing chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'hi ', chords: [{ index: 3, chord: 'D' }] }),
    [{ chord: '', text: 'hi ' }, { chord: 'D', text: '' }],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/render.js`

- [ ] **Step 3: Write the implementation**

Create `js/render.js`:

```js
import { transposeChord, transposeKey, prefersFlats } from './transpose.js';

export function splitLine(line) {
  const { lyric, chords } = line;
  if (chords.length === 0) return [{ chord: '', text: lyric }];

  const chunks = [];
  if (chords[0].index > 0) {
    chunks.push({ chord: '', text: lyric.slice(0, chords[0].index) });
  }
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].index : lyric.length;
    chunks.push({ chord: c.chord, text: lyric.slice(c.index, end) });
  });
  return chunks;
}

export function renderSong(song, semitones) {
  const flats = prefersFlats(transposeKey(song.key, semitones));
  const frag = document.createDocumentFragment();

  for (const section of song.sections) {
    const el = document.createElement('section');
    if (section.label) {
      const h = document.createElement('h2');
      h.textContent = section.label;
      el.append(h);
    }
    for (const line of section.lines) {
      el.append(renderLine(line, semitones, flats));
    }
    frag.append(el);
  }
  return frag;
}

function renderLine(line, semitones, flats) {
  const p = document.createElement('p');
  p.className = 'line';
  for (const chunk of splitLine(line)) {
    const span = document.createElement('span');
    span.className = 'chunk';

    const chord = document.createElement('b');
    chord.className = 'chord';
    chord.textContent = chunk.chord ? transposeChord(chunk.chord, semitones, flats) : '';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = chunk.text;

    span.append(chord, text);
    p.append(span);
  }
  return p;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all three test files green

- [ ] **Step 5: Commit**

```bash
git add js/render.js test/render.test.js
git commit -m "Add chunk renderer

Each chord and its slice of lyric form one inline-block chunk, so lines
reflow on a narrow screen instead of breaking chord alignment."
```

---

### Task 4: The app

Everything the browser loads. One task, because there is no point at which the HTML is worth reviewing without the JavaScript that drives it.

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `songs/index.json`
- Create: `js/app.js`

**Interfaces:**
- Consumes: `parse`, `renderSong`, `transposeKey` from the previous tasks
- Produces: the working app

- [ ] **Step 1: Create the song index**

Create `songs/index.json`:

```json
[
  {
    "slug": "amazing-grace",
    "title": "Amazing Grace",
    "artist": "Traditional",
    "key": "G",
    "styles": ["traditional", "singalong"]
  }
]
```

- [ ] **Step 2: Create the page shell**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1a1a1a">
<title>JFavrites</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header id="bar">
  <a id="back" href="#" hidden aria-label="Back to the songbook">&lsaquo;</a>
  <h1 id="heading">JFavrites</h1>
  <div id="controls" hidden>
    <button id="down" type="button" aria-label="Transpose down">&minus;</button>
    <span id="key"></span>
    <button id="up" type="button" aria-label="Transpose up">+</button>
    <button id="share" type="button">Share</button>
  </div>
</header>
<main id="main"></main>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create the stylesheet**

Create `styles.css`:

```css
:root {
  color-scheme: light dark;
  --pad: 1rem;
  --rule: rgba(128, 128, 128, 0.3);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font: 16px/1.5 system-ui, -apple-system, sans-serif;
}

#bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem var(--pad);
  background: Canvas;
  border-bottom: 1px solid var(--rule);
}

#back {
  padding: 0 0.3rem;
  font-size: 1.5rem;
  line-height: 1;
  color: inherit;
  text-decoration: none;
}

#heading {
  flex: 1;
  margin: 0;
  font-size: 1.05rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#controls {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

#key {
  min-width: 2.5rem;
  text-align: center;
  font-weight: 700;
}

button {
  font: inherit;
  min-width: 2.4rem;
  min-height: 2.4rem;
  border: 1px solid var(--rule);
  border-radius: 0.4rem;
  background: transparent;
  color: inherit;
}

main { padding: var(--pad); }

.songbook {
  list-style: none;
  margin: 0;
  padding: 0;
}

.songbook a {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--rule);
}

.songbook span {
  font-size: 0.85rem;
  opacity: 0.65;
}

h2 {
  margin: 1.4rem 0 0.4rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.55;
}

.line { margin: 0 0 0.4rem; }

.chunk {
  display: inline-block;
  vertical-align: bottom;
}

.chord {
  display: block;
  min-height: 1.25em;
  font-size: 0.8rem;
  line-height: 1.25;
  font-weight: 700;
  color: #b4531f;
}

.text { white-space: pre-wrap; }

@media (prefers-color-scheme: dark) {
  .chord { color: #f0a35e; }
}
```

Two lines carry the whole layout. `min-height` on `.chord` reserves the chord row even in chunks without a chord, which keeps lyric baselines aligned across a line. `pre-wrap` on `.text` preserves the spaces that carry chord spacing while still letting a long chordless chunk wrap.

- [ ] **Step 4: Write the app module**

Create `js/app.js`:

```js
import { parse } from './chordpro.js';
import { renderSong } from './render.js';
import { transposeKey } from './transpose.js';

const main = document.getElementById('main');
const heading = document.getElementById('heading');
const controls = document.getElementById('controls');
const back = document.getElementById('back');
const keyEl = document.getElementById('key');
const shareBtn = document.getElementById('share');

// Keep the parsed song so pressing + does not refetch on every press.
let loaded = { slug: null, song: null };

function route() {
  const [slug, offset] = location.hash.replace(/^#/, '').split('/');
  return { slug, offset: Number.parseInt(offset, 10) || 0 };
}

function go(slug, offset) {
  location.hash = offset ? `${slug}/${offset > 0 ? '+' : ''}${offset}` : slug;
}

async function showSongbook() {
  controls.hidden = true;
  back.hidden = true;
  heading.textContent = 'JFavrites';
  main.replaceChildren();

  let songs;
  try {
    const res = await fetch('songs/index.json');
    if (!res.ok) throw new Error('index');
    songs = await res.json();
  } catch {
    main.textContent = 'Could not load songbook.';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'songbook';
  for (const song of songs) {
    const title = document.createElement('strong');
    title.textContent = song.title;

    const meta = document.createElement('span');
    meta.textContent = `${song.artist} · ${song.key}`;

    const a = document.createElement('a');
    a.href = `#${song.slug}`;
    a.append(title, meta);

    const li = document.createElement('li');
    li.append(a);
    ul.append(li);
  }
  main.append(ul);
}

function showNotFound() {
  controls.hidden = true;
  back.hidden = false;
  heading.textContent = 'Not found';

  const link = document.createElement('a');
  link.href = '#';
  link.textContent = 'Back to the songbook';

  const p = document.createElement('p');
  p.append('Song not found. ', link);

  main.replaceChildren(p);
}

async function showSong(slug, offset) {
  if (loaded.slug !== slug) {
    let text;
    try {
      const res = await fetch(`songs/${slug}.chordpro`);
      if (!res.ok) throw new Error('404');
      text = await res.text();
    } catch {
      showNotFound();
      return;
    }
    loaded = { slug, song: parse(text) };
  }

  const { song } = loaded;
  back.hidden = false;
  controls.hidden = false;
  heading.textContent = song.title;
  keyEl.textContent = transposeKey(song.key, offset);
  main.replaceChildren(renderSong(song, offset));
  scrollTo(0, 0);
}

function render() {
  const { slug, offset } = route();
  if (slug) showSong(slug, offset);
  else showSongbook();
}

document.getElementById('up').addEventListener('click', () => {
  const { slug, offset } = route();
  go(slug, offset + 1);
});

document.getElementById('down').addEventListener('click', () => {
  const { slug, offset } = route();
  go(slug, offset - 1);
});

shareBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  shareBtn.textContent = 'Copied';
  setTimeout(() => { shareBtn.textContent = 'Share'; }, 1200);
});

addEventListener('hashchange', render);
render();
```

Transposing changes the hash and lets the single `hashchange` handler redraw. That keeps one rendering path instead of two, and the URL stays correct without separate bookkeeping.

- [ ] **Step 5: Check it works**

Run: `npm run serve`, then open `http://localhost:8000`.

ES modules and the Clipboard API both need `http://`, not `file://` — always test through the server.

Confirm, in order:
- The songbook lists Amazing Grace with `Traditional · G` beneath it
- Tapping it opens the song; `G` sits above the `m` of `Amazing`; headings read VERSE 1 and VERSE 2; the key readout shows `G`
- Pressing `+` twice gives URL `#amazing-grace/+2`, key readout `A`, first chord `A`, and `G7` becomes `A7`
- Pressing `−` three times gives `#amazing-grace/-1`, key `Gb`, chords spelled with flats
- Share reads `Copied`, and pasting the URL in a new tab opens the song already transposed
- `http://localhost:8000/#no-such-song` shows `Song not found.` with a working link back

- [ ] **Step 6: Check it on a phone**

```bash
ipconfig getifaddr en0
```

Open `http://<that-address>:8000` from a phone on the same network. Confirm lines wrap without horizontal scrolling and chords stay above the right syllables.

Share will not work over plain `http://` to a LAN address — the Clipboard API requires a secure context. It works on `localhost` and on the deployed HTTPS site. That is expected, not a bug.

- [ ] **Step 7: Run the tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add index.html styles.css songs/index.json js/app.js
git commit -m "Add the app: songbook, song view, transposition and sharing

Transposition changes the hash and re-renders through the single
hashchange path, so the URL always matches what is on screen."
```

---

### Task 5: Manifest and deploy

**Files:**
- Create: `manifest.json`
- Modify: `index.html`

No icon files. Add to Home Screen works without them — iOS falls back to a screenshot of the page. Drawing a real icon is two minutes' work at any point later, and nothing depends on it.

- [ ] **Step 1: Create the manifest**

Create `manifest.json`:

```json
{
  "name": "JFavrites",
  "short_name": "JFavrites",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#1a1a1a",
  "theme_color": "#1a1a1a"
}
```

- [ ] **Step 2: Link it**

In `index.html`, replace:

```html
<link rel="stylesheet" href="styles.css">
```

with:

```html
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="styles.css">
```

- [ ] **Step 3: Stage the files the site actually needs**

Dragging the repo folder would upload `.git`, `docs` and `test` too. Copy out just the site:

```bash
rm -rf /tmp/jfavrites-dist
mkdir -p /tmp/jfavrites-dist
cp -R index.html styles.css manifest.json js songs /tmp/jfavrites-dist/
open /tmp/jfavrites-dist
```

- [ ] **Step 4: Deploy**

Open <https://app.netlify.com/drop> and drag the `jfavrites-dist` folder from the Finder window onto the page. Netlify returns an HTTPS URL immediately, with no account needed to publish.

- [ ] **Step 5: Verify on a phone**

Open the Netlify URL on a phone and confirm:
- The songbook loads and a song renders and transposes
- Share copies a working link, which works here because the site is HTTPS
- Add to Home Screen launches without browser chrome

- [ ] **Step 6: Commit**

```bash
git add manifest.json index.html
git commit -m "Add web app manifest"
```

---

### Task 6: The add-song skill

Writes new song files so the songbook can grow without touching the app.

**Files:**
- Create: `.claude/skills/add-song/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `.claude/skills/add-song/SKILL.md`:

````markdown
---
name: add-song
description: Use when adding a song to the JFavrites songbook - fetches chords and lyrics from a chord site, converts them to ChordPro, and updates the song index
---

# Add a song to JFavrites

Turns a chord-site page into a valid ChordPro file in `songs/`, plus an entry in
`songs/index.json`.

## Steps

### 1. Get the source

If given a URL, fetch it. If given only a song name, search Ultimate Guitar and
confirm which version to use before fetching — versions differ in key and
quality, so this is not a detail to guess at.

If the fetch is blocked or returns nothing usable, ask for the page text to be
pasted instead and continue from step 3.

### 2. Extract the tab

Ultimate Guitar pages embed the whole tab as JSON in the `data-content` attribute
of `div.js-store`. HTML-unescape that attribute, parse it as JSON, and read:

```
store.page.data.tab_view.wiki_tab.content
```

Also read `store.page.data.tab.tonality_name` for the key, but treat it as a hint
rather than the truth — check it against the song's first and last chords.

### 3. Convert to ChordPro

The content is chords-over-lyrics text with every chord wrapped in `[ch]...[/ch]`
markers, so chords never have to be identified by guessing at column alignment.

For each chord line paired with the lyric line beneath it:

1. Record each chord and its column, measured **after** removing the `[ch]` and
   `[/ch]` marker text — the markers are not visible characters, and counting
   them shifts every position.
2. Emit `[Chord]` inline at that character index in the lyric line below.
3. If a chord line has no lyric line under it (an intro or a solo), keep it as a
   chord-only line, preserving the spacing between the chords.

Strip `[tab]` and `[/tab]` wrappers. Convert section markers like `[Verse 1]` or
`[Chorus]` into `{comment: Verse 1}`.

### 4. Propose style tags

Read every `{meta: style ...}` value already used across `songs/*.chordpro` and
show that list. Propose tags for this song, preferring an existing tag over a new
near-duplicate — `folk`, `folk-rock` and `Folk` as three separate tags is the
failure to avoid. Confirm before writing.

### 5. Write the files

Write `songs/<slug>.chordpro`, where the slug is the lowercase title with spaces
replaced by hyphens and non-alphanumeric characters removed:

```
{title: <title>}
{artist: <artist>}
{key: <key>}
{meta: style <tag>}

{comment: Verse 1}
<lyrics with inline chords>
```

Then insert the song into `songs/index.json`, keeping the array sorted by title:

```json
{
  "slug": "<slug>",
  "title": "<title>",
  "artist": "<artist>",
  "key": "<key>",
  "styles": ["<tag>"]
}
```

### 6. Show the result

Print the finished ChordPro file. Do not commit — leave that to a human who has
looked at it.

## Rules

- **Valid ChordPro only.** This songbook uses `{title:}`, `{artist:}`, `{key:}`,
  `{comment:}` and `{meta: style ...}`. Never invent a directive. Custom metadata
  goes through `{meta: name value}`, which is ChordPro's own extension point.
- **One `{meta: style ...}` per tag.** Repeated directives with the same name
  collect into a list; do not comma-separate values on one line.
- **Do not transpose the source.** Store the song in whatever key it was written
  in and record that in `{key:}`. The app transposes at read time.
- **Preserve chord spelling as written**, including slash chords like `C/E`.
- **When the parse looks wrong, say so** rather than writing a file that needs
  silent correction later. A chord landing one syllable off is the common
  failure, and it is far cheaper to catch here than on a sofa with a guitar.
````

- [ ] **Step 2: Test the skill end to end**

Ask Claude Code to add a song. Confirm it writes `songs/<slug>.chordpro`, updates `songs/index.json`, and shows the result without committing.

Reload the app and confirm the new song appears in the songbook and renders with chords in the right places.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/add-song/SKILL.md
git commit -m "Add the add-song skill

Scraping happens offline, once per song, with a human reviewing the parse,
which is what keeps the app itself free of a backend."
```

---

## Done

Songs render with transposable chords, share links carry the key, the app is live on HTTPS, and new songs arrive with one request to Claude Code.
