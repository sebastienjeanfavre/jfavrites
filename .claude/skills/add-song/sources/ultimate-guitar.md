# Ultimate Guitar

**Find:** search ultimate-guitar.com and prefer the highest-rated "Chords"
version. "Official" and "Pro" versions use a different format; skip them.

**Extract:** the page embeds the whole tab as JSON in the `data-content`
attribute of `div.js-store`. HTML-unescape that attribute, parse it as JSON,
and read:

```
store.page.data.tab_view.wiki_tab.content
```

`store.page.data.tab.tonality_name` is the key — a hint, not the truth.

**Chords:** every chord is wrapped in `[ch]...[/ch]`, so chord lines never need
guessing. Strip the markers before measuring columns. Also strip `[tab]` and
`[/tab]`. Section labels look like `[Verse 1]` or `[Chorus]`.
