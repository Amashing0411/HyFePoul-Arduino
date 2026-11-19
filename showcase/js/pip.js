// PIP, the HyFePoul mascot. He stays in the corner while you read, reacts to the section or slide on screen,
// and says one line about it. Model and clips: assets/PIP.glb (HyFePoul_Mascot/Documentation/Stage5_Web_Integration.md).
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MIN_KEY = 'hfp-pip-min';
const LOOPS = new Set(['Loco_Idle', 'Loco_LookAround', 'Loco_Walk', 'Loco_Run', 'Loco_Sleep', 'Web_RoamDashboard']);
const VIEW_H = 1.35;      // world units visible top to bottom
const WALK_SPEED = 0.18;  // units per second at scale 1 (Loco_Walk)
const SAY_MS = 6500;      // how long a line stays up
const GAP_MS = 7000;      // shortest time between two lines while scrolling
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const fmt = (v, d = 2) => (+v).toFixed(d);

// Lines PIP may say at any time; every one is in the manuscript.
const FACTS = [
  'Each of the five trays sits on its own 1 kg load cell.',
  'I weigh what is left on a tray and pour only the missing grams.',
  'Low water? The buzzer sounds and the app gets an alert.',
  'Scheduled feeds still run when the Wi-Fi is down.',
  'A 12 V 12 Ah battery keeps me running in a brownout.',
  'Up to three feeding times a day, set on the panel or the app.',
  'The Arduino Mega runs the machine; the ESP32 carries the data.',
  'Records go to Firebase and a new Google Sheets tab each month.',
];

