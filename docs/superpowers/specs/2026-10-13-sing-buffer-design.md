# Sing buffer — Design

**Date:** 2026-10-13
**Status:** Draft, for review
**Replaces:** the "Capture and upload loop" section of
`2026-10-13-follow-design.md`. The rest of that spec stays valid.

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
- Whisper still gets 6 s of audio, so accuracy stays the same.
- A word cut at the edge of one window is complete in the next window.
- Lag: about 4.6 s on average, 6 s at worst.
- Cost: 2× the audio minutes. A 4-minute song costs about 8 billed minutes.

MediaRecorder cannot do this on iOS Safari: one recording cannot be split
into standalone files. So the app records raw audio into a ring buffer and
builds a WAV file for each window.

## Evidence from the spike

A throwaway page on a Cloudflare preview version, tested on the iPhone with
a French song and a guitar:

- An `AudioWorklet` reads the mic in iOS Safari.
- Infomaniak accepts 16 kHz mono WAV. 14 calls in about 40 s, all 200,
  no rate limit.
- Upload and transcription took 2.1–4.4 s.
- The text was accurate with no prompt. Overlapping windows repeated the
  shared words as expected.

## What does not change

- The worker.
- `advance()` and its constants. Results that arrive late, twice, or out of
  order cannot move the cursor back.
- Painting, scrolling, the button, the status line, the password.
- Stop conditions: Stop tapped, route change, tab hidden, last line reached.

## Out of scope

- Position prediction between results. It gets its own spec after a test of
  this change on the phone.
- Shorter windows, faster polls, lower bitrate.
- A streaming transcription service.

## Units

| Unit | Job | Depends on |
|---|---|---|
| `js/capture-worklet.js` (new) | Post each block of mic samples to the main thread | nothing |
| `js/capture.js` (new) | Resample to 16 kHz, keep the last 6 s, encode WAV, call back every 3 s | the worklet |
| `js/sing.js` | Session, upload, cursor, paint. Uses `capture.js` instead of MediaRecorder | `capture.js`, `align.js` |
| `js/align.js` | `promptFor` gets a mode | nothing |

`capture-worklet.js` must be its own file. `audioWorklet.addModule` loads a
module by URL.

### `capture.js`

Pure parts, testable in Node:

- `resampler(inRate)` returns a function. It takes a block of samples at
  `inRate` and returns the samples at 16 kHz, with linear interpolation. It
  keeps the fractional position between blocks, so block edges add no error.
  iPhones run at 48 kHz; 44.1 kHz must also work.
- `ring(size)` returns `{ push(samples), latest() }`. `latest()` returns
  the samples in time order, at most `size` of them.
- `wav(samples)` returns a 16-bit PCM mono 16 kHz WAV `Blob`.

Browser part:

- `startCapture(context, stream, onWindow)` connects the mic to the worklet,
  feeds the ring, and calls `onWindow(blob)` every `HOP_MS`. It returns a
  `stop()` function.
- The worklet node connects to `context.destination` and outputs silence.
  A worklet with no output connection may not run.
- Before the ring is full, a window holds what the ring has. The first
  window is 3 s long. The spike showed that this still transcribes well.

Constants: `RATE = 16000`, `WINDOW_S = 6`, `HOP_MS = 3000`.

A 6 s window is about 190 KB, which is about 0.5 Mbit/s of upload.

### `sing.js`

- `startSing` creates the `AudioContext` before its first `await`. iOS
  only allows audio to start from a tap.
- After `getUserMedia`, the session calls `startCapture`. Each window goes to
  `send()` as today, with the file name `chunk.wav`.
- `stopSing` calls the capture `stop()`, closes the context, and stops the
  mic tracks. The start race (`generation`) also closes the context.
- `recordChunk`, `CHUNK_MS`, the recorder and the timer are removed.
- On each failed call, the app logs the HTTP status and the worker's error
  text. This shows a rate limit in Web Inspector.
- 3 failures in a row still stop Sing. With a window every 3 s, this is
  about 9 s instead of 18 s.

About 2 calls are in flight at the same time: a call takes about 3 s, and a
new one starts every 3 s.

### Prompt mode

Whisper reads the prompt as the text before the audio. When only the guitar
plays, it can copy the prompt. Today the prompt is the lyrics ahead of the
cursor, so an echo moves the cursor forward. The spike was accurate with no
prompt.

`PROMPT_MODE` in `sing.js` takes one of three values:

- `ahead`: from one line before the cursor line, forward. This is the
  current behaviour and the default.
- `before`: the lyrics already sung, ending at the cursor line. An echo
  lands behind the cursor, and `advance()` ignores it.
- `none`: no prompt.

`promptFor(lyrics, line, mode)` returns the text. For `none`, `send()` does
not set the field. The best value is chosen after the phone test, and the
other modes are then removed.

## Tests

Node, in `test/capture.test.js`:

- A 440 Hz tone at 48 kHz and at 44.1 kHz, pushed in 128-sample blocks,
  comes out at 16 kHz with 440 Hz and the right sample count.
- After the ring wraps, `latest()` returns the newest samples in order.
- `wav()` writes a valid header: RIFF, PCM, 1 channel, 16000 Hz, 16 bit,
  and the right data length.

Node, in `test/align.test.js`:

- `promptFor` with `before` ends at the cursor line and does not include
  later lines.

By hand on the iPhone:

- A full song with a guitar solo, once for each prompt mode.
- Check: the lag feels shorter, no words are lost, the cursor holds during
  the solo, and no 502s appear in Web Inspector.
