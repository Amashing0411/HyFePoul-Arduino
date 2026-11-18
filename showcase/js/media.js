// Media for the deck: a custom video player and a full-screen viewer for photos and videos.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect fill="currentColor" x="6" y="5" width="4.2" height="14" rx="1.2"/><rect fill="currentColor" x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.6h4.6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4.2h4.2"/><text x="12.3" y="15.6" font-size="7.4" font-weight="700" text-anchor="middle" fill="currentColor" font-family="system-ui">5</text></svg>',
  fwd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"/><text x="11.7" y="15.6" font-size="7.4" font-weight="700" text-anchor="middle" fill="currentColor" font-family="system-ui">5</text></svg>',
  vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9.5v5a1 1 0 0 0 1 1h3l4.3 3.6a.8.8 0 0 0 1.3-.6V5.5a.8.8 0 0 0-1.3-.6L8 8.5H5a1 1 0 0 0-1 1z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16.5 9a4.2 4.2 0 0 1 0 6M19 6.5a7.8 7.8 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9.5v5a1 1 0 0 0 1 1h3l4.3 3.6a.8.8 0 0 0 1.3-.6V5.5a.8.8 0 0 0-1.3-.6L8 8.5H5a1 1 0 0 0-1 1z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m16.5 9.5 5 5m0-5-5 5"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  unfull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M13.5 9H17v3.5M10.5 15H7v-3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="m6 6 12 12M18 6 6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m14.5 5.5-6.5 6.5 6.5 6.5"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m15.5 15.5 4.5 4.5M10.5 7.8v5.4M7.8 10.5h5.4"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m15.5 15.5 4.5 4.5M7.8 10.5h5.4"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 10v4M16 10v4"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="m15.5 15.5 4.5 4.5"/></svg>',
};

