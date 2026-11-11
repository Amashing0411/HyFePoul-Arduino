// Runs on every deploy (see vercel.json). Checks which media files exist and writes data/library.json for the page.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slots = JSON.parse(readFileSync(join(root, 'data/media-slots.json'), 'utf8'));
const IMG = ['.jpg', '.jpeg', '.png', '.webp'];
const VID = ['.mp4', '.webm'];
const find = (base, exts) => { for (const e of exts) if (existsSync(join(root, base + e))) return base + e; return null; };

// Every file under media/, so the page can look up any slot (functions, parts, schematic) by name.
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(relative(root, p).split('\\').join('/')); } };
walk(join(root, 'media'));

const image = s => ({ ...s, src: find(s.file, IMG) });
const out = {
  files,
  videos: slots.videos.map(s => ({ ...s, src: find(s.file, VID), poster: find(s.file, IMG) })),
  app: slots.app.map(image),
  panel: slots.panel.map(image),
  photos: slots.photos.map(image),
  team: slots.team.map(({ file, ...m }) => ({ ...m, file, image: find(file, IMG) || 'img/team-placeholder.svg' })),
};
writeFileSync(join(root, 'data/library.json'), JSON.stringify(out));
const n = l => `${l.filter(x => x.src).length}/${l.length}`;
console.log(`Media found: videos ${n(out.videos)}, app ${n(out.app)}, panel ${n(out.panel)}, photos ${n(out.photos)}, files ${files.length}`);
