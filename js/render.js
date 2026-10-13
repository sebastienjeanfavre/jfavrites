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

// Chunks are inline blocks, so a line can only wrap between them. Chords often
// sit mid-word, so a chunk boundary is a legal wrap point only when the chunk
// before it ends in whitespace.
export function splitWords(chunks) {
  const groups = [];
  for (const chunk of chunks) {
    const last = groups.at(-1)?.at(-1);
    if (last && !/\s$/.test(last.text)) groups.at(-1).push(chunk);
    else groups.push([chunk]);
  }
  return groups;
}

export function renderSong(song, semitones) {
  const flats = prefersFlats(transposeKey(song.key, semitones));
  const frag = document.createDocumentFragment();
  let index = 0;

  for (const section of song.sections) {
    const el = document.createElement('section');
    if (section.label) {
      const h = document.createElement('h2');
      h.textContent = section.label;
      el.append(h);
    }
    for (const line of section.lines) {
      el.append(renderLine(line, index++, semitones, flats));
    }
    frag.append(el);
  }
  return frag;
}

function renderLine(line, index, semitones, flats) {
  const p = document.createElement('p');
  p.className = 'line';
  p.dataset.line = index;
  for (const group of splitWords(splitLine(line))) {
    const chunks = group.map((chunk) => {
      const span = document.createElement('span');
      span.className = 'chunk';

      const chord = document.createElement('b');
      chord.className = 'chord';
      chord.textContent = chunk.chord ? transposeChord(chunk.chord, semitones, flats) : '';

      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = chunk.text;

      span.append(chord, text);
      return span;
    });
    if (group.length === 1) {
      p.append(chunks[0]);
    } else {
      const word = document.createElement('span');
      word.className = 'word';
      word.append(...chunks);
      p.append(word);
    }
  }
  return p;
}
