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
    [{ chord: 'Am', text: 'Dés' }, { chord: 'C', text: 'olé pour ' }],
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

test('a chordless line is a single group', () => {
  assert.deepEqual(splitWords([{ chord: '', text: 'la la la' }]), [[{ chord: '', text: 'la la la' }]]);
});
