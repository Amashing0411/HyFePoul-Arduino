import { PARTS, GROUPS } from './parts.js';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GUIDE = new URLSearchParams(location.search).has('guide');
// Jumps between sections: a short glide that re-measures the target every frame, so it always lands exactly on it.
let glideId = 0;
const go = (el, block = 'start', done) => {
  if (!el) return;
  if (P.on) { P.showEl(el); if (done) done(); return; }
  const id = ++glideId;
  const targetY = () => {
    const r = el.getBoundingClientRect();
    const y = scrollY + r.top - (block === 'center' ? Math.max(0, (innerHeight - r.height) / 2) : 0);
    return Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
  };
  const finish = () => { if (done) done(); };
  const to = y => scrollTo(0, y);
  if (reduced) { to(targetY()); finish(); return; }
  const y0 = scrollY, t0 = performance.now(), dur = 480;
  const step = now => {
    if (id !== glideId) return;
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    to(y0 + (targetY() - y0) * e);
    if (k < 1) requestAnimationFrame(step); else { to(targetY()); finish(); }
  };
  requestAnimationFrame(step);
};

// As the title scrolls away, its text drifts up and fades, and the waves move a little slower than the page.
function setupTitleMotion() {
  if (reduced) return;
  const lead = document.querySelector('.hero .lead'), waves = document.querySelector('.waves');
  let queued = false;
  const apply = () => {
    queued = false;
    const y = Math.min(scrollY, innerHeight);
    lead.style.transform = `translate3d(0, ${(y * -0.18).toFixed(1)}px, 0)`;
    lead.style.opacity = Math.max(0, 1 - y / (innerHeight * 0.7)).toFixed(3);
    waves.style.transform = `translate3d(0, ${(y * 0.12).toFixed(1)}px, 0)`;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(apply); } }, { passive: true });
  apply();
}