// What to say about a slide, worked out from its own data where possible.
function lineFor(s) {
  if (!s) return null;
  const byId = {
    cover: 'Hi, I\'m PIP! I\'ll keep you company through HyFePoul.',
    team: 'Meet the six researchers who built me.',
    agenda: 'Five chapters, from the problem to the conclusions.',
    problem: 'On the farm, feed was scooped by hand and never weighed.',
    'general-objective': 'The goal: less manual work, less wasted feed.',
    client: 'I was built for a layer farm in San Pablo City, Laguna.',
    components: 'All of these parts fit in and around my control box.',
    architecture: 'Sensors go into the Mega; the Mega drives the motors.',
    workflow: 'If the hopper reads 0%, I don\'t start a feed at all.',
    cycle: 'Press play to watch a feed cycle on the 3D model.',
    device3d: 'Tap a number on the model to read about that part.',
    budget: 'The whole build cost ₱27,664.',
    comparison: 'Load cells on the trays replace the feed scoop.',
    features: 'Ten functions, each with its own test in Chapter IV.',
    'testing-intro': 'Every function was tested against its objective.',
    'accuracy-all': 'Most tests landed between 96% and 99% accurate.',
    evaluators: 'Twelve evaluators rated me on ISO/IEC 25010.',
    conclusions: 'All ten functions worked in the final tests.',
    recommendations: 'Next: egg counting, egg sorting and better load cells.',
    'limits-found': 'Being honest: my water sensor only says low or okay.',
    'panel-actions': 'Here is what the panel asked, and what we changed.',
    thanks: 'Thanks for visiting! Any questions?',
  };
  if (byId[s.id]) return byId[s.id];
  if (s.type === 'grams') {
    const r = s.rows.filter(x => x.target != null && x.actual != null);
    if (!r.length) return null;
    const acc = r.map(x => 100 - Math.abs(x.target - x.actual) / x.target * 100);
    const avg = acc.reduce((a, b) => a + b, 0) / acc.length;
    const worst = r[acc.indexOf(Math.min(...acc))];
    return `Table ${s.table}: ${fmt(avg)}% on average. Biggest miss: ${worst.tray}, ${fmt(Math.abs(worst.target - worst.actual), 1)} g.`;
  }
  if (s.type === 'doctable' && s.columns && s.columns[0] === 'Condition') return `Table ${s.table}: every condition here was met.`;
  if (s.type === 'iso' && s.series) return `CpE practitioners: ${fmt(s.series[0].overall)}. End users: ${fmt(s.series[1].overall)}.`;
  if (s.type === 'hw' && s.series) return `Hardware: ${fmt(s.series[0].overall)} from practitioners, ${fmt(s.series[1].overall)} from end users.`;
  if (s.type === 'doctable' && s.table) return `Table ${s.table}: ${s.title}.`;
  return describe(s);
}
const short = (t, n = 120) => { t = String(t || '').trim(); if (t.length <= n) return t; const c = t.slice(0, n); return c.slice(0, c.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…'; };
const human = id => id.replace(/-/g, ' ');
const words = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] || String(n);
let CHAPTER = null, VIDEOS = [];
// A line for any slide, from what is on it.
function describe(s) {
  const c = CHAPTER || {};
  switch (s.type) {
    case 'chapter': return c.num ? `${c.label}: ${c.title}.` : null;
    case 'statement': return short(s.sub || s.text);
    case 'points': return s.points && s.points.length ? short(`${s.title}: ${s.points.map(p => p.t).join('; ')}.`) : short(s.title);
    case 'terms': return short(`${words(s.items.length)[0].toUpperCase() + words(s.items.length).slice(1)} terms, from ${s.items[0].t} to ${s.items[s.items.length - 1].t}.`);
    case 'objectives': return short(`Objectives ${s.items[0].label} to ${s.items[s.items.length - 1].label}: ${s.items.map(o => o.t).join('; ')}.`);
    case 'media': return short(s.text || `${s.kicker ? s.kicker + ': ' : ''}${s.title}.`);
    case 'gallery': return short(`${s.title}: ${words(s.images.length)} photos. Click one to see it full size.`);
    case 'flow': return short(s.nodes.map(n => n.t).join(' → ') + '.');
    case 'chips': return short(`${s.title}: ${words(s.items.length)} in all.`);
    case 'table': return s.rows && s.rows.length > 1 && s.rows[0][0].length < 40 ? short(`${s.title}: ${words(s.rows.length)} rows, from ${s.rows[0][0]} to ${s.rows[s.rows.length - 1][0]}.`) : short(s.title + '.');
    case 'pins': return `${words(s.rows.length)[0].toUpperCase() + words(s.rows.length).slice(1)} pin connections, straight from the firmware.`;
    case 'steps': return short(`${words(s.steps.length)[0].toUpperCase() + words(s.steps.length).slice(1)} steps: ${s.steps.map(x => x.t).join('; ')}.`);
    case 'screens': return `Screens from ${s.kind === 'app' ? 'the mobile app' : 'the 7-inch touch panel'}. Click one to enlarge it.`;
    case 'videos': {
      const t = (s.videos || []).map(id => (VIDEOS.find(v => v.id === id) || {}).title || human(id));
      return short(`Press play: ${t.join(', ').toLowerCase()}.`);
    }
    case 'status': { const n = s.rows.filter(r => r[1] === 'tested').length; return `${words(n)[0].toUpperCase() + words(n).slice(1)} functions built and tested, each with its own table.`; }
    case 'isodetail': {
      const all = s.subs.flat(); const hi = all.reduce((a, b) => (b[1] > a[1] ? b : a)); const lo = all.reduce((a, b) => (b[1] < a[1] ? b : a));
      return `Highest: ${hi[0].toLowerCase()} at ${fmt(hi[1])}. Lowest: ${lo[0].toLowerCase()} at ${fmt(lo[1])}.`;
    }
    case 'concl': return short(`${s.title}: ${s.items.length + (s.items2 ? s.items2.length : 0)} points, straight from Chapter V.`);
    case 'budget': return `The whole build cost ${s.total}.`;
    case 'timeline': return short(`${s.items[0].t} on ${s.items[0].date}, through to ${s.items[s.items.length - 1].t.toLowerCase()}.`);
    case 'refs': return `${words(s.items.length)[0].toUpperCase() + words(s.items.length).slice(1)} studies cited in this presentation.`;
    case 'todo': return `${s.title}: this part is still being added.`;
    case 'parts': return `${words(s.items.length)[0].toUpperCase() + words(s.items.length).slice(1)} parts. Click one for a closer look.`;
    case 'bars': return short(s.title);
    default: return s.title ? short(s.title) : null;
  }
}
function clipFor(s) {
  if (!s) return 'Loco_LookAround';
  const t = s.table || '';
  if (t === '4.6' || t === '4.6.1') return 'Web_LowWater';
  if (t === '4.5' || t === '4.5.1') return 'Web_LowFeed';
  if (t === '4.10') return 'Web_DeviceDisconnected';
  if (s.type === 'grams' || s.id === 'accuracy-all' || s.id === 'conclusions') return 'Web_FeedingComplete';
  if (s.id === 'limits-found') return 'Pers_Concerned';
  if (s.id === 'cover' || s.id === 'thanks' || s.id === 'team') return 'Pers_Wave';
  return pick(['Pers_Point', 'Pers_Think', 'Pers_HeadTilt', 'Loco_LookAround']);
}

let THREE, el, canvas, bubble, restore, renderer, scene, camera, mixer, pip, actions = {}, current = null;
let loading = null, rendering = false, clock, walk = null, sayT = 0, lastSay = 0, lastSlide = null, mode = 'web', idleT = 0;
const minimized = () => { try { return sessionStorage.getItem(MIN_KEY) === '1'; } catch { return false; } };

function buildDom() {
  el = document.createElement('div');
  el.className = 'pip';
  el.innerHTML = `
    <p class="pip-say" role="status" aria-live="polite"></p>
    <button class="pip-x" type="button" aria-label="Tuck PIP away"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M6 12h12"/></svg></button>
    <canvas class="pip-c" aria-label="PIP, the HyFePoul mascot. Click him for a fact." role="img"></canvas>`;
  restore = document.createElement('button');
  restore.className = 'pip-back'; restore.type = 'button';
  restore.innerHTML = '<span aria-hidden="true">PIP</span>';
  restore.setAttribute('aria-label', 'Bring PIP back');
  document.body.append(el, restore);
  canvas = el.querySelector('canvas'); bubble = el.querySelector('.pip-say');
  el.querySelector('.pip-x').addEventListener('click', () => setMin(true));
  restore.addEventListener('click', () => setMin(false));
  canvas.addEventListener('click', () => {
    say(pick(FACTS), true);
    if (!reduced && !walk) play(Math.random() < 0.5 ? 'Pers_HappyJump' : 'Pers_Celebrate');
  });
}

function setMin(on) {
  try { sessionStorage.setItem(MIN_KEY, on ? '1' : '0'); } catch {}
  document.body.classList.toggle('pip-min', on);
  if (on) { stopRender(); bubble.textContent = ''; el.classList.remove('say'); }
  else show();
}

async function load() {
  if (loading) return loading;
  loading = (async () => {
    const [three, { GLTFLoader }] = await Promise.all([import('three'), import('three/gltf')]);
    THREE = three;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    // Render at two to three times the screen's pixels so the small canvas stays sharp.
    renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1) * 2, 3));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    camera.position.set(0, 0.58, (VIEW_H / 2) / Math.tan(THREE.MathUtils.degToRad(15)));
    camera.lookAt(0, 0.58, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8e6, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.2); key.position.set(-2, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd6ff, 1.4); rim.position.set(1.5, 2, -3); scene.add(rim);
    const gltf = await new GLTFLoader().loadAsync('assets/PIP.glb');
    pip = gltf.scene; pip.position.y = -0.08; scene.add(pip);
    const aniso = renderer.capabilities.getMaxAnisotropy();
    pip.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { ['map', 'emissiveMap'].forEach(k => { if (m[k]) { m[k].anisotropy = aniso; m[k].needsUpdate = true; } }); }); });
    mixer = new THREE.AnimationMixer(pip);
    gltf.animations.forEach(c => {
      const a = mixer.clipAction(c);
      a.setLoop(LOOPS.has(c.name) ? THREE.LoopRepeat : THREE.LoopOnce);
      a.clampWhenFinished = !LOOPS.has(c.name);
      actions[c.name] = a;
    });
    mixer.addEventListener('finished', () => { if (!walk) play('Loco_Idle'); });
    clock = new THREE.Clock();
    size();
  })();
  return loading;
}

