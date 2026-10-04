# Boîte à chansons (boiteachansons.net)

A Québec site with a large French-language catalogue. Pages are free and need
no account.

**Find:** song pages live at
`https://www.boiteachansons.net/partitions/<artist-slug>/<title-slug>`. Given
only a name, search the site (or the web with `site:boiteachansons.net`) and
confirm the artist — French titles are often shared, e.g. *Il faut que je m'en
aille* by Graeme Allwright versus *Y a pas de doute il faut que je m'en aille*
by Véronique Sanson.

**Extract:** take the chord sheet's rendered text, not the raw HTML: chords and
lyrics sit in separate elements, and only the visible text keeps chords over the
right syllables. Ignore the chord-diagram images, the artist's other songs and
the comments. The page header gives the key (*tonalité*) and any capo.

**Chords:** there are no chord markers, so a line is a chord line when every
token on it is a chord name. Section labels look like `Couplet 1`, `Refrain`
or `Pont`; keep them in French.
