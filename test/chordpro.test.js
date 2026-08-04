import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../js/chordpro.js';

const SONG = `{title: Amazing Grace}
{artist: Traditional}
{key: G}
{meta: style traditional}
{meta: style singalong}

{comment: Verse 1}
A[G]mazing grace how [G7]sweet the [C]sound
`;

test('parses the metadata directives', () => {
  const s = parse(SONG);
  assert.equal(s.title, 'Amazing Grace');
  assert.equal(s.artist, 'Traditional');
  assert.equal(s.key, 'G');
});

test('repeated meta style directives collect into a list', () => {
  assert.deepEqual(parse(SONG).styles, ['traditional', 'singalong']);
});

test('chords carry their character index into the lyric', () => {
  const line = parse(SONG).sections[0].lines[0];
  assert.equal(line.lyric, 'Amazing grace how sweet the sound');
  assert.deepEqual(line.chords, [
    { index: 1, chord: 'G' },
    { index: 18, chord: 'G7' },
    { index: 28, chord: 'C' },
  ]);
});

test('comment directives label a section', () => {
  const s = parse(SONG);
  assert.equal(s.sections.length, 1);
  assert.equal(s.sections[0].label, 'Verse 1');
});

test('a blank line starts a new unlabelled section', () => {
  const s = parse('{key: C}\n[C]one\n\n[G]two\n');
  assert.equal(s.sections.length, 2);
  assert.equal(s.sections[0].label, '');
  assert.equal(s.sections[0].lines[0].lyric, 'one');
  assert.equal(s.sections[1].lines[0].lyric, 'two');
});

test('chord-only lines preserve the spacing between chords', () => {
  const line = parse('{key: C}\n[C]    [G]\n').sections[0].lines[0];
  assert.equal(line.lyric, '    ');
  assert.deepEqual(line.chords, [
    { index: 0, chord: 'C' },
    { index: 4, chord: 'G' },
  ]);
});

test('unknown directives are ignored rather than treated as errors', () => {
  const s = parse('{title: X}\n{tempo: 120}\n{key: C}\n[C]hi\n');
  assert.equal(s.title, 'X');
  assert.equal(s.sections.length, 1);
  assert.equal(s.sections[0].lines[0].lyric, 'hi');
});

test('key falls back to the first chord when the directive is absent', () => {
  assert.equal(parse('{title: X}\n[Am7]hello [C]world\n').key, 'Am');
  assert.equal(parse('{title: X}\n[Cmaj7]hello\n').key, 'C');
  assert.equal(parse('{title: X}\n[Bb]hello\n').key, 'Bb');
});

test('key falls back to C when there are no chords at all', () => {
  assert.equal(parse('{title: X}\nno chords here\n').key, 'C');
});