// --- Presenter mode: one slide at a time, nothing scrolls ---
// Long sections are split into pages at whole blocks (a paragraph, an objective item, a card),
// so no text is ever cut. A page that is still too tall is shrunk a little to fit.
const P = { on: false, i: 0, page: 0, pages: [[0, 0]], zooms: [1], label: () => {}, refresh: () => {}, slotTo: () => {} };
const UNITS = '#cProblem > p, #cGeneral, #cObjectives .subs > li, #cObjectives > .objective:not(.wide), #steps > li, #functionGrid > .fn, #gallery > *, #partsList > *, #trials > *, #cNotes > li, #schemFrame, #schematic .pin-table, #diagram, #previewApp > *, #previewPanel > *';
const PU_GROUPS = '.objective.wide, .notes';
function setupPresent() {
  const slides = [...document.querySelectorAll('.slide')];
  const root = document.documentElement;
  let savedY = 0, busy = 0;
  const units = sl => [...sl.querySelectorAll(UNITS)];
  const fits = sl => sl.scrollHeight <= sl.clientHeight + 1;
  const showRange = (sl, us, a, b) => {
    us.forEach((u, k) => u.classList.toggle('pu-off', k < a || k >= b));
    sl.querySelectorAll(PU_GROUPS).forEach(g => { const inner = units(g); g.classList.toggle('pu-off', inner.length > 0 && inner.every(u => u.classList.contains('pu-off'))); });
  };
  const canZoom = sl => !sl.querySelector('.slot') && sl.id !== 'team';
  const fitZoom = (sl, grow = 1.3) => {
    let z = 1; sl.style.zoom = '';
    if (!canZoom(sl)) return 1;
    while (!fits(sl) && z > (innerWidth < 700 ? 0.5 : 0.62)) { z = +(z - 0.04).toFixed(2); sl.style.zoom = z; }
    // A short page grows to fill the screen, so it reads well from the back of a room.
    if (z === 1) {
      while (z < grow - 0.001) { const n = +(z + 0.05).toFixed(2); sl.style.zoom = n; if (!fits(sl)) { sl.style.zoom = z; break; } z = n; }
    }
    return z;
  };
  // Split a slide into pages of whole blocks, then note how much each page must shrink.
  const layout = sl => {
    const us = units(sl);
    sl.style.zoom = '';
    showRange(sl, us, 0, us.length);
    const pages = [];
    if (!us.length || fits(sl)) pages.push([0, us.length]);
    else {
      let a = 0;
      while (a < us.length) {
        let b = a + 1;
        while (b < us.length) { showRange(sl, us, a, b + 1); if (!fits(sl)) break; b++; }
        pages.push([a, b]); a = b;
      }
      // Even out the pages (13 cards as 4,3,3,3 rather than 4,4,4,1), if every even page still fits.
      if (pages.length > 1) {
        const n = pages.length, even = [];
        let start = 0;
        for (let k = 0; k < n; k++) { const size = Math.ceil((us.length - start) / (n - k)); even.push([start, start + size]); start += size; }
        if (even.every(([x, y]) => { showRange(sl, us, x, y); return fits(sl); })) pages.splice(0, n, ...even);
      }
    }
    // Split sections are already dense, so their pages only grow a little.
    const zooms = pages.map(([a, b]) => { showRange(sl, us, a, b); return fitZoom(sl, pages.length > 1 ? 1.1 : 1.3); });
    return { us, pages, zooms };
  };
  let L = null;
  const paint = () => {
    const sl = slides[P.i], [a, b] = L.pages[P.page];
    showRange(sl, L.us, a, b);
    sl.style.zoom = L.zooms[P.page] === 1 ? '' : L.zooms[P.page];
    sl.classList.toggle('tall', !fits(sl));
    P.label(P.i, P.page, L.pages.length);
  };
  const show = (i, page = 0, dir = 1) => {
    const prev = slides[P.i];
    P.i = Math.max(0, Math.min(slides.length - 1, i));
    const sl = slides[P.i];
    slides.forEach((x, k) => { x.classList.toggle('cur', k === P.i); x.classList.toggle('before', k < P.i); });
    if (prev !== sl || !L) {
      if (prev && prev !== sl) { units(prev).forEach(u => u.classList.remove('pu-off')); prev.querySelectorAll(PU_GROUPS).forEach(g => g.classList.remove('pu-off')); prev.style.zoom = ''; }
      L = layout(sl);
    }
    P.page = page < 0 ? L.pages.length - 1 : Math.min(page, L.pages.length - 1);
    paint();
    root.dataset.pslide = sl.id;
    sl.classList.remove('enter'); void sl.offsetWidth; sl.classList.add('enter');
    sl.style.setProperty('--dir', dir);
    const slot = sl.querySelector('.slot'); if (slot) P.slotTo(slot);
    if (sl.id === 'team') fitTeam(sl);
  };
  // The badges grow as large as the screen allows. Their rail scales with the badge width,
  // so a couple of measured steps find the size that leaves the slide just full.
  const frames = n => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  let fitting = 0;
  const fitTeam = async sl => {
    const id = ++fitting, set = v => root.style.setProperty('--badge-max', Math.round(v));
    const stage = sl.querySelector('[data-stage]');
    if (!stage) { setTimeout(() => { if (id === fitting && P.on && slides[P.i] === sl) fitTeam(sl); }, 300); return; }
    let v = 260; set(v); await frames(3);
    for (let k = 0; k < 4 && id === fitting; k++) {
      const over = sl.scrollHeight - sl.clientHeight, badge = sl.querySelector('[data-badge]');
      if (!badge) break;
      const w = badge.offsetWidth, h = stage.offsetHeight - 24;
      if (over <= 0 && (w >= v - 1 || over > -12)) break;
      v = Math.max(124, Math.min(260, w * (h - over - 6) / h));
      set(v); await frames(3);
    }
    // Never leave it a few pixels too tall.
    for (let k = 0; k < 12 && id === fitting && sl.scrollHeight > sl.clientHeight; k++) { v -= 4; set(v); await frames(2); }
  };
  P.step = d => {
    if (d > 0 && P.page < L.pages.length - 1) { P.page++; paint(); slides[P.i].classList.remove('enter'); void slides[P.i].offsetWidth; slides[P.i].classList.add('enter'); return; }
    if (d < 0 && P.page > 0) { P.page--; paint(); return; }
    const k = P.i + d;
    if (k < 0 || k >= slides.length) return;
    show(k, d > 0 ? 0 : -1, d);
  };
  P.showEl = el => {
    const sl = el.closest('.slide'); if (!sl) return;
    const k = slides.indexOf(sl);
    show(k, 0, k >= P.i ? 1 : -1);
    const u = L.us.findIndex(x => x === el || x.contains(el) || el.contains(x));
    if (u >= 0) { const pg = L.pages.findIndex(([a, b]) => u >= a && u < b); if (pg > 0) { P.page = pg; paint(); } }
  };
  const current = () => {
    let i = 0;
    slides.forEach((s, k) => { if (s.getBoundingClientRect().top <= innerHeight * 0.4) i = k; });
    return i;
  };
  const enter = () => {
    if (P.on) return;
    const i = current();
    savedY = scrollY;
    P.on = true; root.classList.add('present');
    document.querySelectorAll('#presentBtn, #presentTop').forEach(b => b.setAttribute('aria-pressed', 'true'));
    L = null; show(i);
    if (root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(() => {});
  };
  const exit = () => {
    if (!P.on) return;
    const sl = slides[P.i];
    units(sl).forEach(u => u.classList.remove('pu-off')); sl.querySelectorAll(PU_GROUPS).forEach(g => g.classList.remove('pu-off'));
    slides.forEach(x => { x.classList.remove('cur', 'before', 'enter', 'tall'); x.style.zoom = ''; });
    P.on = false; root.classList.remove('present'); delete root.dataset.pslide; root.style.removeProperty('--badge-max'); fitting++;
    document.querySelectorAll('#presentBtn, #presentTop').forEach(b => b.setAttribute('aria-pressed', 'false'));
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    scrollTo(0, sl.getBoundingClientRect().top + scrollY);
    savedY = 0; P.refresh(); dispatchEvent(new Event('scroll'));
  };
  const toggle = () => (P.on ? exit() : enter());
  $('presentBtn').addEventListener('click', toggle);
  $('presentTop').addEventListener('click', toggle);
  addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t.closest && t.closest('input,textarea,select,[contenteditable]')) return;
    if ((e.key === 'p' || e.key === 'P') && !e.repeat) { e.preventDefault(); toggle(); return; }
    if (!P.on) return;
    if (t.closest && t.closest('[data-slot="team-lanyard-rail"]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    const next = ['PageDown', ' ', 'ArrowDown'].includes(e.key), prev = ['PageUp', 'ArrowUp'].includes(e.key);
    if (e.key === 'Escape' && $('pageMenu').hidden && !document.fullscreenElement) { exit(); return; }
    if (e.key === 'Home') { e.preventDefault(); show(0, 0, -1); return; }
    if (e.key === 'End') { e.preventDefault(); show(slides.length - 1, 0, 1); return; }
    if (next || prev) { if (t.closest && t.closest('button,a') && e.key === ' ') return; e.preventDefault(); P.step(next ? 1 : -1); }
  });
  // Mouse wheel and swipes turn the pages too, except over the 3D model and the badge rail.
  const skip = t => t.closest && t.closest('.stage, [data-slot="team-lanyard-rail"], .pager-menu');
  let wheelLock = 0;
  addEventListener('wheel', e => {
    if (!P.on || skip(e.target)) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock || Math.abs(e.deltaY) < 12) return;
    wheelLock = now + 650; P.step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  let tx = null, ty = 0;
  addEventListener('touchstart', e => { if (P.on && !skip(e.target)) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } else tx = null; }, { passive: true });
  addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 50) return;
    P.step((Math.abs(dx) > Math.abs(dy) ? -dx : -dy) > 0 ? 1 : -1);
  }, { passive: true });
  let rt = 0;
  const relayout = () => { if (!P.on) return; clearTimeout(rt); rt = setTimeout(() => { const pg = P.page; const sl = slides[P.i]; units(sl).forEach(u => u.classList.remove('pu-off')); L = layout(sl); P.page = Math.min(pg, L.pages.length - 1); paint(); if (sl.id === 'team') fitTeam(sl); }, 150); };
  addEventListener('resize', relayout);
  // Photos that finish loading can change a page's height.
  document.addEventListener('load', e => { if (P.on && e.target.tagName === 'IMG' && slides[P.i].contains(e.target)) relayout(); }, true);
  if (new URLSearchParams(location.search).has('present')) requestAnimationFrame(enter);
}

