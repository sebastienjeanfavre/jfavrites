const LOOKAHEAD = 60;
const MIN_MATCH = 3;
const MIN_RATIO = 0.4;
const MAX_HEARD = 40;
const PROMPT_WORDS = 150;

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

export function lyricLines(song) {
  return song.sections.flatMap((section) => section.lines.map((line) => line.lyric));
}

export function currentLine(words, cursor) {
  return words[Math.min(cursor, words.length - 1)].line;
}

export function startCursor(words, line) {
  return Math.max(0, words.findIndex((w) => w.line >= line));
}

// Whisper echoes the prompt back over guitar-only audio; nobody sings 40 words in a chunk.
export function advance(words, cursor, transcript) {
  const heard = normalise(transcript);
  if (heard.length === 0 || heard.length > MAX_HEARD) return cursor;

  const span = Math.ceil(heard.length * 1.5);
  const end = Math.min(words.length, cursor + LOOKAHEAD);
  let best = { count: 0, last: -1 };
  for (let start = cursor; start < end; start++) {
    const slice = words.slice(start, start + span).map((w) => w.word);
    const { count, last } = lcs(heard, slice);
    if (count > best.count) best = { count, last: start + last };
  }

  if (best.count < MIN_MATCH || best.count < heard.length * MIN_RATIO) return cursor;
  return best.last + 1;
}

export function promptFor(lyrics, line) {
  const out = [];
  let count = 0;
  for (let i = Math.max(0, line - 1); i < lyrics.length && count < PROMPT_WORDS; i++) {
    const text = lyrics[i].trim();
    if (!text) continue;
    out.push(text);
    count += text.split(/\s+/).length;
  }
  return out.join('\n');
}

// Longest common subsequence; `last` is the earliest index in b at which the full count is reached.
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
  return { count: dp[n][m], last: j - 1 };
}
