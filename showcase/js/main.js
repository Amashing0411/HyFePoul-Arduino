import { PARTS, GROUPS } from './parts.js';

const $ = id => document.getElementById(id);
const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GUIDE = new URLSearchParams(location.search).has('guide');
const toView = el => el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
let LIB = { videos: [], app: [], panel: [], photos: [], team: [] };

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  photo: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/></svg>',
};
const hasMedia = v => !!(v.src || v.youtube);

function placeholder(slot, icon, label, ext) {
  const d = document.createElement('div'); d.className = 'ph';
  d.innerHTML = ICON[icon];
  const p = document.createElement('span');
  p.textContent = GUIDE ? `${slot.file}.${ext}` : label;
  if (GUIDE) p.className = 'file';
  d.append(p);
  return d;
}

// --- Videos: one player with a playlist ---
let current = 0;
function showVideo(i, play) {
  current = i;
  const v = LIB.videos[i], host = $('playerScreen');
  host.textContent = '';
  if (v.youtube && play) {
    const f = document.createElement('iframe');
    f.src = v.youtube; f.title = v.title; f.allow = 'encrypted-media; picture-in-picture'; f.allowFullscreen = true;
    host.append(f);
  } else if (v.src) {
    const e = document.createElement('video');
    e.src = v.src; e.controls = true; e.playsInline = true; e.preload = 'metadata';
    if (v.poster) e.poster = v.poster;
    host.append(e);
    if (play) e.play().catch(() => {});
  } else if (v.youtube) {
    const b = document.createElement('button'); b.className = 'ph as-btn'; b.innerHTML = ICON.play + '<span>Play video</span>';
    b.addEventListener('click', () => showVideo(i, true)); host.append(b);
  } else host.append(placeholder(v, 'play', 'Video coming soon', 'mp4'));
  $('playerTitle').textContent = v.title;
  $('playerText').textContent = v.text;
  document.querySelectorAll('.track').forEach((b, k) => b.setAttribute('aria-current', k === i));
}
function renderVideos() {
  const list = $('playlist');
  LIB.videos.forEach((v, i) => {
    const b = document.createElement('button'); b.className = 'track';
    const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
    const t = document.createElement('span'); t.className = 't'; t.textContent = v.title;
    const s = document.createElement('span'); s.className = 's'; s.textContent = hasMedia(v) ? 'Watch' : 'Soon';
    if (hasMedia(v)) s.classList.add('ready');
    b.append(n, t, s);
    b.addEventListener('click', () => showVideo(i, hasMedia(v)));
    list.append(b);
  });
  if (LIB.videos.length) showVideo(Math.max(0, LIB.videos.findIndex(hasMedia)), false);
}

// --- App and panel previews ---
function device(slot, cls, ext) {
  const f = document.createElement('figure'); f.className = 'device ' + cls;
  const s = document.createElement('div'); s.className = 'screen';
  if (slot.src) {
    const i = document.createElement('img'); i.src = slot.src; i.alt = `${slot.title} screen`; i.loading = 'lazy'; s.append(i);
  } else s.append(placeholder(slot, 'photo', 'Screen coming soon', ext));
  const c = document.createElement('figcaption'); c.textContent = slot.title;
  f.append(s, c);
  return f;
}
function renderPreviews() {
  LIB.app.forEach(s => $('previewApp').append(device(s, 'phone', 'jpg')));
  LIB.panel.forEach(s => $('previewPanel').append(device(s, 'panel', 'jpg')));
  const tabs = document.querySelectorAll('#previewTabs button');
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(x => x.setAttribute('aria-selected', x === b));
    $('previewApp').hidden = b.dataset.tab !== 'app';
    $('previewPanel').hidden = b.dataset.tab !== 'panel';
  }));
}

