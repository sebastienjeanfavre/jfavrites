# JFavrites — Design

**Date:** 2026-08-04
**Status:** Approved for implementation

## Problem

When family and friends gather, I want to play guitar or piano and get people
singing. To play a song I need two things on screen: the chords, in a key that
suits whoever is singing, and the lyrics. Everyone else needs the same page on
their own phone so they can sing along or play a second instrument.

## What v1 does

- Shows a songbook of hand-curated songs.
- Opens a song as chords over lyrics, readable on a phone.
- Transposes up and down by semitones.
- Produces a share link that anyone can open, carrying the chosen key.

## What v1 deliberately does not do

Each of these was considered and cut. They are listed so the boundary is
explicit, not to schedule them.

- Song suggestion ("what should I play?") — the original motivation, but a
  separate problem needing a catalogue and a model. Deferred.
- Live-synced sessions where everyone's screen follows the host.
- Auto-scroll, capo helper, lyrics-only toggle.
- Adding a song from inside the app.
- Search, accounts, offline caching, service worker.

## Architecture

Two independent halves joined by a file format. Neither knows the other exists.

```
┌─ add-song skill (laptop, Claude Code) ─┐    ┌─ static web app (any phone) ─┐
│  url → fetch → parse → write file      │──▶ │  fetch → parse → render      │
└────────────────────────────────────────┘    └──────────────────────────────┘
                        songs/*.chordpro
```

No server, no database, no build step.

**Hosting: Netlify.** Netlify Drop takes a dragged folder and serves it, with no
account, CLI or git integration required — the shortest path from "it works
locally" to "everyone has the link". Git-connected deploys are a later upgrade,
not a prerequisite.

The host is deliberately not load-bearing. With no build step, no server and no
environment configuration, moving to Cloudflare Pages, GitHub Pages or a machine
at home is a matter of minutes. Nothing in this design should be chosen to suit
a particular host.

**Why no backend.** Scraping was the only requirement that forced one. Moving
the scrape off the critical path — done once per song, interactively, with a
human watching — removes the server, the deploy pipeline, the cold starts, and
every runtime failure mode of a fragile parser. A page that will not parse
becomes a conversation on a laptop rather than a 500 in front of the family.

**Cost of that choice.** Songs cannot be added from the couch. Adding one means
laptop, skill, commit, deploy (~30s). Accepted for v1. If it becomes annoying,
the escape hatch is a paste box in the app backed by `localStorage`, which still
needs no server.

## The song file

A subset of ChordPro. One file per song. Plain text, hand-editable when the
parser gets something wrong — which is the most valuable debugging property in
the whole design.

```
{title: Let It Be}
{artist: The Beatles}
{key: C}

{comment: Verse}
When I find my[C]self in times of [G]trouble
[Am]Mother Mary [F]comes to me

{comment: Chorus}
[C]Let it [G]be, let it [Am]be
```

Supported directives:

| Directive | Meaning |
|---|---|
| `{title: ...}` | Song title. Required. |
| `{artist: ...}` | Artist. Required. |
| `{key: ...}` | Original key, e.g. `C`, `Am`. Required — transposition and enharmonic spelling depend on it. |
| `{comment: ...}` | Section label (Verse, Chorus, Bridge). Rendered as a heading. |

Anything in `[...]` inline is a chord attached to the character that follows it.
Blank lines separate blocks. Unrecognised directives are ignored rather than
treated as errors.

### The index

Static hosting cannot list a directory, so the songbook needs a real file:

```json
[
  { "slug": "let-it-be", "title": "Let It Be", "artist": "The Beatles", "key": "C" }
]
```

`songs/index.json` is maintained by the `add-song` skill and sorted by title.
`key` is carried here so the songbook list can show each song's original key
without fetching every file.

## URL scheme

Hash routing, so no server rewrite rules are needed.

| URL | Shows |
|---|---|
| `/` or `/#` | Songbook list |
| `/#let-it-be` | Song in its original key |
| `/#let-it-be/+2` | Song transposed up 2 semitones |
| `/#let-it-be/-3` | Song transposed down 3 semitones |

The offset lives in the URL so the share link carries the key. "Here's what
we're playing, in D" becomes a single link. This is what recovers most of the
value that live session sync would have provided, at almost no cost.

The Share button copies `location.href` via the Clipboard API.

## Modules

Four small files. The first two are pure functions with no DOM access, which is
what makes them testable.

### `js/transpose.js`

The only module with real logic, and therefore the only one carrying meaningful
test weight.

```js
transposeChord(chord, semitones, preferFlats) // ("C#m7/G#", 3, false) → "Em7/B"
transposeKey(key, semitones)                  // ("C", 2) → "D";  ("Am", 3) → "Cm"
prefersFlats(key)                             // "F" → true;  "G" → false
```

