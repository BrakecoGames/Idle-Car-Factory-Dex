# Car Factory Tycoon

Een HTML5-managementspel waarin je een kleine autofabriek uitbouwt tot een megafabriek. Gebouwd voor CrazyGames: geen backend, geen account, en volledig offline speelbaar (three.js zit in het pakket).

## Snel starten

**Optie 1 – direct openen:** dubbelklik op `index.html`. Alles werkt via `file://` (opslaan gaat via LocalStorage).

**Optie 2 – lokale server (aanbevolen, zoals op CrazyGames):**

```bash
cd car-factory-tycoon
python3 -m http.server 8000
# open http://localhost:8000
```

Lokaal draait een **testmodus** van de CrazyGames SDK: advertenties worden gesimuleerd met een korte zwarte "Testmodus"-overlay, zodat je alle beloningen kunt testen.

| URL-parameter | Effect |
|---|---|
| `?cg=1` | Laadt de echte CrazyGames SDK v3 (ook buiten crazygames.com; draait dan in hun `local`-omgeving) |
| `?cg=0` | Forceert testmodus |

Handig in de browserconsole: `CFT.debug.money(1e6)` geeft je geld, `CFT.debug.state()` toont de spelstatus.

## Mappenstructuur

```
index.html            Opmaak van HUD, panelen en modalen
css/style.css         Volledige stijl (desktop, tablet, mobiel, liggend/staand)
js/data.js            Speldata: stations, modellen, upgrades, technologie, missies, prestaties
js/game.js            Spel-logica zonder DOM: productie, economie, missies, opslaan, offline inkomsten
js/three.min.js       three.js r160 (3D-bibliotheek, MIT-licentie)
js/render3d.js        3D-weergave: hal, licht, camera, robots, auto's, personeel, effecten
js/render.js          2D-weergave (fallback zonder WebGL)
js/ui.js              Interface: HUD, panelen, invoer (muis/touch/pinch), modalen, tutorial-hints
js/audio.js           Gesynthetiseerde geluidseffecten + achtergrondmuziek (WebAudio, geen bestanden)
js/sdk.js             CrazyGames SDK v3-wrapper met lokale testmodus
js/main.js            Opstarten, game-loop, autosave, koppeling van events aan effecten
assets/               Icoon en cover-afbeeldingen (1920×1080, 800×1200, 800×800)
tools/simulate.js     Headless balanssimulatie (Node.js)
```

## Gameplay in het kort

- **Productielijn:** auto's rijden over de band langs 7 stations (chassis → motor → carrosserie → spuiterij → montage → kwaliteitscontrole → eindassemblage) en veranderen zichtbaar bij elk station. Daarna parkeren ze in de showroom.
- **Stations** bouw je in volgorde. Elk station maakt auto's meer waard; upgraden maakt ze sneller. Mijlpalen (lv 10, 25, 50, 100…) geven ×2 snelheid, extra robotarmen en gouden machines. Het langzaamste station krijgt het label **Knelpunt**.
- **Meehelpen:** tik op een werkend station om de auto 30% sneller klaar te hebben.
- **Verkopen:** tik op auto's in de showroom of gebruik *Verkoop alles*. Het *Verkoopteam* automatiseert dit.
- **Automodellen:** Compact, Sedan, SUV, Sportwagen, Luxe, Elektrisch en Hypercar, elk met eigen vorm, kleur, prijs, kosten en bouwtijd.
- **Uitbreiden:** tot 4 productielijnen naast elkaar in een groeiende fabriekshal.
- **Idle:** *Automatische productie* + *Verkoopteam* laten de fabriek zelf draaien; offline inkomsten bij terugkeer (50% tot 2 uur, met *Nachtploeg* 100% tot 8 uur).
- **Beloningen:** doorlopende missies (altijd één actief doel), 3 dagelijkse uitdagingen, 20 prestaties (+3% inkomsten per stuk), gouden auto's (×10), VIP-kopers en gratis Turbo-verrassingen.
- **Advertenties (optioneel):** 2× Turbo voor 3 minuten, VIP-bod ×3, offline inkomsten ×2, bouw direct klaar. Het spel is volledig speelbaar zonder ooit een advertentie te kijken.

## Balans

