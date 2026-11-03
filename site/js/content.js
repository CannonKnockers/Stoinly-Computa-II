/* Every game the nexus knows, and every line of nexus copy, in one place.
 * Game facts come from the manifests at runtime; nothing here may contradict them, so the jokes stay
 * about the nexus, the computer and the bank, never about how a game plays. */

// To add a game: add it here AND to gameDirs() in server.js (see README).
export const GAMES = [
  { id: 'stoinly-exe', fallbackTitle: 'STOINLY.EXE', quip: 'THE CARDS ARE REAL. THE GUM WAS NEVER REAL.' },
  { id: 'doom', fallbackTitle: 'THE DOOM ONE', quip: 'RUDIGER, IF YOU’RE READING THIS, READ THE CONTROLS FIRST.' },
  { id: 'wreck-riders', fallbackTitle: 'WRECK RIDERS', quip: 'THE COMPUTER RECOMMENDS A HELMET. THE COMPUTER DOES NOT HAVE A HEAD.' },
  { id: 'account-full', fallbackTitle: 'ACCOUNT FULL', quip: 'THE BANK SAID THE ACCOUNT IS FULL. THIS PAGE IS ABOUT THAT.' },
];

export const TICKER_TOP = '*** WELCOME TO THE STOINLY NEXUS *** FOUR GAMES ONE COMPUTER *** ALL FOUR GAMES ARE FREE *** THE MONEY WAS FREE THE WHOLE TIME *** CHANGE A SETTING ONCE AND ALL FOUR GAMES GET THE MEMO *** NOW BROADCASTING LIVE FROM 127.0.0.1 WHICH IS YOUR COMPUTER *** YOU ARE ALREADY HERE *** ';
export const TICKER_BOTTOM = '*** THE NEXUS IS THE ONLY NEXUS *** “I CLICKED PLAY AND IT WAS A GAME.” — DAVE, OHIO *** NO PURCHASE NECESSARY *** NO PURCHASE POSSIBLE *** THE COMPUTER IS ROTATING AS WE SPEAK *** THE STOINLY IS REAL *** ';

export const HOME = {
  tagline: '▶ FOUR GAMES. ONE COMPUTER. ◀',
  construction: 'FREE GAMES AT STOINLY DOT NEXUS ON YOUR COMPUTER',
  noticeHead: '⚠ OFFICIAL NOTICE ⚠',
  noticeBody: 'YOUR SETTINGS ARE SHARED. TURN THE VOLUME DOWN HERE AND ALL FOUR GAMES GET THE MEMO. THE MEMO WAS FREE.',
  noticeSign: '— THE NEXUS',
  testimonials: [
    ['I clicked PLAY and it was a game.', 'DAVE, OHIO'],
    ['I rebound jump to the letter J. Nobody stopped me.', 'A REAL HUMAN'],
    ['The settings followed me into every game.', 'WEBMASTER’S MOM'],
    ['I have no memory of the last 6 hours.', 'SATISFIED USER'],
  ],
  footer: '© 2026 STOINLY.COMPUTER — ALL RIGHTS RESERVED FOREVER',
  footer2: 'FAN WORK. RUNS ON YOUR COMPUTER ONLY. THE STOINLY IS REAL.',
};

export const TILE = {
  noSave: 'NO SAVE YET. A FRESH START, FOR FREE.',
  paperworkHead: 'THIS GAME DIDN’T SEND ITS PAPERWORK.',
  paperworkBody: 'The nexus could not read this game’s stoinly-game.json, so it can’t show its rules, keys or saves yet. You can still try to play it.',
  notHere: 'THE GAME ITSELF IS NOT HERE EITHER.',
  notBuilt: 'Not built yet. In a terminal, in the stoinly-nexus folder, run: npm run build-games',
  notHereBody: 'The nexus could not find this game’s files.',
};