// In-page links use the same glide as the pager.
function setupLinks() {
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault(); go(t); history.replaceState(null, '', a.getAttribute('href'));
  });
}

// Cards in each grid rise in one after another the first time they come into view.
function setupReveal() {
  if (reduced || !('IntersectionObserver' in window)) return;
  // Not the app/panel screens: they sit in a tab that can be hidden, and a fade there could stall.
  const groups = ['.head', '.objectives', '.steps', '.functions', '.gallery', '.parts', '.stats', '.flow'];
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  groups.forEach(sel => document.querySelectorAll(sel).forEach(g => {
    [...g.children].forEach((c, i) => { c.classList.add('rv'); c.style.setProperty('--d', `${Math.min(i, 8) * 60}ms`); io.observe(c); });
  }));
}

// Result numbers count up once, keeping their sign, decimals and unit.
function setupCounters() {
  const els = [...document.querySelectorAll('.stats b')];
  const run = el => {
    const m = el.textContent.match(/^([+\u2212-]?)(\d+(?:\.\d+)?)(.*)$/);
    if (!m || reduced) return;
    const [, sign, num, rest] = m, target = parseFloat(num), dec = (num.split('.')[1] || '').length, t0 = performance.now(), dur = 900;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = sign + (target * e).toFixed(dec) + rest;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: 0.6 });
  els.forEach(el => io.observe(el));
}
let LIB = { files: [], videos: [], app: [], panel: [], photos: [], team: [] };
let C = {};
let viewer = null;

const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const findFile = base => { for (const e of IMG_EXT) if (LIB.files.includes(`${base}.${e}`)) return `${base}.${e}`; return null; };
const ICON = {
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  photo: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/></svg>',
  text: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 10h14M5 14h9M5 18h6"/></svg>',
};
const hasMedia = v => !!(v && (v.src || v.youtube));

function placeholder(file, icon, label) {
  const d = document.createElement('div'); d.className = 'ph';
  d.innerHTML = ICON[icon];
  const p = document.createElement('span');
  p.textContent = GUIDE ? file : label;
  if (GUIDE) p.className = 'file';
  d.append(p);
  return d;
}
// Text from the project document; an empty value shows a clear placeholder.
function fillText(el, value, label) {
  el.textContent = '';
  const list = Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
  if (!list.length) {
    const d = document.createElement('div'); d.className = 'ph-text';
    d.innerHTML = ICON.text;
    const s = document.createElement('span'); s.textContent = GUIDE ? `${label} (data/content.json)` : `${label} will be added from the project document.`;
    d.append(s); el.append(d);
    return;
  }
  list.forEach(t => { const p = document.createElement('p'); p.textContent = t; el.append(p); });
}

