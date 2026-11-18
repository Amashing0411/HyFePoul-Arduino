// HyFePoul presentation: slides come from data/deck.json; photos and videos from data/library.json.
import { createPlayer, openViewer, viewerOpen, pauseWithin, pauseAll, ICON } from './media.js?v=3';
import { GROUPS } from './parts.js?v=3';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GUIDE = new URLSearchParams(location.search).has('guide');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp'];

let D = { chapters: [], slides: [] }, LIB = { files: [], videos: [], app: [], panel: [], team: [] };
let cur = -1, curEl = null, viewer = null, viewerLoad = null, teamMounted = false, lastPart = null;
const S = () => D.slides;
const chap = id => D.chapters.find(c => c.id === id) || {};

// ---------------------------------------------------------------- helpers
const exists = p => !p || !p.startsWith('media/') || LIB.files.includes(p);
const findBase = base => { for (const e of IMG_EXT) if (LIB.files.includes(`${base}.${e}`)) return `${base}.${e}`; return null; };
const video = id => {
  const v = LIB.videos.find(x => x.id === id);
  return v && v.src ? { type: 'video', id, src: v.src, poster: v.poster, title: v.title, detail: v.text } : null;
};
const todo = (label, kind = 'text', file = '') => `
  <div class="todo todo-${kind}" data-a>
    <span class="todo-ic">${{ image: ICON.expand, chart: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 19V11M12 19V5M19 19v-6"/></svg>', table: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" d="M3.5 10h17M10 10v9"/></svg>', video: ICON.play }[kind] || '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 7h14M5 12h14M5 17h9"/></svg>'}</span>
    <b>${esc(label)}</b>
    <span class="todo-hint">${GUIDE && file ? esc(file) : 'To be added'}</span>
  </div>`;

// A photo: the whole picture over a soft, blurred copy of itself, so nothing is cropped.
const pic = (src, o = {}) => {
  if (!src || !exists(src)) return todo(o.label || 'Photo', 'image', src);
  const fit = o.fit || 'contain';
  return `<figure class="ph ph-${fit}${o.paper ? ' ph-paper' : ''}${o.cls ? ' ' + o.cls : ''}" data-a>
    <button type="button" class="ph-btn" data-zoom="${esc(src)}" data-title="${esc(o.title || '')}" data-detail="${esc(o.detail || '')}" aria-label="Open ${esc(o.title || 'photo')} full screen">
      ${fit === 'contain' && !o.paper ? `<img class="ph-bg" src="${esc(src)}" alt="" aria-hidden="true" loading="lazy">` : ''}
      <img class="ph-img" src="${esc(src)}" alt="${esc(o.title || '')}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async">
      <span class="ph-zoom" aria-hidden="true">${ICON.zoom}</span>
    </button>
    ${o.caption ? `<figcaption>${esc(o.caption)}</figcaption>` : ''}
  </figure>`;
};
const vslot = (id, thumb, label) => {
  const v = video(id);
  if (!v) return todo(label || 'Video', 'video', `media/videos/${id}.mp4`);
  if (thumb) return `<div class="vthumb">${v.poster ? `<img src="${esc(v.poster)}" alt="" loading="lazy">` : ''}<i>${ICON.play}</i></div>`;
  return `<div class="vslot" data-video="${esc(id)}" data-a></div>`;
};
const head = (s, cls = '') => `<header class="sh ${cls}">
  ${s.title ? `<h2 class="h" data-a>${esc(s.title)}</h2>` : ''}
  ${s.text ? `<p class="lead" data-a>${esc(s.text)}</p>` : ''}
</header>`;

