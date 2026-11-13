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
  // Trays are thin hollow half-pipes (open on top), built from the CAD's width, depth and tray boundaries.
  const TRAY_START = { 1: 29.2, 2: 71.5, 3: 113.8, 5: 156.1, 4: 198.4 };
  const R_OUT = 5.055, R_IN = 4.8, TRAY_CZ = 73.755, TOP_Z = 74.5;
  {
    const a = Math.asin((TOP_Z - TRAY_CZ) / R_OUT), b = Math.asin((TOP_Z - TRAY_CZ) / R_IN);
    const shape = new THREE.Shape();
    shape.absarc(0, TRAY_CZ, R_OUT, a, -Math.PI - a, true);
    shape.absarc(0, TRAY_CZ, R_IN, -Math.PI - b, b, false);
    [1, 2, 3, 4, 5].forEach(n => {
      cad['tray' + n] = new THREE.ExtrudeGeometry(shape, { depth: 42.2, bevelEnabled: false, curveSegments: 30 }).rotateY(Math.PI / 2).translate(TRAY_START[n] + 0.05 - 134.3, 0, -8.9);
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

  // Tray rims and thin end caps: the caps are see-through, so the trays read as hollow from the end too.
  {
    const a = Math.asin((TOP_Z - TRAY_CZ) / R_IN), cap = new THREE.Shape();
    cap.absarc(0, TRAY_CZ, R_IN, a, -Math.PI - a, true); cap.closePath();
    const capMat = new THREE.MeshStandardMaterial({ color: 0xf0c48a, transparent: true, opacity: 0.32, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    [1, 2, 3, 4, 5].forEach(n => {
      const id = 'tray' + n, X0 = TRAY_START[n] + 0.05, X1 = X0 + 42.2, k = new Kit(), q0 = W((X0 + X1) / 2, 45.3, TOP_Z + 0.05), q1 = W((X0 + X1) / 2, 55.1, TOP_Z + 0.05);
      k.box(42.2, 0.14, 0.34, 0xd9b27c, q0.x, q0.y, q0.z).box(42.2, 0.14, 0.34, 0xd9b27c, q1.x, q1.y, q1.z);
      addMesh(id, k.geometry(), kitMat, false);
      cadMats[id].side = THREE.DoubleSide; cadMats[id].flatShading = false;
      const caps = [X0, X1].map(X => new THREE.ShapeGeometry(cap, 24).rotateY(Math.PI / 2).translate(X - 134.3, 0, -8.9));
      addMesh(id, mergeGeometries(caps), capMat, false).renderOrder = 1;
    });
  }

  // The wire grid and sloped floor are real 3D lines in the DWG. They sit 5.5 cm and 0.93 cm off the solids, so the
  // data file moves them onto the cage they belong to. The curved lip is the DWG's extruded surface, which the STL lacks.
  {
    cadMats.cage.side = THREE.DoubleSide;
    const k = new Kit(), up = new V3(0, 1, 0), q = new THREE.Quaternion(), a = new V3(), b = new V3(), d = new V3();
    const rods = (arr, r, c) => {
      for (let i = 0; i < arr.length; i += 6) {
        a.set(arr[i], arr[i + 1], arr[i + 2]); b.set(arr[i + 3], arr[i + 4], arr[i + 5]);
        d.subVectors(b, a); const len = d.length(); if (len < 1e-3) continue;
        const g = new THREE.CylinderGeometry(r, r, len, 4, 1, true);
        g.applyQuaternion(q.setFromUnitVectors(up, d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        k.add(g, c);
      }
    };
    rods(cad.lines.walls, 0.14, 0xa9b0b2); rods(cad.lines.floor, 0.13, 0x2fb24a);
    addMesh('cage', k.geometry(), kitMat, false);
    const prof = [[50.26, 61.84], [56.28, 61.84], [57.1, 62.04], [57.87, 62.44], [58.53, 63], [59.03, 63.69], [59.15, 67]];
    const pos = [], uv = [], idx = [];
    let run = 0;
    prof.forEach(([Y, Z], i) => {
      if (i) run += Math.hypot(Y - prof[i - 1][0], Z - prof[i - 1][1]);
      const p0 = W(30, Y, Z), p1 = W(240.5, Y, Z);
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); uv.push(0, run / 1.8, 210.5 / 1.8, run / 1.8);
      if (i) { const n = i * 2; idx.push(n - 2, n - 1, n + 1, n - 2, n + 1, n); }
    });
    const lip = new THREE.BufferGeometry();
    lip.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lip.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); lip.setIndex(idx);
    const c2 = document.createElement('canvas'); c2.width = c2.height = 64;
    const x = c2.getContext('2d'); x.strokeStyle = '#2fb24a'; x.lineWidth = 9;
    x.beginPath(); x.moveTo(0, 32); x.lineTo(32, 0); x.lineTo(64, 32); x.lineTo(32, 64); x.closePath(); x.stroke();
    const t = new THREE.CanvasTexture(c2); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    addMesh('cage', lip, new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }), false);
  }

  // --- Field parts drawn from photos and datasheets ---
  // Ultrasonic sensor: board on top of the cover, in a sealed clear window; its two cans point down through it.
  attach('ultrasonic', carrier, W(208.8, 60.8, 117.5));
  finishKit('ultrasonic', new Kit().box(4.5, 0.16, 2, 0x2559b0).cyl(0.8, 1.5, SILVER, -1.3, -0.85, 0, 'y').cyl(0.8, 1.5, SILVER, 1.3, -0.85, 0, 'y')
    .box(0.8, 0.12, 0.5, BLACK, -1, 0.14, 0).box(0.8, 0.12, 0.5, BLACK, 1, 0.14, 0).box(1.05, 0.55, 0.3, BLACK, 0, 0.36, 0.85)
    .box(7.4, 0.08, 7.4, 0x14171a, 0, -0.74, 0).box(8.8, 0.18, 0.45, 0x0c0d0f, 0, -0.72, 4.2).box(8.8, 0.18, 0.45, 0x0c0d0f, 0, -0.72, -4.2).box(0.45, 0.18, 8.8, 0x0c0d0f, 4.2, -0.72, 0).box(0.45, 0.18, 8.8, 0x0c0d0f, -4.2, -0.72, 0));
  ['VCC', 'TRIG', 'ECHO', 'GND'].forEach((a, i) => anchor('ultrasonic', a, -0.38 + i * 0.254, 0.7, 0.85, 0, 1, 0));
  {
    const base = P.ultrasonic.obj.position;
    addMesh('ultrasonic', cad.plate.translate(-base.x, -base.y, -base.z), new THREE.MeshStandardMaterial({ color: 0xcfe0e6, transparent: true, opacity: 0.45, roughness: 0.15 }), false);
    const clips = new Kit();
    [[209, 53], [209, 47.3], [216, 47.3]].forEach(([X, Y]) => { const q = W(X, Y, 116.75); clips.box(1.3, 0.35, 1.3, BLACK, q.x, q.y, q.z); });
    addMesh('lid', clips.geometry(), kitMat, false);
  }

  // Dispenser: grey worm gearbox and hanging black motor, joined with white lever connectors.
  attach('dispMotor', carrier, W(208.85, 71.5, 88.8));
  {
    const k = new Kit().box(5.5, 8, 4.2, 0x8c9093).cyl(0.65, 1.8, SILVER, 0, 0, 2.9).cyl(2.1, 8, BLACK, 0, -8, 0, 'y');
    [[-2, 3], [2, 3], [-2, -3], [2, -3]].forEach(([x, y]) => k.cyl(0.45, 0.3, 0x6a6e70, x, y, -2.2));
    k.box(3.2, 1.2, 1.5, 0xf2f2ee, 0, -9.8, -2.9).cyl(0.55, 1.1, 0xc4322d, 0, -11, -2.2, 'y');
    finishKit('dispMotor', k);
    anchor('dispMotor', 'M+', -0.8, -9.15, -2.9, 0, 1, 0);
    anchor('dispMotor', 'M-', 0.8, -9.15, -2.9, 0, 1, 0);
  }

  // Chain motor (photo): grey gearbox behind the sprocket, black motor lying along the top of the control box,
  // its leads going to a white lever connector on the box roof.
  attach('chainMotor', root, W(241, 40, 109.4));
  finishKit('chainMotor', new Kit().box(6, 6, 4, 0x8c9093, -6, 0, 0).cyl(0.7, 2.6, SILVER, -6.6, 0, -3.3).cyl(2.6, 11, BLACK, 2.5, 0, 0, 'x').cyl(2.62, 0.7, 0x9a9fa3, 8.2, 0, 0, 'x')
    .box(1.4, 2.4, 3.2, 0xb6bbbe, -6, -4.2, 0).box(1.7, 0.8, 2.2, 0xf2f2ee, 6, -5.95, -1.6));
  anchor('chainMotor', 'M+', 8.95, 0, 0.5, 1, 0, 0);
  anchor('chainMotor', 'M-', 8.95, 0, -0.5, 1, 0, 0);

  // Two lever microswitches, one at each end of the rail, on small steel brackets.
  const limit = (id, X, dir, beamSide) => {
    attach(id, root, W(X, 52, 106.2));
    const k = new Kit().box(2.8, 1.6, 1, BLACK).box(0.5, 0.2, 0.7, 0xc23b2b, dir * 1.6, 0.4, 0).box(3, 0.14, 0.6, SILVER, dir * 2.7, 0.5, 0).cyl(0.3, 0.6, 0xaab0b4, dir * 4.1, 0.65, 0)
      .box(4.2, 0.2, 2.6, 0xc4c9cb, beamSide * 0.6, -1, 0).box(0.3, 1.4, 2.6, 0xc4c9cb, beamSide * 2.6, -1.6, 0);
    [-1, 1].forEach(o => k.cyl(0.22, 0.12, SILVER, o * 0.9, 0, 0.55));
    finishKit(id, k);
    anchor(id, 'S', -0.4, -0.9, 0, 0, -1, 0); anchor(id, 'G', 0.4, -0.9, 0, 0, -1, 0);
  };
  limit('limitHome', 31.6, 1, -1);
  limit('limitEnd', 238.2, -1, 1);

  const TRAY_X = { 1: 50.35, 2: 92.65, 3: 134.95, 5: 177.25, 4: 219.55 };
  [1, 2, 3, 4, 5].forEach(n => {
    const id = 'lc' + n;
    // Crossways under the tray: free end under the tray's centre (Y 50.2), fixed end on a post at the back edge.
    attach(id, root, W(TRAY_X[n], 46.2, 66.6)).rotation.y = Math.PI;
    finishKit(id, new Kit().box(1.27, 1.27, 8, 0xb9bdc1).box(1.3, 1.3, 1.5, 0xf0efe9).box(1.6, 1.3, 2, 0x707478, 0, 1.3, 2.9).box(1.6, 1, 2, 0x707478, 0, -1.1, -2.9).cyl(0.3, 3.2, 0x9aa0a4, 0, -3.1, -2.9, 'y').box(1, 0.5, 0.7, BLACK, 0, 0, -4.2));
    ['E+', 'E-', 'A-', 'A+'].forEach((a, i) => anchor(id, a, -0.33 + i * 0.22, 0.1, -4.55, 0, 0, -1));
  });

  // Float switch: white plastic nut low on the reservoir's front wall, two yellow twisted wires.
  attach('float', root, W(22, 41.3, 120));
  finishKit('float', new Kit().cyl(1.5, 0.5, 0xf1f1ec, 0, 0, -0.25, 'z', 6).cyl(0.75, 0.5, 0xf1f1ec, 0, 0, -0.6).cyl(0.4, 6, 0xdddddd, 0, 0, 3).cyl(1.5, 3, 0xf1f1ec, 0, -0.6, 7, 'y'));
  anchor('float', 'a', -0.15, -0.1, -0.85, 0, 0, -1); anchor('float', 'b', 0.15, -0.1, -0.85, 0, 0, -1);

  // Sprockets (35B 15T in the photos) at both ends of the chain.
  {
    const k = new Kit();
    [34.1, 234.4].forEach(X => { const q = W(X, 44.55, 108.95); k.cyl(5, 0.4, 0x96683c, q.x, q.y, q.z).cyl(1.6, 0.9, 0xb9bdc1, q.x, q.y, q.z).cyl(0.7, 2.4, 0xc29a58, q.x, q.y, q.z); });
    addMesh('chain', k.geometry(), kitMat, false);
  }

  // Grey spiral wrap: along the end beam and under the front rail, held by clips. "Covers" lifts it away.
  {
    const k = new Kit(), YE = 43.4, Y = 77, Z = 102.3, XE = 242.4, X0 = 60;
    const e = W(XE, (YE + Y) / 2, Z), m = W((X0 + XE) / 2, Y, Z);
    k.cyl(0.5, Y - YE, 0xa7aeb3, e.x, e.y, e.z, 'z', 8).cyl(0.5, XE - X0, 0xa7aeb3, m.x, m.y, m.z, 'x', 8);
    for (let q = YE; q <= Y; q += 2.4) { const r = W(XE, q, Z); k.cyl(0.56, 0.5, 0x858d93, r.x, r.y, r.z, 'z', 8); }
    for (let X = X0; X <= XE; X += 2.4) { const r = W(X, Y, Z); k.cyl(0.56, 0.5, 0x858d93, r.x, r.y, r.z, 'x', 8); }
    for (let X = X0 + 8; X < XE; X += 32) { const r = W(X, Y, Z); k.box(1.2, 1.2, 0.3, BLACK, r.x, r.y + 0.75, r.z - 0.3); }
    const w = addMesh('frame', k.geometry(), kitMat, false); w.userData.wall = true;
    const c = W(150, 77, 102.3);
    anchor('frame', 'clamp', c.x, c.y, c.z, -1, 0, 0);
    anchor('dispMotor', 'wrapEnd', 5.15, -2.8, -6.5, 0, 1, 0);
  }

  // --- Control box. Local axes: x across (Y in CAD), y up, z from back plate toward the door. ---
  const box = new THREE.Group();
  box.position.copy(W(240.6, 9, 57)); box.rotation.y = Math.PI / 2;
  box.userData.base = box.position.clone();
  root.add(box);

  attach('shell', box);
  const steel = 0xb6bbbe;
  {
    const k = new Kit().box(34, 46, 0.15, steel, 17, 23, 0.075);
    [[335, 585], [190, 850], [350, 950], [700, 850], [405, 1280], [260, 1430], [535, 1520], [895, 1530]].forEach(([px, py]) => k.box(1.3, 1.3, 0.3, BLACK, 21 + (px - 962) / 36.9, 25.8 + (885 - py) / 36.9, 0.25));
    k.cyl(2, 0.3, BLACK, 4.2, 0.2, 3.8, 'y');
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
    const screen = new THREE.TextureLoader().load('img/nextion-home.jpg', () => dispatchEvent(new Event('hfp-render')));
    screen.colorSpace = THREE.SRGBColorSpace; screen.anisotropy = 4;
    addMesh('nextion', new THREE.PlaneGeometry(17.6, 9.6).translate(0, 0, 0.65), new THREE.MeshBasicMaterial({ map: screen }));
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
  module('mega', 21, 25.8, 1.1);
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

  module('esp32', 18.2, 20.8, 0.9);
  {
    const k = new Kit(); pcb(k, 5.6, 3.3, 0xf2f1ea);
    standoffs(k, [[2.5, 1.4], [-2.5, 1.4], [2.5, -1.4], [-2.5, -1.4]], 0.74);
    k.box(5.2, 2.8, 0.16, 0x1a1c1f, 0, 0, 0.75).box(1.8, 1.6, 0.3, SILVER, 1.55, 0, 0.98).box(0.7, 1.7, 0.1, 0x101215, 2.5, 0, 0.87).box(0.85, 0.9, 0.3, SILVER, -2.5, 0, 0.98).box(0.4, 0.4, 0.1, 0x303236, -1, 0.5, 0.88);
    headerRow(k, -2.286, 1.27, 19, 0.254, 0, BLACK, 0.67); headerRow(k, -2.286, -1.27, 19, 0.254, 0, BLACK, 0.67);
    finishKit('esp32', k);
    const x = i => -2.286 + i * 0.254;
    anchor('esp32', 'VIN', x(0), 1.27, 0.92); anchor('esp32', 'GND', x(5), 1.27, 0.92);
    anchor('esp32', 'GPIO16', x(7), -1.27, 0.92); anchor('esp32', 'GPIO17', x(8), -1.27, 0.92);
  }

  module('rtc', 23.8, 31.4, 0.8);
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
  buck('buck1', 15.6, 33.05); buck('buck2', 15.8, 30.7);

  module('breadboard', 9.8, 27.7, 0.2);
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

  const HXU = [8.1, 10.3, 12.5, 14.7, 16.9];
  HXU.forEach((u, i) => {
    const id = 'hx' + (i + 1);
    module(id, u, 17.4, 0.8);
    const k = new Kit(); pcb(k, 2.1, 3.3, 0x1f7a3c);
    standoffs(k, [[0.85, 1.4], [-0.85, 1.4], [0.85, -1.4], [-0.85, -1.4]], 0.64);
    k.box(0.65, 1, 0.16, BLACK, 0, 0, 0.08);
    headerRow(k, -0.38, 1.45, 4, 0.254, 0, 0xeeeeea, 0.5); headerRow(k, -0.635, -1.45, 6, 0.254, 0, 0xeeeeea, 0.5);
    finishKit(id, k);
    ['GND', 'DT', 'SCK', 'VCC'].forEach((a, j) => anchor(id, a, -0.38 + j * 0.254, 1.45, 0.6));
    ['E+', 'E-', 'A-', 'A+'].forEach((a, j) => anchor(id, a, -0.635 + j * 0.254, -1.45, 0.6));
  });

  module('relay', 26.2, 17.8, 1);
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

  module('charger', 19.5, 40.8, 0.2);
  {
    const k = new Kit().box(12.7, 8.8, 3.2, 0x14171b, 0, 0, 1.6).box(14.1, 8.4, 0.5, 0x14171b, 0, 0, 0.3).box(11.6, 5.4, 0.08, 0x1d57c4, 0, 1.3, 3.22).box(3.6, 2.8, 0.08, 0x8fa3a8, -0.3, 1.5, 3.27).box(11.6, 2.5, 0.08, 0x202429, 0, -3.1, 3.22);
    [-1.6, 0, 1.6].forEach(x => k.cyl(0.36, 0.16, 0x0d0f12, x - 0.3, -0.45, 3.3));
    [[4.7, 2.6], [4.7, 1.8]].forEach(([x, y]) => k.box(1.3, 0.55, 0.1, SILVER, x, y, 3.3));
    [[-5, 2.5], [-3.9, 2.5], [-5, 0.8], [-3.9, 0.8]].forEach(([x, y]) => k.box(0.85, 1.25, 0.06, 0xdfe7f3, x, y, 3.28));
    [[-6.5, 3.6], [6.5, 3.6], [-6.5, -3.6], [6.5, -3.6]].forEach(([x, y]) => k.cyl(0.3, 0.9, SILVER, x, y, 0.9));
    for (let i = 0; i < 6; i++) k.cyl(0.3, 0.14, SILVER, -2.7 + i * 1.08, -3.2, 3.28);
    finishKit('charger', k);
    for (let i = 0; i < 6; i++) anchor('charger', 't' + (i + 1), -2.7 + i * 1.08, -4.42, 1.3, 0, -1, 0);
  }

  module('psu', 31.75, 35.9, 5.9);
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

  module('battery', 26.2, 4.95, 3.6);
  finishKit('battery', new Kit().box(15.1, 9.4, 6.5, 0x1c1e20).box(14.6, 0.5, 6, 0x101214, 0, 4.9, 0).box(0.7, 0.35, 0.8, 0xc62d29, -6.2, 5.3, 1.8).box(0.7, 0.35, 0.8, 0x2a2c2e, 6.2, 5.3, 1.8));
  anchor('battery', '+', -6.2, 5.5, 1.8, 0, 1, 0); anchor('battery', '-', 6.2, 5.5, 1.8, 0, 1, 0);

  module('rocker', 0.15, 36, 5.5);
  finishKit('rocker', new Kit().box(2.2, 2, 3, BLACK, 1.1, 0, 0).box(0.3, 2.5, 3.4, BLACK, -0.15, 0, 0).box(0.55, 2, 2.8, 0xd5302a, -0.5, 0, 0).box(0.8, 0.14, 0.5, 0xd9b53a, 2.5, 0.45, 0).box(0.8, 0.14, 0.5, 0xd9b53a, 2.5, -0.45, 0));
  anchor('rocker', 'a', 2.9, 0.45, 0, 1, 0, 0); anchor('rocker', 'b', 2.9, -0.45, 0, 1, 0, 0);

  module('buzzer', 19.5, 15.9, 0.2);
  {
    const k = new Kit().cyl(1.35, 1.7, 0xefe9d8, 0, 0, 0.85, 'z', 18).cyl(1.5, 0.15, 0xe2dcc9, 0, 0, 0.1, 'z', 18).cyl(0.22, 2.3, SILVER, 0, 0, 1.2, 'z').box(0.5, 0.5, 0.3, 0x1c1e20, -1.25, 0.4, 0.3);
    finishKit('buzzer', k);
    ['VCC', 'IO', 'GND'].forEach((a, i) => anchor('buzzer', a, -1.3, 0.45 - i * 0.45, 0.5));
  }

  // Exploded-view offsets, in each part's parent space.
  const ex = (id, x, y, z) => P[id].ex.set(x, y, z);
  ex('cage', 0, 0, -46); ex('hopper', 0, 20, 0); ex('rollers', 0, 20, 0); ex('lid', 0, 52, 0); ex('ultrasonic', 0, 28, 0);
  ex('auger', 0, -2, 22); ex('dispMotor', 0, -2, -24); ex('chain', 0, 7, -22); ex('chainMotor', 18, 7, -28);
  ex('limitHome', 0, 7, -12); ex('limitEnd', 0, 7, -12); ex('reservoir', -22, 18, 0); ex('float', -22, 18, -16); ex('pipe', 0, -6, 24); ex('drinkers', 0, -12, 38);
  [1, 2, 3, 4, 5].forEach(n => { ex('tray' + n, 0, 15, 0); ex('lc' + n, 0, -5, 0); });
  ex('door', 0, 0, 44);
  const spread = { battery: 10, psu: 14, charger: 20, buck1: 24, buck2: 24, breadboard: 24, mega: 28, esp32: 32, rtc: 28, relay: 24, rocker: 4, buzzer: 18, hx1: 26, hx2: 26, hx3: 26, hx4: 26, hx5: 26 };
  Object.entries(spread).forEach(([id, d]) => {
    const b = P[id].obj.userData.base;
    ex(id, (b.x - 17) * 0.45, (b.y - 23) * 0.4, d);
  });

  parts.forEach(p => { p.obj.userData.ex = p.ex; });
  box.userData.ex = new V3(34, 0, 0);

  // Feed piles and falling pellets used by the feed cycle.
  const feedMat = new THREE.MeshStandardMaterial({ color: 0xb89358, roughness: 0.9 });
  const piles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), feedMat, 15);
  const pellets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 6, 5), feedMat, 26);
  piles.frustumCulled = pellets.frustumCulled = false;
  piles.visible = pellets.visible = false;
  root.add(piles, pellets);

  return { root, box, carrier, doorG, cadMats, piles, pellets, HXU, TRAY_X, megaPins };
}
