import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../js/chordpro.js';
import {
  normalise, buildWords, lyricLines, currentLine, advance, promptFor, startCursor, PROMPT_WORDS,
} from '../js/align.js';

const song = parse(`{title: Amazing Grace}
{artist: Traditional}
{key: G}

{comment: Intro}
[G]    [C]    [G]

{comment: Verse 1}
A[G]mazing grace how [G7]sweet the [C]sound
That [G]saved a wretch like [D]me
I [G]once was lost but [G7]now am [C]found
Was [G]blind but [D]now I [G]see

{comment: Verse 2}
'Twas [G]grace that taught my [G7]heart to [C]fear
And [G]grace my fears re[D]lieved
How [G]precious did that [G7]grace ap[C]pear
The [G]hour I [D]first be[G]lieved
`);

// Word indices: line 1 = 0-5, line 2 = 6-11, line 3 = 12-19, line 4 = 20-25,
// line 5 = 26-33, line 6 = 34-38, line 7 = 39-44, line 8 = 45-49.
const words = buildWords(song);

test('normalise drops case, accents and punctuation', () => {
  assert.deepEqual(normalise('Mère, l’Été! '), ['mere', 'l', 'ete']);
});

test('straight and curly apostrophes normalise the same', () => {
  assert.deepEqual(normalise("l'horloge"), normalise('l’horloge'));
});

test('chord-only lines add no words but keep their line number', () => {
  assert.deepEqual(words.slice(0, 2), [
    { word: 'amazing', line: 1 },
    { word: 'grace', line: 1 },
  ]);
  assert.equal(words.length, 50);
});

test('lyricLines keeps one entry per rendered line', () => {
  const lines = lyricLines(song);
  assert.equal(lines.length, 9);
  assert.equal(lines[1], 'Amazing grace how sweet the sound');
});

test('currentLine is the line of the next expected word, clamped at the end', () => {
  assert.equal(currentLine(words, 0), 1);
  assert.equal(currentLine(words, 6), 2);
  assert.equal(currentLine(words, 50), 8);
});

test('advance moves the cursor past the last matched word', () => {
  assert.equal(advance(words, 0, 'amazing grace how sweet the sound'), 6);
});

test('advance tolerates missed and misheard words', () => {
  assert.equal(advance(words, 0, 'amazing grey sweet sound'), 6);
});

test('advance holds when fewer than three words match', () => {
  assert.equal(advance(words, 0, 'hello there friends of mine'), 0);
});

test('advance holds when under forty percent of the transcript matches', () => {
  assert.equal(advance(words, 0, 'amazing grace sound x y z w q r s'), 0);
});

test('advance never moves backwards', () => {
  assert.equal(advance(words, 12, 'amazing grace how sweet the sound'), 12);
});

test('a repeated line resolves to the nearest occurrence ahead', () => {
  const twice = parse(`{title: Twice}
{artist: Traditional}
{key: G}

Amazing grace how sweet the sound
That saved a wretch like me
Amazing grace how sweet the sound
That saved a wretch like me
`);
  const w = buildWords(twice);
  assert.equal(advance(w, 0, 'amazing grace how sweet the sound'), 6);
  assert.equal(advance(w, 6, 'amazing grace how sweet the sound'), 18);
});

test('advance at the end of the words returns the cursor', () => {
  assert.equal(advance(words, 50, 'amazing grace'), 50);
});

test('advance matches near the end when the transcript is longer than the lyrics left', () => {
  assert.equal(advance(words, 45, 'the hour i first believed amen amen amen'), 50);
});

test('advance ignores an empty transcript', () => {
  assert.equal(advance(words, 6, '  ...  '), 6);
});

test('promptFor starts one line before the current line and skips empty lines', () => {
  const lines = lyricLines(song);
  assert.equal(promptFor(lines, 1).split('\n')[0], 'Amazing grace how sweet the sound');
  assert.equal(promptFor(lines, 2).split('\n')[0], 'Amazing grace how sweet the sound');
  assert.equal(promptFor(lines, 3).split('\n')[0], 'That saved a wretch like me');
});

test('promptFor stops once it holds about PROMPT_WORDS words', () => {
  const lines = Array.from({ length: 100 }, () => 'one two three four five');
  const count = promptFor(lines, 0).split(/\s+/).length;
  assert.equal(count, PROMPT_WORDS);
});

test('a transcript that echoes the prompt holds the cursor', () => {
  assert.equal(advance(words, 0, promptFor(lyricLines(song), 1)), 0);
});

test('a repeated phrase consumes only as many repetitions as were sung', () => {
  const boat = parse(`{title: Row Your Boat}
{artist: Traditional}
{key: C}

Row row row your boat gently down the stream
Merrily merrily merrily merrily life is but a dream
`);
  const w = buildWords(boat);
  assert.equal(advance(w, 9, 'merrily merrily merrily'), 12);
});

test('startCursor is the first word of the given line, or zero when no line is ahead', () => {
  assert.equal(startCursor(words, 0), 0);
  assert.equal(startCursor(words, 5), 26);
  assert.equal(startCursor(words, 99), 0);
});
