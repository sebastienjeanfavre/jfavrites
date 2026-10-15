import { normalise } from './align.js';

const WORD_RE = /[\p{L}\p{N}\p{M}]+/gu;
const MIN_SPAN_MS = 10000;
const MAX_AHEAD = 2;

export function chordMap(song) {
  const wordChord = [];
  const lineStart = [];
  let count = 0;
  for (const section of song.sections) {
    for (const { lyric, chords } of section.lines) {
      lineStart.push(count);
      for (const m of lyric.matchAll(WORD_RE)) {
        let chord = count - 1;
        for (const c of chords) if (c.index <= m.index) chord++;
        for (const _ of normalise(m[0])) wordChord.push(Math.max(0, chord));
      }
      count += chords.length;
    }
  }
  return { wordChord, lineStart };
}

export function heardWords(words) {
  return words.flatMap((w) => normalise(w.word).map((word) => ({ word, end: w.end })));
}

export function predictLine(lineStart, first, last, now, line) {
  if (!first || last.t - first.t < MIN_SPAN_MS) return line;
  const speed = (last.chord - first.chord) / (last.t - first.t);
  const chord = last.chord + speed * (now - last.t);
  const cap = Math.min(line + MAX_AHEAD, lineStart.length - 1);
  let shown = line;
  while (shown < cap && lineStart[shown + 1] <= chord) shown++;
  return shown;
}