export const SETTINGS = {
  sub: 'ONE SET OF KNOBS. FOUR GAMES. IT IS OFFICIAL.',
  saved: 'SAVED. THE GAMES WILL HEAR ABOUT IT.',
  restore: 'RESTORE DEFAULTS',
  restoreConfirm: 'CLICK AGAIN TO RESET EVERY SETTING AND KEY',
  restored: 'EVERYTHING IS BACK TO HOW IT CAME. FACTORY STOINLY.',
  tabs: { audio: 'AUDIO', motion: 'MOTION & FLASH', display: 'DISPLAY', controls: 'CONTROLS & DATA' },
  beepMuted: 'MUTED. THE BEEP HAPPENED, BUT NOBODY HEARD IT.',
  beepOk: 'BEEP. THAT WAS THE BEEP.',
  musicOk: 'THAT WAS THE MUSIC. ALL OF IT.',
  quips: {
    master: 'GOES TO 100. THE COMPUTER CHECKED.',
    mute: 'FOR WHEN THE BANK CALLS.',
    reduce: 'THE COMPUTER WILL HOLD STILL.',
    flashes: 'NO STROBES. NO BLINKING. NO SURPRISES.',
    particles: 'CONFETTI IS FREE. YOUR GRAPHICS CARD IS NOT.',
    textScale: 'BIGGER LETTERS. SAME WORDS.',
    perf: 'FOR COMPUTERS THAT ARE LESS STOINLY.',
    fullscreen: 'THE WHOLE COMPUTER, ALL OF IT.',
  },
};

export const KEYS = {
  listen: 'PRESS A KEY…',
  listenSub: 'Esc cancels. The computer is listening.',
  reserved: 'ESC IS TAKEN. IT CANCELS THINGS. PICK ANOTHER KEY.',
  conflictTail: 'One key doing two jobs can make a game do both at once.',
  bound: (key, label) => `${key} NOW DOES “${label}”. IT IS OFFICIAL.`,
  resetGame: 'RESET ALL KEYS FOR THIS GAME',
  none: 'This game didn’t list any keys in its paperwork.',
  noRebind: 'This game says it ignores rebinding, so changes here would do nothing. The list below shows its keys as they are.',
};

export const DATA = {
  head: 'SAVE DATA',
  none: 'Nothing saved yet for this game in this browser.',
  resetBtn: 'RESET THIS GAME’S SAVE',
  resetAsk: (n, title) => `This deletes ${n} saved item${n === 1 ? '' : 's'} for ${title} from this browser: stars, unlocks, progress, all of it. It cannot be undone. Type DELETE to confirm.`,
  resetDone: 'DELETED. FOR FREE.',
  exportHead: 'EXPORT & IMPORT',
  exportHelp: 'Export writes one JSON file with every game’s save and your nexus settings. Import reads that file back after showing you what it will change. Keep the file somewhere safe. Not the bank.',
  exportBtn: '⬇ EXPORT EVERYTHING',
  importBtn: '⬆ IMPORT A SAVE FILE',
  importConfirm: (n) => `IMPORT ${n} ITEM${n === 1 ? '' : 'S'}`,
  imported: (n) => `IMPORTED ${n} ITEM${n === 1 ? '' : 'S'}. THE COMPUTER REMEMBERS NOW.`,
  nothingToImport: 'Everything in that file already matches what is here. Nothing to do.',
};

export const WELCOME = [
  {
    title: 'WELCOME TO THE NEXUS',
    body: 'This is the launcher for four free Stoinly games. Pick a game, press PLAY, and it opens right here in this tab.',
    quip: 'YOU ARE ALREADY HERE.',
  },
  {
    title: 'THE TILES',
    body: 'Each game gets a tile. It shows the stars, day streak and best scores from that game’s save. HOW TO PLAY opens the rules and your current keys.',
    quip: 'THE STARS ARE REAL. THE COMPUTER COUNTED THEM.',
  },
  {
    title: 'SETTINGS GO EVERYWHERE',
    body: 'Volume, motion and flashes, text size, colour-blind mode and keys are set once, in SETTINGS. Every game reads them. If a game ignores one, the settings screen says so.',
    quip: 'THE GAMES HAVE BEEN NOTIFIED BY MAIL. THE MAIL WAS FREE.',
  },
  {
    title: 'GETTING BACK',
    body: 'Inside a game, use its ◄ NEXUS link, or your browser’s Back button. To stop the nexus, press Ctrl+C in the terminal that started it.',
    quip: 'THE NEXUS WILL WAIT. IT HAS NOWHERE TO BE.',
  },
  {
    title: 'YOUR SAVES',
    body: 'Saves live in this browser, on this computer. To keep a copy, go to SETTINGS → CONTROLS & DATA and press EXPORT EVERYTHING.',
    quip: 'THE BANK CANNOT DELETE WHAT IT CANNOT FIND.',
  },
];

