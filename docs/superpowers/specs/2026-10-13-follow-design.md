# Follow — Design

**Date:** 2026-10-13
**Status:** Approved for planning

## Problem

When I play guitar and sing, both hands are busy. The song view must follow my
position in the lyrics and scroll on its own, so I never touch the phone during
a song.

## What Follow does

- A Follow button in the song view starts the phone's mic.
- Audio goes to Infomaniak's Whisper service in short chunks.
- The app matches the returned text to the lyrics, marks the lines already
  sung, and scrolls so the current line stays in the upper third of the screen.
- A password gates the feature. Guests keep the plain song view.

## What Follow does not do

- Live word-by-word karaoke highlight. Lag is 5 to 15 seconds, by design.
- Scroll during instrumental sections. With no words recognised, the position
  holds.
- Work offline, or without the worker.
- Timed auto-scroll at a fixed speed. Considered as a no-network fallback and
  cut. The Web Speech API was also considered and cut: continuous mode on iOS
  Safari is fragile, and the model targets speech, not singing over a guitar.

## Decisions and constraints

- **Device:** iPhone Safari, as a tab or a home-screen web app. Safari records
  mp4 and stops the mic when the tab leaves the foreground or the screen locks.
- **Lag is acceptable.** Scrolling is the goal. The app keeps the next lines on
  screen, so a late cursor does not hurt.
- **The static app cannot call Infomaniak directly.** The API answers browser
  preflights without CORS headers. A proxy is required, and it holds the token.
- **The proxy is a Cloudflare Worker.** One file, free tier, deployed separately.
  A Netlify Function would need git-connected deploys; the app stays a dragged
  folder.
- **The worker also serves the app** as static assets from the repo root, so
  page and proxy share one origin and one deploy. CORS is not needed. Netlify
  is retired.
- **The password is a short shared secret**, not the API token. It is typed
  once on the phone and stored in `localStorage`.

## Architecture

```
iPhone Safari (static app)                 Cloudflare Worker            Infomaniak
──────────────────────────                 ─────────────────            ──────────
mic → MediaRecorder, 6 s chunks
      └─ POST /transcribe ───────────────▶ check password
         (audio, language, prompt)         POST transcriptions ───────▶ batch_id
                                           poll results every 1 s ◀───▶ status, data
      ◀── { text } ───────────────────────  return text on success
match text to lyrics → move cursor → mark lines → scroll
```

Three new units, each with one job:

| Unit | Job | Depends on |
|---|---|---|
| `worker/index.js` | Password check, forward audio, poll, return text | Infomaniak API |
| `js/align.js` | Pure matching: lyrics + cursor + transcript → new cursor | nothing |
| `js/follow.js` | Mic, upload loop, cursor state, line classes, scroll | `align.js`, the parsed song, the DOM |

`app.js` gains the Follow button wiring and stops following on route change.
`render.js` adds a line-number data attribute to each rendered line so
`follow.js` can find lines without re-parsing.

The songbook list and the guest song view do not change.

## The worker

Route: `POST /transcribe`. Multipart body with `file`, `language`
(optional), and `prompt`. Header `X-Password`.

Secrets, set with `wrangler secret put`: `INFOMANIAK_TOKEN`,
`INFOMANIAK_PRODUCT_ID`, `FOLLOW_PASSWORD`.

Per request:

1. Wrong or missing password → 401.
2. Forward to
   `POST https://api.infomaniak.com/1/ai/{product_id}/openai/audio/transcriptions`
   with `Authorization: Bearer <token>`, fields `file`, `model: whisper`,
   `language` if given, `prompt`, `response_format: json`. Response holds
   `batch_id`.
3. Poll `GET /1/ai/{product_id}/results/{batch_id}` every second, up to
   25 seconds. `status` is one of pending, processing, success, failed,
   cancelled. On success the `data` field holds the result.
4. Return `{ text }` on success. Return 502 on failed, cancelled, or timeout.

The worker serves the app too, so page and proxy share one origin and no CORS
headers are needed. Polling runs in the worker, not on the phone: one request
per chunk is simpler than a polling loop under Safari's tab limits, and the free
tier counts CPU time, not wait time.

