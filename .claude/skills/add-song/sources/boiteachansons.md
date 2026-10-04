# Boîte à chansons (boiteachansons.net)

A Québec site with a large French-language catalogue. Pages are free and need
no account.

**Find:** song pages live at
`https://www.boiteachansons.net/partitions/<artist-slug>/<title-slug>`. Slugs
turn apostrophes and spaces into hyphens and keep any subtitle in parentheses
(`il-faut-que-je-m-en-aille-(les-retrouvailles)`), so a guess often misses.
A missing page still returns HTTP 200: check the body for `Erreur 404`. The
artist page `https://www.boiteachansons.net/artistes/<artist-slug>` lists every
song link — use it to find the real slug. Confirm the artist: French titles are
often shared, e.g. *Il faut que je m'en aille* by Graeme Allwright versus *Y a
pas de doute il faut que je m'en aille* by Véronique Sanson.

**Extract:** curl the page and read `<div id="divPartition">`. There are no
chord lines: each chord is an empty inline span placed right before the
syllable it falls on —

```html
<div class="pL"> Des coups de <span class="sI"><span class="a" data-a="F" data-aff="F" data-i="1"></span></span>poing</div>
```

Replace each `<span class="sI">…</span>` with `[<data-a>]` and keep the text
around it; that is already ChordPro. Use `data-a` (letter names), not
`data-aff`, which follows the viewer's notation setting. Decode `&nbsp;` and
trim leading whitespace. Line classes:

| Markup | Meaning |
|---|---|
| `div.pL` | lyric line with chords |
| `div.pLS` | lyric line without chords |
| `div.pLI` | instrumental line; chords are `span.ALI` between `|` bar marks |
| `div.pLVV` | empty — stanza break |
| `div.dR` | wraps the refrain's lines |

There are no section-label elements. Mark a `div.dR` block as
`{comment: Refrain}`; labels such as `(Refrain)` written as lyric text stay as
`{comment: ...}` in the sheet's wording. Ignore everything outside
`#divPartition` (chord diagrams, other songs, comments). The *Version TXT*
link (`/partitions/versionTxt?...`) answers `Erreur d'accès` to curl; don't use
it.

**Key and capo:** read the hidden inputs `<input id="tonalite" value="C">` and
`<input id="capo" value="IV">`. The capo is a Roman numeral, empty when there is
none — write it as `{comment: Capo 4}`.

**Check placement:** spans are sometimes a character or two off, landing
mid-syllable (`souviens-t[C]oi`, `mais[C]on`). Move such a chord to the start
of its syllable and list every moved chord when showing the result.
