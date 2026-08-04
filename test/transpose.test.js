import test from 'node:test';
import assert from 'node:assert/strict';
import { transposeChord, transposeKey, prefersFlats } from '../js/transpose.js';

test('prefersFlats identifies the conventionally flat keys', () => {
  assert.equal(prefersFlats('F'), true);
  assert.equal(prefersFlats('Bb'), true);
  assert.equal(prefersFlats('Dm'), true);
  assert.equal(prefersFlats('G'), false);
  assert.equal(prefersFlats('Am'), false);
});

test('transposeKey moves major and minor keys', () => {
  assert.equal(transposeKey('C', 0), 'C');
  assert.equal(transposeKey('C', 2), 'D');
  assert.equal(transposeKey('C', 1), 'Db');
  assert.equal(transposeKey('Am', 3), 'Cm');
  assert.equal(transposeKey('G', -1), 'Gb');
});

test('transposeKey keeps sharp spellings where they are conventional', () => {
  assert.equal(transposeKey('Am', 4), 'C#m');
  assert.equal(transposeKey('Em', 2), 'F#m');
});

test('transposeChord shifts the root and keeps the quality text', () => {
  assert.equal(transposeChord('C', 2, false), 'D');
  assert.equal(transposeChord('Am', 3, false), 'Cm');
  assert.equal(transposeChord('C#m7', 3, false), 'Em7');
  assert.equal(transposeChord('Fsus4', 2, false), 'Gsus4');
  assert.equal(transposeChord('Bbmaj7', 1, false), 'Bmaj7');
  assert.equal(transposeChord('Gdim', 1, false), 'G#dim');
});

test('transposeChord shifts slash bass notes too', () => {
  assert.equal(transposeChord('C#m7/G#', 3, false), 'Em7/B');
  assert.equal(transposeChord('C/E', 5, false), 'F/A');
  assert.equal(transposeChord('Bb/D', 2, false), 'C/E');
});

test('spelling follows the preferFlats flag', () => {
  assert.equal(transposeChord('C', 1, true), 'Db');
  assert.equal(transposeChord('C', 1, false), 'C#');
});

test('transposition wraps around the octave in both directions', () => {
  assert.equal(transposeChord('B', 1, false), 'C');
  assert.equal(transposeChord('C', -1, false), 'B');
  assert.equal(transposeChord('C', 12, false), 'C');
  assert.equal(transposeChord('C', -13, false), 'B');
});

test('every root shifts correctly across all twelve semitones', () => {
  const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let i = 0; i < 12; i++) {
    for (let n = 0; n < 12; n++) {
      assert.equal(transposeChord(roots[i], n, false), roots[(i + n) % 12]);
    }
  }
});

test('transposing up then back down returns the original chord', () => {
  for (const n of [1, 2, 5, 7, 11]) {
    const up = transposeChord('C', n, prefersFlats(transposeKey('C', n)));
    assert.equal(transposeChord(up, -n, prefersFlats('C')), 'C');
  }
});

test('chords that do not match the grammar pass through unchanged', () => {
  assert.equal(transposeChord('N.C.', 2, false), 'N.C.');
  assert.equal(transposeChord('%', 2, false), '%');
});
