# Lamplight Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle JFavrites into the warm dark "lamplight songbook" approved in the design session — no behaviour changes, only surface.

**Architecture:** A pure CSS restyle over the existing no-framework app, plus two self-hosted webfonts, a one-line `sing.js` class toggle, and a new songbook screen composition (wordmark + contents rows) in `app.js`. All layout mechanics — chunk wrapping, hash routing, transpose, the Sing loop — are untouched.

**Tech Stack:** Vanilla JS/CSS, `woff2` via `@font-face`, static PNG icon exports (`qlmanage`), Cloudflare Worker static hosting (repo root is the assets directory).

**Spec:** `docs/superpowers/specs/2026-10-13-lamplight-design.md`

## Global Constraints

- Palette, exactly: page `#271E12`, ink `#E9D9B9`, accent `#E07B5A`, hairlines `rgba(233, 217, 185, 0.4)`, sung lines opacity `0.35`, current-line wash `rgba(224, 123, 90, 0.18)`.
- Fonts are self-hosted `woff2` files in `fonts/` with `font-display: swap`; no third-party requests at runtime. Fallback stack `Georgia, serif`.
- Spectral for all text; IM Fell English for the wordmark only; the ♪ glyphs render in the system face, accent-coloured — deliberately.
- No behaviour changes: routing, transpose, share, Sing mic loop, chunk wrapping, auto-scroll all untouched.
- No new unit tests. `npm test` must stay green after every task.
- No service worker.
- Font and type sizes stay as today (`16px/1.5` body, chords `0.8rem/1.25` bold); only family, colours, and the listed spacings change.
- UI copy stays English, as today (`Sing`, `Stop`, `Share`, `Listening`).
- `fonts/` and `icons/` are served by the worker automatically (assets directory is the repo root; `.assetsignore` does not exclude them). Do not add them to `.assetsignore`.
- Commits: conventional with scope, no attribution trailers. Exact messages given per task.

## Review Focus

1. **Long titles on a narrow phone** — "Il faut que je m'en aille" + leader + key at 320 px: the leader collapses, the key never leaves the right edge. Pinned in Task 3, Step 6.
2. **Wordmark survives navigation** — after song → back → song, the wordmark still shows both ♪ and `#bar` is hidden on the list, visible in the song view. Pinned in Task 3, Step 7.
3. **Transpose while singing** — `repaint()` re-applies `.current`/`.sung` after a re-render, so the wash follows the right line. Pinned in Task 4, Step 5 (console); live sing path is the human's iPhone hand-test from the spec.
4. **Blocked font requests** — the page renders in the Georgia fallback and stays readable; nothing shifts. Pinned in Task 6, Step 3.
5. **Notice screens after the `#bar` logic change** — "Not found" (bad hash) and "Offline" still show the bar and readable text. Pinned in Task 3, Step 8.

---

### Task 1: Self-hosted fonts

**Files:**
- Create: `fonts/spectral-400.woff2`, `fonts/spectral-700.woff2`, `fonts/spectral-400i.woff2`, `fonts/fell-400.woff2`
- Modify: `styles.css` (prepend `@font-face` rules)

**Interfaces:**
- Consumes: nothing.
- Produces: font families `'Spectral'` (400, 700, italic 400) and `'IM Fell English'` (400) resolvable to every later task; files at `fonts/<name>.woff2`.

- [ ] **Step 1: Download the four latin-subset woff2 files**

Run from the repo root (needs network; Google Fonts css2 API, Chrome UA to get woff2):

```python
import re, urllib.request, pathlib
ua = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'}
url = ('https://fonts.googleapis.com/css2'
       '?family=Spectral:ital,wght@0,400;0,700;1,400'
       '&family=IM+Fell+English&display=swap')
css = urllib.request.urlopen(urllib.request.Request(url, headers=ua)).read().decode()
names = {'Spectral': 'spectral', 'IM Fell English': 'fell'}
last = {}
for b in re.findall(r'@font-face\s*{([^}]+)}', css):
    fam = re.search(r"font-family: '([^']+)'", b).group(1)
    style = re.search(r'font-style: (\w+)', b).group(1)
    weight = re.search(r'font-weight: (\d+)', b).group(1)
    m = re.search(r'url\((https://[^)]+\.woff2)\)', b)
    if m:
        last[(fam, style, weight)] = m.group(1)
out = pathlib.Path('fonts')
out.mkdir(exist_ok=True)
for (fam, style, weight), src in last.items():
    suffix = '' if style == 'normal' else 'i'
    name = f"{names[fam]}-{weight}{suffix}.woff2"
    (out / name).write_bytes(urllib.request.urlopen(urllib.request.Request(src, headers=ua)).read())
    print(name)
```

