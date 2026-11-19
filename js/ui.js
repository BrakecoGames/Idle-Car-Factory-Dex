/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — interface (HUD, panelen, modalen, invoer) */
(function () {
  const CFT = (globalThis.CFT = globalThis.CFT || {});
  const G = CFT.Game, R = CFT.Render, A = CFT.Audio, P = CFT.Platform;
  const ST = CFT.STATIONS, MODELS = CFT.MODELS;
  const U = (CFT.UI = {});
  const $ = id => document.getElementById(id);
  const fm = CFT.fmtMoney, f = CFT.fmt;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  U.tab = null;
  U.buyMode = 1;
  U.unseenAch = 0;
  let lastPanelHtml = '', panelTimer = 0, lastMoneyText = '';

  // ================= Init =================
  U.init = function () {
    // tabs
    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
      A.click();
      if (U.tab === b.dataset.tab) U.closePanel(); else U.openTab(b.dataset.tab);
    }));
    $('panelClose').addEventListener('click', () => { A.click(); U.closePanel(); });
    $('buyMode').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      U.buyMode = b.dataset.mode === 'max' || b.dataset.mode === 'next' ? b.dataset.mode : +b.dataset.mode;
      document.querySelectorAll('#buyMode button').forEach(x => x.classList.toggle('on', x === b));
      A.click(); U.refreshPanel(true);
    });
    // acties in paneel (met ingedrukt-houden om te herhalen)
    const body = $('panelBody');
    body.addEventListener('pointerdown', () => { U._pressing = true; });
    ['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, () => { setTimeout(() => { U._pressing = false; }, 0); }));
    let holdTimer = null, holdAct = null, held = false;
    const stopHold = () => { clearTimeout(holdTimer); clearInterval(holdTimer); holdTimer = null; holdAct = null; };
    body.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      held = false;
      if (b.dataset.hold) {
        holdAct = b.dataset.act;
        holdTimer = setTimeout(() => {
          holdTimer = setInterval(() => { held = true; if (!U.act(holdAct, true)) stopHold(); }, 110);
        }, 380);
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => body.addEventListener(ev, stopHold));
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (held) { held = false; return; }
      U.act(b.dataset.act);
    });
    $('modalBox').addEventListener('click', e => {
      const b = e.target.closest('[data-mact]');
      if (b && U._modalActs[b.dataset.mact]) U._modalActs[b.dataset.mact]();
    });
    $('modalBox').addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.set) { A.settings[t.dataset.set] = G.s.settings[t.dataset.set] = +t.value; A.apply(); }
    });

    // knoppen
    const prod = $('produceBtn');
    let prodHold = null;
    prod.addEventListener('pointerdown', () => {
      A.unlock();
      U.produce();
      clearInterval(prodHold);
      prodHold = setInterval(U.produce, 260);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => prod.addEventListener(ev, () => clearInterval(prodHold)));
    $('sellAllBtn').addEventListener('click', () => { const t = G.sellAll(); if (t > 0) U.bumpMoney(); });
    $('boostBtn').addEventListener('click', () => { A.click(); U.boostDialog(); });
    $('soundBtn').addEventListener('click', () => {
      A.unlock();
      G.s.settings.muted = A.settings.muted = !A.settings.muted; A.apply(); U.updateSoundBtn();
    });
    $('settingsBtn').addEventListener('click', () => { A.click(); U.settingsDialog(); });
    $('saveBtn').addEventListener('click', () => { A.click(); U.saveDialog(); });
    G.on('saved', () => {
      const b = $('saveBtn'); b.classList.add('saved'); b.textContent = '✓';
      clearTimeout(U._savedT); U._savedT = setTimeout(() => { b.classList.remove('saved'); b.textContent = '💾'; }, 900);
    });
    $('modelChip').addEventListener('click', () => { A.click(); U.openTab('models'); });
    $('starChip').addEventListener('click', () => { A.click(); U.prestigeDialog(); });
    $('fitBtn').addEventListener('click', () => { A.click(); R.cam.user = false; U.layoutPads(); R.fit(); });
    // cameraknoppen: ingedrukt houden draait/zoomt door
    const camHold = (id, fn) => {
      let iv = null;
      const stop = () => { clearInterval(iv); iv = null; };
      $(id).addEventListener('pointerdown', () => { A.click(); fn(); stop(); iv = setInterval(fn, 60); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $(id).addEventListener(ev, stop));
    };
    camHold('rotL', () => R.rotate(-0.09));
    camHold('rotR', () => R.rotate(0.09));
    camHold('zoomIn', () => R.zoomAt(innerWidth / 2, innerHeight / 2, 1.07));
    camHold('zoomOut', () => R.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.07));
    $('missionClaim').addEventListener('click', () => U.act('mission'));
    $('missionCard').addEventListener('click', e => { if (e.target.id !== 'missionClaim') { A.click(); U.openTab('missions'); } });
    $('nextCard').addEventListener('click', () => { A.click(); if (U.nextTab) U.openTab(U.nextTab); });
    $('vipBtn').addEventListener('click', () => { A.click(); U.vipDialog(); });

    U.bindCanvas($('game'));
    // missiekaart verandert van hoogte (claim-knop): camera-marges bijwerken
    if (window.ResizeObserver) { let lastH = 0; new ResizeObserver(() => { const h = $('sideCards').offsetHeight; if (h !== lastH) { lastH = h; U.layoutPads(); } }).observe($('sideCards')); }
    // de app-container mag nooit verschuiven (bijv. door focus op een tekstveld)
    $('app').addEventListener('scroll', () => { $('app').scrollLeft = 0; $('app').scrollTop = 0; });
    U.updateSoundBtn();
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); U.saveNow(); return; }
      if (e.code === 'Space' && !e.repeat && document.activeElement === document.body) { e.preventDefault(); U.produce(); }
      if (e.key === 'Escape') { if (!$('modal').hidden) U.closeModal(); else U.closePanel(); }
    });
  };

  U.updateSoundBtn = () => { $('soundBtn').textContent = A.settings.muted ? '🔇' : '🔊'; };

  U.produce = function () {
    if (G.manualProduce()) { A.click(); }
  };

  // ================= Canvas-invoer =================
  U.bindCanvas = function (cv) {
    const pts = new Map();
    let start = null, dragged = false, pinch = null, rotating = false;
    cv.addEventListener('pointerdown', e => {
      A.unlock();
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { start = [e.clientX, e.clientY]; dragged = false; rotating = e.button === 2 || e.button === 1 || e.shiftKey; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
        dragged = true;
      }
    });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        R.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d);
        pinch.d = d;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        let da = ang - pinch.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < 0.5) R.rotate(da);
        pinch.a = ang;
        return;
      }
      if (!dragged && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 9) { dragged = true; cv.classList.add('dragging'); }
      if (dragged && rotating) R.rotate(-(e.clientX - prev[0]) * 0.006, (e.clientY - prev[1]) * 0.004);
      else if (dragged) R.pan(e.clientX - prev[0], e.clientY - prev[1]);
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        cv.classList.remove('dragging');
        if (!dragged && e.type === 'pointerup') { const r = cv.getBoundingClientRect(); U.canvasTap(e.clientX - r.left, e.clientY - r.top); }
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); R.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // scrollwiel ingedrukt + slepen = draaien: voorkom het automatisch-scrollen-icoon van de browser
    cv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    cv.addEventListener('auxclick', e => e.preventDefault());
  };

  U.canvasTap = function (x, y) {
    let h = R.hitTest(x, y);
    if (!h) {
      // vergevingsgezind tikken (vooral op mobiel): dichtstbijzijnde auto in de showroom binnen 40px
      let best = null, bd = 40;
      for (const c of R.hits) if (c.kind === 'lot') { const d = Math.hypot(c.x + c.w / 2 - x, c.y + c.h / 2 - y); if (d < bd) { bd = d; best = c; } }
      h = best;
    }
    if (!h) return;
    if (h.kind === 'lot') {
      const idx = G.rt.lines[h.li].lot.findIndex(e => e.slot === h.slot && !e.leaving);
      if (idx >= 0 && G.sellLotCar(h.li, idx, false)) U.bumpMoney();
    } else if (h.kind === 'station') {
      const lvl = G.s.stations[h.i];
      if (lvl && G.tapStation(h.li, h.i)) {
        R.selected = h.i;
        return;
      }
      R.selected = h.i;
      A.click();
      U.openTab('stations', h.i);
    } else if (h.kind === 'buildsite') {
      A.click(); U.skipDialog(h.which);
    } else if (h.kind === 'ghost') {
      if (G.canBuyLine() && G.s.money >= G.lineCost()) G.buyLine();
      else { A.click(); U.openTab('stations'); }
    }
  };

  // ================= Paneel =================
  const TITLES = { stations: '🏭 Factory', upgrades: '⬆️ Upgrades & technology', models: '🚘 Car models', missions: '🎯 Missions & challenges', achievements: '🏆 Achievements' };
  U.openTab = function (tab, focusStation) {
    U.tab = tab;
    $('panel').classList.remove('closed');
    $('app').classList.add('panel-open');
    $('panelTitle').textContent = TITLES[tab];
    $('buyMode').hidden = tab !== 'stations';
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'achievements') U.unseenAch = 0;
    lastPanelHtml = '';
    U.refreshPanel(true);
    $('panelBody').scrollTop = 0;
    if (focusStation != null) {
      const el = document.getElementById('st' + focusStation);
      if (el) el.scrollIntoView({ block: 'center' });
    }
    U.layoutPads();
  };
  U.closePanel = function () {
    U.tab = null;
    R.selected = -1;
    $('panel').classList.add('closed');
    $('app').classList.remove('panel-open');
    document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on'));
    U.layoutPads();
  };
  U.shortLand = () => window.innerHeight <= 520 && window.innerWidth > window.innerHeight && window.innerWidth >= 600;
  U.layoutPads = function () {
    if (U.shortLand()) {
      // telefoon liggend: fabriek tussen missiekaart (links) en produceerknop (rechts)
      const panelW = Math.min(400, window.innerWidth * 0.52);
      R.pad.t = 64; R.pad.b = 58;
      R.pad.l = U.tab ? 10 : 200;
      R.pad.r = U.tab ? panelW + 10 : 92;
      if (!R.cam.user) R.fit();
      return;
    }
    const wide = window.innerWidth >= 900;
    const small = window.innerWidth < 641;
    // kleine schermen: de missiekaart staat over de volle breedte, dus de fabriek begint eronder
    R.pad.t = small ? Math.max(120, $('sideCards').getBoundingClientRect().bottom + 6) : 70;
    R.pad.l = !small && window.innerWidth >= 1100 ? 320 : 10;
    R.pad.r = wide && U.tab ? 410 : 10;
    R.pad.b = !wide && U.tab ? window.innerHeight * 0.58 + 64 : small ? 170 : 165;
    if (!R.cam.user) R.fit();
  };

  U.refreshPanel = function (force) {
    if (!U.tab) return;
    if (!force && U._pressing) return;
    const html = U['tab_' + U.tab]();
    if (!force && html === lastPanelHtml) return;
    lastPanelHtml = html;
    const body = $('panelBody'), sc = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = sc;
    if (U.tab === 'models') body.querySelectorAll('canvas[data-model]').forEach(c => R.drawPreview(c, +c.dataset.model, 6, false));
  };

  // Item voor een project in aanbouw: voortgang, resterende tijd en 'direct klaar'-knop
  function buildingItem(icon, name, info, kind, i) {
    const sec = Math.ceil(info.left);
    return `<div class="item building" ${i != null ? `id="st${i}"` : ''}><div class="ic">${icon}</div><div>
      <div class="nm">${name} <span class="lv" style="color:#38bdf8">🏗️ under construction</span></div>
      <div class="ds">Ready in <b>${CFT.fmtTime(sec)}</b></div>
      <div class="mbar build"><i style="width:${(info.progress * 100).toFixed(0)}%"></i></div></div>
      ${btn('skip:' + kind, '📺 Finish now', 'short ad', true, 'gold')}</div>`;
  }

  function btn(act, label, sub, enabled, cls, hold) {
    return `<button class="buy ${cls || ''}" data-act="${act}" ${hold ? 'data-hold="1"' : ''} ${enabled ? '' : 'disabled'}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
  }

  U.tab_stations = function () {
    const s = G.s;
    let h = '';
    // fabriek uitbreiden
    const lb = G.buildInfo('line');
    if (lb) {
      h += `<h3>Expand factory</h3>` + buildingItem('🏗️', `Production line ${s.lines + 1}`, lb, 'line');
    } else if (s.lines < CFT.MAX_LINES) {
      const can = G.canBuyLine(), cost = G.lineCost();
      h += `<h3>Expand factory</h3>
      <div class="item ${can ? '' : 'locked'}"><div class="ic">🏗️</div><div><div class="nm">Production line ${s.lines + 1}</div>
      <div class="ds">${can ? `One more complete assembly line. <b>+${Math.round(100 / s.lines)}% production</b>.<br>⏱ Build time <b>${CFT.fmtTime(G.lineTime())}</b>` : esc(G.reqText(CFT.LINE_REQ[s.lines]))}</div></div>
      ${btn('line', fm(cost), 'build', can && s.money >= cost, 'gold')}</div>`;
    }
    // nieuw merk (prestige)
    if (G.prestigeUnlocked()) {
      const gain = G.prestigeGain(), pr = s.prestige;
      h += `<h3>New brand</h3>
      <div class="item prestige"><div class="ic">⭐</div><div><div class="nm">Start a new brand ${pr.stars ? `<span class="lv">⭐ ${pr.stars} · +${Math.round((G.prestigeMult() - 1) * 100)}% income</span>` : ''}</div>
      <div class="ds">${gain >= 1 ? `Restart now for <b>+${gain} ⭐</b> (+${gain * 10}% income forever).` : `Earn <b>${fm(G.prestigeNext())}</b> this run for your first ⭐.`}<br>Next ⭐ at ${fm(G.prestigeNext())} earned (now ${fm(pr.runEarned)})</div></div>
      ${btn('prestige', gain >= 1 ? `+${gain} ⭐` : 'Locked', 'new brand', gain >= 1, 'gold')}</div>`;
    }
    h += `<h3>Production stations <span style="text-transform:none;color:#94a3b8;font-weight:600">(tap a station in the factory to lend a hand)</span></h3>`;
    let bott = -1, bt = 0;
    for (let i = 0; i < ST.length; i++) if (s.stations[i]) { const t = G.stationTime(i, true); if (t > bt) { bt = t; bott = i; } }
    for (let i = 0; i < ST.length; i++) {
      const st = ST[i], lvl = s.stations[i];
      const sel = R.selected === i ? 'sel' : '';
      if (!lvl) {
        if (G.isBuilding(i)) {
          h += buildingItem(st.icon, st.name, G.buildInfo('st'), 'st', i);
        } else if (G.canBuild(i)) {
          const sl = G.buildStartLevel(i);
          h += `<div class="item ${sel}" id="st${i}"><div class="ic">${st.icon}</div><div><div class="nm">${st.name}</div>
          <div class="ds">${st.desc}<br>Cars become worth <b>×${st.stage} more</b>${sl > 1 ? ` · starts at <b>lv ${sl}</b>` : ''}${st.buildTime ? `<br>⏱ Build time <b>${CFT.fmtTime(st.buildTime)}</b>` : ''}</div></div>
          ${btn('build:' + i, fm(st.build), 'build', s.money >= st.build, 'gold')}</div>`;
        } else {
          h += `<div class="item locked" id="st${i}"><div class="ic">🔒</div><div><div class="nm">${st.name}</div><div class="ds">Build the ${ST[i - 1].name} first</div></div><div></div></div>`;
        }
        continue;
      }
      const n = G.stationBuyCount(i, U.buyMode);
      const cost = G.stationUpCost(i, n);
      const nm = G.nextMilestone(lvl), prev = [...CFT.MILESTONES].reverse().find(m => m <= lvl) || 1;
      const mp = nm ? ((lvl - prev) / (nm - prev)) * 100 : 100;
      const t = G.stationTime(i, true);
      h += `<div class="item ${sel}" id="st${i}"><div class="ic">${st.icon}</div><div>
        <div class="nm">${st.name} <span class="lv">Lv ${lvl}</span>${i === bott && G.builtCount() > 1 ? ' <span class="lv" style="color:#fb923c">⏳ bottleneck</span>' : ''}</div>
        <div class="ds"><b>${t < 0.1 ? t.toFixed(2) : t.toFixed(1)}s</b> per car${nm ? ` · lv ${nm}: <b>×2 speed</b>` : ''}</div>
        ${nm ? `<div class="mbar"><i style="width:${mp.toFixed(0)}%"></i></div>` : ''}</div>
        ${btn('st:' + i, '+' + n, fm(cost), s.money >= cost, '', true)}</div>`;
    }
    return h;
  };

  U.tab_upgrades = function () {
    const s = G.s;
    let h = '<h3>Automation & company</h3>';
    for (const u of CFT.UPGRADES) {
      const lvl = s.upg[u.id], max = G.upgMaxed(u.id), cost = G.upgCost(u.id);
      const now = G.upgEffect(u.id, lvl), next = max ? '' : G.upgEffect(u.id, lvl + 1);
      h += `<div class="item"><div class="ic">${u.icon}</div><div><div class="nm">${u.name} <span class="lv">${lvl ? 'Lv ' + lvl : ''}</span></div>
        <div class="ds">${esc(now)}${next ? ` → <b>${esc(next)}</b>` : ''}</div></div>
        ${max ? '<span class="done-tag">MAX</span>' : btn('upg:' + u.id, fm(cost), lvl ? 'upgrade' : 'buy', s.money >= cost, lvl ? '' : 'gold', true)}</div>`;
    }
    h += '<h3>Technology</h3>';
    for (const t of CFT.TECH) {
      const have = s.tech[t.id], ok = G.reqMet(t.req);
      h += `<div class="item ${!have && !ok ? 'locked' : ''}"><div class="ic">${t.icon}</div><div><div class="nm">${t.name}</div>
        <div class="ds">${t.desc}${!have && !ok ? `<br><b>${esc(G.reqText(t.req))}</b>` : ''}</div></div>
        ${have ? '<span class="done-tag">✓</span>' : btn('tech:' + t.id, fm(t.cost), 'research', ok && s.money >= t.cost, 'blue')}</div>`;
    }
    h += `<div class="note">Offline earnings: ${Math.round(G.offlineEff() * 100)}% for up to ${G.offlineCap() / 3600} hours (requires Auto Production and a Sales Team).</div>`;
    return h;
  };

  U.tab_models = function () {
    const s = G.s, st = G.lastBuilt();
    let h = `<div class="note">Prices are based on your current production line (${G.builtCount()}/7 stations) and upgrades.</div>`;
    for (let i = 0; i < MODELS.length; i++) {
      const m = MODELS[i], have = s.models[i], cur = s.model === i;
      const nextR = !have && s.models[i - 1];
      const ok = nextR && G.reqMet(m.req);
      const price = G.carPrice(st, false, i), cost = G.carCost(st, i);
      const margin = Math.round(((price - cost) / price) * 100);
      let b;
      if (cur) b = `<button class="buy ghost" disabled>✓ In production</button>`;
      else if (have) b = btn('select:' + i, 'Produce this model', '', true, 'blue');
      else if (ok) b = btn('research:' + i, 'Develop ' + fm(m.research), '', s.money >= m.research, 'gold');
      else if (nextR) b = `<button class="buy" disabled>${esc(G.reqText(m.req))}<small>${fm(m.research)}</small></button>`;
      else b = `<button class="buy" disabled>🔒 Develop the ${MODELS[i - 1].name} first</button>`;
      h += `<div class="model-card ${cur ? 'sel' : ''} ${!have && !nextR ? 'locked' : ''}">
        <canvas data-model="${i}"></canvas>
        <div><div class="cat">${m.cat}</div><div class="nm">${have || nextR ? m.name : '???'}</div>
        <div class="stats"><span>Sale price</span><b>${fm(price)}</b><span>Production cost</span><b>${fm(cost)}</b>
        <span>Profit margin</span><b>${margin}%</b><span>Build time</span><b>×${m.tm}</b></div>
        ${b}</div></div>`;
    }
    return h;
  };

  U.tab_missions = function () {
    const s = G.s;
    const m = G.missionDef(), [a, b] = G.missionProgress(m), done = a >= b;
    let h = `<h3>Current mission (#${s.mission + 1})</h3>
      <div class="item"><div class="ic">🎯</div><div><div class="nm">${esc(G.missionText(m))}</div>
      <div class="ds">Reward: <b>${fm(G.missionReward(m))}</b> · ${f(Math.min(a, b))} / ${f(b)}</div>
      <div class="mbar"><i style="width:${Math.min(100, (a / b) * 100).toFixed(0)}%"></i></div></div>
      ${btn('mission', done ? 'Claim' : 'In progress…', '', done, done ? 'gold' : '')}</div>`;
    G.ensureDaily();
    const d = s.daily;
    const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
    h += `<h3>Daily challenges <span style="text-transform:none;color:#94a3b8;font-weight:600">· new in ${CFT.fmtTime((mid - now) / 1000)}</span></h3>`;
    d.tasks.forEach((t, i) => {
      const tpl = CFT.DAILY_TEMPLATES.find(x => x.t === t.t);
      const ready = t.p >= t.n && !t.claimed;
      h += `<div class="item ${t.claimed ? 'locked' : ''}"><div class="ic">📅</div><div><div class="nm">${esc(tpl.label(t.n))}</div>
        <div class="ds">${t.t === 'earn' ? fm(t.p) + ' / ' + fm(t.n) : f(t.p) + ' / ' + f(t.n)} · reward <b>${fm(G.dailyReward())} + 2 min Turbo</b></div>
        <div class="mbar"><i style="width:${Math.min(100, (t.p / t.n) * 100).toFixed(0)}%"></i></div></div>
        ${t.claimed ? '<span class="done-tag">✓</span>' : btn('daily:' + i, ready ? 'Claim' : 'In progress…', '', ready, ready ? 'gold' : '')}</div>`;
    });
    h += `<div class="note">Missions and challenges give cash and Turbo boosts. There’s always a next mission!</div>`;
    return h;
  };

  U.tab_achievements = function () {
    const s = G.s, n = G.achCount();
    let h = `<div class="note">Every achievement gives <b>+3% permanent income</b>. Current bonus: <b style="color:#4ade80">+${n * 3}%</b> (${n}/${CFT.ACHIEVEMENTS.length})</div><div class="ach-grid">`;
    for (const a of CFT.ACHIEVEMENTS) h += `<div class="ach ${s.ach[a.id] ? '' : 'off'}"><div class="ai">${a.icon}</div><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div>`;
    h += `</div><h3>Statistics</h3><div class="statlist">
      <span>Total earned</span><b>${fm(s.totalEarned)}</b>
      <span>Cars produced</span><b>${f(s.produced)}</b>
      <span>Cars sold</span><b>${f(s.sold)}</b>
      <span>Golden cars</span><b>${f(s.golden)}</b>
      <span>Income per minute</span><b>${fm(G.measuredIps() * 60)}</b>
      <span>Production lines</span><b>${s.lines}</b>
      <span>Play time</span><b>${CFT.fmtTime(s.stats.play)}</b></div>`;
    return h;
  };

  // ================= Acties =================
  U.act = function (act, repeat) {
    const [k, v] = act.split(':');
    let ok = false;
    switch (k) {
      case 'build': ok = G.buildStation(+v); break;
      case 'st': ok = G.upgradeStation(+v, U.buyMode); break;
      case 'upg': ok = G.buyUpgrade(v); break;
      case 'tech': ok = G.buyTech(v); break;
      case 'line': ok = G.buyLine(); break;
      case 'skip': U.skipWithAd(v); return true;
      case 'research': ok = G.researchModel(+v); break;
      case 'select': ok = G.selectModel(+v); if (ok) { A.click(); U.toast(`🚘 The ${MODELS[+v].name} is now in production`, 'good'); } break;
      case 'mission': ok = U.claimMissionDialog(); break;
      case 'prestige': U.prestigeDialog(); return true;
      case 'daily': ok = G.claimDaily(+v) > 0; if (ok) { U.bumpMoney(); A.coin(true); U.toast(`📅 Challenge complete! +2 min Turbo`, 'gold'); } break;
    }
    if (!ok && !repeat && k !== 'mission') A.error();
    U.refreshPanel(true);
    return ok;
  };

  // ================= HUD =================
  U.bumpMoney = function () {
    const el = $('money'); el.classList.add('pop');
    clearTimeout(U._pop); U._pop = setTimeout(() => el.classList.remove('pop'), 120);
  };
  const setText = (id, t) => { const el = $(id); if (el.textContent !== t) el.textContent = t; };

  U.nextUnlock = function () {
    const s = G.s;
    const bs = G.buildInfo('st'), bl = G.buildInfo('line');
    const b = bs || bl;
    if (b) return { icon: '🏗️', text: `${bs ? ST[bs.i].name : 'Production line ' + (s.lines + 1)} ready in ${CFT.fmtTime(Math.ceil(b.left))}`, progress: b.progress, tab: 'stations', building: true };
    const nb = s.stations.findIndex(l => l === 0);
    if (nb >= 0) return { icon: ST[nb].icon, text: `Build the ${ST[nb].name}`, cost: ST[nb].build, tab: 'stations' };
    const mi = s.models.findIndex(x => !x);
    const cands = [];
    if (mi > 0 && G.reqMet(MODELS[mi].req)) cands.push({ icon: '🚘', text: `New model: ${MODELS[mi].name} (${MODELS[mi].cat})`, cost: MODELS[mi].research, tab: 'models' });
    if (G.canBuyLine()) cands.push({ icon: '🏗️', text: `Production line ${s.lines + 1}`, cost: G.lineCost(), tab: 'stations' });
    const tech = CFT.TECH.filter(t => !s.tech[t.id] && G.reqMet(t.req)).sort((a, b) => a.cost - b.cost)[0];
    if (tech) cands.push({ icon: tech.icon, text: tech.name, cost: tech.cost, tab: 'upgrades' });
    cands.sort((a, b) => a.cost - b.cost);
    // nieuw merk voorstellen als het je bonus minstens verdubbelt en het volgende doel nog ver weg is
    const gain = G.prestigeGain();
    if (G.canPrestige() && gain >= Math.max(1, s.prestige.stars) && (!cands[0] || cands[0].cost > s.money * 20)) {
      return { icon: '⭐', text: `Start a new brand: +${f(gain)} ⭐ (+${f(gain * 10)}% income)`, progress: 1, tab: 'stations', ready: true };
    }
    return cands[0] || null;
  };

  U.update = function (dt) {
    const s = G.s;
    const mt = fm(s.money);
    if (mt !== lastMoneyText) { lastMoneyText = mt; $('money').textContent = mt; }
    setText('ipm', `${fm(G.measuredIps() * 60)} / min`);
    setText('carsCount', f(s.produced));
    setText('modelName', G.model().name);
    setText('modelStars', '★'.repeat(G.quality()));
    $('starChip').hidden = !s.prestige.stars;
    if (s.prestige.stars) setText('starCount', f(s.prestige.stars));
    // eenmalige melding wanneer de eerste herstart iets oplevert
    if (!U._prestigeToast && G.canPrestige() && s.prestige.count === 0) { U._prestigeToast = true; U.toast('⭐ You can now start a <b>new brand</b> for a permanent income bonus! (Factory tab)', 'gold'); }

    // boost
    const bb = $('boostBtn');
    if (G.boosted()) {
      const left = (s.boostUntil - G.now()) / 1000;
      bb.classList.add('active');
      setText('boostLabel', `2× ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    } else { bb.classList.remove('active'); setText('boostLabel', '2× Turbo'); }

    // missie
    const m = G.missionDef(), [a, b] = G.missionProgress(m), done = a >= b;
    setText('missionNum', String(s.mission + 1));
    setText('missionText', G.missionText(m));
    setText('missionReward', '+' + fm(G.missionReward(m)));
    $('missionBar').style.width = Math.min(100, (a / b) * 100) + '%';
    $('missionClaim').hidden = !done;
    $('missionCard').classList.toggle('ready', done);

    // volgende ontgrendeling
    const nu = U.nextUnlock();
    if (nu) {
      $('nextCard').style.display = '';
      setText('nextIcon', nu.icon);
      setText('nextText', nu.building || nu.ready ? nu.text : `${nu.text} · ${fm(nu.cost)}`);
      $('nextBar').style.width = Math.min(100, (nu.building || nu.ready ? nu.progress : s.money / nu.cost) * 100) + '%';
      U.nextTab = nu.tab;
    } else $('nextCard').style.display = 'none';

    // produceerknop
    const pb = $('produceBtn');
    const auto = s.upg.autoProd > 0;
    pb.classList.toggle('auto', auto);
    pb.classList.toggle('blocked', !G.canManualProduce());
    pb.classList.toggle('pulse', s.produced === 0);
    setText('produceLabel', auto ? 'AUTOMATIC' : 'PRODUCE');
    let ring = 0;
    if (auto) { const iv = G.spawnInterval(); ring = Math.min(1, G.rt.lines[0].spawnT / iv); }
    else {
      const cars = G.rt.lines[0].cars, last = cars[cars.length - 1];
      ring = last ? Math.min(1, last.x / G.GAP) : 1;
    }
    $('produceRing').style.strokeDashoffset = String(283 * (1 - ring));

    // verkoop alles
    const lotN = G.lotCount();
    const sab = $('sellAllBtn');
    sab.hidden = lotN < 2 || s.upg.autoSell > 0;
    if (!sab.hidden) {
      let tot = 0;
      for (let li = 0; li < s.lines; li++) for (const e of G.rt.lines[li].lot) if (!e.leaving) tot += G.carProfit(e.car.stage, e.car.golden, e.car.model);
      setText('sellAllAmt', fm(tot));
    }

    // VIP
    const v = G.rt.vip;
    $('vipBtn').hidden = !v;
    if (v) {
      setText('vipAmt', fm(v.reward));
      $('vipTimer').style.width = isFinite(v.until) ? Math.max(0, ((v.until - G.rt.t) / 14) * 100) + '%' : '100%';
    }

    // badges
    panelTimer += dt;
    if (panelTimer > 0.3) {
      panelTimer = 0;
      const badges = {
        stations: (() => { const nb = s.stations.findIndex(l => l === 0); return (nb >= 0 && G.canBuild(nb) && s.money >= ST[nb].build) || (G.canBuyLine() && s.money >= G.lineCost()) || (G.canPrestige() && G.prestigeGain() >= Math.max(1, s.prestige.stars)); })(),
        upgrades: CFT.TECH.some(t => !s.tech[t.id] && G.reqMet(t.req) && s.money >= t.cost) || (['autoProd', 'autoSell'].some(id => s.upg[id] === 0 && s.money >= G.upgCost(id))),
        models: (() => { const mi = s.models.findIndex(x => !x); return mi > 0 && G.reqMet(MODELS[mi].req) && s.money >= MODELS[mi].research; })(),
        missions: done || (s.daily && s.daily.tasks.some(t => !t.claimed && t.p >= t.n)),
        achievements: U.unseenAch > 0,
      };
      document.querySelectorAll('#tabs button').forEach(bt => { bt.querySelector('.badge').hidden = !badges[bt.dataset.tab]; });
      U.refreshPanel(false);
      U.updateHint();
    }
  };

  // ================= Tutorial-hints =================
  U.updateHint = function () {
    const s = G.s, hint = $('hint');
    const app = $('app').getBoundingClientRect();
    const above = (el, gap) => { const r = el.getBoundingClientRect(); return [r.left - app.left + r.width / 2, r.top - app.top - gap]; };
    let target = null, text = '';
    if (!$('modal').hidden) { hint.hidden = true; return; }
    if (s.tut === 0) {
      if (s.produced > 0) s.tut = 1;
      else { target = above($('produceBtn'), 22); text = 'Tap here to build your first car!'; }
    }
    if (s.tut === 1) {
      if (s.sold > 0 || s.upg.autoSell) s.tut = 2;
      else {
        const lot = R.hits.find(h => h.kind === 'lot');
        if (lot) { target = [lot.x + lot.w / 2, lot.y - 34]; text = 'Tap the car to sell it!'; }
      }
    }
    if (s.tut === 2) {
      if (s.stations[0] >= 2 || s.stats.upgrades > 1) s.tut = 3;
      else if (s.money >= G.stationUpCost(0, 1)) {
        if (U.tab === 'stations') { const el = document.querySelector('[data-act="st:0"]'); if (el) { target = above(el, 14); text = 'Upgrade your chassis robot!'; } }
        else { target = above(document.querySelector('#tabs [data-tab="stations"]'), 14); text = 'Open your factory and buy your first upgrade'; }
      }
    }
    if (target) {
      hint.hidden = false;
      hint.textContent = text;
      const x = Math.max(140, Math.min(app.width - 140, target[0]));
      // nooit over de bovenbalk heen
      const minTop = $('hud').offsetHeight + hint.offsetHeight + 6;
      hint.style.left = x + 'px'; hint.style.top = Math.max(minTop, target[1]) + 'px';
    } else hint.hidden = true;
  };

  // ================= Toasts / modalen =================
  U.toast = function (text, cls) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    // tekst in één span: anders maakt de flex-layout van .toast losse kolommen van <b>-stukjes
    t.innerHTML = `<span>${text}</span>`;
    const box = $('toasts');
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), 3100);
  };

  U._modalActs = {};
  U.showModal = function (o) {
    U._modalActs = {};
    let h = '';
    if (o.icon) h += `<div class="big-ic">${o.icon}</div>`;
    if (o.title) h += `<h2>${o.title}</h2>`;
    if (o.preview != null) h += `<canvas id="modalCar"></canvas>`;
    if (o.big) h += `<div class="big-money">${o.big}</div>`;
    if (o.text) h += `<p>${o.text}</p>`;
    if (o.html) h += o.html;
    h += '<div class="modal-btns">';
    (o.buttons || []).forEach((b, i) => {
      U._modalActs['b' + i] = () => { if (b.keepOpen !== true) U.closeModal(); b.fn && b.fn(); };
      h += `<button class="buy ${b.cls || ''}" data-mact="b${i}">${b.label}</button>`;
    });
    h += '</div>';
    if (o.acts) Object.assign(U._modalActs, o.acts);
    $('modalBox').innerHTML = h;
    $('modal').hidden = false;
    if (o.preview != null) R.drawPreview($('modalCar'), o.preview, 6, false);
  };
  U.closeModal = function () { $('modal').hidden = true; $('app').scrollLeft = 0; $('app').scrollTop = 0; if (U._onClose) { const f2 = U._onClose; U._onClose = null; f2(); } };

  U.boostDialog = function () {
    const active = G.boosted();
    U.showModal({
      icon: '⚡', title: 'Turbo production',
      text: `Your whole factory runs <b>2× as fast for 3 minutes</b>: stations, conveyor and auto production.${active ? '<br>Your Turbo is still running. This adds 3 more minutes.' : ''}`,
      buttons: [
        { label: '📺 Watch an ad for 2× Turbo', cls: 'gold', fn: async () => { if (await P.rewarded()) { G.activateBoost(180); A.unlock2(); U.toast('⚡ Turbo active!', 'gold'); P.happytime(); } } },
        { label: 'No thanks', cls: 'ghost' },
      ],
    });
  };

  U.vipDialog = function () {
    const v = G.rt.vip;
    if (!v) return;
    v.until = Infinity; // timer stil zetten zolang de speler kiest
    U._onClose = () => { if (G.rt.vip) G.rt.vip.until = G.rt.t + 8; };
    U.showModal({
      icon: '🤵', title: 'VIP buyer!', big: fm(v.reward),
      text: 'A wealthy customer wants a car right now and will pay a lot extra.',
      buttons: [
        { label: '📺 Negotiate: 3× = ' + fm(v.reward * 3), cls: 'gold', fn: async () => { const ok = await P.rewarded(); U.vipClaim(ok ? 3 : 1); } },
        { label: 'Sell for ' + fm(v.reward), fn: () => U.vipClaim(1) },
      ],
    });
  };
  U.vipClaim = function (mult) {
    U._onClose = null;
    const amt = G.claimVip(mult);
    if (amt) { A.coin(true); U.bumpMoney(); U.toast(`🤵 VIP sale: +${fm(amt)}`, 'gold'); }
  };

  U.claimMissionDialog = function () {
    if (!G.missionDone()) return false;
    const r = G.claimMission(1);
    A.coin(true); U.bumpMoney();
    U.toast(`🎯 Mission complete! +${fm(r)}`, 'gold');
    // af en toe een gratis verrassing
    if (G.s.mission % 4 === 0) {
      G.activateBoost(60);
      U.toast('🎁 Surprise: 1 minute of free Turbo!', 'good');
    }
    return true;
  };

  U.prestigeDialog = function () {
    const s = G.s, gain = G.prestigeGain(), pr = s.prestige;
    const info = `<div class="statlist" style="margin:8px 0 4px">
      <span>Stars now</span><b>⭐ ${f(pr.stars)} (+${Math.round(pr.stars * 10)}%)</b>
      <span>Stars after restart</span><b style="color:#fde047">⭐ ${f(pr.stars + gain)} (+${Math.round((pr.stars + gain) * 10)}%)</b>
      <span>Earned this run</span><b>${fm(pr.runEarned)}</b>
      <span>Next ⭐ at</span><b>${fm(G.prestigeNext())}</b></div>
      <p style="font-size:13px;color:#94a3b8;margin:6px 0 0">You keep: stars, achievements, statistics and daily challenges. You start with <b>Auto Production</b>, a <b>Sales Team</b> and ${fm(G.START_MONEY + 250 * (pr.count + 1))}.<br>Resets: money, stations, upgrades, technology, models and production lines.</p>`;
    if (!G.canPrestige()) {
      U.showModal({ icon: '⭐', title: 'New brand', text: `Every <b>⭐ star</b> gives <b>+10% income forever</b>. ${G.prestigeUnlocked() ? `Earn ${fm(G.prestigeNext())} in this run to earn your first star.` : 'Unlocks with your second production line.'}`, html: G.prestigeUnlocked() ? info : '', buttons: [{ label: 'OK', cls: 'blue' }] });
      return;
    }
    U.showModal({
      icon: '⭐', title: `Start a new brand: +${gain} ⭐`,
      text: `Sell this factory and start over with a famous name. Every star gives <b>+10% income forever</b>, so you grow much faster next time.`,
      html: info,
      buttons: [
        { label: `⭐ Start new brand (+${gain})`, cls: 'gold', fn: () => {
          const got = G.doPrestige();
          if (!got) return;
          R.cam.user = false; U.closePanel(); U.layoutPads();
          A.unlock2(); P.happytime();
          U.toast(`⭐ New brand! +${got} stars · income +${Math.round((G.prestigeMult() - 1) * 100)}%`, 'gold');
        } },
        { label: 'Not yet', cls: 'ghost' },
      ],
    });
  };

  U.offlineDialog = function (off) {
    U.showModal({
      icon: '🌙', title: 'Welcome back!',
      text: `While you were away for ${CFT.fmtTime(off.secs)}, your factory built about <b>${f(off.cars || 0)} cars</b>.`,
      big: fm(off.amount),
      buttons: [
        { label: '📺 Claim 2×: ' + fm(off.amount * 2), cls: 'gold', fn: async () => { const ok = await P.rewarded(); G.earn(off.amount * (ok ? 2 : 1)); A.coin(true); U.bumpMoney(); } },
        { label: 'Claim', fn: () => { G.earn(off.amount); A.coin(true); U.bumpMoney(); } },
      ],
    });
  };

  U.modelDialog = function (i) {
    const m = MODELS[i];
    U.showModal({
      title: `New model: ${m.name}!`, preview: i,
      text: `You developed a new <b>${m.cat.toLowerCase()}</b>. Sale price is now <b>${fm(G.carPrice(G.lastBuilt(), false, i))}</b> per car. Production has switched over right away.`,
      buttons: [{ label: 'Awesome! 🚀', cls: 'gold' }],
    });
  };

  // ================= Bouwen overslaan =================
  U.skipWithAd = async function (kind) {
    if (!G.s.building[kind]) return;
    const ok = await P.rewarded();
    if (ok && G.skipBuild(kind)) { P.happytime(); U.refreshPanel(true); }
  };
  U.skipDialog = function (kind) {
    const info = G.buildInfo(kind);
    if (!info) return;
    const name = kind === 'st' ? ST[info.i].name : `Production line ${G.s.lines + 1}`;
    U.showModal({
      icon: '🏗️', title: `${name} under construction`,
      text: `<b>${CFT.fmtTime(Math.ceil(info.left))}</b> left until it’s finished. Watch a short ad to finish it right now.`,
      buttons: [
        { label: '📺 Finish now', cls: 'gold', fn: () => U.skipWithAd(kind) },
        { label: 'Wait', cls: 'ghost' },
      ],
    });
  };

  // ================= Opslaan =================
  U.saveNow = function () {
    if (G.save()) { A.upgrade(); U.toast('💾 Game saved', 'good'); return true; }
    U.toast('Saving doesn’t work in this browser. Use a save code to keep your progress.', 'warn');
    return false;
  };
  U.saveDialog = function () {
    const ago = G.lastSaved ? Math.max(0, Math.round((G.now() - G.lastSaved) / 1000)) : null;
    U.showModal({
      icon: '💾', title: 'Save',
      html: `<p class="save-info">Your game is saved automatically in this browser every 8 seconds.${ago != null ? `<br>Last saved: <b>${ago < 2 ? 'just now' : CFT.fmtTime(ago) + ' ago'}</b>` : ''}</p>`,
      buttons: [
        { label: '💾 Save now', cls: 'gold', fn: () => U.saveNow() },
        { label: '📤 Create save code', cls: 'blue', keepOpen: true, fn: () => U.exportDialog() },
        { label: '📥 Load save code', cls: 'blue', keepOpen: true, fn: () => U.importDialog() },
        { label: 'Close', cls: 'ghost' },
      ],
    });
  };
  U.exportDialog = function () {
    G.save();
    const code = G.exportCode();
    U.showModal({
      icon: '📤', title: 'Your save code',
      text: 'Keep this code somewhere safe, for example in a note. Use it to move your factory to another browser, another device or a new version of the game.',
      html: `<textarea id="saveCodeOut" class="save-code" readonly>${esc(code)}</textarea><p class="save-err" id="copyMsg"></p>`,
      buttons: [
        { label: '📋 Copy', cls: 'gold', keepOpen: true, fn: () => {
          const ta = $('saveCodeOut'), msg = $('copyMsg');
          const fallback = () => { ta.focus({ preventScroll: true }); ta.select(); msg.style.color = '#cbd5e1'; msg.textContent = 'The code is selected. Copy it with Ctrl+C (or long-press on mobile).'; };
          try {
            navigator.clipboard.writeText(code).then(() => { msg.style.color = '#4ade80'; msg.textContent = '✓ Copied!'; }, fallback);
          } catch (e) { fallback(); }
        } },
        { label: 'Done', cls: 'ghost' },
      ],
    });
    setTimeout(() => { const ta = $('saveCodeOut'); if (ta) { ta.focus({ preventScroll: true }); ta.select(); } }, 50);
  };
  U.importDialog = function () {
    U.showModal({
      icon: '📥', title: 'Load save code',
      text: 'Paste your save code below. Note: this replaces your current factory.',
      html: '<textarea id="saveCodeIn" class="save-code" placeholder="CFT1-…"></textarea><p class="save-err" id="importMsg"></p>',
      buttons: [
        { label: 'Load', cls: 'gold', keepOpen: true, fn: () => {
          const ok = G.importCode($('saveCodeIn').value);
          if (!ok) { A.error(); $('importMsg').textContent = 'This code isn’t valid. Check that you pasted the whole code (it starts with CFT1-).'; return; }
          U.closeModal();
          Object.assign(A.settings, G.s.settings); G.s.settings = A.settings; A.apply(); U.updateSoundBtn();
          R.cam.user = false; U.closePanel(); U.layoutPads();
          A.unlock2();
          U.toast(`📥 Factory loaded: ${fm(G.s.money)}, ${G.s.lines} production line${G.s.lines > 1 ? 's' : ''}`, 'gold');
        } },
        { label: 'Cancel', cls: 'ghost' },
      ],
    });
    setTimeout(() => { const ta = $('saveCodeIn'); if (ta) ta.focus({ preventScroll: true }); }, 50);
  };

  U.settingsDialog = function () {
    const st = A.settings;
    const fs = !!document.fullscreenElement;
    U.showModal({
      icon: '⚙️', title: 'Settings',
      html: `<div class="setting"><span>🔊 Sound effects</span><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-set="sfx"></div>
        <div class="setting"><span>🎵 Music</span><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-set="music"></div>
        <div class="setting"><span>Sound ${st.muted ? 'off' : 'on'}</span><button class="buy blue" data-mact="mute">${st.muted ? 'Turn on' : 'Mute'}</button></div>
        <div class="setting"><span>Fullscreen</span><button class="buy blue" data-mact="fs">${fs ? 'Exit' : 'On'}</button></div>
        <div class="setting"><span>💾 Save & save codes</span><button class="buy blue" data-mact="save">Open</button></div>
        <p style="font-size:12px;color:#64748b;margin-top:12px">Progress is saved automatically ${G.cloud ? 'to your CrazyGames account and this browser' : 'in your browser'}.<br>${P.real ? 'CrazyGames mode' : 'Local test mode'} · v1.0</p>
        <p class="copyright">© 2026 Brakeco Games</p>
        <button class="danger" data-mact="reset">Reset progress</button>`,
      buttons: [{ label: 'Close', cls: 'blue' }],
      acts: {
        save: () => U.saveDialog(),
        mute: () => { st.muted = G.s.settings.muted = !st.muted; A.apply(); U.updateSoundBtn(); U.settingsDialog(); },
        fs: () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} U.closeModal(); },
        reset: () => U.showModal({
          icon: '⚠️', title: 'Reset everything?', text: 'Your factory, money and achievements will be deleted permanently.',
          buttons: [{ label: 'Yes, start over', cls: 'gold', fn: () => { G.reset(); G.save(); location.reload(); } }, { label: 'Cancel', cls: 'ghost' }],
        }),
      },
    });
  };
})();
