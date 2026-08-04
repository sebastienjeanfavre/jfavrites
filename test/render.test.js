import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLine } from '../js/render.js';

test('a line with no chords is a single chordless chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'hello world', chords: [] }),
    [{ chord: '', text: 'hello world' }],
  );
});

test('text before the first chord becomes a chordless chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'Amazing', chords: [{ index: 1, chord: 'G' }] }),
    [{ chord: '', text: 'A' }, { chord: 'G', text: 'mazing' }],
  );
});

test('a chord at index zero produces no leading chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'hello', chords: [{ index: 0, chord: 'C' }] }),
    [{ chord: 'C', text: 'hello' }],
  );
});

test('each chunk runs to the next chord', () => {
  assert.deepEqual(
    splitLine({
      lyric: 'ab cd ef',
      chords: [{ index: 0, chord: 'C' }, { index: 3, chord: 'G' }],
    }),
    [{ chord: 'C', text: 'ab ' }, { chord: 'G', text: 'cd ef' }],
  );
});

test('a chord at the end of the line yields an empty trailing chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'hi ', chords: [{ index: 3, chord: 'D' }] }),
    [{ chord: '', text: 'hi ' }, { chord: 'D', text: '' }],
  );
});
