# Sing prediction — Design

**Date:** 2026-10-15
**Status:** Draft, for review
**Builds on** `2026-10-13-sing-buffer-design.md`. Capture, matching and the
worker do not change.

## Problem

A result arrives 3–6 s after the words were sung. The highlighted line is
that far behind the singer. Results also stop for a while when the server is
slow, or when Whisper does not recognise a refrain ("dam dam déo").

## Solution

Between results, move the highlighted line forward at the measured speed of
the song. A result then corrects the position.

The clock unit is the **chord**, not the word. Chords per second is close to
the tempo and is steady through a song. Words per chord is not: 1.5 in
Let It Be, 4.5 in Il est libre Max, and it changes from line to line. The
sheet also has chords where there are no words, so a solo or an unrecognised
refrain is not a pause for this clock.

Every chord counts as one unit. Chord lengths differ, but the average over
the song is right by definition, and the display only needs the line. If a
song shows lines early or late in a way you can hear, a later change can add
a bar count to the sheet.

## Rules

1. **Position.** The confirmed position is the chord under the last confirmed
   word. A word before the first chord of its line takes the previous chord.
2. **Anchor.** When a result moves the cursor, record `(t, chord)` where `t`
   is the time the window was cut, not when the result came back. The gap
   between the two is what the prediction absorbs. A result from a window
   older than the last anchor does not replace it.
3. **Speed.** Only the first and the latest anchor are kept. Speed is
   `(last.chord − first.chord) / (last.t − first.t)`. A hold between them
   counts: the chords were sung and came in late.
4. **Start.** No prediction until the two anchors are at least 10 s apart.
5. **Prediction.** `chord = last.chord + speed × (now − last.t)`. If it is
   at or past the first chord of the line after the confirmed line, show that
   line. The cap is one line past the confirmed line, of any kind.
6. **Forward only.** The shown line is the greatest of: the shown line so
   far, the confirmed line, the predicted line. The confirmed line is the
   line of the next word to sing, as today.
7. **Stop.** The stop at the last line still uses the confirmed cursor.

What this costs, accepted:

- A 30 s break to talk makes the speed about 15 % lower for the rest of a
  3-minute song.
- A singer who stops sees the display go one line ahead and wait.
- A line without chords has zero length in this clock. The 14 such lines in
  Les copains d'abord get chords in the sheet.

## Units

| Unit | Job |
|---|---|
| `js/predict.js` (new) | `chordMap(song)` and `predictLine(...)`, both pure |
| `js/sing.js` | Record anchors, run a 250 ms tick, paint the shown line |

### `predict.js`

- `chordMap(song)` returns `{ wordChord, lineStart }`. `wordChord[i]` is the
  global chord index of word `i`, in `buildWords` order. `lineStart[n]` is the
  global index of the first chord of line `n`; a line with no chords gets the
  index of the next chord.
- `predictLine(lineStart, first, last, now, line)` returns `line + 1` when
  the prediction reaches it, else `line`. It returns `line` when there is no
  prediction yet (rule 4) or when `line` is the last line.

### `sing.js`

- The session gets `wordChord`, `lineStart`, `first`, `last`, `shown`
  (starts at the confirmed line) and `tick`.
- `onWindow` records `performance.now()` and passes it with the blob through
  `send` and `transcribe`.
- After a result moves the cursor: set the anchors (rule 2), then
  `shown = max(shown, confirmed line)`.
- The tick every 250 ms: `shown = max(shown, predictLine(...))`. Paint only
  when `shown` changes.
- `paint` highlights and scrolls to `shown`. Lines before `shown` are
  `sung`.
- `stopSing` clears the tick.

## Tests

Node, `test/predict.test.js`, with a small ChordPro fixture:

- A word before the first chord of its line takes the previous chord.
- An instrumental line gets a start and adds chords; a line without chords
  gets the next line's start.
- Anchors 9 s apart give no prediction; 10 s apart do.
- Speed 1 chord/s, next line 4 chords ahead: at +3 s the line holds, at +4 s
  it moves.
- At +100 s the result is `line + 1`, not further.
- On the last line the result is the last line.

The forward-only rule and the out-of-order anchor rule are two `Math.max`
and one `if` in `sing.js`; they are checked by hand.

By hand on the iPhone, with the debug overlay:

- L'horloge tourne: the "dam dam déo" refrain. The line should move during
  the refrain, not hold 18 s as today.
- Let It Be: many chords per line, held notes.
- Check: the highlighted line is the one being sung most of the time, no
  jump back.
