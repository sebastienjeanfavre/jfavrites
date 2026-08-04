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
   line of `[Chord]` tokens with the original whitespace between them, so the
   spacing survives.

Strip `[tab]` and `[/tab]` wrappers. Convert section markers like `[Verse 1]` or
`[Chorus]` into `{comment: Verse 1}`.

### 4. Propose style tags

Read every `{meta: style ...}` value already used across `songs/*.chordpro` and
show that list. Propose tags for this song, preferring an existing tag over a new
near-duplicate — `folk`, `folk-rock` and `Folk` as three separate tags is the
failure to avoid. Confirm before writing.

### 5. Write the files

Write `songs/<slug>.chordpro`, where the slug is the title lowercased, with
everything except letters, digits and spaces removed, and then spaces replaced
by hyphens:

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
  `{comment:}` and `{meta: style ...}`. Never invent a directive. `{meta: style
  ...}` is the only custom metadata this app reads — other `{meta:}` names are
  valid ChordPro but are parsed and silently ignored here.
- **One `{meta: style ...}` per tag.** Repeated directives with the same name
  collect into a list; do not comma-separate values on one line.
- **Do not transpose the source.** Store the song in whatever key it was written
  in and record that in `{key:}`. The app transposes at read time.
- **Preserve chord spelling as written**, including slash chords like `C/E`.
- **When the parse looks wrong, say so** rather than writing a file that needs
  silent correction later. A chord landing one syllable off is the common
  failure, and it is far cheaper to catch here than on a sofa with a guitar.
