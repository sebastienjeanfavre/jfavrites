import { parse } from './chordpro.js';
import { renderSong } from './render.js';
import { transposeKey } from './transpose.js';
import { startSing, stopSing, isSinging, repaint } from './sing.js';

const main = document.getElementById('main');
const bar = document.getElementById('bar');
const heading = document.getElementById('heading');
const controls = document.getElementById('controls');
const back = document.getElementById('back');
const keyEl = document.getElementById('key');
const shareBtn = document.getElementById('share');

// Keep the parsed song so pressing + does not refetch on every press.
// Answers "do I need to fetch?" — untouched by navigating away and back.
let loaded = { slug: null, song: null };

// The slug currently painted in the song view. Answers "is this already on
// screen?" — cleared whenever the song view is not what's showing.
let onScreen = null;

// Bumped on every route change; a response only paints if it is still current.
let request = 0;

function route() {
  const [slug, offset] = location.hash.replace(/^#/, '').split('/');
  return { slug, offset: Number.parseInt(offset, 10) || 0 };
}

function go(slug, offset) {
  location.hash = offset ? `${slug}/${offset > 0 ? '+' : ''}${offset}` : slug;
}

async function showSongbook() {
  const id = ++request;
  onScreen = null;
  stopSing();
  controls.hidden = true;
  back.hidden = true;
  bar.hidden = true;
  main.replaceChildren();

  let songs;
  try {
    const res = await fetch('songs/index.json');
    if (!res.ok) throw new Error('index');
    songs = await res.json();
  } catch {
    if (id === request) main.textContent = 'Could not load songbook.';
    return;
  }
  if (id !== request) return;

  const note = (text) => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  };

  const wordmark = document.createElement('p');
  wordmark.className = 'wordmark';
  wordmark.append(note('♪'), ' JFavrites ', note('♪'));

  const titlepage = document.createElement('div');
  titlepage.className = 'titlepage';
  titlepage.append(wordmark);

  const ul = document.createElement('ul');
  ul.className = 'songbook';
  for (const song of songs) {
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = song.title;

    const leader = document.createElement('span');
    leader.className = 'leader';
    leader.setAttribute('aria-hidden', 'true');

    const key = document.createElement('b');
    key.className = 'key';
    key.textContent = song.key;

    const row = document.createElement('span');
    row.className = 'song-row';
    row.append(title, leader, key);

    const artist = document.createElement('span');
    artist.className = 'artist';
    artist.textContent = song.artist;

    const a = document.createElement('a');
    a.className = 'song';
    a.href = `#${song.slug}`;
    a.append(row, artist);

    const li = document.createElement('li');
    li.append(a);
    ul.append(li);
  }
  main.append(titlepage, ul);
}

function showNotice(title, message) {
  onScreen = null;
  stopSing();
  controls.hidden = true;
  back.hidden = false;
  bar.hidden = false;
  heading.textContent = title;

  const link = document.createElement('a');
  link.href = '#';
  link.textContent = 'Back to the songbook';

  const p = document.createElement('p');
  p.append(`${message} `, link);

  main.replaceChildren(p);
}

async function showSong(slug, offset) {
  const id = ++request;
  const isNewSong = onScreen !== slug;
  if (isNewSong) stopSing();
  if (loaded.slug !== slug) {
    let res;
    try {
      res = await fetch(`songs/${slug}.chordpro`);
    } catch {
      if (id === request) showNotice('Offline', 'Could not load the song.');
      return;
    }
    if (!res.ok) {
      if (id === request) showNotice('Not found', 'Song not found.');
      return;
    }
    if (id !== request) return;
    loaded = { slug, song: parse(await res.text()) };
  }

  const { song } = loaded;
  back.hidden = false;
  controls.hidden = false;
  bar.hidden = false;
  heading.textContent = song.title;
  keyEl.textContent = transposeKey(song.key, offset);
  main.replaceChildren(renderSong(song, offset));
  if (isNewSong) scrollTo(0, 0);
  else repaint();
  onScreen = slug;
}

function render() {
  const { slug, offset } = route();
  if (slug) showSong(slug, offset);
  else showSongbook();
}

document.getElementById('up').addEventListener('click', () => {
  const { slug, offset } = route();
  go(slug, offset + 1);
});

document.getElementById('down').addEventListener('click', () => {
  const { slug, offset } = route();
  go(slug, offset - 1);
});

document.getElementById('sing').addEventListener('click', () => {
  if (isSinging()) stopSing();
  else startSing(loaded.song);
});

shareBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  shareBtn.textContent = 'Copied';
  setTimeout(() => { shareBtn.textContent = 'Share'; }, 1200);
});

addEventListener('hashchange', render);
render();
