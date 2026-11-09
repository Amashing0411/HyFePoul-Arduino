import * as THREE from 'three';
import { OrbitControls } from 'three/orbit';
import { mergeGeometries } from 'three/bgu';
import { PARTS, VIEW_PINS } from './parts.js';
import { buildModel, W } from './model.js';
import { wireList } from './wiring.js';

const $ = id => document.getElementById(id);
const P = Object.fromEntries(PARTS.map(p => [p.id, p]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const VIEWS = {
  whole: { c: [134, 41, 86], dir: [0.5, 0.36, -1], w: 292, h: 212 },
  box: { c: [250, 24, 80], dir: [1, 0.07, 0.02], w: 48, h: 52, wPhone: 38, cPhone: [250, 26, 80] },
  hopper: { c: [50.5, 60, 100], dir: [-0.45, 0.72, -1], w: 66, h: 58 },
  trays: { c: [134, 50, 72], dir: [0.02, 0.1, -1], w: 216, h: 60 },
  chain: { c: [134, 44, 108], dir: [0.14, 0.32, -1], w: 250, h: 70 },
  water: { c: [34, 26, 124], dir: [-0.5, 0.16, -1], w: 100, h: 112 },
  cycle: { c: [134, 50, 94], dir: [0.02, 0.14, -1], w: 256, h: 110 },
};
const HINTS = {
  box: 'Red is 12 V, amber is 5 V, black is ground. Routes are tidied for clarity, and every wire ends at its real pin.',
  trays: 'From the front, left to right: trays 4, 5, 3, 2, 1.',
  cycle: 'From the front, left to right: trays 4, 5, 3, 2, 1.',
  hopper: 'The level sensor board sits on top of the cover, in a sealed window.',
  water: 'Water flows down from the reservoir by gravity.',
  chain: 'Turn off Covers to see the wires inside the spiral wrap.',
};
const DEFAULT_HINT = 'Drag to turn. Scroll or pinch to zoom. Tap a number to learn about that part.';

export function init({ cad, onSelect, onFail }) {
  const stage = $('stage'), tools = $('tools'), head = stage.querySelector('.stage-head');
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  stage.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); onFail('The 3D view stopped working on this device.'); });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 2, 2200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 8; controls.maxDistance = 1000;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4c5550, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(120, 260, 240); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.1); fill.position.set(320, 90, 40); scene.add(fill);
  const back = new THREE.DirectionalLight(0xffffff, 0.6); back.position.set(-180, 120, -240); scene.add(back);
  // Soft contact shadow in place of a floor, so the machine sits on the blue of the page.
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(128, 64, 8, 128, 64, 128);
    g.addColorStop(0, 'rgba(3,18,58,.62)'); g.addColorStop(1, 'rgba(3,18,58,0)');
    x.setTransform(1, 0, 0, 0.5, 0, 32); x.fillStyle = g; x.fillRect(0, -64, 256, 256);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(420, 210), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(5, -0.5, -5); scene.add(floor);
  }

  const M = buildModel(cad, PARTS);
  scene.add(M.root);
  M.carrier.position.x = M.TRAY_X[1] - 208.85; // the hopper rests at home, over tray 1
  scene.updateMatrixWorld(true);

  let dirty = true;
  const invalidate = () => { dirty = true; };

  // --- Wires ---
  const wires = wireList(M.HXU);
  const wireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  const layers = { v12: new THREE.Group(), v5: new THREE.Group(), sig: new THREE.Group() };
  Object.values(layers).forEach(g => M.root.add(g));
  const worldAnchor = ([id, a], out) => {
    const def = P[id].anchors[a];
    if (!def) throw new Error(`Missing anchor ${id}.${a}`);
    return P[id].obj.localToWorld(out.copy(def.p));
  };
  const anchorNormal = ([id, a], out) => {
    const q = new THREE.Quaternion(); P[id].obj.getWorldQuaternion(q);
    return out.copy(P[id].anchors[a].n).normalize().applyQuaternion(q);
  };
  // Resolve each wire's route once, with everything at rest.
  wires.forEach(w => {
    const A = worldAnchor(w.from, V()), nA = anchorNormal(w.from, V());
    const cur = M.box.worldToLocal(A.clone().addScaledVector(nA, 0.45));
    const Bb = M.box.worldToLocal(worldAnchor(w.to, V()));
    const pick = (val, axis) => (val === 'B' ? Bb[axis] : val);
    w.pts = [];
    w.steps.forEach(s => {
      if (s.w) w.pts.push({ f: 's', p: W(...s.w) });
      else if (s.c) w.pts.push({ f: 'c', p: W(...s.c) });
      else if (s.dr) w.pts.push({ f: 'd', p: V(...s.dr) });
      else {
        if ('u' in s) cur.x = pick(s.u, 'x');
        if ('v' in s) cur.y = pick(s.v, 'y');
        if ('d' in s) cur.z = pick(s.d, 'z');
        w.pts.push({ f: 's', p: M.box.localToWorld(cur.clone()) });
      }
    });
  });
  const shiftOf = (id, out) => {
    out.set(0, 0, 0);
    const q = new THREE.Quaternion(), e = V();
    for (let g = P[id].obj; g && g !== M.root; g = g.parent) {
      if (g.userData.ex) { g.parent.getWorldQuaternion(q); out.addScaledVector(e.copy(g.userData.ex).applyQuaternion(q), explode); }
    }
    return out;
  };
  // Rounds each corner of a route, then sweeps a thin tube along it. Straight runs need only their two end rings.
  const CORNER = 0.28;
  function rounded(pts) {
    const clean = pts.filter((p, i) => !i || p.distanceToSquared(pts[i - 1]) > 1e-6), out = [clean[0]];
    const a = V(), b = V();
    for (let i = 1; i < clean.length - 1; i++) {
      const p = clean[i];
      a.subVectors(clean[i - 1], p); b.subVectors(clean[i + 1], p);
      const la = a.length(), lb = b.length();
      a.divideScalar(la); b.divideScalar(lb);
      if (a.dot(b) < -0.9995) { out.push(p); continue; }
      const r = Math.min(CORNER, la * 0.45, lb * 0.45), q0 = p.clone().addScaledVector(a, r), q1 = p.clone().addScaledVector(b, r);
      for (let k = 0; k <= 4; k++) {
        const t = k / 4, m = 1 - t;
        out.push(V(m * m * q0.x + 2 * m * t * p.x + t * t * q1.x, m * m * q0.y + 2 * m * t * p.y + t * t * q1.y, m * m * q0.z + 2 * m * t * p.z + t * t * q1.z));
      }
    }
    out.push(clean[clean.length - 1]);
    return out;
  }
  function sweep(s, r) {
    const RAD = 5, pos = [], nor = [], idx = [], T = V(), N = V(0.31, 0.77, 0.55), Bn = V(), v2 = V();
    s.forEach((p, i) => {
      T.subVectors(s[Math.min(i + 1, s.length - 1)], s[Math.max(i - 1, 0)]).normalize();
      N.addScaledVector(T, -N.dot(T)).normalize();
      Bn.crossVectors(T, N);
      for (let k = 0; k < RAD; k++) {
        const an = k / RAD * Math.PI * 2;
        v2.copy(N).multiplyScalar(Math.cos(an)).addScaledVector(Bn, Math.sin(an));
        nor.push(v2.x, v2.y, v2.z); pos.push(p.x + v2.x * r, p.y + v2.y * r, p.z + v2.z * r);
      }
      if (i) for (let k = 0; k < RAD; k++) {
        const a = (i - 1) * RAD + k, b = (i - 1) * RAD + (k + 1) % RAD;
        idx.push(a, b, b + RAD, a, b + RAD, a + RAD);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
  const col = new THREE.Color(), dA = V(), dB = V();
  const tubeFor = (w, grow = 1) => {
    const A = worldAnchor(w.from, V()), B = worldAnchor(w.to, V());
    shiftOf(w.from[0], dA); shiftOf(w.to[0], dB);
    const n = w.pts.length, pts = [A, A.clone().addScaledVector(anchorNormal(w.from, V()), 0.45)];
    w.pts.forEach((q, i) => {
      const s = (i + 1) / (n + 1);
      if (q.f === 'c') pts.push(M.carrier.localToWorld(q.p.clone()));
      else if (q.f === 'd') pts.push(M.doorG.localToWorld(q.p.clone()));
      else pts.push(q.p.clone().addScaledVector(dA, 1 - s).addScaledVector(dB, s));
    });
    pts.push(B.clone().addScaledVector(anchorNormal(w.to, V()), 0.45), B);
    const g = sweep(rounded(pts), w.r * grow);
    if (grow === 1) {
      col.set(w.color);
      const c = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < c.length; i += 3) { c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    return g;
  };
  const slots = new Map();
  const groupKey = w => w.layer + '|' + (w.dyn || 'static');
  const rebuildWires = (filter) => {
    const byKey = new Map();
    wires.forEach(w => { const k = groupKey(w); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(w); });
    byKey.forEach((list, k) => {
      if (filter && !filter(list[0])) return;
      const geos = list.map(w => tubeFor(w));
      const merged = mergeGeometries(geos); geos.forEach(g => g.dispose());
      let m = slots.get(k);
      if (!m) { m = new THREE.Mesh(merged, wireMat); m.frustumCulled = false; layers[list[0].layer].add(m); slots.set(k, m); }
      else { m.geometry.dispose(); m.geometry = merged; }
    });
    refreshWireHighlight();
  };
  let wireHL = null, selected = null;
  function refreshWireHighlight() {
    if (wireHL) { M.root.remove(wireHL); wireHL.geometry.dispose(); wireHL = null; }
    if (!selected) return;
    const list = wires.filter(w => (w.from[0] === selected || w.to[0] === selected) && layers[w.layer].visible);
    if (!list.length) return;
    const geos = list.map(w => tubeFor(w, 1.35));
    wireHL = new THREE.Mesh(mergeGeometries(geos), hlMat); geos.forEach(g => g.dispose());
    wireHL.frustumCulled = false; M.root.add(wireHL);
  }

  // --- State ---
  let explode = 0, doorAngle = 0, doorTarget = 0, wallsOn = true, labelsOn = true, activeView = 'whole', tween = null;
  const walls = [];
  PARTS.forEach(p => p.meshes.forEach(m => { if (m.userData.wall) walls.push(m); }));
  const applyLayout = () => {
    PARTS.forEach(p => { const g = p.obj, b = g.userData.base; g.position.copy(b).addScaledVector(p.ex, explode); });
    M.box.position.copy(M.box.userData.base); M.box.position.x += 34 * explode;
    M.doorG.rotation.y = -doorAngle;
    M.root.updateMatrixWorld(true);
  };
  const applyWalls = () => {
    walls.forEach(m => { m.visible = wallsOn; });
    P.door.obj.visible = wallsOn; P.lid.obj.visible = wallsOn; P.cage.obj.visible = wallsOn;
    const r = M.cadMats.reservoir; r.transparent = !wallsOn; r.opacity = wallsOn ? 1 : 0.28; r.depthWrite = wallsOn; r.needsUpdate = true;
    invalidate();
  };

  // --- Camera ---
  const isPhone = () => stage.clientWidth < 620;
  function fit(view) {
    const Wd = stage.clientWidth, H = stage.clientHeight;
    const top = head.offsetHeight + 16, bottom = tools.offsetHeight + 18, usable = Math.max(120, H - top - bottom);
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = isPhone() && view.wPhone ? view.wPhone : view.w;
    const d = Math.max(view.h / 2 / tanH * H / usable, w / 2 / (tanH * (Wd / H))) * 1.05;
    const c = isPhone() && view.cPhone ? view.cPhone : view.c;
    const t = W(...c), dir = V(...view.dir).normalize();
    return { t, p: t.clone().addScaledVector(dir, d) };
  }
  function setOffset() {
    const Wd = stage.clientWidth, H = stage.clientHeight;
    camera.aspect = Wd / H;
    const top = head.offsetHeight + 16, bottom = tools.offsetHeight + 18;
    camera.setViewOffset(Wd, H, 0, (bottom - top) / 2, Wd, H);
    camera.updateProjectionMatrix();
  }
  function flyTo(t, p, ms = 800) {
    if (reduced || ms === 0) { controls.target.copy(t); camera.position.copy(p); controls.update(); invalidate(); return; }
    tween = { t0: performance.now(), ms, ft: controls.target.clone(), fp: camera.position.clone(), t, p };
    controls.enabled = false;
  }
  function setView(name, ms) {
    activeView = name;
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === name));
    doorTarget = name === 'box' ? 1.72 : 0;
    $('hint').textContent = HINTS[name] || DEFAULT_HINT;
    const f = fit(VIEWS[name]); flyTo(f.t, f.p, ms);
    updatePinSet();
  }

  // --- Pins ---
  const pinHost = $('pins'), pins = new Map();
  const centerOf = p => {
    if (p.pinAt) return W(...p.pinAt);
    const b = new THREE.Box3();
    p.meshes.forEach(m => { if (m.userData.pickable) b.expandByObject(m); });
    return b.getCenter(V());
  };
  PARTS.forEach(p => {
    p.pinLocal = p.obj.worldToLocal(centerOf(p));
    const b = document.createElement('button'); b.className = 'pin'; b.type = 'button'; b.setAttribute('aria-label', p.name);
    const n = document.createElement('b'); n.textContent = p.n; const s = document.createElement('span');
    b.append(n, s); b.addEventListener('click', () => select(p.id, false)); pinHost.append(b);
    pins.set(p.id, { el: b, text: s, p });
  });
  let pinSet = new Set(VIEW_PINS.whole);
  function updatePinSet() { pinSet = new Set(VIEW_PINS[activeView]); if (selected) pinSet.add(selected); }
  const v = V(), placed = [];
  function updatePins() {
    const Wd = stage.clientWidth, H = stage.clientHeight, phone = isPhone();
    placed.length = 0;
    const order = [...pinSet].sort((a, b) => (b === selected) - (a === selected));
    pins.forEach(o => { if (!pinSet.has(o.p.id) || !labelsOn) o.el.hidden = true; });
    if (!labelsOn) return;
    order.forEach(id => {
      const o = pins.get(id), { p, el, text } = o;
      if (!p.obj.visible && id !== selected) { el.hidden = true; return; }
      v.copy(p.pinLocal); p.obj.localToWorld(v).project(camera);
      if (v.z > 1) { el.hidden = true; return; }
      let x = (v.x + 1) / 2 * Wd, y = (1 - v.y) / 2 * H;
      const on = id === selected, want = on || !phone ? p.short : '';
      if (text.textContent !== want) text.textContent = want;
      el.classList.toggle('on', on);
      const w = want ? 28 + want.length * 6.4 : 24;
      const hit = (px, py, pw) => placed.some(r => px < r.x + r.w && px + pw > r.x && py - 12 < r.y + 12 && py + 12 > r.y - 12);
      let ok = false;
      for (const dy of [0, -26, 26, -52, 52, -78, 78]) { if (!hit(x - 12, y + dy, w)) { y += dy; ok = true; break; } }
      if (!ok && !on) { el.hidden = true; return; }
      if (x < 12 || x > Wd - 12 || y < head.offsetHeight + 4 || y > H - tools.offsetHeight - 26) { el.hidden = true; return; }
      placed.push({ x: x - 12, y, w });
      el.hidden = false;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    });
  }

  // --- Selection ---
  const hlCache = new WeakMap();
  const highlight = (m, big) => { let h = hlCache.get(m); if (!h) { h = m.clone(); h.emissive = new THREE.Color(0x1477e0); h.emissiveIntensity = big ? 0.15 : 0.42; hlCache.set(m, h); } return h; };
  function select(id, focus) {
    if (selected) P[selected].meshes.forEach(m => { m.material = m.userData.base; });
    selected = id;
    const p = P[id];
    p.meshes.forEach(m => { m.userData.base = m.material; if (m.userData.pickable) m.material = highlight(m.material, id === 'shell' || id === 'frame' || id === 'cage'); });
    onSelect(p); updatePinSet(); refreshWireHighlight();
    if (focus) {
      if (activeView !== p.view) setView(p.view, 0);
      const c = p.obj.localToWorld(p.pinLocal.clone());
      const b = new THREE.Box3(); p.meshes.forEach(m => b.expandByObject(m));
      const r = Math.max(b.getSize(V()).length() * 0.5, 7);
      const dir = V(...(p.focusDir || VIEWS[p.view].dir)).normalize();
      const dist = Math.max(r * 4.2, p.focusDir ? 75 : 32);
      flyTo(c, c.clone().addScaledVector(dir, dist), 800);
      if (p.focusDir) pinSet = new Set([id]);
    }
    invalidate();
  }
  const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
  const pickable = [];
  PARTS.forEach(p => p.meshes.forEach(m => { if (m.userData.pickable) pickable.push(m); }));
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  let downAt = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  el.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = el.getBoundingClientRect();
    pt.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(pt, camera);
    const hit = ray.intersectObjects(pickable.filter(shown), false)[0];
    if (hit) select(hit.object.userData.part, false);
  });

  // --- Feed cycle ---
  const OUTLET = 208.85, TY = 50.2;
  const DROPS = { 1: [0, 8, 16], 2: [-10, 0, 10], 3: [-10, 0, 10], 5: [-10, 0, 10], 4: [-16, -8, 0] };
  const m4 = new THREE.Matrix4(), s3 = V(), p3 = V(), q0 = new THREE.Quaternion();
  const pileIndex = (n, d) => [1, 2, 3, 5, 4].indexOf(n) * 3 + d;
  const setPile = (i, n, d, f) => {
    const X = M.TRAY_X[n] + DROPS[n][d];
    p3.copy(W(X, TY, 69.2 + 1.1 * f)); s3.set(5.4 * f + 0.001, 1.25 * f + 0.001, 3 * f + 0.001);
    M.piles.setMatrixAt(i, m4.compose(p3, q0, s3));
  };
  const clearPiles = () => { for (let i = 0; i < 15; i++) { m4.makeScale(0, 0, 0); M.piles.setMatrixAt(i, m4); } M.piles.instanceMatrix.needsUpdate = true; };
  clearPiles();
  const moveCarrier = X => { M.carrier.position.x = X - OUTLET; M.root.updateMatrixWorld(true); rebuildWires(w => w.dyn === 'carrier'); };
  let cycle = null;
  const status = $('cycleStatus'), playBtn = $('play');
  function buildSteps() {
    const steps = [], k = reduced ? 0 : 1;
    let at = OUTLET + M.carrier.position.x;
    const travel = (to, dur, label) => { const from = at; at = to; steps.push({ dur: dur * k, label, run: f => moveCarrier(from + (to - from) * f) }); };
    const hold = (dur, label, run) => steps.push({ dur, label, run: run || (() => {}) });
    travel(M.TRAY_X[1], 1.2, 'Hopper goes home, over the middle of tray 1');
    hold(1.4, 'Every tray is weighed to see what it already holds');
    [1, 2, 3, 5, 4].forEach((n, ti) => {
      DROPS[n].forEach((o, d) => {
        const X = M.TRAY_X[n] + o;
        if (d > 0) travel(X, 0.4, `Tray ${n}: moving to drop ${d + 1} of 3`);
        else if (ti > 0) travel(X, 1.3, `Moving on to tray ${n}`);
        hold(0.65, `Tray ${n}: pouring drop ${d + 1} of 3`, (f, step) => {
          M.pellets.visible = f < 1; setPile(pileIndex(n, d), n, d, f); M.piles.instanceMatrix.needsUpdate = true;
          for (let i = 0; i < 26; i++) {
            const ph = (f * 2.4 + i / 26) % 1, jx = Math.sin(i * 12.9) * 1.6, jy = Math.cos(i * 7.3) * 1.2;
            p3.copy(W(X + jx, TY + jy, 84 - 14 * ph * ph));
            M.pellets.setMatrixAt(i, m4.makeTranslation(p3.x, p3.y, p3.z));
          }
          M.pellets.instanceMatrix.needsUpdate = true;
        });
      });
      hold(0.45, `Tray ${n}: topped up to the target`);
    });
    travel(M.TRAY_X[1], 2.4, 'Finished. The hopper returns home');
    return steps;
  }
  function stopCycle(reset) {
    cycle = null; M.pellets.visible = false; status.hidden = true;
    playBtn.textContent = 'Play feed cycle';
    if (reset) { M.piles.visible = false; clearPiles(); moveCarrier(M.TRAY_X[1]); }
    controls.enabled = true; invalidate();
  }
  playBtn.addEventListener('click', () => {
    if (cycle) { stopCycle(true); return; }
    explode = 0; $('explode').value = 0;
    M.carrier.position.x = M.TRAY_X[1] - OUTLET; applyLayout(); rebuildWires();
    clearPiles(); M.piles.visible = true;
    setView('cycle');
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    cycle = { steps: buildSteps(), i: 0, t: 0 };
    status.hidden = false; status.textContent = cycle.steps[0].label;
    playBtn.textContent = 'Stop';
  });

  // --- Controls ---
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { if (cycle) stopCycle(true); setView(b.dataset.view); }));
  $('explode').addEventListener('input', e => { if (cycle) stopCycle(true); explode = +e.target.value; applyLayout(); rebuildWires(); invalidate(); });
  const toggle = (id, fn) => $(id).addEventListener('click', e => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); fn(on); invalidate(); });
  toggle('tWalls', on => { wallsOn = on; applyWalls(); });
  toggle('t12', on => { layers.v12.visible = on; refreshWireHighlight(); });
  toggle('t5', on => { layers.v5.visible = on; refreshWireHighlight(); });
  toggle('tSig', on => { layers.sig.visible = on; refreshWireHighlight(); });
  toggle('tLabels', on => { labelsOn = on; });
  controls.addEventListener('change', invalidate);
  addEventListener('hfp-render', invalidate);

  function resize() {
    const Wd = stage.clientWidth, H = stage.clientHeight;
    renderer.setSize(Wd, H, false); setOffset(); invalidate();
  }
  new ResizeObserver(() => { resize(); }).observe(stage);

  applyLayout(); applyWalls(); rebuildWires(); resize();
  const f0 = fit(VIEWS.whole); controls.target.copy(f0.t); camera.position.copy(f0.p); controls.update();
  updatePinSet();

  // --- Loop: draws only when something changed ---
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms), e = 1 - Math.pow(1 - k, 3);
      controls.target.lerpVectors(tween.ft, tween.t, e); camera.position.lerpVectors(tween.fp, tween.p, e);
      if (k === 1) { tween = null; controls.enabled = !cycle; }
      dirty = true;
    }
    if (Math.abs(doorAngle - doorTarget) > 0.002) {
      doorAngle = reduced ? doorTarget : doorAngle + (doorTarget - doorAngle) * Math.min(1, dt * 6);
      if (Math.abs(doorAngle - doorTarget) <= 0.002) doorAngle = doorTarget;
      applyLayout(); rebuildWires(w => w.dyn === 'door'); dirty = true;
    }
    if (cycle) {
      let s = cycle.steps[cycle.i];
      cycle.t += dt;
      const f = s.dur ? Math.min(1, cycle.t / s.dur) : 1;
      s.run(f, s);
      if (f >= 1) {
        cycle.i++; cycle.t = 0;
        if (cycle.i >= cycle.steps.length) stopCycle(false);
        else status.textContent = cycle.steps[cycle.i].label;
      }
      dirty = true;
    }
    if (controls.update()) dirty = true;
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    updatePins();
  });

  return id => { $('model').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); select(id, true); };
}
