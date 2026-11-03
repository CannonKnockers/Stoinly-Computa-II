# Wreck Riders

A ragdoll-physics obstacle game for the browser, in the spirit of the Flash game *Happy Wheels*: pick a rider and their
ridiculous vehicle, then try to reach the finish line through spikes, wrecking balls, harpoon turrets, land mines, saw blades
and glass, losing limbs along the way. All characters, names and art are original.

## Play

Open `index.html` in Firefox (double-click it, or `firefox index.html`). There is no build step, no install and no network
access; the physics library is bundled in `lib/`.

| keys | what they do |
|---|---|
| Arrow keys or WASD | drive and lean (see each rider below) |
| Space / Shift / Z | the rider's special moves |
| Enter or Space | confirm in menus; next course after a finish; retry after a crash |
| Up / Down on the title | choose Play, Daily Challenge or Collection |
| D / C on the title | daily challenge / collection |
| Tab, Q / E, arrows, Enter in the collection | switch tab, move, equip or buy |
| O on the daily screen | open the daily chest |
| R | restart the course |
| P | pause (the game also pauses when the window loses focus) |
| Esc | back one screen |
| M | mute (the shared STOINLY NEXUS mute) |

The mouse works on every screen; buttons squash when pressed and act when released. Every key above can be rebound in the
STOINLY NEXUS (see below); the defaults are the keys in this table.

## STOINLY NEXUS settings

The game reads the shared nexus settings through `src/stoinly-settings.js`, a byte-identical copy of
`stoinly-nexus/shared/stoinly-settings.js` (recopy it if that file changes, and compare with `sha256sum`). `src/prefs.js`
turns them into `WR.prefs`, and changes made in another tab apply live. With no saved settings, the game behaves as before.
Settings change only drawing, sound, key mapping and UI: the sim never reads them, and `test/settings.test.js` replays
every saved winning run with extreme settings and checks the finish times and positions are identical.

- **Sound:** every sound times `volume('sfx')`; M toggles the shared mute. The game has no music.
- **Motion:** screen shake times `shakeScale()`; juice sparkles, confetti and the drawn share of gore times `particleScale()`
  (gore is thinned at draw time, so the sim's particle lists stay the same); with flashes off, there is no white hit flash, no
  blinking text, no chest-burst glow and no sparkle-trail twinkle; reduced motion (the OS or the nexus setting) also turns off
  hit-stop. `?rm=1` still forces reduced motion for testing.
- **Display:** canvas UI fonts grow with the text scale (big titles grow less); the colour-blind filter is applied to the
  canvas by `applyDisplay()`; performance mode halves particles, drops glow and shadow blur, draws at device pixel ratio 1
  and skips clouds, stars, smoke and lit windows in the backdrops; fullscreen is requested on the first key or click.
- **Controls:** 21 actions (7 for riding, 14 for runs and menus) go through `keysFor('wreck-riders', id, defaults)`; on-screen
  key hints follow the rebinding, and a "YOUR KEYS" line appears when the ride keys differ from the defaults.
- **Nexus:** opened with `?from=nexus`, the title and pause screens show "◄ NEXUS", which goes to `/`.
- **Manifest:** `stoinly-game.json` (actions, save keys, facts for the tutorial pages, `settingsSupport`); the cover is
  `cover.png`, a screenshot of this game.

Text scale is partial: at large scales some HUD and menu lines sit close together or overlap (for example, the coin count and
the style score in the run panel at 1.3).

## Look, stars, unlocks and the daily challenge

The menus, HUD and result screens use the stoinly.computer website style (starfield, rainbow wordmark, Courier tickers,
ridge-bordered panels, foil sheen; see `../docs/design/flashy-style-spec.md`). Fonts are the site's stacks (Impact, Comic
Sans, Courier New); where none of Impact, Haettenschweiler or Arial Black is installed, a bold narrow face stands in so the
titles stay heavy.

- **Juice:** screen shake and a short hit-stop on big impacts, severed limbs and explosions; a white flash on hard hits;
  sparkles and cartoon blood on every severed limb; pop-ups for coins, airtime, flips and "SEVERED!"; a combo counter (tricks
  within 2.5 s raise the multiplier up to x5; a crash breaks it); coin tokens along every course that fly to the counter;
  a finish-line confetti burst; synthesized stings for coins (the pitch climbs with a pickup chain), tricks, combos, stars,
  unlocks and the chest. Reduced motion (the OS `prefers-reduced-motion` setting or the nexus one) turns off shake, blinking,
  bobbing and hit-stop and cuts particles (`?rm=1` forces it).
- **Stars:** up to 3 per course, kept across runs and riders: finish; finish under par; reach the course's style score
  (airtime 100 per second, flips 300, severed limbs 150, each times the combo multiplier; coins 25 each). The finish screen shows
  each rule, what the run did and which stars are new.
- **Coins and cosmetics:** coins are banked when a run finishes or crashes (restarting or quitting mid-run forfeits them). Skins, hats and trails unlock by stars, coins,
  day streak or the daily chest; the collection shows locked items as silhouettes and new ones with a blinking NEW! badge.
  Cosmetics are drawing only: they never change the physics.
