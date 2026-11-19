// Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved.
// Geautomatiseerde browser-playtest (Playwright + Chromium).
// Gebruik: python3 -m http.server 8123 &  →  node tools/playtest.js [url] [screenshotmap]
// Test: opstarten, eerste 30 s (produceren/verkopen/upgraden), panelen, aankopen, opslaan/laden,
// save-migratie, langere sessie (versneld), desktop + mobiel. Exit-code ≠ 0 bij fouten.
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');

const URL = process.argv[2] || 'http://localhost:8123/index.html?cg=0';
const OUT = process.argv[3] || path.join(__dirname, '..', 'dist', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (info ? ' — ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(browser, ctxOpts, label) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page._errors = errors; page._label = label;
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${page._label}-${name}.png`) });
const st = (page, expr, arg) => page.evaluate(expr, arg);

async function boot(page) {
  await page.goto(URL);
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 15000 });
  await sleep(400);
}

async function firstSession(page, isMobile) {
  const tap = async sel => { const el = page.locator(sel); if (isMobile) await el.tap({ force: true }); else await el.click({ force: true }); };
  await boot(page);
  check(`[${page._label}] game start`, await st(page, () => !!CFT.Game && CFT.Game.s.money >= 0));
  await shot(page, '00-start');
  const hint = await st(page, () => { const h = document.getElementById('hint'); return h.hidden ? '' : h.textContent; });
  check(`[${page._label}] tutorial hint shown at start`, hint.length > 0, hint);

  // Eerste 30 seconden: produceren, verkopen, upgraden
  const t0 = Date.now();
  await tap('#produceBtn');
  await sleep(300);
  check(`[${page._label}] produce works`, await st(page, () => CFT.Game.s.produced >= 1));
  await shot(page, '01-first-car');
  // wacht tot de auto in de showroom staat
  await page.waitForFunction(() => CFT.Game.lotCount() > 0, null, { timeout: 20000 });
  const lotTime = (Date.now() - t0) / 1000;
  check(`[${page._label}] first car reaches showroom`, true, lotTime.toFixed(1) + 's');
  await shot(page, '02-showroom');
  // tik op de auto via de hit-box
  const hit = await st(page, () => { const h = CFT.Render.hits.find(x => x.kind === 'lot'); return h && [h.x + h.w / 2, h.y + h.h / 2]; });
  if (hit) { if (isMobile) await page.touchscreen.tap(hit[0], hit[1]); else await page.mouse.click(hit[0], hit[1]); }
  await sleep(300);
  const sold = await st(page, () => CFT.Game.s.sold);
  check(`[${page._label}] tap-to-sell works`, sold >= 1, 'sold=' + sold + ' after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // meer produceren tot er geld is voor een upgrade
  for (let i = 0; i < 40 && (await st(page, () => CFT.Game.s.money < CFT.Game.stationUpCost(0, 1))); i++) {
    await tap('#produceBtn'); await sleep(250);
    await st(page, () => CFT.Game.sellAll());
  }
  await tap('#tabs [data-tab="stations"]');
  await sleep(300);
  await shot(page, '03-factory-panel');
  const lv0 = await st(page, () => CFT.Game.s.stations[0]);
  await tap('[data-act="st:0"]');
  await sleep(200);
  check(`[${page._label}] station upgrade via panel`, (await st(page, () => CFT.Game.s.stations[0])) > lv0);
  check(`[${page._label}] first reward loop < 30s`, (Date.now() - t0) / 1000 < 30, ((Date.now() - t0) / 1000).toFixed(1) + 's');

  // alle tabs openen
  for (const tab of ['upgrades', 'models', 'missions', 'achievements', 'stations']) {
    await tap(`#tabs [data-tab="${tab}"]`); await sleep(250);
    check(`[${page._label}] tab ${tab} renders`, (await st(page, () => document.getElementById('panelBody').children.length)) > 0);
    await shot(page, '04-tab-' + tab);
  }
  await tap('#panelClose');

  // midgame: veel geld, alles kopen via de UI-acties
  await st(page, () => { CFT.debug.money(1e7); });
  for (let i = 1; i < 7; i++) {
    await st(page, i => { CFT.UI.act('build:' + i); CFT.Game.skipBuild('st'); }, i);
  }
  check(`[${page._label}] all stations built`, (await st(page, () => CFT.Game.builtCount())) === 7);
  await st(page, () => { for (const u of CFT.UPGRADES) CFT.UI.act('upg:' + u.id); CFT.UI.act('research:1'); CFT.UI.closeModal(); });
  check(`[${page._label}] auto production + sales bought`, await st(page, () => CFT.Game.s.upg.autoProd > 0 && CFT.Game.s.upg.autoSell > 0));
  await sleep(2500);
  await shot(page, '05-full-line');

  // boost via test-advertentie
  await tap('#boostBtn'); await sleep(200);
  await page.locator('[data-mact="b0"]').click({ force: true });
  await sleep(2600);
  check(`[${page._label}] turbo via rewarded ad`, await st(page, () => CFT.Game.boosted()));

  // lijn 2
  await st(page, () => { CFT.debug.money(1e7); CFT.Game.buyLine(); CFT.Game.skipBuild('line'); });
  check(`[${page._label}] second line`, (await st(page, () => CFT.Game.s.lines)) === 2);
  await sleep(1500);
  await shot(page, '06-two-lines');

  // opslaan + herladen
  const before = await st(page, () => { CFT.Game.save(); return { m: CFT.Game.s.money, l: CFT.Game.s.lines, p: CFT.Game.s.produced }; });
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 15000 });
  const after = await st(page, () => ({ m: CFT.Game.s.money, l: CFT.Game.s.lines, p: CFT.Game.s.produced }));
  check(`[${page._label}] save/load keeps progress`, after.l === before.l && after.p >= before.p && after.m >= before.m * 0.99, JSON.stringify(after));
  await st(page, () => CFT.UI.closeModal());

  // langere sessie: 3 min echte tijd versneld door update() vaker te draaien
  const fpsInfo = await st(page, () => CFT.Render.stats && CFT.Render.stats());
  const t1 = Date.now();
  await st(page, () => { for (let i = 0; i < 3600; i++) CFT.Game.update(0.05); });
  const simMs = Date.now() - t1;
  await sleep(1000);
  check(`[${page._label}] long session stable`, await st(page, () => isFinite(CFT.Game.s.money) && CFT.Game.s.produced > 0), 'sim 180s in ' + simMs + 'ms');
  check(`[${page._label}] render stats`, !!fpsInfo, JSON.stringify(fpsInfo));
  await shot(page, '07-after-long');

  // prestige: nieuw merk starten via de UI
  await st(page, () => { CFT.Game.s.prestige.runEarned = 5e9; CFT.UI.openTab('stations'); });
  await sleep(300);
  await shot(page, '08-prestige-card');
  await tap('[data-act="prestige"]'); await sleep(250);
  await shot(page, '09-prestige-dialog');
  await page.locator('[data-mact="b0"]').click({ force: true });
  await sleep(1200);
  const pr = await st(page, () => ({ stars: CFT.Game.s.prestige.stars, lines: CFT.Game.s.lines, auto: CFT.Game.s.upg.autoProd, chip: !document.getElementById('starChip').hidden }));
  check(`[${page._label}] prestige resets and grants stars`, pr.stars === 2 && pr.lines === 1 && pr.auto === 1 && pr.chip, JSON.stringify(pr));
  await sleep(2500);
  check(`[${page._label}] production runs after prestige`, await st(page, () => CFT.Game.s.produced > 0 && CFT.Game.rt.lines[0].cars.length + CFT.Game.rt.lines[0].lot.length > 0));
  await shot(page, '10-after-prestige');
  check(`[${page._label}] no JS errors`, page._errors.length === 0, page._errors.slice(0, 5).join(' | '));
}

