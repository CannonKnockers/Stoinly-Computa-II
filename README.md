# STOINLY.EXE

> **The live site is now the STOINLY NEXUS: all four Stoinly games in one launcher.** It's served from `site/`, a prebuilt copy made by `nexus/build-site.js` in the stoinlycomputergame repo. The source below is the old build 0.1 card game; the current source for every game lives in stoinlycomputergame.

A card-battle game in the style of Slay the Spire, built from the 33-card "SERIES 1" trading-card set on [stoinly.computer](https://stoinly.computer/).

**Play it in the browser:** https://cannonknockers.github.io/Stoinly-Computa-II/

## What it is (build 0.1)

One combat. Pick any Act 1 encounter from the list and fight it with the starting deck of 11 cards. There is no map, reward screen or full run yet.

Controls:

- Click a card to play it. With two enemies, click the card, then the enemy.
- Number keys 1 to 9 and 0 pick cards. E ends the turn. Esc cancels.
- LEAVE FIGHT returns to the encounter list.

URL parameters: `?encounter=meet-215` jumps straight into a fight (the ids are in `src/engine/enemies.ts`), and `?seed=3` makes the shuffle repeatable.

## Run it locally

Needs Node 18 or newer.

```
npm install
npm run dev        # local dev server; open the URL it prints
npm test           # engine and UI tests (Vitest)
npm run build      # type-check and build to dist/
```

The built `dist/` folder must be served over HTTP. Opening `dist/index.html` straight from disk showed a blank page in Firefox when tested.

Every push to `main` runs the tests, builds the game and deploys it to GitHub Pages (see `.github/workflows/pages.yml`).

## Layout

```
src/
  engine/       the rules: pure TypeScript, no DOM (types, combat loop, cards, enemies, damage math, seeded RNG)
  ui/           card renderer and styles
  main.ts       screens, input, tooltips
tests/          engine rules and a jsdom click-through of the page
data/cards/     the 33 cards as the site defines them, and what each becomes in the game
public/art/     the photos this build uses
public/fonts/   Anton and Courier Prime, with their SIL Open Font License files
```

Some code comments cite a design document and research notes. Those live in the original working project and are not part of this repository.

## Credits

Card names, photos and photo credits come from stoinly.computer. Each card shows its photo credit as the site prints it, and the game has a credits screen. The fonts are Anton and Courier Prime, both under the SIL Open Font License 1.1.