`node tools/simulate.js 30` laat een bot 30 minuten spelen en logt wanneer alles vrijkomt. Resultaat van een run (tijden variëren iets door gouden auto's; de bot speelt bijna optimaal; echte spelers zitten iets later):

| Tijd | Gebeurtenis |
|---|---|
| 0:16 | Eerste auto verkocht |
| 0:21 | Tweede station (motor) |
| ~1:25 | Automatische productie |
| ~3:25 | Verkoopteam (automatisch verkopen) |
| ~2:15 | Eerste nieuw model (Sedan) |
| ~3:40 | Volledige productielijn |
| ~5:45 | Tweede productielijn (incl. 2 min bouwtijd) |
| ~5:40 | SUV |
| ~5:30 | Eerste technologieën |
| 6:20 – 10:20 | Sportwagen, lijn 3, Luxe, AI-kwaliteitscontrole |
| 28:00 | Vierde lijn |

Elektrisch en Hypercar zijn langetermijndoelen (uren). Alle kosten en effecten staan in `js/data.js` en de formules in `js/game.js`.

## 3D-weergave (three.js)

Het spel tekent de fabriek in 3D met three.js r160 (`js/three.min.js`, lokaal meegeleverd, dus geen internet nodig). De spel-logica in `game.js` is niet veranderd: gameplay, balans en savegames zijn gelijk aan de 2D-versie.

- **Fallback:** zonder WebGL, of met `?2d=1` achter de URL, start automatisch de oude 2D-weergave (`js/render.js`).
- **Camera:** slepen = verschuiven, scrollen of knijpen = zoomen, scrollwiel ingedrukt, rechtermuisknop of Shift + slepen = draaien en kantelen, twee vingers draaien = draaien. Linksonder staan knoppen voor draaien, zoomen en "hele fabriek tonen".
- **Fabriek:** bewegende banden, robotarmen met eigen gereedschap per station, auto's die per station worden opgebouwd, een magazijntoren met chassisstapel, bouwplaatsen met steigers, showroom met draaiplateau.
- **Progressie:** elk station heeft een eigen portaal (lasportaal, takel, pers, spuitcabine, montagebrug, meetpoort, afwerktunnel). Level 10 en 50 geven een extra robotarm, level 25 goudkleurige afwerking, level 50 een baken, level 100 neonverlichting. Elke nieuwe productielijn vergroot de hal.
- **Personeel:** medewerkers halen kisten uit het rek en werken bij de stations; het aantal groeit met *Personeel aannemen*. Met een *Verkoopteam* loopt er per lijn een verkoper naar de auto die als volgende verkocht wordt.
- **Interface:** alleen kleine level-chipjes op de eerste lijn; details verschijnen bij het geselecteerde station. Bij ver uitzoomen verdwijnen de chipjes.

### Prestaties

- Alle robotarmen worden met instancing getekend en statische onderdelen zijn samengevoegd. Gemeten met 4 volle productielijnen: ongeveer **110 draw calls en 68.000 driehoeken**.
- Automatische kwaliteit: bij minder dan 46 FPS schakelt het spel stapsgewijs terug (lagere resolutie, kleinere schaduwen, schaduwen uit). Mobiel start een stap lager. Met `?q=0` … `?q=3` zet je de kwaliteit vast.
- In de console geeft `CFT.Render.stats()` draw calls, driehoeken, kwaliteitsniveau en FPS.
- De framerate is alleen gemeten in een testbrowser met software-rendering; test op echte telefoons voor publicatie.

## Bouwtijden

Nieuwe stations en productielijnen worden eerst gebouwd: je ziet steigers, een kraantje en een machine die laag voor laag groeit.

| Project | Bouwtijd |
|---|---|
| Chassisproductie | direct |
| Motorassemblage | 4s |
| Carrosseriebouw | 8s |
| Spuiterij | 15s |
| Montage | 25s |
| Kwaliteitscontrole | 35s |
| Eindassemblage | 45s |
| Productielijn 2 / 3 / 4 | 2 / 5 / 10 min |

Er kan één station en één productielijn tegelijk in aanbouw zijn. Tik op de bouwplaats of op *📺 Direct klaar* in het Fabriek-paneel om de bouw met een rewarded ad meteen af te ronden. Bouwtimers lopen op de klok, dus ook door als het spel dicht is.

## Opslaan

- **Automatisch:** elke 8 seconden, en bij sluiten of wisselen van tabblad (LocalStorage). Het 💾-knopje kleurt kort groen als er is opgeslagen.
- **Handmatig:** 💾-knop in de bovenbalk → *Nu opslaan*, of **Ctrl+S** / **Cmd+S**.
- **Save-code:** 💾 → *Save-code maken* geeft een tekstcode (begint met `CFT1-`). Met *Save-code inladen* zet je je fabriek over naar een andere browser, een ander apparaat of een nieuwe versie van het spel. Codes worden gecontroleerd voordat ze iets overschrijven.

## Testen

Getest in Chromium (Playwright) op 1366×768, 1920×1080 en 390×844 (mobiel, touch):

- produceren, door de lijn rijden, tikken-om-te-verkopen, *Verkoop alles*
- bouwen en upgraden van stations (×1 / ×10 / MAX, ingedrukt houden), bedrijfsupgrades, technologie, modellen, lijnen
- missies en dagelijkse uitdagingen claimen, prestaties
- Turbo via test-advertentie, VIP-koper
- opslaan, herladen en offline-inkomstenvenster
- geen JavaScript-fouten in de console

Vastloopbeveiliging: productiekosten worden pas bij verkoop verrekend, dus je kunt nooit "te arm" zijn om te produceren. Handmatig produceren blijft altijd mogelijk.

## Publiceren op CrazyGames

1. Upload `car-factory-tycoon-crazygames.zip` (bevat alleen `index.html`, `css/`, `js/` en het icoon).
2. De SDK wordt automatisch geladen op crazygames.com. Geïmplementeerd:
   - `loadingStart` / `loadingStop` tijdens het opstarten
   - `gameplayStart` / `gameplayStop` bij spelen, tab wisselen en advertenties
   - `requestAd('rewarded')`: spel en geluid pauzeren bij `adStarted`, hervatten bij `adFinished`/`adError`
   - `happytime()` bij grote momenten (nieuw model, nieuwe lijn, gouden auto)
   - respecteert de CrazyGames-instelling `muteAudio`
3. Upload de covers uit `assets/` als thumbnails.
4. Het spel is responsive (liggend en staand) en heeft een eigen volledig-scherm-knop in Instellingen.

## Mogelijke volgende stappen

- Engelse vertaling (alle teksten staan in `data.js` en `ui.js`)
- Opslag via de CrazyGames Data-module voor synchronisatie tussen apparaten
- Prestige-systeem ("nieuw merk starten") voor nog langere speelduur

## Copyright

© 2026 Brakeco Games. Alle rechten voorbehouden. Car Factory Tycoon, de code, de vormgeving en de afbeeldingen in dit project zijn eigendom van Brakeco Games.

Uitzondering: `js/three.min.js` is three.js (© three.js authors) en valt onder de MIT-licentie.
