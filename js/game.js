/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — spel-logica (zonder DOM, zodat hij ook headless getest kan worden) */
(function () {
  const CFT = (globalThis.CFT = globalThis.CFT || {});
  const ST = CFT.STATIONS, MODELS = CFT.MODELS;
  const G = (CFT.Game = {});

  // ---- Layout van een productielijn (wereld-eenheden) ----
  G.ST_X = [3, 6.3, 9.6, 12.9, 16.2, 19.5, 22.8];
  G.BELT_END = 25.8;
  G.GAP = 1.9;            // minimale afstand tussen auto's op de band
  G.EXPRESS = 3.2;        // snelheidsfactor langs nog niet gebouwde stations
  G.START_MONEY = 25;
  G.SAVE_KEY = 'cft_save_v1';

  // ---- Events ----
  const listeners = {};
  G.on = (e, f) => (listeners[e] = listeners[e] || []).push(f);
  G.emit = (e, a, b, c) => (listeners[e] || []).forEach(f => f(a, b, c));

  G.now = () => Date.now();

  G.newState = function () {
    return {
      v: 1,
      money: G.START_MONEY, totalEarned: 0, produced: 0, sold: 0, golden: 0,
      stations: [1, 0, 0, 0, 0, 0, 0],
      upg: { autoProd: 0, belt: 0, autoSell: 0, marketing: 0, staff: 0, efficiency: 0, showroom: 0 },
      tech: {},
      models: MODELS.map((m, i) => i === 0),
      model: 0,
      lines: 1,
      mission: 0, genMission: null,
      ach: {},
      daily: null,
      stats: { upgrades: 0, taps: 0, vip: 0, play: 0 },
      building: { st: null, line: null }, // lopende bouwprojecten {i?, start, end} (ms, wandklok)
      boostUntil: 0,
      savedAt: G.now(),
      settings: { sfx: 0.8, music: 0.35, muted: false },
      tut: 0,
      // prestige ("nieuw merk"): sterren = permanente inkomstenbonus; runEarned = verdiend sinds laatste herstart
      prestige: { stars: 0, count: 0, runEarned: 0, best: 0 },
      // dagelijkse login-reeks: last = dag van laatste bezoek, n = reekslengte, claimed = bonus van vandaag opgehaald
      streak: { last: null, n: 0, claimed: true },
    };
  };

  G.s = G.newState();
  G.rt = null;

  G.resetRuntime = function () {
    G.rt = {
      t: 0,
      lines: [],
      log: [],          // [tijd, bedrag] voor inkomsten per minuut
      rush: [],         // productietijden voor 'rush'-missie
      nextId: 1,
      vip: null,
      vipTimer: 40,
      accum: 0,
    };
    for (let i = 0; i < CFT.MAX_LINES; i++) G.rt.lines.push({ cars: [], lot: [], spawnT: 0, full: false });
  };
  G.resetRuntime();

  // ================= Afgeleide waarden =================
  G.builtCount = () => G.s.stations.filter(l => l > 0).length;
  G.lastBuilt = () => G.builtCount() - 1;
  G.model = () => MODELS[G.s.model];
  G.boosted = () => G.now() < G.s.boostUntil;
  G.boostMult = () => (G.boosted() ? 2 : 1);
  G.achCount = () => Object.keys(G.s.ach).length;

  G.milestones = lvl => CFT.MILESTONES.filter(m => lvl >= m).length;
  G.nextMilestone = lvl => CFT.MILESTONES.find(m => m > lvl) || null;

  G.globalSpeed = function () {
    const s = G.s;
    return (1 + 0.08 * s.upg.staff) * (s.tech.robots2 ? 1.5 : 1) * (s.tech.cobots ? 2 : 1);
  };
  G.stationSpeed = function (i) {
    const l = G.s.stations[i];
    if (!l) return 0;
    return (1 + 0.15 * (l - 1)) * Math.pow(2, G.milestones(l)) * G.globalSpeed();
  };
  G.stationTime = function (i, noBoost) {
    return (ST[i].time * G.model().tm) / G.stationSpeed(i) / (noBoost ? 1 : G.boostMult());
  };
  G.beltSpeed = function (noBoost) {
    const s = G.s;
    return 2.0 * Math.pow(1.12, s.upg.belt) * (s.tech.turbo ? 1.5 : 1) * (noBoost ? 1 : G.boostMult());
  };
  G.spawnInterval = function (noBoost) {
    const l = G.s.upg.autoProd;
    if (!l) return Infinity;
    return (1.6 * Math.pow(0.87, l - 1)) / (noBoost ? 1 : G.boostMult());
  };
  G.sellDelay = function () {
    const l = G.s.upg.autoSell;
    if (!l) return Infinity;
    return (2.0 * Math.pow(0.84, l - 1)) / (G.s.tech.logistics ? 3 : 1);
  };
  G.lotCap = () => 3 + G.s.upg.showroom + (G.s.tech.logistics ? 2 : 0);

  G.quality = function () {
    // 1–5 sterren, afgeleid van kwaliteitscontrole
    const q = G.s.stations[5];
    if (!q) return 1;
    return Math.min(5, 2 + Math.floor(q / 25) + (G.s.tech.aiqc ? 1 : 0));
  };
  G.qualityMult = function () {
    const q = G.s.stations[5];
    if (!q) return 1;
    return (1 + 0.006 * q) * (G.s.tech.aiqc ? 1.4 : 1);
  };
  G.levelValue = function () {
    let sum = 0;
    let ms = 0;
    for (const l of G.s.stations) if (l > 0) { sum += l - 1; ms += G.milestones(l); }
    // elke mijlpaal (lv 10, 25, 50, …) geeft ook ×1,12 waarde
    return (1 + 0.006 * sum) * Math.pow(1.12, ms);
  };
  G.incomeMult = function () {
    const s = G.s;
    return Math.pow(1.1, s.upg.marketing) * (1 + 0.03 * G.achCount()) * (s.tech.giga ? 2 : 1) * G.prestigeMult();
  };
  G.stageFactor = function (stage) {
    let f = 1;
    for (let i = 0; i <= stage && i < ST.length; i++) f *= ST[i].stage;
    return f;
  };
  // Verkoopprijs van een auto die t/m 'stage' is afgebouwd
  G.carPrice = function (stage, golden, modelIdx) {
    const m = MODELS[modelIdx == null ? G.s.model : modelIdx];
    const q = stage >= 5 ? G.qualityMult() : 1;
    return m.price * G.stageFactor(stage) * G.levelValue() * q * G.incomeMult() * (golden ? 10 : 1);
  };
  // Productiekosten: vast deel van de 'kale' waarde (zonder marketing/bonussen), omlaag met Lean productie
  G.carCost = function (stage, modelIdx) {
    const m = MODELS[modelIdx == null ? G.s.model : modelIdx];
    const q = stage >= 5 ? G.qualityMult() : 1;
    const raw = m.price * G.stageFactor(stage) * G.levelValue() * q;
    return raw * (m.cost / m.price) * Math.pow(0.94, G.s.upg.efficiency);
  };
  G.carProfit = (stage, golden, modelIdx) => Math.max(1, G.carPrice(stage, golden, modelIdx) - G.carCost(stage, modelIdx));

  G.goldenChance = () => 0.025 * (G.s.tech.golden ? 2 : 1);

  // Theoretische productie per lijn (auto's/s) — voor offline inkomsten en beloningen
  G.lineRate = function (noBoost) {
    let tmax = 0;
    for (let i = 0; i < ST.length; i++) if (G.s.stations[i]) tmax = Math.max(tmax, G.stationTime(i, noBoost));
    const belt = G.beltSpeed(noBoost);
    let cycle = Math.max(tmax + G.GAP / belt, G.GAP / belt);
    cycle = Math.max(cycle, G.spawnInterval(noBoost));
    let rate = 1 / cycle;
    const sd = G.sellDelay();
    rate = Math.min(rate, isFinite(sd) ? G.lotCap() / sd : 0);
    return rate;
  };
  G.expectedProfit = function () {
    const st = G.lastBuilt(), gc = G.goldenChance();
    return G.carProfit(st, false) * (1 - gc) + G.carProfit(st, true) * gc;
  };
  G.theoreticalIps = () => G.lineRate(true) * G.s.lines * G.expectedProfit();

  // Gemeten inkomsten per seconde (laatste 30 s)
  G.measuredIps = function () {
    const rt = G.rt, win = 30;
    let sum = 0;
    for (let i = rt.log.length - 1; i >= 0; i--) {
      if (rt.t - rt.log[i][0] > win) break;
      sum += rt.log[i][1];
    }
    return sum / Math.max(10, Math.min(win, rt.t));
  };
  G.ips = () => Math.max(G.measuredIps(), G.theoreticalIps());

  // ================= Vereisten =================
  G.reqMet = function (req) {
    if (!req) return true;
    const s = G.s;
    if (req.stations && G.builtCount() < req.stations) return false;
    if (req.lines && s.lines < req.lines) return false;
    if (req.tech && !s.tech[req.tech]) return false;
    if (req.model != null && !s.models[req.model]) return false;
    return true;
  };
  G.reqText = function (req) {
    if (!req) return '';
    const p = [];
    if (req.stations) p.push(req.stations >= 7 ? 'full production line' : `${req.stations} stations built`);
    if (req.lines) p.push(`${req.lines} production lines`);
    if (req.tech) p.push(CFT.TECH.find(t => t.id === req.tech).name);
    if (req.model != null) p.push(`model ${MODELS[req.model].name}`);
    return 'Requires: ' + p.join(', ');
  };

  // ================= Aankopen =================
  G.spend = function (c) {
    if (G.s.money + 1e-9 < c) return false;
    G.s.money -= c;
    return true;
  };

  // Stations
  // Een nieuw station start met een ervaren team: 60% van het level van het vorige station
  G.buildStartLevel = i => (i === 0 ? 1 : Math.max(1, Math.floor(G.s.stations[i - 1] * 0.6)));
  G.canBuild = i => G.s.stations[i] === 0 && !G.s.building.st && (i === 0 || G.s.stations[i - 1] > 0);
  G.isBuilding = i => !!G.s.building.st && G.s.building.st.i === i;
  // Start de bouw: betalen, dan loopt er een bouwtimer (te overslaan met een advertentie)
  G.buildStation = function (i) {
    if (!G.canBuild(i) || !G.spend(ST[i].build)) return false;
    G.s.stats.upgrades++;
    G.dailyAdd('upgrades', 1);
    const t = ST[i].buildTime || 0;
    if (t <= 0) { G.completeStation(i); return true; }
    const now = G.now();
    G.s.building.st = { i, start: now, end: now + t * 1000 };
    G.emit('buildStart', 'st', i);
    return true;
  };
  G.completeStation = function (i) {
    G.s.building.st = null;
    G.s.stations[i] = G.buildStartLevel(i);
    G.emit('build', i);
  };
  G.stationUpCost = function (i, count) {
    const st = ST[i], l = G.s.stations[i], g = st.upGrowth;
    const first = st.upBase * Math.pow(g, l - 1);
    return (first * (Math.pow(g, count) - 1)) / (g - 1);
  };
  G.stationMaxAffordable = function (i) {
    const st = ST[i], l = G.s.stations[i], g = st.upGrowth;
    const first = st.upBase * Math.pow(g, l - 1);
    const n = Math.floor(Math.log((G.s.money * (g - 1)) / first + 1) / Math.log(g));
    return Math.max(0, Math.min(n, 1000));
  };
  // mode: 1, 10, 'max', 'next' (tot volgende mijlpaal)
  G.stationBuyCount = function (i, mode) {
    if (mode === 'max') return Math.max(1, G.stationMaxAffordable(i));
    if (mode === 'next') { const l = G.s.stations[i], m = G.nextMilestone(l); return m ? m - l : 1; }
    return mode;
  };
  G.upgradeStation = function (i, mode) {
    if (!G.s.stations[i]) return false;
    const n = G.stationBuyCount(i, mode || 1);
    const c = G.stationUpCost(i, n);
    if (!G.spend(c)) return false;
    const before = G.milestones(G.s.stations[i]);
    G.s.stations[i] += n;
    G.s.stats.upgrades += n;
    G.dailyAdd('upgrades', n);
    G.emit('stationUp', i, n, G.milestones(G.s.stations[i]) > before);
    return true;
  };

  // Bedrijfsupgrades
  G.upgDef = id => CFT.UPGRADES.find(u => u.id === id);
  G.upgCost = function (id) {
    const u = G.upgDef(id);
    return u.base * Math.pow(u.growth, G.s.upg[id]);
  };
  G.upgMaxed = id => G.s.upg[id] >= G.upgDef(id).max;
  G.buyUpgrade = function (id) {
    if (G.upgMaxed(id) || !G.spend(G.upgCost(id))) return false;
    G.s.upg[id]++;
    G.s.stats.upgrades++;
    G.dailyAdd('upgrades', 1);
    G.emit('upgrade', id);
    return true;
  };
  G.upgEffect = function (id, lvl) {
    const s = G.s;
    switch (id) {
      case 'autoProd': return lvl ? `New car every ${(1.6 * Math.pow(0.87, lvl - 1)).toFixed(1)}s` : 'Start production by hand';
      case 'belt': return `Belt ${(2.0 * Math.pow(1.12, lvl)).toFixed(1)} m/s`;
      case 'autoSell': return lvl ? `Sells within ${(2.0 * Math.pow(0.84, lvl - 1) / (s.tech.logistics ? 3 : 1)).toFixed(1)}s` : 'Sell your cars by hand';
      case 'marketing': return `Sale price ×${CFT.fmt(Math.pow(1.1, lvl), true)}`;
      case 'staff': return `Stations +${8 * lvl}% faster`;
      case 'efficiency': return `Production cost −${Math.round((1 - Math.pow(0.94, lvl)) * 100)}%`;
      case 'showroom': return `${3 + lvl + (s.tech.logistics ? 2 : 0)} parking spots`;
    }
    return '';
  };

  // Technologie
  G.buyTech = function (id) {
    const t = CFT.TECH.find(x => x.id === id);
    if (!t || G.s.tech[id] || !G.reqMet(t.req) || !G.spend(t.cost)) return false;
    G.s.tech[id] = true;
    G.s.stats.upgrades++;
    G.dailyAdd('upgrades', 1);
    G.emit('tech', id);
    return true;
  };

  // Modellen
  G.researchModel = function (i) {
    const m = MODELS[i];
    if (G.s.models[i] || !G.s.models[i - 1] || !G.reqMet(m.req) || !G.spend(m.research)) return false;
    G.s.models[i] = true;
    G.s.model = i;
    G.emit('model', i);
    return true;
  };
  G.selectModel = function (i) {
    if (!G.s.models[i] || G.s.model === i) return false;
    G.s.model = i;
    G.emit('modelSelect', i);
    return true;
  };

  // Productielijnen
  G.canBuyLine = () => G.s.lines < CFT.MAX_LINES && !G.s.building.line && G.reqMet(CFT.LINE_REQ[G.s.lines]);
  G.lineCost = () => CFT.LINE_COST[G.s.lines] || Infinity;
  G.lineTime = () => CFT.LINE_TIME[G.s.lines] || 0;
  G.buyLine = function () {
    if (!G.canBuyLine() || !G.spend(G.lineCost())) return false;
    const t = G.lineTime();
    if (t <= 0) { G.completeLine(); return true; }
    const now = G.now();
    G.s.building.line = { start: now, end: now + t * 1000 };
    G.emit('buildStart', 'line', G.s.lines);
    return true;
  };
  G.completeLine = function () {
    G.s.building.line = null;
    G.s.lines++;
    G.emit('line', G.s.lines);
  };

  // ---- Bouwprojecten ----
  G.buildInfo = function (kind) {
    const b = G.s.building[kind];
    if (!b) return null;
    const now = G.now(), dur = Math.max(1, b.end - b.start);
    return { left: Math.max(0, (b.end - now) / 1000), progress: Math.min(1, Math.max(0, (now - b.start) / dur)), i: b.i };
  };
  G.skipBuild = function (kind) {
    const b = G.s.building[kind];
    if (!b) return false;
    b.end = G.now();
    G.checkBuilds();
    return true;
  };
  G.checkBuilds = function () {
    const b = G.s.building, now = G.now();
    if (b.st && now >= b.st.end) G.completeStation(b.st.i);
    if (b.line && now >= b.line.end) G.completeLine();
  };

  // ================= Productie =================
  G.trySpawn = function (li) {
    const line = G.rt.lines[li];
    const last = line.cars[line.cars.length - 1];
    if (last && last.x < G.GAP) return false;
    const golden = Math.random() < G.goldenChance();
    line.cars.push({ id: G.rt.nextId++, x: 0, stage: -1, proc: -1, pt: 0, golden, model: G.s.model, born: G.rt.t });
    G.s.produced++;
    G.rt.rush.push(G.rt.t);
    if (G.rt.rush.length > 400) G.rt.rush.splice(0, 200);
    G.dailyAdd('produce', 1);
    G.emit('spawn', li);
    return true;
  };
  G.manualProduce = function () {
    // handmatig: zet een auto op de eerste lijn met ruimte
    for (let li = 0; li < G.s.lines; li++) if (G.trySpawn(li)) return true;
    return false;
  };
  G.canManualProduce = function () {
    for (let li = 0; li < G.s.lines; li++) {
      const cars = G.rt.lines[li].cars, last = cars[cars.length - 1];
      if (!last || last.x >= G.GAP) return true;
    }
    return false;
  };

  G.sellLotCar = function (li, idx, auto) {
    const line = G.rt.lines[li];
    const entry = line.lot[idx];
    if (!entry || entry.leaving) return 0;
    const car = entry.car;
    const profit = G.carProfit(car.stage, car.golden, car.model);
    entry.leaving = 0.0001;
    G.earn(profit, true);
    G.s.sold++;
    if (car.golden) { G.s.golden++; G.dailyAdd('golden', 1); }
    G.emit('sold', li, entry, profit, auto);
    return profit;
  };
  G.sellAll = function () {
    let total = 0;
    for (let li = 0; li < G.s.lines; li++) {
      const lot = G.rt.lines[li].lot;
      for (let i = 0; i < lot.length; i++) total += G.sellLotCar(li, i, false);
    }
    return total;
  };
  G.lotCount = function () {
    let n = 0;
    for (let li = 0; li < G.s.lines; li++) n += G.rt.lines[li].lot.filter(e => !e.leaving).length;
    return n;
  };

  // fromSale: alleen verkopen tellen mee voor 'inkomsten per minuut' (geen bonussen)
  G.earn = function (amount, fromSale) {
    G.s.money += amount;
    G.s.totalEarned += amount;
    G.s.prestige.runEarned += amount;
    if (fromSale) {
      G.rt.log.push([G.rt.t, amount]);
      if (G.rt.log.length > 3000) G.rt.log.splice(0, 1000);
    }
    G.dailyAdd('earn', amount);
  };

  // Speler tikt op een station: geeft de auto daar een duwtje
  G.tapStation = function (li, i) {
    const line = G.rt.lines[li];
    const car = line.cars.find(c => c.proc === i);
    if (!car) return false;
    car.pt += G.stationTime(i) * 0.3;
    G.s.stats.taps++;
    G.dailyAdd('taps', 1);
    G.emit('tap', li, i);
    return true;
  };

  // ================= Update =================
  G.update = function (dt) {
    const s = G.s, rt = G.rt;
    rt.t += dt;
    s.stats.play += dt;
    const belt = G.beltSpeed();
    const cap = G.lotCap();
    const lastIdx = G.lastBuilt();

    for (let li = 0; li < s.lines; li++) {
      const line = rt.lines[li];

      // automatische productie
      if (s.upg.autoProd > 0) {
        const iv = G.spawnInterval();
        line.spawnT += dt;
        if (line.spawnT >= iv) {
          if (G.trySpawn(li)) line.spawnT = Math.max(0, line.spawnT - iv);
          else line.spawnT = iv;
        }
      }

      // auto's op de band (index 0 = voorste)
      const cars = line.cars;
      for (let ci = 0; ci < cars.length; ci++) {
        const car = cars[ci];
        if (car.proc >= 0) {
          car.pt += dt;
          if (car.pt >= G.stationTime(car.proc)) {
            car.stage = car.proc;
            car.proc = -1;
            car.pt = 0;
            G.emit('stationDone', li, car.stage, car);
          } else continue;
        }
        // volgende station om bij te stoppen
        let next = -1;
        for (let i = car.stage + 1; i <= lastIdx; i++) { if (s.stations[i] > 0) { next = i; break; } }
        let stopX = next >= 0 ? G.ST_X[next] : G.BELT_END;
        if (ci > 0) stopX = Math.min(stopX, cars[ci - 1].x - G.GAP);
        // na het laatst gebouwde station: sneltransport langs de lege bouwplaatsen naar de showroom
        // (beïnvloedt alleen de doorlooptijd, niet de productiesnelheid)
        const sp = next < 0 && lastIdx < ST.length - 1 ? belt * G.EXPRESS : belt;
        car.x = Math.min(car.x + sp * dt, Math.max(car.x, stopX));
        if (next >= 0 && car.x >= G.ST_X[next] - 1e-6) {
          car.x = G.ST_X[next];
          car.proc = next;
          car.pt = 0;
          G.emit('stationStart', li, next, car);
        }
      }
      // voorste auto aan het einde → showroom
      line.full = false;
      if (cars.length && cars[0].proc < 0 && cars[0].x >= G.BELT_END - 1e-6) {
        const parked = line.lot.filter(e => !e.leaving).length;
        if (parked < cap) {
          const used = new Set(line.lot.map(e => e.slot));
          let slot = 0; while (used.has(slot)) slot++;
          const car = cars.shift();
          line.lot.push({ car, slot, anim: 0, timer: 0, leaving: 0 });
          G.emit('arrive', li, car);
        } else line.full = true;
      }

      // showroom
      const sd = G.sellDelay();
      for (let i = 0; i < line.lot.length; i++) {
        const e = line.lot[i];
        e.anim = Math.min(1, e.anim + dt * 2.2);
        if (e.leaving) { e.leaving += dt * 1.6; continue; }
        if (isFinite(sd) && e.anim >= 1) {
          e.timer += dt;
          if (e.timer >= sd) G.sellLotCar(li, i, true);
        }
      }
      line.lot = line.lot.filter(e => !e.leaving || e.leaving < 1);
    }

    // VIP-koper
    if (rt.vip) {
      if (rt.t > rt.vip.until) { rt.vip = null; rt.vipTimer = 50 + Math.random() * 50; G.emit('vipGone'); }
    } else if (s.produced >= 5) {
      rt.vipTimer -= dt;
      if (rt.vipTimer <= 0) {
        rt.vip = { until: rt.t + 14, reward: Math.max(60, G.ips() * 45) };
        G.emit('vip', rt.vip);
      }
    }

    // missies/prestaties met lage frequentie
    G.checkBuilds();
    rt.accum += dt;
    if (rt.accum > 0.25) { rt.accum = 0; G.checkAchievements(); G.checkMission(); }
  };

  G.claimVip = function (mult) {
    const v = G.rt.vip;
    if (!v) return 0;
    const amount = v.reward * (mult || 1);
    G.rt.vip = null;
    G.rt.vipTimer = 60 + Math.random() * 60;
    G.earn(amount);
    G.s.stats.vip++;
    G.dailyAdd('vip', 1);
    G.emit('vipClaim', amount);
    return amount;
  };

  G.activateBoost = function (seconds) {
    const now = G.now();
    G.s.boostUntil = Math.max(now, G.s.boostUntil) + seconds * 1000;
    G.emit('boost');
  };

  // ================= Missies =================
  G.missionDef = function () {
    const s = G.s;
    if (s.mission < CFT.MISSIONS.length) return CFT.MISSIONS[s.mission];
    if (!s.genMission) {
      const k = s.mission - CFT.MISSIONS.length;
      const types = ['produce', 'earn', 'slvl', 'golden'];
      const t = types[k % types.length];
      const ips = G.ips();
      let m;
      if (t === 'produce') m = { t, n: Math.ceil((s.produced * 1.25 + 200) / 50) * 50 };
      else if (t === 'earn') m = { t, n: s.totalEarned * 2 + ips * 300 };
      else if (t === 'slvl') { const i = k % 7; m = { t, i, n: Math.max(s.stations[i] + 15, (G.nextMilestone(s.stations[i]) || s.stations[i] + 25)) }; }
      else m = { t, n: s.golden + 3 };
      m.gen = true;
      s.genMission = m;
    }
    return s.genMission;
  };
  G.missionProgress = function (m) {
    const s = G.s;
    switch (m.t) {
      case 'produce': return [s.produced, m.n];
      case 'sell': return [s.sold, m.n];
      case 'earn': return [s.totalEarned, m.n];
      case 'build': return [s.stations[m.i] > 0 ? 1 : 0, 1];
      case 'slvl': return [Math.min(s.stations[m.i], m.n), m.n];
      case 'upg': return [Math.min(s.upg[m.id], m.n), m.n];
      case 'model': return [s.models[m.i] ? 1 : 0, 1];
      case 'lines': return [Math.min(s.lines, m.n), m.n];
      case 'tech': return [s.tech[m.id] ? 1 : 0, 1];
      case 'golden': return [Math.min(s.golden, m.n), m.n];
      case 'rush': { const c = G.rt.rush.filter(t => G.rt.t - t <= m.s).length; return [Math.min(c, m.n), m.n]; }
    }
    return [0, 1];
  };
  G.missionText = function (m) {
    if (m.text) return m.text;
    switch (m.t) {
      case 'produce': return m.n === 1 ? 'Produce your first car' : `Produce ${CFT.fmt(m.n)} cars in total`;
      case 'sell': return `Sell ${m.n} cars in the showroom`;
      case 'earn': return `Earn ${CFT.fmtMoney(m.n)} in total`;
      case 'build': return `Build the ${ST[m.i].name}`;
      case 'slvl': return `Upgrade the ${ST[m.i].name} to level ${m.n}`;
      case 'upg': return m.n === 1 ? `Buy ${G.upgDef(m.id).name}` : `${G.upgDef(m.id).name} to level ${m.n}`;
      case 'model': return `Develop the ${MODELS[m.i].name} (${MODELS[m.i].cat})`;
      case 'lines': return `Build production line ${m.n}`;
      case 'tech': return `Research ${CFT.TECH.find(t => t.id === m.id).name}`;
      case 'golden': return `Sell ${m.n} golden cars in total`;
      case 'rush': return `Produce ${m.n} cars within ${m.s / 60} minutes`;
    }
    return '';
  };
  G.missionReward = function (m) {
    const base = m.gen ? 0 : m.r;
    return Math.max(base, G.measuredIps() * (m.gen ? 90 : 30));
  };
  G.missionDone = function () {
    const m = G.missionDef(), [a, b] = G.missionProgress(m);
    return a >= b;
  };
  G.checkMission = function () {
    const m = G.missionDef();
    const done = G.missionDone();
    if (done && !m._notified) { m._notified = true; G.emit('missionReady', m); }
  };
  G.claimMission = function (mult) {
    if (!G.missionDone()) return 0;
    const m = G.missionDef();
    const r = G.missionReward(m) * (mult || 1);
    delete m._notified;
    G.s.mission++;
    G.s.genMission = null;
    G.earn(r);
    G.emit('missionClaim', r, m);
    return r;
  };

  // ================= Prestaties =================
  G.checkAchievements = function () {
    for (const a of CFT.ACHIEVEMENTS) {
      if (!G.s.ach[a.id] && a.check(G.s)) {
        G.s.ach[a.id] = Date.now();
        G.emit('achievement', a);
      }
    }
  };

  // ================= Dagelijkse uitdagingen =================
  G.today = function (offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  // ---- Dagelijkse login-bonus (reeks van max. 7 dagen; een dag overslaan zet de reeks terug op 1) ----
  G.STREAK_MAX = 7;
  G.checkStreak = function () {
    const st = G.s.streak, today = G.today();
    if (st.last === today) return false;
    st.n = st.last === G.today(-1) ? Math.min(G.STREAK_MAX, st.n + 1) || 1 : 1;
    st.last = today; st.claimed = false;
    return true;
  };
  G.streakReward = () => Math.max(150 * G.s.streak.n, G.ips() * 60 * G.s.streak.n);
  G.streakTurbo = () => 60 * Math.min(5, G.s.streak.n); // seconden
  G.claimStreak = function (mult) {
    const st = G.s.streak;
    if (st.claimed) return 0;
    st.claimed = true;
    const r = G.streakReward() * (mult || 1);
    G.earn(r);
    G.activateBoost(G.streakTurbo());
    G.emit('streakClaim', r);
    return r;
  };
  G.ensureDaily = function () {
    const day = G.today();
    if (G.s.daily && G.s.daily.date === day) return;
    // eenvoudige seeded random op datum
    let seed = 0; for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pool = CFT.DAILY_TEMPLATES.slice();
    const tasks = [];
    const rate = Math.max(0.3, G.lineRate(true) * G.s.lines), ips = Math.max(5, G.theoreticalIps());
    while (tasks.length < 3) {
      const tpl = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      tasks.push({ t: tpl.t, n: Math.round(tpl.scale(rate, ips)), p: 0, claimed: false });
    }
    G.s.daily = { date: day, tasks };
  };
  G.dailyAdd = function (t, n) {
    const d = G.s.daily;
    if (!d) return;
    for (const task of d.tasks) if (task.t === t && !task.claimed) task.p = Math.min(task.n, task.p + n);
  };
  G.dailyReward = () => Math.max(500, G.ips() * 120);
  G.claimDaily = function (idx) {
    const task = G.s.daily && G.s.daily.tasks[idx];
    if (!task || task.claimed || task.p < task.n) return 0;
    task.claimed = true;
    const r = G.dailyReward();
    G.earn(r);
    G.activateBoost(120);
    G.emit('dailyClaim', r);
    return r;
  };

  // ================= Opslaan / laden / offline =================
  G.serialize = function () {
    G.s.savedAt = G.now();
    return JSON.stringify(G.s);
  };
  // extra opslag (bijv. CrazyGames Data-module, gesynchroniseerd met het account); LocalStorage blijft altijd de basis
  G.cloud = null;
  G.save = function (storage) {
    const json = G.serialize();
    let ok = false;
    try { (storage || globalThis.localStorage).setItem(G.SAVE_KEY, json); ok = true; } catch (e) {}
    if (!storage && G.cloud) { try { G.cloud.setItem(G.SAVE_KEY, json); ok = true; } catch (e) {} }
    if (ok) { G.lastSaved = G.now(); G.emit('saved'); }
    return ok;
  };
  // Zet ruwe save-data om naar een geldige spelstatus (ook voor oudere of geïmporteerde saves)
  G.applyData = function (data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.stations) || data.stations.length !== ST.length || typeof data.money !== 'number') return false;
    const fresh = G.newState();
    G.s = Object.assign(fresh, data);
    G.s.upg = Object.assign(G.newState().upg, data.upg || {});
    G.s.stats = Object.assign(G.newState().stats, data.stats || {});
    G.s.settings = Object.assign(G.newState().settings, data.settings || {});
    G.s.tech = Object.assign({}, data.tech || {});
    G.s.ach = Object.assign({}, data.ach || {});
    G.s.building = Object.assign({ st: null, line: null }, data.building || {});
    // migratie: saves van vóór het prestige-systeem tellen alles wat ooit verdiend is mee voor de eerste herstart
    G.s.prestige = Object.assign(G.newState().prestige, data.prestige || { runEarned: +data.totalEarned || 0 });
    G.s.streak = Object.assign(G.newState().streak, data.streak || {});
    if (!Array.isArray(G.s.models)) G.s.models = G.newState().models;
    while (G.s.models.length < MODELS.length) G.s.models.push(false);
    G.s.models[0] = true;
    if (!G.s.models[G.s.model]) G.s.model = 0;
    G.s.lines = Math.max(1, Math.min(CFT.MAX_LINES, G.s.lines | 0));
    if (!isFinite(G.s.money)) G.s.money = 0;
    return true;
  };
  const readSave = st => { try { const raw = st && st.getItem(G.SAVE_KEY); const d = raw ? JSON.parse(raw) : null; return d && typeof d === 'object' ? d : null; } catch (e) { return null; } };
  // laadt de meest recente geldige save uit LocalStorage en (indien aanwezig) de cloud-opslag
  G.load = function (storage) {
    const cands = [readSave(storage || globalThis.localStorage)];
    if (!storage && G.cloud) cands.push(readSave(G.cloud));
    const valid = cands.filter(Boolean).sort((a, b) => (+b.savedAt || 0) - (+a.savedAt || 0));
    for (const d of valid) if (G.applyData(d)) return true;
    return false;
  };
  G.lastSaved = 0;
  // Save-code: tekst die je kunt bewaren en op een ander apparaat of in een andere versie weer inladen
  G.exportCode = function () {
    const json = G.serialize();
    const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
    return 'CFT1-' + b64;
  };
  G.importCode = function (code) {
    try {
      code = String(code || '').trim().replace(/\s+/g, '');
      if (!code.startsWith('CFT1-')) return false;
      const b64 = code.slice(5);
      const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
      const backup = G.s;
      if (!G.applyData(JSON.parse(json))) { G.s = backup; return false; }
      G.s.savedAt = G.now(); // geen offline inkomsten voor de tijd dat de code bewaard lag
      G.resetRuntime();
      G.ensureDaily();
      G.save();
      G.emit('imported');
      return true;
    } catch (e) { return false; }
  };
  G.offlineCap = () => (G.s.tech.offline ? 8 : 2) * 3600;
  G.offlineEff = () => (G.s.tech.offline ? 1 : 0.5);
  G.computeOffline = function () {
    const secs = Math.min(G.offlineCap(), Math.max(0, (G.now() - (G.s.savedAt || G.now())) / 1000));
    if (secs < 60 || !G.s.upg.autoProd || !G.s.upg.autoSell) return { secs, amount: 0 };
    const rate = G.lineRate(true) * G.s.lines;
    return { secs, amount: rate * secs * G.expectedProfit() * G.offlineEff(), cars: Math.floor(rate * secs) };
  };
  // ================= Prestige: nieuw merk starten =================
  G.PRESTIGE_BASE = 1e9;      // verdiensten per run voor de eerste ster
  G.PRESTIGE_BONUS = 0.1;     // +10% inkomsten per ster
  G.prestigeMult = () => 1 + G.PRESTIGE_BONUS * G.s.prestige.stars;
  // sterren die je in deze run verdient (wortelcurve: eerste ster snel, daarna steeds meer nodig)
  G.prestigeGain = () => Math.floor(Math.sqrt(Math.max(0, G.s.prestige.runEarned) / G.PRESTIGE_BASE));
  G.prestigeNext = () => Math.pow(G.prestigeGain() + 1, 2) * G.PRESTIGE_BASE;
  G.prestigeUnlocked = () => G.s.lines >= 2 || G.s.prestige.count > 0;
  G.canPrestige = () => G.prestigeUnlocked() && G.prestigeGain() >= 1;
  G.prestigeStartMoney = () => G.START_MONEY + 250 * G.s.prestige.count;
  G.doPrestige = function () {
    if (!G.canPrestige()) return 0;
    const old = G.s, gain = G.prestigeGain(), fresh = G.newState();
    // blijft: prestaties, statistieken, levenslange totalen, instellingen, dagelijkse uitdagingen, lopende Turbo
    for (const k of ['totalEarned', 'produced', 'sold', 'golden', 'ach', 'stats', 'settings', 'daily', 'boostUntil', 'tut', 'streak']) fresh[k] = old[k];
    fresh.prestige = { stars: old.prestige.stars + gain, count: old.prestige.count + 1, runEarned: 0, best: Math.max(old.prestige.best, gain) };
    G.s = fresh;
    // reputatie: automatische productie en verkoop vanaf het begin, meer startgeld
    G.s.upg.autoProd = 1; G.s.upg.autoSell = 1;
    G.s.money = G.prestigeStartMoney();
    G.s.savedAt = G.now();
    G.resetRuntime();
    G.emit('imported');
    G.emit('prestige', gain);
    G.save();
    return gain;
  };

  G.reset = function () {
    G.s = G.newState();
    G.s.streak.last = G.today(); // eerste dag: geen bonusvenster bovenop de introductie
    G.resetRuntime();
    G.ensureDaily();
  };
})();
