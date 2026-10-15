import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from '../js/chordpro.js';
import { buildWords } from '../js/align.js';
import { chordMap, predictLine, heardWords } from '../js/predict.js';

const song = parse(`{comment: Intro}
| [C] [G] |

{comment: Verse}
Oh [C]the sun is [G]up
[C]Now we [G]sing a[F]gain
No chords on this one
[C]Last [G]line
`);

// Chords: intro C=0 G=1, line 1 C=2 G=3, line 2 C=4 G=5 F=6, line 4 C=7 G=8.
// A word's position is the chord at or before it plus half its word index.
test('each word takes the chord at or before it plus half a unit per word', () => {
  const { wordPos } = chordMap(song);
  assert.deepEqual(wordPos, [
    1, 2.5, 3, 3.5, 5,
    6.5, 7, 8.5, 9,
    10.5, 11, 11.5, 12, 12.5,
    14, 15.5,
  ]);
});

test('the first word of a song before any chord takes chord 0', () => {
  const { wordPos } = chordMap(parse('Hey [C]you'));
  assert.deepEqual(wordPos, [0, 0.5]);
});

test('a line starts at its first chord plus half its first word index', () => {
  assert.deepEqual(chordMap(song).linePos, [0, 2, 6.5, 11.5, 14]);
  assert.deepEqual(chordMap(parse('[C]a\nb')).linePos, [0, 1.5]);
});

test('chordMap gives one position per word for every song in songs/', () => {
  for (const file of readdirSync('songs').filter((f) => f.endsWith('.chordpro'))) {
    const s = parse(readFileSync(`songs/${file}`, 'utf8'));
    assert.equal(chordMap(s).wordPos.length, buildWords(s).length, file);
  }
});

// Lines start at chords 0, 4, 8, 14, 18, 22. Anchors give 1 chord per second.
const starts = [0, 4, 8, 14, 18, 22];
const first = { t: 0, pos: 0 };
const last = { t: 10000, pos: 10 };

test('no prediction without anchors or with anchors less than 6 s apart', () => {
  assert.equal(predictLine(starts, null, null, 20000, 2), 2);
  assert.equal(predictLine(starts, first, { t: 5000, pos: 5 }, 20000, 2), 2);
  assert.equal(predictLine(starts, first, { t: 6000, pos: 6 }, 20000, 2), 4);
  assert.equal(predictLine(starts, first, last, 10000, 2), 2);
});

test('the line moves when the predicted chord reaches the next line', () => {
  assert.equal(predictLine(starts, first, last, 13000, 2), 2);
  assert.equal(predictLine(starts, first, last, 14000, 2), 3);
});

test('the prediction stops MAX_AHEAD lines past the confirmed line and at the last line', () => {
  assert.equal(predictLine(starts, first, last, 110000, 2), 4);
  assert.equal(predictLine(starts, first, last, 110000, 4), 5);
  assert.equal(predictLine(starts, first, last, 110000, 5), 5);
});

test('two anchors on the same chord hold the line', () => {
  assert.equal(predictLine(starts, { t: 0, pos: 9 }, { t: 10000, pos: 9 }, 60000, 2), 2);
});

test('heardWords expands each Whisper word into normalised words that keep its end time', () => {
  const heard = heardWords([
    { start: 0, end: 0.3, word: " I'm" },
    { start: 0.3, end: 0.5, word: ' ...' },
    { start: 0.5, end: 0.9, word: ' tired' },
  ]);
  assert.deepEqual(heard, [
    { word: 'i', end: 0.3 },
    { word: 'm', end: 0.3 },
    { word: 'tired', end: 0.9 },
  ]);
});
