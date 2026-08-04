const DIRECTIVE_RE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?)\s*)?\}$/i;
const CHORD_TOKEN_RE = /\[([^\]]+)\]/g;
// Root plus 'm', but not the 'm' that starts 'maj'.
const CHORD_TO_KEY_RE = /^([A-G][#b]?)(m(?!aj))?/;

export function parse(text) {
  const song = { title: '', artist: '', key: '', styles: [], sections: [] };
  let section = null;

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();

    if (trimmed === '') {
      section = null;
      continue;
    }

    const directive = DIRECTIVE_RE.exec(trimmed);
    if (directive) {
      applyDirective(song, directive[1].toLowerCase(), directive[2] ?? '', (label) => {
        section = { label, lines: [] };
        song.sections.push(section);
      });
      continue;
    }

    if (!section) {
      section = { label: '', lines: [] };
      song.sections.push(section);
    }
    section.lines.push(parseLine(raw));
  }

  if (!song.key) song.key = firstChordAsKey(song);
  return song;
}

function applyDirective(song, name, value, startSection) {
  if (name === 'title') song.title = value;
  else if (name === 'artist') song.artist = value;
  else if (name === 'key') song.key = value;
  else if (name === 'comment' || name === 'c') startSection(value);
  else if (name === 'meta') {
    const [metaName, ...rest] = value.split(/\s+/);
    if (metaName === 'style' && rest.length) song.styles.push(rest.join(' '));
  }
}

function parseLine(raw) {
  const chords = [];
  let lyric = '';
  let cursor = 0;
  CHORD_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = CHORD_TOKEN_RE.exec(raw)) !== null) {
    lyric += raw.slice(cursor, match.index);
    chords.push({ index: lyric.length, chord: match[1] });
    cursor = match.index + match[0].length;
  }
  lyric += raw.slice(cursor);
  return { lyric, chords };
}

function firstChordAsKey(song) {
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.chords.length) {
        const m = CHORD_TO_KEY_RE.exec(line.chords[0].chord);
        if (m) return m[1] + (m[2] ? 'm' : '');
      }
    }
  }
  return 'C';
}
