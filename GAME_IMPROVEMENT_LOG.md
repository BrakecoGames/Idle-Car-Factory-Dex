# Game Improvement Log — Car Factory Tycoon

Autonome verbeterloop (analyse → plan → implementatie → test → evaluatie).

## Testopzet

- `tools/playtest.js` — Playwright-playtest (Chromium, headless, software-rendering) op desktop 1366×768, iPhone 13 staand (390×664) en iPhone 13 liggend (750×342). Test opstart, tutorial, eerste 30 s (produceren → showroom → verkopen → upgraden), alle tabs, bouwen, automatisering, Turbo via test-advertentie, tweede lijn, opslaan/herladen, 3 min versnelde sessie, JS-fouten, en migratie van een oude save + offline-inkomsten.
- `tools/simulate.js` — headless balanssimulatie (bot).
- Starten: `python3 -m http.server 8123` en dan `node tools/playtest.js`.

**Wat niet echt getest kan worden:** echte FPS op telefoons (de testbrowser rendert in software, dus frametijden zijn niet representatief), echte CrazyGames-advertenties en de SDK-omgeving (alleen de lokale testmodus), audio-weergave, echte touch-gebaren als knijpen/draaien.

## Fase 1 — Analyse (startsituatie)

Technologie: vanilla JS + three.js r160 (lokaal), geen build-stap, LocalStorage-saves (`cft_save_v1`), CrazyGames SDK v3-wrapper met lokale testmodus, 2D-fallback.

Sterk: complete idle-loop (7 stations, 7 modellen, 4 lijnen, 7 upgrades, 9 technologieën), doorlopende missies, dagelijkse uitdagingen, 20 prestaties, offline inkomsten, save-codes, auto-kwaliteit, nette scheiding logica/weergave.

Top 10 verbeterpunten (geprioriteerd op impact × risico × tijd):

| # | Probleem | Impact | Risico |
|---|---|---|---|
| 1 | Eerste auto pas na ~15–20 s in de showroom: eerste verkoop te laat | hoog (eerste indruk) | laag |
| 2 | Mobiel liggend: camerabalk overlapt missiekaart, fabriek ~100 px hoog, hint valt over HUD, verkopen door tikken faalt | hoog (mobiel) | laag |
| 3 | Mobiel staand: fabriek gebruikt ~⅓ van het scherm | middel-hoog | laag |
| 4 | Geen prestige / langetermijnlus; na ±30 min alleen nog grotere getallen | hoog (retentie) | middel |
| 5 | Alle bedrijfsupgrades zijn na 6–15 min gemaxt → weinig keuzes in de middenfase | middel | middel |
| 6 | Geen CrazyGames Data-module (saves alleen lokaal) | middel | middel |
| 7 | Onduidelijk welke aankoop het meest oplevert | middel | laag |
| 8 | Visuele feedback bij mijlpalen/aankopen kan sterker | middel | laag |
| 9 | Performance alleen in software-rendering gemeten | middel | laag |
| 10 | Geen geautomatiseerde regressietests | middel | laag |

---

## Iteratie 1 — Snellere eerste beloning

- **Probleem:** met alleen het chassisstation rijdt de eerste auto ~23 m aan 2 m/s over een lege band; eerste verkoop pas na ~16 s (sim) en op mobiel ~15 s.
- **Verbetering:** na het laatst gebouwde station rijden auto's met ×3,2 snelheid ("sneltransport") langs nog niet gebouwde stations naar de showroom. Heeft alleen invloed op doorlooptijd, niet op productiesnelheid (`lineRate`) of balans.
- **Bestanden:** `js/game.js`
- **Tests:** balanssim, volledige playtest.
- **Resultaat:** eerste verkoop sim 0:16 → 0:08; mobiel eerste auto in showroom 14,7 s → 6,7 s; eerste beloningslus (produceren → verkopen → upgrade) 16,4 s → 8,7 s. Geen regressies.

## Iteratie 2 — Mobiel liggend + tik-bug