// --- Title, problem, objectives ---
function renderIntro() {
  $('cTagline').textContent = C.tagline || '';
  $('cCourse').textContent = [C.course, C.school || (GUIDE ? '(school name)' : '')].filter(Boolean).join(' · ');
  if (C.fullTitle) document.title = `HyFePoul: ${C.fullTitle}`;
  fillText($('cProblem'), C.problem, 'The problem statement');
  const g = $('cGeneral'); g.textContent = '';
  const gh = document.createElement('h3'); gh.textContent = 'General objective';
  const gb = document.createElement('div'); fillText(gb, C.generalObjective, 'The general objective');
  g.append(gh, gb);
  const host = $('cObjectives'); host.textContent = '';
  const chips = ids => {
    const met = document.createElement('div'); met.className = 'met';
    const ok = (ids || []).map(id => (C.functions || []).find(x => x.id === id)).filter(Boolean);
    if (!ok.length) return null;
    const lab = document.createElement('span'); lab.textContent = 'Met by'; met.append(lab);
    ok.forEach(f => { const b = document.createElement('a'); b.href = `#fn-${f.id}`; b.textContent = f.title; met.append(b); });
    return met;
  };
  (C.specificObjectives || []).forEach((o, i) => {
    const a = document.createElement('article'); a.className = 'objective' + (o.items ? ' wide' : ''); a.id = `objective-${i + 1}`;
    const n = document.createElement('span'); n.className = 'onum'; n.textContent = i + 1;
    const body = document.createElement('div'); fillText(body, o.text, `Specific objective ${i + 1}`);
    a.append(n, body);
    if (o.items) {
      const ol = document.createElement('ol'); ol.className = 'subs';
      o.items.forEach(it => {
        const li = document.createElement('li'); li.id = `objective-${i + 1}${it.label}`;
        const l = document.createElement('span'); l.className = 'sl'; l.textContent = it.label;
        const t = document.createElement('div'); const p = document.createElement('p'); p.textContent = it.text; t.append(p);
        const m = chips(it.functions); if (m) t.append(m);
        li.append(l, t); ol.append(li);
      });
      a.append(ol);
    } else { const m = chips(o.functions); if (m) a.append(m); }
    host.append(a);
  });
}

// --- How it works: steps light up with the feed cycle ---
function renderSteps() {
  const ol = $('steps'); ol.textContent = '';
  (C.steps || []).forEach((s, i) => {
    const li = document.createElement('li'); li.dataset.i = i;
    const n = document.createElement('span'); n.className = 'snum'; n.textContent = i + 1;
    const b = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = s.title;
    const p = document.createElement('p'); p.textContent = s.text;
    b.append(h, p); li.append(n, b); ol.append(li);
  });
  const status = $('cycleStatus');
  const stepOf = t => /goes home/i.test(t) ? 0 : /weighed/i.test(t) ? 1 : /pouring|moving/i.test(t) ? 2 : /topped up/i.test(t) ? 3 : /finished|returns home/i.test(t) ? 4 : -1;
  const mark = () => {
    const i = status.hidden ? -1 : stepOf(status.textContent);
    ol.querySelectorAll('li').forEach(li => { const k = +li.dataset.i; li.classList.toggle('on', k === i); li.classList.toggle('done', i >= 0 && k < i); });
  };
  new MutationObserver(mark).observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  $('playHow').addEventListener('click', () => { if ($('play').textContent !== 'Stop') $('play').click(); go($('how'), 'start'); });
}

// --- Functions: objective, what it does, video and photo ---
function openVideo(v) {
  const host = $('videoHost'); host.textContent = '';
  if (v.youtube) {
    const f = document.createElement('iframe'); f.src = v.youtube; f.title = v.title; f.allow = 'encrypted-media; picture-in-picture'; f.allowFullscreen = true; host.append(f);
  } else {
    const e = document.createElement('video'); e.src = v.src; e.controls = true; e.playsInline = true; e.autoplay = true; if (v.poster) e.poster = v.poster; host.append(e);
  }
  $('videoDialog').showModal();
}
$('videoDialog').addEventListener('close', () => { $('videoHost').textContent = ''; });

