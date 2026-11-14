/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — speldata (stations, modellen, upgrades, technologie, missies, prestaties) */
(function () {
  const CFT = (globalThis.CFT = globalThis.CFT || {});

  // ---- Productiestations (in vaste volgorde te bouwen) ----
  CFT.STATIONS = [
    { id: 'chassis',  name: 'Chassis Line',       short: 'Chassis',     icon: '🔩', color: '#64748b', accent: '#f59e0b', time: 1.0, stage: 1.0,  build: 0, buildTime: 0,     upBase: 10,    upGrowth: 1.15,  fx: 'weld',   desc: 'Welds the frame and fits the wheels.' },
    { id: 'engine',   name: 'Engine Assembly',    short: 'Engine',       icon: '⚙️', color: '#475569', accent: '#ef4444', time: 1.4, stage: 1.75, build: 60, buildTime: 4,    upBase: 30,    upGrowth: 1.155, fx: 'bolt',   desc: 'Installs the engine and drivetrain.' },
    { id: 'body',     name: 'Body Shop',          short: 'Body', icon: '🚪', color: '#2563eb', accent: '#93c5fd', time: 1.8, stage: 1.75, build: 160, buildTime: 8,   upBase: 120,   upGrowth: 1.16,  fx: 'press',  desc: 'Presses and welds the body panels.' },
    { id: 'paint',    name: 'Paint Shop',         short: 'Paint',   icon: '🎨', color: '#db2777', accent: '#f9a8d4', time: 2.2, stage: 1.6,  build: 600, buildTime: 15,   upBase: 450,   upGrowth: 1.165, fx: 'spray',  desc: 'Sprays the car in its model colour.' },
    { id: 'assembly', name: 'Assembly',           short: 'Assembly',     icon: '🔧', color: '#7c3aed', accent: '#c4b5fd', time: 2.6, stage: 1.6,  build: 2000, buildTime: 25,  upBase: 1500,  upGrowth: 1.17,  fx: 'bolt',   desc: 'Fits windows, lights and interior.' },
    { id: 'qc',       name: 'Quality Control',    short: 'QC',    icon: '🔍', color: '#059669', accent: '#6ee7b7', time: 2.0, stage: 1.35, build: 6500, buildTime: 35,  upBase: 5000,  upGrowth: 1.175,  fx: 'scan',   desc: 'Tests everything. Higher quality = higher price.' },
    { id: 'final',    name: 'Final Assembly',     short: 'Finish',   icon: '✨', color: '#d97706', accent: '#fde68a', time: 3.0, stage: 1.9,  build: 18000, buildTime: 45, upBase: 14000, upGrowth: 1.18, fx: 'polish', desc: 'Polish, chrome and the final touches.' },
  ];
  // Snelheidsmijlpalen per station: elk ×2
  CFT.MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400];

  // ---- Automodellen ----
  CFT.MODELS = [
    { id: 'compact', name: 'Mini Mo',     cat: 'Compact',     price: 12,     cost: 4,     tm: 1.0,  research: 0,      color: '#22c55e', L: 1.15, W: 0.72, H: 0.36, cab: 0.34, cabL: 0.62, cabX: 0.05, req: null },
    { id: 'sedan',   name: 'Cruiser',     cat: 'Sedan',       price: 40,     cost: 12,    tm: 1.1,  research: 6000,   color: '#3b82f6', L: 1.45, W: 0.76, H: 0.34, cab: 0.3,  cabL: 0.7,  cabX: 0.0,  req: { stations: 5 } },
    { id: 'suv',     name: 'Trailblazer', cat: 'SUV',         price: 130,    cost: 40,    tm: 1.2,  research: 2.5e6,  color: '#f97316', L: 1.5,  W: 0.82, H: 0.48, cab: 0.4,  cabL: 0.95, cabX: -0.12, req: { stations: 7 } },
    { id: 'sport',   name: 'Viper GT',    cat: 'Sports car',  price: 450,    cost: 140,   tm: 1.3,  research: 6e7,  color: '#ef4444', L: 1.55, W: 0.8,  H: 0.26, cab: 0.2,  cabL: 0.55, cabX: -0.12, req: { lines: 2 }, spoiler: true },
    { id: 'luxury',  name: 'Regent',      cat: 'Luxury',        price: 1600,   cost: 500,   tm: 1.4,  research: 2e10,  color: '#1e293b', L: 1.7,  W: 0.82, H: 0.34, cab: 0.3,  cabL: 0.8,  cabX: -0.05, req: { lines: 3 }, chrome: true },
    { id: 'ev',      name: 'Volt-E',      cat: 'Electric',  price: 6000,   cost: 1800,  tm: 1.45, research: 1e12,    color: '#e2e8f0', L: 1.55, W: 0.8,  H: 0.32, cab: 0.3,  cabL: 0.85, cabX: 0.02, req: { tech: 'battery' }, glow: '#22d3ee' },
    { id: 'hyper',   name: 'Apex X',      cat: 'Hypercar',    price: 25000,  cost: 7500,  tm: 1.6,  research: 2e14,  color: '#a855f7', L: 1.7,  W: 0.86, H: 0.22, cab: 0.18, cabL: 0.5,  cabX: -0.15, req: { lines: 4 }, spoiler: true, glow: '#f0abfc' },
  ];

  // ---- Bedrijfsbrede upgrades (met levels) ----
  CFT.UPGRADES = [
    { id: 'autoProd',   name: 'Auto Production', icon: '🤖', base: 70,   growth: 1.7,  max: 15, group: 'auto' },
    { id: 'belt',       name: 'Faster Conveyor', icon: '⏩', base: 50,   growth: 1.85, max: 12, group: 'line' },
    { id: 'autoSell',   name: 'Sales Team',            icon: '🤝', base: 220,  growth: 1.75, max: 10, group: 'auto' },
    { id: 'marketing',  name: 'Marketing',              icon: '📣', base: 140,  growth: 2.05, max: 25, group: 'money' },
    { id: 'staff',      name: 'Hire Staff',     icon: '👷', base: 350,  growth: 1.9,  max: 40, group: 'line' },
    { id: 'efficiency', name: 'Lean Production',         icon: '💡', base: 260,  growth: 2.1,  max: 20, group: 'money' },
    { id: 'showroom',   name: 'Bigger Showroom',       icon: '🏬', base: 120,  growth: 2.6,  max: 6,  group: 'line' },
  ];

  // ---- Eenmalige technologieën ----
  CFT.TECH = [
    { id: 'robots2',   name: 'Robot Arms 2.0',        icon: '🦾', cost: 150000,  req: { stations: 7 }, desc: 'All stations ×1.5 faster' },
    { id: 'offline',   name: 'Night Shift',            icon: '🌙', cost: 400000, req: { stations: 7 }, desc: 'Offline earnings 100% (was 50%), up to 8 hours' },
    { id: 'turbo',     name: 'Maglev Conveyor',           icon: '🧲', cost: 1e8,  req: { lines: 2 },    desc: 'Conveyor ×1.5 faster' },
    { id: 'golden',    name: 'Gold Rush',            icon: '🏆', cost: 3e8,    req: { lines: 2 },    desc: 'Golden cars appear 2× as often' },
    { id: 'aiqc',      name: 'AI Quality Control', icon: '🧠', cost: 5e9,    req: { lines: 3 },    desc: 'Quality bonus ×1.4 on the sale price' },
    { id: 'logistics', name: 'Smart Logistics',      icon: '🚚', cost: 2e10,    req: { lines: 3 },    desc: 'Sales team ×3 faster, showroom +2 spots' },
    { id: 'battery',   name: 'Battery Tech',   icon: '🔋', cost: 2e11,   req: { lines: 3 },    desc: 'Unlocks electric cars' },
    { id: 'giga',      name: 'Gigafactory',           icon: '🏭', cost: 5e12,   req: { lines: 4 },    desc: 'All income ×2' },
    { id: 'cobots',    name: 'Cobots',                icon: '🤖', cost: 6e13,   req: { lines: 4 },    desc: 'All stations ×2 faster' },
  ];

  // ---- Fabrieksuitbreidingen (extra productielijnen) ----
  CFT.LINE_COST = [0, 600000, 2e9, 3e12];
  // bouwtijd (seconden) van productielijn 2, 3 en 4
  CFT.LINE_TIME = [0, 120, 300, 600];
  CFT.LINE_REQ = [null, { stations: 7 }, { model: 2 }, { model: 4 }];
  CFT.MAX_LINES = 4;

  // ---- Missies (op volgorde; daarna oneindige gegenereerde missies) ----
  CFT.MISSIONS = [
    { t: 'produce', n: 1,  r: 15 },
    { t: 'sell',    n: 3,  r: 25 },
    { t: 'slvl', i: 0, n: 2, r: 30, text: 'Upgrade your first robot (Chassis Line lv 2)' },
    { t: 'build', i: 1, r: 40 },
    { t: 'produce', n: 12, r: 60 },
    { t: 'upg', id: 'autoProd', n: 1, r: 80 },
    { t: 'build', i: 2, r: 120 },
    { t: 'earn', n: 1500, r: 200 },
    { t: 'upg', id: 'autoSell', n: 1, r: 250 },
    { t: 'build', i: 3, r: 400 },
    { t: 'rush', n: 10, s: 120, r: 500 },
    { t: 'upg', id: 'marketing', n: 3, r: 700 },
    { t: 'build', i: 4, r: 1200 },
    { t: 'produce', n: 100, r: 1800 },
    { t: 'build', i: 5, r: 3000 },
    { t: 'build', i: 6, r: 8000, text: 'Complete your first full production line' },
    { t: 'model', i: 1, r: 6000 },
    { t: 'tech', id: 'robots2', r: 8000 },
    { t: 'slvl', i: 3, n: 25, r: 15000 },
    { t: 'lines', n: 2, r: 30000, text: 'Expand your factory with a second production line' },
    { t: 'model', i: 2, r: 60000, text: 'Unlock an SUV' },
    { t: 'golden', n: 3, r: 80000 },
    { t: 'earn', n: 1e6, r: 120000 },
    { t: 'produce', n: 1000, r: 200000 },
    { t: 'tech', id: 'turbo', r: 300000 },
    { t: 'model', i: 3, r: 500000 },
    { t: 'lines', n: 3, r: 1e6 },
    { t: 'model', i: 4, r: 5e6 },
    { t: 'tech', id: 'battery', r: 2e7 },
    { t: 'model', i: 5, r: 8e7 },
    { t: 'lines', n: 4, r: 1.5e8 },
    { t: 'model', i: 6, r: 1e9 },
  ];

  // ---- Prestaties (elk +3% permanente inkomsten) ----
  CFT.ACHIEVEMENTS = [
    { id: 'car1',    icon: '🚗', name: 'First Drive',       desc: 'Produce your first car',   check: s => s.produced >= 1 },
    { id: 'car100',  icon: '🚙', name: 'Small Batch',       desc: 'Produce 100 cars',     check: s => s.produced >= 100 },
    { id: 'car1k',   icon: '🏎️', name: 'Mass Production',   desc: 'Produce 1,000 cars',   check: s => s.produced >= 1000 },
    { id: 'car10k',  icon: '🚛', name: 'Car Giant',         desc: 'Produce 10,000 cars',  check: s => s.produced >= 10000 },
    { id: 'car100k', icon: '🌍', name: 'Global Brand',      desc: 'Produce 100,000 cars', check: s => s.produced >= 100000 },
    { id: 'm10k',    icon: '💶', name: 'First Profit',      desc: 'Earn $10,000 in total',   check: s => s.totalEarned >= 1e4 },
    { id: 'm1m',     icon: '💰', name: 'Millionaire',       desc: 'Earn $1 million in total', check: s => s.totalEarned >= 1e6 },
    { id: 'm1b',     icon: '🏦', name: 'Billionaire',       desc: 'Earn $1 billion in total', check: s => s.totalEarned >= 1e9 },
    { id: 'm1t',     icon: '👑', name: 'Trillionaire',      desc: 'Earn $1 trillion in total', check: s => s.totalEarned >= 1e12 },
    { id: 'line',    icon: '🏭', name: 'Assembly Line',     desc: 'Build all 7 stations',        check: s => s.stations[6] > 0 },
    { id: 'lines4',  icon: '🏗️', name: 'Megafactory',       desc: 'Build 4 production lines',      check: s => s.lines >= 4 },
    { id: 'gold1',   icon: '⭐', name: 'Gold Strike',       desc: 'Sell a golden car',      check: s => s.golden >= 1 },
    { id: 'gold25',  icon: '🌟', name: 'Gold Mine',         desc: 'Sell 25 golden cars', check: s => s.golden >= 25 },
    { id: 'lv50',    icon: '🔧', name: 'Specialist',        desc: 'A station at level 50',     check: s => Math.max(...s.stations) >= 50 },
    { id: 'lv100',   icon: '🛠️', name: 'Master Mechanic',   desc: 'A station at level 100',    check: s => Math.max(...s.stations) >= 100 },
    { id: 'models3', icon: '🚘', name: 'Model Range',       desc: 'Unlock 3 car models',   check: s => s.models.filter(Boolean).length >= 3 },
    { id: 'modelsA', icon: '🏁', name: 'Full Lineup',       desc: 'Unlock all car models', check: s => s.models.every(Boolean) },
    { id: 'taps',    icon: '👆', name: 'Hands-On Boss',     desc: 'Help a station 100 times', check: s => s.stats.taps >= 100 },
    { id: 'vip',     icon: '🤵', name: 'VIP Service',       desc: 'Serve 10 VIP buyers',          check: s => s.stats.vip >= 10 },
    { id: 'play30',  icon: '⏱️', name: 'Dedicated',         desc: 'Play for 30 minutes',            check: s => s.stats.play >= 1800 },
  ];

  // ---- Dagelijkse uitdagingen (sjablonen) ----
  CFT.DAILY_TEMPLATES = [
    { t: 'produce', label: n => `Produce ${n} cars`, scale: rate => Math.max(40, Math.round(rate * 480 / 10) * 10) },
    { t: 'earn',    label: n => `Earn ${CFT.fmtMoney(n)}`, scale: (rate, ips) => Math.max(2000, ips * 600) },
    { t: 'upgrades', label: n => `Buy ${n} upgrades`, scale: () => 15 },
    { t: 'golden',  label: n => `Sell ${n} golden cars`, scale: () => 2 },
    { t: 'vip',     label: n => `Serve ${n} VIP buyers`, scale: () => 3 },
    { t: 'taps',    label: n => `Help stations ${n} times by hand`, scale: () => 60 },
  ];

  // ---- Getalnotatie ----
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
  CFT.fmt = function (n, dec) {
    if (!isFinite(n)) return '∞';
    const neg = n < 0; n = Math.abs(n);
    let out;
    if (n < 1000) out = n < 10 && dec ? n.toFixed(1) : Math.floor(n).toString();
    else {
      let i = 0;
      while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
      out = (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + SUFFIX[i];
    }
    return (neg ? '-' : '') + out;
  };
  CFT.fmtMoney = n => '$' + CFT.fmt(n);
  CFT.fmtTime = function (s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  };
})();