export const HOWTO = {
  head: 'THE COMPUTER HAS CREATED THIS TUTORIAL. IT IS OFFICIAL.',
  rulesQuip: 'READ IT TWICE. THE COMPUTER DID.',
  keysQuip: 'THESE ARE YOUR KEYS. CHANGED KEYS ARE GREEN.',
  mouseQuip: 'THE MOUSE IS ALSO A COMPUTER.',
  touchQuip: 'FOR PHONES, TABLETS AND OTHER SMALL COMPUTERS.',
  supportQuip: 'WHICH NEXUS SETTINGS THIS GAME LISTENS TO, IN ITS OWN WORDS.',
  noRules: 'This game’s paperwork has no how-to-play section yet.',
  noTouch: 'No touch controls listed for this game.',
  noMouse: 'No mouse controls listed for this game.',
};

// FAQ: [question, [paragraphs]] — answers first, jokes last.
export const FAQ = [
  ['WHERE ARE MY SAVES?', [
    'In this browser’s local storage, on this computer. Each game keeps its own. Nothing is uploaded anywhere.',
    'SETTINGS → CONTROLS & DATA lists every saved item per game, and can export them all to one file.',
  ]],
  ['MY OLD SAVES ARE GONE. I USED TO OPEN THE GAMES BY DOUBLE-CLICKING THEM.', [
    'They are not gone, they are in a different place. A game opened from a file (an address starting with file://) and the same game opened through the nexus (http://127.0.0.1:5195) count as two different websites to your browser, and each website gets its own storage.',
    'So saves made from file:// do not show up here, and saves made here do not show up there. Open the game the old way to play that save. There is no button that moves saves between the two, because a page on one cannot read the other’s storage.',
    'The same goes for http://localhost:5195 versus http://127.0.0.1:5195, and for another port started with PORT=…: each one is a separate website with its own saves. npm start opens http://127.0.0.1:5195 (unless you set PORT), so stick with that address.',
  ]],
  ['I CHANGED A SETTING AND A GAME DIDN’T CHANGE.', [
    'Some games ignore some settings. The settings screen shows a red “IGNORES THIS” tag under any setting a game says it ignores, and each game’s HOW TO PLAY page lists what it listens to.',
    'If a game is already open in another tab, it should pick up the change on its own. If it doesn’t, reload that tab.',
  ]],
  ['A TILE SAYS THE GAME “DIDN’T SEND ITS PAPERWORK”.', [
    'The nexus reads a small file called stoinly-game.json from each game to learn its name, keys, rules and save keys. That file is missing or broken for this game.',
    'PLAY ANYWAY still opens the game if its files are there. Settings and saves for it will appear here once the file exists.',
  ]],
  ['STOINLY.EXE SAYS IT IS NOT BUILT, OR LOOKS OLD.', [
    'The card game has to be built before it can be served. In a terminal, in the stoinly-nexus folder, run npm run build-games. npm start also does this by itself when the build is missing or older than the source.',
  ]],
  ['HOW DO I REBIND A KEY?', [
    'SETTINGS → CONTROLS & DATA, pick the game, then click the key you want to change (or + to add one). Press the new key. Esc cancels.',
    'If the key already does something else in that game, the nexus warns you and lets you choose. The ↺ button puts one action back; RESET ALL KEYS puts the whole game back.',
  ]],
  ['DOES THIS NEED THE INTERNET?', [
    'No. The nexus server runs on your computer and only answers your computer (127.0.0.1). The games and fonts are all local files.',
  ]],
  ['HOW DO I STOP IT? HOW DO I START IT AGAIN?', [
    'Stop: press Ctrl+C in the terminal where it is running. Start: run npm start in the stoinly-nexus folder.',
    'If the port is taken, start it on another one, for example PORT=5196 npm start (that is a separate website for saves, see above).',
  ]],
  ['IS ANY OF THIS REAL MONEY?', [
    'No. There is no real money anywhere: no purchases, no ads. The FREE MONEY is a joke from stoinly.computer.',
    'The bank said the account is full. That is also a joke. Probably.',
  ]],
];
