import { buildWords, lyricLines, currentLine, advance, promptFor, startCursor } from './align.js';

const CHUNK_MS = 6000;
const WORKER_URL = '/transcribe';
const PASSWORD_KEY = 'sing-password';
const FAILURES_TO_STOP = 3;
const MESSAGE_MS = 3000;
const SCROLL_FROM_TOP = 0.3;

let session = null;
let generation = 0;

export function isSinging() {
  return session !== null;
}

export async function startSing(song) {
  const password = localStorage.getItem(PASSWORD_KEY) || prompt('Password');
  if (!password) return;
  localStorage.setItem(PASSWORD_KEY, password);

  const words = buildWords(song);
  if (words.length === 0) return;

  const started = generation;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showStatus('Microphone blocked', MESSAGE_MS);
    return;
  }
  if (session || started !== generation) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  const bar = document.getElementById('bar').offsetHeight;
  const top = [...document.querySelectorAll('p.line')].find((p) => p.getBoundingClientRect().bottom > bar);
  session = {
    words,
    lyrics: lyricLines(song),
    language: song.language,
    cursor: startCursor(words, Number(top?.dataset.line ?? 0)),
    line: -1,
    failures: 0,
    stream,
    recorder: null,
    timer: 0,
    lock: navigator.wakeLock ? navigator.wakeLock.request('screen').catch(() => null) : Promise.resolve(null),
  };
  document.getElementById('sing').textContent = 'Stop';
  showStatus('Listening');
  document.addEventListener('visibilitychange', onHidden);
  paint(session);
  recordChunk(session);
}

export function stopSing(message = '') {
  generation++;
  if (!session) return;
  const s = session;
  session = null;
  clearTimeout(s.timer);
  if (s.recorder?.state === 'recording') s.recorder.stop();
  s.stream.getTracks().forEach((track) => track.stop());
  s.lock.then((lock) => lock?.release());
  document.removeEventListener('visibilitychange', onHidden);
  document.getElementById('sing').textContent = 'Sing';
  showStatus(message, MESSAGE_MS);
}

export function repaint() {
  if (session) paint(session);
}

function onHidden() {
  if (document.hidden) stopSing();
}

// Safari cannot split one recording into standalone files, so each chunk is its own recorder.
function recordChunk(s) {
  const recorder = new MediaRecorder(s.stream);
  const parts = [];
  recorder.ondataavailable = (e) => parts.push(e.data);
  recorder.onstop = () => {
    if (session !== s) return;
    send(s, new Blob(parts, { type: recorder.mimeType }));
    recordChunk(s);
  };
  s.recorder = recorder;
  recorder.start();
  s.timer = setTimeout(() => recorder.stop(), CHUNK_MS);
}

async function send(s, blob) {
  const form = new FormData();
  form.set('file', blob, blob.type.includes('webm') ? 'chunk.webm' : 'chunk.mp4');
  if (s.language) form.set('language', s.language);
  form.set('prompt', promptFor(s.lyrics, currentLine(s.words, s.cursor)));

  let res;
  try {
    res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'X-Password': localStorage.getItem(PASSWORD_KEY) ?? '' },
      body: form,
    });
  } catch {
    failed(s);
    return;
  }
  if (session !== s) return;
  if (res.status === 401) {
    localStorage.removeItem(PASSWORD_KEY);
    stopSing('Wrong password');
    return;
  }
  if (!res.ok) {
    failed(s);
    return;
  }

  let text;
  try {
    ({ text } = await res.json());
  } catch {
    failed(s);
    return;
  }
  if (session !== s) return;
  s.failures = 0;
  const next = advance(s.words, s.cursor, text);
  console.log(`[sing] "${text}" cursor ${s.cursor} -> ${next}`);
  if (next <= s.cursor) return;
  s.cursor = next;
  paint(s);
  if (currentLine(s.words, s.cursor) === s.words.at(-1).line) stopSing();
}

function failed(s) {
  if (session !== s) return;
  s.failures++;
  if (s.failures >= FAILURES_TO_STOP) stopSing('Transcription failed');
}

function paint(s) {
  const line = currentLine(s.words, s.cursor);
  for (const p of document.querySelectorAll('p.line')) {
    const n = Number(p.dataset.line);
    p.classList.toggle('sung', n < line);
  }
  if (line === s.line) return;
  s.line = line;
  const el = document.querySelector(`p.line[data-line="${line}"]`);
  scrollTo({
    top: scrollY + el.getBoundingClientRect().top - innerHeight * SCROLL_FROM_TOP,
    behavior: 'smooth',
  });
}

function showStatus(text, ms = 0) {
  const status = document.getElementById('status');
  clearTimeout(showStatus.timer);
  status.textContent = text;
  status.hidden = !text;
  if (text && ms) showStatus.timer = setTimeout(() => showStatus(''), ms);
}