const fmt = t => {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- Video player
const players = new Set();
export function pauseAll(except) { players.forEach(p => { if (p !== except) p.pause(); }); }
export function pauseWithin(root) { players.forEach(p => { if (root.contains(p.el)) p.pause(); }); }

export function createPlayer(item, opts = {}) {
  const el = document.createElement('div');
  el.className = 'vp is-paused is-fresh';
  el.tabIndex = 0;
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', `Video: ${item.title || 'recording'}`);
  el.innerHTML = `
    <video playsinline preload="${opts.autoplay ? 'auto' : 'metadata'}" ${item.poster ? `poster="${esc(item.poster)}"` : ''} src="${esc(item.src)}"></video>
    <div class="vp-shade"></div>
    <div class="vp-title">${item.kicker ? `<span>${esc(item.kicker)}</span>` : ''}<b>${esc(item.title || '')}</b></div>
    <button class="vp-big" type="button" aria-label="Play">${ICON.play}</button>
    <div class="vp-spin" aria-hidden="true"></div>
    <div class="vp-flash" aria-hidden="true"></div>
    <div class="vp-bar">
      <div class="vp-track" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="vp-rail"><i class="vp-buf"></i><i class="vp-prog"></i></div>
        <i class="vp-knob"></i><span class="vp-tip">0:00</span>
      </div>
      <div class="vp-row">
        <button class="vp-btn vp-play" type="button" aria-label="Play">${ICON.play}</button>
        <button class="vp-btn vp-back" type="button" aria-label="Back 5 seconds">${ICON.back}</button>
        <button class="vp-btn vp-fwd" type="button" aria-label="Forward 5 seconds">${ICON.fwd}</button>
        <span class="vp-time"><b class="vp-cur">0:00</b> / <span class="vp-dur">0:00</span></span>
        <span class="vp-gap"></span>
        <button class="vp-btn vp-rate" type="button" aria-label="Playback speed">1×</button>
        <span class="vp-vol"><button class="vp-btn vp-mute" type="button" aria-label="Mute">${ICON.vol}</button><input class="vp-volr" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></span>
        ${opts.onExpand ? `<button class="vp-btn vp-exp" type="button" aria-label="Open in viewer">${ICON.expand}</button>` : ''}
        <button class="vp-btn vp-fs" type="button" aria-label="Full screen">${ICON.full}</button>
      </div>
    </div>`;
  const v = el.querySelector('video'), q = s => el.querySelector(s);
  const track = q('.vp-track'), prog = q('.vp-prog'), buf = q('.vp-buf'), knob = q('.vp-knob'), tip = q('.vp-tip');
  const RATES = [1, 1.25, 1.5, 2, 0.5];
  let raf = 0, hideT = 0, scrubbing = false, wasPlaying = false;

  const api = {
    el, video: v,
    play() { pauseAll(api); const p = v.play(); if (p) p.catch(() => {}); },
    pause() { v.pause(); },
    toggle() { v.paused || v.ended ? api.play() : api.pause(); },
    destroy() { api.pause(); cancelAnimationFrame(raf); players.delete(api); },
  };
  players.add(api);

  const paint = () => {
    const d = v.duration || 0, f = d ? v.currentTime / d : 0;
    prog.style.transform = `scaleX(${f})`;
    knob.style.left = `${f * 100}%`;
    q('.vp-cur').textContent = fmt(v.currentTime);
    track.setAttribute('aria-valuenow', Math.round(f * 100));
    if (v.buffered.length && d) buf.style.transform = `scaleX(${v.buffered.end(v.buffered.length - 1) / d})`;
  };
  const loop = () => { paint(); if (!v.paused) raf = requestAnimationFrame(loop); };
  const state = () => {
    const playing = !v.paused && !v.ended;
    el.classList.toggle('is-paused', !playing);
    el.classList.toggle('is-ended', v.ended);
    const ic = v.ended ? ICON.replay : playing ? ICON.pause : ICON.play;
    q('.vp-play').innerHTML = ic; q('.vp-play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    q('.vp-big').innerHTML = v.ended ? ICON.replay : ICON.play;
    q('.vp-big').setAttribute('aria-label', v.ended ? 'Replay' : 'Play');
    if (playing) { el.classList.remove('is-fresh'); cancelAnimationFrame(raf); loop(); wake(); } else { el.classList.add('show-ui'); paint(); }
  };
  const wake = () => {
    el.classList.add('show-ui'); clearTimeout(hideT);
    if (!v.paused) hideT = setTimeout(() => { if (!scrubbing && !el.matches(':focus-within .vp-bar *')) el.classList.remove('show-ui'); }, 2400);
  };
  const flash = icon => {
    if (reduced) return;
    const f = q('.vp-flash'); f.innerHTML = icon; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  };
  const seekBy = s => { v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + s)); paint(); wake(); };

  ['play', 'pause', 'ended'].forEach(e => v.addEventListener(e, state));
  v.addEventListener('waiting', () => el.classList.add('is-wait'));
  ['playing', 'canplay', 'seeked'].forEach(e => v.addEventListener(e, () => el.classList.remove('is-wait')));
  v.addEventListener('loadedmetadata', () => { q('.vp-dur').textContent = fmt(v.duration); paint(); });
  v.addEventListener('progress', paint);
  v.addEventListener('timeupdate', () => { if (!scrubbing) paint(); });
  v.addEventListener('volumechange', () => {
    q('.vp-mute').innerHTML = v.muted || v.volume === 0 ? ICON.mute : ICON.vol;
    q('.vp-volr').value = v.muted ? 0 : v.volume;
  });

  q('.vp-big').addEventListener('click', e => { e.stopPropagation(); api.play(); });
  q('.vp-play').addEventListener('click', () => api.toggle());
  q('.vp-back').addEventListener('click', () => seekBy(-5));
  q('.vp-fwd').addEventListener('click', () => seekBy(5));
  q('.vp-rate').addEventListener('click', e => {
    const n = RATES[(RATES.indexOf(v.playbackRate) + 1) % RATES.length];
    v.playbackRate = n; e.currentTarget.textContent = `${n}×`; wake();
  });
  q('.vp-mute').addEventListener('click', () => { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 1; });
  q('.vp-volr').addEventListener('input', e => { v.volume = +e.target.value; v.muted = v.volume === 0; });
  if (opts.onExpand) q('.vp-exp').addEventListener('click', () => { const t = v.currentTime; api.pause(); opts.onExpand(t); });

  const isFs = () => document.fullscreenElement === el || document.webkitFullscreenElement === el;
  const toggleFs = () => {
    if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  };
  q('.vp-fs').addEventListener('click', toggleFs);
  document.addEventListener('fullscreenchange', () => { q('.vp-fs').innerHTML = isFs() ? ICON.unfull : ICON.full; el.classList.toggle('is-fs', isFs()); });

  // Click the picture to play or pause; double-click for full screen.
  let clickT = 0;
  v.addEventListener('click', () => {
    clearTimeout(clickT);
    clickT = setTimeout(() => { const was = v.paused; api.toggle(); flash(was ? ICON.play : ICON.pause); }, 200);
  });
  v.addEventListener('dblclick', () => { clearTimeout(clickT); toggleFs(); });

  // Scrubbing: drag along the bar; a bubble shows the time under the pointer.
  const at = e => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  track.addEventListener('pointermove', e => {
    const f = at(e); tip.textContent = fmt(f * (v.duration || 0)); tip.style.left = `${f * 100}%`;
    if (scrubbing) { v.currentTime = f * (v.duration || 0); paint(); }
  });
  track.addEventListener('pointerdown', e => {
    e.preventDefault(); scrubbing = true; wasPlaying = !v.paused; v.pause();
    track.setPointerCapture(e.pointerId); el.classList.add('is-scrub');
    v.currentTime = at(e) * (v.duration || 0); paint();
  });
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; el.classList.remove('is-scrub'); if (wasPlaying) api.play(); };
  track.addEventListener('pointerup', endScrub);
  track.addEventListener('pointercancel', endScrub);
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { seekBy(-5); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowRight') { seekBy(5); e.preventDefault(); e.stopPropagation(); }
  });

  el.addEventListener('pointermove', wake);
  el.addEventListener('pointerleave', () => { if (!v.paused) { clearTimeout(hideT); hideT = setTimeout(() => el.classList.remove('show-ui'), 600); } });
  el.addEventListener('keydown', e => {
    if (e.target.matches('input')) return;
    const k = e.key.toLowerCase();
    const map = { ' ': () => { api.toggle(); flash(v.paused ? ICON.pause : ICON.play); }, k: () => api.toggle(), j: () => seekBy(-10), l: () => seekBy(10), arrowleft: () => seekBy(-5), arrowright: () => seekBy(5), f: toggleFs, m: () => { v.muted = !v.muted; } };
    if (map[k] && !(e.target.matches('button') && (k === ' ' || k === 'enter'))) { map[k](); e.preventDefault(); e.stopPropagation(); }
  });

  if (opts.start) v.addEventListener('loadedmetadata', () => { v.currentTime = opts.start; }, { once: true });
  if (opts.autoplay) requestAnimationFrame(() => api.play());
  state();
  return api;
}