Deployment: `wrangler deploy` from `worker/`. A README in the folder lists the
three secrets. No CI.

## Capture and upload loop

On tap of Follow:

- Request the mic with `getUserMedia`.
- Request a screen wake lock (Safari 16.4+).
- Loop: start `MediaRecorder`, stop after 6 seconds, send the blob, start
  again at once. Safari cannot split one recording into standalone files, so
  the recorder restarts per chunk. Each blob is a complete mp4.
- Send each blob with the song language and a prompt of about 150 lyric words
  around the cursor. Whisper's `prompt` biases recognition toward those words.
- Uploads run in a pipeline. Recording never waits for a result.

Lag budget per chunk: chunk length, about 1 s upload, 2 to 5 s at Infomaniak,
up to 1 s poll. Chunk length is the largest term. Shorter chunks cut lag but
give Whisper less context; under about 4 s accuracy on sung lyrics drops. The
6 s start value lives in one constant, to tune after a real test: 5 if lag
feels long, 8 if recognition is poor.

Following stops on its own when:

- Follow is tapped again.
- The route changes (back link, another song).
- The tab goes to the background. Safari stops the mic anyway.
- The cursor reaches the last lyric line.

Language: each song file carries `{meta: language fr}` or
`{meta: language en}`, ChordPro's standard meta extension. The add-song skill
sets it for new songs; the nine existing files get it by hand. When absent,
the app sends no language and Whisper detects it.

## Matching

Preparation, once per song load, in `align.js`:

- Flatten all lyric lines into one word list. Each word keeps its line number.
  Chord-only lines add no words.
- Normalise each word: lowercase, strip accents, strip punctuation. The same
  function normalises transcripts.

The cursor is a word index. The current line follows from it.

Per transcript:

1. Normalise into words. Empty → no move.
2. Consider start positions from the cursor to 60 words ahead. For each,
   compute the longest common subsequence between the transcript words and the
   lyric words from that position. LCS tolerates missed, extra, and misheard
   words.
3. Accept the best position if at least 3 words match and at least 40 percent
   of transcript words match. Otherwise hold.
4. New cursor = the word after the last matched word. Ignore it unless it is
   ahead of the current cursor. This makes late and out-of-order results
   harmless.
5. Ties pick the earliest position, so a repeated chorus resolves to the next
   occurrence.

Window size and thresholds are constants beside the chunk length.

## On screen

- Lines before the cursor line get class `sung`, which dims them. The cursor
  line gets class `current`. Nothing else about the rendering changes.
- When the cursor line changes, the page scrolls smoothly so that line sits
  about 30 percent from the top. Scrolling happens only on a cursor move, so a
  finger scroll is never fought.
- Transposing re-renders the lines. Classes are re-applied from the cursor, so
  the position survives.
- The Follow button sits in the header next to Share. Labels: "Follow" idle,
  "Stop" active. Everyone sees it; only the password makes it work.
- First tap with no stored password opens a plain `prompt()`. The password is
  stored in `localStorage`. The worker URL is a constant in `follow.js`.
- A one-line status element under the header shows "Listening" while active,
  and an error for 3 seconds when following stops on its own.

## Errors

Following stops and shows a message when:

- Mic permission is denied.
- The worker answers 401. The stored password is forgotten, so the next tap
  asks again.
- Three worker calls fail in a row (network or 502). A single failure is
  skipped and the loop continues.

While following, the app logs each transcript and cursor move to the console.
Safari Web Inspector then shows why a chunk did or did not match, which is the
only way to tune the constants.

## Tests

- `test/align.test.js`, pure functions: accents and punctuation normalise;
  the cursor only moves forward; a repeated chorus picks the nearest
  occurrence; noise below the threshold holds; missing words still match.
- `test/worker.test.js`, handler with a mocked `fetch`: wrong password gives
  401; success after two pending polls returns the text; failed status gives
  502.
- Capture, wake lock, and scrolling are tested by hand on the iPhone.
