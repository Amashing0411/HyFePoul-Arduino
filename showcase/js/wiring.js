// Wiring, laid out as tidy bundles: each wire leaves its pin, joins a shared straight run, and leaves it at its
// destination. Endpoints are the real pins.
// Steps move along one control-box axis at a time (u across, v up, d toward the door); 'B' means the far end's value.
// w / c / dr are points in CAD coordinates, on the moving hopper (CAD coordinates at rest), and on the door.
export function wireList(HXU) {
  const R = 0xd42a2a, K = 0x17191c, A = 0xf29a1c, Y = 0xf0cf2e, BL = 0x2f63d8, GR = 0x2aa84a, PU = 0x8e4bd0, GY = 0x9da3a6, WH = 0xeeeeea, OR = 0xe8791e, SK = 0x39b7e8;
  const out = [], count = {};
  const w = (layer, color, r, from, to, steps, extra = {}) => out.push({ layer, color, r, from, to, steps, ...extra });
  const lane = k => { count[k] = (count[k] || 0) + 1; return count[k] - 1; };
  const X = d => 240.6 + d, Y_ = u => 9 + u;
  const TOP = 46.6, V5 = 0.075;

  // The two exits through the top of the box, either side of the charge controller.
  const left = i => ({ u: 12.35 + i * 0.2, d: 4.6 });
  const right = i => ({ u: 27.35 + (i % 6) * 0.26, d: 3.8 + Math.floor(i / 6) * 0.3 });

  // Over the top of the machine, then across to the moving hopper.
  const toHopper = (e, i) => {
    const Z = 120 + i * 0.2, Yb = 62 + i * 0.22;
    return { Z, Yb, steps: [{ w: [X(e.d), Y_(e.u), Z] }, { w: [X(e.d), Yb, Z] }, { c: [226, Yb, Z] }] };
  };
  const sensorEnd = (run, j) => {
    const px = 208.42 + j * 0.254;
    return [...run.steps, { c: [px, run.Yb, run.Z] }, { c: [px, 59.2, run.Z] }];
  };
  const motorEnd = (run, i, px) => {
    const Yr = 78 + i * 0.22, Zr = 82 + i * 0.2;
    return [...run.steps, { c: [226, Yr, run.Z] }, { c: [226, Yr, Zr] }, { c: [px, Yr, Zr] }, { c: [px, 74.4, Zr] }];
  };

  // 5 V: step-down boards to the breadboard, then one bundle per destination.
  [['buck1', 'OUT+', 'p0', A], ['buck1', 'OUT-', 'g0', K], ['buck2', 'OUT+', 'p1', A], ['buck2', 'OUT-', 'g1', K]].forEach(([b, a, t, c], i) =>
    w('v5', c, 0.085, [b, a], ['breadboard', t], [{ d: 2.2 }, { u: 13.5 - i * 0.2 }, { v: 'B' }, { u: 'B' }]));
  const five = (i, part, a, gnd, steps, extra, color) => w('v5', color || (gnd ? K : A), V5, ['breadboard', (gnd ? 'g' : 'p') + i], [part, a], steps, extra);
  const vl = () => 13.2 + lane('vl') * 0.2;
  five(2, 'mega', '5V', false, [{ d: 4 }, { u: vl() }, { v: 33.75 }, { u: 'B' }, { v: 'B' }]);
  five(2, 'mega', 'GND1', true, [{ d: 4.15 }, { u: vl() }, { v: 33.92 }, { u: 'B' }, { v: 'B' }]);
  five(3, 'rtc', 'VCC', false, [{ d: 4.3 }, { u: vl() }, { v: 34.1 }, { u: 22.45 }, { v: 'B' }, { u: 'B' }]);
  five(3, 'rtc', 'GND', true, [{ d: 4.45 }, { u: vl() }, { v: 34.25 }, { u: 22.2 }, { v: 'B' }, { u: 'B' }]);
  five(4, 'esp32', 'VIN', false, [{ d: 3.4 }, { u: vl() }, { v: 27.6 }, { u: 'B' }, { v: 'B' }], {}, BL);
  five(4, 'esp32', 'GND', true, [{ d: 3.55 }, { u: vl() }, { v: 27.75 }, { u: 'B' }, { v: 'B' }], {}, GR);
  five(5, 'relay', 'VCC', false, [{ d: 3.7 }, { u: vl() }, { v: 24.75 }, { u: 'B' }, { v: 'B' }]);
  five(5, 'relay', 'GND', true, [{ d: 3.85 }, { u: vl() }, { v: 24.6 }, { u: 'B' }, { v: 'B' }]);
  HXU.forEach((u, i) => {
    const n = 'hx' + (i + 1);
    five(6 + i, n, 'VCC', false, [{ d: 3 }, { u: vl() }, { v: 24.05 + i * 0.13 }, { u: 'B' }, { v: 'B' }]);
    five(6 + i, n, 'GND', true, [{ d: 3.12 }, { u: vl() }, { v: 24.05 + (i + 5) * 0.13 }, { u: 'B' }, { v: 'B' }]);
  });
  five(11, 'buzzer', 'VCC', false, [{ d: 3.2 }, { u: 7.7 }, { v: 17.9 }, { u: 'B' }, { v: 'B' }]);
  five(11, 'buzzer', 'GND', true, [{ d: 3.35 }, { u: 7.5 }, { v: 18.1 }, { u: 'B' }, { v: 'B' }]);

  // Screen: one bundle across the hinge and along the door.
  const door = (i, x) => [{ v: 27.3 + i * 0.13 }, { u: 0.9 + i * 0.13 }, { d: 12.2 }, { dr: [0.9 + i * 0.13, 27.3 + i * 0.13, -1.95] }, { dr: [x, 27.3 + i * 0.13, -1.95] }];
  five(13, 'nextion', '5V', false, [{ d: 4.8 }, { u: 7.2 }, ...door(0, 19.1)], { dyn: 'door' });
  five(13, 'nextion', 'GND', true, [{ d: 4.95 }, { u: 7.05 }, ...door(1, 20.9)], { dyn: 'door' });
  w('sig', Y, 0.07, ['mega', 'D16'], ['nextion', 'RX'], [{ d: 5.1 }, { v: 27.6 }, ...door(2, 20.3)], { dyn: 'door' });
  w('sig', BL, 0.07, ['mega', 'D17'], ['nextion', 'TX'], [{ d: 5.25 }, { v: 27.75 }, ...door(3, 19.7)], { dyn: 'door' });

  // Scales: a ten-wire bus from the analog header around to the HX711 row.
  const HXC = [SK, 0xa8e05f, 0xf28bb0, 0xffd27a, 0xbfa6ff];
  [['A0', 'A1'], ['A2', 'A3'], ['A4', 'A5'], ['A6', 'A7'], ['A8', 'A9']].forEach(([dt, sck], i) => {
    const n = 'hx' + (i + 1);
    [[dt, 'DT'], [sck, 'SCK']].forEach(([m, a], j) => {
      const k = i * 2 + j;
      w('sig', HXC[i], 0.06, ['mega', m], [n, a], [{ d: 3.6 }, { v: 33.42 + k * 0.03 }, { u: 14.5 + k * 0.14 }, { v: 25.45 + k * 0.13 }, { u: 'B' }, { v: 'B' }]);
    });
  });

  // Short ribbons near the Mega.
  [['D10', 'IN1', OR], ['D9', 'IN2', Y], ['D8', 'IN3', GR]].forEach(([m, a, c], i) =>
    w('sig', c, 0.065, ['mega', m], ['relay', a], [{ d: 3.1 + i * 0.12 }, { v: 26.9 - i * 0.14 }, { u: 'B' }, { v: 'B' }]));
  w('sig', SK, 0.065, ['mega', 'D11'], ['buzzer', 'IO'], [{ d: 3.4 }, { v: 18.3 }, { u: 'B' }, { v: 'B' }]);
  w('sig', PU, 0.07, ['mega', 'D14'], ['esp32', 'GPIO16'], [{ d: 2.9 }, { v: 25 }, { u: 'B' }, { v: 'B' }]);
  w('sig', GY, 0.07, ['esp32', 'GPIO17'], ['mega', 'D15'], [{ d: 3.05 }, { v: 25.15 }, { u: 'B' }, { v: 'B' }]);
  w('sig', OR, 0.065, ['mega', 'D20'], ['rtc', 'SDA'], [{ d: 4.6 }, { v: 27.45 }, { u: 16.1 }, { v: 34.42 }, { u: 21.95 }, { v: 'B' }, { u: 'B' }]);
  w('sig', 0x9a5b2e, 0.065, ['mega', 'D21'], ['rtc', 'SCL'], [{ d: 4.75 }, { v: 27.3 }, { u: 15.95 }, { v: 34.58 }, { u: 21.75 }, { v: 'B' }, { u: 'B' }]);

  // Level sensor bundle: right-hand exit, alongside the motor wires.
  const ultra = (from, j, color, r, layer) => {
    const i = lane('hop'), e = right(i), v = 33.55 + i * 0.08;
    w(layer, color, r, from, ['ultrasonic', ['VCC', 'TRIG', 'ECHO', 'GND'][j]], [{ d: e.d }, { v }, { u: e.u }, { v: TOP }, ...sensorEnd(toHopper(e, i), j)], { dyn: 'carrier' });
  };
  ultra(['breadboard', 'p12'], 0, A, V5, 'v5');
  ultra(['breadboard', 'g12'], 3, K, V5, 'v5');
  ultra(['mega', 'D52'], 1, SK, 0.07, 'sig');
  ultra(['mega', 'D50'], 2, GR, 0.07, 'sig');

  // Left-hand exit: float switch and both limit switches.
  const leftExit = (from, to, color, i, v, route) => {
    const e = left(i);
    w('sig', color, 0.08, from, to, [{ d: e.d }, ...(v ? [{ v }] : []), { u: e.u }, { v: TOP }, ...route(e)]);
  };
  const floatRun = i => e => {
    const Z = 105.1 + i * 0.2, Yf = 7.7 + i * 0.2;
    return [{ w: [X(e.d), Y_(e.u), Z] }, { w: [X(e.d), Yf, Z] }, { w: [12.9, Yf, Z] }, { w: [12.9, 26, Z] }, { w: [12.9, 26, 122 + (i ? -0.2 : 0.2)] }];
  };
  leftExit(['mega', 'D49'], ['float', 'a'], Y, 0, 33.9, floatRun(0));
  leftExit(['breadboard', 'g14'], ['float', 'b'], Y, 1, null, floatRun(1));
  const homeRun = (i, ax) => e => {
    const Z = 105.5 + i * 0.2, L = 102.4 - i * 0.2, Yr = 46 + i * 0.2;
    return [{ w: [X(e.d), Y_(e.u), Z] }, { w: [X(e.d), Yr, Z] }, { w: [X(e.d), Yr, L] }, { w: [ax, Yr, L] }, { w: [ax, Yr, 99.4] }, { w: [ax, 47, 99.4] }];
  };
  leftExit(['mega', 'D53'], ['limitHome', 'S'], Y, 2, 34.05, homeRun(0, 236.6));
  leftExit(['breadboard', 'g15'], ['limitHome', 'G'], R, 3, null, homeRun(1, 237.4));
  const farRun = (i, ax) => e => {
    const Z = 105.9 + i * 0.2, L = 101.8 - i * 0.2, Yr = 46.4 + i * 0.2, Yt = 44.6 - i * 0.14, Xt = 33.2 - i * 0.2;
    return [{ w: [X(e.d), Y_(e.u), Z] }, { w: [X(e.d), Yr, Z] }, { w: [X(e.d), Yr, L] }, { w: [236, Yr, L] }, { w: [236, Yt, L] }, { w: [Xt, Yt, L] }, { w: [Xt, Yr, L] }, { w: [ax, Yr, L] }, { w: [ax, Yr, 99.4] }, { w: [ax, 47, 99.4] }];
  };
  leftExit(['mega', 'D51'], ['limitEnd', 'S'], BL, 4, 34.2, farRun(0, 32.1));
  leftExit(['breadboard', 'g16'], ['limitEnd', 'G'], WH, 5, null, farRun(1, 32.9));

  // Load cells: four parallel wires per cell, straight out of the floor, then under the mesh to each tray.
  const CELLX = { 1: 219.55, 2: 177.25, 3: 134.95, 5: 92.65, 4: 50.35 };
  const CC = [['E+', R], ['E-', K], ['A-', WH], ['A+', GR]];
  HXU.forEach((u, i) => {
    const n = i + 1, Xc = CELLX[n];
    CC.forEach(([a, color], j) => {
      const U = 8.5 + i * 1.6 + j * 0.13, d = 3 + i * 0.4 + j * 0.1;
      const Yc = 50.7 + i * 0.5 + j * 0.1, Zc = 60.2 + i * 0.12, Ya = 50.53 - j * 0.22, Zl = 55.6 + i * 0.1;
      w('sig', color, 0.06, ['hx' + n, a], ['lc' + n, a], [{ d: 2 }, { v: 18 - i * 0.3 - j * 0.07 }, { u: U }, { d }, { v: -0.6 },
        { w: [X(d), Y_(U), Zl] }, { w: [X(d), Yc, Zl] }, { w: [X(d), Yc, Zc] }, { w: [Xc + 8, Yc, Zc] }, { w: [Xc + 8, Ya, Zc] }, { w: [Xc + 8, Ya, 66.7] }]);
    });
  });

  // 12 V.
  w('v12', R, 0.13, ['psu', 'V1'], ['charger', 't5'], [{ d: 6.2 }, { v: 37.95 }, { u: 'B' }, { d: 'B' }]);
  w('v12', K, 0.13, ['psu', 'COM1'], ['charger', 't6'], [{ d: 5.85 }, { v: 37.6 }, { u: 'B' }, { d: 'B' }]);
  w('v12', R, 0.13, ['charger', 't1'], ['rocker', 'a'], [{ d: 3.2 }, { u: 3.75 }, { d: 'B' }, { v: 'B' }]);
  w('v12', R, 0.13, ['rocker', 'b'], ['battery', '+'], [{ u: 3.3 }, { v: 11.25 }, { u: 'B' }, { d: 'B' }]);
  w('v12', K, 0.13, ['charger', 't2'], ['battery', '-'], [{ d: 3.5 }, { u: 4.1 }, { v: 11.65 }, { u: 'B' }, { d: 'B' }]);
  const LP = ['charger', 't3'], LN = ['charger', 't4'];
  w('v12', R, 0.1, LP, ['buck1', 'IN+'], [{ d: 2.2 }, { v: 'B' }, { u: 'B' }]);
  w('v12', R, 0.1, LP, ['buck2', 'IN+'], [{ d: 2.4 }, { u: 19.8 }, { v: 'B' }, { u: 'B' }]);
  w('v12', K, 0.1, LN, ['buck1', 'IN-'], [{ d: 2.6 }, { u: 20.4 }, { v: 'B' }, { u: 'B' }]);
  w('v12', K, 0.1, LN, ['buck2', 'IN-'], [{ d: 2.8 }, { u: 20.7 }, { v: 'B' }, { u: 'B' }]);
  [1, 2, 3].forEach(n => w('v12', R, 0.11, LP, ['relay', 'com' + n], [{ d: 4.9 + n * 0.28 }, { u: 28.7 - (n - 1) * 0.28 }, { v: 18.5 - n * 0.2 }, { u: 'B' }, { d: 'B' }]));
  const motorStart = (n, e) => (n ? [{ v: 18.2 - n * 0.2 }, { d: e.d }, { u: e.u }, { v: TOP }] : [{ d: e.d }, { u: e.u }, { v: TOP }]);
  const chain = (n, a, px) => {
    const e = right(lane('hop')), Yb = 62.6 + n * 0.25;
    w('v12', R, 0.11, ['relay', 'no' + n], ['chainMotor', a], [...motorStart(n, e), { w: [X(e.d), Y_(e.u), 109.4] }, { w: [X(e.d), Yb, 109.4] }, { w: [px, Yb, 109.4] }]);
  };
  chain(1, 'M+', 238.95);
  chain(2, 'M-', 240.05);
  const disp = (n, a, px, c) => {
    const i = lane('hop'), e = right(i);
    w('v12', c, 0.11, n ? ['relay', 'no' + n] : LN, ['dispMotor', a], [...motorStart(n, e), ...motorEnd(toHopper(e, i), i, px)], { dyn: 'carrier' });
  };
  disp(3, 'M+', 208.05, R);
  disp(0, 'M-', 209.65, K);
  return out;
}
