# Sing buffer — Design

**Date:** 2026-10-13
**Status:** Draft, for review
**Replaces** these parts of `2026-10-13-follow-design.md`: the "Capture and
upload loop" section, "Safari records mp4", "lag is 5 to 15 seconds", and the
lyric prompt. The rest of that spec stays valid.

## Problem

Sing scrolls too late. Today the app records 6 s chunks one after the other.
A word waits for its chunk to end, then for upload and transcription.

| Step | Time |
|---|---|
| Wait for the chunk to end | 0–6 s |
| Upload, transcription, poll (measured) | 2.1–4.4 s, about 3.1 s |
| **Total lag** | **about 6 s on average, 9 s at worst** |

Shorter chunks are not the solution. A test with 5 s chunks, a bitrate cap
and 400 ms polls (commit `cbc69ab`) made recognition worse and stopped the
scroll. It was reverted.

## Solution

Keep 6 s windows, but start a new window every 3 s. The windows overlap by
3 s, so each word is in two windows.

- A result arrives every 3 s instead of every 6 s.
- Whisper still gets 6 s of audio.
- A word cut at the edge of one window is complete in the next window.
- Cost: 2× the audio minutes. A 4-minute song costs about 8 billed minutes.

MediaRecorder cannot do this on iOS Safari: one recording cannot be split
into standalone files. So the app records raw audio into a ring buffer and
builds a WAV file for each window.

Two MediaRecorders started 3 s apart would need less code. They were not
chosen: they are not tested on iOS, they still lose audio at each restart,
and they send AAC, which was in use when `cbc69ab` failed.

## What this buys

Three changes, each judged by the phone test:

| Change | Expected gain |
|---|---|
| Overlap | Lag from about 6 s to 4.6 s on average, 9 s to 6 s at worst |
| WAV instead of AAC | Possibly better recognition. The spike was accurate. |
| No prompt | No echo of future lyrics during guitar-only parts |

## Evidence from the spike

A throwaway page on a Cloudflare preview version, tested on the iPhone with
a French song and a guitar:

- An `AudioWorklet` reads the mic in iOS Safari. The page created the
  `AudioContext` before `getUserMedia`. This order is proven.
- Infomaniak accepts 16 kHz mono WAV. 14 calls in about 40 s, all 200,
  no rate limit.
- Upload and transcription took 2.1–4.4 s.
- The text was accurate with no prompt. Overlapping windows repeated the
  shared words as expected.

## What does not change

- The worker.
- Painting, scrolling, the button, the status line, the password.
- Stop conditions: Stop tapped, route change, tab hidden, last line reached.

## Out of scope

- Position prediction between results. It gets its own spec after a test of
  this change on the phone.
- Shorter windows, faster polls, lower bitrate.
- A streaming transcription service.
- A limit on calls in flight. If Infomaniak gets slower than 3 s per call,
  calls pile up and late results are useless. Add a limit only if the
  phone test shows it.

## Units

| Unit | Job | Depends on |
|---|---|---|
| `js/capture-worklet.js` (new) | Post each block of mic samples to the main thread | nothing |
| `js/capture.js` (new) | Resample to 16 kHz, keep the last 6 s, encode WAV, call back every 3 s | the worklet |
| `js/sing.js` | Session, upload, cursor, paint. Uses `capture.js` instead of MediaRecorder | `capture.js`, `align.js` |
| `js/align.js` | `advance()` looks back; prompt code removed | nothing |

### `capture.js`

Pure parts, testable in Node:

- `resampler(inRate)` returns a function. It takes a block of samples at
  `inRate` and returns the samples at 16 kHz, with linear interpolation. It
  keeps the fractional position between blocks, so block edges add no error.
- `ring(size)` returns `{ push(samples), latest() }`. `latest()` returns
  the samples in time order, at most `size` of them. It also tells whether
  new samples arrived since the last call.
- `wav(samples)` returns a 16-bit PCM mono 16 kHz WAV `Blob`. Samples are
  clipped to −1…1 before conversion.

Browser part:

- `startCapture(context, stream, onWindow)` is async. It loads the worklet
  from `new URL('./capture-worklet.js', import.meta.url)`, connects the mic
  to it, feeds the ring, and calls `onWindow(blob)` every `HOP_MS`. It
  resolves to a `stop()` function.
