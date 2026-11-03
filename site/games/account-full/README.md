# ACCOUNT FULL

A tower defense built on the 33-card SERIES 1 set from [stoinly.computer](https://stoinly.computer/). The premise is the site's: the bank said the account is full, and if the money is not given away it gets deleted. Money comes out of the mail and walks to the account. The cards give it away before it gets there.

Fan work. Not affiliated with the site. Every photograph is credited on its card, as the site prints it.

## Play

Open `index.html` in a browser. No build, no server, no install.

The look is stoinly.computer's own: starfield, rainbow wordmark, lime tickers, ridged frames, foil. The fonts are the site's (Impact, Comic Sans MS, Courier New); where a machine lacks them the bundled Oswald and IBM Plex stand in, which is what the Linux screenshots show.

It was built and tested in Brave 154 on Linux, headless, through the scripted scenarios below, at desktop, laptop, phone-portrait and phone-landscape sizes. Firefox 157 was checked only as far as rendering the title screen. No other browser, and no real phone, has been tried.

- Money is the enemy. A bill's value is its health. A hit gives part of it away: a $20 that takes a $4 hit keeps walking as a $16, a little faster.
- The account has $500 of room. Every dollar that reaches it uses some. At zero the bank deletes everything.
- Every round pays gum, and so does every bill finished. Gum rips packs of five cards, drawn the way the site draws its own packs (rarity weights common 5, rare 3, holo 2, ultra 1, no repeats within a pack). The first pack is free and always has a strong woman in it; the next costs 4 sticks and each one after that costs 2 more.
- Drag a card from the hand onto the board, or tap it and then tap the board. Strong women and guests stand next to the track. Places and vehicles go on it. Action cards are played once, during a round. Tap a placed card to upgrade it with gum or, between rounds, pick it back up. Drop a card on TRADE IN to swap it for gum.
- Thirty rounds. The last one is the bailout.

Keys: `Space` speed, `Enter` start the round (on the title: press start), `P` pack, `M` sound, `B` binder, `Esc` close or cancel, `1`–`9` pick a card from the hand. These are the defaults; they can be rebound in the STOINLY NEXUS (below). Keys are matched by physical position (`KeyboardEvent.code`), so on a non-QWERTY layout the letters sit where P, M and B are on QWERTY.

The run is saved in the browser between rounds, so leaving or reloading in the middle of a round starts that round over (the game asks before you leave from its menu). The binder (which cards you have ever pulled) is kept across runs.

### Stars, unlocks and daily things

No real money, no ads, no timers. Everything here is cosmetic; none of it changes the rules of a run.

- **Stars.** A run earns one star for clearing round 10, one for round 20, and one for clearing all 30. Each is paid once per run, the moment the round is cleared, and the result screen shows the rules with the stars filling in.
- **Collection.** Stars (counted over every run), the daily chest, a star in a daily challenge, and a three-day streak unlock cosmetics: card backs, board themes, the burst a finished bill throws, and pack wrappers. The collection screen shows everything, with locked ones as silhouettes that say how to get them, and NEW! badges until you have looked.
- **Daily challenge.** A run seeded from the local date (`YYYY-MM-DD`), so everyone rips the same packs in the same order that day. It keeps its own best (rounds cleared, then money given away).
- **Day streak.** Consecutive local days on which you started a round. Shown on the title with a flame; it goes back to zero after a missed day.
- **Daily chest.** One free open per local day: either stars or a cosmetic that only the chest has.

### STOINLY NEXUS settings

The game reads the shared settings of the STOINLY NEXUS launcher (`../stoinly-nexus/CONTRACT.md`) through `js/stoinly-settings.js`, a byte-identical copy of `stoinly-nexus/shared/stoinly-settings.js` (check with `sha256sum` after any change there). With no saved settings it behaves exactly as before. Changes made in the nexus, in another tab, apply live.

- **Audio:** every sound is scaled by the shared master x sfx volume (0 when muted there). `M` and the speaker button are a separate in-game mute on top of it; they never write the shared settings, and if the nexus has the sound off they say so. The game has no music.
- **Motion:** shake times the shake slider; particle counts times the particle slider; with flashes off there are no white hit flashes, no full-board flashes, no blinking text and no strobing ticker. Reduced motion (the OS setting or the nexus one) replaces the old `prefers-reduced-motion` rules and also turns off hit-stop.
- **Display:** DOM text follows `--stoinly-text-scale` (except card faces, the pack pouch art, silhouettes and the title wordmark); canvas pop-ups, banners, labels and hints are scaled too, but the dollar amounts printed on the bills are not. The colour-blind filter goes on the whole page (`<body data-stoinly-cb>`). Performance mode halves particles, removes canvas glow and CSS filters and box shadows, stops the foil sheen and uses a plainer starfield. Fullscreen is requested on the first click or key press.
- **Back to the nexus:** with `?from=nexus` the title and the pause menu show a "◄ NEXUS" link to `/`; from the pause menu it saves first.
- `stoinly-game.json` is this game's manifest for the nexus: actions and default keys, save keys, how-to-play facts, and which settings are supported.

### Saves

| key | what |
| --- | --- |
| `account-full.save.v1` | the run in progress (unchanged format; newer saves also carry `runId` and `daily`) |
| `account-full.settings.v1` | sound, speed, auto start |
| `account-full.binder.v1` | cards ever pulled |
| `stoinly.accountfull.meta.v1` | stars, unlocks, equipped cosmetics, streak, chest, daily bests (versioned; a corrupt value is moved to `…meta.v1.corrupt` and the game starts that part from scratch) |
| `stoinly.nexus.settings.v1` | shared STOINLY NEXUS settings; read only, written by the nexus |

On a phone held upright the board is wider than the screen and scrolls sideways; held sideways, the hand moves to a column on the right and the board gets the full height.

## Difficulty

Balanced only against a scripted player in node (`js/sim.js` runs there without a browser), never against a person. That player rips packs while its hand is thin, places cards where they cover the most track, and upgrades whatever has given away the most. Across eight seeds it wins five times and loses at rounds 28, 28 and 30. The numbers that set difficulty are all in `js/data.js`.

## Layout

```
index.html        the page
style.css         all styling; the cards follow the layout and colours of the site's card CSS, set in the game's own fonts
js/data.js        the 33 cards, what each does, the 30 rounds, the economy, all the copy
js/path.js        the track: a polyline with rounded corners, measured by distance
js/sim.js         the rules: money, hits, places, vehicles, actions, rounds, packs, save format
js/meta.js        stars, cosmetics, daily challenge seed, streak, daily chest; the meta save (no DOM, loads in node)
js/render.js      canvas drawing and visual effects: board themes, pop-up numbers, particles, hit flash, shake, hit-stop
js/audio.js       synthesised sound (Web Audio, no files)
js/juice.js       DOM effects: canvas confetti, coins that fly to the gum counter, ticking counters, combo counter, ticker
js/ui.js          HUD, hand, drag and drop, inspect panel, pack ripping, binder, collection, daily chest, result screen, menus
js/main.js        frame loop, saving, boot
js/debug.js       scripted scenarios for headless testing (loaded only with ?test=name)
js/stoinly-settings.js  the STOINLY NEXUS shared settings reader, copied byte for byte from stoinly-nexus/shared/
stoinly-game.json the manifest the STOINLY NEXUS reads
assets/photos/    the 33 photographs the cards use, as the site serves them
assets/fonts/     Oswald, IBM Plex Sans, IBM Plex Mono (SIL Open Font License, texts included)
```

## Testing

Headless, with Brave or Chrome:

```
brave-browser --headless=new --disable-gpu --window-size=1440,900 --virtual-time-budget=20000 \
  --enable-logging=stderr --v=0 --screenshot=/tmp/game.png "file://$PWD/index.html?test=game"
```

Scenarios: `title`, `help`, `menu`, `binder`, `pack`, `packstress`, `money`, `hand`, `game`, `late`, `inspecthand`, `drag`, `save`, `lost`, `won`, and for the flashy layer `chest`, `chestdone`, `collection`, `stars`, `daily`, `fx`, `juice`, `milestone`, `oldsave`, `corrupt`, and for the STOINLY NEXUS settings `volume`, `reduced`, `noflash`, `textscale`, `colorblind`, `perf`, `keys`, `nexus` (open with `&from=nexus`) and `fullscreen` (`textscale`, `colorblind` and `perf` take `&view=game`, `nexus` and `textscale` take `&view=menu`). Each prints `TEST_OK <name>` or `TEST_ERROR` lines to the console (stderr with the flags above). `packstress` mashes Escape and FLIP THEM ALL through a pack rip and reports any error; `money` freezes every kind of money on the board at once.

Test runs switch CSS animations off so screenshots show end states (add `&anim=1` to keep them). Headless virtual time does not run `requestAnimationFrame`, so `fx`, `juice` and `milestone` drive the real frame function themselves (`app.debugFrame`). `fx` fires every board effect once at a known spot; `juice&ms=…&packs=…&round=…` plays part of a round. Several scenarios overwrite the meta save; with the command above (no `--user-data-dir`) each headless run starts with empty storage (checked with Brave on 2026-11-03). Add `--force-prefers-reduced-motion` to check the OS reduced-motion path; the `reduced` scenario checks the nexus one.

## Credits

Cards, premise and photographs from stoinly.computer. Photo credits are printed on every card. Licenses as the site states them: CC BY, CC BY-SA, CC0 and public domain, from Wikimedia Commons and Flickr. Fonts: Oswald (The Oswald Project Authors), IBM Plex Sans and IBM Plex Mono (IBM), all under the SIL Open Font License 1.1; the license texts are in `assets/fonts/`.