function renderFunctions() {
  const host = $('functionGrid'); host.textContent = '';
  (C.functions || []).forEach((f, i) => {
    const card = document.createElement('article'); card.className = 'fn'; card.id = `fn-${f.id}`;
    const media = document.createElement('div'); media.className = 'fmedia';
    const v = LIB.videos.find(x => x.id === f.id);
    const photo = findFile(`media/functions/${f.id}`);
    if (hasMedia(v)) {
      const b = document.createElement('button'); b.className = 'fplay'; b.setAttribute('aria-label', `Play video: ${f.title}`);
      if (v.poster || photo) { const im = document.createElement('img'); im.src = v.poster || photo; im.alt = ''; im.loading = 'lazy'; b.append(im); }
      const ic = document.createElement('span'); ic.className = 'playicon'; ic.innerHTML = ICON.play; b.append(ic);
      b.addEventListener('click', () => openVideo(v)); media.append(b);
    } else if (photo) {
      const im = document.createElement('img'); im.src = photo; im.alt = f.title; im.loading = 'lazy'; media.append(im);
      const s = document.createElement('span'); s.className = 'vsoon'; s.textContent = 'Video coming soon'; media.append(s);
    } else media.append(placeholder(`media/videos/${f.id}.mp4 or media/functions/${f.id}.jpg`, 'play', 'Video coming soon'));
    const body = document.createElement('div'); body.className = 'fbody';
    let meets = null;
    (C.specificObjectives || []).forEach((o, k) => {
      if (meets) return;
      if ((o.functions || []).includes(f.id)) meets = { id: `objective-${k + 1}`, label: `${k + 1}` };
      (o.items || []).forEach(it => { if (!meets && (it.functions || []).includes(f.id)) meets = { id: `objective-${k + 1}${it.label}`, label: `${k + 1}${it.label}` }; });
    });
    if (meets) { const m = document.createElement('a'); m.className = 'meets'; m.href = `#${meets.id}`; m.textContent = `Meets objective ${meets.label}`; body.append(m); }
    const h = document.createElement('h3'); h.textContent = f.title;
    const p = document.createElement('p'); p.textContent = f.what;
    body.append(h, p);
    card.append(media, body); host.append(card);
  });
}

// --- Schematic ---
const PIN_ROWS = [
  ['A0 / A1', 'Tray 1 scale (HX711 DT / SCK)'], ['A2 / A3', 'Tray 2 scale'], ['A4 / A5', 'Tray 3 scale'], ['A6 / A7', 'Tray 4 scale'], ['A8 / A9', 'Tray 5 scale'],
  ['10', 'Relay 1: chain toward tray 1'], ['9', 'Relay 2: chain toward tray 4'], ['8', 'Relay 3: dispenser motor'], ['11', 'Buzzer'],
  ['52 / 50', 'Level sensor TRIG / ECHO'], ['49', 'Float switch (water)'], ['53', 'Home limit switch (tray 1 side)'], ['51', 'Limit switch (tray 4 side)'],
  ['16 / 17', 'Touch screen RX / TX'], ['20 / 21', 'Clock SDA / SCL'], ['14 / 15', 'ESP32 GPIO16 / GPIO17'],
];
function renderSchematic() {
  const frame = $('schemFrame'); frame.textContent = '';
  const src = findFile('media/schematic/schematic');
  if (src) {
    const b = document.createElement('button'); b.className = 'schem'; b.setAttribute('aria-label', 'Enlarge the schematic');
    const im = document.createElement('img'); im.src = src; im.alt = 'Wiring schematic of HyFePoul'; b.append(im);
    b.addEventListener('click', () => { shots = [{ src, alt: im.alt, title: 'Wiring schematic', detail: '' }]; openShot(0); });
    frame.append(b);
  } else frame.append(placeholder('media/schematic/schematic.png', 'photo', 'Schematic coming soon'));
  $('pinRows').innerHTML = PIN_ROWS.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
}

function renderDiagram() {
  // The team's block diagram, when it is in the library; the drawn one below otherwise.
  const img = findFile('media/schematic/block-diagram');
  if (img) {
    const host = $('diagram'); host.textContent = '';
    const b = document.createElement('button'); b.className = 'schem diagram-img'; b.setAttribute('aria-label', 'Enlarge the block diagram');
    const im = document.createElement('img'); im.src = img; im.alt = 'Block diagram: power from the 220 V source and charge controller with the 12 V battery, the main switch and two buck converters; the sensors feeding the Arduino Mega; the Mega driving the ESP32, Nextion, buzzer and the relay module for the chain and dispenser motors.'; b.append(im);
    b.addEventListener('click', () => { shots = [{ src: img, alt: im.alt, title: 'Block diagram', detail: '' }]; openShot(0); });
    host.append(b);
    return;
  }
  $('diagram').innerHTML = `
  <div class="flow">
    <div class="node"><h3>What it senses</h3><ul><li>5 load cells through 5 HX711 boards</li><li>Ultrasonic level sensor</li><li>Float switch</li><li>2 limit switches</li><li>DS3231 clock</li></ul></div>
    <div class="node main"><h3>Arduino Mega 2560</h3><p>Reads the sensors, decides how much each tray needs, and drives the machine.</p></div>
    <div class="node"><h3>What it moves</h3><ul><li>Chain motor, through 2 relays</li><li>Dispenser motor, through 1 relay</li><li>Buzzer</li><li>Nextion touch screen</li></ul></div>
  </div>
  <div class="flow line"><div class="node main"><h3>Mega</h3></div><div class="node"><h3>ESP32</h3><p>Wi-Fi bridge</p></div><div class="node"><h3>Firebase</h3><p>Cloud database</p></div><div class="node"><h3>Mobile app</h3><p>Timely updates and alerts</p></div></div>
  <div class="flow line"><div class="node"><h3>12 V supply and battery</h3><p>With charge controller</p></div><div class="node"><h3>Step-down boards</h3><p>12 V to 5 V for the electronics</p></div><div class="node"><h3>Relay contacts</h3><p>12 V to the motors</p></div></div>`;
}