// ---------------------------------------------------------------- Viewer (lightbox)
let LB = null;
function buildViewer() {
  const el = document.createElement('div');
  el.className = 'lb'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Media viewer');
  el.innerHTML = `
    <div class="lb-back"></div>
    <div class="lb-top">
      <span class="lb-count"></span>
      <span class="lb-gap"></span>
      <div class="lb-zoom">
        <button class="lb-btn lb-out" type="button" aria-label="Zoom out">${ICON.minus}</button>
        <span class="lb-pct">100%</span>
        <button class="lb-btn lb-in" type="button" aria-label="Zoom in">${ICON.plus}</button>
        <button class="lb-btn lb-fit" type="button" aria-label="Fit to screen">${ICON.fit}</button>
      </div>
      <button class="lb-btn lb-fs" type="button" aria-label="Full screen">${ICON.full}</button>
      <button class="lb-btn lb-x" type="button" aria-label="Close">${ICON.close}</button>
    </div>
    <div class="lb-stage"><div class="lb-item"></div></div>
    <button class="lb-nav lb-prev" type="button" aria-label="Previous">${ICON.left}</button>
    <button class="lb-nav lb-next" type="button" aria-label="Next">${ICON.right}</button>
    <div class="lb-foot">
      <div class="lb-cap"><b></b><p></p></div>
      <div class="lb-strip" role="listbox" aria-label="All items"></div>
    </div>`;
  document.body.append(el);
  const q = s => el.querySelector(s);
  const S = { el, items: [], i: 0, s: 1, x: 0, y: 0, player: null, img: null, opener: null };
  const stage = q('.lb-stage'), host = q('.lb-item');

  const apply = (anim) => {
    if (!S.img) return;
    S.img.style.transition = anim && !reduced ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    S.img.style.transform = `translate(${S.x}px, ${S.y}px) scale(${S.s})`;
    q('.lb-pct').textContent = `${Math.round(S.s * 100)}%`;
    el.classList.toggle('is-zoomed', S.s > 1.01);
  };
  const clamp = () => {
    if (!S.img) return;
    const r = stage.getBoundingClientRect(), w = S.img.offsetWidth * S.s, h = S.img.offsetHeight * S.s;
    const mx = Math.max(0, (w - r.width) / 2 + 40), my = Math.max(0, (h - r.height) / 2 + 40);
    S.x = Math.max(-mx, Math.min(mx, S.x)); S.y = Math.max(-my, Math.min(my, S.y));
  };
  const zoomTo = (ns, cx, cy, anim) => {
    ns = Math.max(1, Math.min(6, ns));
    const r = stage.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2), py = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    S.x = px - (px - S.x) * ns / S.s; S.y = py - (py - S.y) * ns / S.s; S.s = ns;
    if (ns === 1) { S.x = 0; S.y = 0; }
    clamp(); apply(anim);
  };
  S.reset = () => { S.s = 1; S.x = 0; S.y = 0; apply(true); };

  const show = (i, dir = 0) => {
    const n = S.items.length; S.i = (i + n) % n;
    const it = S.items[S.i];
    if (S.player) { S.player.destroy(); S.player = null; }
    host.textContent = ''; S.img = null; S.s = 1; S.x = 0; S.y = 0;
    host.className = 'lb-item' + (dir && !reduced ? (dir > 0 ? ' in-r' : ' in-l') : ' in');
    if (it.type === 'video') {
      S.player = createPlayer(it, { autoplay: true, start: it.start });
      host.append(S.player.el);
      el.classList.add('is-video');
    } else {
      el.classList.remove('is-video');
      const img = document.createElement('img');
      img.src = it.src; img.alt = it.alt || it.title || ''; img.draggable = false;
      img.decoding = 'async';
      host.append(img); S.img = img; apply(false);
    }
    q('.lb-count').textContent = n > 1 ? `${S.i + 1} / ${n}` : '';
    q('.lb-cap b').textContent = it.title || '';
    q('.lb-cap p').textContent = it.detail || '';
    q('.lb-cap').hidden = !(it.title || it.detail);
    el.classList.toggle('is-single', n < 2);
    [...q('.lb-strip').children].forEach((b, k) => { b.setAttribute('aria-selected', k === S.i); if (k === S.i) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' }); });
    // Warm the neighbours so stepping through feels instant.
    [S.i + 1, S.i - 1].forEach(k => { const nb = S.items[(k + n) % n]; if (nb && nb.type !== 'video') { const p = new Image(); p.src = nb.src; } });
  };
  S.show = show;

  q('.lb-prev').addEventListener('click', () => show(S.i - 1, -1));
  q('.lb-next').addEventListener('click', () => show(S.i + 1, 1));
  q('.lb-x').addEventListener('click', () => closeViewer());
  q('.lb-back').addEventListener('click', () => closeViewer());
  q('.lb-in').addEventListener('click', () => zoomTo(S.s * 1.5, null, null, true));
  q('.lb-out').addEventListener('click', () => zoomTo(S.s / 1.5, null, null, true));
  q('.lb-fit').addEventListener('click', () => S.reset());
  q('.lb-fs').addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.().catch(() => {}); });
  stage.addEventListener('click', e => { if (e.target === stage && S.s === 1) closeViewer(); });

  stage.addEventListener('wheel', e => {
    if (!S.img) return; e.preventDefault();
    zoomTo(S.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX, e.clientY, false);
  }, { passive: false });
  stage.addEventListener('dblclick', e => { if (!S.img) return; S.s > 1.01 ? S.reset() : zoomTo(2.5, e.clientX, e.clientY, true); });

  // Pointers: one finger pans (or swipes to the next item at 100%), two fingers pinch.
  const pts = new Map(); let g = null;
  stage.addEventListener('pointerdown', e => {
    if (!S.img) return;
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = [...pts.values()];
    g = a.length === 2
      ? { pinch: true, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: S.s }
      : { sx: e.clientX, sy: e.clientY, x: S.x, y: S.y, moved: false };
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = [...pts.values()];
    if (g.pinch && a.length === 2) {
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      zoomTo(g.s * d / g.d, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2, false);
    } else if (!g.pinch) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      if (S.s > 1.01) { S.x = g.x + dx; S.y = g.y + dy; clamp(); apply(false); }
      else { S.img.style.transition = 'none'; S.img.style.transform = `translate(${dx}px, 0)`; S.img.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 600)); }
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (g && !g.pinch && S.s <= 1.01 && S.img) {
      const dx = e.clientX - g.sx;
      S.img.style.opacity = '';
      if (Math.abs(dx) > 70 && S.items.length > 1) show(S.i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      else apply(true);
    }
    g = pts.size ? { sx: [...pts.values()][0].x, sy: [...pts.values()][0].y, x: S.x, y: S.y } : null;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  el.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'Escape') { if (document.fullscreenElement) return; closeViewer(); }
    else if (k === 'ArrowRight' && !e.target.closest('.vp')) show(S.i + 1, 1);
    else if (k === 'ArrowLeft' && !e.target.closest('.vp')) show(S.i - 1, -1);
    else if ((k === '+' || k === '=') && S.img) zoomTo(S.s * 1.5, null, null, true);
    else if (k === '-' && S.img) zoomTo(S.s / 1.5, null, null, true);
    else if (k === '0' && S.img) S.reset();
    else if (k === 'Tab') { /* keep focus inside */
      const f = [...el.querySelectorAll('button:not([hidden]), [tabindex="0"], input')].filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
      return;
    } else return;
    e.preventDefault(); e.stopPropagation();
  });
  addEventListener('resize', () => { if (!el.hidden) { clamp(); apply(false); } });
  return S;
}

