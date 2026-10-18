import test from 'node:test';
import assert from 'node:assert/strict';
import { matches } from '../js/search.js';

const penitencier = { title: 'Le pénitencier', artist: 'Johnny Hallyday' };
const knockin = { title: "Knockin' on Heaven's Door", artist: 'Bob Dylan' };
const zaz = { title: 'Je veux', artist: 'Zaz' };

test('an empty query matches every song', () => {
  assert.equal(matches(zaz, '  '), true);
});

test('ignores case, accents and punctuation', () => {
  assert.equal(matches({ title: 'Cette année-là', artist: 'Claude François' }, 'CETTE annee la'), true);
});

test('finds a song by its singer', () => {
  assert.equal(matches(penitencier, 'johnny'), true);
});

test('matches the start of a word while typing', () => {
  assert.equal(matches(penitencier, 'penit'), true);
});

test('words match title and singer in any order', () => {
  assert.equal(matches(knockin, 'dylan heaven'), true);
});

test('every word must match', () => {
  assert.equal(matches(knockin, 'dylan lemon'), false);
});

test('allows one wrong, missing or extra letter in long words', () => {
  assert.equal(matches(penitencier, 'penitentier'), true);
  assert.equal(matches(knockin, 'knocking'), true);
  assert.equal(matches(penitencier, 'penitncier'), true);
});

test('short words must be spelled right', () => {
  assert.equal(matches(zaz, 'zax'), false);
});

test('two mistakes in a word do not match', () => {
  assert.equal(matches(penitencier, 'penitantiar'), false);
});