// --- Photo library ---
const CATS = [['all', 'All'], ['machine', 'Whole machine'], ['control', 'Control box'], ['feeding', 'Feeding'], ['trays', 'Trays and water']];
let shots = [], shotAt = 0;
function renderGallery(cat = 'all') {
  const g = $('gallery'); g.textContent = '';
  const items = LIB.photos.filter(p => cat === 'all' || p.group === cat);
  shots = items.filter(p => p.src);
  items.forEach(p => {
    const f = document.createElement(p.src ? 'button' : 'div');
    f.className = 'shot ' + p.shape;
    if (p.src) {
      const i = document.createElement('img'); i.src = p.src; i.alt = p.alt; i.loading = 'lazy'; i.decoding = 'async';
      const c = document.createElement('span'); c.className = 'cap'; c.textContent = p.title;
      f.append(i, c);
      f.setAttribute('aria-label', `Open photo: ${p.title}`);
      f.addEventListener('click', () => openShot(shots.indexOf(p)));
    } else {
      f.append(placeholder(p, 'photo', `${p.title}: photo coming soon`, 'jpg'));
    }
    g.append(f);
  });
}
function renderGalleryChips() {
  const host = $('galleryChips');
  CATS.forEach(([id, label], i) => {
    const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', i === 0);
    b.addEventListener('click', () => { [...host.children].forEach(x => x.setAttribute('aria-pressed', x === b)); renderGallery(id); });
    host.append(b);
  });
}
function openShot(i) {
  shotAt = (i + shots.length) % shots.length;
  const p = shots[shotAt];
  $('lightImg').src = p.src; $('lightImg').alt = p.alt; $('lightCap').textContent = p.title;
  if (!$('lightbox').open) $('lightbox').showModal();
}
$('lightPrev').addEventListener('click', () => openShot(shotAt - 1));
$('lightNext').addEventListener('click', () => openShot(shotAt + 1));
$('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });
$('lightbox').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') openShot(shotAt - 1); if (e.key === 'ArrowRight') openShot(shotAt + 1); });

function renderBars() {
  const host = $('resultBars');
  [49.0, 50.5, 49.6, 52.6, 51.1].forEach((v, i) => {
    const r = document.createElement('div'); r.className = 'brow';
    r.innerHTML = `<span>Reading ${i + 1}</span><div class="btrack"><i style="width:${(v / 60 * 100).toFixed(1)}%"></i><u style="left:${(50 / 60 * 100).toFixed(1)}%"></u></div><span class="bval">${v.toFixed(1)} g</span>`;
    host.append(r);
  });
  const n = document.createElement('p'); n.className = 'bnote'; n.textContent = 'The dark line marks the 50 g target. Values are in the order our test notes list them.';
  host.append(n);
}

function renderDiagram() {
  $('diagram').innerHTML = `
  <div class="flow">
    <div class="node"><h3>What it senses</h3><ul><li>5 load cells through 5 HX711 boards</li><li>Ultrasonic level sensor</li><li>Float switch</li><li>2 limit switches</li><li>DS3231 clock</li></ul></div>
    <div class="node main"><h3>Arduino Mega 2560</h3><p>Reads the sensors, decides how much each tray needs, and drives the machine.</p></div>
    <div class="node"><h3>What it moves</h3><ul><li>Chain motor, through 2 relays</li><li>Dispenser motor, through 1 relay</li><li>Buzzer</li><li>Nextion touch screen</li></ul></div>
  </div>
  <h3 class="flow-title">Device data</h3>
  <div class="flow line"><div class="node main"><h3>Mega</h3></div><div class="node"><h3>ESP32</h3><p>Wi-Fi bridge</p></div><div class="node"><h3>Firebase</h3><p>Cloud database</p></div><div class="node"><h3>Mobile app</h3><p>Timely updates and alerts</p></div></div>
  <h3 class="flow-title">Power</h3>
  <div class="flow line"><div class="node"><h3>12 V supply and battery</h3><p>With charge controller</p></div><div class="node"><h3>Relay contacts</h3><p>12 V to the motors</p></div></div>
  <div class="flow line"><div class="node"><h3>12 V supply and battery</h3><p>With charge controller</p></div><div class="node"><h3>Step-down boards</h3><p>12 V to 5 V</p></div><div class="node"><h3>Electronics</h3><p>Mega, ESP32, screen, sensors</p></div></div>`;
}

function renderPartsList(onPick) {
  const host = $('partsList');
  GROUPS.forEach(([g, label]) => {
    const wrap = document.createElement('div'); wrap.className = 'pgroup';
    const h = document.createElement('h3'); h.textContent = label; wrap.append(h);
    PARTS.filter(p => p.group === g).forEach(p => {
      const b = document.createElement('button'); b.className = 'prow'; b.dataset.part = p.id;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = p.n;
      const t = document.createElement('span'); t.textContent = p.name;
      const s = document.createElement('small'); s.textContent = p.check ? p.size[0] + ' · Check' : p.size[0]; t.append(s);
      b.append(n, t); b.addEventListener('click', () => onPick(p.id)); wrap.append(b);
    });
    host.append(wrap);
  });
}

function showDetail(p) {
  $('dNum').textContent = 'Part ' + p.n;
  $('dGroup').textContent = GROUPS.find(g => g[0] === p.group)[1];
  $('dName').textContent = p.name; $('dText').textContent = p.what;
  const list = $('dList'); list.textContent = '';
  const row = (k, v, cls) => { const t = document.createElement('dt'); t.textContent = k; const d = document.createElement('dd'); d.textContent = v; if (cls) d.className = cls; list.append(t, d); };
  row('Connects to', p.connects);
  row('Size · ' + p.size[0], p.size[1]);
  row('Position · ' + p.pos[0], p.pos[1]);
  if (p.check) row('Check', p.check, 'check');
  const i = LIB.videos.findIndex(x => x.id === p.video && hasMedia(x)), btn = $('dVideo');
  btn.hidden = i < 0;
  btn.onclick = i < 0 ? null : () => { showVideo(i, true); toView($('player')); };
  document.querySelectorAll('.prow').forEach(b => b.setAttribute('aria-current', b.dataset.part === p.id));
}

function webglFallback(reason) {
  $('loader').hidden = true;
  $('tools').hidden = true; $('pins').hidden = true;
  const d = document.createElement('div'); d.className = 'nowebgl';
  d.innerHTML = `<h3>${reason}</h3><p>Here are photos of the machine instead.</p><div class="shots"></div>`;
  LIB.photos.filter(p => p.src).forEach(p => { const i = document.createElement('img'); i.src = p.src; i.alt = p.alt; i.loading = 'lazy'; d.querySelector('.shots').append(i); });
  $('stage').append(d);
}

const CAD_BYTES = 273396; // used only for the progress bar
async function fetchWithProgress(url, onP) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load ' + url);
  const reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onP(Math.min(1, got / CAD_BYTES)); }
  const out = new Uint8Array(got); let at = 0;
  parts.forEach(c => { out.set(c, at); at += c.length; });
  return out.buffer;
}

