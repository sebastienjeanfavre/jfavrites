const LOOKAHEAD = 60;
const LOOKBACK = 20;
const MIN_MATCH = 3;
const MIN_RATIO = 0.4;
const MAX_HEARD = 40;

export function normalise(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function buildWords(song) {
  const words = [];
  let line = 0;
  for (const section of song.sections) {
    for (const { lyric } of section.lines) {
      for (const word of normalise(lyric)) words.push({ word, line });
      line++;
    }
  }
  return words;
}

export function currentLine(words, cursor) {
  return words[Math.min(cursor, words.length - 1)].line;
}

export function startCursor(words, line) {
  return Math.max(0, words.findIndex((w) => w.line >= line));
}

// Nobody sings 40 words in a 6 s window; longer text is Whisper hallucinating over the guitar.
export function advance(words, cursor, heard) {
  if (heard.length === 0 || heard.length > MAX_HEARD) return { next: cursor, last: -1 };

  const span = Math.ceil(heard.length * 1.5);
  const end = Math.min(words.length, cursor + LOOKAHEAD);
  let best = { count: 0, last: -1, heard: -1 };
  for (let start = Math.max(0, cursor - LOOKBACK); start < end; start++) {
    const slice = words.slice(start, start + span).map((w) => w.word);
    const { count, lastA, lastB } = lcs(heard, slice);
    if (count > best.count) best = { count, last: start + lastB, heard: lastA };
  }

  if (best.count < MIN_MATCH || best.count < heard.length * MIN_RATIO) return { next: cursor, last: -1 };
  return { next: Math.max(cursor, best.last + 1), last: best.heard };
}

// Longest common subsequence; lastB is the earliest end in b, lastA the earliest a-word matched to it.
function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  let j = m;
  while (j > 0 && dp[n][j - 1] === dp[n][m]) j--;
  let i = n;
  while (i > 0 && dp[i - 1][j] === dp[n][m]) i--;
  return { count: dp[n][m], lastA: i - 1, lastB: j - 1 };
}
