import { PARTS, GROUPS, VIEW_PINS, PHOTOS } from './parts.js';

const $ = id => document.getElementById(id);
const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));
let VIDEOS = [];

// --- Sections that do not need WebGL ---
function openVideo(v) {
  const host = $('videoHost'); host.textContent = '';
  if (/youtube\.com|youtu\.be/.test(v.src)) {
    const f = document.createElement('iframe');
    f.src = v.src; f.title = v.title; f.allow = 'encrypted-media; picture-in-picture'; f.allowFullscreen = true;
    host.append(f);
  } else {
    const e = document.createElement('video');
    e.src = v.src; e.controls = true; e.playsInline = true; e.autoplay = true;
    host.append(e);
  }
  $('videoDialog').showModal();
}
$('videoDialog').addEventListener('close', () => { $('videoHost').textContent = ''; });

function renderVideos() {
  const grid = $('videoGrid');
  VIDEOS.forEach(v => {
    const card = document.createElement(v.src ? 'button' : 'article');
    card.className = 'vcard';
    const t = document.createElement('div'); t.className = 'vthumb'; t.textContent = v.src ? 'Play video' : 'Video coming soon';
    const b = document.createElement('div'); b.className = 'vbody';
    const h = document.createElement('h3'); h.textContent = v.title;
    const p = document.createElement('p'); p.textContent = v.text;
    b.append(h, p); card.append(t, b);
    if (v.src) card.addEventListener('click', () => openVideo(v));
    grid.append(card);
  });
}

function renderBars() {
  const host = $('resultBars');
  [49.0, 50.5, 49.6, 52.6, 51.1].forEach(v => {
    const r = document.createElement('div'); r.className = 'brow';
    r.innerHTML = `<span>Tray</span><div class="btrack"><i style="width:${(v / 60 * 100).toFixed(1)}%"></i><u style="left:${(50 / 60 * 100).toFixed(1)}%"></u></div><span class="bval">${v.toFixed(1)} g</span>`;
    host.append(r);
  });
  const n = document.createElement('p'); n.className = 'bnote'; n.textContent = 'The dark line marks the 50 g target. Values are in the order our test notes list them.';
  host.append(n);
}

function renderGallery() {
  $('gallery').innerHTML = PHOTOS.map(([f, c, a]) => `<figure><img src="img/${f}.jpg" loading="lazy" width="1400" height="1050" alt="${a}"><figcaption>${c}</figcaption></figure>`).join('');
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
  const v = VIDEOS.find(x => x.id === p.video && x.src), btn = $('dVideo');
  btn.hidden = !v; btn.onclick = v ? () => openVideo(v) : null;
  document.querySelectorAll('.prow').forEach(b => b.setAttribute('aria-current', b.dataset.part === p.id));
}

function webglFallback(reason) {
  $('loader').hidden = true;
  $('tools').hidden = true; $('pins').hidden = true;
  const d = document.createElement('div'); d.className = 'nowebgl';
  d.innerHTML = `<h3>${reason}</h3><p>Here are photos of the machine instead.</p><div class="shots">${PHOTOS.map(([f, c, a]) => `<img src="img/${f}.jpg" loading="lazy" alt="${a}" title="${c}">`).join('')}</div>`;
  $('stage').append(d);
}

const CAD_BYTES = 272268;
async function fetchWithProgress(url, onP) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load ' + url);
  const reader = r.body.getReader(), out = new Uint8Array(CAD_BYTES);
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; out.set(value, got); got += value.length; onP(got / CAD_BYTES); }
  return out.buffer;
}

async function start() {
  VIDEOS = await fetch('data/videos.json').then(r => r.json()).catch(() => []);
  renderVideos(); renderBars(); renderGallery(); renderDiagram();
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
    const cad = {};
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