// --- App and panel previews ---
// Each screen opens full size in the lightbox, with Previous and Next through its set.
function device(slot, cls, set, k) {
  const f = document.createElement('figure'); f.className = 'device ' + cls;
  const s = document.createElement(slot.src ? 'button' : 'div'); s.className = 'screen';
  if (slot.src) {
    s.type = 'button'; s.setAttribute('aria-label', `Enlarge the ${slot.title} screen`);
    const i = document.createElement('img'); i.src = slot.src; i.alt = `${slot.title} screen`; s.append(i);
    s.addEventListener('click', () => {
      shots = set.filter(x => x.src).map(x => ({ src: x.src, alt: `${x.title} screen`, title: x.title, detail: cls === 'phone' ? 'Mobile app' : 'Touch panel on the machine' }));
      openShot(shots.findIndex(x => x.src === slot.src));
    });
  }
  else s.append(placeholder(`${slot.file}.jpg`, 'photo', 'Screen coming soon'));
  const c = document.createElement('figcaption'); c.textContent = slot.title;
  f.append(s, c);
  return f;
}
function renderPreviews() {
  LIB.app.forEach((s, k) => $('previewApp').append(device(s, 'phone', LIB.app, k)));
  LIB.panel.forEach((s, k) => $('previewPanel').append(device(s, 'panel', LIB.panel, k)));
  const tabs = document.querySelectorAll('#previewTabs button');
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(x => x.setAttribute('aria-selected', x === b));
    $('previewApp').hidden = b.dataset.tab !== 'app';
    $('previewPanel').hidden = b.dataset.tab !== 'panel';
  }));
}

