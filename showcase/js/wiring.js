// Wiring, laid out as tidy bundles along the machine's real cable paths (from the photos): out through the hole in the
// box floor, up the box corner, along the front rail inside the spiral wrap. Endpoints are the real pins.
// Steps move along one control-box axis at a time (u across, v up, d toward the door); 'B' means the far end's value.
// w / c / dr are points in CAD coordinates, on the moving hopper (CAD coordinates at rest), and on the door.
export function wireList(HXU) {
  const R = 0xd42a2a, K = 0x17191c, A = 0xf29a1c, Y = 0xf0cf2e, BL = 0x2f63d8, GR = 0x2aa84a, PU = 0x8e4bd0, GY = 0x9da3a6, WH = 0xeeeeea, OR = 0xe8791e, SK = 0x39b7e8;
  const out = [], count = {};
  const w = (layer, color, r, from, to, steps, extra = {}) => out.push({ layer, color, r, from, to, steps, ...extra });
  const lane = k => { count[k] = (count[k] || 0) + 1; return count[k] - 1; };
  const X = d => 240.6 + d, Y_ = u => 9 + u;
  const V5 = 0.075, FLOOR = -0.6, RY = 44.75, RZ = 101.8, CLAMP = 72;

  // Lanes through the floor hole.
  const hole = i => ({ u: 4.6 + (i % 5) * 0.22, d: 3.6 + Math.floor(i / 5) * 0.3 });
  // Under the floor, up the corner between box and cage, then onto the front rail. Wires sit in a ring so the wrap hides them.
  const toRail = (e, i) => {
    const t = i * Math.PI * 2 / 10, a = 0.24 * Math.cos(t), b = 0.24 * Math.sin(t);
    const y = RY + a, z = RZ + b, yc = 43.4 + b * 0.3;
    return { y, z, steps: [{ w: [X(e.d), Y_(e.u), 55.4] }, { w: [X(e.d), yc, 55.4] }, { w: [241.2 + a, yc, 55.4] }, { w: [241.2 + a, yc, z] }, { w: [239.9 + a, yc, z] }, { w: [239.9 + a, y, z] }] };
  };

  // 5 V: step-down boards to the breadboard, then one bundle per destination.
  [['buck1', 'OUT+', 'p0', A], ['buck1', 'OUT-', 'g0', K], ['buck2', 'OUT+', 'p1', A], ['buck2', 'OUT-', 'g1', K]].forEach(([b, a, t, c], i) =>
    w('v5', c, 0.085, [b, a], ['breadboard', t], [{ d: 2.2 }, { u: 12.7 - i * 0.2 }, { v: 'B' }, { u: 'B' }]));
  const five = (i, part, a, gnd, steps, extra, color) => w('v5', color || (gnd ? K : A), V5, ['breadboard', (gnd ? 'g' : 'p') + i], [part, a], steps, extra);
  const vl = () => 12.2 + lane('vl') * 0.18;
  five(2, 'mega', '5V', false, [{ d: 4 }, { u: vl() }, { v: 28.62 }, { u: 'B' }, { v: 'B' }]);
  five(2, 'mega', 'GND1', true, [{ d: 4.15 }, { u: vl() }, { v: 28.77 }, { u: 'B' }, { v: 'B' }]);
  five(3, 'rtc', 'VCC', false, [{ d: 4.3 }, { u: vl() }, { v: 28.95 }, { u: 21.6 }, { v: 'B' }, { u: 'B' }]);
  five(3, 'rtc', 'GND', true, [{ d: 4.45 }, { u: vl() }, { v: 29.1 }, { u: 21.4 }, { v: 'B' }, { u: 'B' }]);
  five(4, 'esp32', 'VIN', false, [{ d: 3.4 }, { u: vl() }, { v: 22.8 }, { u: 'B' }, { v: 'B' }], {}, BL);
  five(4, 'esp32', 'GND', true, [{ d: 3.55 }, { u: vl() }, { v: 22.95 }, { u: 'B' }, { v: 'B' }], {}, GR);
  five(5, 'relay', 'VCC', false, [{ d: 3.7 }, { u: vl() }, { v: 22.65 }, { u: 'B' }, { v: 'B' }]);
  five(5, 'relay', 'GND', true, [{ d: 3.85 }, { u: vl() }, { v: 22.5 }, { u: 'B' }, { v: 'B' }]);
  HXU.forEach((u, i) => {
    const n = 'hx' + (i + 1);
    five(6 + i, n, 'VCC', false, [{ d: 3 }, { u: vl() }, { v: 19.2 + i * 0.1 }, { u: 'B' }, { v: 'B' }]);
    five(6 + i, n, 'GND', true, [{ d: 3.12 }, { u: vl() }, { v: 19.72 + i * 0.1 }, { u: 'B' }, { v: 'B' }]);
  });
  five(11, 'buzzer', 'VCC', false, [{ d: 3.2 }, { u: 6.9 }, { v: 14.6 }, { u: 'B' }, { v: 'B' }]);
  five(11, 'buzzer', 'GND', true, [{ d: 3.35 }, { u: 6.7 }, { v: 14.8 }, { u: 'B' }, { v: 'B' }]);

  // Screen: one bundle across the hinge and along the door.
  const door = (i, x) => [{ v: 27.3 + i * 0.13 }, { u: 0.9 + i * 0.13 }, { d: 12.2 }, { dr: [0.9 + i * 0.13, 27.3 + i * 0.13, -1.95] }, { dr: [x, 27.3 + i * 0.13, -1.95] }];
  five(13, 'nextion', '5V', false, [{ d: 4.8 }, { u: 6.5 }, ...door(0, 19.1)], { dyn: 'door' });
  five(13, 'nextion', 'GND', true, [{ d: 4.95 }, { u: 6.35 }, ...door(1, 20.9)], { dyn: 'door' });
  w('sig', Y, 0.07, ['mega', 'D16'], ['nextion', 'RX'], [{ d: 5.1 }, ...door(2, 20.3)], { dyn: 'door' });
  w('sig', BL, 0.07, ['mega', 'D17'], ['nextion', 'TX'], [{ d: 5.25 }, ...door(3, 19.7)], { dyn: 'door' });

  // Scales: a ten-wire bus from the analog header around to the HX711 row.
  const HXC = [SK, 0xa8e05f, 0xf28bb0, 0xffd27a, 0xbfa6ff];
  [['A0', 'A1'], ['A2', 'A3'], ['A4', 'A5'], ['A6', 'A7'], ['A8', 'A9']].forEach(([dt, sck], i) => {
    const n = 'hx' + (i + 1);
    [[dt, 'DT'], [sck, 'SCK']].forEach(([m, a], j) => {
      const k = i * 2 + j;
      w('sig', HXC[i], 0.06, ['mega', m], [n, a], [{ d: 3.6 }, { v: 28.4 + k * 0.03 }, { u: 13.9 + k * 0.14 }, { v: 20.35 + k * 0.13 }, { u: 'B' }, { v: 'B' }]);
    });
  });

  // Short ribbons near the Mega.
  [['D10', 'IN1', OR], ['D9', 'IN2', Y], ['D8', 'IN3', GR]].forEach(([m, a, c], i) =>
    w('sig', c, 0.065, ['mega', m], ['relay', a], [{ d: 3.1 + i * 0.12 }, { v: 21.7 - i * 0.14 }, { u: 'B' }, { v: 'B' }]));
  w('sig', SK, 0.065, ['mega', 'D11'], ['buzzer', 'IO'], [{ d: 3.4 }, { v: 14.3 }, { u: 'B' }, { v: 'B' }]);
  w('sig', PU, 0.07, ['mega', 'D14'], ['esp32', 'GPIO16'], [{ d: 2.9 }, { v: 19.95 }, { u: 'B' }, { v: 'B' }]);
  w('sig', GY, 0.07, ['esp32', 'GPIO17'], ['mega', 'D15'], [{ d: 3.05 }, { u: 'B' }, { v: 'B' }]);
  w('sig', OR, 0.065, ['mega', 'D20'], ['rtc', 'SDA'], [{ d: 4.6 }, { v: 22.8 }, { u: 15.4 }, { v: 29.25 }, { u: 21.2 }, { v: 'B' }, { u: 'B' }]);
  w('sig', 0x9a5b2e, 0.065, ['mega', 'D21'], ['rtc', 'SCL'], [{ d: 4.75 }, { v: 22.65 }, { u: 15.25 }, { v: 29.4 }, { u: 21 }, { v: 'B' }, { u: 'B' }]);

  // Everything that leaves the box goes through the floor hole.
  const field = (layer, color, r, from, to, build, opts = {}) => {
    const i = lane('hole'), e = hole(i), run = toRail(e, i);
    const start = opts.relay ? [{ v: 13.4 - opts.relay * 0.2 }, { d: e.d }, { u: e.u }, { v: FLOOR }] : [{ d: e.d }, ...(opts.v ? [{ v: opts.v + i * 0.05 }] : []), { u: e.u }, { v: FLOOR }];
    w(layer, color, r, from, to, [...start, ...run.steps, ...build(run, i)], opts.extra || {});
  };
  // Level sensor: to the clamp, across to the hopper, up and over the hinge edge of the cover, then to the pins.
  const sensor = j => run => {
    const px = 208.42 + j * 0.254, Yl = 47 + j * 0.13, Zl = 118.65;
    return [{ w: [CLAMP, run.y, run.z] }, { c: [226.5, run.y, run.z] }, { c: [226.5, run.y, Zl] }, { c: [226.5, Yl, Zl] }, { c: [px, Yl, Zl] }];
  };
  const HOP = { extra: { dyn: 'carrier' }, v: 28.5 };
  field('v5', A, V5, ['breadboard', 'p12'], ['ultrasonic', 'VCC'], sensor(0), { extra: { dyn: 'carrier' } });
  field('v5', K, V5, ['breadboard', 'g12'], ['ultrasonic', 'GND'], sensor(3), { extra: { dyn: 'carrier' } });
  field('sig', SK, 0.07, ['mega', 'D52'], ['ultrasonic', 'TRIG'], sensor(1), HOP);
  field('sig', GR, 0.07, ['mega', 'D50'], ['ultrasonic', 'ECHO'], sensor(2), HOP);

  // Reservoir end: float and the tray 1 limit switch. The tray 4 limit switch branches off near the box.
  const floatRun = ax => run => [{ w: [ax, run.y, run.z] }, { w: [ax, run.y, 119.9] }];
  field('sig', Y, 0.08, ['mega', 'D49'], ['float', 'a'], floatRun(21.85), { v: 28.5 });
  field('sig', Y, 0.08, ['breadboard', 'g14'], ['float', 'b'], floatRun(22.15));
  const limitRun = ax => run => [{ w: [ax, run.y, run.z] }, { w: [ax, 52, run.z] }];
  field('sig', Y, 0.08, ['mega', 'D53'], ['limitHome', 'S'], limitRun(31.2), { v: 28.5 });
  field('sig', R, 0.08, ['breadboard', 'g15'], ['limitHome', 'G'], limitRun(32));
  field('sig', BL, 0.08, ['mega', 'D51'], ['limitEnd', 'S'], limitRun(237.8), { v: 28.5 });
  field('sig', WH, 0.08, ['breadboard', 'g16'], ['limitEnd', 'G'], limitRun(238.6));

  // 12 V inside the box. Charger terminals follow the printed icons: input, battery, load.
  const LP = ['charger', 't5'], LN = ['charger', 't6'];
  w('v12', R, 0.13, ['psu', 'V1'], ['charger', 't1'], [{ d: 6.2 }, { v: 35.4 }, { u: 'B' }, { d: 'B' }]);
  w('v12', K, 0.13, ['psu', 'COM1'], ['charger', 't2'], [{ d: 5.85 }, { v: 35.1 }, { u: 'B' }, { d: 'B' }]);
  w('v12', R, 0.13, ['charger', 't3'], ['rocker', 'a'], [{ d: 3.2 }, { u: 3.75 }, { d: 'B' }, { v: 'B' }]);
  w('v12', R, 0.13, ['rocker', 'b'], ['battery', '+'], [{ u: 3.3 }, { v: 11.25 }, { u: 'B' }, { d: 'B' }]);
  w('v12', K, 0.13, ['charger', 't4'], ['battery', '-'], [{ d: 3.5 }, { u: 3.9 }, { v: 11.65 }, { u: 'B' }, { d: 'B' }]);
  w('v12', R, 0.1, LP, ['buck1', 'IN+'], [{ d: 2.2 }, { v: 'B' }, { u: 'B' }]);
  w('v12', R, 0.1, LP, ['buck2', 'IN+'], [{ d: 2.4 }, { u: 20.4 }, { v: 'B' }, { u: 'B' }]);
  w('v12', K, 0.1, LN, ['buck1', 'IN-'], [{ d: 2.6 }, { u: 19.6 }, { v: 'B' }, { u: 'B' }]);
  w('v12', K, 0.1, LN, ['buck2', 'IN-'], [{ d: 2.8 }, { u: 19.2 }, { v: 'B' }, { u: 'B' }]);
  [1, 2, 3].forEach(n => w('v12', R, 0.11, LP, ['relay', 'com' + n], [{ d: 4.9 + n * 0.28 }, { u: 28.2 - (n - 1) * 0.28 }, { v: 14.7 - n * 0.2 }, { u: 'B' }, { d: 'B' }]));

  // Chain motor: up the box corner, across the roof, through the white connector to the motor's back end.
  const chain = (n, a, py) => {
    const i = lane('hole'), e = hole(i), xc = 241.5 + n * 0.25, yc = 43.2;
    w('v12', R, 0.11, ['relay', 'no' + n], ['chainMotor', a], [{ v: 13.4 - n * 0.2 }, { d: e.d }, { u: e.u }, { v: FLOOR },
      { w: [X(e.d), Y_(e.u), 55.4] }, { w: [X(e.d), yc, 55.4] }, { w: [xc, yc, 55.4] }, { w: [xc, yc, 103.7] }, { w: [xc, py, 103.7] }, { w: [250.4, py, 103.7] }, { w: [250.4, py, 109.4] }]);
  };
  chain(1, 'M+', 39.5);
  chain(2, 'M-', 40.5);

  // Dispenser motor: rail, then a free drop down the hopper's side to the white connectors on the motor.
  const disp = (px, k) => run => {
    const Yr = 78 + k * 0.22, Zr = 90 + k * 0.2;
    return [{ w: [CLAMP, run.y, run.z] }, { c: [226.5, run.y, run.z] }, { c: [226.5, run.y, Zr] }, { c: [226.5, Yr, Zr] }, { c: [px, Yr, Zr] }, { c: [px, 74.4, Zr] }];
  };
  field('v12', R, 0.11, ['relay', 'no3'], ['dispMotor', 'M+'], disp(208.05, 0), { relay: 3, extra: { dyn: 'carrier' } });
  field('v12', K, 0.11, LN, ['dispMotor', 'M-'], disp(209.65, 1), { extra: { dyn: 'carrier' } });

  // Load cells: straight down to the floor, along it to the hole, then under the mesh to each tray.
  const CELLX = { 1: 50.35, 2: 92.65, 3: 134.95, 5: 177.25, 4: 219.55 };
  const CC = [['E+', R], ['E-', K], ['A-', WH], ['A+', GR]];
  HXU.forEach((u, i) => {
    const n = i + 1, Xc = CELLX[n];
    CC.forEach(([a, color], j) => {
      const U = 2.7 + i * 0.3 + j * 0.06, d = 3 + i * 0.18 + j * 0.05;
      const Yc = 50.7 + i * 0.5 + j * 0.1, Zc = 60.2 + i * 0.12, Ya = 50.53 - j * 0.22, Zl = 55.6 + i * 0.1;
      w('sig', color, 0.06, ['hx' + n, a], ['lc' + n, a], [{ d: 2 }, { v: 2.4 + i * 0.3 + j * 0.05 }, { d }, { u: U }, { v: FLOOR },
        { w: [X(d), Y_(U), Zl] }, { w: [X(d), Yc, Zl] }, { w: [X(d), Yc, Zc] }, { w: [Xc + 8, Yc, Zc] }, { w: [Xc + 8, Ya, Zc] }, { w: [Xc + 8, Ya, 66.7] }]);
    });
  });
  return out;
}
