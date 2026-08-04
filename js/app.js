import { parse } from './chordpro.js';
import { renderSong } from './render.js';
import { transposeKey } from './transpose.js';

const main = document.getElementById('main');
const heading = document.getElementById('heading');
const controls = document.getElementById('controls');
const back = document.getElementById('back');
const keyEl = document.getElementById('key');
const shareBtn = document.getElementById('share');

// Keep the parsed song so pressing + does not refetch on every press.
let loaded = { slug: null, song: null };

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
  controls.hidden = true;
  back.hidden = true;
  heading.textContent = 'JFavrites';
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

  const ul = document.createElement('ul');
  ul.className = 'songbook';
  for (const song of songs) {
    const title = document.createElement('strong');
    title.textContent = song.title;

    const meta = document.createElement('span');
    meta.textContent = `${song.artist} · ${song.key}`;

    const a = document.createElement('a');
    a.href = `#${song.slug}`;
    a.append(title, meta);

    const li = document.createElement('li');
    li.append(a);
    ul.append(li);
  }
  main.append(ul);
}

function showNotFound() {
  controls.hidden = true;
  back.hidden = false;
  heading.textContent = 'Not found';

  const link = document.createElement('a');
  link.href = '#';
  link.textContent = 'Back to the songbook';

  const p = document.createElement('p');
  p.append('Song not found. ', link);

  main.replaceChildren(p);
}

async function showSong(slug, offset) {
  const id = ++request;
  const isNewSong = loaded.slug !== slug;
  if (isNewSong) {
    let text;
    try {
      const res = await fetch(`songs/${slug}.chordpro`);
      if (!res.ok) throw new Error('404');
      text = await res.text();
    } catch {
      if (id === request) showNotFound();
      return;
    }
    if (id !== request) return;
    loaded = { slug, song: parse(text) };
  }

  const { song } = loaded;
  back.hidden = false;
  controls.hidden = false;
  heading.textContent = song.title;
  keyEl.textContent = transposeKey(song.key, offset);
  main.replaceChildren(renderSong(song, offset));
  if (isNewSong) scrollTo(0, 0);
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

shareBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  shareBtn.textContent = 'Copied';
  setTimeout(() => { shareBtn.textContent = 'Share'; }, 1200);
});

addEventListener('hashchange', render);
render();
