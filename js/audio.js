/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — gesynthetiseerde audio (WebAudio, geen externe bestanden) */
(function () {
  const CFT = (globalThis.CFT = globalThis.CFT || {});
  const A = (CFT.Audio = {});
  let ac = null, master, sfxBus, musicBus, humGain, noiseBuf;
  let paused = false;
  A.settings = { sfx: 0.8, music: 0.35, muted: false };
  const last = {};

  A.unlock = function () {
    if (ac) { if (ac.state === 'suspended' && !paused) ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.connect(master);
    // ruisbuffer
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // fabrieksgezoem (zachte, gefilterde ruis)
    const hum = ac.createBufferSource(); hum.buffer = noiseBuf; hum.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    humGain = ac.createGain(); humGain.gain.value = 0;
    hum.connect(lp); lp.connect(humGain); humGain.connect(sfxBus); hum.start();
    A.apply();
    startMusic();
  };
  A.apply = function () {
    if (!ac) return;
    const m = A.settings.muted || paused || A.platformMute ? 0 : 1;
    master.gain.setTargetAtTime(m, ac.currentTime, 0.05);
    sfxBus.gain.setTargetAtTime(A.settings.sfx, ac.currentTime, 0.05);
    musicBus.gain.setTargetAtTime(A.settings.music * 0.5, ac.currentTime, 0.1);
  };
  A.pause = function () { paused = true; A.apply(); };
  A.resume = function () { paused = false; if (ac && ac.state === 'suspended') ac.resume(); A.apply(); };
  A.setHum = function (level) { if (humGain) humGain.gain.setTargetAtTime(Math.min(0.12, level * 0.05), ac.currentTime, 0.4); };

  function throttle(name, ms) {
    const n = performance.now();
    if (last[name] && n - last[name] < ms) return false;
    last[name] = n; return true;
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ac) return;
    const t = ac.currentTime + (when || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, vol, when, type) {
    if (!ac) return;
    const t = ac.currentTime + (when || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  A.click = () => tone(660, 0.06, 'triangle', 0.12);
  A.coin = function (big) {
    if (!throttle('coin', 55)) return;
    const p = 1 + Math.random() * 0.06;
    tone(1318 * p, 0.09, 'square', 0.06);
    tone(1975 * p, 0.22, 'square', 0.05, 0.06);
    if (big) { tone(2637, 0.3, 'triangle', 0.08, 0.14); tone(3136, 0.35, 'triangle', 0.06, 0.22); }
  };
  A.upgrade = function () {
    if (!throttle('upg', 50)) return;
    tone(440, 0.08, 'triangle', 0.15, 0, 880);
    tone(880, 0.12, 'triangle', 0.1, 0.06, 1320);
  };
  A.milestone = function () {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, i * 0.07));
  };
  A.unlock2 = function () {
    // fanfare voor nieuwe machine/model/lijn
    const seq = [523, 659, 784, 1046, 784, 1046, 1318];
    seq.forEach((f, i) => { tone(f, 0.3, 'square', 0.06, i * 0.09); tone(f / 2, 0.3, 'triangle', 0.09, i * 0.09); });
    noise(0.6, 6000, 0.05, 0.5, 'highpass');
  };
  A.carDone = () => { if (throttle('done', 140)) { tone(1046, 0.08, 'sine', 0.06); tone(1568, 0.14, 'sine', 0.05, 0.05); } };
  A.station = function (fx) {
    if (!throttle('st', 90)) return;
    if (fx === 'weld') noise(0.12, 3500, 0.025);
    else if (fx === 'spray') noise(0.2, 8000, 0.018, 0, 'highpass');
    else if (fx === 'press') { tone(90, 0.12, 'sine', 0.12, 0, 50); noise(0.06, 800, 0.03); }
    else if (fx === 'scan') tone(1800, 0.06, 'sine', 0.025);
    else if (fx === 'polish') tone(2400, 0.08, 'sine', 0.02);
    else tone(320, 0.05, 'square', 0.025);
  };
  A.conveyor = () => { if (throttle('conv', 400)) noise(0.05, 1200, 0.012); };
  A.error = () => tone(160, 0.15, 'sawtooth', 0.06);
  A.tap = () => { if (throttle('tap', 40)) tone(880 + Math.random() * 200, 0.05, 'square', 0.04); };

  // ---- Achtergrondmuziek: rustige, vrolijke loop ----
  let musicTimer = null;
  function startMusic() {
    const bpm = 104, beat = 60 / bpm;
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
    const mel = [76, 74, 72, 74, 76, 79, 76, 74, 72, 71, 72, 74, 72, 67, 69, 71];
    let step = 0, next = ac.currentTime + 0.3;
    const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
    function note(n, t, dur, type, vol) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = mtof(n);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
    }
    musicTimer = setInterval(() => {
      if (!ac) return;
      while (next < ac.currentTime + 0.6) {
        const bar = Math.floor(step / 8) % 4, ch = chords[bar];
        if (step % 8 === 0) ch.forEach(n => note(n, next, beat * 4, 'triangle', 0.05));
        if (step % 2 === 0) note(ch[0] - 12, next, beat * 0.9, 'sine', 0.12);
        if (step % 4 === 2) { // zachte hi-hat
          const s = ac.createBufferSource(); s.buffer = noiseBuf;
          const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 9000;
          const g = ac.createGain(); g.gain.setValueAtTime(0.03, next); g.gain.exponentialRampToValueAtTime(0.0001, next + 0.05);
          s.connect(f); f.connect(g); g.connect(musicBus); s.start(next); s.stop(next + 0.06);
        }
        const mn = mel[step % 16];
        if ((step % 16) % 3 !== 2 && Math.floor(step / 16) % 2 === 1) note(mn, next, beat * 0.45, 'square', 0.025);
        next += beat / 2; step++;
      }
    }, 120);
  }
})();