// --- Photos ---
const CATS = [['all', 'All'], ['machine', 'Whole machine'], ['control', 'Control box'], ['feeding', 'Feeding'], ['trays', 'Trays and water'], ['cad', 'CAD drawings']];
let shots = [], shotAt = 0;
function renderGallery(cat = 'all') {
  const g = $('gallery'); g.textContent = '';
  const items = LIB.photos.filter(p => cat === 'all' || p.group === cat);
  shots = items.filter(p => p.src);
  items.forEach(p => {
    const f = document.createElement(p.src ? 'button' : 'div');
    f.className = 'shot ' + p.shape + (p.group === 'cad' ? ' drawing' : '');
    if (p.src) {
      const i = document.createElement('img'); i.src = p.src; i.alt = p.alt; i.loading = 'lazy'; i.decoding = 'async';
      const c = document.createElement('span'); c.className = 'cap'; c.textContent = p.title;
      f.append(i, c);
      f.setAttribute('aria-label', `Open photo: ${p.title}`);
      f.addEventListener('click', () => { shots = LIB.photos.filter(x => x.src && (cat === 'all' || x.group === cat)); openShot(shots.indexOf(p)); });
    } else f.append(placeholder(`${p.file}.jpg`, 'photo', `${p.title}: photo coming soon`));
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
  const d = $('lightDetail');
  d.textContent = p.detail || (GUIDE ? `Add a "detail" for ${p.file || 'this photo'} in data/media-slots.json` : '');
  d.hidden = !d.textContent;
  $('lightPrev').hidden = $('lightNext').hidden = shots.length < 2;
  if (!$('lightbox').open) $('lightbox').showModal();
}
$('lightPrev').addEventListener('click', () => openShot(shotAt - 1));
$('lightNext').addEventListener('click', () => openShot(shotAt + 1));
$('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });
$('lightbox').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') openShot(shotAt - 1); if (e.key === 'ArrowRight') openShot(shotAt + 1); });

// --- Parts ---
function renderPartsList(onPick) {
  const host = $('partsList');
  GROUPS.forEach(([g, label]) => {
    const wrap = document.createElement('div'); wrap.className = 'pgroup';
    const list = PARTS.filter(p => p.group === g);
    const h = document.createElement('h3'); h.innerHTML = `${label} <span>${list.length} parts</span>`; wrap.append(h);
    const grid = document.createElement('div'); grid.className = 'pgrid'; wrap.append(grid);
    list.forEach(p => {
      const b = document.createElement('button'); b.className = 'prow'; b.dataset.part = p.id;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = p.n;
      const t = document.createElement('span'); t.textContent = p.name;
      const s = document.createElement('small'); s.textContent = p.check ? p.size[0] + ' · Check' : p.size[0]; t.append(s);
      b.append(n, t); b.addEventListener('click', () => onPick(p.id)); grid.append(b);
    });
    host.append(wrap);
  });
}
function showDetail(p) {
  $('dNum').textContent = 'Part ' + p.n;
  $('dGroup').textContent = GROUPS.find(g => g[0] === p.group)[1];
  $('dName').textContent = p.name; $('dText').textContent = p.what;
  const ph = $('dPhoto'); ph.textContent = ''; ph.hidden = false;
  const src = findFile(`media/parts/${p.id}`);
  if (src) { const im = document.createElement('img'); im.src = src; im.alt = p.name; ph.append(im); }
  else ph.append(placeholder(`media/parts/${p.id}.jpg`, 'photo', 'Photo coming soon'));
  const list = $('dList'); list.textContent = '';
  const row = (k, v, cls) => { const t = document.createElement('dt'); t.textContent = k; const d = document.createElement('dd'); d.textContent = v; if (cls) d.className = cls; list.append(t, d); };
  row('Connects to', p.connects);
  row('Size · ' + p.size[0], p.size[1]);
  row('Position · ' + p.pos[0], p.pos[1]);
  if (p.check) row('Check', p.check, 'check');
  const v = LIB.videos.find(x => x.id === p.video && hasMedia(x)), btn = $('dVideo');
  btn.hidden = !v; btn.onclick = v ? () => openVideo(v) : null;
  document.querySelectorAll('.prow').forEach(b => b.setAttribute('aria-current', b.dataset.part === p.id));
}

// --- Results: grams off target ---
const fmt = (x, sign) => (sign && x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1);
function renderTrials() {
  const host = $('trials'); if (!host) return; host.textContent = '';
  (C.trials || []).forEach(t => {
    const off = t.readings.map(r => r - t.target), n = off.length;
    const mean = t.readings.reduce((a, b) => a + b, 0) / n;
    const mae = off.reduce((a, b) => a + Math.abs(b), 0) / n;
    const worst = off.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    const within = lim => off.filter(x => Math.abs(x) <= lim + 1e-9).length;
    const max = Math.max(3, Math.ceil(Math.max(...off.map(Math.abs))));
    const pct = x => ((x + max) / (2 * max) * 100).toFixed(2);
    const art = document.createElement('article'); art.className = 'trial';
    art.innerHTML = `
      <h3></h3>
      <div class="stats">
        <div><b>${mean.toFixed(2)} g</b><span>Average weight</span></div>
        <div><b>${mae.toFixed(2)} g</b><span>Average distance from target</span></div>
        <div><b>${fmt(worst, true)} g</b><span>Largest difference</span></div>
        <div><b>${within(1)} of ${n}</b><span>Within ±1 g</span></div>
        <div><b>${within(2)} of ${n}</b><span>Within ±2 g</span></div>
      </div>
      <div class="tgrid">
        <table class="rtable"><thead><tr><th>Reading</th><th>Weight</th><th>Off target</th></tr></thead><tbody>
          ${t.readings.map((r, i) => `<tr><td>${i + 1}</td><td>${r.toFixed(1)} g</td><td class="${Math.abs(off[i]) <= 1 ? 'ok' : Math.abs(off[i]) <= 2 ? 'near' : 'far'}">${fmt(off[i], true)} g</td></tr>`).join('')}
        </tbody></table>
        <div class="dev" role="img" aria-label="Each reading's difference from the ${t.target} g target on a scale of plus or minus ${max} grams.">
          <div class="band b2" style="left:${pct(-2)}%;right:${(100 - pct(2)).toFixed(2)}%"></div>
          <div class="band b1" style="left:${pct(-1)}%;right:${(100 - pct(1)).toFixed(2)}%"></div>
          <div class="zero" style="left:50%"></div>
          ${off.map((x, i) => `<div class="drow" style="top:${(i + 0.5) / n * 100}%"><span class="dl">${i + 1}</span><i style="left:${pct(Math.min(0, x))}%;width:${(Math.abs(x) / (2 * max) * 100).toFixed(2)}%"></i><b style="left:${pct(x)}%"></b></div>`).join('')}
          <div class="axis"><span>−${max} g</span><span>−2</span><span>−1</span><span>0</span><span>+1</span><span>+2</span><span>+${max} g</span></div>
        </div>
      </div>
      <p class="bnote">Target ${t.target} g. The darker band is ±1 g, the lighter band ±2 g. Readings are in the order our test notes list them.</p>`;
    art.querySelector('h3').textContent = t.label;
    host.append(art);
  });
  const ul = $('cNotes'); ul.textContent = '';
  (C.notes || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.append(li); });
}

// --- Presentation: progress bar, pager, arrow keys ---
function setupPager() {
  const slides = [...document.querySelectorAll('.slide')];
  const label = $('pageLabel'), menu = $('pageMenu');
  let cur = 0;
  slides.forEach((sl, k) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.innerHTML = `<span>${k + 1}</span>`; b.append(sl.dataset.title);
    b.addEventListener('click', () => { closeMenu(); go(sl); });
    li.append(b); menu.append(li);
  });
  const closeMenu = () => { menu.hidden = true; label.setAttribute('aria-expanded', 'false'); };
  label.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; label.setAttribute('aria-expanded', open); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); label.focus(); } });
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#pager')) closeMenu(); });
  const update = () => {
    if (P.on) return;
    const y = innerHeight * 0.4;
    let i = 0;
    slides.forEach((s, k) => { if (s.getBoundingClientRect().top <= y) i = k; });
    // A section whose top sits at the top of the screen is the current one, even if it is short.
    const aligned = slides.findIndex(s => Math.abs(s.getBoundingClientRect().top) <= 4);
    if (aligned >= 0) i = aligned;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) i = slides.length - 1;
    cur = i;
    menu.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', k === i));
    if (heading === null) show(i);
    const h = document.documentElement.scrollHeight - innerHeight;
    $('progressBar').style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  let heading = null;
  const show = i => {
    label.textContent = `${i + 1} / ${slides.length} · ${slides[i].dataset.title}`;
    $('pagePrev').disabled = i === 0; $('pageNext').disabled = i === slides.length - 1;
  };
  // Counts from the section being headed to, so quick presses step exactly once each.
  const jump = d => {
    if (P.on) { P.step(d); return; }
    const from = heading ?? cur, k = Math.max(0, Math.min(slides.length - 1, from + d));
    if (k === from) return;
    heading = k; show(k);
    const clear = () => { if (heading === k) { heading = null; update(); } };
    setTimeout(clear, 900); // safety: never leave the target stuck if a glide is cut short
    go(slides[k], 'start', clear);
  };
  $('pagePrev').addEventListener('click', () => jump(-1));
  $('pageNext').addEventListener('click', () => jump(1));
  addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t.closest && t.closest('input,textarea,select,[contenteditable],[data-slot="team-lanyard-rail"]')) return;
    e.preventDefault(); jump(e.key === 'ArrowRight' ? 1 : -1);
  });
  P.label = (i, page, pages) => {
    label.textContent = `${i + 1} / ${slides.length} · ${slides[i].dataset.title}${pages > 1 ? ` (${page + 1}/${pages})` : ''}`;
    $('pagePrev').disabled = i === 0 && page === 0; $('pageNext').disabled = i === slides.length - 1 && page >= pages - 1;
    menu.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', k === i));
    $('progressBar').style.transform = `scaleX(${slides.length > 1 ? i / (slides.length - 1) : 0})`;
  };
  P.refresh = update;
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

