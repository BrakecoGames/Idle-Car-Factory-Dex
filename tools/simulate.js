// Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved.
// Headless balanssimulatie: een slimme bot speelt het spel en logt mijlpalen.
// Gebruik: node tools/simulate.js [minuten]
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['data.js', 'game.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
const CFT = globalThis.CFT, G = CFT.Game;

const MIN = +process.argv[2] || 30;
let clock = 1e12; G.now = () => clock;
G.reset();

const log = [];
const mark = (k) => log.push([G.rt.t, k]);
G.on('build', i => mark('BOUW ' + CFT.STATIONS[i].name));
G.on('model', i => mark('MODEL ' + CFT.MODELS[i].name));
G.on('line', n => mark('LIJN ' + n));
G.on('tech', id => mark('TECH ' + id));
G.on('upgrade', id => { if (G.s.upg[id] === 1) mark('UPG ' + id); });
G.on('achievement', a => mark('PRESTATIE ' + a.name));
let firstSale = 0, firstUpg = 0;
G.on('sold', () => { if (!firstSale) { firstSale = 1; mark('EERSTE VERKOOP'); } });
G.on('stationUp', () => { if (!firstUpg) { firstUpg = 1; mark('EERSTE UPGRADE'); } });

// Bot-aannames voor handmatige fase
const MANUAL_SPAWN = 1.0, MANUAL_SELL = 1.5;
const origSI = G.spawnInterval, origSD = G.sellDelay;
G.spawnInterval = nb => (G.s.upg.autoProd ? origSI(nb) : MANUAL_SPAWN);
G.sellDelay = () => (G.s.upg.autoSell ? origSD() : MANUAL_SELL);

function candidates() {
  const c = [];
  const s = G.s;
  const nb = s.stations.findIndex(l => l === 0);
  if (nb >= 0) c.push({ k: 'build', cost: CFT.STATIONS[nb].build, apply: () => G.buildStation(nb) });
  for (let i = 0; i < 7; i++) if (s.stations[i]) {
    const n = G.nextMilestone(s.stations[i]);
    c.push({ k: 'st' + i, cost: G.stationUpCost(i, 1), apply: () => G.upgradeStation(i, 1) });
  }
  for (const u of CFT.UPGRADES) if (!G.upgMaxed(u.id)) c.push({ k: u.id, cost: G.upgCost(u.id), apply: () => G.buyUpgrade(u.id), force: (u.id === 'autoProd' || u.id === 'autoSell') && G.s.upg[u.id] === 0 });
  for (const t of CFT.TECH) if (!s.tech[t.id] && G.reqMet(t.req)) c.push({ k: t.id, cost: t.cost, apply: () => G.buyTech(t.id), force: ['battery', 'offline'].includes(t.id) });
  const mi = s.models.findIndex(m => !m);
  if (mi > 0 && G.reqMet(CFT.MODELS[mi].req)) c.push({ k: 'model' + mi, cost: CFT.MODELS[mi].research, apply: () => G.researchModel(mi) });
  if (G.canBuyLine()) c.push({ k: 'line', cost: G.lineCost(), apply: () => G.buyLine() });
  return c;
}
function gainOf(cand) {
  const emit = G.emit; G.emit = () => {};
  const snap = JSON.stringify(G.s);
  const before = G.theoreticalIps();
  G.s.money = 1e300;
  cand.apply();
  G.skipBuild('st'); G.skipBuild('line');
  const after = G.theoreticalIps();
  G.s = JSON.parse(snap); G.emit = emit;
  return after - before;
}
function botStep() {
  while (G.missionDone()) G.claimMission();
  if (G.s.daily) G.s.daily.tasks.forEach((t, i) => G.claimDaily(i));
  if (G.rt.vip) G.claimVip(1);
  for (let guard = 0; guard < 50; guard++) {
    let best = null, bestScore = Infinity;
    for (const c of candidates()) {
      const g = gainOf(c);
      const score = c.force ? c.cost / Math.max(1e-9, G.theoreticalIps() * 0.02) : g > 1e-9 ? c.cost / g : Infinity;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (!best || G.s.money < best.cost) break;
    best.apply();
  }
}

const dt = 0.05;
let spawnAcc = 0, botAcc = 0, nextReport = +process.argv[3] || 60;
const reports = [];
// optioneel: PRESTIGE_AT=<minuut> → bot start op dat moment een nieuw merk
const PRESTIGE_AT = +process.env.PRESTIGE_AT || 0;
let prestiged = false;
G.save = () => true;
while (G.rt.t < MIN * 60) {
  if (PRESTIGE_AT && !prestiged && G.rt.t >= PRESTIGE_AT * 60 && G.canPrestige()) {
    const t = G.rt.t, gain = G.doPrestige(); G.rt.t = t; prestiged = true; mark('PRESTIGE +' + gain + ' sterren');
  }
  clock += dt * 1000;
  if (!G.s.upg.autoProd) { spawnAcc += dt; if (spawnAcc >= MANUAL_SPAWN) { spawnAcc = 0; G.manualProduce(); } }
  G.update(dt);
  botAcc += dt;
  if (botAcc >= 1) { botAcc = 0; botStep(); }
  if (process.env.DEBUG && Math.floor(G.rt.t)!==Math.floor(G.rt.t-dt)) {
    console.log('t',Math.round(G.rt.t),'model',G.model().name,'stageF',G.stageFactor(G.lastBuilt()).toFixed(1),'lvlV',G.levelValue().toFixed(2),'q',G.qualityMult().toFixed(2),'inc',G.incomeMult().toFixed(1),'price',CFT.fmt(G.carPrice(G.lastBuilt())),'rate',G.lineRate(true).toFixed(2),'lines',G.s.lines,'mkt',G.s.upg.marketing,'ach',G.achCount(), 'money', CFT.fmt(G.s.money));
  }
  if (G.rt.t >= nextReport) {
    reports.push(`${String(Math.round(nextReport / 60)).padStart(3)} min | geld ${CFT.fmtMoney(G.s.money).padEnd(9)} | €/s ${CFT.fmt(G.measuredIps()).padEnd(7)} | auto's ${String(G.s.produced).padEnd(6)} | stations ${G.s.stations.join(',')} | model ${G.model().name} | lijnen ${G.s.lines} | missie ${G.s.mission}`);
    nextReport += +process.argv[3] || (MIN > 60 ? 600 : 60);
  }
}
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
console.log(log.map(([t, k]) => fmtT(t) + '  ' + k).join('\n'));
console.log('\n' + reports.join('\n'));
console.log('\nupg', JSON.stringify(G.s.upg), 'tech', Object.keys(G.s.tech).join(','));
