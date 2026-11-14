/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — isometrische canvas-renderer */
(function () {
  const CFT = (globalThis.CFT = globalThis.CFT || {});
  const G = CFT.Game, ST = CFT.STATIONS, MODELS = CFT.MODELS;
  const R = (CFT.Render = {});

  // Projectie (wereld-eenheden → pixels bij zoom 1)
  let AX = 26, AY = 8, BX = -15, BY = 13, ZZ = 24;
  const PROJ_LAND = [26, 8, -15, 13, 24], PROJ_PORT = [11, 16, -17, 7, 22];
  R.portrait = false;
  function setProj(pr) { [AX, AY, BX, BY, ZZ] = pr; }
  R.LINE_GAP = 6.4;
  const LOT_X = 27.6, FLOOR_X0 = -3.2, FLOOR_X1 = 35.4;

  let canvas, ctx, dpr = 1, W = 0, H = 0;
  R.cam = { zoom: 1, ox: 0, oy: 0, user: false };
  R.pad = { t: 70, r: 10, b: 150, l: 10 };
  R.hits = [];
  R.particles = [];
  R.floats = [];
  R.beltOffset = 0;
  R.selected = -1;
  R.flash = {}; // station-index → tijd (upgrade-flits)
  let time = 0;

  const proj = (x, y, z) => [x * AX + y * BX, x * AY + y * BY - (z || 0) * ZZ];
  R.proj = proj;
  R.toScreen = function (x, y, z) {
    const p = proj(x, y, z);
    return [p[0] * R.cam.zoom + R.cam.ox, p[1] * R.cam.zoom + R.cam.oy];
  };
  R.lineY = li => li * R.LINE_GAP;

  // ---------- Kleurhulpjes ----------
  const shadeCache = {};
  function shade(hex, amt) {
    const key = hex + amt;
    if (shadeCache[key]) return shadeCache[key];
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
    let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return (shadeCache[key] = `rgb(${r | 0},${g | 0},${b | 0})`);
  }
  R.shade = shade;

  // ---------- Tekenprimitieven (in projectie-ruimte) ----------
  function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function box(x, y, z, w, d, h, col, opt) {
    opt = opt || {};
    const top = opt.top || shade(col, 0.16), right = opt.right || shade(col, -0.22);
    const edge = opt.edge === undefined ? 'rgba(0,0,0,0.18)' : opt.edge;
    poly([proj(x, y + d, z), proj(x + w, y + d, z), proj(x + w, y + d, z + h), proj(x, y + d, z + h)], col, edge, 0.6);
    poly([proj(x + w, y, z), proj(x + w, y + d, z), proj(x + w, y + d, z + h), proj(x + w, y, z + h)], right, edge, 0.6);
    poly([proj(x, y, z + h), proj(x + w, y, z + h), proj(x + w, y + d, z + h), proj(x, y + d, z + h)], top, edge, 0.6);
  }
  R.box = box;
  function quadFront(x, y, z, w, h, col) { // vlak in xz-vlak op diepte y
    poly([proj(x, y, z), proj(x + w, y, z), proj(x + w, y, z + h), proj(x, y, z + h)], col);
  }
  function quadRight(x, y, z, d, h, col) { // vlak in yz-vlak op x
    poly([proj(x, y, z), proj(x, y + d, z), proj(x, y + d, z + h), proj(x, y, z + h)], col);
  }
  function quadTop(x, y, z, w, d, col) {
    poly([proj(x, y, z), proj(x + w, y, z), proj(x + w, y + d, z), proj(x, y + d, z)], col);
  }
  // cirkel in het xz-vlak (wiel aan de zijkant)
  function discXZ(x, y, z, r, col, stroke) {
    const p = proj(x, y, z);
    ctx.save();
    ctx.transform(AX / 26, AY / 26, 0, -ZZ / 24, p[0], p[1]);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 26, r * 24, 0, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.restore();
  }
  // ellips op de vloer (schaduw)
  function shadow(x, y, z, w, d, a) {
    poly([proj(x, y, z), proj(x + w, y, z), proj(x + w, y + d, z), proj(x, y + d, z)], `rgba(0,0,0,${a || 0.18})`);
  }

  // ---------- Auto ----------
  // x,y = midden van de auto; z = hoogte van de ondergrond; stage = laatst afgeronde station
  function drawCar(x, y, z, m, stage, golden, opt) {
    opt = opt || {};
    const L = m.L, Wd = m.W, Hh = m.H;
    const x0 = x - L / 2, y0 = y - Wd / 2;
    const zc = z + 0.12;
    const bodyCol = golden && stage >= 3 ? '#fbbf24' : stage >= 3 ? m.color : '#a7b0bc';
    shadow(x0 - 0.05, y0 - 0.02, z + 0.005, L + 0.1, Wd + 0.08, 0.22);
    // verre wielen
    discXZ(x0 + 0.26, y0 + 0.02, z + 0.17, 0.17, '#111827');
    discXZ(x0 + L - 0.28, y0 + 0.02, z + 0.17, 0.17, '#111827');
    // chassis
    box(x0 + 0.06, y0 + 0.08, z + 0.1, L - 0.12, Wd - 0.16, 0.09, '#3f4652');
    if (stage === 0) {
      // zichtbaar frame
      box(x0 + 0.1, y0 + 0.14, z + 0.19, L - 0.2, 0.07, 0.05, '#f59e0b');
      box(x0 + 0.1, y0 + Wd - 0.21, z + 0.19, L - 0.2, 0.07, 0.05, '#f59e0b');
    }
    if (stage === 1) {
      box(x0 + L * 0.6, y0 + Wd * 0.22, zc + 0.06, L * 0.27, Wd * 0.56, 0.24, '#9ca3af');
      box(x0 + L * 0.64, y0 + Wd * 0.3, zc + 0.3, L * 0.18, Wd * 0.4, 0.06, '#ef4444');
      if (m.glow) box(x0 + L * 0.2, y0 + Wd * 0.2, zc + 0.02, L * 0.35, Wd * 0.6, 0.08, '#0ea5e9');
    }
    if (stage >= 2) {
      const glass = '#1e3a5f';
      // onderbak
      box(x0, y0, zc, L, Wd, Hh, bodyCol);
      // cabine
      const cl = m.cabL * L, cx0 = x0 + (L - cl) / 2 + m.cabX * L, cy0 = y0 + Wd * 0.08, cw = Wd * 0.84;
      const cz = zc + Hh;
      const cabCol = stage >= 4 ? shade(bodyCol, -0.05) : shade(bodyCol, 0.05);
      box(cx0, cy0, cz, cl, cw, m.cab, cabCol);
      if (stage >= 4) {
        // ramen
        quadFront(cx0 + 0.06, cy0 + cw + 0.001, cz + 0.04, cl * 0.42, m.cab * 0.75, glass);
        quadFront(cx0 + cl * 0.52, cy0 + cw + 0.001, cz + 0.04, cl * 0.42, m.cab * 0.75, glass);
        quadRight(cx0 + cl + 0.001, cy0 + 0.06, cz + 0.04, cw - 0.12, m.cab * 0.78, '#264b75');
        quadTop(cx0 + cl * 0.15, cy0 + 0.05, cz + m.cab + 0.001, cl * 0.7, cw - 0.1, 'rgba(255,255,255,0.12)');
        // koplampen
        quadRight(x0 + L + 0.001, y0 + 0.07, zc + Hh * 0.45, 0.16, Hh * 0.3, '#fde68a');
        quadRight(x0 + L + 0.001, y0 + Wd - 0.23, zc + Hh * 0.45, 0.16, Hh * 0.3, '#fde68a');
        // deurnaad
        quadFront(x0 + L * 0.48, y0 + Wd + 0.002, zc + 0.04, 0.02, Hh * 0.85, 'rgba(0,0,0,0.25)');
      }
      if (stage >= 6) {
        // chroomstreep + glans
        quadFront(x0 + 0.05, y0 + Wd + 0.003, zc + Hh * 0.18, L - 0.1, 0.035, m.chrome ? '#e5e7eb' : 'rgba(255,255,255,0.55)');
        quadTop(x0 + L * 0.66, y0 + 0.08, zc + Hh + 0.001, L * 0.22, Wd - 0.16, 'rgba(255,255,255,0.25)');
        if (m.spoiler) {
          box(x0 + 0.05, y0 + 0.12, zc + Hh, 0.05, 0.06, 0.13, '#111827');
          box(x0 + 0.05, y0 + Wd - 0.18, zc + Hh, 0.05, 0.06, 0.13, '#111827');
          box(x0 - 0.02, y0 + 0.04, zc + Hh + 0.13, 0.2, Wd - 0.08, 0.04, '#111827');
        }
        if (m.glow) quadFront(x0 + 0.15, y0 + Wd + 0.004, zc + 0.02, L - 0.3, 0.03, m.glow);
      }
      if (stage >= 5 && stage < 6) {
        // keurmerk-sticker
        quadFront(x0 + L * 0.15, y0 + Wd + 0.003, zc + Hh * 0.5, 0.12, 0.12, '#10b981');
      }
    }
    // nabije wielen
    const hub = stage >= 6 ? '#e5e7eb' : '#6b7280';
    for (const wx of [x0 + 0.26, x0 + L - 0.28]) {
      discXZ(wx, y0 + Wd, z + 0.17, 0.17, '#111827');
      discXZ(wx, y0 + Wd + 0.005, z + 0.17, 0.08, hub);
    }
    if (golden && stage >= 3) {
      const s = R.toScreen(x, y, zc + Hh + 0.3);
      R._sparkles.push([s[0], s[1], 1]);
    }
  }
  R.drawCar = drawCar;
  R._sparkles = [];

  // ---------- Fabriek ----------
  function drawFloor(lines, ghost) {
    const y1 = R.lineY(lines - 1) + 5.0 + (ghost ? R.LINE_GAP : 0);
    // vloer
    poly([proj(FLOOR_X0, -1.8, 0), proj(FLOOR_X1, -1.8, 0), proj(FLOOR_X1, y1, 0), proj(FLOOR_X0, y1, 0)], '#cfd8e3');
    // vloerdikte
    poly([proj(FLOOR_X0, y1, 0), proj(FLOOR_X1, y1, 0), proj(FLOOR_X1, y1, -0.4), proj(FLOOR_X0, y1, -0.4)], '#8a96a8');
    poly([proj(FLOOR_X1, -1.8, 0), proj(FLOOR_X1, y1, 0), proj(FLOOR_X1, y1, -0.4), proj(FLOOR_X1, -1.8, -0.4)], '#6b7789');
    // tegels
    ctx.strokeStyle = 'rgba(80,100,130,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(FLOOR_X0); x <= FLOOR_X1; x += 2) { const a = proj(x, -1.8, 0), b = proj(x, y1, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let y = -1.8; y <= y1; y += 2) { const a = proj(FLOOR_X0, y, 0), b = proj(FLOOR_X1, y, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // showroom-vloer per lijn
    for (let li = 0; li < lines; li++) {
      const y0 = R.lineY(li);
      poly([proj(LOT_X - 1.2, y0 + 0.4, 0.01), proj(FLOOR_X1 - 0.3, y0 + 0.4, 0.01), proj(FLOOR_X1 - 0.3, y0 + 4.4, 0.01), proj(LOT_X - 1.2, y0 + 4.4, 0.01)], '#eef2f7');
      // parkeerlijnen
      ctx.strokeStyle = 'rgba(37,99,235,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let c = 0; c <= 4; c++) { const x = LOT_X - 0.95 + c * 1.9; const a = proj(x, y0 + 0.6, 0.02), b = proj(x, y0 + 4.2, 0.02); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      // veiligheidsstrepen langs de band
      poly([proj(-1.2, y0 + 3.55, 0.01), proj(G.BELT_END + 1, y0 + 3.55, 0.01), proj(G.BELT_END + 1, y0 + 3.75, 0.01), proj(-1.2, y0 + 3.75, 0.01)], 'rgba(234,179,8,0.55)');
    }
  }
  function drawWalls(lines, ghost) {
    const y1 = R.lineY(lines - 1) + 5.0 + (ghost ? R.LINE_GAP : 0);
    // achterwand
    box(FLOOR_X0, -2.2, 0, FLOOR_X1 - FLOOR_X0, 0.4, 3.4, '#e7ecf3', { top: '#94a3b8', right: '#c3ccd8' });
    // ramen in achterwand
    for (let x = FLOOR_X0 + 1.5; x < FLOOR_X1 - 2; x += 4) {
      quadFront(x, -1.799, 1.5, 2.6, 1.3, '#9ec5f0');
      quadFront(x + 0.1, -1.798, 1.6, 1.15, 1.1, '#bfdcfa');
      quadFront(x + 1.35, -1.798, 1.6, 1.15, 1.1, '#bfdcfa');
    }
    // gevelstreep
    quadFront(FLOOR_X0, -1.799, 3.0, FLOOR_X1 - FLOOR_X0, 0.15, '#2563eb');
    // zijwand
    box(FLOOR_X0 - 0.4, -2.2, 0, 0.4, y1 + 2.2, 3.4, '#dfe5ee', { top: '#94a3b8', right: '#cfd7e2' });
    // logo op de muur
    const p = proj(1, -1.8, 2.45);
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.transform(1, AY / AX, 0, 1, 0, 0);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(R.brand || 'CAR FACTORY', 0, 0);
    ctx.restore();
  }

  function drawStation(li, i, line) {
    const y0 = R.lineY(li);
    const x = G.ST_X[i];
    const st = ST[i];
    const lvl = G.s.stations[i];
    const proc = line.cars.find(c => c.proc === i);
    // platform
    box(x - 1.15, y0 + 0.15, 0, 2.3, 1.55, 0.12, lvl ? '#64748b' : '#94a3b8', { edge: 'rgba(0,0,0,0.12)' });
    if (!lvl) {
      // onbebouwde kavel
      ctx.setLineDash([5, 4]);
      poly([proj(x - 1.0, y0 + 0.3, 0.13), proj(x + 1.0, y0 + 0.3, 0.13), proj(x + 1.0, y0 + 1.55, 0.13), proj(x - 1.0, y0 + 1.55, 0.13)], 'rgba(255,255,255,0.25)', 'rgba(30,41,59,0.45)', 1.5);
      ctx.setLineDash([]);
      if (G.isBuilding(i)) drawConstruction(x, y0, st, G.buildInfo('st').progress);
      return;
    }
    const gold = lvl >= 25;
    const col = st.color;
    const fl = R.flash[i] ? Math.max(0, 1 - (time - R.flash[i]) * 2) : 0;
    // machinebehuizing
    box(x - 0.95, y0 + 0.25, 0.12, 1.9, 1.05, 1.05, col);
    // bovenpaneel
    box(x - 0.8, y0 + 0.35, 1.17, 1.6, 0.85, 0.12, gold ? '#fbbf24' : shade(col, 0.35));
    // ventilatie / display op voorkant
    quadFront(x - 0.75, y0 + 1.301, 0.4, 0.7, 0.45, '#0f172a');
    const run = !!proc;
    const scr = run ? (st.fx === 'scan' ? '#34d399' : '#38bdf8') : '#334155';
    quadFront(x - 0.7, y0 + 1.302, 0.45, 0.6 * (run ? 0.4 + 0.6 * ((time * 2) % 1) : 0.3), 0.35, scr);
    // statuslamp
    const lamp = run ? (Math.sin(time * 10) > 0 ? '#22c55e' : '#16a34a') : '#f59e0b';
    box(x + 0.55, y0 + 0.6, 1.29, 0.18, 0.18, 0.16, lamp, { edge: null });
    // flits bij upgrade
    if (fl > 0) {
      ctx.globalAlpha = fl * 0.6;
      box(x - 0.95, y0 + 0.25, 0.12, 1.9, 1.05, 1.05, '#ffffff', { edge: null, top: '#ffffff', right: '#ffffff' });
      ctx.globalAlpha = 1;
    }
  }

  // Bouwplaats: steigers, een machine die laag voor laag groeit en een hijskraantje
  function drawConstruction(x, y0, st, p) {
    const x0 = x - 0.95, ya = y0 + 0.25, w = 1.9, d = 1.05, H = 1.05;
    // fundering
    box(x0 - 0.05, ya - 0.05, 0.12, w + 0.1, d + 0.1, 0.05, '#9ca3af', { edge: null });
    // machine groeit mee met de voortgang
    const h = Math.max(0.04, H * p);
    ctx.globalAlpha = 0.9;
    box(x0, ya, 0.17, w, d, h, st.color);
    ctx.globalAlpha = 1;
    // bouwlijn bovenop (lasnaad)
    if (p < 1) quadTop(x0, ya, 0.17 + h + 0.002, w, d, 'rgba(253,224,71,' + (0.35 + 0.25 * Math.sin(time * 9)) + ')');
    // steigerpalen en -planken
    const poleH = 1.6, pc = '#64748b';
    for (const [px, py] of [[x0 - 0.12, ya - 0.1], [x0 + w + 0.02, ya - 0.1], [x0 - 0.12, ya + d + 0.02], [x0 + w + 0.02, ya + d + 0.02]]) {
      box(px, py, 0.12, 0.08, 0.08, poleH, pc, { edge: null });
    }
    for (const z of [0.7, 1.35]) {
      box(x0 - 0.12, ya + d + 0.02, z, w + 0.22, 0.08, 0.05, '#f59e0b', { edge: null });
      box(x0 + w + 0.02, ya - 0.1, z, 0.08, d + 0.2, 0.05, '#f59e0b', { edge: null });
    }
    // kraantje met haak dat heen en weer gaat
    const jibZ = poleH + 0.12;
    box(x0 - 0.12, ya - 0.1, jibZ, w + 0.22, 0.08, 0.07, '#facc15', { edge: 'rgba(0,0,0,0.3)' });
    const hx = x0 + 0.3 + (w - 0.6) * (0.5 + 0.5 * Math.sin(time * 1.3));
    const hz = 0.17 + h + 0.25 + 0.15 * Math.sin(time * 2.1);
    const a = proj(hx, ya - 0.06, jibZ), b = proj(hx, ya - 0.06, hz);
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    box(hx - 0.07, ya - 0.13, hz - 0.12, 0.14, 0.14, 0.12, '#334155', { edge: null });
    // lasvonken
    if (Math.random() < 0.35) {
      R.particles.push({ x: x0 + Math.random() * w, y: ya + d, z: 0.17 + h, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 0.8, vz: 1 + Math.random() * 1.5, life: 0.4, size: 2, col: Math.random() < 0.5 ? '#fde047' : '#fb923c' });
    }
  }

  // ---------- Industriële robotarmen (6-assig, KUKA/ABB-stijl) ----------
  // Elke arm heeft een eigen toestand zodat hij vloeiend naar zijn doel beweegt.
  R.armState = {};
  R._dt = 0.016;
  const L1 = 0.78, L2 = 0.72, TOOL = 0.24;

  // Verticale cilinder in iso: ellips onder, vlak ertussen, ellips boven
  function cylinder(cx, cy, z, r, h, side, top) {
    const N = 18, bot = [], tp = [];
    let minI = 0, maxI = 0;
    for (let k = 0; k < N; k++) {
      const t = (k / N) * Math.PI * 2;
      const px = cx + Math.cos(t) * r, py = cy + Math.sin(t) * r;
      bot.push(proj(px, py, z)); tp.push(proj(px, py, z + h));
      if (bot[k][0] < bot[minI][0]) minI = k;
      if (bot[k][0] > bot[maxI][0]) maxI = k;
    }
    poly(bot, shade(side, -0.25));
    poly([bot[minI], bot[maxI], tp[maxI], tp[minI]], side);
    // lichte rand aan de kant van het licht
    poly([bot[minI], [bot[minI][0] + (bot[maxI][0] - bot[minI][0]) * 0.18, bot[minI][1]], [tp[minI][0] + (tp[maxI][0] - tp[minI][0]) * 0.18, tp[minI][1]], tp[minI]], shade(side, 0.18));
    poly(tp, top || shade(side, 0.22), 'rgba(0,0,0,0.25)', 0.6);
  }
  // Armsegment als afgeronde, licht taps toelopende balk met glanslijn
  function link(a, b, w1, w2, col) {
    const p = proj(a[0], a[1], a[2]), q = proj(b[0], b[1], b[2]);
    let dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const s1 = w1 / 2, s2 = w2 / 2;
    // zorg dat de normaal naar boven (naar het licht) wijst
    const up = ny < 0 ? 1 : -1;
    const ux = nx * up, uy = ny * up;
    poly([[p[0] + ux * s1, p[1] + uy * s1], [q[0] + ux * s2, q[1] + uy * s2], [q[0] - ux * s2, q[1] - uy * s2], [p[0] - ux * s1, p[1] - uy * s1]], col, shade(col, -0.45), 0.7);
    // donkere onderkant
    poly([[p[0] - ux * s1 * 0.35, p[1] - uy * s1 * 0.35], [q[0] - ux * s2 * 0.35, q[1] - uy * s2 * 0.35], [q[0] - ux * s2, q[1] - uy * s2], [p[0] - ux * s1, p[1] - uy * s1]], shade(col, -0.22));
    // glanslijn bovenop
    poly([[p[0] + ux * s1 * 0.85, p[1] + uy * s1 * 0.85], [q[0] + ux * s2 * 0.85, q[1] + uy * s2 * 0.85], [q[0] + ux * s2 * 0.35, q[1] + uy * s2 * 0.35], [p[0] + ux * s1 * 0.35, p[1] + uy * s1 * 0.35]], shade(col, 0.3));
    // ronde uiteinden
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p[0], p[1], s1, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(q[0], q[1], s2, 0, 7); ctx.fill();
  }
  // Gewricht: motorhuis met ring en as
  function joint(pt, r, col) {
    const p = proj(pt[0], pt[1], pt[2]);
    ctx.fillStyle = shade(col, -0.35); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0] - r * 0.12, p[1] - r * 0.12, r * 0.78, 0, 7); ctx.fill();
    ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(p[0] - r * 0.12, p[1] - r * 0.12, r * 0.38, 0, 7); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(p[0] - r * 0.12, p[1] - r * 0.12, r * 0.16, 0, 7); ctx.fill();
  }
  // Gereedschap aan de pols, afhankelijk van het station
  function tool(fx, w, tip, active, car) {
    const P = proj(w[0], w[1], w[2]), T = proj(tip[0], tip[1], tip[2]);
    // flens
    ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(P[0], P[1], 3.4, 0, 7); ctx.fill();
    if (fx === 'weld') {
      link(w, tip, 3.2, 2, '#374151');
      ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.arc(T[0], T[1], 1.6, 0, 7); ctx.fill();
      if (active && Math.random() < 0.8) {
        const g = ctx.createRadialGradient(T[0], T[1] + 2, 0, T[0], T[1] + 2, 10);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(147,197,253,0.7)'); g.addColorStop(1, 'rgba(147,197,253,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(T[0], T[1] + 2, 10, 0, 7); ctx.fill();
      }
    } else if (fx === 'spray') {
      link(w, tip, 3.6, 2.4, '#e5e7eb');
      if (active) {
        const col = car && car.golden ? '251,191,36' : hexRgb(car ? MODELS[car.model].color : '#ffffff');
        const g = ctx.createLinearGradient(T[0], T[1], T[0], T[1] + 16);
        g.addColorStop(0, `rgba(${col},0.55)`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(T[0] - 1, T[1]); ctx.lineTo(T[0] - 8, T[1] + 16); ctx.lineTo(T[0] + 8, T[1] + 16); ctx.lineTo(T[0] + 1, T[1]); ctx.fill();
      }
    } else if (fx === 'press') {
      // grijper met twee vingers die open en dicht gaan
      const mid = [w[0], w[1], (w[2] + tip[2]) / 2 + 0.03];
      link(w, mid, 4.2, 4.2, '#475569');
      const open = active ? 0.05 + 0.06 * (0.5 + 0.5 * Math.sin(time * 8)) : 0.11;
      for (const sx of [-1, 1]) link([mid[0] + sx * open, mid[1], mid[2]], [tip[0] + sx * open * 0.8, tip[1], tip[2]], 2, 1.6, '#1f2937');
      link([mid[0] - 0.12, mid[1], mid[2]], [mid[0] + 0.12, mid[1], mid[2]], 2.6, 2.6, '#334155');
    } else if (fx === 'scan') {
      link(w, tip, 3, 3, '#1f2937');
      box(tip[0] - 0.08, tip[1] - 0.06, tip[2] - 0.02, 0.16, 0.12, 0.08, '#0f172a', { edge: null });
      if (active) {
        ctx.fillStyle = `rgba(52,211,153,${0.18 + 0.12 * Math.sin(time * 12)})`;
        ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(T[0] - 14, T[1] + 18); ctx.lineTo(T[0] + 14, T[1] + 18); ctx.fill();
        const sy = T[1] + 6 + 12 * (0.5 + 0.5 * Math.sin(time * 6));
        ctx.strokeStyle = 'rgba(52,211,153,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(T[0] - 12, sy); ctx.lineTo(T[0] + 12, sy); ctx.stroke();
      }
    } else if (fx === 'polish') {
      link(w, tip, 3, 3, '#475569');
      const N = 14, pts = [];
      for (let k = 0; k < N; k++) { const t = (k / N) * Math.PI * 2; pts.push(proj(tip[0] + Math.cos(t) * 0.16, tip[1] + Math.sin(t) * 0.16, tip[2])); }
      poly(pts, '#e2e8f0', '#94a3b8', 0.8);
      if (active) {
        const a = time * 20;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(T[0] + Math.cos(a) * 4, T[1] + Math.sin(a) * 2); ctx.lineTo(T[0] - Math.cos(a) * 4, T[1] - Math.sin(a) * 2); ctx.stroke();
      }
    } else {
      // schroefmachine (bolt)
      link(w, tip, 4, 3, '#64748b');
      link([tip[0], tip[1], tip[2] + 0.02], [tip[0], tip[1], tip[2] - 0.06], 1.6, 1.2, '#cbd5e1');
      if (active) {
        const a = time * 30;
        ctx.strokeStyle = 'rgba(224,242,254,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(T[0], T[1], 4, a, a + 2); ctx.stroke();
      }
    }
  }
  function hexRgb(hex) {
    const c = hex.replace('#', '');
    return `${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)}`;
  }

  function drawArms(li, i, line) {
    const lvl = G.s.stations[i];
    if (!lvl) return;
    const y0 = R.lineY(li);
    const x = G.ST_X[i];
    const st = ST[i];
    const car = line.cars.find(c => c.proc === i);
    const arms = lvl >= 50 ? 3 : lvl >= 10 ? 2 : 1;
    const gold = lvl >= 25;
    const body = gold ? '#f59e0b' : '#f97316';
    const speed = Math.min(14, 1.6 + G.stationSpeed(i) * 0.25) * G.boostMult();
    const dt = R._dt;
    for (let a = 0; a < arms; a++) {
      const ax = x + (a === 0 ? 0.55 : a === 1 ? -0.55 : 0);
      const B = [ax, y0 + 1.42 + (a === 2 ? -0.05 : 0), 0.12];
      const key = li + '-' + i + '-' + a;
      const stt = R.armState[key] || (R.armState[key] = { tip: [ax, y0 + 1.8, 1.05], wp: Math.random() * 10 });
      // ---- doelpositie van de gereedschapspunt ----
      let target;
      if (car) {
        const m = MODELS[car.model];
        const topZ = 0.35 + 0.12 + (car.stage >= 2 ? m.H + m.cab * 0.5 : 0.22);
        stt.wp += dt * speed;
        const ph = stt.wp + a * 2.1;
        // elke arm werkt aan zijn eigen deel van de auto en verspringt tussen werkpunten
        const side = a === 0 ? 0.35 : a === 1 ? -0.35 : 0;
        const stepIdx = Math.floor(ph * 0.5) % 3;
        let ox = side + (stepIdx - 1) * 0.22, oz = 0.06, oy = -0.18;
        if (st.fx === 'spray') { ox = side + Math.sin(ph * 0.9) * 0.45; oz = 0.32; }
        else if (st.fx === 'press') { oz = 0.04 + Math.max(0, Math.sin(ph * 1.6)) * 0.28; }
        else if (st.fx === 'scan') { ox = side + Math.sin(ph * 0.6) * 0.5; oz = 0.35; oy = 0; }
        else if (st.fx === 'polish') { ox = side + Math.sin(ph * 1.1) * 0.35; oy = -0.1 + Math.cos(ph * 1.1) * 0.12; oz = 0.03; }
        else oz = 0.04 + Math.abs(Math.sin(ph * 3)) * 0.05;
        target = [car.x + ox, y0 + 2.6 + oy, topZ + oz];
      } else {
        // ruststand: arm opgevouwen boven de voet, licht 'ademend'
        target = [ax + 0.05, B[1] + 0.45, 1.05 + 0.03 * Math.sin(time * 1.2 + a + i)];
      }
      // ---- vloeiend bewegen ----
      const k = 1 - Math.exp(-dt * (car ? 4 + speed * 0.8 : 3));
      for (let j = 0; j < 3; j++) stt.tip[j] += (target[j] - stt.tip[j]) * k;
      const tip = stt.tip;
      // ---- inverse kinematica (2 schakels + verticale pols) ----
      const S0 = [B[0], B[1], B[2] + 0.42];
      const W = [tip[0], tip[1], tip[2] + TOOL];
      let hx = W[0] - S0[0], hy = W[1] - S0[1];
      let r = Math.hypot(hx, hy);
      const ux = r > 1e-4 ? hx / r : 0, uy = r > 1e-4 ? hy / r : 1;
      // schouder zit iets voor de draaias
      const S = [S0[0] + ux * 0.1, S0[1] + uy * 0.1, S0[2]];
      r = Math.max(0.05, r - 0.1);
      let dz = W[2] - S[2];
      let d = Math.hypot(r, dz);
      const maxD = L1 + L2 - 0.02, minD = Math.abs(L1 - L2) + 0.05;
      if (d > maxD) { r *= maxD / d; dz *= maxD / d; d = maxD; }
      if (d < minD) { const f = minD / Math.max(d, 1e-4); r *= f; dz *= f; d = minD; }
      const aa = Math.atan2(dz, r);
      const bb = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const sh = aa + bb; // elleboog omhoog
      const E = [S[0] + ux * L1 * Math.cos(sh), S[1] + uy * L1 * Math.cos(sh), S[2] + L1 * Math.sin(sh)];
      const Wr = [S[0] + ux * r, S[1] + uy * r, S[2] + dz];
      const Tp = [Wr[0], Wr[1], Wr[2] - TOOL];
      // ---- tekenen: voet → draaiplateau → schouder → bovenarm → onderarm → pols → gereedschap ----
      cylinder(B[0], B[1], B[2], 0.22, 0.12, '#334155', '#475569');
      cylinder(B[0], B[1], B[2] + 0.12, 0.17, 0.16, shade(body, -0.15), body);
      // schouderhuis (blokje dat meedraait)
      box(S0[0] - 0.13, S0[1] - 0.13, S0[2] - 0.14, 0.26, 0.26, 0.2, shade(body, -0.05));
      // contragewicht achter de schouder
      const back = [S[0] - ux * 0.2 * Math.cos(sh), S[1] - uy * 0.2 * Math.cos(sh), S[2] - 0.2 * Math.sin(sh)];
      link(back, S, 7, 7, '#475569');
      // kabelbundel van voet naar elleboog
      const cp = proj((S0[0] + E[0]) / 2 - ux * 0.15, (S0[1] + E[1]) / 2 - uy * 0.15, Math.max(S0[2], E[2]) + 0.12);
      const c0 = proj(B[0] - ux * 0.12, B[1] - uy * 0.12, B[2] + 0.28), c1 = proj(E[0], E[1], E[2]);
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.quadraticCurveTo(cp[0], cp[1], c1[0], c1[1]); ctx.stroke();
      // bovenarm
      link(S, E, 9, 7, body);
      joint(S, 6.2, body);
      // motor op de elleboog + onderarm
      const eb = [E[0] - (Wr[0] - E[0]) * 0.22, E[1] - (Wr[1] - E[1]) * 0.22, E[2] - (Wr[2] - E[2]) * 0.22];
      link(eb, E, 7.5, 7.5, '#475569');
      link(E, Wr, 6.5, 4.6, body);
      joint(E, 4.8, body);
      joint(Wr, 3.3, '#475569');
      // gereedschap
      tool(st.fx, Wr, Tp, !!car, car);
      if (car && Math.random() < 0.45) emitFx(st.fx, Tp, car);
    }
  }

  function emitFx(fx, tip, car) {
    const m = MODELS[car.model];
    const n = fx === 'spray' ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const pt = { x: tip[0], y: tip[1], z: tip[2] - 0.05, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 0.6, vz: Math.random() * 1.2, life: 0.4 + Math.random() * 0.3, size: 2, col: '#fbbf24' };
      if (fx === 'weld') { pt.col = Math.random() < 0.5 ? '#fde047' : '#fb923c'; pt.vz = Math.random() * 2.5; pt.vx *= 2; }
      else if (fx === 'spray') { pt.col = car.golden ? '#fbbf24' : m.color; pt.size = 4; pt.vz = -0.6; pt.vy = 0.9; pt.life = 0.5; pt.alpha = 0.5; }
      else if (fx === 'bolt') { pt.col = '#e0f2fe'; pt.size = 2.5; pt.life = 0.2; }
      else if (fx === 'press') { pt.col = '#cbd5e1'; pt.size = 3; pt.life = 0.3; pt.vz = 0.3; }
      else if (fx === 'scan') { pt.col = '#34d399'; pt.size = 2; pt.vx = 0; pt.vz = 0; pt.vy = 0; pt.life = 0.25; }
      else if (fx === 'polish') { pt.col = '#ffffff'; pt.size = 3; pt.star = true; pt.vz = 0.6; }
      R.particles.push(pt);
    }
    if (R.particles.length > 600) R.particles.splice(0, 200);
  }

  // ---------- Geautomatiseerd chassismagazijn aan het begin van elke lijn ----------
  // Een hoge, open stellingtoren: chassis liggen opgestapeld, de onderste rolt de band op,
  // de stapel zakt één plek en een portaalrobot zet bovenin een nieuw chassis.
  R.wh = [];
  const WH = { x0: -3.05, w: 2.05, dy: 1.4, d: 2.4, h: 3.5, slot: 0.4, n: 7 };
  R.onSpawn = function (li) {
    const s = R.wh[li] || (R.wh[li] = { drop: 0, grip: 1, count: 0 });
    s.drop = 1;   // stapel zakt van 1 plek hoger naar 0
    s.grip = 0;   // portaalrobot start een nieuwe plaatsing
    s.count++;
  };
  function miniChassis(cx, cy, z, m, col) {
    const L = m.L * 0.95, Wd = m.W * 0.9;
    const x0 = cx - L / 2, y0 = cy - Wd / 2;
    for (const wx of [x0 + 0.2, x0 + L - 0.32]) {
      box(wx, y0 - 0.04, z, 0.14, 0.1, 0.14, '#111827', { edge: null });
    }
    box(x0, y0 + 0.06, z + 0.04, L, Wd - 0.12, 0.07, '#3f4652', { edge: 'rgba(0,0,0,0.25)' });
    box(x0 + 0.05, y0 + 0.1, z + 0.11, L - 0.1, 0.06, 0.04, col, { edge: null });
    box(x0 + 0.05, y0 + Wd - 0.22, z + 0.11, L - 0.1, 0.06, 0.04, col, { edge: null });
    for (const wx of [x0 + 0.2, x0 + L - 0.32]) {
      box(wx, y0 + Wd - 0.08, z, 0.14, 0.1, 0.14, '#111827', { edge: null });
    }
  }
  function drawWarehouse(li) {
    const y0 = R.lineY(li);
    const st = R.wh[li] || (R.wh[li] = { drop: 0, grip: 1, count: 0 });
    const { x0, w, dy, d, h, slot, n } = WH;
    const yA = y0 + dy, x1 = x0 + w, yB = yA + d;
    const m = MODELS[G.s.model];
    const steel = '#475569', post = '#334155', accent = '#f59e0b';
    const beltZ = 0.32;
    // sokkel + vloerplaat
    box(x0 - 0.1, yA - 0.1, 0, w + 0.2, d + 0.2, 0.18, '#1e293b');
    // achterwand van het rek (gaas-achtig)
    poly([proj(x0, yA, 0.18), proj(x1, yA, 0.18), proj(x1, yA, h), proj(x0, yA, h)], 'rgba(51,65,85,0.85)');
    ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let z = 0.5; z < h; z += slot) { const a = proj(x0, yA, z), b = proj(x1, yA, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // achterste staanders
    box(x0, yA, 0.18, 0.12, 0.12, h - 0.18, post, { edge: null });
    box(x1 - 0.12, yA, 0.18, 0.12, 0.12, h - 0.18, post, { edge: null });
    // zijrails waarlangs de chassis zakken
    box(x0 + 0.12, yA + 0.12, 0.18, w - 0.24, 0.06, h - 0.3, '#64748b', { edge: null });
    // stapel chassis (van onder naar boven tekenen)
    const cx = (x0 + x1) / 2 + 0.05, cy = y0 + 2.6;
    const ease = st.drop * st.drop * (3 - 2 * st.drop);
    const rails = G.s.models[G.s.model] ? accent : accent;
    for (let k = 0; k < n; k++) {
      const z = beltZ + (k + ease) * slot;
      if (z + 0.2 > h - 0.55) break;
      miniChassis(cx, cy, z, m, rails);
    }
    // portaalrobot bovenin: grijper zakt met een nieuw chassis naar de bovenste vrije plek
    const topZ = beltZ + (n - 1) * slot;
    const g = st.grip;                       // 0 → 1
    const phase = g < 0.5 ? g / 0.5 : 1 - (g - 0.5) / 0.5; // omlaag en weer omhoog
    const gz = h - 0.45 - phase * (h - 0.45 - (topZ + 0.25));
    const carrying = g < 0.5;
    // kabels
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const ky of [cy - 0.25, cy + 0.25]) { const a = proj(cx, ky, h - 0.1), b = proj(cx, ky, gz + 0.2); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    if (carrying && gz - 0.2 > topZ) miniChassis(cx, cy, gz - 0.2, m, rails);
    box(cx - 0.55, cy - 0.45, gz, 1.1, 0.9, 0.18, accent, { top: '#fcd34d' });
    box(cx - 0.6, cy - 0.5, gz - 0.06, 0.1, 1.0, 0.1, '#1f2937', { edge: null });
    box(cx + 0.5, cy - 0.5, gz - 0.06, 0.1, 1.0, 0.1, '#1f2937', { edge: null });
    // uitvoeropening onderaan richting de band
    quadRight(x1 + 0.001, yA + 0.55, 0.2, d - 1.1, 0.5, '#0b1220');
    // voorste staanders + dwarsbalken
    box(x0, yB - 0.12, 0.18, 0.12, 0.12, h - 0.18, post, { edge: null });
    box(x1 - 0.12, yB - 0.12, 0.18, 0.12, 0.12, h - 0.18, post, { edge: null });
    box(x1 - 0.12, yA, 0.18, 0.12, 0.12, h - 0.18, post, { edge: null });
    // glaspanelen (doorzichtig, zodat je de stapel ziet)
    poly([proj(x0, yB, 0.75), proj(x1, yB, 0.75), proj(x1, yB, h - 0.1), proj(x0, yB, h - 0.1)], 'rgba(186,230,253,0.16)', 'rgba(186,230,253,0.45)', 1);
    poly([proj(x1, yA, 0.75), proj(x1, yB, 0.75), proj(x1, yB, h - 0.1), proj(x1, yA, h - 0.1)], 'rgba(186,230,253,0.12)', 'rgba(186,230,253,0.4)', 1);
    // waarschuwingsstrepen onderaan voor
    for (let k = 0; k < 6; k++) {
      const sx = x0 + 0.1 + k * (w - 0.2) / 6;
      quadFront(sx, yB + 0.001, 0.2, (w - 0.2) / 12, 0.5, k % 2 ? '#111827' : accent);
      quadFront(sx + (w - 0.2) / 12, yB + 0.001, 0.2, (w - 0.2) / 12, 0.5, k % 2 ? accent : '#111827');
    }
    // dak / portaalbalk
    box(x0 - 0.05, yA - 0.05, h - 0.1, w + 0.1, d + 0.1, 0.22, steel, { top: '#64748b' });
    box(x0 + 0.15, cy - 0.12, h + 0.12, w - 0.3, 0.24, 0.12, accent, { top: '#fcd34d' });
    // statuslamp
    const busy = st.grip < 1 || st.drop > 0;
    box(x1 - 0.35, yA + 0.2, h + 0.12, 0.18, 0.18, 0.16, busy ? (Math.sin(time * 14) > 0 ? '#22c55e' : '#16a34a') : '#0ea5e9', { edge: null });
    // display met teller op de voorkant
    quadFront(x0 + 0.25, yB + 0.002, h - 0.75, 0.9, 0.38, '#0f172a');
    const p = proj(x0 + 0.33, yB + 0.003, h - 0.5);
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.transform(1, AY / AX, 0, 1, 0, 0);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 8px ui-monospace, Menlo, monospace';
    ctx.fillText('CHASSIS', 0, 0);
    ctx.restore();
  }
  R.updateWarehouses = function (dt) {
    for (const s of R.wh) {
      if (!s) continue;
      if (s.drop > 0) s.drop = Math.max(0, s.drop - dt * 2.8);
      if (s.grip < 1) s.grip = Math.min(1, s.grip + dt * 1.6);
    }
  };

  function drawBelt(li) {
    const y0 = R.lineY(li);
    drawWarehouse(li);
    const bx0 = -0.9, bx1 = G.BELT_END + 0.9, by = y0 + 1.9, bd = 1.4, bh = 0.35;
    // poten
    for (let x = bx0 + 0.6; x < bx1; x += 3.2) box(x, by + 0.2, 0, 0.15, bd - 0.4, bh - 0.05, '#475569', { edge: null });
    box(bx0, by, bh - 0.1, bx1 - bx0, bd, 0.1, '#1f2937', { top: '#2b3442', right: '#111827' });
    // bewegende strepen
    ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
    const off = R.beltOffset % 0.6;
    for (let x = bx0 + off; x < bx1; x += 0.6) { const a = proj(x, by + 0.08, bh + 0.001), b = proj(x, by + bd - 0.08, bh + 0.001); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // zijrails
    box(bx0, by + bd - 0.08, bh - 0.02, bx1 - bx0, 0.08, 0.1, '#94a3b8', { edge: null });
    // rollers op de zijkant
    for (let x = bx0 + 0.3; x < bx1; x += 0.8) discXZ(x, by + bd, bh - 0.17, 0.06, '#64748b');
  }

  function drawShowroomSign(li, full) {
    const y0 = R.lineY(li);
    box(LOT_X - 0.6, y0 + 0.05, 0, 0.12, 0.12, 1.5, '#94a3b8', { edge: null });
    box(LOT_X + 5.0, y0 + 0.05, 0, 0.12, 0.12, 1.5, '#94a3b8', { edge: null });
    box(LOT_X - 0.7, y0 + 0.05, 1.5, 5.7, 0.14, 0.62, full ? (Math.sin(time * 8) > 0 ? '#dc2626' : '#991b1b') : '#1e40af');
    const p = proj(LOT_X - 0.35, y0 + 0.19, 1.62);
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.transform(1, AY / AX, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(full ? 'SHOWROOM FULL!' : 'SHOWROOM', 0, 0);
    ctx.restore();
  }

  R.slotPos = function (li, slot) {
    const col = Math.floor(slot / 3), row = slot % 3;
    return [LOT_X + col * 1.9, R.lineY(li) + 1.1 + row * 1.25];
  };

  function drawLot(li, line) {
    // achterste rij eerst
    const entries = line.lot.slice().sort((a, b) => (a.slot % 3) - (b.slot % 3) || a.slot - b.slot);
    for (const e of entries) {
      const sp = R.slotPos(li, e.slot);
      const ease = e.anim < 1 ? 1 - Math.pow(1 - e.anim, 3) : 1;
      const sx = G.BELT_END + 0.8, sy = R.lineY(li) + 2.6;
      let x = sx + (sp[0] - sx) * ease, y = sy + (sp[1] - sy) * ease;
      let alpha = 1;
      if (e.leaving) { x += e.leaving * e.leaving * 6; alpha = Math.max(0, 1 - e.leaving); }
      const m = MODELS[e.car.model];
      ctx.globalAlpha = alpha;
      drawCar(x, y, e.anim < 1 ? 0.15 * (1 - ease) : 0, m, e.car.stage, e.car.golden);
      ctx.globalAlpha = 1;
      if (!e.leaving) {
        // klikgebied
        const a = R.toScreen(x - m.L / 2, y + m.W / 2, 0), b = R.toScreen(x + m.L / 2, y - m.W / 2, m.H + m.cab + 0.2);
        R.hits.push({ x: Math.min(a[0], b[0]) - 6, y: Math.min(a[1], b[1]) - 6, w: Math.abs(b[0] - a[0]) + 12, h: Math.abs(b[1] - a[1]) + 12, kind: 'lot', li, slot: e.slot });
        // verkoop-label als verkoop handmatig is
        if (!G.s.upg.autoSell && e.anim >= 1) R._lotTags.push([x, y, m, e.car]);
      }
    }
  }
  R._lotTags = [];

  function drawGhostLine(li) {
    const y0 = R.lineY(li);
    const lb = G.buildInfo('line');
    if (lb) {
      // bouwplaats: de band wordt van links naar rechts gelegd, met steigers langs de lijn
      const p = lb.progress, bx0 = -0.9, bx1 = G.BELT_END + 0.9, xe = bx0 + (bx1 - bx0) * p, by = y0 + 1.9;
      poly([proj(-1, y0 + 1.6, 0.02), proj(G.BELT_END + 1, y0 + 1.6, 0.02), proj(G.BELT_END + 1, y0 + 3.6, 0.02), proj(-1, y0 + 3.6, 0.02)], 'rgba(56,189,248,0.08)');
      if (xe > bx0 + 0.05) box(bx0, by, 0.25, xe - bx0, 1.4, 0.1, '#1f2937', { top: '#2b3442', right: '#111827' });
      for (let k = 0; k < G.ST_X.length; k++) {
        const x = G.ST_X[k];
        box(x - 1.15, y0 + 0.15, 0, 2.3, 1.55, 0.12, x < xe ? '#64748b' : '#94a3b8', { edge: 'rgba(0,0,0,0.12)' });
        if (Math.abs(x - xe) < 1.8) drawConstruction(x, y0, ST[k], Math.min(1, Math.max(0.05, 1 - Math.abs(x - xe) / 1.8)));
      }
      // bouwrobot aan het eind van de band
      box(xe - 0.25, by + 0.1, 0.35, 0.5, 1.2, 0.35, '#facc15');
      if (Math.random() < 0.5) R.particles.push({ x: xe, y: by + 0.7, z: 0.45, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 1, vz: 1 + Math.random() * 2, life: 0.4, size: 2, col: '#fde047' });
      const c = R.toScreen(12, y0 + 2.6, 0.6);
      R._buildLabel = [c[0], c[1], lb];
      return;
    }
    ctx.setLineDash([8, 6]);
    poly([proj(-1, y0 + 1.6, 0.02), proj(G.BELT_END + 1, y0 + 1.6, 0.02), proj(G.BELT_END + 1, y0 + 3.6, 0.02), proj(-1, y0 + 3.6, 0.02)], 'rgba(37,99,235,0.08)', 'rgba(37,99,235,0.5)', 2);
    ctx.setLineDash([]);
    const c = R.toScreen(12, y0 + 2.6, 0);
    const pad = 12;
    const can = G.canBuyLine(), afford = G.s.money >= G.lineCost();
    const txt = can ? `🏗️ Build production line ${li + 1} · ${CFT.fmtMoney(G.lineCost())}` : `🔒 Production line ${li + 1} · ${G.reqText(CFT.LINE_REQ[li])}`;
    const short = R.cam.zoom < 0.5 || R.portrait;
    const txt2 = short ? (can ? `🏗️ Line ${li + 1} · ${CFT.fmtMoney(G.lineCost())}` : `🔒 Line ${li + 1}`) : txt;
    R._labels.push({ x: c[0], y: c[1], text: txt2, bg: can && afford ? '#16a34a' : can ? '#1e40af' : 'rgba(30,41,59,0.75)', big: !short, pulse: can && afford });
    R.hits.push({ x: c[0] - 90, y: c[1] - 20, w: 180, h: 40, kind: 'ghost' });
  }

  // ---------- Overlays (scherm-ruimte) ----------
  R._labels = [];
  function pill(x, y, text, bg, opt) {
    opt = opt || {};
    const fs = opt.big ? 14 : opt.small ? 10 : 12;
    ctx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const w = ctx.measureText(text).width + (opt.small ? 10 : 16), h = fs + (opt.small ? 7 : 10);
    let s = 1;
    if (opt.pulse) s = 1 + Math.sin(time * 6) * 0.06;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(-w / 2, -h / 2 + 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = bg;
    roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    if (opt.border) { ctx.strokeStyle = opt.border; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = opt.color || '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
    ctx.restore();
    return w;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  R.roundRect = (c, x, y, w, h, r) => { const o = ctx; ctx = c; roundRect(x, y, w, h, r); ctx = o; };

  // Label boven een bouwproject: resterende tijd, voortgang en de 'direct klaar'-knop
  function buildLabel(x, y, info, which, wide) {
    if (!info) return;
    const small = R.cam.zoom < 0.5;
    const w = pill(x, y, `🏗️ ${CFT.fmtTime(Math.ceil(info.left))}`, 'rgba(12,74,110,0.92)', { small, big: wide && !small, border: '#38bdf8' });
    const bw = Math.max(40, w - 10), bx = x - bw / 2, by = y + (small ? 10 : 13);
    ctx.fillStyle = 'rgba(15,23,42,0.7)'; roundRect(bx, by, bw, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#38bdf8'; roundRect(bx, by, Math.max(5, bw * info.progress), 5, 2.5); ctx.fill();
    pill(x, by + (small ? 16 : 20), '📺 Finish now', '#d97706', { small, pulse: true });
    if (which) R.hits.push({ x: x - 80, y: y - 16, w: 160, h: (small ? 44 : 56), kind: 'buildsite', which });
  }

  function stationOverlays() {
    const s = G.s;
    // knelpunt bepalen
    let bott = -1, bt = 0;
    for (let i = 0; i < ST.length; i++) if (s.stations[i]) { const t = G.stationTime(i); if (t > bt) { bt = t; bott = i; } }
    const nextBuild = s.stations.findIndex(l => l === 0);
    for (let li = 0; li < s.lines; li++) {
      const line = G.rt.lines[li];
      const y0 = R.lineY(li);
      for (let i = 0; i < ST.length; i++) {
        const lvl = s.stations[i];
        const x = G.ST_X[i];
        const top = R.toScreen(x, y0 + 0.75, 1.75);
        const a = R.toScreen(x - 1.15, y0 + 1.7, 0), b = R.toScreen(x + 1.15, y0 + 0.15, 1.5);
        R.hits.push({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]) - 26, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) + 30, kind: 'station', li, i });
        if (!lvl && G.isBuilding(i)) {
          R.hits[R.hits.length - 1].kind = 'buildsite';
          R.hits[R.hits.length - 1].which = 'st';
          if (li === 0) buildLabel(top[0], top[1] + 8, G.buildInfo('st'), 'st');
          continue;
        }
        if (li > 0) continue; // labels alleen bij de eerste lijn (alle lijnen delen dezelfde levels)
        if (!lvl) {
          if (i === nextBuild && li === 0) {
            const afford = s.money >= ST[i].build;
            pill(top[0], top[1] + 14, R.cam.zoom < 0.5 ? `🔨 ${CFT.fmtMoney(ST[i].build)}` : `${ST[i].icon} Build ${ST[i].short} · ${CFT.fmtMoney(ST[i].build)}`, afford ? '#16a34a' : 'rgba(30,41,59,0.8)', { pulse: afford, small: R.cam.zoom < 0.5 });
          } else if (li === 0 && R.cam.zoom >= 0.5) {
            pill(top[0], top[1] + 14, `🔒 ${ST[i].short}`, 'rgba(71,85,105,0.7)');
          }
          continue;
        }
        const sel = R.selected === i;
        if (R.cam.zoom < 0.5) { pill(top[0], top[1], String(lvl), sel ? '#2563eb' : 'rgba(15,23,42,0.82)', { small: true, border: lvl >= 25 ? '#fbbf24' : null }); continue; }
        const w = pill(top[0], top[1], `${ST[i].icon} Lv ${lvl}`, sel ? '#2563eb' : 'rgba(15,23,42,0.82)', { border: lvl >= 25 ? '#fbbf24' : null });
        // voortgangsbalk
        const car = line.cars.find(c => c.proc === i);
        const bw = Math.max(44, w - 8), bx = top[0] - bw / 2, by = top[1] + 13;
        ctx.fillStyle = 'rgba(15,23,42,0.6)'; roundRect(bx, by, bw, 5, 2.5); ctx.fill();
        if (car) {
          const p = Math.min(1, car.pt / G.stationTime(i));
          ctx.fillStyle = '#22c55e'; roundRect(bx, by, Math.max(5, bw * p), 5, 2.5); ctx.fill();
        }
        if (i === bott && s.stations.filter(Boolean).length > 1 && line.cars.some(c => c.proc < 0 && c.x < G.ST_X[i] && G.ST_X[i] - c.x < G.GAP * 1.3)) {
          pill(top[0], by + 18, '⏳ Bottleneck', '#ea580c');
        }
      }
      if (line.full && s.upg.autoSell === 0) {
        const p = R.toScreen(LOT_X + 2.5, y0 + 2.5, 1.6);
        pill(p[0], p[1], '👆 Tap a car to sell it', '#dc2626', { pulse: true });
      }
    }
    // prijskaartjes bij geparkeerde auto's (handmatige verkoop)
    for (const [x, y, m, car] of R._lotTags) {
      const p = R.toScreen(x, y, m.H + m.cab + 0.45);
      pill(p[0], p[1], CFT.fmtMoney(G.carProfit(car.stage, car.golden, car.model)), car.golden ? '#ca8a04' : '#16a34a', { pulse: true, small: R.cam.zoom < 0.5 });
    }
    for (const l of R._labels) pill(l.x, l.y, l.text, l.bg, l);
    if (R._buildLabel) { const [bx, by, info] = R._buildLabel; R._buildLabel = null; buildLabel(bx, by, info, 'line', true); }
  }

  // ---------- Hoofd-render ----------
  R.init = function (c) {
    canvas = c;
    ctx = c.getContext('2d');
    G.on('spawn', li => R.onSpawn(li));
    R.resize();
  };
  R.resize = function () {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    // smal staand scherm: band loopt van boven naar beneden zodat alles groter in beeld past
    const port = H > W * 1.15;
    if (port !== R.portrait) { R.portrait = port; R.cam.user = false; }
    setProj(port ? PROJ_PORT : PROJ_LAND);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!R.cam.user) R.fit();
  };
  R.bounds = function () {
    const lines = G.s.lines, ghost = lines < CFT.MAX_LINES;
    const y1 = R.lineY(lines - 1) + 5.0 + (ghost ? R.LINE_GAP : 0);
    const pts = [proj(FLOOR_X0 - 0.4, -2.2, 3.4), proj(FLOOR_X1, -2.2, 3.4), proj(FLOOR_X1, y1, -0.4), proj(FLOOR_X0 - 0.4, y1, -0.4), proj(FLOOR_X0 - 0.4, y1, 3.4)];
    let x0 = Infinity, x1 = -Infinity, ya = Infinity, yb = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); ya = Math.min(ya, p[1]); yb = Math.max(yb, p[1]); }
    return { x0, x1, y0: ya, y1: yb };
  };
  R.fit = function () {
    const b = R.bounds();
    const aw = W - R.pad.l - R.pad.r, ah = H - R.pad.t - R.pad.b;
    let z = Math.min(aw / (b.x1 - b.x0), ah / (b.y1 - b.y0));
    // op smalle schermen: inzoomen op de eerste lijn i.p.v. alles piepklein
    const minZ = 0.3;
    z = Math.max(minZ, Math.min(1.6, z));
    R.cam.zoom = z;
    if (z * (b.x1 - b.x0) > aw) {
      // past niet: begin bij de productiestart en volg naar rechts
      const focus = proj(8, 2.6, 0);
      R.cam.ox = R.pad.l + aw * 0.42 - focus[0] * z;
      R.cam.oy = R.pad.t + ah * 0.5 - focus[1] * z;
    } else {
      R.cam.ox = R.pad.l + (aw - (b.x1 - b.x0) * z) / 2 - b.x0 * z;
      R.cam.oy = R.pad.t + (ah - (b.y1 - b.y0) * z) / 2 - b.y0 * z;
    }
  };
  R.zoomAt = function (sx, sy, f) {
    const z = Math.max(0.25, Math.min(3, R.cam.zoom * f));
    const k = z / R.cam.zoom;
    R.cam.ox = sx - (sx - R.cam.ox) * k;
    R.cam.oy = sy - (sy - R.cam.oy) * k;
    R.cam.zoom = z;
    R.cam.user = true;
  };
  R.pan = function (dx, dy) {
    R.cam.ox += dx; R.cam.oy += dy; R.cam.user = true;
    // binnen bereik houden
    const b = R.bounds(), z = R.cam.zoom;
    R.cam.ox = Math.min(W - 80 - b.x0 * z, Math.max(80 - b.x1 * z, R.cam.ox));
    R.cam.oy = Math.min(H - 80 - b.y0 * z, Math.max(80 - b.y1 * z, R.cam.oy));
  };

  R.addFloat = function (x, y, z, text, col, big) {
    R.floats.push({ x, y, z, text, col: col || '#16a34a', life: 1.4, big });
    if (R.floats.length > 60) R.floats.shift();
  };
  R.burst = function (x, y, z, col, n) {
    for (let k = 0; k < (n || 14); k++) R.particles.push({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 1 + Math.random() * 2.5, life: 0.6 + Math.random() * 0.5, size: 3, col: col || '#fbbf24', coin: true });
  };

  R.draw = function (dt) {
    time += dt;
    R._dt = Math.min(0.05, dt);
    R.updateWarehouses(dt);
    R.beltOffset += G.beltSpeed() * dt * (G.rt.lines.some(l => l.cars.length) ? 1 : 0);
    const s = G.s;
    R.hits = []; R._labels = []; R._lotTags = []; R._sparkles = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // achtergrond
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1e3a8a'); g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // wereld
    ctx.setTransform(dpr * R.cam.zoom, 0, 0, dpr * R.cam.zoom, dpr * R.cam.ox, dpr * R.cam.oy);
    const ghost = s.lines < CFT.MAX_LINES;
    drawFloor(s.lines, ghost);
    drawWalls(s.lines, ghost);
    for (let li = 0; li < s.lines; li++) {
      const line = G.rt.lines[li];
      const y0 = R.lineY(li);
      for (let i = 0; i < ST.length; i++) drawStation(li, i, line);
      drawShowroomSign(li, line.full);
      drawBelt(li);
      const cars = line.cars.slice().sort((a, b) => a.x - b.x);
      for (const c of cars) {
        const m = MODELS[c.model];
        // kleine hop bij aankomst bij station
        drawCar(c.x, y0 + 2.6, 0.35, m, c.stage, c.golden);
      }
      for (let i = 0; i < ST.length; i++) drawArms(li, i, line);
      drawLot(li, line);
    }
    // deeltjes
    for (let k = R.particles.length - 1; k >= 0; k--) {
      const p = R.particles[k];
      p.life -= dt;
      if (p.life <= 0) { R.particles.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.coin || !p.star) p.vz -= 6 * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.4; }
      const pp = proj(p.x, p.y, p.z);
      ctx.globalAlpha = Math.min(1, p.life * 3) * (p.alpha || 1);
      ctx.fillStyle = p.col;
      if (p.coin) { ctx.beginPath(); ctx.arc(pp[0], pp[1], 3.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#b45309'; ctx.lineWidth = 1; ctx.stroke(); }
      else ctx.fillRect(pp[0] - p.size / 2, pp[1] - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    if (ghost) {
      ctx.setTransform(dpr * R.cam.zoom, 0, 0, dpr * R.cam.zoom, dpr * R.cam.ox, dpr * R.cam.oy);
      drawGhostLine(s.lines);
    }

    // ---- scherm-ruimte ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // fonkelingen gouden auto's
    for (const [x, y] of R._sparkles) {
      for (let k = 0; k < 3; k++) {
        const a = time * 3 + k * 2.1;
        const sx = x + Math.cos(a) * 14 * R.cam.zoom, sy = y + Math.sin(a * 1.3) * 8 * R.cam.zoom;
        star(sx, sy, 3 + Math.sin(time * 8 + k) * 1.5, '#fde047');
      }
    }
    stationOverlays();
    // zwevende teksten
    for (let k = R.floats.length - 1; k >= 0; k--) {
      const f = R.floats[k];
      f.life -= dt; f.z += dt * 1.1;
      if (f.life <= 0) { R.floats.splice(k, 1); continue; }
      const p = R.toScreen(f.x, f.y, f.z);
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `800 ${f.big ? 22 : 16}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(f.text, p[0], p[1]);
      ctx.fillStyle = f.col; ctx.fillText(f.text, p[0], p[1]);
    }
    ctx.globalAlpha = 1;
    // boost-rand
    if (G.boosted()) {
      ctx.strokeStyle = `rgba(250,204,21,${0.35 + Math.sin(time * 4) * 0.15})`;
      ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
    }
  };
  function star(x, y, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.35 : r; const a = (i * Math.PI) / 4; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  R.rotate = function () {}; // draaien bestaat alleen in de 3D-weergave
  R.hitTest = function (x, y) {
    for (let k = R.hits.length - 1; k >= 0; k--) {
      const h = R.hits[k];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  };

  // Losse auto-preview (voor modellen-kaarten)
  R.drawPreview = function (cv, modelIdx, stage, golden) {
    const c2 = cv.getContext('2d');
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    cv.width = w * d; cv.height = h * d;
    const old = ctx; ctx = c2;
    const m = MODELS[modelIdx];
    setProj(PROJ_LAND);
    const sc = Math.min(w / 62, h / 34);
    c2.setTransform(d * sc, 0, 0, d * sc, d * w / 2 - d * sc * proj(0, 0, 0.3)[0], d * h / 2 - d * sc * proj(0, 0, 0.3)[1]);
    const oldSpark = R._sparkles; R._sparkles = [];
    const savedCam = Object.assign({}, R.cam);
    setProj(PROJ_LAND);
    drawCar(0, 0, 0, m, stage == null ? 6 : stage, golden);
    setProj(R.portrait ? PROJ_PORT : PROJ_LAND);
    R.cam = savedCam; R._sparkles = oldSpark;
    ctx = old;
  };
})();