- **Probleem:** (a) op kleine schermen ligt de grote hitbox van het "Line 2"/bouwplaats-label over de kleine showroom-auto, waardoor tikken-om-te-verkopen faalde (playtest ✗); (b) camerabalk over de missiekaart; (c) fabriek ~100 px hoog; (d) paneel als onderblad liet de fabriek onzichtbaar; (e) hint over de HUD.
- **Verbetering:** showroom-auto's krijgen voorrang in `hitTest`; liggend: horizontale camerabalk linksonder zonder zoomknoppen, produceerknop rechtsonder, paneel als zijpaneel, missiekaart verborgen zolang een paneel open is, eigen camera-marges; hint wordt onder de HUD geklemd.
- **Bestanden:** `js/render3d.js`, `js/ui.js`, `css/style.css`
- **Tests:** playtest (alle 3 formaten), screenshots open/dicht paneel.
- **Resultaat:** tikken-om-te-verkopen werkt liggend; fabriek ~2× groter in beeld; geen overlap meer.

## Iteratie 3 — Mobiel staand: camera kiest de beste hoek

- **Probleem:** portretcamera werd op een 390×664-scherm nooit geactiveerd; fabriek was een smal strookje in het midden.
- **Verbetering:** `R.fit` berekent nu zowel de brede als de staande camerahoek en kiest de beste (op staande schermen met voorkeur voor staand). Bovenmarge volgt de werkelijke hoogte van de missiekaart (ResizeObserver). Zoomknoppen verborgen op kleine touchschermen (knijpen werkt).
- **Bestanden:** `js/render3d.js`, `js/ui.js`, `css/style.css`
- **Tests:** screenshots telefoon/tablet/desktop, volledige playtest 63/63.
- **Resultaat:** fabriek vult de verticale ruimte op telefoon en tablet; desktop ongewijzigd.

### Scores na iteratie 3

| Onderdeel | Score | Basis |
|---|---|---|
| Eerste indruk | 7/10 | test + inschatting |
| Gameplay | 7/10 | inschatting |
| Visuele kwaliteit | 7/10 | screenshots |
| Gebruiksvriendelijkheid | 7/10 | test |
| Progressie | 7/10 | sim |
| Retentiepotentieel | 5/10 | inschatting (geen prestige) |
| Performance | 7/10 | gemeten draw calls (45–47), FPS niet representatief |
| Stabiliteit | 9/10 | test (63/63, geen JS-fouten) |
| Mobiele ervaring | 7/10 | test + screenshots |
| CrazyGames-geschiktheid | 7/10 | inschatting |

Volgende focus: retentie (prestige-systeem).

## Iteratie 4 — Prestige: "Start a new brand"

- **Probleem:** geen langetermijnlus; na lijn 3–4 alleen nog wachten op steeds grotere getallen. README noemde prestige al als volgende stap.
- **Verbetering:** nieuw merk starten (vanaf productielijn 2). Sterren = ⌊√(verdiend deze run / $1B)⌋, elke ster +10% inkomsten voor altijd. Behouden: sterren, prestaties, statistieken, levenslange totalen, dagelijkse uitdagingen, instellingen, lopende Turbo. Nieuw merk start met Auto Production + Sales Team (geen handmatige fase meer) en +$250 startgeld per herstart. UI: kaart "New brand" in het Fabriek-paneel met voortgang naar de volgende ster, ⭐-chip in de HUD, bevestigingsdialoog met wat blijft/wat reset, badge en eenmalige melding. Twee nieuwe prestaties (Fresh Start, Household Name).
- **Save-compatibiliteit:** nieuw veld `prestige`; oude saves krijgen `runEarned = totalEarned` zodat bestaande spelers direct van hun voortgang profiteren. Opslagsleutel en formaat ongewijzigd.
- **Bestanden:** `js/game.js`, `js/ui.js`, `js/data.js`, `index.html`, `css/style.css`, `tools/simulate.js` (`PRESTIGE_AT=<min>`), `tools/playtest.js`
- **Tests:** unit-check in Node (winst, reset, migratie), sim met herstart op 12 min, playtest 69/69 (incl. prestige via UI op 3 formaten).
- **Resultaat:** bot op 12 min → +14 ⭐ (+140%); tweede run bereikt lijn 2 ~25% sneller en lijn 3 op +9:17 i.p.v. 10:46. Duidelijk doel voor de 10–30-minutenfase en reden om opnieuw te spelen.
- **Rest:** sterren hebben nog geen eigen uitgeefbare upgrades (mogelijke uitbreiding).

## Iteratie 5 — Toast-opmaak

- **Probleem:** meldingen met vetgedrukte woorden werden door `display:flex` in losse kolommen gezet (bijv. "Building **Engine Assembly** · ready in 4s"). Raakte tientallen meldingen.
- **Verbetering:** inhoud in één `<span>` gewikkeld.
- **Bestanden:** `js/ui.js`
- **Tests:** screenshot van meerdere toasts, playtest.
- **Resultaat:** meldingen lezen als normale zinnen.

