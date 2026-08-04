const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Keys a musician conventionally writes with flats. Everything else takes sharps.
const FLAT_KEYS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm',
]);

// root, accidental, quality/extension, optional slash bass
const CHORD_RE = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/;
const KEY_RE = /^([A-G])([#b]?)(m?)$/;

const mod12 = (n) => ((n % 12) + 12) % 12;

function pitchOf(letter, accidental) {
  return mod12(PITCH[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
}

export function prefersFlats(key) {
  return FLAT_KEYS.has(key);
}

export function transposeChord(chord, semitones, preferFlats) {
  const m = CHORD_RE.exec(chord);
  if (!m) return chord;
  const [, root, acc, quality, bassRoot, bassAcc] = m;
  const names = preferFlats ? FLAT : SHARP;
  let out = names[mod12(pitchOf(root, acc) + semitones)] + quality;
  if (bassRoot) out += '/' + names[mod12(pitchOf(bassRoot, bassAcc) + semitones)];
  return out;
}

export function transposeKey(key, semitones) {
  const m = KEY_RE.exec(key);
  if (!m) return key;
  const [, root, acc, minor] = m;
  const pitch = mod12(pitchOf(root, acc) + semitones);
  // Pick the spelling by asking which name the resulting key itself uses.
  const flatName = FLAT[pitch] + minor;
  return FLAT_KEYS.has(flatName) ? flatName : SHARP[pitch] + minor;
}