// ---------------------------------------------------------------- slide types
const R = {
  cover: (s, t) => `
    <div class="cover-text">
      <h1 class="cover-title" data-a>${esc(s.title)}</h1>
      <p class="cover-sub" data-a>${esc(s.text)}</p>
      <ul class="cover-meta" data-a>${[...(s.meta || []), s.kicker].filter(Boolean).map(m => `<li>${esc(m)}</li>`).join('')}</ul>
    </div>
    <div class="cover-model">${t ? `<img src="media/deck/cad-render-colour.jpg" alt="">` : '<div class="model-host" data-mode="title"></div>'}</div>`,

  team: (s, t) => `${head(s, 'center')}
    ${t ? `<div class="team-thumb">${LIB.team.map(m => `<img src="${esc(m.image)}" alt="">`).join('')}</div>` : '<div class="team-host"></div>'}`,

  agenda: s => `${head(s)}
    <ol class="agenda">${D.chapters.filter(c => c.num).map(c => {
      const first = S().findIndex(x => x.chapter === c.id);
      const n = S().filter(x => x.chapter === c.id).length;
      return `<li data-a><button type="button" data-go="${first}"><span class="ag-n">${esc(c.num)}</span><span class="ag-t">${esc(c.title)}</span><span class="ag-c">${n} slides</span></button></li>`;
    }).join('')}</ol>`,

  chapter: (s, t) => {
    const c = chap(s.chapter);
    return `${s.img && exists(s.img) ? `<img class="ch-bg" src="${esc(s.img)}" alt="" loading="lazy"${s.pos ? ` style="object-position:${esc(s.pos)}"` : ''}>` : ''}
      <div class="ch-text">
        <p class="ch-num" data-a>${esc(c.label)}</p>
        <h2 class="ch-title" data-a>${esc(c.title)}</h2>
      </div>`;
  },

  statement: s => `<div class="st-text${s.img ? '' : ' wide'}">
      <p class="st-big" data-a>${esc(s.text)}</p>
      ${s.sub ? `<p class="st-sub" data-a>${esc(s.sub)}</p>` : ''}
    </div>${s.img ? `<div class="st-img">${pic(s.img, { fit: 'cover', title: s.kicker })}</div>` : ''}`,

  points: s => `${head(s)}
    <dl class="pts pts-${(s.points || []).length}">${(s.points || []).map(p => `
      <div data-a><dt>${esc(p.t)}</dt><dd>${esc(p.d)}</dd></div>`).join('')}</dl>`,

  terms: s => `${head(s)}
    <dl class="terms">${s.items.map(p => `<div data-a><dt>${esc(p.t)}</dt><dd>${esc(p.d)}</dd></div>`).join('')}</dl>`,

  objectives: (s, t) => `${head(s)}
    <ol class="objs">${s.items.map(o => {
      const v = video(o.video);
      return `<li class="obj" data-a>
        <span class="obj-l">${esc(o.label)}.</span>
        <div class="obj-w"><b>${esc(o.t)}</b><p>${esc(o.d)}</p></div>
        ${v ? `<button type="button" class="obj-v" data-play="${esc(o.video)}" aria-label="Play the ${esc(o.t)} recording">${v.poster ? `<img src="${esc(v.poster)}" alt="" loading="lazy">` : ''}<i>${ICON.play}</i></button>` : '<span></span>'}
      </li>`;
    }).join('')}</ol>`,

  media: s => s.layout === 'full'
    ? `<div class="full-img">${pic(s.img, { fit: s.fit || 'cover', title: s.title, eager: true })}</div>
       <div class="full-cap"><h2 class="h" data-a>${esc(s.title)}</h2></div>`
    : `<div class="split">${head(s)}<div class="split-img">${pic(s.img, { fit: s.fit, paper: s.paper, title: s.title })}${s.kicker ? `<p class="fig-cap">${esc(s.kicker)}. ${esc(s.title)}</p>` : ''}</div></div>`,

  gallery: s => {
    const imgs = s.images || [];
    return `${head(s, 'row')}
      <div class="gal gal-${Math.min(imgs.length, 7)}${s.fit === 'contain' ? ' gal-contain' : ''}">${imgs.map((g, k) => exists(g.src)
        ? `<button type="button" class="gal-i" data-zoom="${esc(g.src)}" data-title="${esc(g.title || '')}" data-detail="${esc(g.detail || '')}" data-a aria-label="Open ${esc(g.title || 'photo')}">
             <img src="${esc(g.src)}" alt="${esc(g.title || '')}" loading="lazy" decoding="async"><span>${esc(g.title || '')}</span></button>`
        : todo(g.title || 'Photo', 'image', g.src)).join('')}</div>`;
  },

  flow: s => `${head(s)}
    <ol class="flow flow-${s.nodes.length}">${s.nodes.map(n => `<li data-a><b>${esc(n.t)}</b><p>${esc(n.d)}</p></li>`).join('')}</ol>`,

  chips: s => `${head(s)}<ul class="chips">${s.items.map(c => `<li data-a>${esc(c)}</li>`).join('')}</ul>`,

  table: s => `${head(s)}${s.kicker ? `<p class="tcap">${esc(s.kicker)}</p>` : ''}
    <div class="tbl-wrap" data-a><table class="tbl${s.rows.length > 6 ? ' tbl-many' : ''}">
      <thead><tr>${s.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${s.rows.map(r => `<tr>${r.map(c => `<td${c === '' ? ' class="empty"' : ''}>${c === '' ? '<i></i>' : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    ${s.foot ? `<p class="foot-note" data-a>${esc(s.foot)}</p>` : ''}
    ${s.todo ? `<p class="todo-line" data-a>${esc(GUIDE ? s.todo : 'Values to be added')}</p>` : ''}`,


  // Chapter IV, laid out like the manuscript: the caption above the table, one row per condition,
  // and a frame for the photo of each result (media/results/table-4-x-rN.jpg).
  doctable: (s, t) => {
    const photo = !!s.photos;
    const cell = c => `<td${c === '' ? ' class="empty"' : ''}>${c === '' ? '<i></i>' : esc(c)}</td>`;
    const shot = n => {
      const f = findBase(`${s.photos}-r${n}`);
      return f ? `<td class="shot"><button type="button" data-zoom="${esc(f)}" data-title="Table ${esc(s.table)}, row ${n}"><img src="${esc(f)}" alt="Result photo, row ${n}" loading="lazy"></button></td>`
        : `<td class="shot"><span class="slot">${GUIDE ? esc(`${s.photos}-r${n}.jpg`) : 'Photo'}</span></td>`;
    };
    const bars = s.bars ? `<div class="hbars">${s.bars.map(([l, v]) => `<div><span>${esc(l)}</span><i style="--w:${(v / Math.max(...s.bars.map(b => b[1])) * 100).toFixed(1)}%"></i><b>${v} ${esc(s.unit || '')}</b></div>`).join('')}</div>` : '';
    return `<header class="sh"><h2 class="h">${esc(s.title)}</h2></header>
      <p class="tcap" data-a><b>Table ${esc(s.table)}.</b> ${esc(s.caption)}</p>
      <div class="dt-wrap${bars ? ' with-bars' : ''}"><div class="tbl-wrap doc" data-a><table class="tbl doc-tbl${photo ? ' has-shot' : ''}${s.rows.length > 3 ? ' tight' : ''} cols-${s.columns.length}">
        <thead><tr>${s.columns.map(c => `<th>${esc(c)}</th>`).join('')}${photo ? '<th>Actual image result</th>' : ''}</tr></thead>
        <tbody>${s.rows.map((r, k) => `<tr>${r.map(cell).join('')}${photo ? shot((s.start || 0) + k + 1) : ''}</tr>`).join('')}</tbody>
      </table></div>${bars}</div>
      ${s.note ? `<p class="foot-note">${esc(s.note)}</p>` : ''}`;
  },

  // Weight tables: difference and accuracy are worked out from the target and the measured grams.
  grams: (s, t) => {
    const res = s.mode === 'residue';
    const rows = s.rows.map((r, k) => {
      const ok = r.target != null && r.actual != null;
      const diff = ok ? Math.abs(r.actual - r.target) : null;
      return { ...r, n: k + 1, diff, acc: ok ? 100 - diff / r.target * 100 : null };
    });
    const have = rows.filter(r => r.acc != null);
    const avg = f => have.length ? have.reduce((a, r) => a + r[f], 0) / have.length : null;
    const g = (v, d = 2) => v == null || v === '' ? '' : (+v).toFixed(d);
    const cols = res ? ['Tray', 'Target (g)', 'Remaining (g)', 'Added (g)', 'Final (g)', 'Difference (g)', 'Accuracy'] : ['Tray', 'Target (g)', 'Actual (g)', 'Difference (g)', 'Accuracy'];
    const cells = r => res ? [r.tray, g(r.target, 0), g(r.remaining, 1), g(r.added, 1), g(r.actual, 1), g(r.diff), r.acc == null ? '' : g(r.acc) + '%']
      : [r.tray, g(r.target, 0), g(r.actual, 1), g(r.diff), r.acc == null ? '' : g(r.acc) + '%'];
    const shot = n => { const f = findBase(`${s.photos}-r${n}`); return f ? `<td class="shot"><button type="button" data-zoom="${esc(f)}" data-title="Table ${esc(s.table)}, tray ${n}"><img src="${esc(f)}" alt="Tray ${n} result photo" loading="lazy"></button></td>` : `<td class="shot"><span class="slot">${GUIDE ? esc(`${s.photos}-r${n}.jpg`) : 'Photo'}</span></td>`; };
    const td = c => `<td${c === '' ? ' class="empty"' : ''}>${c === '' ? '<i></i>' : esc(c)}</td>`;
    const avgRow = res ? ['Average', g(avg('target'), 0), '', '', g(avg('actual')), g(avg('diff')), have.length ? g(avg('acc')) + '%' : '']
      : ['Average', g(avg('target'), 0), g(avg('actual')), g(avg('diff')), have.length ? g(avg('acc')) + '%' : ''];
    const target = rows.find(r => r.target != null)?.target;
    const chart = have.length ? (() => {
      const max = Math.max(...have.map(r => r.actual)) * 1.12, y = v => v / max * 100;
      return `<div class="bars" role="img" aria-label="${esc(have.map(r => `${r.tray} ${r.actual} g`).join(', '))}, target ${target} g">
        <div class="bars-target" style="bottom:${y(target)}%"><span>Target ${target} g</span></div>
        ${have.map((r, k) => `<div class="bc" style="--h:${y(r.actual)}%;--d:${k * 70}ms"><span class="bar-v">${r.actual.toFixed(1)}</span><i></i><span class="bar-l">${esc(r.tray)}</span><span class="bar-a">${g(r.acc)}%</span></div>`).join('')}
      </div>`;
    })() : '';
    return `<header class="sh"><h2 class="h">${esc(s.title)}</h2></header>
      <p class="tcap" data-a><b>Table ${esc(s.table)}.</b> ${esc(s.caption)}${have.length ? ` <span class="tcap-sum">Average accuracy ${g(avg('acc'))}%</span>` : ''}</p>
      <div class="dt-wrap${chart ? ' with-chart' : ''}"><div class="tbl-wrap doc" data-a><table class="tbl doc-tbl grams-tbl has-shot">
        <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Actual image result</th></tr></thead>
        <tbody>${rows.map(r => `<tr>${cells(r).map(td).join('')}${shot(r.n)}</tr>`).join('')}
          <tr class="avg">${avgRow.map(td).join('')}<td></td></tr></tbody>
      </table></div>${chart}</div>`;
  },

  // The components as labelled photos; an empty frame waits for a close-up.
  parts: s => `${head(s)}
    <ul class="parts">${s.items.map(p => `<li data-a>${exists(p.img)
      ? `<button type="button" data-zoom="${esc(p.img)}" data-title="${esc(p.t)}"><img src="${esc(p.img)}" alt="${esc(p.t)}" loading="lazy"></button>`
      : `<span class="slot">${GUIDE ? esc(p.img) : 'Photo'}</span>`}<b>${esc(p.t)}</b></li>`).join('')}</ul>`,

  // Panel comments, each matched with what the team did about it.
  panel: s => `${head(s)}
    <div class="pnl" data-a>
      <div class="pnl-h"><span>Panelist</span><span>Comment</span><span>What we did</span></div>
      ${s.entries.map(e => {
        const k = e.see ? S().findIndex(x => x.id === e.see) : -1;
        const box = (v, l) => v ? `<p>${esc(v)}</p>` : `<p class="blank">${esc(l)}</p>`;
        return `<div class="pnl-r"><div><b>${esc(e.who)}</b><span>${esc(e.role)}</span></div>${box(e.comment, 'Comment to be added')}<div>${box(e.action, 'Action to be added')}${k >= 0 ? `<button type="button" class="pnl-see" data-go="${k}">See slide ${k + 1}</button>` : ''}</div></div>`;
      }).join('')}
    </div>`,

  pins: s => `${head(s)}
    <div class="pins-grid">${s.rows.map(([p, d]) => `<div data-a><code>${esc(p)}</code><span>${esc(d)}</span></div>`).join('')}</div>`,

  model: (s, t) => `<div class="dev">
      <div class="dev-stage">${t ? `<img src="media/deck/cad-render-colour.jpg" alt="">` : `<div class="model-host" data-mode="${esc(s.mode)}"></div>`}</div>
      <aside class="dev-side">
        ${head(s)}
        <div class="pd" aria-live="polite">
          <p class="pd-meta"><span class="pd-num"></span><span class="pd-group"></span></p>
          <h3 class="pd-name">Choose a part</h3>
          <p class="pd-text">Tap a number on the model to read about that part.</p>
          <dl class="pd-list"></dl>
          <button type="button" class="pd-video" hidden>${ICON.play} Watch it work</button>
        </div>
      </aside>
    </div>`,

  steps: (s, t) => `<div class="cyc">
      <div class="cyc-side">${head(s)}
        <ol class="cyc-steps">${s.steps.map((x, k) => `<li data-a data-step="${k}"><span>${k + 1}</span><div><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div></li>`).join('')}</ol>
        <button type="button" class="btn btn-go cyc-play" data-a>${ICON.play} Play the feed cycle</button>
      </div>
      <div class="cyc-stage">${t ? `<img src="media/deck/cad-render.jpg" alt="">` : `<div class="model-host" data-mode="steps"></div>`}</div>
    </div>`,

  result: (s, t) => `<div class="res">
      <div class="res-side">
        <p class="k" data-a>Objective ${esc(s.label)} · ${esc(s.source)}</p>
        <h2 class="h" data-a>${esc(s.title)}</h2>
        <ul class="checks">${s.checks.map(c => `<li data-a><span class="ok">${'<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7.5"/></svg>'}</span>${esc(c)}</li>`).join('')}</ul>
        <p class="res-tag" data-a><b>${s.checks.length}/${s.checks.length}</b> conditions met</p>
      </div>
      <div class="res-media">${vslot(s.video, t, s.title)}</div>
    </div>`,

  bars: s => {
    const max = Math.max(...s.data.map(d => d.value)) * 1.12, lo = 0;
    const y = v => ((v - lo) / (max - lo)) * 100;
    return `<div class="bars-wrap">
      <div class="bars-side">${head(s)}
        <dl class="sum">${s.summary.map(([v, l]) => `<div data-a><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>
      <div class="bars" data-a role="img" aria-label="${esc(s.data.map(d => `${d.label} ${d.value} ${s.unit}`).join(', '))}, target ${s.target} ${s.unit}">
        <div class="bars-target" style="bottom:${y(s.target)}%"><span>Target ${s.target} ${esc(s.unit)}</span></div>
        ${s.data.map((d, k) => `<div class="bc" style="--h:${y(d.value)}%;--d:${k * 70}ms">
          <span class="bar-v">${d.value.toFixed(1)}</span><i></i><span class="bar-l">${esc(d.label)}</span><span class="bar-a">${esc(d.acc)}</span></div>`).join('')}
      </div></div>`;
  },

  screens: s => {
    const set = LIB[s.kind] || [];
    return `${head(s, 'row')}
      <div class="scr scr-${s.kind}">${set.map(x => x.src
        ? `<button type="button" class="scr-i" data-zoom="${esc(x.src)}" data-title="${esc(x.title)}" data-a><span class="scr-frame"><img src="${esc(x.src)}" alt="${esc(x.title)} screen" loading="lazy"></span><b>${esc(x.title)}</b></button>`
        : todo(x.title, 'image', `${x.file}.png`)).join('')}</div>`;
  },

  videos: (s, t) => `${head(s, 'row')}
    <div class="vids">${s.videos.map(id => `<div class="vids-i">${vslot(id, t)}<b data-a>${esc((video(id) || {}).title || id)}</b></div>`).join('')}</div>`,

  stats: s => `${head(s, 'center')}
    <div class="stats">${s.stats.map(([v, l]) => `<div data-a><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`,

  budget: s => `<div class="bud">
      <div class="bud-side">${head(s)}<p class="bud-total" data-a><span>Total</span><b>${esc(s.total)}</b></p></div>
      <div class="bud-list" data-a>${[s.rows.slice(0, Math.ceil(s.rows.length / 2)), s.rows.slice(Math.ceil(s.rows.length / 2))].map(rows => `<table class="tbl tbl-tight">
        <thead><tr><th>Part</th><th>Qty</th><th>₱</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody>
      </table>`).join('')}</div></div>`,

  timeline: s => `${head(s)}
    <ol class="tl">${s.items.map(x => `<li data-a><span class="tl-d">${esc(x.date || 'To be set')}</span><i></i><b>${esc(x.t)}</b><p>${esc(x.d)}</p></li>`).join('')}</ol>`,

  refs: s => `${head(s)}<ul class="refs">${s.items.map(r => `<li data-a>${esc(r)}</li>`).join('')}</ul>`,

  todo: s => `${head(s)}<div class="todos todos-${s.slots.length}">${s.slots.map(x => todo(x.label, x.kind, x.file)).join('')}</div>`,

  end: (s, t) => `<div class="end-text">
      <img class="end-logo" src="img/app-icon.png" alt="" width="96" height="96" data-a>
      <h2 class="end-title" data-a>${esc(s.title)}</h2>
      <p class="end-sub" data-a>${esc(s.text)}</p>
      <p class="end-meta" data-a>HyFePoul · Group 3 · BSCpE 4D</p>
    </div>`,
};
// One theme, the original site's: blue bands (sky, deep) and light bands (ice, white) that alternate.
const THEME = { cover: 'sky', chapter: 'sky', end: 'sky', model: 'deep', steps: 'deep', videos: 'deep', team: 'ice' };
const themeOf = (s, i) => s.theme || (s.type === 'media' && s.layout === 'full' ? 'deep' : THEME[s.type] || (i % 2 ? 'white' : 'ice'));

function build(s, i, thumb) {
  const el = document.createElement('section');
  const theme = themeOf(s, i);
  el.className = `slide t-${s.type} th-${theme}`;
  el.dataset.i = i;
  const c = chap(s.chapter);
  let body;
  try { body = (R[s.type] || R.todo)(s, thumb); } catch (e) { console.warn(s.id, e); body = head(s) + todo('This slide could not be drawn'); }
  el.innerHTML = body + (['cover', 'chapter', 'end'].includes(s.type) || (s.type === 'media' && s.layout === 'full') ? '' :
    `<footer class="sf"><span>HyFePoul${c.num ? ` · ${esc(c.label)}` : ''}${s._sec ? ` · ${esc(s._sec)}` : ''}</span><span>${i + 1}</span></footer>`);
  if (GUIDE && !thumb) el.insertAdjacentHTML('beforeend', `<span class="guide-id">${esc(s.id)}</span>`);
  if (!thumb) el.querySelectorAll('[data-a]').forEach((n, k) => n.style.setProperty('--k', Math.min(k, 14)));
  if (!thumb && mode === 'slides') el.querySelectorAll('img[loading="lazy"]').forEach(im => { im.loading = 'eager'; });
  return el;
}

// ---------------------------------------------------------------- hydrate (live slide only)
function zoomItems(root) {
  return [...root.querySelectorAll('[data-zoom]')].map(b => ({ type: 'image', src: b.dataset.zoom, title: b.dataset.title, detail: b.dataset.detail }));
}
function hydrate(el, s) {
  el.querySelectorAll('[data-zoom]').forEach((b, k) => b.addEventListener('click', () => openViewer(zoomItems(el), k)));
  el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => (mode === 'web' ? scrollToSlide(+b.dataset.go) : go(+b.dataset.go))));
  el.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => { const v = video(b.dataset.play); if (v) openViewer([v]); }));
  el.querySelectorAll('.vslot').forEach(slot => {
    const v = video(slot.dataset.video);
    const p = createPlayer({ ...v, kicker: s.label ? `Objective ${s.label}` : '' }, { onExpand: t => openViewer([{ ...v, start: t }]) });
    slot.append(p.el);
  });
  const host = el.querySelector('.model-host');
  if (host && mode === 'slides') dockModel(host, s);
  const th = el.querySelector('.team-host');
  if (th) dockTeam(th);
  if (s.type === 'steps') {
    el.querySelector('.cyc-play').addEventListener('click', () => { ensureViewer().then(() => $('play').click()); });
  }
  if (s.type === 'model' && lastPart) showPart(lastPart);
}

// ---------------------------------------------------------------- 3D model (one viewer, moved between slides)
let modelMode = null;
function dockModel(host, s) {
  const stage = $('stage');
  if (stage.parentElement === host) return;
  if (viewer && $('play').textContent === 'Stop') $('play').click();
  host.append(stage);
  const mode = host.dataset.mode;
  stage.dataset.mode = mode === 'title' ? 'title' : mode;
  ensureViewer().then(v => { if (v) { v.enter(mode, modelMode); modelMode = mode; } });
}
function undock() {
  const stage = $('stage'), team = $('teamRoot');
  if (stage && stage.parentElement !== $('dock')) {
    if (viewer && $('play').textContent === 'Stop') $('play').click();
    $('dock').append(stage);
  }
  if (team && team.parentElement !== $('dock')) $('dock').append(team);
}
const CAD_BYTES = 273396;
async function fetchBin(url, onP) {
  const r = await fetch(url); if (!r.ok) throw new Error('Could not load ' + url);
  const reader = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onP(Math.min(1, got / CAD_BYTES)); }
  const out = new Uint8Array(got); let at = 0; parts.forEach(c => { out.set(c, at); at += c.length; });
  return out.buffer;
}
function modelFail(reason) {
  $('loader').hidden = true; $('tools').hidden = true; $('pins').hidden = true;
  const d = document.createElement('div'); d.className = 'nowebgl';
  d.innerHTML = `<p>${esc(reason)}</p><img src="media/deck/cad-render-colour.jpg" alt="CAD render of HyFePoul">`;
  $('stage').append(d);
}
function ensureViewer() {
  if (viewerLoad) return viewerLoad;
  viewerLoad = (async () => {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) { modelFail('This browser cannot show the 3D model.'); return null; }
    try {
      const [THREE, mod] = await Promise.all([import('three'), import('./viewer.js')]);
      const bar = (f, msg) => { $('loadbar').style.width = Math.round(f * 100) + '%'; if (msg) $('loadtext').textContent = msg; };
      bar(0.05);
      const json = await fetch('data/assembly.json').then(r => r.json());
      const bin = await fetchBin('data/assembly.bin', f => bar(0.05 + f * 0.8));
      bar(0.9, 'Assembling the machine…');
      const cad = { lines: await fetch('data/cad-lines.json').then(r => r.json()) };
      json.parts.forEach(p => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, p.pos[0], p.pos[1] * 3), 3));
        g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, p.idx[0], p.idx[1]), 1));
        cad[p.name] = g;
      });
      viewer = mod.init({ cad, onSelect: showPart, onFail: modelFail });
      $('loader').hidden = true;
      requestAnimationFrame(() => $('stage').classList.add('ready'));
      watchCycle();
      return viewer;
    } catch (e) { console.warn(e); modelFail('The 3D model could not be loaded.'); return null; }
  })();
  return viewerLoad;
}
function showPart(p) {
  lastPart = p;
  const el = $('stage').closest('.slide') || curEl; if (!el || !el.querySelector('.pd')) return;
  const q = c => el.querySelector(c);
  q('.pd-num').textContent = 'Part ' + p.n;
  q('.pd-group').textContent = (GROUPS.find(g => g[0] === p.group) || [, ''])[1];
  q('.pd-name').textContent = p.name; q('.pd-text').textContent = p.what;
  const list = q('.pd-list'); list.textContent = '';
  const row = (k, v) => { const t = document.createElement('dt'); t.textContent = k; const d = document.createElement('dd'); d.textContent = v; list.append(t, d); };
  row('Connects to', p.connects);
  row('Size', p.size[1]);
  const ph = findBase(`media/parts/${p.id}`);
  if (ph) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pd-photo'; b.innerHTML = `<img src="${esc(ph)}" alt="${esc(p.name)}">`; b.onclick = () => openViewer([{ type: 'image', src: ph, title: p.name }]); list.after(b); }
  const v = video(p.video), btn = q('.pd-video');
  btn.hidden = !v; btn.onclick = v ? () => openViewer([v]) : null;
}
// Light up the step that the feed cycle animation is on.
function watchCycle() {
  const st = $('cycleStatus');
  new MutationObserver(() => {
    const curEl = $('stage').closest('.slide');
    if (!curEl || !curEl.querySelector('.cyc-steps')) return;
    const t = st.textContent.toLowerCase();
    const k = st.hidden ? -1 : /finished|returns/.test(t) ? 4 : /topped/.test(t) ? 3 : /drop|pour|moving on/.test(t) ? 2 : /weigh/.test(t) ? 1 : /home/.test(t) ? 0 : -1;
    curEl.querySelectorAll('.cyc-steps li').forEach(li => li.classList.toggle('on', +li.dataset.step === k));
    const b = curEl.querySelector('.cyc-play');
    if (b) b.innerHTML = st.hidden ? `${ICON.play} Play the feed cycle` : `${ICON.pause} Stop`;
  }).observe(st, { childList: true, characterData: true, subtree: true, attributes: true });
}

