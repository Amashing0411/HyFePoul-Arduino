// Builds the machine: CAD meshes for the structure, drawn modules for everything the CAD leaves out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/bgu';

const V3 = THREE.Vector3;
export const W = (X, Y, Z) => new V3(X - 134.3, Z, -(Y - 41.3));

const col = new THREE.Color();
class Kit {
  constructor() { this.gs = []; }
  add(g, c) {
    col.set(c);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    this.gs.push(g);
    return this;
  }
  box(w, h, d, c, x = 0, y = 0, z = 0) { return this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c); }
  cyl(r, h, c, x = 0, y = 0, z = 0, axis = 'z', seg = 14) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
    return this.add(g.translate(x, y, z), c);
  }
  geometry() { const g = mergeGeometries(this.gs); this.gs.forEach(x => x.dispose()); return g; }
}

const kitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
const GOLD = 0xd8b45a, SILVER = 0xc9ced2, BLACK = 0x15171a, BLUE = 0x12609f;

export function buildModel(cad, parts) {
  const root = new THREE.Group();
  const P = {};
  parts.forEach(p => { P[p.id] = p; p.meshes = []; p.anchors = {}; p.ex = new V3(); });

  const attach = (id, parent, pos) => {
    const g = new THREE.Group();
    g.name = id; if (pos) g.position.copy(pos);
    g.userData.base = g.position.clone();
    parent.add(g); P[id].obj = g;
    return g;
  };
  const addMesh = (id, geo, mat, pickable = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.userData.part = id; m.userData.pickable = pickable;
    P[id].obj.add(m); P[id].meshes.push(m);
    return m;
  };
  const anchor = (id, name, x, y, z, nx = 0, ny = 0, nz = 1) => {
    P[id].anchors[name] = { p: new V3(x, y, z), n: new V3(nx, ny, nz) };
  };
  const finishKit = (id, kit) => addMesh(id, kit.geometry(), kitMat);

  // --- CAD parts ---
  // The source mesh is one merged shell and the five trays are fused into long triangles.
  // Cut it at the measured tray boundaries so each tray is its own selectable piece.
  {
    const start = { 4: 29.2, 5: 71.5, 3: 113.8, 2: 156.1, 1: 198.4 }, tris = [];
    [1, 2, 3, 4, 5].forEach(n => {
      const g = cad['tray' + n], a = g.attributes.position, idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) tris.push([0, 1, 2].map(j => new V3().fromBufferAttribute(a, idx[i + j])));
    });
    const clip = (poly, x, keepAbove) => {
      const out = [];
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length], pin = keepAbove ? p.x >= x : p.x <= x, qin = keepAbove ? q.x >= x : q.x <= x;
        if (pin) out.push(p);
        if (pin !== qin) out.push(p.clone().lerp(q, (x - p.x) / (q.x - p.x)));
      });
      return out;
    };
    [1, 2, 3, 4, 5].forEach(n => {
      const x0 = start[n] - 134.3, x1 = x0 + 42.3, out = [];
      tris.forEach(t => {
        const poly = clip(clip(t, x0, true), x1, false);
        for (let i = 1; i < poly.length - 1; i++) [poly[0], poly[i], poly[i + 1]].forEach(v => out.push(v.x, v.y, v.z));
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
      cad['tray' + n] = g;
    });
  }
  const CADCOL = { frame: 0xbcc2c3, cage: 0xa4abac, tray1: 0xe58a2c, tray2: 0xe58a2c, tray3: 0xe58a2c, tray4: 0xe58a2c, tray5: 0xe58a2c,
    drinkers: 0xc92f2b, pipe: 0x2a62b8, reservoir: 0xc4c9cb, chain: 0x3a3f42, hopper: 0xc9ced0, lid: 0xd6dadb, rollers: 0x4e5356, auger: 0xbcc2c6 };
  const carrier = new THREE.Group(); carrier.name = 'carrier';
  root.add(carrier);
  const riding = new Set(['hopper', 'lid', 'rollers', 'auger']);
  const cadMats = {};
  Object.entries(CADCOL).forEach(([id, c]) => {
    attach(id, riding.has(id) ? carrier : root);
    const mat = cadMats[id] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15, flatShading: true });
    addMesh(id, cad[id], mat);
  });

  // The CAD draws the cage walls as flat sheets. The machine has bars and wire grid, so swap the sheets
  // for rods inside the same outlines, and add the green mesh floor seen in the photos.
  {
    const g = cad.cage, pos = g.attributes.position, idx = g.index.array, keep = [];
    const a = new V3(), b = new V3(), c = new V3();
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
      if (b.clone().sub(a).cross(c.clone().sub(a)).length() / 2 <= 300) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(keep), 1));
    const ROD = 0xa9b0b2, k = new Kit();
    const vert = (X, Y, Z0, Z1) => { const m = W(X, Y, (Z0 + Z1) / 2); k.box(0.3, Z1 - Z0, 0.3, ROD, m.x, m.y, m.z); };
    const horizY = (X, Y0, Y1, Z) => { const m = W(X, (Y0 + Y1) / 2, Z); k.box(0.3, 0.3, Y1 - Y0, ROD, m.x, m.y, m.z); };
    [30.05, 72.15, 114.25, 156.35, 198.45, 240.4].forEach(X => {
      for (let Y = 8.5; Y < 43.9; Y += 5) vert(X, Y, 68, 103);
      for (let Z = 68; Z <= 103; Z += 5) horizY(X, 8.3, 43.8, Z);
    });
    for (let X = 32; X < 198.4; X += 6) vert(X, 6.75, 68, 103);
    for (let X = 32; X < 240; X += 6) vert(X, 44, 68, 103);
    finishKit('cage', k);
    const c2 = document.createElement('canvas'); c2.width = c2.height = 64;
    const x = c2.getContext('2d'); x.strokeStyle = '#2fb24a'; x.lineWidth = 7;
    x.beginPath(); x.moveTo(0, 32); x.lineTo(32, 0); x.lineTo(64, 32); x.lineTo(32, 64); x.closePath(); x.stroke();
    const t = new THREE.CanvasTexture(c2); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 12); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const floorM = W(135.25, 26, 67.6);
    const mesh = new THREE.PlaneGeometry(210.5, 36).rotateX(-Math.PI / 2).translate(floorM.x, floorM.y, floorM.z);
    addMesh('cage', mesh, new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }), false);
  }

  // --- Field parts drawn from photos and datasheets ---
  // Ultrasonic sensor on the cover.
  attach('ultrasonic', carrier, W(208.8, 60.8, 116.9));
  finishKit('ultrasonic', new Kit().box(4.5, 0.16, 2, 0x2559b0).cyl(0.8, 1.4, SILVER, -1.3, -0.72, 0, 'y').cyl(0.8, 1.4, SILVER, 1.3, -0.72, 0, 'y')
    .box(0.9, 0.3, 0.4, SILVER, 0, 0.2, -0.5).box(1.05, 0.85, 0.25, BLACK, 0, 0.5, 0.85));
  ['VCC', 'TRIG', 'ECHO', 'GND'].forEach((a, i) => anchor('ultrasonic', a, -0.38 + i * 0.254, 0.95, 0.85, 0, 1, 0));

  // Dispenser: grey worm gearbox and hanging black motor, joined with white lever connectors.
  attach('dispMotor', carrier, W(208.85, 71.5, 88.8));
  {
    const k = new Kit().box(5.5, 8, 4.2, 0x8c9093).cyl(0.65, 1.8, SILVER, 0, 0, 2.9).cyl(2.1, 8, BLACK, 0, -8, 0, 'y');
    [[-2, 3], [2, 3], [-2, -3], [2, -3]].forEach(([x, y]) => k.cyl(0.45, 0.3, 0x6a6e70, x, y, -2.2));
    k.box(3.2, 1.2, 1.5, 0xf2f2ee, 0, -9.8, 2.9).cyl(0.55, 1.1, 0xc4322d, 0, -11, 2.2, 'y');
    finishKit('dispMotor', k);
    anchor('dispMotor', 'M+', -0.8, -9.15, 2.9, 0, 1, 0);
    anchor('dispMotor', 'M-', 0.8, -9.15, 2.9, 0, 1, 0);
  }

  attach('chainMotor', root, W(239.5, 53, 109.4));
  finishKit('chainMotor', new Kit().box(5, 5, 4, 0x71767a, 0, 0, 3).cyl(2.6, 9, BLACK, 0, 0, -3.5).box(1.8, 0.8, 0.4, 0xd8b45a, 0, 0, -8.2).cyl(0.8, 6, SILVER, 0, 0, 7));
  anchor('chainMotor', 'M+', -0.55, 0, -8.4, 0, 0, -1);
  anchor('chainMotor', 'M-', 0.55, 0, -8.4, 0, 0, -1);

  const limit = (id, X, dir) => {
    attach(id, root, W(X, 47, 101.2));
    finishKit(id, new Kit().box(2.8, 1.6, 1, BLACK).box(0.15, 0.1, 0.5, SILVER, dir * 1.6, 1, 0).box(2.8, 0.12, 0.5, SILVER, dir * 2.2, 1.1, 0).cyl(0.25, 0.5, 0x888888, dir * 3.5, 1.25, 0));
    anchor(id, 'S', -0.4, -0.9, 0, 0, -1, 0); anchor(id, 'G', 0.4, -0.9, 0, 0, -1, 0);
  };
  limit('limitHome', 237, -1);
  limit('limitEnd', 32.5, 1);

  const TRAY_X = { 1: 219.55, 2: 177.25, 3: 134.95, 5: 92.65, 4: 50.35 };
  [1, 2, 3, 4, 5].forEach(n => {
    const id = 'lc' + n;
    attach(id, root, W(TRAY_X[n], 50.2, 66.6));
    finishKit(id, new Kit().box(8, 1.27, 1.27, 0xb9bdc1).box(2, 1.3, 1.6, 0x707478, -2.7, 1.3, 0).box(2, 1, 1.6, 0x707478, 2.7, -1.1, 0).box(1.4, 1.3, 1.3, 0xf0efe9).box(0.7, 0.5, 1, BLACK, 4.2, 0, 0));
    ['E+', 'E-', 'A-', 'A+'].forEach((a, i) => anchor(id, a, 4.55, 0.1, -0.33 + i * 0.22, 1, 0, 0));
  });

  attach('float', root, W(14.5, 26, 122));
  finishKit('float', new Kit().cyl(1.4, 0.6, SILVER, -0.3, 0, 0, 'x').cyl(0.4, 6, 0xdddddd, 3, 0, 0, 'x').cyl(1.5, 3, 0xf1f1ec, 7, -0.6, 0, 'y'));
  anchor('float', 'a', -0.6, 0.2, 0.15, -1, 0, 0); anchor('float', 'b', -0.6, -0.2, -0.15, -1, 0, 0);

  // --- Control box. Local axes: x across (Y in CAD), y up, z from back plate toward the door. ---
  const box = new THREE.Group();
  box.position.copy(W(240.6, 9, 57)); box.rotation.y = Math.PI / 2;
  box.userData.base = box.position.clone();
  root.add(box);

  attach('shell', box);
  const steel = 0xb6bbbe;
  {
    const k = new Kit().box(34, 46, 0.15, steel, 17, 23, 0.075);
    [[265, 190], [305, 490], [150, 430], [480, 940], [240, 900], [365, 770], [590, 430]].forEach(([px, py]) => k.box(1.2, 1.2, 0.3, BLACK, (px - 140) / 30.8, 45 - py / 30.8, 0.25));
    finishKit('shell', k);
    const w = new Kit().box(0.15, 46, 13, steel, 0.075, 23, 6.5).box(0.15, 46, 13, steel, 33.925, 23, 6.5).box(34, 0.15, 13, steel, 17, 45.925, 6.5).box(34, 0.15, 13, steel, 17, 0.075, 6.5);
    addMesh('shell', w.geometry(), kitMat).userData.wall = true;
  }

  // Door swings about its left edge.
  const doorG = attach('door', box, new V3(0, 0, 13));
  {
    const k = new Kit().box(0.5, 46, 0.5, SILVER, -0.1, 23, 0).box(3.2, 45, 0.35, 0xc9a874, 1.9, 23, 0.1).box(0.5, 45, 0.3, 0xece9df, 3.7, 23, 0.1)
      .box(34, 0.5, 0.3, SILVER, 17, 0.2, 0).box(34, 0.5, 0.3, SILVER, 17, 45.8, 0).box(0.4, 46, 0.3, SILVER, 33.8, 23, 0).cyl(0.8, 0.8, SILVER, 33, 21, 0.3);
    finishKit('door', k);
    const acrylic = new THREE.MeshStandardMaterial({ color: 0xcfe0e6, transparent: true, opacity: 0.16, roughness: 0.15, depthWrite: false });
    const a = addMesh('door', new THREE.BoxGeometry(33.4, 45, 0.25).translate(17, 23, 0), acrylic, false);
    a.renderOrder = 2;
  }
  attach('nextion', doorG, new V3(17, 34.5, 0));
  {
    const k = new Kit().box(19.6, 11.8, 0.5, 0xb88f5e, 0, 0, 0.3).box(18, 10, 0.08, 0x0d1518, 0, 0, 0.6).box(18.1, 10.8, 0.2, 0x1b6a43, 0, 0, -0.9).box(2.6, 0.7, 0.5, 0xf2f2ee, 3, -5, -1.2);
    [[-9.2, 5.3], [9.2, 5.3], [-9.2, -5.3], [9.2, -5.3]].forEach(([x, y]) => k.cyl(0.25, 0.3, SILVER, x, y, 0.65));
    [[-8.4, 4.8], [8.4, 4.8], [-8.4, -4.8], [8.4, -4.8]].forEach(([x, y]) => k.cyl(0.28, 0.8, GOLD, x, y, -0.45));
    finishKit('nextion', k);
    ['5V', 'TX', 'RX', 'GND'].forEach((a, i) => anchor('nextion', a, 2.1 + i * 0.6, -5, -1.5, 0, -0.2, -1));
  }

  const module = (id, u, v, d) => attach(id, box, new V3(u, v, d));
  const pcb = (k, w, h, c) => k.box(w, h, 0.16, c, 0, 0, -0.08);
  const standoffs = (k, pts, height) => { pts.forEach(([x, y]) => k.cyl(0.2, height, GOLD, x, y, -height / 2 - 0.16).cyl(0.17, 0.12, SILVER, x, y, 0.06)); };
  const headerRow = (k, x0, y0, n, dx, dy, c = BLACK, h = 0.85) => {
    k.box(Math.abs(dx) * n + 0.08 + (dy ? 0.25 : 0), Math.abs(dy) * n + 0.08 + (dx ? 0.25 : 0), h, c, x0 + dx * (n - 1) / 2, y0 + dy * (n - 1) / 2, h / 2);
    for (let i = 0; i < n; i++) k.box(0.08, 0.08, 0.12, 0x8a7a40, x0 + dx * i, y0 + dy * i, h + 0.04);
  };

  // Arduino Mega: pin centres from the published board layout, turned to match the photo (USB to the right).
  const megaPins = {};
  {
    const put = (name, x, y) => { megaPins[name] = [-(x - 50.8) / 10, -(y - 26.67) / 10]; };
    ['SCL', 'SDA', 'AREF', 'GNDT', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'].forEach((n, i) => put(n, 18.796 + i * 2.54, 50.8));
    for (let i = 0; i < 8; i++) put('D' + (7 - i), 45.72 + i * 2.54, 50.8);
    for (let i = 0; i < 8; i++) put('D' + (14 + i), 68.58 + i * 2.54, 50.8);
    ['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND1', 'GND2', 'VIN'].forEach((n, i) => put(n, 27.94 + i * 2.54, 2.54));
    for (let i = 0; i < 8; i++) put('A' + i, 50.8 + i * 2.54, 2.54);
    for (let i = 0; i < 8; i++) put('A' + (8 + i), 73.66 + i * 2.54, 2.54);
    for (let r = 0; r < 16; r++) { put('D' + (22 + r * 2), 93.98, 46.99 - r * 2.54); put('D' + (23 + r * 2), 96.52, 46.99 - r * 2.54); }
  }
  module('mega', 21.9, 30.6, 1.1);
  {
    const k = new Kit(); pcb(k, 10.16, 5.33, BLUE);
    standoffs(k, [[4.6, 2.3], [-4.5, 2.3], [4.6, -2.3], [-4.5, -2.3]], 0.94);
    k.box(1.5, 1.5, 0.14, 0x101215, -0.3, -0.2, 0.07).box(0.55, 0.55, 0.1, 0x101215, 3, -0.9, 0.05);
    k.box(1.6, 1.2, 1.1, SILVER, 4.9, -1.13, 0.55).box(1.4, 0.9, 1.1, BLACK, 5.1, 1.9, 0.55);
    k.cyl(0.3, 0.55, SILVER, 2.9, 1.7, 0.27).cyl(0.3, 0.55, SILVER, 3.55, 1.7, 0.27).box(0.9, 0.35, 0.3, SILVER, 1.8, 0.7, 0.15).box(0.5, 0.5, 0.3, 0xe6e6e0, 3.9, 0.5, 0.15);
    const seg = (a, n, ax) => { const [x, y] = megaPins[a]; headerRow(k, x, y, n, ax, 0); };
    seg('SCL', 10, -0.254); seg('D7', 8, -0.254); seg('D14', 8, -0.254); seg('NC', 8, -0.254); seg('A0', 8, -0.254); seg('A8', 8, -0.254);
    const [xe, ye] = megaPins.D22; headerRow(k, xe, ye, 16, 0, 0.254); headerRow(k, xe - 0.254, ye, 16, 0, 0.254);
    finishKit('mega', k);
    Object.entries(megaPins).forEach(([n, [x, y]]) => anchor('mega', n, x, y, 0.92));
  }

  module('esp32', 19.3, 25.6, 0.9);
  {
    const k = new Kit(); pcb(k, 6.2, 3.5, 0xf2f1ea);
    standoffs(k, [[2.8, 1.5], [-2.8, 1.5], [2.8, -1.5], [-2.8, -1.5]], 0.74);
    k.box(5.2, 2.8, 0.16, 0x1a1c1f, 0, 0, 0.75).box(1.8, 1.6, 0.3, SILVER, 1.55, 0, 0.98).box(0.7, 1.7, 0.1, 0x101215, 2.5, 0, 0.87).box(0.85, 0.9, 0.3, SILVER, -2.5, 0, 0.98).box(0.4, 0.4, 0.1, 0x303236, -1, 0.5, 0.88);
    headerRow(k, -2.286, 1.27, 19, 0.254, 0, BLACK, 0.67); headerRow(k, -2.286, -1.27, 19, 0.254, 0, BLACK, 0.67);
    finishKit('esp32', k);
    const x = i => -2.286 + i * 0.254;
    anchor('esp32', 'VIN', x(0), 1.27, 0.92); anchor('esp32', 'GND', x(5), 1.27, 0.92);
    anchor('esp32', 'GPIO16', x(7), -1.27, 0.92); anchor('esp32', 'GPIO17', x(8), -1.27, 0.92);
  }

  module('rtc', 24.9, 36, 0.8);
  {
    const k = new Kit(); pcb(k, 3.8, 2.2, 0x1659a6);
    standoffs(k, [[1.6, 0.9], [1.6, -0.9], [-1.1, 0.9], [-1.1, -0.9]], 0.64);
    k.cyl(1, 0.32, SILVER, 0.9, 0, 0.16).box(0.8, 0.7, 0.2, BLACK, -0.8, 0, 0.1);
    headerRow(k, -1.75, 0.38, 4, 0, -0.254);
    finishKit('rtc', k);
    ['GND', 'VCC', 'SDA', 'SCL'].forEach((a, i) => anchor('rtc', a, -1.75, 0.38 - i * 0.254, 0.92));
  }

  const buck = (id, u, v) => {
    module(id, u, v, 0.8);
    const k = new Kit(); pcb(k, 4.3, 2.1, 0x1a4fa3);
    standoffs(k, [[1.9, 0.85], [-1.9, -0.85]], 0.64);
    k.box(1.2, 1.2, 0.7, 0x24272b, 0.1, 0.1, 0.35).cyl(0.34, 0.8, 0x222427, -1.3, 0.3, 0.4).cyl(0.34, 0.8, 0x222427, 1.3, -0.3, 0.4).box(0.7, 0.85, 0.25, BLACK, 1, 0.5, 0.13).box(0.5, 0.35, 0.3, 0x2f7fd0, -0.3, -0.8, 0.15);
    finishKit(id, k);
    anchor(id, 'IN+', 2, 0.45, 0.1); anchor(id, 'IN-', 2, -0.45, 0.1);
    anchor(id, 'OUT+', -2, 0.45, 0.1); anchor(id, 'OUT-', -2, -0.45, 0.1);
  };
  buck('buck1', 16.2, 37.4); buck('buck2', 16.5, 35);

  module('breadboard', 10.4, 32.1, 0.2);
  {
    const k = new Kit().box(3.5, 4.6, 0.85, 0xf2f1ea, 0, 0, 0.42);
    const cols = [-1.3, -1.05, 1.05, 1.3];
    cols.forEach(x => { for (let r = 0; r < 17; r++) k.box(0.1, 0.1, 0.02, 0x3a3a3a, x, -2.03 + r * 0.254, 0.86); });
    for (let c = -2; c <= 2; c++) for (let r = 0; r < 17; r++) k.box(0.1, 0.1, 0.02, 0x8a8a84, c * 0.254, -2.03 + r * 0.254, 0.86);
    finishKit('breadboard', k);
    for (let i = 0; i < 34; i++) {
      const col = i < 17 ? 0 : 1, r = i % 17;
      anchor('breadboard', 'p' + i, cols[col], 2.03 - r * 0.254, 0.88);
      anchor('breadboard', 'g' + i, cols[3 - col], 2.03 - r * 0.254, 0.88);
    }
  }

  const HXU = [9.2, 11.5, 13.8, 16.1, 18.4];
  HXU.forEach((u, i) => {
    const id = 'hx' + (i + 1);
    module(id, u, 22, 0.8);
    const k = new Kit(); pcb(k, 2.1, 3.3, 0x1f7a3c);
    standoffs(k, [[0.85, 1.4], [-0.85, 1.4], [0.85, -1.4], [-0.85, -1.4]], 0.64);
    k.box(0.65, 1, 0.16, BLACK, 0, 0, 0.08);
    headerRow(k, -0.38, 1.45, 4, 0.254, 0, 0xeeeeea, 0.5); headerRow(k, -0.635, -1.45, 6, 0.254, 0, 0xeeeeea, 0.5);
    finishKit(id, k);
    ['GND', 'DT', 'SCK', 'VCC'].forEach((a, j) => anchor(id, a, -0.38 + j * 0.254, 1.45, 0.6));
    ['E+', 'E-', 'A-', 'A+'].forEach((a, j) => anchor(id, a, -0.635 + j * 0.254, -1.45, 0.6));
  });

  module('relay', 24.7, 21.6, 1);
  {
    const k = new Kit(); pcb(k, 10, 4.4, 0x1659a6);
    standoffs(k, [[4.7, 2], [-4.7, 2], [4.7, -2], [-4.7, -2]], 0.84);
    headerRow(k, -4.3, 1.9, 8, 0.254, 0);
    for (let c = 0; c < 6; c++) {
      const x = -4 + c * 1.6;
      k.box(1.5, 1.85, 1.55, 0x2469c9, x, -0.35, 0.78).box(1.45, 0.7, 0.9, 0x2a74d2, x, -1.95, 0.45).box(0.45, 0.45, 0.2, BLACK, x, 1.1, 0.1);
      [-0.45, 0, 0.45].forEach(o => k.cyl(0.13, 0.08, SILVER, x + o, -1.95, 0.93));
    }
    finishKit('relay', k);
    ['GND', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'VCC'].forEach((a, i) => anchor('relay', a, -4.3 + i * 0.254, 1.9, 0.92));
    [1, 2, 3].forEach(n => {
      const x = -4 + (n - 1) * 1.6;
      anchor('relay', 'com' + n, x, -2.3, 0.45, 0, -1, 0);
      anchor('relay', 'no' + n, x + 0.45, -2.3, 0.45, 0, -1, 0);
    });
  }

  module('charger', 20.3, 42.2, 0.2);
  {
    const k = new Kit().box(14, 7, 3.2, 0x14171b, 0, 0, 1.6).box(5.4, 2.5, 0.08, 0x33506a, 0, 1.6, 3.22).box(13.4, 1.5, 0.08, 0x202429, 0, -2.45, 3.22);
    [-1.5, 0, 1.5].forEach(x => k.cyl(0.38, 0.14, 0x333840, x, 0, 3.26));
    [[5.2, 2], [5.2, 1]].forEach(([x, y]) => k.box(1.3, 0.55, 0.1, SILVER, x, y, 3.24));
    [[-6.6, 3.1], [6.6, 3.1], [-6.6, -3.1], [6.6, -3.1]].forEach(([x, y]) => k.cyl(0.3, 0.2, SILVER, x, y, 3.3));
    for (let i = 0; i < 6; i++) k.cyl(0.32, 0.14, SILVER, -4.4 + i * 1.76, -2.45, 3.28);
    finishKit('charger', k);
    for (let i = 0; i < 6; i++) anchor('charger', 't' + (i + 1), -4.4 + i * 1.76, -3.52, 1.3 + (i % 2) * 0.1, 0, -1, 0);
  }

  module('psu', 31.75, 33.85, 5.9);
  {
    const k = new Kit().box(4.2, 19.9, 9.8, 0xc2c7ca).box(0.45, 1.5, 7.6, 0xb0763a, -2.3, -9.1, 0).box(0.1, 5, 4, 0xf0f0ea, 0.9, 0, 4.95).box(0.1, 1.8, 2.4, 0xe9c23a, -2.15, 7.8, 0);
    for (let i = 0; i < 7; i++) k.cyl(0.32, 0.25, SILVER, -2.6, -9.1, -3.3 + i * 1.1, 'x');
    finishKit('psu', k);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#c2c7ca'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#20262a';
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { x.beginPath(); x.arc(16 + a * 32, 16 + b * 32, 11, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 22); t.colorSpace = THREE.SRGBColorSpace;
    addMesh('psu', new THREE.PlaneGeometry(8.6, 13.6).rotateY(-Math.PI / 2).translate(-2.13, 2.6, 0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
    ['L', 'N', 'E', 'COM1', 'COM2', 'V1', 'V2'].forEach((a, i) => anchor('psu', a, -2.72, -9.1, -3.3 + i * 1.1, -1, 0, 0));
  }

  module('battery', 26, 4.95, 3.6);
  finishKit('battery', new Kit().box(15.1, 9.4, 6.5, 0x1c1e20).box(14.6, 0.5, 6, 0x101214, 0, 4.9, 0).box(0.7, 0.35, 0.8, 0xc62d29, -6.2, 5.3, 1.8).box(0.7, 0.35, 0.8, 0x2a2c2e, 6.2, 5.3, 1.8));
  anchor('battery', '+', -6.2, 5.5, 1.8, 0, 1, 0); anchor('battery', '-', 6.2, 5.5, 1.8, 0, 1, 0);

  module('rocker', 0.15, 42, 5);
  finishKit('rocker', new Kit().box(2.2, 2, 3, BLACK, 1.1, 0, 0).box(0.5, 1.6, 2.6, 0xc92e2a, -0.25, 0, 0).box(0.8, 0.14, 0.5, 0xd9b53a, 2.5, 0.45, 0).box(0.8, 0.14, 0.5, 0xd9b53a, 2.5, -0.45, 0));
  anchor('rocker', 'a', 2.9, 0.45, 0, 1, 0, 0); anchor('rocker', 'b', 2.9, -0.45, 0, 1, 0, 0);

  module('buzzer', 5.5, 16, 0.8);
  {
    const k = new Kit(); pcb(k, 3.3, 1.3, 0x1b5fa8);
    standoffs(k, [[1.4, 0.45], [-1.4, -0.45]], 0.64);
    k.cyl(0.6, 0.8, BLACK, 0.7, 0, 0.4); headerRow(k, -1.45, 0.25, 3, 0, -0.254);
    finishKit('buzzer', k);
    ['VCC', 'IO', 'GND'].forEach((a, i) => anchor('buzzer', a, -1.45, 0.25 - i * 0.254, 0.92));
  }

  // Exploded-view offsets, in each part's parent space.
  const ex = (id, x, y, z) => P[id].ex.set(x, y, z);
  ex('cage', 0, 0, -46); ex('hopper', 0, 20, 0); ex('rollers', 0, 20, 0); ex('lid', 0, 44, 0); ex('ultrasonic', 0, 58, 0);
  ex('auger', 0, -2, 22); ex('dispMotor', 0, -2, -24); ex('chain', 0, 7, -22); ex('chainMotor', 18, 7, -28);
  ex('limitHome', 0, 7, -12); ex('limitEnd', 0, 7, -12); ex('reservoir', -22, 18, 0); ex('float', -38, 18, 0); ex('pipe', 0, -6, 24); ex('drinkers', 0, -12, 38);
  [1, 2, 3, 4, 5].forEach(n => { ex('tray' + n, 0, 15, 0); ex('lc' + n, 0, -5, 0); });
  ex('door', 0, 0, 44);
  const spread = { battery: 10, psu: 14, charger: 20, buck1: 24, buck2: 24, breadboard: 24, mega: 28, esp32: 32, rtc: 28, relay: 24, rocker: 4, buzzer: 18, hx1: 26, hx2: 26, hx3: 26, hx4: 26, hx5: 26 };
  Object.entries(spread).forEach(([id, d]) => {
    const b = P[id].obj.userData.base;
    ex(id, (b.x - 17) * 0.45, (b.y - 23) * 0.4, d);
  });

  // Feed piles and falling pellets used by the feed cycle.
  const feedMat = new THREE.MeshStandardMaterial({ color: 0xb89358, roughness: 0.9 });
  const piles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), feedMat, 15);
  const pellets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 6, 5), feedMat, 26);
  piles.frustumCulled = pellets.frustumCulled = false;
  piles.visible = pellets.visible = false;
  root.add(piles, pellets);

  return { root, box, carrier, doorG, cadMats, piles, pellets, HXU, TRAY_X, megaPins };
}