async function migrationTest(browser) {
  // oude save (v1, zonder nieuwe velden) moet laden zonder verlies
  let { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 720 } }, 'migrate');
  await page.goto(URL);
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 15000 });
  const legacy = { v: 1, money: 12345, totalEarned: 99999, produced: 500, sold: 480, golden: 4, stations: [30, 20, 12, 5, 0, 0, 0],
    upg: { autoProd: 3, belt: 2, autoSell: 2, marketing: 4, staff: 1, efficiency: 1, showroom: 1 }, tech: {}, models: [true, false, false, false, false, false, false],
    model: 0, lines: 1, mission: 12, genMission: null, ach: { car1: 1, car100: 1 }, daily: null, stats: { upgrades: 80, taps: 20, vip: 2, play: 900 },
    building: { st: null, line: null }, boostUntil: 0, savedAt: Date.now() - 3600e3, settings: { sfx: 0.8, music: 0.35, muted: false }, tut: 3 };
  await ctx.close();
  // nieuwe context: save injecteren vóór het laden (anders overschrijft beforeunload hem)
  ({ ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 720 } }, 'migrate'));
  await page.addInitScript(d => { if (!sessionStorage.getItem('inj')) { sessionStorage.setItem('inj', 1); localStorage.setItem('cft_save_v1', JSON.stringify(d)); } }, legacy);
  await page.goto(URL);
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 15000 });
  await sleep(500);
  const s = await page.evaluate(() => ({ st: CFT.Game.s.stations.join(','), prod: CFT.Game.s.produced, mission: CFT.Game.s.mission, money: CFT.Game.s.money, modal: !document.getElementById('modal').hidden }));
  check('[migrate] legacy save loads with progress intact', s.st === '30,20,12,5,0,0,0' && s.prod === 500 && s.mission === 12 && s.money >= 12345, JSON.stringify(s));
  check('[migrate] offline earnings dialog after 1h', s.modal);
  await shot(page, 'offline');
  // offline-venster ophalen → daarna verschijnt de dagbonus (oude save heeft nog geen reeks)
  await page.locator('[data-mact="b1"]').click({ force: true });
  await sleep(700);
  const streakShown = await page.evaluate(() => !document.getElementById('modal').hidden && /Daily bonus|streak/.test(document.getElementById('modalBox').textContent));
  check('[migrate] daily bonus follows offline dialog', streakShown);
  await shot(page, 'streak');
  const m0 = await page.evaluate(() => CFT.Game.s.money);
  await page.locator('[data-mact="b0"]').click({ force: true });
  await sleep(3200);
  const sr = await page.evaluate(() => ({ claimed: CFT.Game.s.streak.claimed, n: CFT.Game.s.streak.n, boosted: CFT.Game.boosted(), money: CFT.Game.s.money }));
  check('[migrate] daily bonus 2× via ad', sr.claimed && sr.n === 1 && sr.boosted && sr.money > m0 + 290, JSON.stringify(sr));
  check('[migrate] no JS errors', page._errors.length === 0, page._errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [label, opts, mobile] of [
      ['desktop', { viewport: { width: 1366, height: 768 } }, false],
      ['mobile', { ...devices['iPhone 13'] }, true],
      ['mobileland', { ...devices['iPhone 13 landscape'] }, true],
    ]) {
      console.log(`\n== ${label} ==`);
      const { ctx, page } = await newPage(browser, opts, label);
      try { await firstSession(page, mobile); } catch (e) { check(`[${label}] run without exception`, false, e.message.split('\n')[0]); await shot(page, 'error'); }
      await ctx.close();
    }
    console.log('\n== migration ==');
    await migrationTest(browser);
  } finally { await browser.close(); }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