// The lanyard rail is laid out for about 1120 × 500 px; it is zoomed to fit the slide so every badge shows.
const TEAM_W = 1120, TEAM_H = 500;
const teamFit = new ResizeObserver(es => es.forEach(e => {
  const el = $('teamRoot'), w = e.contentRect.width, h = e.contentRect.height;
  if (!w || !h || el.parentElement !== e.target) return;
  el.style.zoom = Math.min(w / TEAM_W, h / TEAM_H);
}));
function dockTeam(host) {
  const el = $('teamRoot'); host.append(el);
  teamFit.disconnect(); teamFit.observe(host);
  const r = host.getBoundingClientRect();
  if (r.width && r.height) el.style.zoom = Math.min(r.width / TEAM_W, r.height / TEAM_H);
  if (teamMounted) return;
  teamMounted = true;
  import('./team.bundle.js?v=3').then(m => m.mount(el, LIB.team)).catch(e => console.warn(e));
}

// ---------------------------------------------------------------- navigation
function go(i, dir) {
  if (mode !== 'slides') return scrollToSlide(i);
  const n = S().length; i = Math.max(0, Math.min(n - 1, i));
  if (i === cur) return;
  dir = dir ?? (i > cur ? 1 : -1);
  const s = S()[i], frame = $('frame'), old = curEl;
  if (old) { pauseWithin(old); undock(); }
  cur = i;
  const el = build(s, i, false);
  el.classList.add('enter'); el.style.setProperty('--dir', dir);
  frame.append(el); curEl = el;
  hydrate(el, s);
  const reveal = () => el.classList.remove('enter');
  requestAnimationFrame(() => requestAnimationFrame(reveal));
  setTimeout(reveal, 80);
  if (old) { old.classList.add('leave'); old.setAttribute('aria-hidden', 'true'); setTimeout(() => old.remove(), reduced ? 0 : 420); }
  history.replaceState(null, '', '#' + (i + 1));
  updateChrome();
  // Warm the next slide's pictures.
  const nx = S()[i + 1];
  if (nx) build(nx, i + 1, true).querySelectorAll('img').forEach(im => { const p = new Image(); p.src = im.getAttribute('src'); });
}
const next = () => go(cur + 1, 1), prev = () => go(cur - 1, -1);