Save the script to a temp file, run `python3 <tempfile>` from the repo root, delete the temp file.
Expected output: four lines, `fell-400.woff2`, `spectral-400.woff2`, `spectral-400i.woff2`, `spectral-700.woff2`

- [ ] **Step 2: Verify the files are real fonts**

Run: `ls -la fonts/`
Expected: four files, roughly 13–60 KB each (spectral ≈ 13–14 KB, fell ≈ 58 KB).

- [ ] **Step 3: Prepend four `@font-face` rules to `styles.css`**

Exactly this pattern, one block per file (the italic block gets `font-style: italic`; IM Fell gets `font-family: 'IM Fell English'` and file `fell-400.woff2`):

```css
@font-face {
  font-family: 'Spectral';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('fonts/spectral-400.woff2') format('woff2');
}
```

- [ ] **Step 4: Regression + serve check**

Run: `npm test`
Expected: all existing tests pass (no JS touched).

Run: `npm run serve` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/fonts/spectral-400.woff2`
Expected: `200`. Kill the server.

- [ ] **Step 5: Commit**

```bash
git add fonts/ styles.css
git commit -m "feat(theme): self-host Spectral and IM Fell"
```

---

### Task 2: Lamplight palette, dark always

**Files:**
- Modify: `styles.css` (`:root`, `body`, `#bar`, `button`, `#status`, `.chord`, `.sung` — full-file restyle of these selectors), `index.html:6`
- Test: existing suites via `npm test`; visual check via `npm run serve`

**Interfaces:**
- Consumes: font families from Task 1.
- Produces CSS custom properties every later task uses: `--page`, `--ink`, `--accent`, `--rule`, `--pad`, plus font stacks `--serif` (`'Spectral', Georgia, serif`) and `--display` (`'IM Fell English', Georgia, serif`).

- [ ] **Step 1: Replace the `:root` block**

```css
:root {
  color-scheme: dark;
  --page: #271E12;
  --ink: #E9D9B9;
  --accent: #E07B5A;
  --rule: rgba(233, 217, 185, 0.4);
  --serif: 'Spectral', Georgia, serif;
  --display: 'IM Fell English', Georgia, serif;
  --pad: 1rem;
}
```

- [ ] **Step 2: Restyle the base selectors**

`body`: `background: var(--page); color: var(--ink); font: 16px/1.5 var(--serif);`
`#bar`: keep flex/sticky layout; `background: var(--page); border-bottom: 3px double var(--rule);`
`button`: `border: 1px solid var(--rule); border-radius: 4px; background: transparent; color: inherit; font: inherit;` (keep the 2.4rem minimums).
`.chord`: `color: var(--accent);` (delete the dark-mode media query — there is no light mode now).
`.sung`: `opacity: 0.35;`
`#status`: `color: var(--accent); font-style: italic;` plus a pulsing dot via `#status:not([hidden])::before` (`content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); display: inline-block; margin-right: 6px; animation: pulse 1.5s infinite;` and `@keyframes pulse { 50% { opacity: 0.35; } }`).

- [ ] **Step 3: Set the theme colour**

In `index.html` line 6, change `content="#1a1a1a"` to `content="#271E12"`.

- [ ] **Step 4: Regression + visual check**

Run: `npm test` — expected: pass.
Run: `npm run serve`, open `http://localhost:8000` in a browser.
Expected: songbook list and a song view fully on the coffee background; chords terracotta; hairlines cream-alpha; with the system in light mode the page stays lamplight.

- [ ] **Step 5: Commit**

```bash
git add styles.css index.html
git commit -m "feat(theme): lamplight palette, dark always"
```

---

### Task 3: Songbook title page — wordmark and contents rows

**Files:**
- Modify: `js/app.js` (`showSongbook`, `showSong`, `showNotice`, top-of-file element lookup), `styles.css` (replace `.songbook` styles; add wordmark and row styles)

**Interfaces:**
- Consumes: `--display`, `--serif`, `--accent`, `--rule` from Task 2.
- Produces: DOM contract used by Task 4's verification and all future styling —
  songbook screen: `<div class="titlepage"><p class="wordmark"><span>♪</span> JFavrites <span>♪</span></p></div>` followed by rows of
  `<a class="song" href="#<slug>"><span class="song-row"><span class="title">…</span><span class="leader" aria-hidden="true"></span><b class="key">…</b></span><span class="artist">…</span></a>`
  `#bar` hidden on the songbook route, visible on song and notice routes.