Chord grammar: `/^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/` — root, optional
accidental, arbitrary quality/extension text (`m`, `m7`, `sus4`, `maj7`, `add9`,
`dim`), optional slash bass note.

Enharmonic spelling follows the *target* key rather than a fixed preference: the
flat keys (F, B♭, E♭, A♭, D♭, G♭ and their relative minors) spell with flats,
everything else with sharps. Transposing "Let It Be" up one semitone gives D♭,
not C♯, which is what a musician expects to read.

### `js/chordpro.js`

```js
parse(text) // → { title, artist, key, sections: [{ label, lines }] }
```

Each line is `{ lyric: string, chords: [{ index, chord }] }` where `index` is a
character offset into `lyric`. A chord-only line (an intro or instrumental) is a
line with an empty `lyric` and chords at ascending indices.

### `js/render.js`

Takes a parsed song plus a semitone offset and produces DOM.

Each line is split at its chord positions into chunks. Every chunk is an
`inline-block` carrying its chord stacked above its slice of lyric:

```html
<span class="chunk"><b class="chord">C</b><span class="text">self in times of </span></span>
```

Inline-block chunks wrap at the container edge, so a narrow phone reflows the
line instead of breaking chord alignment or forcing a horizontal scroll. This is
the specific thing that makes most chord sites unusable on a phone, and the
reason for the chunk approach over a monospace two-line layout.

Known consequence: a chord wider than its syllable stretches its chunk, opening
a small gap in the lyric. This is the standard trade-off in every chord app and
is accepted.

### `js/app.js`

Hash routing, `fetch` of `index.json` and song files, transpose buttons, share
button. The only module that touches the network or the address bar.

## Data flow

1. Load `/` → fetch `songs/index.json` → render list.
2. Tap a song → set hash → fetch `songs/<slug>.chordpro` → `parse` → `render`
   at offset 0.
3. `+` / `−` → update offset, update hash, re-render, update the displayed key.
4. Share → copy `location.href`.
5. Someone opens that link → same path as step 2, offset read from the hash.

## Error handling

Deliberately minimal, matching the prototype's scope.

- Song file 404 → "Song not found" and a link back to the songbook.
- `index.json` unreachable → "Could not load songbook."

No retries, no logging, no fallbacks. A static file either loads or it does not.

## PWA

A minimal `manifest.json` plus an apple-touch-icon, so "Add to Home Screen" gives
a real icon and a chrome-less launch. No service worker — offline caching is
scope that v1 does not need.

## Testing

`node --test`, matching the convention in `showmyride`. No browser tests.

- `test/transpose.test.js` — every root across all 12 semitone shifts, flats and
  sharps, minors, slash chords, extensions, and round-trip behaviour (`+n` then
  `−n` returns to the original key, spelled by that key's own convention — note
  this only restores the input string exactly when the source file already
  spelled its chords conventionally for its key).
- `test/chordpro.test.js` — directives, chord index positions, chord-only lines,
  section grouping, unknown directives ignored.

`render.js` and `app.js` are verified by using the app, not by tests.

## Files

```
index.html
styles.css
manifest.json
js/
  app.js
  chordpro.js
  transpose.js
  render.js
songs/
  index.json
  <slug>.chordpro
test/
  transpose.test.js
  chordpro.test.js
.claude/skills/add-song/SKILL.md
package.json          # { "type": "module", "scripts": { "test": "node --test" } }
```

The working directory stays `singit/`; renaming it to `jfavrites/` is a one-line
change whenever wanted.

## The `add-song` skill

Lives at `.claude/skills/add-song/SKILL.md`. Invoked as "add Wonderwall" or with
a URL.

Steps:

1. Fetch the Ultimate Guitar page.
2. Extract the JSON from the `data-content` attribute of `div.js-store`
   (HTML-unescape, then parse). The tab text is at
   `store.page.data.tab_view.wiki_tab.content`.
3. Convert to ChordPro. The source is chords-over-lyrics with chords wrapped in
   `[ch]...[/ch]` markers. For each chord line paired with the lyric line below
   it, compute each chord's column *after* stripping the marker text, then emit
   an inline `[X]` at the matching character index in the lyric.
4. Write `songs/<slug>.chordpro` and insert into `songs/index.json`.
5. Print the result for review before committing.

If the fetch is blocked, the skill asks for the page text to be pasted instead
and continues from step 3. The `[ch]` markers mean chord identification does not
depend on column-alignment guesswork.

**Note on content.** Chords and lyrics are copyrighted and Ultimate Guitar's
terms forbid scraping. This is a personal songbook, fetched by hand, a song at a
time. Published share URLs are unlisted rather than advertised.

## Success criteria

At the next family gathering: open JFavrites on my phone, pick a song, transpose
it to suit whoever is singing, send one link, and have people sing along from
their own screens without asking me a single question about how to use it.
