// Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved.
// Meet JS-tijd per frame (logica, rendering, UI) in een volle fabriek met 4 lijnen.
// Gebruik: python3 -m http.server 8123 &  →  node tools/perftest.js [url]
// Let op: headless Chromium rendert in software; GPU-tijd is niet representatief, JS-tijd wel ongeveer.
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8123/index.html?cg=0';
(async () => {
  const b = await chromium.launch();
  for (const [label, opts] of [['desktop', { viewport: { width: 1366, height: 768 } }], ['mobile', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage();
    await p.goto(URL);
    await p.waitForFunction(() => !document.getElementById('loading'));
    await p.evaluate(() => {
      const G = CFT.Game; CFT.debug.money(1e16);
      for (let i = 1; i < 7; i++) { G.buildStation(i); G.skipBuild('st'); }
      for (let i = 0; i < 7; i++) G.upgradeStation(i, 120);
      for (const u of CFT.UPGRADES) while (G.buyUpgrade(u.id));
      for (let k = 0; k < 3; k++) { G.s.tech.robots2 = 1; G.s.models = G.s.models.map(() => true); G.buyLine(); G.skipBuild('line'); }
      G.s.model = 6; G.s.upg.staff = 40; CFT.UI.closeModal();
      for (let i = 0; i < 600; i++) G.update(0.05); // band vullen
    });
    await new Promise(r => setTimeout(r, 2500));
    const res = await p.evaluate(async () => {
      const G = CFT.Game, R = CFT.Render, U = CFT.UI, N = 240;
      let tg = 0, tr = 0, tu = 0;
      for (let i = 0; i < N; i++) {
        let t = performance.now(); G.update(1 / 60); tg += performance.now() - t;
        t = performance.now(); R.draw(1 / 60); tr += performance.now() - t;
        t = performance.now(); U.update(1 / 60); tu += performance.now() - t;
      }
      // echte frames over 3 s
      const fr = await new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); });
      const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      return { lines: G.s.lines, cars: G.rt.lines.reduce((a, l) => a + l.cars.length + l.lot.length, 0), gameMs: +(tg / N).toFixed(3), renderMs: +(tr / N).toFixed(2), uiMs: +(tu / N).toFixed(3), fpsSoftware: Math.round(fr), heapMB: heap, ...R.stats() };
    });
    console.log(label, JSON.stringify(res));
    // lekcontrole: 20 000 frames (≈ 5,5 min speltijd) met wisselende modellen, golden cars en verkopen
    const leak = await p.evaluate(() => {
      const G = CFT.Game, R = CFT.Render, before = R.stats();
      for (let i = 0; i < 20000; i++) { G.update(1 / 60); if (i % 50 === 0) R.draw(50 / 60); if (i % 2500 === 0) G.selectModel((G.s.model + 1) % 7); }
      const after = R.stats();
      return { before: { geos: before.geos, texs: before.texs, objs: before.objs, cars: before.cars }, after: { geos: after.geos, texs: after.texs, objs: after.objs, cars: after.cars }, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
    });
    console.log(label, 'leak check', JSON.stringify(leak));
    await ctx.close();
  }
  await b.close();
})();
