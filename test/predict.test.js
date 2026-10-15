import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from '../js/chordpro.js';
import { buildWords } from '../js/align.js';
import { chordMap } from '../js/predict.js';

const song = parse(`{comment: Intro}
| [C] [G] |

{comment: Verse}
Oh [C]the sun is [G]up
[C]Now we [G]sing a[F]gain
No chords on this one
[C]Last [G]line
`);

// Chords: intro C=0 G=1, line 1 C=2 G=3, line 2 C=4 G=5 F=6, line 4 C=7 G=8.
test('each word takes the chord at or before it, a line without chords keeps the previous one', () => {
  const { wordChord } = chordMap(song);
  assert.deepEqual(wordChord, [
    1, 2, 2, 2, 3,
    4, 4, 5, 5,
    6, 6, 6, 6, 6,
    7, 8,
  ]);
});

test('the first word of a song before any chord takes chord 0', () => {
  const { wordChord } = chordMap(parse('Hey [C]you'));
  assert.deepEqual(wordChord, [0, 0]);
});

test('lineStart is the first chord of each line; a line without chords takes the count so far', () => {
  assert.deepEqual(chordMap(song).lineStart, [0, 2, 4, 7, 7]);
  assert.deepEqual(chordMap(parse('[C]a\nb')).lineStart, [0, 1]);
});

test('chordMap gives one chord per word for every song in songs/', () => {
  for (const file of readdirSync('songs').filter((f) => f.endsWith('.chordpro'))) {
    const s = parse(readFileSync(`songs/${file}`, 'utf8'));
    assert.equal(chordMap(s).wordChord.length, buildWords(s).length, file);
  }
});
