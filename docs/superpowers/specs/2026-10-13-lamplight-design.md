# Lamplight restyle — Design

**Date:** 2026-10-13
**Status:** Approved for implementation

## Problem

The app works but looks like a tool. It was styled with the system font and grey
hairlines, which says "prototype", not "family songbook". At a party each phone in
the room is a page of that songbook, and the page should feel like the evening:
warm, dim, a little old — and still effortless to read while singing.

## What the restyle does

- One dark theme, always: the deep-coffee "lamplight" page with aged-cream ink.
- Spectral, a book serif built for screens, for every piece of text.
- IM Fell English for the "♪ JFavrites ♪" wordmark on the songbook list, as the
  one antique accent.
- The songbook list as the contents page of an old book: dotted leaders from each
  title to its key, artist in small italic beneath.
- Old-print details in the song view: double rule under the header, centred
  small-caps section labels between hairlines, sung lines faded, the current line
  washed in soft terracotta.
- A home-screen icon: a cream music note on deep coffee.

## What the restyle deliberately does not do

- No light theme and no in-app theme toggle. One look, one palette to maintain.
- No change to layout or behaviour: routing, transpose, share, the Sing mic
  loop, chunk wrapping and auto-scroll are untouched.
- No fonts from a third party at runtime. Both faces are self-hosted files.
- No new animation beyond the existing line-fade and a pulsing dot on the
  listening status.

## Decisions and constraints

**Lamplight always.** The real scenario is an evening party in a dim room.
Following each phone's system mode would leave half the room on bright pages,
since many phones stay in light mode. A forced dark page also spares the OLED
battery on the musician's screen, which stays on all evening. Accepted cost:
daylight outdoor use reads a bit dull.

**Palette.** Three colours and their alphas carry the whole design:

| Role | Value |
|---|---|
| Page background | `#271E12` |
| Ink (lyrics, titles, rules) | `#E9D9B9` |
| Accent (chords, keys, live state) | `#E07B5A` |
| Hairlines and double rules | `rgba(233, 217, 185, 0.4)` |
| Sung lines | opacity `0.35` |
| Current-line wash | `rgba(224, 123, 90, 0.18)` |

`color-scheme: dark` and `<meta name="theme-color" content="#271E12">` make iOS
Safari chrome match the page.

**Type.** Spectral (regular, bold, italic) for titles, lyrics, chords, artists
and buttons. IM Fell English (regular only) for the wordmark and nothing else —
the title-page convention: one antique moment, short and large, where roughness
costs nothing. Both faces are self-hosted `woff2` files in `fonts/` loaded with
`@font-face` and `font-display: swap`, so a party on bad wifi never waits on a
font CDN. Fallback stack: `Georgia, serif`.

**Wordmark.** "♪ JFavrites ♪" set in IM Fell English, centred, with a double
rule beneath — a title page, not a sticky bar: the wordmark scrolls away with
the list, exactly as in the approved mockups. `showSongbook()` hides the whole
`#bar` and builds the wordmark as it builds the rows; the song view and the
notice screens keep the bar as today, with the title in Spectral bold. The ♪
glyphs exist in neither face; they render in the system face, in the accent
colour — deliberately, as in every mockup shown.

**Songbook list rows.** Each row is a flex line: title, then a dotted leader
(a flex spacer with a dotted bottom border), then the key in accent bold.
The artist sits beneath in small italic. Long titles shrink the leader to
nothing on narrow phones; the key never leaves the right edge.

**Song view.** The header gains a double-rule bottom border. Section labels
(`h2`) become centred uppercase letterspaced text between hairline rules —
pure CSS on the existing element. `sing.js` currently fades only past lines;
it regains a one-line `classList.toggle('current', n === line)` beside the
existing `sung` toggle, so the CSS can wash the current line. Buttons are
1px cream-alpha outlines, radius 4; the Sing button fills terracotta while
active ("Stop").

**Listening status.** The existing `#status` line, restyled: italic accent
text, with a pulsing dot via `#status:not([hidden])::before` and a CSS keyframe.
No JS change.

**Icon.** `icons/` holds an SVG source and 180/192/512 PNG exports: a cream `♪`
on the coffee background. `manifest.json` gains the icons array, and
`index.html` gains `<link rel="apple-touch-icon">` — iOS takes the home-screen
icon from that link, not from the manifest, so the manifest alone would never
reach the target device. (My call during the design session; veto before
implementation is free.)

## Files

```
styles.css          rewritten; same selectors (.line, .chunk, .chord, .word,
                    .sung, #bar, #status) so render.js and sing.js markup keeps
                    working; adds @font-face, palette, wordmark, list rows
index.html          theme-color meta, apple-touch-icon link
js/app.js           showSongbook: hide #bar, build wordmark, row markup
                    (title, leader, key, artist)
js/sing.js           one line: current-class toggle
manifest.json        icons array
fonts/              spectral-400.woff2, spectral-700.woff2,
                    spectral-400i.woff2, fell-400.woff2
icons/              note.svg, note-180.png, note-192.png, note-512.png
```

## Testing

No new unit tests. The restyle touches no pure logic: `transpose`, `chordpro`,
`align` and the worker are untouched, and the existing suites keep passing as
regression cover. Verified by hand on the target device:

- iPhone Safari, system light and dark: the page stays lamplight, chrome
  matches the theme-color.
- List: dotted leaders hold alignment with the longest title
  ("Il faut que je m'en aille") on a small phone.
- Song view at arm's length: lyrics legible mid-song, chords distinct from
  lyrics, current-line wash visible in a dim room.
- Fonts load from the origin; with the font requests blocked the page still
  renders and stays readable in the Georgia fallback (`font-display: swap`).
  There is no service worker, so true offline reload is out of scope, as in v1.
- Add to Home Screen on iOS shows the note icon, not a screenshot.

## Success criteria

At the next family party, every phone in the room opens to the same warm dark
songbook, no one comments that it looks unfinished, and the musician reads
chords through a whole set without leaning closer to the screen.
