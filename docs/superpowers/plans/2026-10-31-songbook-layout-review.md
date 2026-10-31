# Songbook Layout Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every chord sits on the chord row above its syllable, and every song reads cleanly on a 375 px phone.

**Architecture:** Two renderer fixes in `js/render.js` and `styles.css`, one punctuation fix in `splitWords`, then data fixes in `songs/*.chordpro`. Lyric lines keep their current line breaks, so Sing's line clock (`MAX_AHEAD`, `linePos`) is unchanged.

**Tech Stack:** Vanilla JS modules, `node --test`, ChordPro files.

**Spec:** none. The review findings below are the spec.

## Findings (the spec)

Measured in Chrome at 390 px on all 29 songs (2026-10-31):

1. A chunk with empty text has no line box. With `vertical-align: bottom` its chord drops to the lyric row. Seen on every line-final chord (`fly [Eb]`, `là [F] [G7]`) and on chord-only lines.
2. `splitLine` moves a whitespace-only slice into the chunk before it. On `[Am]   [C]    [D]    [F]` this gives `Am` 7 spaces, `C` 4, `D` and `F` none: uneven gaps, and `D`/`F` empty, so finding 1 hits them.
3. `splitWords` splits `quoi ? Papala` before the `?`, so a row can start with `?` or `!` (Je veux, twice at 390 px).
4. Chord alignment is otherwise exact: 0 chords offset from their syllable, 0 overflowing lines.
5. Data slips, listed in Task 3.
6. Chord-only lines too long for one row, `x2` and `|` written as lyrics: Task 4.

## Global Constraints

- Tests: `npm test` (`node --test`) must stay green; a red test blocks the Cloudflare deploy.
- A push to `main` is a production deploy. Commit only when the owner says so. No `Co-Authored-By` trailer. Conventional commits with a scope.
- Do not split or merge lyric lines; Sing counts lines.
- Chord files follow `.claude/skills/add-song/SKILL.md`: four labels, no new directives, no transposing.
- The owner's 8 untracked songs and the `songs/index.json` change are theirs; edit them only as Task 3 lists.

## Review Focus

- A chord at the very end of a lyric line must sit on the chord row — Task 1 browser check.
- Two chords with no text between them (`[C][G]word`) must stay level and apart — Task 1 browser check.
- After transposing (+1, giving `C#m7`-width chords) chord-only lines must still not drop — Task 1 browser check at `#let-it-be/+1`.
- A chord placed on the punctuation itself (`à [Eb]m'dire [Bb]?`) must not wrap alone — Task 2 test.
- A 375 px screen is the width floor for "fits one row" — Task 4 measurement.

---

### Task 1: Keep the chord row level

**Files:**
- Modify: `js/render.js` (`splitLine`, the leading-whitespace loop)
- Modify: `styles.css` (`.chunk`, `.word`)
- Test: `test/render.test.js`

**Interfaces:**
- Produces: `splitLine(line)` keeps a whitespace-only slice on its own chord.

- [ ] **Step 1: Write the failing test**

```js
test('a slice of only whitespace keeps it, so chord-only lines keep their spacing', () => {
  assert.deepEqual(
    splitLine({ lyric: '       ', chords: [{ index: 0, chord: 'Am' }, { index: 3, chord: 'C' }, { index: 7, chord: 'D' }] }),
    [{ chord: 'Am', text: '   ' }, { chord: 'C', text: '    ' }, { chord: 'D', text: '' }],
  );
});
```

- [ ] **Step 2: Run it, expect FAIL** — `node --test test/render.test.js`; actual has `Am` with 7 spaces.
- [ ] **Step 3: Implement** — move leading whitespace only when a non-space follows it (`/^\s+(?=\S)/`).
- [ ] **Step 4: Run, expect PASS** — `npm test`, all green.
- [ ] **Step 5: CSS** — `.chunk` and `.word` get `vertical-align: top`. Update the comment over `.chunk`/`.word` only if it now states something false.
- [ ] **Step 6: Browser check** — serve, render every song in a 390 px iframe; in every `p.line`, all non-empty `.chord` elements share one `top`. Also check `#let-it-be/+1`. Expected: 0 lines with uneven chord tops.

