// Runs on every deploy (see vercel.json). Checks which media files exist and writes data/library.json for the page.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slots = JSON.parse(readFileSync(join(root, 'data/media-slots.json'), 'utf8'));
const IMG = ['.jpg', '.jpeg', '.png', '.webp'];
const VID = ['.mp4', '.webm'];
const find = (base, exts) => { for (const e of exts) if (existsSync(join(root, base + e))) return base + e; return null; };

const image = s => ({ ...s, src: find(s.file, IMG) });
const out = {
  videos: slots.videos.map(s => ({ ...s, src: find(s.file, VID), poster: find(s.file, IMG) })),
  app: slots.app.map(image),
  panel: slots.panel.map(image),
  photos: slots.photos.map(image),
  team: slots.team.map(({ file, ...m }) => ({ ...m, file, image: find(file, IMG) || 'img/team-placeholder.svg' })),
};
writeFileSync(join(root, 'data/library.json'), JSON.stringify(out));
const n = l => `${l.filter(x => x.src).length}/${l.length}`;
console.log(`Media found: videos ${n(out.videos)}, app ${n(out.app)}, panel ${n(out.panel)}, photos ${n(out.photos)}`);