### Scores na iteratie 5

| Onderdeel | Score | Basis |
|---|---|---|
| Eerste indruk | 7/10 | test + inschatting |
| Gameplay | 7/10 | inschatting |
| Visuele kwaliteit | 7.5/10 | screenshots |
| Gebruiksvriendelijkheid | 7.5/10 | test |
| Progressie | 8/10 | sim |
| Retentiepotentieel | 7/10 | inschatting (prestige toegevoegd) |
| Performance | 7/10 | draw calls gemeten; FPS niet representatief |
| Stabiliteit | 9/10 | test 69/69 |
| Mobiele ervaring | 7.5/10 | test + screenshots |
| CrazyGames-geschiktheid | 7.5/10 | inschatting |

## Iteratie 6 — Cloudopslag via CrazyGames Data-module

- **Probleem:** saves alleen in LocalStorage; spelers die op CrazyGames inloggen verliezen voortgang op een ander apparaat of na het wissen van browserdata.
- **Verbetering:** als de echte SDK een `data`-module heeft, wordt elke save óók daarheen geschreven. Bij laden wordt de nieuwste geldige save (op `savedAt`) uit LocalStorage en cloud gekozen; corrupte of falende cloud-opslag valt terug op lokaal. LocalStorage blijft altijd beschreven. Instellingen tonen waar opgeslagen wordt.
- **Bestanden:** `js/game.js`, `js/sdk.js`, `js/main.js`, `js/ui.js`
- **Tests:** Node-unit-test met nep-opslag (alleen lokaal, beide, nieuwere cloud-save, corrupte cloud, gooiende cloud), `?cg=1`-opstart (SDK-host onbereikbaar → nette fallback, geen fouten), playtest 69/69.
- **Niet getest:** de echte CrazyGames Data-module (SDK-host is vanuit deze testomgeving niet bereikbaar). Controleer dit in de CrazyGames-QA-tool vóór publicatie.

## Iteratie 7 — Koopmodus NEXT

- **Probleem:** de belangrijkste keuze in de middenfase (×2-mijlpalen op lv 10/25/50/100…) vroeg om herhaald tikken of rekenen met ×10/MAX.
- **Verbetering:** nieuwe koopmodus **NEXT** naast ×1/×10/MAX: koopt precies tot de volgende mijlpaal (na de laatste mijlpaal: +1).
- **Bestanden:** `index.html`, `js/ui.js`, `js/game.js`
- **Tests:** Node-unit-check (lv 7 → 10 → volgende 15; na lv 400 → 1), screenshots paneelkop staand en liggend (past), playtest.

## Iteratie 8 — Late-game plateau: nieuw merk voorstellen

- **Probleem:** 90-minutensim toont dat een run na ~50 min (bot; echte spelers later) volledig stagneert: stations-upgrades zijn onbetaalbaar en de doorvoer zit aan het plafond, dus inkomen blijft vlak tot de Hypercar ($200T). Spelers zien niet dat een nieuw merk dan veel oplevert (±316 ⭐ = +3160%).
- **Verbetering:** de "volgende doel"-kaart stelt *Start a new brand: +N ⭐* voor zodra de herstart de bonus minstens verdubbelt én het volgende doel meer dan 20× het huidige geld kost.
- **Bestanden:** `js/ui.js`
- **Tests:** headless check van `nextUnlock()` in late game (voorstel verschijnt) en vroege run (normaal doel), playtest.

## Iteratie 9 — Performance-meting en lekcontrole