function updateChrome() {
  const s = S()[cur], c = chap(s.chapter), n = S().length;
  $('crumbChap').textContent = c.num ? `${c.label} · ${c.title}` : c.label || '';
  $('crumbTitle').textContent = s.title || (s.type === 'chapter' ? chap(s.chapter).title : s.kicker) || '';
  $('count').textContent = `${cur + 1} / ${n}`;
  $('pillCount').textContent = `${cur + 1} / ${n}`;
  $('progress').style.transform = `scaleX(${n > 1 ? cur / (n - 1) : 1})`;
  $('notesBody').textContent = s.notes || 'No speaker notes for this slide.';
  document.querySelectorAll('.strip .thumb, .grid .thumb').forEach(b => {
    const on = +b.dataset.i === cur;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
  const t = document.querySelector(`.strip .thumb[data-i="${cur}"]`);
  if (t && !document.body.classList.contains('strip-off')) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced || !document.body.classList.contains('ready') ? 'auto' : 'smooth' });
  $('prevBtn').disabled = cur === 0; $('nextBtn').disabled = cur === n - 1;
}

// ---------------------------------------------------------------- thumbnails, strip and grid
const thumbIO = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const b = e.target; thumbIO.unobserve(b);
  const f = b.querySelector('.frame'); f.append(build(S()[+b.dataset.i], +b.dataset.i, true));
}), { rootMargin: '300px' });
function thumb(i) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'thumb'; b.dataset.i = i;
  const s = S()[i];
  b.setAttribute('aria-label', `Slide ${i + 1}: ${s.title || chap(s.chapter).title || s.kicker || s.type}`);
  b.innerHTML = `<span class="frame thumb-frame" aria-hidden="true"></span><span class="thumb-n">${i + 1}</span>`;
  b.addEventListener('click', () => { if (b.closest('.grid')) toggleGrid(false); mode === 'web' ? scrollToSlide(i) : go(i); });
  thumbIO.observe(b);
  return b;
}
function buildStrip() {
  const strip = $('strip'); let last = null;
  S().forEach((s, i) => {
    if (s.chapter !== last) { last = s.chapter; const c = chap(s.chapter); const m = document.createElement('span'); m.className = 'strip-ch'; m.textContent = c.num || c.label; m.title = c.title || c.label; strip.append(m); }
    strip.append(thumb(i));
  });
}
function buildGrid() {
  const g = $('gridBody');
  D.chapters.forEach(c => {
    const idx = S().map((s, i) => s.chapter === c.id ? i : -1).filter(i => i >= 0);
    if (!idx.length) return;
    const sec = document.createElement('section');
    sec.innerHTML = `<h3><span>${esc(c.num ? c.label : c.label)}</span>${c.title ? esc(c.title) : ''}<em>${idx.length} slides</em></h3><div class="grid-row"></div>`;
    idx.forEach(i => sec.querySelector('.grid-row').append(thumb(i)));
    g.append(sec);
  });
}
function toggleGrid(on) {
  const g = $('grid'); on = on ?? g.hidden;
  if (on) { pauseAll(); g.hidden = false; requestAnimationFrame(() => g.classList.add('open')); setTimeout(() => g.classList.add('open'), 60); const t = g.querySelector(`.thumb[data-i="${cur}"]`); if (t) { t.scrollIntoView({ block: 'center' }); t.focus({ preventScroll: true }); } }
  else { g.classList.remove('open'); setTimeout(() => { g.hidden = true; }, reduced ? 0 : 200); $('frame').focus({ preventScroll: true }); }
  $('gridBtn').setAttribute('aria-pressed', on);
}

