---
name: add-song
description: Use when adding a song to the JFavrites songbook - fetches chords and lyrics from Ultimate Guitar or Boîte à chansons (boiteachansons.net, best for French songs), converts them to ChordPro, and updates the song index
---

# Add a song to JFavrites

Turns a chord-site page into a valid ChordPro file in `songs/`, plus an entry in
`songs/index.json`.

## Steps

### 1. Get the source

Pick the source, then read its file for how to find and extract the song:

| Source | Use for | Details |
|---|---|---|
| Ultimate Guitar | Most songs; the default | [sources/ultimate-guitar.md](sources/ultimate-guitar.md) |
| Boîte à chansons | French songs, or when asked | [sources/boiteachansons.md](sources/boiteachansons.md) |

A URL decides the source by itself. Given only a name, search and confirm which
song and version to use before fetching — several songs share a title, and
versions differ in key and quality.

If the fetch is blocked or returns nothing usable, ask for the page text to be
pasted instead and continue from step 2.

### 2. Convert to ChordPro

If the source file gives chords already inline, use them as they are. Otherwise
the source gives chords-over-lyrics text; for each chord line paired with the
lyric line beneath it:

1. Record each chord and its column, measured on the visible text only — any
   markup the source wraps chords in is not counted.
2. Emit `[Chord]` inline at that character index in the lyric line below.
3. If a chord line has no lyric line under it (an intro or a solo), keep it as a
   line of `[Chord]` tokens with the original whitespace between them, so the
   spacing survives.

Convert section labels (`[Verse 1]`, `Refrain :`) into `{comment: ...}`, keeping
the source's wording and language. If the sheet says to use a capo, keep the
chords as written and add `{comment: Capo N}` at the top.

### 3. Propose style tags

Read every `{meta: style ...}` value already used across `songs/*.chordpro` and
show that list. Propose tags for this song, preferring an existing tag over a new
near-duplicate — `folk`, `folk-rock` and `Folk` as three separate tags is the
failure to avoid. Confirm before writing.

### 4. Write the files

Write `songs/<slug>.chordpro`. The slug is the title with accents removed
(`é` → `e`), lowercased, everything except letters, digits and spaces removed,
then spaces replaced by hyphens: `Il faut que je m'en aille` →
`il-faut-que-je-men-aille`.

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

### 5. Show the result

Print the finished ChordPro file. Do not commit — leave that to a human who has
looked at it.

## Rules

- **Valid ChordPro only.** This songbook uses `{title:}`, `{artist:}`, `{key:}`,
  `{comment:}` and `{meta: style ...}`. Never invent a directive. `{meta: style
  ...}` is the only custom metadata this app reads — other `{meta:}` names are
  valid ChordPro but are parsed and silently ignored here.
- **One `{meta: style ...}` per tag.** Repeated directives with the same name
  collect into a list; do not comma-separate values on one line.
- **Do not transpose the source.** Store the song in whatever key it was written
  in and record that in `{key:}`. The app transposes at read time.
- **Chords use letter names.** Preserve spelling as written, including slash
  chords like `C/E`, except that solfège names become letters (`Do` → `C`,
  `Ré` → `D`, `Mi` → `E`, `Fa` → `F`, `Sol` → `G`, `La` → `A`, `Si` → `B`).
  The app only transposes chords starting with `A`–`G`.
- **`{key:}` must match `[A-G][#b]?m?` exactly** — a letter A-G, an optional `#`
  or `b`, an optional trailing `m` for minor, and nothing else. The app
  transposes this value at read time; anything outside that grammar is left
  unchanged while the chords keep transposing, silently breaking the header.
  `C major`, `Gmaj` and `Am7` are not valid key values — use `C`, `G` and `Am`.
  When the source gives no key, or one that disagrees with the chords, use the
  key the first and last chords point to.
- **When the parse looks wrong, say so** rather than writing a file that needs
  silent correction later. A chord landing one syllable off is the common
  failure, and it is far cheaper to catch here than on a sofa with a guitar.