function mountTeam() {
  const el = $('teamRoot');
  const load = () => import('./team.bundle.js').then(m => m.mount(el, LIB.team)).catch(e => console.warn(e));
  if (!('IntersectionObserver' in window)) return load();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '700px' });
  io.observe(el);
}

async function start() {
  $('playHero').addEventListener('click', () => { $('play').click(); toView($('stage')); });
  $('boxHero').addEventListener('click', () => { document.querySelector('[data-view=box]').click(); toView($('stage')); });
  LIB = await fetch('data/library.json').then(r => r.json()).catch(() => LIB);
  renderVideos(); renderPreviews(); renderGalleryChips(); renderGallery(); renderBars(); renderDiagram(); mountTeam();
  let pick = () => {};
  renderPartsList(id => pick(id));

  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) { webglFallback('This browser cannot show the 3D model.'); return; }

  const [THREE, viewer] = await Promise.all([import('three'), import('./viewer.js')]);
  try {
    const setBar = (f, msg) => { $('loadbar').style.width = Math.round(f * 100) + '%'; if (msg) $('loadtext').textContent = msg; };
    setBar(0.05);
    const json = await fetch('data/assembly.json').then(r => r.json());
    const bin = await fetchWithProgress('data/assembly.bin', f => setBar(0.05 + f * 0.8));
    setBar(0.9, 'Assembling the machine…');
    await new Promise(r => setTimeout(r, 30));
    const cad = { lines: await fetch('data/cad-lines.json').then(r => r.json()) };
    json.parts.forEach(p => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, p.pos[0], p.pos[1] * 3), 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, p.idx[0], p.idx[1]), 1));
      cad[p.name] = g;
    });
    pick = viewer.init({ cad, onSelect: showDetail, onFail: webglFallback });
    $('loader').hidden = true;
  } catch (e) {
    console.warn(e);
    webglFallback('The 3D model could not be loaded.');
  }
}
start();
export { PART };
