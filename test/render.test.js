import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLine, splitWords } from '../js/render.js';

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

test('chunks separated by a space are breakable groups', () => {
  const chunks = splitLine({
    lyric: 'hello world',
    chords: [{ index: 0, chord: 'C' }, { index: 6, chord: 'G' }],
  });
  assert.deepEqual(splitWords(chunks), [
    [{ chord: 'C', text: 'hello ' }],
    [{ chord: 'G', text: 'world' }],
  ]);
});

test('a boundary inside a word keeps the chunks in one unbreakable group', () => {
  const chunks = splitLine({
    lyric: 'Désolé pour hier soir',
    chords: [
      { index: 0, chord: 'Am' },
      { index: 3, chord: 'C' },
      { index: 12, chord: 'G' },
      { index: 17, chord: 'D' },
    ],
  });
  assert.deepEqual(splitWords(chunks), [
    [{ chord: 'Am', text: 'Dés' }, { chord: 'C', text: 'olé ' }],
    [{ chord: '', text: 'pour ' }],
    [{ chord: 'G', text: 'hier ' }],
    [{ chord: 'D', text: 'soir' }],
  ]);
});

test('a boundary before a leading space does not let a wrapped line start with a space', () => {
  const chunks = [
    { chord: 'F', text: 'mai' },
    { chord: 'G', text: ' son' },
  ];
  assert.deepEqual(splitWords(chunks), [[{ chord: 'F', text: 'mai' }, { chord: 'G', text: ' son' }]]);
});

test('a chord slice starting with whitespace folds it into the previous chunk', () => {
  assert.deepEqual(
    splitLine({ lyric: 'réveille comme', chords: [{ index: 8, chord: 'Eb' }] }),
    [{ chord: '', text: 'réveille ' }, { chord: 'Eb', text: 'comme' }],
  );
});

test('a chunk of several words wraps between its words, the chord stays on the first', () => {
  assert.deepEqual(splitWords([{ chord: 'Cm', text: 'matin, 15 heures' }]), [
    [{ chord: 'Cm', text: 'matin, ' }],
    [{ chord: '', text: '15 ' }],
    [{ chord: '', text: 'heures' }],
  ]);
});
