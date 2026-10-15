import { normalise } from './align.js';

const WORD_RE = /[\p{L}\p{N}\p{M}]+/gu;
const MIN_SPAN_MS = 10000;
const MAX_AHEAD = 2;
// A chord is about a bar and a word about a syllable; both take time. Fitted on a phone log.
const WORD_WEIGHT = 0.5;

export function chordMap(song) {
  const wordPos = [];
  const linePos = [];
  let count = 0;
  for (const section of song.sections) {
    for (const { lyric, chords } of section.lines) {
      linePos.push(count + WORD_WEIGHT * wordPos.length);
      for (const m of lyric.matchAll(WORD_RE)) {
        let chord = count - 1;
        for (const c of chords) if (c.index <= m.index) chord++;
        for (const _ of normalise(m[0])) wordPos.push(Math.max(0, chord) + WORD_WEIGHT * wordPos.length);
      }
      count += chords.length;
    }
  }
  return { wordPos, linePos };
}

export function heardWords(words) {
  return words.flatMap((w) => normalise(w.word).map((word) => ({ word, end: w.end })));
}

export function predictLine(linePos, first, last, now, line) {
  if (!first || last.t - first.t < MIN_SPAN_MS) return line;
  const speed = (last.pos - first.pos) / (last.t - first.t);
  const pos = last.pos + speed * (now - last.t);
  const cap = Math.min(line + MAX_AHEAD, linePos.length - 1);
  let shown = line;
  while (shown < cap && linePos[shown + 1] <= pos) shown++;
  return shown;
}