function size() {
  if (!renderer) return;
  // Layout size, not the on-screen size: the pop-in animation scales the canvas and must not shrink the render.
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function play(name, fade = 0.3) {
  const next = actions[name] || actions.Loco_Idle; if (!next) return;
  if (reduced) { next.reset().play(); if (current && current !== next) current.stop(); current = next; mixer.update(0); renderer.render(scene, camera); return; }
  next.reset().play();
  if (current && current !== next) current.crossFadeTo(next, fade, false);
  current = next;
}

function frame() {
  if (!rendering) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  if (walk) {
    const pxPerUnit = canvas.clientHeight / VIEW_H;
    walk.x += walk.dir * WALK_SPEED * pxPerUnit * dt;
    el.style.setProperty('--walk', `${walk.x.toFixed(1)}px`);
    if (walk.dir > 0 ? walk.x >= walk.to : walk.x <= walk.to) {
      walk = null; pip.rotation.y = 0; play('Loco_Stop', 0.2);
    }
  }
  mixer.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function startRender() {
  if (rendering || !renderer || reduced || document.hidden || minimized()) return;
  rendering = true; clock.getDelta(); requestAnimationFrame(frame);
}
function stopRender() { rendering = false; }

function say(text, force) {
  if (!text || minimized()) return;
  const now = performance.now();
  if (!force && now - lastSay < GAP_MS) return;
  lastSay = now;
  bubble.textContent = text;
  el.classList.remove('say'); void el.offsetWidth; el.classList.add('say');
  clearTimeout(sayT);
  sayT = setTimeout(() => el.classList.remove('say'), SAY_MS);
}

// Every so often, a little stroll along the bottom edge and back.
function idleLoop() {
  clearTimeout(idleT);
  idleT = setTimeout(() => {
    if (!reduced && rendering && !walk && mode === 'web' && !el.classList.contains('say')) {
      const home = parseFloat(el.style.getPropertyValue('--walk')) || 0;
      // Walk towards the middle of the screen and back: left from the right corner, right from the left corner on phones.
      const out = matchMedia('(max-width: 760px)').matches ? 1 : -1;
      const away = Math.abs(home) > 10;
      const dir = away ? -out : out;
      walk = { dir, x: home, to: away ? 0 : out * rand(60, 110) };
      pip.rotation.y = Math.atan2(dir, 0);
      play('Loco_Walk');
    } else if (rendering && !walk) play(pick(['Loco_LookAround', 'Pers_HeadTilt', 'Loco_Idle']));
    idleLoop();
  }, rand(14000, 24000));
}

async function show() {
  if (minimized()) { document.body.classList.add('pip-min'); return; }
  await load();
  el.classList.add('in');
  size(); startRender();
  play('Web_Appear', 0);
  setTimeout(() => { if (mode === 'slides' && lastSlide) react(lastSlide); else say('Hi, I\'m PIP! I\'ll keep you company through HyFePoul.', true); }, 1200);
}

function react(s) {
  if (!renderer || minimized()) return;
  if (!walk) play(clipFor(s));
  say(lineFor(s) || pick(FACTS), true);
}

// On the web page PIP shares a random fact every 25 to 45 seconds.
let factT = 0, lastFact = -1;
function factLoop() {
  clearTimeout(factT);
  factT = setTimeout(() => {
    if (mode === 'web' && renderer && !document.hidden) {
      let k; do { k = Math.floor(Math.random() * FACTS.length); } while (k === lastFact && FACTS.length > 1);
      lastFact = k;
      if (!walk) play(pick(['Pers_Point', 'Pers_Think', 'Pers_HeadTilt', 'Pers_Wave']));
      say(FACTS[k], true);
    }
    factLoop();
  }, rand(25000, 45000));
}

export function initPip() {
  if (!('WebGLRenderingContext' in window)) return;
  buildDom();
  if (minimized()) document.body.classList.add('pip-min');
  addEventListener('resize', size);
  new ResizeObserver(size).observe(canvas);
  document.addEventListener('visibilitychange', () => { document.hidden ? stopRender() : startRender(); });
  addEventListener('hfp-slide', e => {
    const { slide, mode: m, chapter, videos } = e.detail || {};
    CHAPTER = chapter || null; if (videos) VIDEOS = videos;
    const changedMode = m !== mode; mode = m || mode;
    el.classList.toggle('slides', mode === 'slides');
    if (changedMode) { walk = null; el.style.setProperty('--walk', '0px'); if (pip) pip.rotation.y = 0; size(); }
    if (slide === lastSlide && !changedMode) return;
    lastSlide = slide;
    if (mode === 'slides') react(slide, true);
  });
  // Arrive shortly after the page settles, so he never slows the first view.
  const start = () => { show(); idleLoop(); factLoop(); };
  if ('requestIdleCallback' in window) requestIdleCallback(() => setTimeout(start, 1500), { timeout: 4000 }); else setTimeout(start, 2500);
}
