// PIP, the HyFePoul mascot: pops up now and then in a corner of the web page, says one line, and leaves.
// Model and clips: assets/PIP.glb (see HyFePoul_Mascot/Documentation/Stage5_Web_Integration.md).
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phoneQ = matchMedia('(max-width: 760px)');
const OFF_KEY = 'hfp-pip-off';
const LOOPS = new Set(['Loco_Idle', 'Loco_LookAround', 'Loco_Walk', 'Loco_Run', 'Loco_Sleep', 'Web_RoamDashboard']);
const FRIENDLY = ['Pers_Wave', 'Pers_HeadTilt', 'Loco_LookAround', 'Pers_Think', 'Pers_Point'];
const LINES = [
  'Hi! I\'m PIP 👋',
  'Each of the five trays sits on its own 1 kg load cell.',
  'I only pour the feed a tray is missing.',
  'Low water? The buzzer sounds and the app gets an alert.',
  'Scheduled feeds still run when the Wi-Fi is down.',
  'The 12 V battery keeps me feeding through a brownout.',
  'Set up to three feeding times a day, on the panel or the app.',
];
const VIEW_H = 1.35;          // world units visible top to bottom
const WALK_SPEED = 0.18;      // units per second at scale 1 (Loco_Walk)
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

let THREE, el, canvas, bubble, renderer, scene, camera, mixer, pip, actions = {}, current = null;
let loading = null, visible = false, rendering = false, lastPop = -Infinity, lastScroll = null, timer = 0, walk = null, clock;

function off() { try { return sessionStorage.getItem(OFF_KEY) === '1'; } catch { return false; } }
const presenting = () => document.body.classList.contains('mode-slides');

function buildDom() {
  el = document.createElement('div');
  el.className = 'pip';
  el.hidden = true;
  el.innerHTML = `
    <p class="pip-say" role="status" aria-live="polite"></p>
    <button class="pip-x" type="button" aria-label="Hide PIP for this visit"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="m7 7 10 10M17 7 7 17"/></svg></button>
    <canvas class="pip-c" aria-label="PIP, the HyFePoul mascot. Click him to make him jump." role="img"></canvas>`;
  document.body.append(el);
  canvas = el.querySelector('canvas'); bubble = el.querySelector('.pip-say');
  el.querySelector('.pip-x').addEventListener('click', () => {
    try { sessionStorage.setItem(OFF_KEY, '1'); } catch {}
    leave(true);
  });
  canvas.addEventListener('click', () => {
    if (!visible || reduced || walk) return;
    play(Math.random() < 0.5 ? 'Pers_HappyJump' : 'Pers_Celebrate');
    extend(3);
  });
}

async function load() {
  if (loading) return loading;
  loading = (async () => {
    const [three, { GLTFLoader }] = await Promise.all([import('three'), import('three/gltf')]);
    THREE = three;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
    mixer = new THREE.AnimationMixer(pip);
    gltf.animations.forEach(c => {
      const a = mixer.clipAction(c);
      a.setLoop(LOOPS.has(c.name) ? THREE.LoopRepeat : THREE.LoopOnce);
      a.clampWhenFinished = !LOOPS.has(c.name);
      actions[c.name] = a;
    });
    mixer.addEventListener('finished', () => { if (visible && !walk) play('Loco_Idle'); });
    clock = new THREE.Clock();
    size();
  })();
  return loading;
}

function size() {
  if (!renderer) return;
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}

function play(name, fade = 0.25) {
  const next = actions[name]; if (!next) return;
  next.reset().play();
  if (current && current !== next) current.crossFadeTo(next, fade, false);
  current = next;
}

function frame() {
  if (!rendering) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  if (walk) {
    // Move the overlay at the speed the feet move: units per second times pixels per unit.
    const pxPerUnit = canvas.clientHeight / VIEW_H;
    walk.x += walk.dir * WALK_SPEED * pxPerUnit * dt;
    el.style.setProperty('--walk', `${walk.x.toFixed(1)}px`);
    if (Math.abs(walk.x - walk.from) >= walk.dist) {
      walk = null; pip.rotation.y = 0; play('Loco_Stop', 0.2);
    }
  }
  mixer.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function startRender() { if (rendering || !renderer) return; rendering = true; clock.getDelta(); requestAnimationFrame(frame); }
function stopRender() { rendering = false; }

let leaveT = 0, actT = 0;
function extend(s) { clearTimeout(leaveT); leaveT = setTimeout(() => leave(false), s * 1000); }

async function popUp() {
  if (off() || presenting() || document.hidden || visible) return schedule();
  const bucket = Math.round(scrollY / Math.max(1, innerHeight * 0.75));
  if (bucket === lastScroll) return schedule(rand(15, 30));   // not on the same screen twice in a row
  await load();
  if (off() || presenting() || document.hidden) return schedule();
  lastScroll = bucket; lastPop = performance.now();
  visible = true; el.hidden = false; size();
  el.classList.remove('out'); void el.offsetWidth; el.classList.add('in');
  bubble.textContent = pick(LINES);
  if (reduced) {
    play('Loco_Idle'); mixer.update(0); renderer.render(scene, camera);
    el.classList.add('say');
    extend(rand(6, 10));
    return;
  }
  startRender();
  play('Web_Appear', 0);
  clearTimeout(actT);
  actT = setTimeout(() => {
    if (!visible) return;
    el.classList.add('say');
    if (Math.random() < 0.35) {
      // A short walk along the bottom edge, towards the middle of the screen.
      const dir = phoneQ.matches ? 1 : -1;
      walk = { dir, x: 0, from: 0, dist: rand(50, 110) };
      pip.rotation.y = Math.atan2(dir, 0);
      play('Loco_Walk');
    } else play(pick(FRIENDLY));
  }, 1300);
  extend(rand(6, 10));
}

function leave(now) {
  if (!visible) return;
  clearTimeout(leaveT); clearTimeout(actT);
  const go = () => {
    el.classList.remove('in', 'say'); el.classList.add('out');
    setTimeout(() => {
      visible = false; el.hidden = true; walk = null;
      if (pip) pip.rotation.y = 0;
      el.style.setProperty('--walk', '0px');
      stopRender(); schedule();
    }, reduced ? 0 : 420);
  };
  if (now || reduced || !actions.Pers_Wave) return go();
  walk = null; if (pip) pip.rotation.y = 0;
  bubble.textContent = 'Bye for now!';
  play('Pers_Wave');
  setTimeout(go, 1400);
}

function schedule(delay) {
  clearTimeout(timer);
  if (off()) return;
  const wait = delay ?? rand(20, 60);
  const gap = Math.max(0, 120000 - (performance.now() - lastPop));   // at most one pop-up every ~2 minutes
  timer = setTimeout(popUp, Math.max(wait * 1000, lastPop > 0 ? gap : 0));
}

export function initPip() {
  if (off() || !('WebGLRenderingContext' in window)) return;
  buildDom();
  addEventListener('resize', size);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRender(); else if (visible && !reduced) startRender();
  });
  // Presenter mode: PIP steps aside.
  new MutationObserver(() => { if (presenting() && visible) leave(true); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  schedule();
  // ?pip=now shows him after two seconds, for checking.
  if (new URLSearchParams(location.search).get('pip') === 'now') schedule(2);
}
