import { transposeChord, transposeKey, prefersFlats } from './transpose.js';

export function splitLine(line) {
  const { lyric, chords } = line;
  if (chords.length === 0) return [{ chord: '', text: lyric }];

  const chunks = [];
  if (chords[0].index > 0) {
    chunks.push({ chord: '', text: lyric.slice(0, chords[0].index) });
  }
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].index : lyric.length;
    chunks.push({ chord: c.chord, text: lyric.slice(c.index, end) });
  });
  return chunks;
}

export function renderSong(song, semitones) {
  const flats = prefersFlats(transposeKey(song.key, semitones));
  const frag = document.createDocumentFragment();

  for (const section of song.sections) {
    const el = document.createElement('section');
    if (section.label) {
      const h = document.createElement('h2');
      h.textContent = section.label;
      el.append(h);
    }
    for (const line of section.lines) {
      el.append(renderLine(line, semitones, flats));
    }
    frag.append(el);
  }
  return frag;
}

function renderLine(line, semitones, flats) {
  const p = document.createElement('p');
  p.className = 'line';
  for (const chunk of splitLine(line)) {
    const span = document.createElement('span');
    span.className = 'chunk';

    const chord = document.createElement('b');
    chord.className = 'chord';
    chord.textContent = chunk.chord ? transposeChord(chunk.chord, semitones, flats) : '';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = chunk.text;

    span.append(chord, text);
    p.append(span);
  }
  return p;
}