- The resampler uses `context.sampleRate`, read at run time. iPhones
  usually run at 48 kHz. A Bluetooth headset can give 16 or 24 kHz.
- The worklet node connects to `context.destination` and outputs silence.
  A worklet with no output connection may not run.
- Before the ring is full, a window holds what the ring has. The first
  window is 3 s long. The spike showed that this still transcribes well.
- A window with no new samples since the last one is not sent. After two
  such windows in a row, `startCapture` calls `onStall`.

Constants: `RATE = 16000`, `WINDOW_MS = 6000`, `HOP_MS = 3000`.

A 6 s window is about 190 KB, which is about 0.5 Mbit/s of upload.

### `sing.js`

Start order:

1. Synchronous checks as today: password, words.
2. Create the `AudioContext`. This is still before the first `await`, so
   iOS treats it as part of the tap.
3. `await getUserMedia`. If the mic is blocked, close the context.
4. Check the start race (`generation`) as today. If lost, close the context
   too.
5. `await startCapture`. Then check that the session is still current. If
   not, call the returned `stop()`.

Other changes:

- Each window goes to `send()` with the file name `chunk.wav` and no prompt.
- `stopSing` calls the capture `stop()`, closes the context, and stops the
  mic tracks.
- If two windows in a row bring no new audio, Sing stops with "Audio
  interrupted". This covers phone calls, Siri, other apps that take the
  audio, and a context that never starts. A context state check was not
  used: iOS may report `interrupted` for a moment while the mic starts.
- `recordChunk`, `CHUNK_MS`, the recorder, the timer and the lyric list are
  removed.
- On each failed call, the app logs the HTTP status and the worker's error
  text. This shows a rate limit in Web Inspector.
- 3 failures in a row still stop Sing. About 2 calls are in flight at the
  same time, so an outage stops Sing after about 6 s.

### `align.js`

**Prompt removed.** `promptFor`, `lyricLines` and `PROMPT_WORDS` are deleted.
`send()` no longer sets the `prompt` field. If the phone test is worse
without a prompt, a follow-up adds the lyrics already sung as the prompt.

`MAX_HEARD` stays. Nobody sings 40 words in 6 s, and Whisper can still
hallucinate text over a guitar.

**`advance()` looks back.** About half of each window is words already
behind the cursor. Today `advance()` only searches forward from the cursor.
When a line repeats close by, the old half plus the new half match the next
repeat better than the true place, and the cursor jumps ahead.

- Search start positions from `cursor − LOOKBACK` to `cursor + LOOKAHEAD`.
  `LOOKBACK = 20` words covers 3 s of overlap plus timing noise.
- Return `max(cursor, best.last + 1)`. The cursor still never moves back.
- Ties pick the earliest position. A window of only words just sung then
  holds the cursor, even when the same words repeat ahead. A line sung again
  still moves forward, because its window also holds the words before it.
  The cost: a repeat right after a pause, with its twin less than 20 words
  behind, holds for one window.

With the old half matched at its true place, the 40 % ratio check also sees
the full window as matched.

## Tests

Node, in `test/capture.test.js`:

- A 440 Hz tone at 44.1 kHz, pushed in 128-sample blocks, comes out close to
  a 440 Hz tone generated at 16 kHz, within a small tolerance. The sample
  count is within 1 of `n × 16000 / 44100`. 44.1 kHz tests the fractional
  carry; 48 kHz does not.
- After the ring wraps, `latest()` returns the newest samples in order.
- `wav()` of `[1.0, −1.0, 1.5, 0.5]` decodes to `32767, −32767, 32767, 16384`
  in a valid 16 kHz mono header.

Node, in `test/align.test.js`:

- A window that holds the end of one repeated line and the start of the next
  one moves the cursor to the true place, not to a later repeat.
- The echo test uses a literal 41-word string instead of `promptFor`.
- The `promptFor` and `lyricLines` tests are deleted.

By hand on the iPhone:

- A full song with a guitar solo and a repeated chorus.
- Check: the lag feels shorter, no words are lost, the cursor holds during
  the solo, the chorus does not jump ahead, and no 502s appear in Web
  Inspector.