- **Probleem:** performance alleen globaal bekend; geen herhaalbare meting.
- **Verbetering:** `tools/perftest.js` meet JS-tijd per frame in een volle fabriek (4 lijnen, 72 auto's) en controleert op lekken over 20 000 frames met modelwissels; `CFT.Render.stats()` toont nu ook geometrieën, texturen, scène-objecten en auto-meshes.
- **Resultaat (gemeten):** logica 0,02 ms, rendering (CPU-kant) ~2,0–2,5 ms, UI 0,13 ms per frame; 146–150 draw calls, ~105K driehoeken; heap 16–21 MB. Lekcontrole: objecten (155), texturen (9) en auto-meshes stabiel; geometrieën groeien alleen tot de begrensde cache van automodellen (≤ 7×8×2). **Geen optimalisatie nodig** — ruim binnen 16,7 ms. GPU-tijd en echte FPS zijn in de software-renderer niet meetbaar; test op een echte telefoon.
- **Bestanden:** `tools/perftest.js`, `js/render3d.js` (alleen `stats()`)

## Iteratie 10 — Dagelijkse login-bonus met reeks

- **Probleem:** weinig directe reden om morgen terug te komen (alleen dagelijkse uitdagingen die je actief moet spelen).
- **Verbetering:** bij de eerste opstart van een nieuwe dag een bonusvenster: dag 1–7 oplopend (geld = inkomsten × 60 s × dag, plus 1–5 min Turbo), optioneel 2× via rewarded ad. Een dag missen zet de reeks terug op dag 1 (geen andere straf). Nieuwe spelers krijgen het venster niet op hun eerste dag; het verschijnt pas ná het offline-venster (modalen worden niet gestapeld). Sluiten met Escape haalt de bonus alsnog op. De reeks blijft behouden bij een nieuw merk.
- **Save-compatibiliteit:** nieuw veld `streak`, met standaardwaarde voor oude saves.
- **Bug voorkomen tijdens ontwikkeling:** modal-knoppen sluiten de modal vóór hun actie, waardoor de "sluiten = ophalen"-terugval de 2×-optie zou opeten; knoppen sluiten nu zelf.
- **Bestanden:** `js/game.js`, `js/ui.js`, `js/main.js`, `css/style.css`, `tools/playtest.js`
- **Tests:** Node-unit-tests (nieuwe speler, reeks +1, dubbel ophalen, cap op 7, gemiste dag, oude save), playtest 71/71 incl. offline-venster → dagbonus → 2× via test-ad.

### Scores na iteratie 10

| Onderdeel | Score | Basis |
|---|---|---|
| Eerste indruk | 7.5/10 | test + inschatting |
| Gameplay | 7.5/10 | inschatting |
| Visuele kwaliteit | 7.5/10 | screenshots |
| Gebruiksvriendelijkheid | 8/10 | test |
| Progressie | 8/10 | sim |
| Retentiepotentieel | 8/10 | inschatting (prestige + dagbonus) |
| Performance | 7.5/10 | gemeten JS-tijd; GPU niet meetbaar |
| Stabiliteit | 9/10 | test 71/71 |
| Mobiele ervaring | 7.5/10 | test + screenshots |
| CrazyGames-geschiktheid | 8/10 | inschatting |

## Iteratie 11 — 2D-fallback-controle en compactere meldingen

- **Probleem:** onbekend of de 2D-fallback (geen WebGL) nog werkte na de wijzigingen; op kleine schermen bedekten toasts en hints een groot deel van de fabriek en overlapte de melding de missiekaart.
- **Verbetering:** 2D-fallback getest (`?2d=1`, desktop/staand/liggend: produceren, verkopen, geen fouten — werkt). Toasts op kleine schermen kleiner, max. 3 tegelijk; liggend rechts uitgelijnd naast de missiekaart; hint compacter.
- **Bestanden:** `css/style.css`, `js/ui.js`
- **Tests:** 2D-smoketest op 3 formaten, screenshots, playtest.

## Iteratie 12 — Missies na een nieuw merk

- **Probleem:** na een herstart begon de missieketen weer met "Produce your first car" (+$15) — onzinnig voor een ervaren speler.
- **Verbetering:** missies over levenslange totalen (produceren, verkopen, verdienen, gouden auto's) die al gehaald zijn, worden bij een herstart overgeslagen; bouw- en upgrademissies blijven als gids met beloning.
- **Bestanden:** `js/game.js`
- **Tests:** Node-check (start na herstart bij "Upgrade your first robot"), playtest.

## Iteratie 13 — Tutorial: tikken om te helpen + slimmere hint-plaatsing

- **Probleem:** de mechaniek "tik op een werkend station = 30% sneller" stond alleen in een paneelkop; nieuwe spelers ontdekken hem niet. Bovendien werden hints onder de HUD geklemd en bedekten ze dan de "Claim reward!"-knop.
- **Verbetering:** vierde tutorialstap na de eerste upgrade wijst naar een werkende machine ("Tap a working machine to help it go faster!") tot de speler 3× getikt heeft of automatische productie koopt (overgeslagen voor terugkerende merken). Hints klappen om naar *onder* het doel (pijl omhoog) als er erboven geen ruimte is door HUD of missiekaart.
- **Bestanden:** `js/ui.js`, `css/style.css`
- **Tests:** browser-scenario (hint verschijnt, geplaatst onder de machine, tikken telt), playtest 71/71.