// ---------------------------------------------------------------- layout, present mode
const mobileQ = matchMedia('(max-width: 760px) and (orientation: portrait)');
function fit() {
  document.body.classList.toggle('mobile', mobileQ.matches);
  if (mode !== 'slides') return;
  const v = $('view'), cs = getComputedStyle(v), f = $('frame');
  const r = { width: v.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), height: v.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) };
  let w, h;
  if (mobileQ.matches) { w = r.width; h = r.height; }
  else { w = Math.min(r.width, r.height * 16 / 9); h = w * 9 / 16; }
  f.style.width = Math.floor(w) + 'px'; f.style.height = Math.floor(h) + 'px';
}
function present(on) {
  on = on ?? !document.body.classList.contains('present');
  document.body.classList.toggle('present', on);
  $('presentBtn').setAttribute('aria-pressed', on);
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  if (!on && document.fullscreenElement === document.documentElement) document.exitFullscreen?.();
  requestAnimationFrame(fit);
}
let pillT = 0;
function wakePill() {
  document.body.classList.add('pill-on'); clearTimeout(pillT);
  pillT = setTimeout(() => document.body.classList.remove('pill-on'), 2200);
}

function setupInput() {
  $('prevBtn').addEventListener('click', prev); $('nextBtn').addEventListener('click', next);
  $('pillPrev').addEventListener('click', prev); $('pillNext').addEventListener('click', next);
  $('gridBtn').addEventListener('click', () => toggleGrid()); $('pillGrid').addEventListener('click', () => toggleGrid());
  $('gridClose').addEventListener('click', () => toggleGrid(false));
  $('presentBtn').addEventListener('click', () => present()); $('pillExit').addEventListener('click', () => present(false));
  $('notesBtn').addEventListener('click', () => { const on = document.body.classList.toggle('notes-on'); $('notesBtn').setAttribute('aria-pressed', on); requestAnimationFrame(fit); });
  $('stripBtn').addEventListener('click', () => { const off = document.body.classList.toggle('strip-off'); $('stripBtn').setAttribute('aria-pressed', !off); requestAnimationFrame(fit); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('present')) present(false); });
  document.addEventListener('pointermove', () => { if (document.body.classList.contains('present')) wakePill(); });

  document.addEventListener('keydown', e => {
    if (viewerOpen() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tg = e.target instanceof Element ? e.target : document.body;
    if (tg.closest('input, textarea, select, .vp, .tools, [contenteditable]')) return;
    const gridOn = !$('grid').hidden, k = e.key;
    if (mode === 'web') { if ((k === 'p' || k === 'P') && !gridOn) { e.preventDefault(); setMode('slides'); } else if (k === 'Escape' && gridOn) toggleGrid(false); return; }
    if (k === 'Escape') { if (gridOn) toggleGrid(false); else if (document.body.classList.contains('present')) present(false); else setMode('web'); return; }
    if (gridOn) return;
    const act = {
      ArrowRight: next, ArrowDown: next, PageDown: next, ' ': next, ArrowLeft: prev, ArrowUp: prev, PageUp: prev,
      Home: () => go(0), End: () => go(S().length - 1), g: () => toggleGrid(), f: () => present(), p: () => present(), n: () => $('notesBtn').click(),
    }[k.length === 1 ? k.toLowerCase() : k];
    if (act) { if (k === ' ' && tg.closest('button')) return; e.preventDefault(); act(); }
  });

  // Swipe between slides on touch screens (not on the model, video or anything that scrolls).
  let sx = null, sy = 0;
  $('view').addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || e.target.closest('.stage, .vp, .tbl-wrap, .team-host, input')) { sx = null; return; }
    sx = e.clientX; sy = e.clientY;
  });
  $('view').addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) dx < 0 ? next() : prev();
  });
  new ResizeObserver(fit).observe($('view'));
  mobileQ.addEventListener('change', fit);
}

