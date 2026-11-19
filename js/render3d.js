/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — 3D-weergave (three.js)
 * Vervangt de 2D-renderer wanneer WebGL beschikbaar is; de spel-logica (game.js) blijft ongewijzigd.
 * Zonder WebGL, of met ?2d=1 in de URL, blijft de 2D-renderer uit render.js actief.
 * Wereld: spel-coördinaten (x langs de lijn, y diepte, z omhoog) → three (x, z, y).
 */
(function () {
  const CFT = globalThis.CFT, G = CFT.Game, ST = CFT.STATIONS, MODELS = CFT.MODELS, R = CFT.Render;
  const T = globalThis.THREE;
  if (!T || new URLSearchParams(location.search).get('2d') === '1') return;
  try { const c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return; } catch (e) { return; }

  const old2D = Object.assign({}, R);
  const LINE_GAP = R.LINE_GAP = 6.4;
  const LOT_X = 27.6, X0 = -3.2, X1 = 38.6, BELT_Y = 2.6, BELT_H = 0.35;
  const L1 = 0.78, L2 = 0.72, TOOL = 0.26;
  const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

  let renderer, scene, camera, canvas, ov, octx, W = 1, H = 1, dpr = 1, time = 0;
  let sun, hemi, weldLight;
  let hallGroup = null, hallLines = -1, hallGhost = null;
  const lineObjs = [];       // per lijn: { belt, machines[7], scaffold, stack, grip, gripLoad, sign }
  const carMeshes = new Map();
  const geoCache = {};
  let armMeshes = null, particles = null, selRing = null, ghostObj = null, display = null;
  const workers = [];
  const qParam = new URLSearchParams(location.search).get('q');
  const quality = { level: qParam != null ? Math.max(0, Math.min(3, +qParam || 0)) : MOBILE ? 1 : 0, acc: 0, frames: 0, cool: 3, lock: qParam != null };

  R.is3D = true;
  R.cam = { user: false, zoom: 1 };
  const cam = { tx: 12, tz: 3, dist: 40, yaw: 0.32, pitch: 0.82 };
  const goal = Object.assign({}, cam);
  const lens = { x: 0, y: 0, gx: 0, gy: 0 };
  R.pad = R.pad || { t: 70, r: 10, b: 150, l: 10 };
  R.hits = []; R.floats = []; R.flash = {}; R.selected = -1; R.portrait = false;
  R.wh = [];
  R.lineY = li => li * LINE_GAP;
  R.slotPos = (li, slot) => [LOT_X + Math.floor(slot / 3) * 1.9, R.lineY(li) + 1.1 + (slot % 3) * 1.25];

  // ================= Geometrie-bouwer (samengevoegd, met vertexkleuren) =================
  const UNIT_BOX = new T.BoxGeometry(1, 1, 1);
  const _m = new T.Matrix4(), _nm = new T.Matrix3(), _v = new T.Vector3(), _c = new T.Color();
  function Builder() { this.p = []; this.n = []; this.c = []; }
  Builder.prototype.add = function (geo, m, color, glow) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pa = g.attributes.position, na = g.attributes.normal;
    _nm.getNormalMatrix(m); _c.set(color); const k = glow || 1;
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize(); this.n.push(_v.x, _v.y, _v.z);
      this.c.push(_c.r * k, _c.g * k, _c.b * k);
    }
    if (g !== geo) g.dispose();
    return this;
  };
  // doos in spel-coördinaten: hoek (x,y,z), afmetingen w (x), d (y), h (z)
  Builder.prototype.box = function (x, y, z, w, d, h, color, glow) {
    _m.makeScale(w, h, d).setPosition(x + w / 2, z + h / 2, y + d / 2);
    return this.add(UNIT_BOX, _m, color, glow);
  };
  // cilinder met middelpunt (x,y,z); as 'z' = verticaal, 'x' of 'y' = liggend
  Builder.prototype.cyl = function (x, y, z, r, len, axis, color, seg, r2, glow) {
    const g = new T.CylinderGeometry(r2 == null ? r : r2, r, len, seg || 12);
    _m.identity();
    if (axis === 'x') _m.makeRotationZ(-Math.PI / 2); else if (axis === 'y') _m.makeRotationX(Math.PI / 2);
    _m.setPosition(x, z, y);
    this.add(g, _m, color, glow); g.dispose();
    return this;
  };
  Builder.prototype.build = function () {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  };

  // ================= Materialen en texturen =================
  let matLit, matCar, matGlass, matBelt, matFloor;
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }
  function makeMaterials() {
    matLit = new T.MeshLambertMaterial({ vertexColors: true });
    matCar = new T.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x666666 });
    matGlass = new T.MeshLambertMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
    const beltTex = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#232a35'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#39424f'; c.fillRect(0, 0, 6, h);
      c.fillStyle = '#1a2029'; c.fillRect(30, 0, 3, h);
    }, true);
    matBelt = new T.MeshLambertMaterial({ map: beltTex });
    const floorTex = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#c9d1db'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,105,125'},0.05)`; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      c.strokeStyle = 'rgba(80,100,130,0.35)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
    }, true);
    matFloor = new T.MeshLambertMaterial({ map: floorTex });
  }
  function textPlane(text, w, h, bg, fg, font) {
    const tex = canvasTex(512, Math.round(512 * h / w), (c, cw, ch) => {
      if (bg) { c.fillStyle = bg; c.fillRect(0, 0, cw, ch); }
      c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 ${Math.round(ch * (font || 0.62))}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      c.fillText(text, cw / 2, ch / 2 + ch * 0.04, cw * 0.94);
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: !bg }));
    m.userData.dispose = () => { tex.dispose(); m.geometry.dispose(); m.material.dispose(); };
    return m;
  }

  // ================= Hal (statisch; wordt herbouwd als er een lijn bijkomt) =================
  function hallDepth(lines, ghost) { return R.lineY(lines - 1) + 5.4 + (ghost ? LINE_GAP : 0); }
  function disposeGroup(g) {
    g.traverse(o => { if (o.userData.dispose) o.userData.dispose(); else if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    scene.remove(g);
  }
  function buildHall() {
    const lines = G.s.lines, ghost = lines < CFT.MAX_LINES;
    if (hallGroup) disposeGroup(hallGroup);
    hallGroup = new T.Group(); hallLines = lines; hallGhost = ghost;
    const y1 = hallDepth(lines, ghost);
    const b = new Builder(), gl = new Builder();
    // vloerplaat (rand) + vloer met tegeltextuur
    b.box(X0 - 0.4, -2.2, -0.5, X1 - X0 + 0.4, y1 + 2.2, 0.49, '#8a96a8');
    const floor = new T.Mesh(new T.PlaneGeometry(X1 - X0, y1 + 1.8), matFloor.clone());
    floor.material.map = matFloor.map.clone(); floor.material.map.repeat.set((X1 - X0) / 2, (y1 + 1.8) / 2); floor.material.map.needsUpdate = true;
    floor.rotation.x = -Math.PI / 2; floor.position.set((X0 + X1) / 2, 0, (y1 - 1.8) / 2); floor.receiveShadow = true;
    floor.userData.dispose = () => { floor.geometry.dispose(); floor.material.map.dispose(); floor.material.dispose(); };
    hallGroup.add(floor);
    // achterwand met ramen en merkstreep, zijwand
    b.box(X0, -2.2, 0, X1 - X0, 0.4, 3.6, '#e7ecf3');
    b.box(X0 - 0.4, -2.2, 0, 0.4, y1 + 2.2, 3.6, '#dfe5ee');
    b.box(X0 - 0.45, -2.25, 3.6, X1 - X0 + 0.45, 0.5, 0.14, '#64748b');
    b.box(X0 - 0.45, -2.25, 3.6, 0.5, y1 + 2.25, 0.14, '#64748b');
    for (let x = X0 + 1.5; x < X1 - 2.5; x += 4) {
      if (x < 10.6 && x + 2.7 > 0.9) continue; // ruimte voor het logo
      b.box(x - 0.08, -1.81, 1.42, 2.76, 0.03, 1.46, '#64748b');
      b.box(x, -1.79, 1.5, 1.26, 0.02, 1.3, '#9fd0ff', 1.5);
      b.box(x + 1.34, -1.79, 1.5, 1.26, 0.02, 1.3, '#9fd0ff', 1.5);
    }
    b.box(X0, -1.79, 3.1, X1 - X0, 0.02, 0.16, '#2563eb', 1.4);
    for (let y = 1; y < y1 - 2; y += 4.2) {
      b.box(X0 - 0.02, y, 1.5, 0.03, 2.6, 1.3, '#9fd0ff', 1.4);
    }
    const logo = textPlane('CAR FACTORY', 9, 1.25, null, '#1e3a8a', 0.8);
    logo.position.set(5.6, 2.35, -1.78); hallGroup.add(logo);

    for (let li = 0; li < lines; li++) {
      const y0 = R.lineY(li);
      // looppad en veiligheidsstrepen
      b.box(-1.2, y0 + 3.6, 0.004, G.BELT_END + 2.2, 0.14, 0.012, '#eab308');
      b.box(-1.2, y0 + 1.72, 0.004, G.BELT_END + 2.2, 0.06, 0.012, '#eab308');
      // station-platforms
      for (let i = 0; i < ST.length; i++) b.box(G.ST_X[i] - 1.15, y0 + 0.15, 0, 2.3, 1.55, 0.12, '#64748b');
      // band: frame, poten, zijrails, rollen
      const bx0 = -0.9, bx1 = G.BELT_END + 0.9, by = y0 + 1.9, len = bx1 - bx0;
      b.box(bx0, by, 0.2, len, 1.4, 0.13, '#1f2937');
      for (let x = bx0 + 0.5; x < bx1; x += 3.2) { b.box(x, by + 0.12, 0, 0.14, 0.14, 0.2, '#475569'); b.box(x, by + 1.14, 0, 0.14, 0.14, 0.2, '#475569'); }
      b.box(bx0, by - 0.05, 0.3, len, 0.07, 0.1, '#94a3b8');
      b.box(bx0, by + 1.38, 0.3, len, 0.07, 0.1, '#94a3b8');
      b.cyl(bx0, y0 + BELT_Y, 0.22, 0.13, 1.4, 'y', '#475569', 10);
      b.cyl(bx1, y0 + BELT_Y, 0.22, 0.13, 1.4, 'y', '#475569', 10);
      // magazijntoren: sokkel, staanders, dak, portaalbalk
      const wx = -3.05, ww = 2.05, wy = y0 + 1.4, wd = 2.4, wh = 3.6;
      b.box(wx - 0.1, wy - 0.1, 0, ww + 0.2, wd + 0.2, 0.18, '#1e293b');
      for (const [px, py] of [[wx, wy], [wx + ww - 0.12, wy], [wx, wy + wd - 0.12], [wx + ww - 0.12, wy + wd - 0.12]]) b.box(px, py, 0.18, 0.12, 0.12, wh - 0.18, '#334155');
      b.box(wx + 0.12, wy + 0.02, 0.18, ww - 0.24, 0.05, wh - 0.3, '#475569');
      for (let z = 0.6; z < wh - 0.3; z += 0.42) { b.box(wx + 0.12, wy + 0.3, z, 0.05, 0.05, 0.04, '#94a3b8'); b.box(wx + ww - 0.17, wy + 0.3, z, 0.05, 0.05, 0.04, '#94a3b8'); }
      b.box(wx - 0.05, wy - 0.05, wh - 0.1, ww + 0.1, wd + 0.1, 0.2, '#475569');
      b.box(wx + 0.15, y0 + BELT_Y - 0.12, wh + 0.1, ww - 0.3, 0.24, 0.12, '#f59e0b');
      for (let k = 0; k < 8; k++) b.box(wx + 0.05 + k * (ww - 0.1) / 8, wy + wd + 0.001, 0.2, (ww - 0.1) / 8, 0.02, 0.4, k % 2 ? '#111827' : '#f59e0b');
      b.box(wx + 0.3, wy + wd + 0.001, wh - 0.75, 0.8, 0.02, 0.34, '#0f172a');
      b.box(wx + 0.36, wy + wd + 0.012, wh - 0.68, 0.5, 0.01, 0.08, '#38bdf8', 2.2);
      gl.box(wx + 0.02, wy + wd - 0.03, 0.75, ww - 0.04, 0.02, wh - 0.9, '#fff');
      gl.box(wx + ww - 0.03, wy + 0.05, 0.75, 0.02, wd - 0.1, wh - 0.9, '#fff');
      // showroomvloer met parkeervakken
      b.box(LOT_X - 1.25, y0 + 0.35, 0.003, X1 - LOT_X + 0.95, 4.25, 0.014, '#f1f5f9');
      for (let cidx = 0; cidx <= 4; cidx++) b.box(LOT_X - 0.97 + cidx * 1.9, y0 + 0.55, 0.018, 0.04, 3.75, 0.004, '#3b82f6');
      // bord
      b.box(LOT_X - 0.6, y0 + 0.05, 0, 0.1, 0.1, 1.9, '#94a3b8'); b.box(LOT_X + 5.0, y0 + 0.05, 0, 0.1, 0.1, 1.9, '#94a3b8');
      b.box(LOT_X - 0.7, y0 + 0.03, 1.9, 5.9, 0.14, 0.66, '#1e40af');
      // rekwerk en kisten langs het looppad
      const ry = y0 + 4.75;
      b.box(0.4, ry, 0, 1.9, 0.6, 0.06, '#475569');
      for (let k = 0; k < 3; k++) { b.box(0.5 + k * 0.6, ry + 0.06, 0.06, 0.5, 0.48, 0.42, k % 2 ? '#b45309' : '#ca8a04'); }
      b.box(0.8, ry + 0.08, 0.48, 0.5, 0.44, 0.38, '#a16207');
      for (const px of [12.2, 13.9]) { b.box(px, ry, 0, 0.07, 0.07, 1.25, '#eab308'); b.box(px, ry + 0.6, 0, 0.07, 0.07, 1.25, '#eab308'); }
      for (const z of [0.1, 0.62]) { b.box(12.2, ry, z + 0.02, 1.77, 0.67, 0.05, '#64748b'); for (let k = 0; k < 4; k++) b.cyl(12.5 + k * 0.4, ry + 0.33, z + 0.3, 0.22, 0.16, 'x', '#111827', 12); }
      b.box(20.4, ry + 0.05, 0, 0.9, 0.5, 0.62, '#2563eb'); b.box(20.45, ry + 0.02, 0.2, 0.8, 0.04, 0.1, '#e2e8f0'); b.box(20.45, ry + 0.02, 0.4, 0.8, 0.04, 0.1, '#e2e8f0');
      const sign = textPlane('SHOWROOM', 5.6, 0.5, null, '#ffffff', 0.78);
      sign.position.set(LOT_X + 2.25, 2.23, y0 + 0.18); hallGroup.add(sign);
    }
    // presentatieplateau met het huidige model (rechts achterin)
    const dx = 36.4, dy = 2.2;
    b.cyl(dx, dy, 0.07, 1.55, 0.14, 'z', '#e2e8f0', 28);
    b.cyl(dx, dy, 0.15, 1.6, 0.03, 'z', '#38bdf8', 28, 1.6, 2.2);
    gl.box(34.7, -1.75, 0, 3.6, 0.03, 2.6, '#fff');
    for (const [px, py] of [[34.6, 0.2], [38.1, 4.6], [34.4, 4.9]]) { b.cyl(px, py, 0.2, 0.2, 0.4, 'z', '#92400e', 10, 0.26); b.cyl(px, py, 0.75, 0.05, 0.7, 'z', '#166534', 6); for (let k = 0; k < 5; k++) { const a = k * 1.256; b.box(px + Math.cos(a) * 0.22 - 0.16, py + Math.sin(a) * 0.22 - 0.16, 0.85 + (k % 2) * 0.22, 0.32, 0.32, 0.26, k % 2 ? '#16a34a' : '#22c55e'); } }

    const lit = new T.Mesh(b.build(), matLit); lit.castShadow = true; lit.receiveShadow = true; hallGroup.add(lit);
    const glass = new T.Mesh(gl.build(), matGlass); glass.renderOrder = 5; hallGroup.add(glass);
    scene.add(hallGroup);
    // zonlicht en schaduwgebied op de hal afstemmen
    const cx = (X0 + X1) / 2, cz = (y1 - 2.2) / 2, ext = Math.max(X1 - X0, y1 + 2.2) / 2 + 3;
    sun.position.set(cx - 14, 30, cz + 20); sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 90; sc.updateProjectionMatrix();
  }

  // ================= Machines per station =================
  function machineGeo(i, tier) {
    const key = 'mach' + i + '-' + tier;
    if (geoCache[key]) return geoCache[key];
    const st = ST[i], b = new Builder(), col = st.color, trim = tier >= 1 ? '#fbbf24' : '#cbd5e1', steel = '#475569';
    const light = '#' + new T.Color(col).lerp(new T.Color('#ffffff'), 0.35).getHexString();
    // schakelkast achter de band
    b.box(-0.95, 0.25, 0.12, 1.9, 1.05, 1.05, col);
    b.box(-0.8, 0.35, 1.17, 1.6, 0.85, 0.1, tier >= 1 ? '#fbbf24' : light);
    b.box(-0.75, 1.3, 0.42, 0.72, 0.02, 0.46, '#0b1220');
    b.box(-0.7, 1.315, 0.48, 0.5, 0.01, 0.1, st.fx === 'scan' ? '#34d399' : '#38bdf8', 2.4);
    b.box(-0.7, 1.315, 0.64, 0.34, 0.01, 0.08, '#fde047', 2);
    for (let k = 0; k < 4; k++) b.box(0.2 + k * 0.16, 1.3, 0.45, 0.09, 0.02, 0.4, '#1f2937');
    b.box(0.55, 0.6, 1.27, 0.16, 0.16, 0.18, '#22c55e', 2.6);
    if (tier >= 2) { b.cyl(-0.6, 0.6, 1.6, 0.03, 0.7, 'z', '#94a3b8', 6); b.cyl(-0.6, 0.6, 1.98, 0.07, 0.08, 'z', '#ef4444', 8, 0.07, 2.6); b.box(-0.2, 0.45, 1.27, 0.5, 0.5, 0.22, '#334155'); }
    if (tier >= 3) b.box(-1.0, 0.2, 0.12, 2.0, 0.04, 0.05, '#22d3ee', 2.6);
    // portaal over de band (per station anders)
    const pil = (x, y, h, c) => b.box(x - 0.06, y - 0.06, 0.12, 0.12, 0.12, h, c || steel);
    const HH = 1.95, ya = 1.76, yb = 3.44;
    if (i === 0) { // lasportaal met kabelgoot
      pil(-1.08, ya, HH); pil(1.08, ya, HH); b.box(-1.14, ya - 0.06, HH + 0.06, 2.28, 0.12, 0.14, trim);
      b.box(-0.9, ya - 0.2, HH - 0.25, 1.8, 0.1, 0.06, '#1f2937');
    } else if (i === 1) { // takel met motorblok
      pil(-1.0, ya, HH + 0.2); b.box(-1.06, ya - 0.06, HH + 0.26, 0.12, 1.2, 0.12, trim);
      b.cyl(-1.0, ya + 0.95, HH - 0.1, 0.015, 0.7, 'z', '#111827', 4); b.box(-1.16, ya + 0.8, HH - 0.72, 0.32, 0.3, 0.28, '#9ca3af'); b.box(-1.12, ya + 0.84, HH - 0.44, 0.24, 0.22, 0.06, '#ef4444');
    } else if (i === 2) { // pers
      pil(-1.08, ya, HH, col); pil(1.08, ya, HH, col); pil(-1.08, yb, HH, col); pil(1.08, yb, HH, col);
      b.box(-1.16, ya - 0.08, HH + 0.08, 0.2, yb - ya + 0.16, 0.26, col); b.box(0.96, ya - 0.08, HH + 0.08, 0.2, yb - ya + 0.16, 0.26, col);
      b.box(-1.16, ya - 0.08, HH + 0.08, 2.32, 0.2, 0.26, col); b.box(-1.16, yb - 0.12, HH + 0.08, 2.32, 0.2, 0.26, col);
      b.box(-0.45, ya + 0.1, HH + 0.02, 0.9, yb - ya - 0.2, 0.2, '#94a3b8'); b.cyl(0, 2.6, HH - 0.2, 0.12, 0.5, 'z', '#cbd5e1', 10);
      b.box(-1.16, yb + 0.09, HH + 0.14, 2.32, 0.02, 0.1, '#fde047', 1.6);
    } else if (i === 3) { // spuitcabine: tunnel met lichtbalken
      pil(-1.12, ya, HH, light); pil(1.12, ya, HH, light); pil(-1.12, yb, HH, light); pil(1.12, yb, HH, light);
      b.box(-1.2, ya - 0.08, HH + 0.1, 2.4, 0.16, 0.16, col); b.box(-1.2, yb - 0.08, HH + 0.1, 2.4, 0.16, 0.16, col);
      b.box(-1.2, ya - 0.08, HH + 0.1, 0.16, yb - ya + 0.16, 0.16, col); b.box(1.04, ya - 0.08, HH + 0.1, 0.16, yb - ya + 0.16, 0.16, col);
      b.box(-1.18, ya - 0.06, 0.5, 2.36, 0.05, HH - 0.38, light);
      b.box(-1.0, ya + 0.25, HH + 0.06, 2.0, 0.08, 0.04, '#ffffff', 3); b.box(-1.0, yb - 0.33, HH + 0.06, 2.0, 0.08, 0.04, '#ffffff', 3);
      b.box(-1.2, yb + 0.07, HH + 0.14, 2.4, 0.02, 0.08, '#f472b6', 2.4);
      b.cyl(0.7, 0.8, 1.55, 0.14, 0.6, 'z', '#e5e7eb', 10); b.cyl(0.3, 0.8, 1.5, 0.12, 0.5, 'z', col, 10);
    } else if (i === 4) { // montagebrug met loopkat
      pil(-1.08, ya, HH); pil(1.08, ya, HH); pil(-1.08, yb, HH); pil(1.08, yb, HH);
      b.box(-1.14, ya - 0.06, HH + 0.06, 2.28, 0.1, 0.12, trim); b.box(-1.14, yb - 0.04, HH + 0.06, 2.28, 0.1, 0.12, trim);
      b.box(-0.08, ya - 0.06, HH + 0.1, 0.16, yb - ya + 0.12, 0.1, col); b.box(-0.14, 2.45, HH - 0.12, 0.28, 0.3, 0.22, '#334155');
    } else if (i === 5) { // meetpoort met scanlijnen
      pil(-0.5, ya, HH, '#0f172a'); pil(-0.5, yb, HH, '#0f172a'); b.box(-0.56, ya - 0.06, HH + 0.06, 0.12, yb - ya + 0.12, 0.12, '#0f172a');
      b.box(-0.43, ya + 0.02, 0.5, 0.02, 0.04, HH - 0.5, '#34d399', 2.8); b.box(-0.43, yb - 0.06, 0.5, 0.02, 0.04, HH - 0.5, '#34d399', 2.8);
      b.box(-0.5, ya + 0.1, HH + 0.02, 0.02, yb - ya - 0.2, 0.04, '#34d399', 2.8);
      pil(0.6, ya, HH, '#0f172a'); pil(0.6, yb, HH, '#0f172a'); b.box(0.54, ya - 0.06, HH + 0.06, 0.12, yb - ya + 0.12, 0.12, '#0f172a');
    } else { // afwerktunnel met daglicht
      pil(-1.1, ya, HH, '#e5e7eb'); pil(1.1, ya, HH, '#e5e7eb'); pil(-1.1, yb, HH, '#e5e7eb'); pil(1.1, yb, HH, '#e5e7eb');
      b.box(-1.18, ya - 0.08, HH + 0.1, 2.36, 0.14, 0.14, trim); b.box(-1.18, yb - 0.06, HH + 0.1, 2.36, 0.14, 0.14, trim);
      b.box(-1.18, ya - 0.08, HH + 0.1, 0.14, yb - ya + 0.16, 0.14, trim); b.box(1.04, ya - 0.08, HH + 0.1, 0.14, yb - ya + 0.16, 0.14, trim);
      b.box(-0.9, ya + 0.12, HH + 0.1, 1.8, 0.07, 0.05, '#ffffff', 3); b.box(-0.9, yb - 0.19, HH + 0.1, 1.8, 0.07, 0.05, '#ffffff', 3);
    }
    return (geoCache[key] = b.build());
  }
  function scaffoldGeo() {
    if (geoCache.scaffold) return geoCache.scaffold;
    const b = new Builder(), x0 = -1.1, ya = 0.15, w = 2.2, d = 1.3, H = 2.0;
    for (const [px, py] of [[x0, ya], [x0 + w, ya], [x0, ya + d], [x0 + w, ya + d]]) b.box(px - 0.04, py - 0.04, 0.12, 0.08, 0.08, H, '#64748b');
    for (const z of [0.75, 1.45]) { b.box(x0, ya + d - 0.05, z, w, 0.1, 0.05, '#f59e0b'); b.box(x0 + w - 0.05, ya, z, 0.1, d, 0.05, '#f59e0b'); b.box(x0 - 0.05, ya, z, 0.1, d, 0.05, '#f59e0b'); }
    b.box(x0 - 0.1, ya - 0.05, H + 0.1, w + 0.2, 0.1, 0.1, '#facc15');
    b.box(x0 - 0.1, ya + d - 0.05, H + 0.1, w + 0.2, 0.1, 0.1, '#facc15');
    return (geoCache.scaffold = b.build());
  }

  // ================= Auto's =================
  function carKey(model, stage, golden) { return model + '|' + Math.max(-1, Math.min(6, stage)) + '|' + (golden && stage >= 3 ? 1 : 0); }
  function carGeo(model, stage, golden) {
    const key = 'car' + carKey(model, stage, golden);
    if (geoCache[key]) return geoCache[key];
    const m = MODELS[model], L = m.L, Wd = m.W, Hh = m.H, b = new Builder();
    const hub = stage >= 6 ? '#e5e7eb' : '#6b7280';
    for (const wx of [-L / 2 + 0.27, L / 2 - 0.28]) for (const sy of [-1, 1]) {
      b.cyl(wx, sy * (Wd / 2 - 0.05), 0.17, 0.17, 0.13, 'y', '#111827', 14);
      b.cyl(wx, sy * (Wd / 2 + 0.018), 0.17, 0.085, 0.02, 'y', hub, 10);
    }
    b.box(-L / 2 + 0.06, -Wd / 2 + 0.1, 0.1, L - 0.12, Wd - 0.2, 0.09, '#3f4652');
    if (stage === 0) { b.box(-L / 2 + 0.1, -Wd / 2 + 0.16, 0.19, L - 0.2, 0.07, 0.05, '#f59e0b'); b.box(-L / 2 + 0.1, Wd / 2 - 0.23, 0.19, L - 0.2, 0.07, 0.05, '#f59e0b'); }
    if (stage === 1) {
      b.box(L * 0.1, -Wd * 0.28, 0.19, L * 0.27, Wd * 0.56, 0.22, '#9ca3af'); b.box(L * 0.14, -Wd * 0.2, 0.41, L * 0.18, Wd * 0.4, 0.06, '#ef4444');
      b.box(-L / 2 + 0.1, -Wd / 2 + 0.16, 0.19, L - 0.2, 0.07, 0.05, '#f59e0b'); b.box(-L / 2 + 0.1, Wd / 2 - 0.23, 0.19, L - 0.2, 0.07, 0.05, '#f59e0b');
      if (m.glow) b.box(-L * 0.3, -Wd * 0.3, 0.19, L * 0.35, Wd * 0.6, 0.08, '#0ea5e9', 2);
    }
    if (stage >= 2) {
      const body = golden && stage >= 3 ? '#fbbf24' : stage >= 3 ? m.color : '#a7b0bc';
      const zb = 0.13, zt = zb + Hh, zr = zt + m.cab;
      const cl = m.cabL * L, c0 = -cl / 2 + m.cabX * L, c1 = c0 + cl;
      const rk1 = Math.min(cl * 0.3, m.cab * 1.1), rk0 = Math.min(cl * 0.22, m.cab * 0.7);
      const sh = new T.Shape();
      sh.moveTo(-L / 2 + 0.04, zb); sh.lineTo(L / 2 - 0.05, zb); sh.lineTo(L / 2, zb + Hh * 0.5); sh.lineTo(L / 2 - 0.06, zt - 0.04);
      sh.lineTo(c1, zt); sh.lineTo(c1 - rk1, zr); sh.lineTo(c0 + rk0, zr); sh.lineTo(c0, zt);
      sh.lineTo(-L / 2 + 0.03, zt - 0.02); sh.lineTo(-L / 2, zb + Hh * 0.55); sh.closePath();
      const bt = 0.045;
      const eg = new T.ExtrudeGeometry(sh, { depth: Wd - bt * 2, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.035, bevelSegments: 2, curveSegments: 1 });
      _m.makeTranslation(0, 0, -(Wd - bt * 2) / 2); b.add(eg, _m, body); eg.dispose();
      if (stage >= 4) {
        const glass = '#16263c';
        const sg = new T.Shape();
        sg.moveTo(c0 + 0.07, zt + 0.02); sg.lineTo(c1 - 0.09, zt + 0.02); sg.lineTo(c1 - rk1 - 0.02, zr - 0.05); sg.lineTo(c0 + rk0 + 0.03, zr - 0.05); sg.closePath();
        const gg = new T.ExtrudeGeometry(sg, { depth: Wd + 0.012, bevelEnabled: false });
        _m.makeTranslation(0, 0, -(Wd + 0.012) / 2); b.add(gg, _m, glass); gg.dispose();
        const sw = new T.Shape();
        sw.moveTo(c0 - 0.012, zt + 0.03); sw.lineTo(c1 + 0.014, zt + 0.03); sw.lineTo(c1 - rk1 + 0.014, zr - 0.04); sw.lineTo(c0 + rk0 - 0.012, zr - 0.04); sw.closePath();
        const wg = new T.ExtrudeGeometry(sw, { depth: Wd * 0.8, bevelEnabled: false });
        _m.makeTranslation(0, 0, -Wd * 0.4); b.add(wg, _m, glass); wg.dispose();
        // deurpost
        b.box((c0 + c1) / 2 - 0.02, -Wd / 2 - 0.008, zt, 0.04, Wd + 0.016, m.cab - 0.04, body);
        // kop- en achterlichten
        for (const sy of [-1, 1]) {
          b.box(L / 2 - 0.03, sy * (Wd / 2 - 0.2) - 0.08, zb + Hh * 0.52, 0.04, 0.16, Hh * 0.22, '#fff7d6', stage >= 6 ? 3.2 : 1.6);
          b.box(-L / 2 - 0.006, sy * (Wd / 2 - 0.19) - 0.08, zb + Hh * 0.58, 0.03, 0.16, Hh * 0.18, '#ef4444', stage >= 6 ? 2.6 : 1.2);
        }
      }
      if (stage >= 6) {
        for (const sy of [-1, 1]) b.box(-L / 2 + 0.08, sy * (Wd / 2 + 0.004) - 0.004, zb + Hh * 0.22, L - 0.16, 0.008, 0.03, m.chrome ? '#f8fafc' : '#e2e8f0', 1.5);
        b.box(L / 2 - 0.02, -Wd * 0.22, zb + Hh * 0.2, 0.03, Wd * 0.44, Hh * 0.2, '#0f172a');
        if (m.spoiler) { for (const sy of [-1, 1]) b.box(-L / 2 + 0.06, sy * (Wd / 2 - 0.16) - 0.03, zt - 0.02, 0.05, 0.06, 0.13, '#111827'); b.box(-L / 2 + 0.0, -Wd / 2 + 0.05, zt + 0.11, 0.2, Wd - 0.1, 0.035, '#111827'); }
        if (m.glow) for (const sy of [-1, 1]) b.box(-L / 2 + 0.2, sy * (Wd / 2 - 0.06) - 0.02, 0.07, L - 0.4, 0.04, 0.02, m.glow, 3);
      }
    }
    return (geoCache[key] = b.build());
  }
  function chassisStackGeo(model) {
    const key = 'stack' + model;
    if (geoCache[key]) return geoCache[key];
    const m = MODELS[model], b = new Builder(), L = m.L * 0.95, Wd = m.W * 0.9;
    for (let k = 0; k < 6; k++) {
      const z = k * 0.4;
      b.box(-L / 2, -Wd / 2 + 0.06, z + 0.04, L, Wd - 0.12, 0.07, '#3f4652');
      b.box(-L / 2 + 0.05, -Wd / 2 + 0.1, z + 0.11, L - 0.1, 0.06, 0.04, '#f59e0b'); b.box(-L / 2 + 0.05, Wd / 2 - 0.16, z + 0.11, L - 0.1, 0.06, 0.04, '#f59e0b');
      for (const wx of [-L / 2 + 0.26, L / 2 - 0.26]) for (const sy of [-1, 1]) b.cyl(wx, sy * (Wd / 2 - 0.03), z + 0.08, 0.08, 0.1, 'y', '#111827', 8);
    }
    return (geoCache[key] = b.build());
  }

  // ================= Robotarmen (instanced: alle armen samen in een handvol draw calls) =================
  const ARM = '#f5b81f', ARM_D = '#d99a0b', DARK = '#374151';
  function buildArmMeshes() {
    const mk = (geo, n) => { const im = new T.InstancedMesh(geo, matLit, n); im.frustumCulled = false; im.castShadow = true; im.count = 0; scene.add(im); return im; };
    const N = CFT.MAX_LINES * ST.length * 3;
    let b = new Builder();
    b.cyl(0, 0, 0.06, 0.24, 0.12, 'z', '#1f2937', 16); b.cyl(0, 0, 0.2, 0.18, 0.16, 'z', ARM_D, 16);
    b.box(-0.14, -0.15, 0.28, 0.3, 0.3, 0.26, ARM); b.cyl(0.1, 0, 0.42, 0.13, 0.36, 'y', DARK, 12);
    const turret = mk(b.build(), N);
    b = new Builder();
    b.box(-0.06, -0.075, -0.085, L1 + 0.06, 0.15, 0.17, ARM); b.box(-0.3, -0.1, -0.11, 0.26, 0.2, 0.22, DARK);
    b.cyl(L1, 0, 0, 0.105, 0.22, 'y', DARK, 12); b.box(0.08, -0.02, 0.085, L1 - 0.2, 0.04, 0.03, '#111827');
    b.box(0.2, -0.078, -0.03, 0.3, 0.156, 0.06, '#111827');
    const upper = mk(b.build(), N);
    b = new Builder();
    b.cyl(L2 / 2, 0, 0, 0.075, L2, 'x', ARM, 10, 0.05); b.box(-0.2, -0.085, -0.085, 0.22, 0.17, 0.17, DARK);
    b.cyl(L2, 0, 0, 0.065, 0.14, 'y', DARK, 10);
    const fore = mk(b.build(), N);
    const tools = {};
    const tb = fx => {
      const t = new Builder();
      t.cyl(0, 0, -0.03, 0.06, 0.06, 'z', '#475569', 10);
      if (fx === 'weld') { t.cyl(0, 0, -0.15, 0.03, 0.2, 'z', '#1f2937', 8, 0.04); t.cyl(0, 0, -0.25, 0.012, 0.04, 'z', '#f59e0b', 6, 0.02, 2.5); }
      else if (fx === 'spray') { t.cyl(0, 0, -0.13, 0.04, 0.16, 'z', '#e5e7eb', 8); t.cyl(0, 0, -0.235, 0.05, 0.05, 'z', '#94a3b8', 8, 0.02); t.cyl(0.07, 0, -0.1, 0.035, 0.12, 'z', '#f472b6', 8); }
      else if (fx === 'press') { t.box(-0.14, -0.03, -0.11, 0.28, 0.06, 0.06, '#334155'); t.box(-0.14, -0.025, -0.26, 0.035, 0.05, 0.16, '#111827'); t.box(0.105, -0.025, -0.26, 0.035, 0.05, 0.16, '#111827'); }
      else if (fx === 'scan') { t.box(-0.08, -0.06, -0.2, 0.16, 0.12, 0.14, '#0f172a'); t.cyl(0, 0, -0.22, 0.04, 0.04, 'z', '#34d399', 10, 0.04, 3); }
      else if (fx === 'polish') { t.cyl(0, 0, -0.13, 0.03, 0.16, 'z', '#475569', 8); t.cyl(0, 0, -0.24, 0.17, 0.045, 'z', '#f1f5f9', 16); }
      else { t.cyl(0, 0, -0.13, 0.045, 0.18, 'z', '#64748b', 8); t.cyl(0, 0, -0.245, 0.015, 0.05, 'z', '#e2e8f0', 6); }
      return t.build();
    };
    for (const fx of ['weld', 'bolt', 'press', 'spray', 'scan', 'polish']) tools[fx] = mk(tb(fx), CFT.MAX_LINES * 2 * 3);
    armMeshes = { turret, upper, fore, tools };
  }
  R.armState = {};
  const _q = new T.Quaternion(), _q2 = new T.Quaternion(), _s1 = new T.Vector3(1, 1, 1), _p = new T.Vector3(), AX_Y = new T.Vector3(0, 1, 0), AX_Z = new T.Vector3(0, 0, 1);
  function setInst(im, x, y, z, yaw, pitch) {
    _q.setFromAxisAngle(AX_Y, yaw);
    if (pitch) { _q2.setFromAxisAngle(AX_Z, pitch); _q.multiply(_q2); }
    _m.compose(_p.set(x, z, y), _q, _s1);
    im.setMatrixAt(im.count++, _m);
  }
  function updateArms(dt) {
    const A = armMeshes, s = G.s;
    A.turret.count = A.upper.count = A.fore.count = 0;
    for (const k in A.tools) A.tools[k].count = 0;
    let weld = null;
    for (let li = 0; li < s.lines; li++) {
      const line = G.rt.lines[li], y0 = R.lineY(li);
      for (let i = 0; i < ST.length; i++) {
        const lvl = s.stations[i];
        if (!lvl) continue;
        const st = ST[i], x = G.ST_X[i], car = line.cars.find(c => c.proc === i);
        const arms = lvl >= 50 ? 3 : lvl >= 10 ? 2 : 1;
        const speed = Math.min(14, 1.6 + G.stationSpeed(i) * 0.25) * G.boostMult();
        for (let a = 0; a < arms; a++) {
          const ax = x + (a === 0 ? 0.55 : a === 1 ? -0.55 : 0);
          const B = [ax, y0 + 1.45, 0.12];
          const key = li + '-' + i + '-' + a;
          const stt = R.armState[key] || (R.armState[key] = { tip: [ax, y0 + 1.9, 1.3], wp: Math.random() * 10 });
          let target;
          if (car) {
            const m = MODELS[car.model];
            const topZ = BELT_H + 0.13 + (car.stage >= 2 ? m.H + m.cab * 0.55 : 0.2);
            stt.wp += dt * speed;
            const ph = stt.wp + a * 2.1, side = a === 0 ? 0.35 : a === 1 ? -0.35 : 0, step = Math.floor(ph * 0.5) % 3;
            let ox = side + (step - 1) * 0.22, oz = 0.05, oy = -0.2;
            if (st.fx === 'spray') { ox = side + Math.sin(ph * 0.9) * 0.45; oz = 0.3; }
            else if (st.fx === 'press') oz = 0.04 + Math.max(0, Math.sin(ph * 1.6)) * 0.3;
            else if (st.fx === 'scan') { ox = side + Math.sin(ph * 0.6) * 0.5; oz = 0.32; oy = 0; }
            else if (st.fx === 'polish') { ox = side + Math.sin(ph * 1.1) * 0.35; oy = -0.12 + Math.cos(ph * 1.1) * 0.14; oz = 0.03; }
            else oz = 0.03 + Math.abs(Math.sin(ph * 3)) * 0.06;
            target = [car.x + ox, y0 + BELT_Y + oy, topZ + oz];
          } else target = [ax + 0.04, B[1] + 0.5, 1.2 + 0.03 * Math.sin(time * 1.2 + a + i)];
          const k = 1 - Math.exp(-dt * (car ? 4 + speed * 0.8 : 3));
          for (let j = 0; j < 3; j++) stt.tip[j] += (target[j] - stt.tip[j]) * k;
          const tip = stt.tip;
          // inverse kinematica: draaias → schouder → elleboog → pols (gereedschap wijst omlaag)
          const S0 = [B[0], B[1], B[2] + 0.42], Wp = [tip[0], tip[1], tip[2] + TOOL];
          const hx = Wp[0] - S0[0], hy = Wp[1] - S0[1];
          let r = Math.hypot(hx, hy);
          const ux = r > 1e-4 ? hx / r : 0, uy = r > 1e-4 ? hy / r : 1;
          const S = [S0[0] + ux * 0.1, S0[1] + uy * 0.1, S0[2]];
          r = Math.max(0.05, r - 0.1);
          let dz = Wp[2] - S[2], d = Math.hypot(r, dz);
          const maxD = L1 + L2 - 0.02, minD = Math.abs(L1 - L2) + 0.08;
          if (d > maxD) { r *= maxD / d; dz *= maxD / d; d = maxD; }
          if (d < minD) { const f = minD / Math.max(d, 1e-4); r *= f; dz *= f; d = minD; }
          const sh = Math.atan2(dz, r) + Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
          const er = L1 * Math.cos(sh), ez = L1 * Math.sin(sh);
          const E = [S[0] + ux * er, S[1] + uy * er, S[2] + ez];
          const Wr = [S[0] + ux * r, S[1] + uy * r, S[2] + dz];
          const yaw = Math.atan2(-uy, ux);
          setInst(A.turret, B[0], B[1], B[2], yaw, 0);
          setInst(A.upper, S[0], S[1], S[2], yaw, sh);
          setInst(A.fore, E[0], E[1], E[2], yaw, Math.atan2(dz - ez, r - er));
          setInst(A.tools[st.fx] || A.tools.bolt, Wr[0], Wr[1], Wr[2], yaw + (st.fx === 'polish' && car ? time * 14 : 0), 0);
          if (car) {
            const tp = [Wr[0], Wr[1], Wr[2] - TOOL];
            if (Math.random() < 0.4) emitFx(st.fx, tp, car);
            if (st.fx === 'weld' && li === 0 && !weld) weld = tp;
          }
        }
      }
    }
    A.turret.instanceMatrix.needsUpdate = A.upper.instanceMatrix.needsUpdate = A.fore.instanceMatrix.needsUpdate = true;
    for (const k in A.tools) A.tools[k].instanceMatrix.needsUpdate = true;
    if (weld) { weldLight.position.set(weld[0], weld[2] + 0.1, weld[1]); weldLight.intensity = 6 + Math.random() * 14; }
    else weldLight.intensity = 0;
  }

  // ================= Deeltjes =================
  const PMAX = 500;
  function buildParticles() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(PMAX * 3), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(PMAX * 3), 3));
    const tex = canvasTex(32, 32, c => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
    const pm = new T.PointsMaterial({ size: 0.17, map: tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    const pts = new T.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
    particles = { pts, list: [] };
  }
  function spawn(x, y, z, vx, vy, vz, life, col, grav, k) {
    const L = particles.list;
    if (L.length >= PMAX) L.shift();
    _c.set(col); const g = k || 1.6;
    L.push({ x, y, z, vx, vy, vz, life, max: life, r: _c.r * g, g: _c.g * g, b: _c.b * g, grav: grav == null ? 6 : grav });
  }
  function emitFx(fx, tip, car) {
    const rnd = () => Math.random() - 0.5;
    if (fx === 'weld') spawn(tip[0], tip[1], tip[2], rnd() * 3, rnd() * 2, 1 + Math.random() * 2.5, 0.35 + Math.random() * 0.3, Math.random() < 0.5 ? '#fde047' : '#fb923c', 7, 2.4);
    else if (fx === 'spray') { const col = car.golden ? '#fbbf24' : MODELS[car.model].color; for (let k = 0; k < 2; k++) spawn(tip[0] + rnd() * 0.1, tip[1] + rnd() * 0.1, tip[2], rnd() * 0.7, rnd() * 0.7, -1.1, 0.3, col, 0, 1.2); }
    else if (fx === 'scan') spawn(tip[0] + rnd() * 0.5, tip[1] + rnd() * 0.3, tip[2] - 0.25, 0, 0, 0, 0.22, '#34d399', 0, 2.4);
    else if (fx === 'polish') spawn(tip[0] + rnd() * 0.3, tip[1] + rnd() * 0.3, tip[2], rnd() * 0.5, rnd() * 0.5, 0.7, 0.4, '#ffffff', 0, 2.5);
    else if (fx === 'press') spawn(tip[0], tip[1], tip[2], rnd() * 1.4, rnd() * 1.4, 0.4, 0.25, '#cbd5e1', 4);
    else spawn(tip[0], tip[1], tip[2], rnd() * 1.2, rnd() * 1.2, 0.6, 0.2, '#e0f2fe', 4, 2);
  }
  R.burst = function (x, y, z, col, n) {
    for (let k = 0; k < (n || 14); k++) spawn(x, y, z, (Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 3.2, 1.5 + Math.random() * 3, 0.7 + Math.random() * 0.5, col || '#fbbf24', 7, 2);
  };
  function updateParticles(dt) {
    const L = particles.list, pa = particles.pts.geometry.attributes.position, ca = particles.pts.geometry.attributes.color;
    let n = 0;
    for (let k = L.length - 1; k >= 0; k--) {
      const p = L[k];
      p.life -= dt;
      if (p.life <= 0) { L.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt;
      if (p.z < 0.02) { p.z = 0.02; p.vz *= -0.35; }
    }
    for (const p of L) {
      const f = Math.min(1, p.life / p.max * 2.5);
      pa.setXYZ(n, p.x, p.z, p.y); ca.setXYZ(n, p.r * f, p.g * f, p.b * f); n++;
    }
    particles.pts.geometry.setDrawRange(0, n);
    pa.needsUpdate = ca.needsUpdate = true;
  }

  // ================= Lijnobjecten (band, machines, magazijn) =================
  function ensureLine(li) {
    if (lineObjs[li]) return lineObjs[li];
    const y0 = R.lineY(li), o = { machines: [], tiers: [], pop: [] };
    const bx0 = -0.9, bx1 = G.BELT_END + 0.9, len = bx1 - bx0;
    const bg = new T.PlaneGeometry(len, 1.3);
    const uv = bg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len / 0.6);
    o.belt = new T.Mesh(bg, matBelt); o.belt.rotation.x = -Math.PI / 2; o.belt.position.set((bx0 + bx1) / 2, BELT_H - 0.015, y0 + BELT_Y); o.belt.receiveShadow = true; scene.add(o.belt);
    for (let i = 0; i < ST.length; i++) {
      const mm = new T.Mesh(machineGeo(i, 0), matLit); mm.position.set(G.ST_X[i], 0, y0); mm.castShadow = true; mm.receiveShadow = true; mm.visible = false; mm.userData.shared = true;
      scene.add(mm); o.machines.push(mm); o.tiers.push(0);
    }
    o.scaffold = new T.Mesh(scaffoldGeo(), matLit); o.scaffold.visible = false; o.scaffold.castShadow = true; scene.add(o.scaffold);
    o.stack = new T.Mesh(chassisStackGeo(G.s.model), matLit); o.stackModel = G.s.model; scene.add(o.stack);
    const gb = new Builder(); gb.box(-0.55, -0.45, 0, 1.1, 0.9, 0.16, '#f59e0b'); gb.box(-0.6, -0.5, -0.07, 0.1, 1.0, 0.1, '#1f2937'); gb.box(0.5, -0.5, -0.07, 0.1, 1.0, 0.1, '#1f2937');
    gb.cyl(0, -0.25, 1.2, 0.012, 2.4, 'z', '#94a3b8', 4); gb.cyl(0, 0.25, 1.2, 0.012, 2.4, 'z', '#94a3b8', 4);
    o.grip = new T.Mesh(gb.build(), matLit); scene.add(o.grip);
    return (lineObjs[li] = o);
  }
  R.onSpawn = function (li) {
    const s = R.wh[li] || (R.wh[li] = { drop: 0, grip: 1 });
    s.drop = 1; s.grip = 0;
  };
  function tierOf(lvl) { return lvl >= 100 ? 3 : lvl >= 50 ? 2 : lvl >= 25 ? 1 : 0; }
  function updateLines(dt) {
    const s = G.s, bs = G.buildInfo('st');
    matBelt.map.offset.x -= (G.rt.lines.some(l => l.cars.length) ? G.beltSpeed() : 0) * dt / 0.6;
    for (let li = 0; li < CFT.MAX_LINES; li++) {
      const on = li < s.lines;
      if (!on && !lineObjs[li]) continue;
      const o = ensureLine(li), y0 = R.lineY(li);
      o.belt.visible = o.stack.visible = o.grip.visible = on;
      o.scaffold.visible = false;
      for (let i = 0; i < ST.length; i++) {
        const mm = o.machines[i], lvl = s.stations[i];
        if (!on) { mm.visible = false; continue; }
        if (lvl) {
          const t = tierOf(lvl);
          if (o.tiers[i] !== t || !mm.visible) { mm.geometry = machineGeo(i, t); o.tiers[i] = t; }
          mm.visible = true;
          const fl = R.flash[i] ? Math.max(0, 1 - (time - R.flash[i]) * 2.2) : 0;
          const pop = 1 + Math.sin(fl * Math.PI) * 0.14;
          mm.scale.set(pop, pop, pop);
        } else if (bs && bs.i === i) {
          mm.geometry = machineGeo(i, 0); o.tiers[i] = 0; mm.visible = true;
          mm.scale.set(1, Math.max(0.04, bs.progress), 1);
          o.scaffold.visible = true; o.scaffold.position.set(G.ST_X[i], 0, y0);
          if (Math.random() < 0.3) spawn(G.ST_X[i] + (Math.random() - 0.5) * 1.8, y0 + 1.3, 0.2 + bs.progress * 1.1, (Math.random() - 0.5) * 1.5, Math.random(), 1.5, 0.4, '#fde047', 6, 2.2);
        } else mm.visible = false;
      }
      if (!on) continue;
      // magazijn: stapel zakt, portaalgrijper zet er een nieuw chassis op
      const st = R.wh[li] || (R.wh[li] = { drop: 0, grip: 1 });
      if (st.drop > 0) st.drop = Math.max(0, st.drop - dt * 2.8);
      if (st.grip < 1) st.grip = Math.min(1, st.grip + dt * 1.6);
      if (o.stackModel !== s.model) { o.stack.geometry = chassisStackGeo(s.model); o.stackModel = s.model; }
      const e = st.drop * st.drop * (3 - 2 * st.drop);
      o.stack.position.set(-2.0, BELT_H + e * 0.4 - 0.4, y0 + BELT_Y);
      const topZ = BELT_H + 5 * 0.4 + 0.2, ph = st.grip < 0.5 ? st.grip / 0.5 : 1 - (st.grip - 0.5) / 0.5;
      o.grip.position.set(-2.0, 3.25 - ph * (3.25 - topZ), y0 + BELT_Y);
    }
  }

  // ================= Auto's synchroniseren =================
  const seen = new Set();
  function placeCar(car, x, y, z, key, scale) {
    let e = carMeshes.get(car.id);
    if (!e) {
      const mesh = new T.Mesh(carGeo(car.model, car.stage, car.golden), matCar);
      mesh.castShadow = true; mesh.userData.shared = true; scene.add(mesh);
      e = { mesh, key: '' }; carMeshes.set(car.id, e);
    }
    if (e.key !== key) { e.mesh.geometry = carGeo(car.model, car.stage, car.golden); e.key = key; e.pop = time; }
    const pop = 1 + Math.max(0, 0.18 - (time - (e.pop || 0)) * 0.7);
    e.mesh.position.set(x, z, y);
    e.mesh.scale.setScalar((scale == null ? 1 : scale) * pop);
    seen.add(car.id);
    return e.mesh;
  }
  R._sparkles = [];
  function updateCars() {
    const s = G.s;
    seen.clear(); R._sparkles.length = 0;
    for (let li = 0; li < s.lines; li++) {
      const line = G.rt.lines[li], y0 = R.lineY(li);
      for (const c of line.cars) {
        placeCar(c, c.x, y0 + BELT_Y, BELT_H, carKey(c.model, c.stage, c.golden));
        if (c.golden && c.stage >= 3) R._sparkles.push([c.x, y0 + BELT_Y, 1.5]);
      }
      for (const e of line.lot) {
        const sp = R.slotPos(li, e.slot), ease = e.anim < 1 ? 1 - Math.pow(1 - e.anim, 3) : 1;
        const sx = G.BELT_END + 0.8, sy = y0 + BELT_Y;
        let x = sx + (sp[0] - sx) * ease, y = sy + (sp[1] - sy) * ease, z = BELT_H * (1 - ease), sc = 1;
        if (e.leaving) { x += e.leaving * e.leaving * 9; z += Math.sin(Math.min(1, e.leaving * 3) * Math.PI) * 0.25; sc = Math.max(0.01, 1 - Math.max(0, e.leaving - 0.6) * 2.5); }
        placeCar(e.car, x, y, z, carKey(e.car.model, e.car.stage, e.car.golden), sc);
        e._pos = [x, y];
        if (e.car.golden && !e.leaving) R._sparkles.push([x, y, 1.3]);
      }
    }
    for (const [id, e] of carMeshes) if (!seen.has(id)) { scene.remove(e.mesh); carMeshes.delete(id); }
    // draaiplateau met het huidige model
    if (!display) { display = new T.Mesh(carGeo(s.model, 6, false), matCar); display.castShadow = true; display.userData.shared = true; scene.add(display); display.userData.model = -1; }
    if (display.userData.model !== s.model) { display.geometry = carGeo(s.model, 6, false); display.userData.model = s.model; }
    display.position.set(36.4, 0.17, 2.2); display.rotation.y = time * 0.5; display.scale.setScalar(1.25);
  }

  // ================= Personeel =================
  function workerGeo(vest) {
    const key = 'worker' + vest;
    if (geoCache[key]) return geoCache[key];
    const b = new Builder();
    b.box(-0.07, -0.11, 0, 0.14, 0.09, 0.3, '#1e3a8a'); b.box(-0.07, 0.02, 0, 0.14, 0.09, 0.3, '#1e3a8a');
    b.box(-0.09, -0.14, 0.3, 0.18, 0.28, 0.3, vest); b.box(-0.095, -0.145, 0.4, 0.19, 0.29, 0.04, '#fde047', 1.4);
    b.box(-0.05, -0.2, 0.34, 0.1, 0.06, 0.24, vest); b.box(-0.05, 0.14, 0.34, 0.1, 0.06, 0.24, vest);
    b.cyl(0, 0, 0.69, 0.085, 0.16, 'z', '#f1c7a5', 10); b.cyl(0, 0, 0.79, 0.1, 0.07, 'z', '#facc15', 10, 0.07); b.box(0.04, -0.09, 0.755, 0.1, 0.18, 0.02, '#facc15');
    return (geoCache[key] = b.build());
  }
  function crateGeo() {
    if (geoCache.crate) return geoCache.crate;
    const b = new Builder(); b.box(0.1, -0.13, 0.36, 0.24, 0.26, 0.2, '#b45309'); b.box(0.1, -0.13, 0.44, 0.24, 0.26, 0.03, '#78350f');
    return (geoCache.crate = b.build());
  }
  function wantedWorkers() { return Math.min(MOBILE ? 8 : 12, 2 + Math.floor(G.s.upg.staff / 2) + (G.s.lines - 1)); }
  function updateWorkers(dt) {
    const s = G.s, want = wantedWorkers() + (s.upg.autoSell > 0 ? s.lines : 0);
    while (workers.length < want) {
      const k = workers.length;
      const mesh = new T.Mesh(workerGeo('#f97316'), matLit); mesh.castShadow = true; mesh.userData.shared = true; scene.add(mesh);
      const crate = new T.Mesh(crateGeo(), matLit); crate.visible = false; crate.userData.shared = true; mesh.add(crate);
      workers.push({ mesh, crate, x: 1 + k * 1.5, y: 4.3, tx: 2, ty: 4.3, state: 'idle', wait: Math.random() * 2, ph: Math.random() * 6, dir: 0 });
    }
    const sellers = s.upg.autoSell > 0 ? s.lines : 0, builtN = G.builtCount();
    for (let k = 0; k < workers.length; k++) {
      const w = workers[k];
      w.mesh.visible = k < want;
      if (k >= want) continue;
      const seller = k < sellers, li = seller ? k : (k - sellers) % s.lines, y0 = R.lineY(li);
      if (w.li !== li || w.seller !== seller) {
        w.li = li; w.seller = seller; w.state = 'idle'; w.wait = 0; w.x = seller ? LOT_X + 2 : 2 + Math.random() * 16; w.y = y0 + 4.4; w.crate.visible = false;
        w.mesh.geometry = workerGeo(seller ? '#1d4ed8' : '#f97316');
      }
      let tx = w.tx, ty = w.ty;
      if (seller) {
        // verkoper loopt naar de auto die als eerste verkocht wordt
        const lot = G.rt.lines[li].lot.filter(e => !e.leaving);
        const e = lot.sort((a, b) => b.timer - a.timer)[0];
        if (e) { const sp = R.slotPos(li, e.slot); tx = sp[0] - 0.1; ty = sp[1] + 0.62; w.face = Math.PI / 2; }
        else { tx = LOT_X + 2; ty = y0 + 4.5; w.face = -Math.PI / 2; }
        w.state = 'walk';
      } else if (w.state === 'idle') {
        w.wait -= dt;
        if (w.wait <= 0) {
          if (!w.crate.visible && Math.random() < 0.55) { w.tx = 0.9 + Math.random() * 1.2; w.ty = y0 + 4.55; w.next = 'pick'; }
          else { const i = Math.floor(Math.random() * Math.max(1, builtN)); w.tx = G.ST_X[i] + (Math.random() - 0.5) * 1.2; w.ty = y0 + 3.95; w.next = 'work'; }
          w.state = 'walk';
        }
        tx = w.tx; ty = w.ty;
      }
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
      let moving = false;
      if (w.state === 'walk' && d > 0.06) {
        const sp = 1.5 * (G.boosted() ? 1.4 : 1) * dt;
        w.x += dx / d * Math.min(sp, d); w.y += dy / d * Math.min(sp, d);
        w.dir = Math.atan2(-dy, dx); moving = true;
      } else if (!seller && w.state === 'walk') {
        if (w.next === 'pick') { w.crate.visible = true; w.state = 'idle'; w.wait = 0.5; }
        else { w.state = 'work'; w.wait = 2 + Math.random() * 3; w.dir = Math.PI / 2; }
      } else if (seller) w.dir = w.face;
      if (w.state === 'work') {
        w.wait -= dt;
        if (w.crate.visible && w.wait < 1.2) w.crate.visible = false;
        if (w.wait <= 0) { w.state = 'idle'; w.wait = 0.3 + Math.random(); }
      }
      w.ph += dt * (moving ? 11 : w.state === 'work' ? 7 : 2);
      const bob = moving ? Math.abs(Math.sin(w.ph)) * 0.05 : w.state === 'work' ? Math.sin(w.ph) * 0.02 : 0;
      w.mesh.position.set(w.x, bob, w.y);
      w.mesh.rotation.y = w.dir;
      w.mesh.rotation.z = w.state === 'work' ? -0.22 + Math.sin(w.ph) * 0.1 : moving ? Math.sin(w.ph) * 0.05 : 0;
    }
  }

  // ================= Bouwterrein voor de volgende lijn =================
  function updateGhost() {
    const s = G.s, ghost = s.lines < CFT.MAX_LINES, lb = G.buildInfo('line');
    if (!ghostObj) {
      const g = new T.Group();
      const zone = new T.Mesh(new T.PlaneGeometry(G.BELT_END + 2, 2.2), new T.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.12, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2; g.add(zone);
      const bb = new Builder(); bb.box(0, -0.7, 0.2, 1, 1.4, 0.13, '#1f2937');
      const belt = new T.Mesh(bb.build(), matLit); belt.castShadow = true; g.add(belt);
      const rb = new Builder(); rb.box(-0.3, -0.75, 0.33, 0.6, 1.5, 0.4, '#facc15'); rb.box(-0.2, -0.5, 0.73, 0.4, 1.0, 0.25, '#1f2937'); rb.cyl(0, 0, 1.15, 0.05, 0.4, 'z', '#ef4444', 8, 0.05, 2.4);
      const bot = new T.Mesh(rb.build(), matLit); bot.castShadow = true; g.add(bot);
      ghostObj = { g, zone, belt, bot }; scene.add(g);
    }
    ghostObj.g.visible = ghost;
    if (!ghost) return;
    const y0 = R.lineY(s.lines);
    ghostObj.zone.position.set((G.BELT_END) / 2, 0.02, y0 + BELT_Y);
    ghostObj.belt.visible = ghostObj.bot.visible = !!lb;
    if (lb) {
      const len = (G.BELT_END + 1.8) * lb.progress;
      ghostObj.belt.position.set(-0.9, 0, y0 + BELT_Y); ghostObj.belt.scale.set(Math.max(0.01, len), 1, 1);
      ghostObj.bot.position.set(-0.9 + len, 0, y0 + BELT_Y);
      if (Math.random() < 0.6) spawn(-0.9 + len, y0 + BELT_Y + (Math.random() - 0.5), 0.4, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, 0.4, '#fde047', 7, 2.4);
    }
  }

  // ================= Camera =================
  function camPos(c, out) {
    const cp = Math.cos(c.pitch);
    return out.set(c.tx + c.dist * cp * Math.sin(c.yaw), c.dist * Math.sin(c.pitch), c.tz + c.dist * cp * Math.cos(c.yaw));
  }
  const _t = new T.Vector3(), _corner = new T.Vector3();
  function boundsCorners() {
    const s = G.s, y1 = hallDepth(s.lines, s.lines < CFT.MAX_LINES), out = [];
    for (const x of [X0 - 0.4, X1]) for (const z of [-2.2, y1]) for (const y of [0, 3.7]) out.push([x, y, z]);
    return out;
  }
  function applyCam(c) {
    camPos(c, camera.position);
    camera.lookAt(_t.set(c.tx, 0.6, c.tz));
    camera.updateMatrixWorld();
  }
  // zoek de kleinste afstand waarbij de hele hal in het vrije schermdeel past (binair zoeken)
  function fitDist(view, corners, ex, ey) {
    let lo = 8, hi = 260, cxm = 0, cym = 0;
    const test = Object.assign({}, goal, view);
    for (let it = 0; it < 22; it++) {
      test.dist = (lo + hi) / 2; applyCam(test);
      let a = 1e9, b2 = -1e9, c2 = 1e9, d2 = -1e9;
      for (const p of corners) { _corner.set(p[0], p[1], p[2]).project(camera); a = Math.min(a, _corner.x); b2 = Math.max(b2, _corner.x); c2 = Math.min(c2, _corner.y); d2 = Math.max(d2, _corner.y); }
      cxm = (a + b2) / 2; cym = (c2 + d2) / 2;
      if ((b2 - a) / 2 <= ex && (d2 - c2) / 2 <= ey) hi = test.dist; else lo = test.dist;
    }
    applyCam(test);
    return { dist: hi, cxm, cym };
  }
  R.fit = function (instant) {
    if (!camera) return;
    const s = G.s, y1 = hallDepth(s.lines, s.lines < CFT.MAX_LINES);
    const aw = Math.max(120, W - R.pad.l - R.pad.r), ah = Math.max(120, H - R.pad.t - R.pad.b);
    goal.tx = (X0 + X1) / 2; goal.tz = (y1 - 2.2) / 2;
    const ex = aw / W, ey = ah / H, corners = boundsCorners();
    camera.clearViewOffset(); camera.aspect = W / H; camera.updateProjectionMatrix();
    // twee standpunten: breed (lijn horizontaal) en staand (lijn van boven naar beneden); kies het dichtstbijzijnde
    const wideV = { yaw: 0.3, pitch: 0.8 };
    const tallV = { yaw: R._py != null ? R._py : 1.3, pitch: R._pp != null ? R._pp : 0.98 };
    const fw = fitDist(wideV, corners, ex, ey);
    const ft = ah > aw * 0.55 ? fitDist(tallV, corners, ex, ey) : null;
    // op een staand scherm heeft de staande hoek de voorkeur (vult het scherm, past bij duimbediening)
    R.portrait = !!ft && ft.dist < fw.dist * (H > W ? 1.15 : 0.92);
    const best = R.portrait ? ft : fw;
    Object.assign(goal, R.portrait ? tallV : wideV);
    goal.dist = best.dist * 1.02;
    // lensverschuiving: beeld centreren in het vrije deel van het scherm
    lens.gx = -(R.pad.l - R.pad.r) / 2 + best.cxm * W / 2;
    lens.gy = -(R.pad.t - R.pad.b) / 2 - best.cym * H / 2;
    R._fitDist = goal.dist;
    if (instant) { Object.assign(cam, goal); lens.x = lens.gx; lens.y = lens.gy; }
  };
  function clampGoal() {
    const s = G.s, y1 = hallDepth(s.lines, s.lines < CFT.MAX_LINES);
    goal.tx = Math.max(X0, Math.min(X1, goal.tx)); goal.tz = Math.max(-2, Math.min(y1, goal.tz));
    goal.dist = Math.max(7, Math.min((R._fitDist || 60) * 1.5, goal.dist));
    goal.pitch = Math.max(0.38, Math.min(1.3, goal.pitch));
  }
  R.pan = function (dx, dy) {
    const k = 2 * cam.dist * Math.tan(camera.fov * Math.PI / 360) / H;
    const cy = Math.cos(goal.yaw), sy = Math.sin(goal.yaw), f = k / Math.max(0.35, Math.sin(cam.pitch));
    goal.tx += -cy * dx * k - sy * dy * f;
    goal.tz += sy * dx * k - cy * dy * f;
    R.cam.user = true; clampGoal();
  };
  R.zoomAt = function (sx, sy, f) { goal.dist /= f; R.cam.user = true; clampGoal(); };
  R.rotate = function (dyaw, dpitch) { goal.yaw += dyaw; goal.pitch += dpitch || 0; R.cam.user = true; clampGoal(); };
  // camera direct ergens op richten (x, y in spel-coördinaten)
  R.look = function (x, y, dist, yaw, pitch) { goal.tx = x; goal.tz = y; if (dist) goal.dist = dist; if (yaw != null) goal.yaw = yaw; if (pitch != null) goal.pitch = pitch; R.cam.user = true; clampGoal(); };
  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 7);
    for (const key of ['tx', 'tz', 'dist', 'yaw', 'pitch']) cam[key] += (goal[key] - cam[key]) * k;
    lens.x += (lens.gx - lens.x) * k; lens.y += (lens.gy - lens.y) * k;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, lens.x, lens.y, W, H);
    applyCam(cam);
    // vergelijkbaar met de 2D-zoom: schermpixels per wereld-eenheid / 26
    R.cam.zoom = H / (2 * cam.dist * Math.tan(camera.fov * Math.PI / 360)) / 26;
  }
  R.toScreen = function (x, y, z) {
    _v.set(x, z || 0, y).project(camera);
    return [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H];
  };
  function screenBox(x0, y0, z0, x1, y1, z1) {
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) { const p = R.toScreen(x, y, z); a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
    return { x: a, y: c, w: b - a, h: d - c };
  }

  // ================= Overlay: labels en geldpop-ups (2D-canvas boven de 3D-scène) =================
  function roundRect(x, y, w, h, r) {
    octx.beginPath(); octx.moveTo(x + r, y); octx.arcTo(x + w, y, x + w, y + h, r); octx.arcTo(x + w, y + h, x, y + h, r); octx.arcTo(x, y + h, x, y, r); octx.arcTo(x, y, x + w, y, r); octx.closePath();
  }
  function pill(x, y, text, bg, opt) {
    opt = opt || {};
    const fs = opt.big ? 14 : opt.small ? 10 : 12;
    octx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const w = octx.measureText(text).width + (opt.small ? 10 : 16), h = fs + (opt.small ? 7 : 10);
    const sc = opt.pulse ? 1 + Math.sin(time * 6) * 0.06 : 1;
    octx.save(); octx.translate(x, y); octx.scale(sc, sc);
    octx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(-w / 2, -h / 2 + 2, w, h, h / 2); octx.fill();
    octx.fillStyle = bg; roundRect(-w / 2, -h / 2, w, h, h / 2); octx.fill();
    if (opt.border) { octx.strokeStyle = opt.border; octx.lineWidth = 2; octx.stroke(); }
    octx.fillStyle = opt.color || '#fff'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
    octx.fillText(text, 0, 1); octx.restore();
    return w;
  }
  function buildLabel(x, y, info, which, wide) {
    const small = R.cam.zoom < 0.5;
    const w = pill(x, y, `🏗️ ${CFT.fmtTime(Math.ceil(info.left))}`, 'rgba(12,74,110,0.94)', { small, big: wide && !small, border: '#38bdf8' });
    const bw = Math.max(40, w - 10), bx = x - bw / 2, by = y + (small ? 10 : 13);
    octx.fillStyle = 'rgba(15,23,42,0.75)'; roundRect(bx, by, bw, 5, 2.5); octx.fill();
    octx.fillStyle = '#38bdf8'; roundRect(bx, by, Math.max(5, bw * info.progress), 5, 2.5); octx.fill();
    pill(x, by + (small ? 16 : 20), '📺 Finish now', '#d97706', { small, pulse: true });
    R.hits.push({ x: x - 80, y: y - 16, w: 160, h: small ? 44 : 56, kind: 'buildsite', which });
  }
  R.addFloat = function (x, y, z, text, col, big) {
    R.floats.push({ x, y, z, text, col: col || '#4ade80', life: 1.5, max: 1.5, big });
    if (R.floats.length > 50) R.floats.shift();
  };
  function drawOverlay(dt) {
    const s = G.s;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);
    R.hits = [];
    const far = R.cam.zoom < 0.5;
    let bott = -1, bt = 0;
    for (let i = 0; i < ST.length; i++) if (s.stations[i]) { const t = G.stationTime(i); if (t > bt) { bt = t; bott = i; } }
    const nextBuild = s.stations.findIndex(l => l === 0), bs = G.buildInfo('st');
    for (let li = 0; li < s.lines; li++) {
      const line = G.rt.lines[li], y0 = R.lineY(li);
      for (let i = 0; i < ST.length; i++) {
        const lvl = s.stations[i], x = G.ST_X[i];
        const hb = screenBox(x - 1.15, y0 + 0.15, 0, x + 1.15, y0 + 1.7, 1.6);
        const building = !lvl && bs && bs.i === i;
        R.hits.push({ x: hb.x, y: hb.y, w: hb.w, h: hb.h, kind: building ? 'buildsite' : 'station', which: 'st', li, i });
        if (li > 0) continue;
        const top = R.toScreen(x, y0 + 0.9, 2.55);
        if (building) { buildLabel(top[0], top[1], bs, 'st'); continue; }
        if (!lvl) {
          if (i === nextBuild) {
            const afford = s.money >= ST[i].build;
            pill(top[0], top[1] + 20, far ? `🔨 ${CFT.fmtMoney(ST[i].build)}` : `${ST[i].icon} Build ${ST[i].short} · ${CFT.fmtMoney(ST[i].build)}`, afford ? '#16a34a' : 'rgba(30,41,59,0.85)', { pulse: afford, small: far });
          }
          continue;
        }
        // rustig beeld: alleen een klein level-chipje; details bij het geselecteerde station
        const sel = R.selected === i;
        if (far && !sel) continue;
        const w = pill(top[0], top[1], sel ? `${ST[i].icon} ${ST[i].short} · Lv ${lvl}` : `${ST[i].icon} ${lvl}`, sel ? '#2563eb' : 'rgba(15,23,42,0.78)', { small: !sel, border: lvl >= 25 ? '#fbbf24' : null });
        const car = line.cars.find(c => c.proc === i);
        if (car) {
          const bw = Math.max(30, w - 8), bx = top[0] - bw / 2, by = top[1] + (sel ? 13 : 10);
          octx.fillStyle = 'rgba(15,23,42,0.65)'; roundRect(bx, by, bw, 4, 2); octx.fill();
          octx.fillStyle = '#22c55e'; roundRect(bx, by, Math.max(4, bw * Math.min(1, car.pt / G.stationTime(i))), 4, 2); octx.fill();
        }
        if (i === bott && G.builtCount() > 1 && line.cars.some(c => c.proc < 0 && c.x < x && x - c.x < G.GAP * 1.3)) pill(top[0], top[1] - 20, '⏳ Bottleneck', '#ea580c', { small: true });
      }
      // showroom: klikgebieden, prijskaartjes bij handmatige verkoop
      for (const e of line.lot) {
        if (e.leaving || !e._pos) continue;
        const m = MODELS[e.car.model], hb = screenBox(e._pos[0] - m.L / 2, e._pos[1] - m.W / 2, 0, e._pos[0] + m.L / 2, e._pos[1] + m.W / 2, m.H + m.cab + 0.3);
        R.hits.push({ x: hb.x - 6, y: hb.y - 6, w: hb.w + 12, h: hb.h + 12, kind: 'lot', li, slot: e.slot });
        if (!s.upg.autoSell && e.anim >= 1) {
          const p = R.toScreen(e._pos[0], e._pos[1], m.H + m.cab + 0.55);
          pill(p[0], p[1], CFT.fmtMoney(G.carProfit(e.car.stage, e.car.golden, e.car.model)), e.car.golden ? '#ca8a04' : '#16a34a', { pulse: true, small: far });
        }
      }
      if (line.full && s.upg.autoSell === 0) { const p = R.toScreen(LOT_X + 2.4, y0 + 2.4, 2.9); pill(p[0], p[1], '👆 Tap a car to sell it', '#dc2626', { pulse: true }); }
    }
    // volgende productielijn
    if (s.lines < CFT.MAX_LINES) {
      const y0 = R.lineY(s.lines), c = R.toScreen(12, y0 + BELT_Y, 0.8), lb = G.buildInfo('line');
      if (lb) buildLabel(c[0], c[1], lb, 'line', true);
      else {
        const can = G.canBuyLine(), afford = s.money >= G.lineCost(), short = far || R.portrait;
        const txt = can ? (short ? `🏗️ Line ${s.lines + 1} · ${CFT.fmtMoney(G.lineCost())}` : `🏗️ Build production line ${s.lines + 1} · ${CFT.fmtMoney(G.lineCost())}`) : (short ? `🔒 Line ${s.lines + 1}` : `🔒 Production line ${s.lines + 1} · ${G.reqText(CFT.LINE_REQ[s.lines])}`);
        pill(c[0], c[1], txt, can && afford ? '#16a34a' : can ? '#1e40af' : 'rgba(30,41,59,0.8)', { big: !short, pulse: can && afford });
        R.hits.push({ x: c[0] - 110, y: c[1] - 22, w: 220, h: 44, kind: 'ghost' });
      }
    }
    // fonkelingen bij gouden auto's
    for (const sp of R._sparkles) {
      const p = R.toScreen(sp[0], sp[1], sp[2]);
      for (let k = 0; k < 3; k++) {
        const a = time * 3 + k * 2.1, r = 3 + Math.sin(time * 8 + k) * 1.5, sx = p[0] + Math.cos(a) * 16, sy = p[1] + Math.sin(a * 1.3) * 9;
        octx.fillStyle = '#fde047'; octx.beginPath();
        for (let j = 0; j < 8; j++) { const rr = j % 2 ? r * 0.35 : r, an = j * Math.PI / 4; octx.lineTo(sx + Math.cos(an) * rr, sy + Math.sin(an) * rr); }
        octx.fill();
      }
    }
    // geldpop-ups: springen op, zweven omhoog en vervagen
    for (let k = R.floats.length - 1; k >= 0; k--) {
      const f = R.floats[k];
      f.life -= dt; f.z += dt * 0.9;
      if (f.life <= 0) { R.floats.splice(k, 1); continue; }
      const p = R.toScreen(f.x, f.y, f.z + 0.6), age = f.max - f.life;
      const sc = age < 0.18 ? 0.5 + age / 0.18 * 0.75 : 1.25 - Math.min(0.25, (age - 0.18) * 1.2);
      octx.save(); octx.translate(p[0], p[1]); octx.scale(sc, sc);
      octx.globalAlpha = Math.min(1, f.life * 2.2);
      octx.font = `900 ${f.big ? 24 : 17}px system-ui, sans-serif`; octx.textAlign = 'center'; octx.textBaseline = 'middle';
      octx.lineWidth = 4; octx.strokeStyle = 'rgba(2,6,23,0.75)'; octx.lineJoin = 'round';
      octx.strokeText(f.text, 0, 0); octx.fillStyle = f.col; octx.fillText(f.text, 0, 0);
      octx.restore();
    }
    octx.globalAlpha = 1;
    if (G.boosted()) { octx.strokeStyle = `rgba(250,204,21,${0.35 + Math.sin(time * 4) * 0.15})`; octx.lineWidth = 6; octx.strokeRect(3, 3, W - 6, H - 6); }
  }
  // auto's in de showroom gaan voor: op kleine schermen kunnen grote labels (bouwplaats, nieuwe lijn) eroverheen liggen
  R.hitTest = function (x, y) {
    const inside = h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
    for (let k = R.hits.length - 1; k >= 0; k--) { const h = R.hits[k]; if (h.kind === 'lot' && inside(h)) return h; }
    for (let k = R.hits.length - 1; k >= 0; k--) { const h = R.hits[k]; if (inside(h)) return h; }
    return null;
  };

  // ================= Kwaliteit: automatisch terugschakelen bij een lage framerate =================
  function applyQuality() {
    const q = quality.level, base = window.devicePixelRatio || 1;
    const pr = [Math.min(base, 2), Math.min(base, 1.5), Math.min(base, 1.25), 1][q];
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    const sh = q <= 1;
    if (sun.castShadow !== sh) sun.castShadow = sh;
    const size = q === 0 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    R.quality = q;
  }
  function trackQuality(dt) {
    if (dt <= 0 || dt > 0.25) return;
    if (quality.cool > 0) { quality.cool -= dt; return; }
    quality.acc += dt; quality.frames++;
    if (quality.acc >= 2.5) {
      const fps = quality.frames / quality.acc;
      R.fps = fps; quality.acc = 0; quality.frames = 0;
      if (fps < 46 && quality.level < 3 && !quality.lock) { quality.level++; quality.cool = 2; applyQuality(); }
    }
  }

  // ================= Init / resize / draw =================
  R.init = function (c) {
    try {
      canvas = c;
      renderer = new T.WebGLRenderer({ canvas: c, antialias: !MOBILE, powerPreference: 'high-performance' });
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      scene = new T.Scene();
      scene.background = new T.Color('#101b33');
      scene.fog = new T.Fog('#101b33', 90, 260);
      camera = new T.PerspectiveCamera(30, 1, 1, 500);
      hemi = new T.HemisphereLight(0xdbeafe, 0x475569, 1.5); scene.add(hemi);
      sun = new T.DirectionalLight(0xfff4e0, 2.5); sun.castShadow = true; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
      scene.add(sun); scene.add(sun.target);
      weldLight = new T.PointLight(0x9ec5ff, 0, 5, 2); scene.add(weldLight);
      const ground = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshLambertMaterial({ color: 0x1a2740 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; ground.receiveShadow = true; scene.add(ground);
      makeMaterials();
      buildArmMeshes();
      buildParticles();
      selRing = new T.Mesh(new T.RingGeometry(1.35, 1.5, 4, 1, Math.PI / 4), new T.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9, depthWrite: false }));
      selRing.rotation.x = -Math.PI / 2; selRing.scale.set(1.15, 0.85, 1); selRing.visible = false; scene.add(selRing);
      // overlay-canvas voor labels en pop-ups
      ov = document.createElement('canvas'); ov.id = 'overlay';
      ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block';
      c.insertAdjacentElement('afterend', ov); octx = ov.getContext('2d');
      document.getElementById('app').classList.add('r3d');
      G.on('spawn', li => R.onSpawn(li));
      G.on('imported', () => { for (const [, e] of carMeshes) scene.remove(e.mesh); carMeshes.clear(); R.armState = {}; });
      c.addEventListener('webglcontextlost', e => e.preventDefault());
      R.resize();
      buildHall();
      R.fit(true);
    } catch (err) {
      // WebGL lukt niet: terug naar de 2D-weergave op een vers canvas
      console.warn('[CFT] 3D not available, using 2D view:', err);
      if (ov) ov.remove();
      const n = c.cloneNode(); c.replaceWith(n);
      for (const k of Object.keys(R)) if (!(k in old2D)) delete R[k];
      Object.assign(R, old2D);
      R.is3D = false;
      R.init(n);
    }
  };
  R.resize = function () {
    if (!renderer) return;
    W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
    applyQuality();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr);
    if (!R.cam.user) R.fit();
  };
  R.draw = function (dt) {
    if (!renderer) return;
    time += dt;
    const s = G.s;
    if (hallLines !== s.lines || hallGhost !== (s.lines < CFT.MAX_LINES)) { buildHall(); if (!R.cam.user) R.fit(); }
    updateLines(dt);
    updateArms(Math.min(0.05, dt));
    updateCars();
    updateWorkers(Math.min(0.05, dt));
    updateGhost();
    updateParticles(dt);
    selRing.visible = R.selected >= 0;
    if (selRing.visible) { selRing.position.set(G.ST_X[R.selected], 0.14, 0.92); selRing.material.opacity = 0.6 + Math.sin(time * 5) * 0.3; }
    updateCamera(dt);
    renderer.render(scene, camera);
    drawOverlay(dt);
    trackQuality(dt);
  };
  R.stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, objs: scene.children.length, cars: carMeshes.size, quality: quality.level, fps: R.fps });

  // ================= Voorbeeldplaatjes van modellen (klein offscreen 3D-beeld) =================
  let pv = null;
  const pvCache = {};
  R.drawPreview = function (cv, modelIdx, stage, golden) {
    try {
      const key = modelIdx + '|' + (stage == null ? 6 : stage) + '|' + (golden ? 1 : 0);
      if (!pvCache[key]) {
        if (!pv) {
          const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
          r.setSize(360, 216, false); r.toneMapping = T.ACESFilmicToneMapping;
          const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x64748b, 1.8));
          const d = new T.DirectionalLight(0xffffff, 2.4); d.position.set(-2, 4, 3); sc.add(d);
          const cm = new T.PerspectiveCamera(26, 360 / 216, 0.1, 50); cm.position.set(2.0, 1.25, 2.55); cm.lookAt(0, 0.33, 0);
          const mesh = new T.Mesh(carGeo(0, 6, false), matCar); sc.add(mesh);
          pv = { r, sc, cm, mesh };
        }
        pv.mesh.geometry = carGeo(modelIdx, stage == null ? 6 : stage, golden);
        pv.r.render(pv.sc, pv.cm);
        const im = document.createElement('canvas'); im.width = 360; im.height = 216;
        im.getContext('2d').drawImage(pv.r.domElement, 0, 0);
        pvCache[key] = im;
      }
      const w = cv.clientWidth || 120, h = cv.clientHeight || 72, d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * d; cv.height = h * d;
      const c2 = cv.getContext('2d'), im = pvCache[key], sc = Math.min(cv.width / im.width, cv.height / im.height);
      c2.drawImage(im, (cv.width - im.width * sc) / 2, (cv.height - im.height * sc) / 2, im.width * sc, im.height * sc);
    } catch (e) { old2D.drawPreview(cv, modelIdx, stage, golden); }
  };
})();
