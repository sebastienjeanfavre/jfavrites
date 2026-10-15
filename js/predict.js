import { normalise } from './align.js';

const WORD_RE = /[\p{L}\p{N}\p{M}]+/gu;

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