- [ ] **Step 1: Add the bar lookup and toggle it per route**

In `app.js`, add `const bar = document.getElementById('bar');` beside the other lookups.
In `showSongbook()`: `bar.hidden = true;` (replaces nothing — the function currently leaves the bar visible with heading text; also stop setting `heading.textContent = 'JFavrites'` there).
In `showSong()` and `showNotice()`: `bar.hidden = false;`

- [ ] **Step 2: Build the wordmark in `showSongbook()`**

Use the same `createElement`/`append` style as the existing row code. The wordmark replaces the `ul.songbook` heading role; the list keeps its `ul` (class `songbook`) with one `li` per song. Row structure per the Interfaces block: title, leader, key on one flex line; artist below.

- [ ] **Step 3: Style the title page and rows in `styles.css`**

```css
.titlepage { padding: 1.5rem var(--pad) 0; text-align: center; }
.wordmark {
  font-family: var(--display);
  font-size: 1.3rem;
  margin: 0;
}
.wordmark span { color: var(--accent); font-size: 1rem; }
.titlepage::after {
  content: '';
  display: block;
  border-bottom: 3px double var(--rule);
  margin: 0.5rem var(--pad) 0;
}
```

Rows: `.song` is a block link, `color: inherit; text-decoration: none; padding: 0.4rem 0;`. `.song-row` is `display: flex; align-items: baseline; gap: 0.4rem;`. `.title { font-size: 1rem; }`, `.leader { flex: 1; min-width: 0; border-bottom: 2px dotted rgba(233, 217, 185, 0.45); transform: translateY(-0.25em); }`, `.key { color: var(--accent); font-weight: 700; }`, `.artist { display: block; font-style: italic; font-size: 0.75rem; opacity: 0.75; }`. Delete the old `.songbook a`/`.songbook span` rules. The list container keeps `list-style: none; margin: 0; padding: 0 var(--pad);`.

- [ ] **Step 4: Run the regression suite**

Run: `npm test`
Expected: pass (no logic touched).

- [ ] **Step 5: Visual check against the approved mockup**

Run: `npm run serve`, open the app.
Expected: centred IM Fell wordmark with terracotta ♪, double rule, contents rows with dotted leaders to red keys, italic artists — matching the "Songbook" phone in the approved mockup (`final-design.html` in the brainstorm session).

- [ ] **Step 6: Narrow-viewport check (Review Focus 1)**

Browser devtools responsive mode, 320 px wide.
Expected: "Il faut que je m'en aille" row keeps its key at the right edge; the leader collapses; nothing overflows horizontally.

- [ ] **Step 7: Navigation check (Review Focus 2)**

Song → back → song → back.
Expected: list shows the wordmark with both ♪ every time; `#bar` appears only in the song view.

- [ ] **Step 8: Notice screens (Review Focus 5)**

Open `#does-not-exist`.
Expected: "Not found" notice with `#bar` visible, back link readable on the coffee background.

- [ ] **Step 9: Commit**

```bash
git add js/app.js styles.css
git commit -m "feat(songbook): wordmark title page and contents rows"
```

---

### Task 4: Song-view print details, current-line wash, active Sing button

**Files:**
- Modify: `styles.css` (`h2` section labels, new `.current`, new `#sing.singing`), `js/sing.js:52,69,150`

**Interfaces:**
- Consumes: `.line` elements with `data-line` from `render.js` (untouched); `repaint()` in `sing.js` (untouched).
- Produces: `.current` on exactly the cursor line while singing, and `.singing` on the `#sing` button while active.

- [ ] **Step 1: Restyle section labels**

Replace the existing `h2` rule:

```css
h2 {
  margin: 1.4rem 0 0.6rem;
  padding: 0.3rem 0;
  font-size: 0.7rem;
  font-weight: 400;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
```

- [ ] **Step 2: Add the wash and the active-button styles**

```css
.current {
  background: rgba(224, 123, 90, 0.18);
  border-radius: 6px;
  margin: 0 -9px;
  padding: 0.15rem 9px;
}

#sing.singing {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--page);
  font-weight: 700;
}
```

- [ ] **Step 3: Toggle the classes in `sing.js`**

At `js/sing.js:150`, beside the existing `p.classList.toggle('sung', n < line);`, add:

