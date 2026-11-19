/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — opstarten, game-loop, opslaan en effect-koppelingen */
(function () {
  const CFT = globalThis.CFT;
  const G = CFT.Game, R = CFT.Render, U = CFT.UI, A = CFT.Audio, P = CFT.Platform;
  const ST = CFT.STATIONS, MODELS = CFT.MODELS;
  const $ = id => document.getElementById(id);
  const fm = CFT.fmtMoney;

  let last = performance.now(), saveT = 0, hiddenAt = 0;

  function setLoad(p, t) { $('loadBar').style.width = p + '%'; if (t) $('loadText').textContent = t; }

  // ---------- effecten koppelen aan spel-events ----------
  function wireEvents() {
    G.on('sold', (li, entry, profit, auto) => {
      const sp = R.slotPos(li, entry.slot);
      R.addFloat(sp[0], sp[1], 1.2, '+' + fm(profit), entry.car.golden ? '#fde047' : '#4ade80', entry.car.golden);
      if (!auto || Math.random() < 0.5) R.burst(sp[0], sp[1], 0.8, entry.car.golden ? '#fde047' : '#fbbf24', entry.car.golden ? 30 : auto ? 5 : 12);
      A.coin(entry.car.golden);
      if (entry.car.golden) { U.toast(`⭐ Golden car sold! +${fm(profit)}`, 'gold'); P.happytime(); }
      U.bumpMoney();
    });
    G.on('arrive', () => A.carDone());
    G.on('spawn', () => A.conveyor());
    G.on('stationStart', (li, i) => A.station(ST[i].fx));
    G.on('tap', (li, i) => {
      A.tap();
      R.burst(G.ST_X[i], R.lineY(li) + 2.6, 1.2, '#93c5fd', 6);
      R.addFloat(G.ST_X[i], R.lineY(li) + 2.6, 1.4, '⚡', '#93c5fd');
    });
    G.on('build', i => {
      A.unlock2();
      R.flash[i] = performance.now() / 1000;
      for (let li = 0; li < G.s.lines; li++) R.burst(G.ST_X[i], R.lineY(li) + 0.8, 1.4, ST[i].accent, 26);
      U.toast(`${ST[i].icon} <b>${ST[i].name}</b> built! Cars are now worth ×${ST[i].stage} more`, 'good');
      if (i === ST.length - 1) setTimeout(() => U.toast('🏁 Your first full production line is complete!', 'gold'), 600);
    });
    G.on('buildStart', (kind, i) => {
      A.upgrade();
      const name = kind === 'st' ? ST[i].name : `Production line ${i + 1}`;
      const t = kind === 'st' ? ST[i].buildTime : CFT.LINE_TIME[i];
      U.toast(`🏗️ Building <b>${name}</b> · ready in ${CFT.fmtTime(t)}`, 'good');
    });
    G.on('stationUp', (i, n, milestone) => {
      A.upgrade();
      R.flash[i] = performance.now() / 1000;
      for (let li = 0; li < G.s.lines; li++) R.burst(G.ST_X[i], R.lineY(li) + 0.8, 1.4, '#86efac', 6);
      if (milestone) {
        A.milestone();
        U.toast(`🚀 ${ST[i].name} lv ${G.s.stations[i]}: <b>×2 speed</b>!`, 'gold');
        if (G.s.stations[i] === 10) U.toast('🦾 Extra robot arm installed!', 'good');
        if (G.s.stations[i] === 25) U.toast('✨ Golden machine upgrade!', 'good');
      }
    });
    G.on('upgrade', id => {
      A.upgrade();
      const lvl = G.s.upg[id];
      if (lvl === 1 && id === 'autoProd') { A.unlock2(); U.toast('🤖 Your factory now produces <b>automatically</b>!', 'gold'); }
      if (lvl === 1 && id === 'autoSell') { A.unlock2(); U.toast('🤝 Your sales team now sells <b>automatically</b>!', 'gold'); }
      if (id === 'showroom') U.toast('🏬 Extra parking spot in the showroom', 'good');
    });
    G.on('tech', id => {
      A.unlock2();
      const t = CFT.TECH.find(x => x.id === id);
      U.toast(`${t.icon} Technology: <b>${t.name}</b> — ${t.desc}`, 'gold');
    });
    G.on('model', i => { A.unlock2(); P.happytime(); U.modelDialog(i); });
    G.on('line', n => {
      A.unlock2(); P.happytime();
      U.toast(`🏗️ Production line ${n} is open! Your factory has grown.`, 'gold');
      R.cam.user = false; U.layoutPads();
    });
    G.on('missionReady', () => { A.milestone(); U.toast('🎯 Mission complete! Claim your reward.', 'good'); });
    G.on('achievement', a => {
      A.milestone(); U.unseenAch++;
      U.toast(`🏆 <b>${a.name}</b> · +3% income`, 'gold');
    });
    G.on('vip', () => A.milestone());
  }

  // ---------- opslaan ----------
  function save() { G.save(); }

  function catchUpOffline(showDialog) {
    const off = G.computeOffline();
    if (off.amount > 0 && showDialog) U.offlineDialog(off);
    else if (off.secs > 120 && showDialog && G.s.produced > 0 && !(G.s.upg.autoProd && G.s.upg.autoSell)) {
      U.toast('💡 Tip: with <b>Auto Production</b> and a <b>Sales Team</b> you also earn money while you’re away', 'good');
    }
    G.s.savedAt = G.now();
  }

  // ---------- loop ----------
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!P.adPlaying) {
      G.update(dt);
      saveT += dt;
      if (saveT > 8) { saveT = 0; save(); }
    }
    R.draw(P.adPlaying ? 0 : dt);
    U.update(dt);
    // fabrieksgezoem op basis van activiteit
    let active = 0;
    for (let li = 0; li < G.s.lines; li++) active += G.rt.lines[li].cars.filter(c => c.proc >= 0).length;
    A.setHum(active * 0.25);
    requestAnimationFrame(frame);
  }

  // ---------- opstarten ----------
  async function boot() {
    setLoad(10, 'Starting the factory…');
    P.loadingStart();
    await P.init();
    setLoad(40, 'Calibrating machines…');
    if (P.cloudStorage) G.cloud = P.cloudStorage;
    const loaded = G.load();
    if (!loaded) G.reset();
    Object.assign(A.settings, G.s.settings);
    G.s.settings = A.settings;
    G.ensureDaily();
    R.init($('game'));
    U.init();
    wireEvents();
    U.layoutPads();
    window.addEventListener('resize', () => { U.layoutPads(); R.resize(); });
    setLoad(80, 'Starting the assembly line…');

    P.onPause = () => { A.pause(); };
    P.onResume = () => { A.resume(); last = performance.now(); };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); save(); A.pause(); P.gameplayStop(); }
      else {
        A.resume(); last = performance.now();
        if (hiddenAt && Date.now() - hiddenAt > 60000) catchUpOffline(true);
        else G.s.savedAt = G.now();
        P.gameplayStart();
      }
    });
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);

    setLoad(100, 'Ready!');
    setTimeout(() => {
      $('loading').classList.add('gone');
      setTimeout(() => $('loading').remove(), 600);
      P.loadingStop();
      P.gameplayStart();
      if (loaded) catchUpOffline(true);
      else U.toast('👋 Welcome, boss! Build the biggest car factory in the world.', 'good');
    }, 250);
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // Debughulpje voor testen in de console: CFT.debug.money(1e6)
  CFT.debug = { money: n => { G.s.money += n; }, state: () => G.s };

  console.info('%cCar Factory Tycoon%c © 2026 Brakeco Games', 'font-weight:bold;color:#f59e0b', 'color:inherit');
  boot();
})();