### Task 2: Keep `?`, `!`, `:`, `;`, `»` with the word before

**Files:**
- Modify: `js/render.js` (`splitWords`)
- Test: `test/render.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('a French spaced punctuation mark stays with the word before it', () => {
  assert.deepEqual(splitWords([{ chord: 'Gm', text: 'quoi ? Papala' }]), [
    [{ chord: 'Gm', text: 'quoi ' }, { chord: '', text: '? ' }],
    [{ chord: '', text: 'Papala' }],
  ]);
});

test('a chord on a punctuation mark does not let it wrap alone', () => {
  assert.deepEqual(splitWords([{ chord: 'Eb', text: "m'dire " }, { chord: 'Bb', text: '?' }]), [
    [{ chord: 'Eb', text: "m'dire " }, { chord: 'Bb', text: '?' }],
  ]);
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** — in the glue condition, also glue a piece that starts with `[!?:;»]`.
- [ ] **Step 4: Run, expect PASS** — `npm test`.

### Task 3: Fix chord slips

**Files:** `songs/je-laime-a-mourir.chordpro`, `songs/let-it-be.chordpro`, `songs/la-mauvaise-reputation.chordpro`, `songs/desole-pour-hier-soir.chordpro`

Rule: the same melody gets the same placement. Change only these:

- [ ] `je-laime-a-mourir`: verse 1 `l'espa[G7]ce` → `l'es[G7]pace` (as the last verse); `de les [C/B]retenir` → `de les re[C/B]tenir`; `d'lui apparte[C/B]nir` → `d'lui appar[C/B]tenir` (as `pour tout re[C/B]construire`).
- [ ] `let-it-be`: `let [F]it be, let [C]it be` → `let it [F]be, let it [C]be`; `There is [Am]still a light [Am/G]that [Fmaj7]shines on me[F6]` → `There is [Am]still a [Am/G]light that [Fmaj7]shines on [F6]me` (as verse 2's `still a chance`).
- [ ] `la-mauvaise-reputation`, chorus 1 lines 2–4 → the form of choruses 2–4: `[E]L'on suive une autre route qu'eux,` / `[Am]Non les braves gens n'aiment pas que,` / `[E]L'on suive une autre route qu'eux,`.
- [ ] `desole-pour-hier-soir`: `t'as [C]failli` → `t'as [Eb]failli` (the song is a Cm–Eb–Bb loop; same slot as `mon[Eb]té` in the matching line).
- [ ] Run the lint script; expect no new findings.

### Task 4: Fit chord-only lines on one row

**Files:** any `songs/*.chordpro` the measurement names; known: `let-it-be`, `lhorloge-tourne`.

- [ ] **Step 1:** `let-it-be`: replace each `x2` line by writing the line twice, without `x2`.
- [ ] **Step 2:** `lhorloge-tourne`: drop the `|` bar marks; keep two spaces inside a bar and four between bars. The outro starts `[F] |`; write it as the intro's full 8 chords.
- [ ] **Step 3:** After Task 1, measure at 375 px. Split each chord-only line that still takes 2+ rows at a bar or phrase boundary, near the middle. Expected after: 0 chord-only lines wrap at 375 px.
- [ ] **Step 4:** `npm test`, lint, and a visual pass (zoomed screenshots) of the changed songs.
### Task 5: Indent the wrapped rows of a lyric line

Owner chose option A (2026-10-31): a lyric line too long for one row shows its next rows indented, so a continued row does not look like a new line.

**Files:** `styles.css` (`.line`, `.chunk`, `.word`)

- [ ] **Step 1:** `.line` gets a 1em hanging indent (`padding-left: 1em; text-indent: -1em`). `text-indent` is inherited, so `.chunk` and `.word` reset it to `0`; without that every chord moves 1em left inside its chunk.
- [ ] **Step 2: Browser check** at 375 px: in each wrapped line, rows 2+ start 1em right of row 1; every chord still has 0 offset from its text.

### Finish

- [ ] `npm test`, lint, browser checks of Tasks 1, 4, 5 all pass.
- [ ] Ask the owner before committing. Suggested split: `fix(render): keep chords on the chord row` (Tasks 1, 2, 5) and `fix(songs): chord slips and chord-only lines` (Tasks 3–4).
