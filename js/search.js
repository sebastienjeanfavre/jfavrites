const MIN_FUZZY = 5;

function words(text) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// A query word matches the start of a song word; long words may have one typo.
function wordMatches(q, w) {
  if (w.startsWith(q)) return true;
  if (q.length < MIN_FUZZY) return false;
  for (let k = q.length - 1; k <= q.length + 1; k++) {
    if (distance(q, w.slice(0, k)) <= 1) return true;
  }
  return false;
}

export function matches(song, query) {
  const hay = words(`${song.title} ${song.artist}`);
  return words(query).every((q) => hay.some((w) => wordMatches(q, w)));
}
