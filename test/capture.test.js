import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE, resampler, ring, wav, wavSeconds, windower } from '../js/capture.js';

test('resampler turns a 44.1 kHz tone into the same tone at 16 kHz across block edges', () => {
  const inRate = 44100;
  const n = inRate * 2;
  const tone = (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t);
  const input = Float32Array.from({ length: n }, (_, k) => tone(k / inRate));
  const toRate = resampler(inRate);
  const parts = [];
  for (let k = 0; k < n; k += 128) parts.push(...toRate(input.subarray(k, k + 128)));

  assert.ok(Math.abs(parts.length - (n * RATE) / inRate) <= 1);
  const worst = Math.max(...parts.map((x, k) => Math.abs(x - tone(k / RATE))));
  assert.ok(worst < 1e-3, `worst error ${worst}`);
});

test('before the ring is full, latest returns only what was pushed', () => {
  const r = ring(4);
  r.push(Float32Array.of(1, 2));
  assert.deepEqual([...r.latest().samples], [1, 2]);
});

test('after the ring wraps, latest returns the newest samples in order', () => {
  const r = ring(4);
  r.push(Float32Array.of(1, 2, 3));
  r.push(Float32Array.of(4, 5, 6));
  assert.deepEqual([...r.latest().samples], [3, 4, 5, 6]);
});

test('a second read with no new samples is not fresh', () => {
  const r = ring(4);
  r.push(Float32Array.of(1));
  assert.equal(r.latest().fresh, true);
  assert.equal(r.latest().fresh, false);
});

test('wav writes clipped 16-bit samples behind a 16 kHz mono header', async () => {
  const view = new DataView(await wav(Float32Array.of(1, -1, 1.5, 0.5)).arrayBuffer());
  const text = (at) => String.fromCharCode(...new Uint8Array(view.buffer, at, 4));
  assert.equal(text(0), 'RIFF');
  assert.equal(text(8), 'WAVE');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8);
  assert.deepEqual([0, 1, 2, 3].map((k) => view.getInt16(44 + k * 2, true)), [32767, -32767, 32767, 16384]);
});

test('two windows in a row with no new audio report one stall', () => {
  const r = ring(4);
  const sent = [];
  let stalls = 0;
  const tick = windower(r, (blob) => sent.push(blob), () => stalls++);
  r.push(Float32Array.of(1));
  tick();
  tick();
  assert.equal(stalls, 0);
  tick();
  tick();
  assert.equal(stalls, 1);
  assert.equal(sent.length, 1);
});

test('wavSeconds reads the length of a window from the blob size', () => {
  assert.equal(wavSeconds(wav(new Float32Array(RATE * 3))), 3);
  assert.equal(wavSeconds(wav(new Float32Array(8000))), 0.5);
});
