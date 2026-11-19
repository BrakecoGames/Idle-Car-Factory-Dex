/*! Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. */
/* Car Factory Tycoon — CrazyGames SDK v3 wrapper met lokale testmodus.
 * - Op crazygames.com (of met ?cg=1) wordt de officiële SDK geladen.
 * - Lokaal (file:// of localhost zonder ?cg=1) draait een nep-SDK die advertenties simuleert,
 *   zodat alles zonder internet en zonder CrazyGames getest kan worden.
 */
(function () {
  const CFT = (globalThis.CFT = globalThis.CFT || {});
  const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
  const P = (CFT.Platform = { real: false, env: 'mock', ready: false, inGameplay: false, adPlaying: false });
  P.onPause = () => {};
  P.onResume = () => {};

  function wantsReal() {
    const q = new URLSearchParams(location.search);
    if (q.get('cg') === '0') return false;
    if (q.get('cg') === '1') return true;
    return /crazygames|1001juegos/.test(location.hostname) || (window.parent !== window && /crazygames/.test(document.referrer));
  }
  function loadScript(src, timeout) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      const t = setTimeout(() => rej(new Error('timeout')), timeout);
      s.onload = () => { clearTimeout(t); res(); };
      s.onerror = () => { clearTimeout(t); rej(new Error('load error')); };
      document.head.appendChild(s);
    });
  }
  const sdk = () => window.CrazyGames && window.CrazyGames.SDK;

  P.init = async function () {
    if (location.protocol !== 'file:' && wantsReal()) {
      try {
        await loadScript(SDK_URL, 6000);
        await sdk().init();
        P.real = true;
        P.env = sdk().environment || 'crazygames';
        // Data-module: saves synchroniseren met het CrazyGames-account (LocalStorage blijft de reserve)
        try { if (sdk().data && typeof sdk().data.getItem === 'function') P.cloudStorage = sdk().data; } catch (e) {}
        // CrazyGames-instelling 'geluid uit' respecteren
        try {
          const apply = () => { const m = sdk().game.settings && sdk().game.settings.muteAudio; if (m != null) CFT.Audio.platformMute = m, CFT.Audio.apply(); };
          apply();
          sdk().game.addSettingsChangeListener && sdk().game.addSettingsChangeListener(apply);
        } catch (e) {}
      } catch (e) {
        console.warn('[CFT] CrazyGames SDK not available, test mode active:', e.message);
      }
    }
    P.ready = true;
    console.info('[CFT] platform:', P.real ? 'CrazyGames (' + P.env + ')' : 'local test mode');
  };

  const call = (fn) => { try { fn(); } catch (e) { /* SDK-fouten mogen het spel nooit breken */ } };
  P.loadingStart = () => P.real && call(() => sdk().game.loadingStart());
  P.loadingStop = () => P.real && call(() => sdk().game.loadingStop());
  P.gameplayStart = () => { if (P.inGameplay) return; P.inGameplay = true; P.real && call(() => sdk().game.gameplayStart()); };
  P.gameplayStop = () => { if (!P.inGameplay) return; P.inGameplay = false; P.real && call(() => sdk().game.gameplayStop()); };
  P.happytime = () => P.real && call(() => sdk().game.happytime());

  // Rewarded ad → Promise<boolean> (true = beloning geven)
  P.rewarded = function () {
    if (P.adPlaying) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return; done = true;
        P.adPlaying = false;
        P.onResume();
        if (P.inGameplay) P.real && call(() => sdk().game.gameplayStart());
        resolve(ok);
      };
      const started = () => {
        P.adPlaying = true;
        if (P.inGameplay) P.real && call(() => sdk().game.gameplayStop());
        P.onPause();
      };
      if (P.real) {
        try {
          sdk().ad.requestAd('rewarded', {
            adStarted: started,
            adFinished: () => finish(true),
            adError: (err) => { console.warn('[CFT] ad not available', err); CFT.UI && CFT.UI.toast('No ad available right now. Please try again later.', 'warn'); finish(false); },
          });
        } catch (e) { finish(false); }
      } else {
        // testmodus: korte nep-advertentie
        started();
        const ov = document.getElementById('adOverlay');
        const cnt = document.getElementById('adCount');
        ov.hidden = false;
        let n = 3; cnt.textContent = n;
        const iv = setInterval(() => {
          n--; cnt.textContent = n;
          if (n <= 0) { clearInterval(iv); ov.hidden = true; finish(true); }
        }, 700);
      }
    });
  };
})();