export function openViewer(items, start = 0) {
  if (!items.length) return;
  LB = LB || buildViewer();
  pauseAll();
  LB.items = items; LB.opener = document.activeElement;
  const strip = LB.el.querySelector('.lb-strip');
  strip.innerHTML = items.map((it, k) => `<button type="button" role="option" aria-label="${esc(it.title || `Item ${k + 1}`)}"><img src="${esc(it.type === 'video' ? it.poster || '' : it.src)}" alt="" loading="lazy">${it.type === 'video' ? `<i>${ICON.play}</i>` : ''}</button>`).join('');
  [...strip.children].forEach((b, k) => b.addEventListener('click', () => LB.show(k, k > LB.i ? 1 : -1)));
  LB.el.hidden = false;
  document.documentElement.classList.add('lb-open');
  requestAnimationFrame(() => LB.el.classList.add('open'));
  setTimeout(() => LB.el.classList.add('open'), 60);
  LB.show(start);
  LB.el.querySelector('.lb-x').focus({ preventScroll: true });
}

export function closeViewer() {
  if (!LB || LB.el.hidden) return;
  if (LB.player) { LB.player.destroy(); LB.player = null; }
  LB.el.classList.remove('open');
  document.documentElement.classList.remove('lb-open');
  const done = () => { LB.el.hidden = true; LB.el.querySelector('.lb-item').textContent = ''; };
  reduced ? done() : setTimeout(done, 220);
  if (LB.opener && LB.opener.focus) LB.opener.focus({ preventScroll: true });
}
export const viewerOpen = () => !!(LB && !LB.el.hidden);