// ---------------------------------------------------------------- web page (the default view)
let mode = 'web';
const wavesSVG = (from, to) => `<svg class="waves" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true" style="background:${from}">
  <g class="drift slow"><path fill="#7cc8ff" fill-opacity=".28" d="M0 76C180 22 360 22 540 66s360 66 540 26 270-52 360-34v92H0z"/></g>
  <g class="drift"><path fill="#49a6f5" fill-opacity=".45" d="M0 104c200-52 380-46 560-12s340 44 520 8 270-40 360-24v74H0z"/></g>
  <path fill="${to}" d="M0 126c220-34 420-30 620-8s400 26 820-14v46H0z"/></svg>`;
const BAND_BG = { sky: '#072a73', deep: '#072a73', ice: '#e8eff8', white: '#ffffff' };
const buildIO = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting || mode !== 'web' || !e.target.offsetHeight) return;
  const band = e.target; buildIO.unobserve(band);
  const i = +band.dataset.i, s = S()[i], el = build(s, i, false);
  band.querySelector('.frame').append(el);
  hydrate(el, s);
  revealIO.observe(band);
  onWebScroll();
}), { rootMargin: '900px 0px' });
const revealIO = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  revealIO.unobserve(e.target);
  const el = e.target.querySelector('.slide'); if (el) el.classList.remove('enter');
}), { threshold: 0.18 });
function buildWeb() {
  const web = $('webBody');
  S().forEach((s, i) => {
    const th = themeOf(s, i), band = document.createElement('section');
    band.className = `band band-${th}`; band.id = s.id; band.dataset.i = i;
    band.setAttribute('aria-label', s.title || chap(s.chapter).title || s.kicker || s.type);
    band.innerHTML = '<div class="frame main-frame web-frame"></div>';
    web.append(band);
    const nx = S()[i + 1];
    if ((th === 'sky' || th === 'deep') && nx && !['sky', 'deep'].includes(themeOf(nx, i + 1))) web.insertAdjacentHTML('beforeend', wavesSVG(BAND_BG[th], BAND_BG[themeOf(nx, i + 1)]));
    buildIO.observe(band);
  });
  $('webNav').innerHTML = D.chapters.filter(c => c.num).map(c => `<a href="#${esc(c.id)}" data-ch="${esc(c.id)}"><b>${esc(c.num)}</b><span>${esc(c.title)}</span></a>`).join('');
  $('webNav').querySelectorAll('a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollToSlide(S().findIndex(s => s.id === a.dataset.ch)); }));
}
function scrollToSlide(i) {
  const band = document.querySelector(`.band[data-i="${i}"]`); if (!band) return;
  band.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
// Which band is in the middle of the screen: the 3D model and the chapter links follow it.
function webCurrent() {
  const mid = innerHeight * 0.45; let best = null, bd = Infinity;
  document.querySelectorAll('.band').forEach(b => {
    const r = b.getBoundingClientRect();
    const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < bd) { bd = d; best = b; }
  });
  return best;
}
let webT = 0;
function onWebScroll() {
  if (mode !== 'web') return;
  const doc = document.documentElement;
  $('webProgress').style.transform = `scaleX(${doc.scrollTop / Math.max(1, doc.scrollHeight - innerHeight)})`;
  $('webBar').classList.toggle('solid', scrollY > 40);
  clearTimeout(webT);
  webT = setTimeout(() => {
    const b = webCurrent(); if (!b) return;
    const i = +b.dataset.i; cur = i;
    const ch = S()[i].chapter;
    $('webNav').querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.ch === ch));
    const hosts = [...document.querySelectorAll('.band .model-host')];
    let hb = null, hd = Infinity;
    hosts.forEach(h => { const r = h.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - innerHeight / 2); if (d < hd) { hd = d; hb = h; } });
    if (hb && hd < innerHeight) dockModel(hb);
  }, 120);
}
function setMode(m, at) {
  if (m === mode && cur >= 0 && m === 'web') return;
  pauseAll();
  if (m === 'slides') {
    const wc = webCurrent();
    const i = at ?? (wc ? +wc.dataset.i : 0);
    undock(); mode = 'slides';
    document.body.classList.remove('mode-web'); document.body.classList.add('mode-slides');
    cur = -1; curEl = null; $('frame').textContent = '';
    fit(); go(i, 0);
  } else {
    const i = Math.max(0, cur);
    if (document.body.classList.contains('present')) present(false);
    undock(); $('frame').textContent = ''; curEl = null;
    mode = 'web';
    document.body.classList.remove('mode-slides'); document.body.classList.add('mode-web');
    history.replaceState(null, '', location.pathname + location.search);
    requestAnimationFrame(() => {
      const band = document.querySelector(`.band[data-i="${i}"]`); if (band) band.scrollIntoView({ block: 'start' });
      const th = document.querySelector('.band .team-host'); if (th) dockTeam(th);
      document.querySelectorAll('.band').forEach(b => { if (!b.querySelector('.slide')) { buildIO.unobserve(b); buildIO.observe(b); } });
      onWebScroll();
    });
  }
}