```js
p.classList.toggle('current', n === line);
```

At `js/sing.js:52` and `js/sing.js:69`, beside each existing `document.getElementById('sing').textContent = …` assignment, toggle the class on that same element — `classList.add('singing')` at the `Stop` assignment (line 52), `classList.remove('singing')` at the `Sing` one (line 69).

- [ ] **Step 4: Regression**

Run: `npm test`
Expected: pass.

- [ ] **Step 5: Visual check (Review Focus 3)**

`npm run serve`, open a song. In the console run
`document.querySelector('[data-line="2"]').classList.add('current')`.
Expected: the line gains the terracotta wash; the negative margins hold the text in place (no shift). Press `+` (transpose re-renders, dropping the class — expected; during real singing `repaint()` re-applies it). Re-add the class, then run
`document.querySelectorAll('[data-line]').forEach(p => p.classList.add('sung'))`
expected: all lines fade to 0.35; the `.current` wash still shows through the dim.
Then run `document.getElementById('sing').classList.add('singing')`.
Expected: the button fills terracotta with coffee text — the "Stop" state from the approved mockup.

- [ ] **Step 6: Commit**

```bash
git add styles.css js/sing.js
git commit -m "feat(sing): current-line wash, print labels, active sing button"
```

---

### Task 5: Icon, manifest, apple-touch-icon

**Files:**
- Create: `icons/note.svg`, `icons/note-180.png`, `icons/note-192.png`, `icons/note-512.png`
- Modify: `manifest.json`, `index.html` (head links)

**Interfaces:**
- Consumes: palette values from Task 2.
- Produces: `icons/note-<size>.png` files referenced by `manifest.json` and `index.html`.

- [ ] **Step 1: Write `icons/note.svg`**

Exactly (system face renders the ♪ when rasterised — intended):

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#271E12"/>
  <text x="50%" y="54%" font-size="260" text-anchor="middle" dominant-baseline="middle" fill="#E9D9B9">&#9834;</text>
</svg>
```

- [ ] **Step 2: Rasterise the three sizes**

```bash
for size in 180 192 512; do
  qlmanage -t -s $size -o /tmp icons/note.svg >/dev/null 2>&1
  mv /tmp/note.svg.png icons/note-$size.png
done
```

Run: `sips -g pixelWidth -g pixelHeight icons/note-180.png icons/note-192.png icons/note-512.png`
Expected: 180, 192 and 512 square.

- [ ] **Step 3: Update `manifest.json`**

Add to the JSON object (keep existing keys):

```json
"background_color": "#271E12",
"theme_color": "#271E12",
"icons": [
  { "src": "icons/note-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "icons/note-512.png", "sizes": "512x512", "type": "image/png" }
]
```

- [ ] **Step 4: Add the apple-touch-icon link in `index.html`**

After the manifest link: `<link rel="apple-touch-icon" href="icons/note-180.png">`

- [ ] **Step 5: Verify**

Run: `python3 -m json.tool manifest.json > /dev/null && echo ok`
Expected: `ok`.
Run: `npm run serve` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/icons/note-180.png`
Expected: `200`. Kill the server.

- [ ] **Step 6: Commit**

```bash
git add icons/ manifest.json index.html
git commit -m "feat(pwa): home-screen icon and manifest colours"
```

---

### Task 6: Full regression and handoff checklist

**Files:**
- No new files. Fixes, if any, belong to the task whose check failed.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified branch ready for the human's iPhone hand-tests.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 2: Walk the app end to end**

`npm run serve` → songbook → song → transpose up/down → Share copies → back. Both a light-mode and dark-mode system setting.
Expected: lamplight everywhere; no unstyled flash of wrong colours; wordmark intact after every navigation.

- [ ] **Step 3: Font-outage check (Review Focus 4)**

Devtools network blocking on `fonts/*`, reload.
Expected: page renders in Georgia, readable, nothing shifts; the wordmark falls back cleanly.

- [ ] **Step 4: Deploy-path sanity**

Run: `npx wrangler deploy --dry-run --outdir /tmp/wrangler-dry` from `worker/` (or `wrangler deploy --dry-run` if wrangler is global).
Expected: build succeeds; `fonts/` and `icons/` are in the output assets. (The live iPhone hand-test list — home-screen icon, dim-room readability, real Sing session — belongs to the human, per the spec's Testing section.)

- [ ] **Step 5: Close out**

If any check produced fixes, commit them with the owning task's scope. Then `git status` — expected: clean.