// Wiring. Endpoints are real pins; "via" points follow visible cable paths where the photos show them.
export function wireList(HXU) {
  const R = 0xd42a2a, K = 0x17191c, A = 0xf29a1c, Y = 0xf0cf2e, BL = 0x2f63d8, GR = 0x2aa84a, PU = 0x8e4bd0, GY = 0x9da3a6, WH = 0xeeeeea, OR = 0xe8791e, SK = 0x39b7e8;
  const b = (u, v, d) => ['b', u, v, d];
  const c = (X, Y2, Z) => ['w', X, Y2, Z];
  const W_ = [];
  const w = (layer, color, r, from, to, via = [], extra = {}) => W_.push({ layer, color, r, from, to, via, ...extra });
  const P5 = (i, part, a, via, extra) => w('v5', A, 0.075, ['breadboard', 'p' + i], [part, a], via, extra);
  const G5 = (i, part, a, via, extra) => w('v5', K, 0.075, ['breadboard', 'g' + i], [part, a], via, extra);

  // 5 V from the step-down boards to the breadboard, then out.
  w('v5', A, 0.085, ['buck1', 'OUT+'], ['breadboard', 'p0'], [b(12.6, 36.6, 2.1)]);
  w('v5', K, 0.085, ['buck1', 'OUT-'], ['breadboard', 'g0'], [b(13, 35.7, 2.1)]);
  w('v5', A, 0.085, ['buck2', 'OUT+'], ['breadboard', 'p1'], [b(12.8, 35, 2.4)]);
  w('v5', K, 0.085, ['buck2', 'OUT-'], ['breadboard', 'g1'], [b(13.3, 34.4, 2.4)]);
  P5(2, 'mega', '5V', [b(13.5, 34.2, 3.2), b(21, 34.5, 3)]);
  G5(2, 'mega', 'GND1', [b(13.8, 33.9, 3.4), b(21.5, 34.8, 3)]);
  P5(3, 'rtc', 'VCC', [b(14, 33.6, 3.6), b(19.6, 33.9, 3.8)]);
  G5(3, 'rtc', 'GND', [b(14.3, 33.3, 3.8), b(19.9, 34.2, 3.9)]);
  w('v5', BL, 0.08, ['breadboard', 'p4'], ['esp32', 'VIN'], [b(13.2, 28.5, 3.2), b(15.7, 27.3, 2.8)]);
  w('v5', GR, 0.08, ['breadboard', 'g4'], ['esp32', 'GND'], [b(14.2, 28.2, 3.4), b(16.8, 27.5, 2.9)]);
  P5(5, 'relay', 'VCC', [b(14, 27.6, 3.8), b(22.5, 26.9, 3.7)]);
  G5(5, 'relay', 'GND', [b(14.4, 27.8, 4), b(19.7, 26.2, 3.7)]);
  HXU.forEach((u, i) => {
    P5(6 + i, 'hx' + (i + 1), 'VCC', [b(u - 0.3, 27 + i * 0.1, 2.6)]);
    G5(6 + i, 'hx' + (i + 1), 'GND', [b(u - 0.7, 26.7 + i * 0.1, 2.8)]);
  });
  P5(11, 'buzzer', 'VCC', [b(7, 27, 3.2), b(5, 20, 2.6)]);
  G5(11, 'buzzer', 'GND', [b(7.4, 26.5, 3.4), b(4.5, 19, 2.6)]);
  const topExit = (i) => [b(12.2 + i * 0.1, 41, 3.2), b(12.2 + i * 0.1, 46.4, 3.2), c(243.8, 21 + i * 0.15, 106), c(240.5, 45, 124 + i * 0.2), c(222, 60.5, 127 + i * 0.2)];
  P5(12, 'ultrasonic', 'VCC', topExit(0), { dyn: 'carrier' });
  G5(12, 'ultrasonic', 'GND', topExit(1), { dyn: 'carrier' });
  P5(13, 'nextion', '5V', [b(11, 30, 7), b(12, 28, 10)], { dyn: 'door' });
  G5(13, 'nextion', 'GND', [b(11.5, 29.7, 7), b(12.5, 27.8, 10)], { dyn: 'door' });

  // Signals.
  const HXC = [SK, 0xa8e05f, 0xf28bb0, 0xffd27a, 0xbfa6ff];
  [['A0', 'A1'], ['A2', 'A3'], ['A4', 'A5'], ['A6', 'A7'], ['A8', 'A9']].forEach(([dt, sck], i) => {
    const u = HXU[i], n = 'hx' + (i + 1), lift = i * 0.12;
    w('sig', HXC[i], 0.06, ['mega', dt], [n, 'DT'], [b(16.3, 33.9, 3.1 + lift), b(15.3, 29.5, 3.3 + lift), b(u + 0.2, 25.9, 2.4 + lift * 0.5)]);
    w('sig', HXC[i], 0.06, ['mega', sck], [n, 'SCK'], [b(16.6, 34.05, 3 + lift), b(15.6, 29.5, 3.15 + lift), b(u + 0.45, 25.6, 2.25 + lift * 0.5)]);
  });
  w('sig', OR, 0.065, ['mega', 'D10'], ['relay', 'IN1'], [b(22.6, 26.9, 2.6), b(20.8, 25.2, 2.4)]);
  w('sig', Y, 0.065, ['mega', 'D9'], ['relay', 'IN2'], [b(22.8, 26.8, 2.7), b(21.05, 25.2, 2.5)]);
  w('sig', GR, 0.065, ['mega', 'D8'], ['relay', 'IN3'], [b(23, 26.7, 2.8), b(21.3, 25.2, 2.6)]);
  w('sig', SK, 0.065, ['mega', 'D11'], ['buzzer', 'IO'], [b(23.2, 26.3, 3.2), b(14, 19, 3), b(7.5, 16.3, 2)]);
  w('sig', PU, 0.07, ['mega', 'D14'], ['esp32', 'GPIO16'], [b(19.8, 26.9, 3.1), b(18.9, 23.8, 2.5)]);
  w('sig', GY, 0.07, ['esp32', 'GPIO17'], ['mega', 'D15'], [b(19.1, 23.7, 2.6), b(20, 27, 3.25)]);
  w('sig', Y, 0.07, ['mega', 'D16'], ['nextion', 'RX'], [b(19.2, 27, 3.5), b(13.5, 27.5, 6), b(13, 28.2, 10)], { dyn: 'door' });
  w('sig', BL, 0.07, ['mega', 'D17'], ['nextion', 'TX'], [b(19, 27.1, 3.6), b(13.3, 27.7, 6), b(12.8, 28, 10)], { dyn: 'door' });
  w('sig', OR, 0.065, ['mega', 'D20'], ['rtc', 'SDA'], [b(16.1, 27.3, 3.1), b(15.9, 33.7, 3.9), b(21.5, 35.5, 3.3)]);
  w('sig', 0x9a5b2e, 0.065, ['mega', 'D21'], ['rtc', 'SCL'], [b(15.8, 27.5, 3.2), b(15.6, 33.8, 4), b(21.5, 35.2, 3.4)]);
  w('sig', SK, 0.07, ['mega', 'D52'], ['ultrasonic', 'TRIG'], [b(15.6, 33.6, 3.4), ...topExit(2)], { dyn: 'carrier' });
  w('sig', GR, 0.07, ['mega', 'D50'], ['ultrasonic', 'ECHO'], [b(15.4, 33.3, 3.5), ...topExit(3)], { dyn: 'carrier' });
  const floatPath = i => [b(12.8 + i * 0.1, 41, 3.2), b(12.8 + i * 0.1, 46.4, 3.2), c(243.4, 12, 105.5), c(120, 9.8 + i * 0.25, 105.2), c(30, 9.8 + i * 0.25, 105), c(12.6, 21, 112), c(12.8, 26, 120)];
  w('sig', Y, 0.08, ['mega', 'D49'], ['float', 'a'], [b(15.7, 33.1, 3.7), ...floatPath(0)]);
  w('sig', Y, 0.08, ['breadboard', 'g14'], ['float', 'b'], floatPath(1));
  const sidePath = i => [b(6, 30.4 - i * 0.2, 4), b(-0.5, 30 - i * 0.2, 4), c(244.6, 6.5, 90 + i * 0.3), c(239.2, 8, 103.2), c(238.5, 42, 99.5 + i * 0.2)];
  w('sig', Y, 0.08, ['mega', 'D53'], ['limitHome', 'S'], [b(15, 32.8, 3.8), ...sidePath(0)]);
  w('sig', R, 0.08, ['breadboard', 'g15'], ['limitHome', 'G'], sidePath(1));
  const farPath = i => [...sidePath(2 + i), c(134, 42.6 + i * 0.25, 100.6), c(36, 44, 99.6 + i * 0.2)];
  w('sig', BL, 0.08, ['mega', 'D51'], ['limitEnd', 'S'], [b(14.9, 32.5, 3.9), ...farPath(0)]);
  w('sig', WH, 0.08, ['breadboard', 'g16'], ['limitEnd', 'G'], farPath(1));

  // Load cells: four wires per cable, leaving the floor of the box and running under the trays.
  const CELLX = { 1: 219.55, 2: 177.25, 3: 134.95, 5: 92.65, 4: 50.35 };
  const CC = [['E+', R], ['E-', K], ['A-', WH], ['A+', GR]];
  HXU.forEach((u, i) => {
    const n = i + 1, X = CELLX[n];
    CC.forEach(([a, color], j) => {
      const o = (j - 1.5) * 0.14;
      w('sig', color, 0.06, ['hx' + n, a], ['lc' + n, a], [b(u + o, 18, 1.8), b(u + o, 4, 2 + i * 0.25), b(u + o, -1, 2 + i * 0.25),
        c(243 + i * 0.3 + o, 47, 58.6 + i * 0.5), c(X + 16, 49.5 + i * 0.3 + o, 61.4 + i * 0.3), c(X + 7, 50.2 + o, 65)]);
    });
  });

  // 12 V.
  const pv = 0.13;
  w('v12', R, pv, ['psu', 'V1'], ['charger', 't5'], [b(28.4, 23, 3.8), b(28.3, 33, 3.9), b(24, 37.6, 3)]);
  w('v12', K, pv, ['psu', 'COM1'], ['charger', 't6'], [b(28.7, 23, 3.9), b(28.6, 33, 4), b(26, 37.6, 3)]);
  w('v12', R, pv, ['charger', 't1'], ['rocker', 'a'], [b(13, 38, 3.2), b(9, 41, 3.6), b(4, 42.45, 5)]);
  w('v12', R, pv, ['rocker', 'b'], ['battery', '+'], [b(4.2, 39, 4.6), b(5.8, 18, 2.4), b(8.5, 3.5, 2.2), b(16, 2, 7.6), b(19.8, 12, 5.8)]);
  w('v12', K, pv, ['charger', 't2'], ['battery', '-'], [b(13.2, 37.6, 3.4), b(6.6, 38, 3.2), b(6.5, 18, 2.5), b(9, 3.2, 2.4), b(16.5, 2.4, 8), b(26, 11.6, 8), b(32.2, 11.6, 6)]);
  const LP = ['charger', 't3'], LN = ['charger', 't4'];
  w('v12', R, 0.1, LP, ['buck1', 'IN+'], [b(19.4, 37.7, 2)]);
  w('v12', K, 0.1, LN, ['buck1', 'IN-'], [b(20, 37.4, 2)]);
  w('v12', R, 0.1, LP, ['buck2', 'IN+'], [b(19.6, 36.5, 2.2)]);
  w('v12', K, 0.1, LN, ['buck2', 'IN-'], [b(20.2, 35.6, 2.2)]);
  [1, 2, 3].forEach(n => {
    w('v12', R, 0.11, LP, ['relay', 'com' + n], [b(21, 37.9, 3.1 + n * 0.1), b(28.2, 34.2, 4.2), b(29.1, 26, 4.2 + n * 0.1), b(29.7, 19, 3.6), b(20 + n * 1.6, 18.2, 2.2)]);
  });
  const downBox = i => [b(18 + i * 0.2, 16, 7), b(16.4 + i * 0.25, 5, 7.6), b(16.4 + i * 0.25, -1, 7.6)];
  const upLeg = i => [c(247.6, 25 + i * 0.3, 54.5), c(242, 45.4 + i * 0.25, 55.5), c(241.9, 47.4 + i * 0.25, 100)];
  const runMotor = (n, i, to, extra, more = []) => w('v12', n ? R : K, 0.11, n ? ['relay', 'no' + n] : LN, to, [...(n ? [b(20 + n * 1.6, 18, 2.4)] : [b(21, 37.2, 3.5), b(28.4, 34, 4.5), b(29.3, 26, 4.5), b(29.9, 18.8, 4)]), ...downBox(i), ...upLeg(i), ...more], extra);
  runMotor(1, 0, ['chainMotor', 'M+'], {}, [c(241.5, 63, 108.8)]);
  runMotor(2, 1, ['chainMotor', 'M-'], {}, [c(241.8, 63.2, 110)]);
  const dispVia = i => [c(239 + i * 0.3, 63, 125 + i * 0.3), c(218, 79, 106), c(211, 75.6, 82)];
  runMotor(3, 2, ['dispMotor', 'M+'], { dyn: 'carrier' }, dispVia(0));
  runMotor(0, 3, ['dispMotor', 'M-'], { dyn: 'carrier' }, dispVia(1));
  return W_;
}