// --- One 3D view that moves into the section being read ---
function setupSlots() {
  const stage = $('stage');
  const slots = [...document.querySelectorAll('.slot')];
  let active = 'title', swapTimer = 0;
  const pick = () => {
    if (P.on) return;
    const mid = innerHeight / 2;
    let best = null, bestD = Infinity;
    slots.forEach(s => {
      const r = s.getBoundingClientRect();
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = s; }
    });
    if (!best || bestD > innerHeight * 0.6) return;
    moveTo(best);
  };
  const moveTo = best => {
    if (!best || best.dataset.slot === active) return;
    const from = active;
    active = best.dataset.slot;
    // Fade out, move into the new section, fade back in while the camera flies to its view.
    const to = best, mode = active;
    if (reduced) { to.append(stage); stage.dataset.mode = mode; if (viewer) viewer.enter(mode, from); return; }
    stage.classList.add('swap');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      to.append(stage);
      stage.dataset.mode = mode;
      if (viewer) viewer.enter(mode, from);
      requestAnimationFrame(() => stage.classList.remove('swap'));
    }, 180);
  };
  P.slotTo = moveTo;
  stage.dataset.mode = active;
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', pick);
  pick();
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
  [LIB, C] = await Promise.all([
    fetch('data/library.json').then(r => r.json()).catch(() => LIB),
    fetch('data/content.json').then(r => r.json()).catch(() => ({})),
  ]);
  LIB.files = LIB.files || [];
  renderIntro(); renderSteps(); renderFunctions(); renderSchematic(); renderDiagram(); renderPreviews();
  renderGalleryChips(); renderGallery(); renderTrials(); mountTeam();
  fillText($('cConclusion'), C.conclusion, 'The conclusion');
  fillText($('cRecommend'), C.recommendations, 'The recommendations');
  let pick = () => {};
  renderPartsList(id => { go($('device')); pick(id); });
  setupPager(); setupSlots(); setupReveal(); setupCounters(); setupTitleMotion(); setupPresent();
  if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  setupLinks();

  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) { webglFallback('This browser cannot show the 3D model.'); return; }

  const [THREE, viewerMod] = await Promise.all([import('three'), import('./viewer.js')]);
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
    viewer = viewerMod.init({ cad, onSelect: showDetail, onFail: webglFallback });
    pick = viewer.pick;
    viewer.enter($('stage').dataset.mode, null);
    $('loader').hidden = true;
    requestAnimationFrame(() => $('stage').classList.add('ready'));
  } catch (e) {
    console.warn(e);
    webglFallback('The 3D model could not be loaded.');
  }
}
start();