// ---------------------------------------------------------------- start
async function start() {
  [D, LIB] = await Promise.all([
    fetch('data/deck.json').then(r => r.json()),
    fetch('data/library.json').then(r => r.json()).catch(() => LIB),
  ]);
  LIB.files = LIB.files || [];
  { let sec = null, ch = null; S().forEach(x => { if (x.chapter !== ch) { ch = x.chapter; sec = null; } if (x.section) sec = x.section; x._sec = sec; }); }
  document.title = `${D.title}: ${S()[0]?.text || 'Presentation'}`;
  buildStrip(); buildGrid(); buildWeb(); setupInput();
  $('toSlides').addEventListener('click', () => setMode('slides'));
  $('toWeb').addEventListener('click', () => setMode('web'));
  addEventListener('scroll', onWebScroll, { passive: true });
  const h = location.hash.slice(1);
  document.body.classList.add('ready');
  if (/^\d+$/.test(h)) setMode('slides', +h - 1);
  else {
    document.body.classList.add('mode-web'); fit();
    const at = S().findIndex(s => s.id === h);
    if (at > 0) setTimeout(() => { const b = document.querySelector(`.band[data-i="${at}"]`); if (b) b.scrollIntoView({ block: 'start' }); }, 300);
    onWebScroll();
  }
}
start();