- **Daily challenge:** the local date picks a course, a rider with a saved winning run on it, a sim seed and a modifier
  (big heads, disco lights, or extra points for coins, air, gore or time). It has its own best score per day.
- **Streak and chest:** any run started on consecutive local days extends the day streak (3 and 7 days unlock items). One
  free chest per day gives coins and sometimes a chest-only cosmetic. There is no real money, no ads and no countdowns.

Everything is saved in the browser's local storage under `stoinly.wreckriders.meta.v1` (versioned; a corrupt save falls back
to a fresh one and the bad text is kept under `stoinly.wreckriders.meta.v1.bak`). Best times from the older
`wreck-riders-best` key are carried over once.

## Riders

| rider | vehicle | controls |
|---|---|---|
| Dottie Blaze | rocket wheelchair | Up / Down push the wheels · Left / Right lean · Space rocket · Z eject |
| Kip Kilowatt | self-balancing scooter | Up speed up (it leans for you) · Down brake, then reverse · Left / Right tilt · Space hop · Z eject |
| Uncle Rudy & Pip | bicycle with a passenger | Up pedal · Down brake / reverse · Left / Right lean · Space bunny hop · Shift eject Pip · Z eject Rudy |
| Jojo the Clown | pogo stick | Space hold to squash the spring, release to bounce · Up / Down hop forward / backward · Left / Right tilt · Z eject |

Riders bleed, lose limbs at the joints and die from head trauma, blood loss, explosions, falls into pits, blades and harpoons.
A rider who is thrown off but still alive can still finish by tumbling across the line.

## Courses

| # | course | length | par | hazards | riders with a saved winning run |
|---|---|---|---|---|---|
| 1 | Ward Nine | 166 m | 0:40 | a gap, spike pits, a wrecking ball, glass, a trampoline, crates | all four |
| 2 | Harpoon Alley | 230 m | 0:55 | harpoon turrets, boost pads, a seesaw over spikes, a lift, glass | all four |
| 3 | Minefield Meadow | 216 m | 1:00 | land mines, falling logs, a saw blade, trampolines over a mine pit, a runaway van | Rudy & Pip, Kip |
| 4 | The Big Drop | 276 m | 1:10 | a long descent, saw blades, spinning beams, a wrecking ball, a lift, ceiling spikes | Dottie, Rudy & Pip |
| 5 | The Gauntlet | 293 m | 1:30 | everything: turrets, mines, saws, wrecking balls, moving platforms, a seesaw launch, a van | Dottie, Rudy & Pip |

Every course is open from the start. The last column lists the riders whose saved run in `test/levels/` reaches the
finish when replayed (`node test/solutions.test.js`); those runs were found by a search program, not by people. No
winning run was found for the other riders on courses 3 to 5, and they may not be able to finish them.

## How it is built

Plain HTML, Canvas 2D and JavaScript in classic `<script>` files sharing one global namespace (`WR`). The physics files
are unchanged by the cosmetic and meta layer: `src/meta.js` (save, stars, unlocks, daily, streak, chest), `src/juice.js`
(tricks, coins, combo, hit-stop; it only reads the sim), `src/fx.js` and `src/screens.js` (drawing). Physics is
[planck.js](https://github.com/piqnt/planck.js) 1.5.1, a JavaScript port of Box2D (MIT licence, `lib/PLANCK-LICENSE.txt`).
Every sound is synthesized at runtime with the Web Audio API; there are no audio or image files.

`docs/ENGINE.md` is the technical reference: coordinate system, every module's interface, the level format, what each vehicle
can do (measured), and the test tools.

## Tests

Node 18 or later, no dependencies:

```
node test/engine.test.js       # physics core: drives, crashes, every hazard, balance
node test/solutions.test.js    # replays a saved winning run for each course
node test/meta.test.js         # juice is read-only on every saved run; save safety, stars, unlocks, streak, daily, chest
node test/render.test.js       # every drawing path against a mock canvas
node test/audio.test.js        # every sound path against a mock Web Audio API
node test/settings.test.js     # nexus settings wiring; saved runs replay identically with extreme settings
node test/levelcheck.js 3      # object placement on course 3
node test/playtest.js 2 bike   # one scripted run with a per-second trace
```

The render and audio tests catch runtime errors only; they cannot judge how the game looks or sounds.
`test/flow.html` drives the real game in a browser (keys, clicks, chest, buying, a daily run, hit-stop, saving) with
localStorage replaced by an in-memory stub:
`brave-browser --headless=new --disable-gpu --window-size=1440,900 --virtual-time-budget=40000 --dump-dom test/flow.html`.
`test/settings-flow.html` checks live settings from another browsing context, rebound keys, the shared mute and the NEXUS
button in a browser; it needs http (for example `python3 -m http.server 8765` from the parent folder), then
`brave-browser --headless=new --disable-gpu --virtual-time-budget=30000 --dump-dom 'http://127.0.0.1:8765/wreck-riders/test/settings-flow.html?from=nexus&demo=1'`.
`test/shot.html` sets or clears nexus settings on that origin before a screenshot.
