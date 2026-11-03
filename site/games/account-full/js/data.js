/* ACCOUNT FULL — data
   The 33 SERIES 1 cards as stoinly.computer defines them (number, name, role,
   lane, rarity, photo, focal point, credit), plus what each one does here.
   Numbers in this file are the whole balance of the game. */
(function (AF) {
  'use strict';

  const BOARD = { w: 1280, h: 720 };

  const RARITY = {
    common: { label: 'COMMON',     weight: 5 },
    rare:   { label: 'RARE',       weight: 3 },
    holo:   { label: 'HOLO',       weight: 2 },
    ultra:  { label: 'ULTRA HOLO', weight: 1 },
  };

  const LANES = {
    strong:  { label: 'STRONG WOMEN',   color: '#ff00ff', plate: '#f0f',    role: '#ffee00' },
    guest:   { label: 'SPECIAL GUESTS', color: '#00d455', plate: '#00913c', role: '#b8ffcf' },
    action:  { label: 'ACTION CARDS',   color: '#4d9fff', plate: '#0055e0', role: '#bfe0ff' },
    place:   { label: 'PLACES',         color: '#ff9500', plate: '#d86a00', role: '#ffe4bd' },
    vehicle: { label: 'VEHICLES',       color: '#ff4444', plate: '#c41f1f', role: '#ffd2d2' },
    stoinly: { label: '???',            color: '#ffd700', plate: '#ffd700', role: '#4d3800' },
  };

  // Economy
  const ECON = {
    roomMax: 500,              // dollars of room left in the account at the start
    packSize: 5,
    startGum: 4,
    // the first pack is free; after that the price of gum goes up two sticks per pack
    packCost(packsOpened) { return packsOpened === 0 ? 0 : 4 + 2 * (packsOpened - 1); },
    // trading a whole pack back should not pay more than the pack cost
    tradeValue:  { common: 0.5, rare: 0.5, holo: 1, ultra: 2 },
    tradeTier: 1,
    upgradeCost: { common: [3, 5], rare: [3, 6], holo: [4, 8], ultra: [10, 15] },
    // gum earned when a money entity is fully given away
    gumFor(kind, value) {
      if (kind === 'case')    return 1;
      if (kind === 'truck')   return 2;
      if (kind === 'bailout') return 5;
      return 0.05;
    },
    // gum paid at the end of every round
    roundBonus(round) { return 4 + Math.floor(round / 3); },
  };

  // Money. Speed is a multiplier on the base track speed.
  const MONEY = {
    baseSpeed: 70,             // px per second along the track
    kinds: {
      bill:    { label: 'BILL' },
      case:    { label: 'BRIEFCASE',     burst: { kind: 'bill', value: 100, n: 4, mods: ['strapped'] } },
      truck:   { label: 'ARMORED TRUCK', burst: { kind: 'case', value: 1500, n: 3 } },
      bailout: { label: 'THE BAILOUT',   burst: { kind: 'truck', value: 5000, n: 4 } },
    },
    speedFor(kind, value, mods) {
      let f;
      if (kind === 'case') f = 0.55;
      else if (kind === 'truck') f = 0.45;
      else if (kind === 'bailout') f = 0.34;
      else if (value < 5) f = 1.0;
      else if (value < 10) f = 0.95;
      else if (value < 20) f = 0.9;
      else if (value < 50) f = 0.85;
      else if (value < 100) f = 0.8;
      else f = 0.75;
      if (mods && mods.wire) f *= 2.2;
      return f;
    },
    mods: {
      check:    { label: 'CHECK',    blurb: 'Not money yet. Force does nothing to it. It has to be cashed: places and guests can.' },
      accruing: { label: 'ACCRUING', blurb: 'Money that makes money. Grows back 10% every 2.5 seconds until someone finishes it.' },
      crypto:   { label: 'CRYPTO',   blurb: 'Not real money. Most cards cannot see it; the ones that can say so. Rehab cleans it.' },
      strapped: { label: 'STRAPPED', blurb: 'A bank strap around it. Force does half.' },
      wire:     { label: 'WIRE',     blurb: 'A wire transfer. More than twice as fast.' },
    },
  };

  const PH = 'assets/photos/';

  // ---------------------------------------------------------------- cards
  // kind: tower (placed off the track), zone (a stretch of track),
  //       vehicle (patrols a stretch of track), action (played once)
  // dtype: force (strong women, vehicles), transaction (places), void (guests, ???)
  const CARDS = [
    // ---- STRONG WOMEN -------------------------------------------------
    { id: 'legally-strong', num: 1, name: 'THE MACHINE', role: 'IFBB PROFESSIONAL', cat: 'strong', rarity: 'rare',
      img: PH + 'g2_anna_kushkian.jpg', pos: '50% 4%', credit: 'PHOTO: Karenkushkyan / CC BY-SA 4.0 / WIKIMEDIA COMMONS',
      kind: 'tower', blurb: 'Reps. She does not stop.',
      tower: { range: 150, rate: 2.5, dmg: 3, dtype: 'force', target: 'first' },
      tiers: [
        { name: 'SUPERSET', blurb: 'Faster. No rest between sets.', set: { rate: 3.6 } },
        { name: 'PR DAY',   blurb: 'Twice the weight on the bar.',  set: { dmg: 6 } },
      ] },
    { id: 'the-original', num: 2, name: 'THE ORIGINAL', role: 'FOUNDING MOTHER · 1979', cat: 'strong', rarity: 'holo',
      img: PH + 'g3_kellie_everts.jpg', pos: '50% 20%', credit: 'PHOTO: Kellie Everts, 1979 / CC0 / WIKIMEDIA COMMONS',
      kind: 'tower', blurb: 'Strong women in her range hit harder and faster. She was strong before the computer existed.',
      tower: { range: 170, rate: 1.0, dmg: 6, dtype: 'force', target: 'first', auraRate: 0.25, auraDmg: 0.25, auraAll: false },
      tiers: [
        { name: '1979',            blurb: 'The aura grows.',                       set: { auraRate: 0.4, auraDmg: 0.4 } },
        { name: 'FOUNDING MOTHER', blurb: 'Every card standing in her range gets the aura, not only strong women.', set: { auraAll: true } },
      ] },
    { id: 'glamazons', num: 3, name: 'THE GLAMAZONS', role: 'TAG TEAM', cat: 'strong', rarity: 'rare',
      img: PH + 'g5_glamazons.jpg', pos: '62% 30%', credit: 'PHOTO: istolethetv / CC BY 2.0 / WIKIMEDIA COMMONS',
      kind: 'tower', blurb: 'Two of them. Every swing hits two different bills.',
      tower: { range: 140, rate: 1.6, dmg: 4, dtype: 'force', target: 'first', multi: 2 },
      tiers: [
        { name: 'HOT TAG',     blurb: 'Three targets a swing.', set: { multi: 3 } },
        { name: 'TITLE MATCH', blurb: 'Harder.',                set: { dmg: 7 } },
      ] },
    { id: 'purple-power', num: 4, name: 'PURPLE POWER PRINCESS', role: 'ROYALTY DIVISION', cat: 'strong', rarity: 'common',
      img: PH + 'g6_purple_power.jpg', pos: '20% 30%', credit: 'PHOTO: istolethetv / CC BY 2.0 / WIKIMEDIA COMMONS',
      kind: 'tower', blurb: 'Solid. Royal. No tricks.',
      tower: { range: 130, rate: 1.4, dmg: 4, dtype: 'force', target: 'first' },
      tiers: [
        { name: 'ROYALTY',      blurb: 'Sees further.',        set: { range: 165 } },
        { name: 'PURPLE REIGN', blurb: 'Harder and faster.',   set: { dmg: 7, rate: 1.8 } },
      ] },
    { id: 'professionally-strong', num: 5, name: 'QUEEN OF THE CIRCUIT', role: 'IFBB PROFESSIONAL', cat: 'strong', rarity: 'rare',
      img: PH + 'c7_dayana.jpg', pos: '50% 15%', credit: 'PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS (2007)',
      kind: 'tower', blurb: 'The circuit. Every hit jumps to bills nearby. Sees crypto: it is only electricity.',
      tower: { range: 150, rate: 0.9, dmg: 5, dtype: 'force', target: 'first', chain: 3, chainRange: 90, sees: true },
      tiers: [
        { name: 'SHORT CIRCUIT', blurb: 'Jumps to five.', set: { chain: 5 } },
        { name: 'FULL CIRCUIT',  blurb: 'Harder.',        set: { dmg: 9 } },
      ] },
    { id: 'the-bicep', num: 6, name: 'THE BICEP', role: 'BICEPS DEPARTMENT', cat: 'strong', rarity: 'holo',
      img: PH + 'c8_aleesha.jpg', pos: '50% 0%', credit: 'PHOTO: Fbbcraze / CC BY-SA 4.0 / WIKIMEDIA COMMONS',
      kind: 'tower', blurb: 'One curl. Enormous. Goes for the biggest money she can see.',
      tower: { range: 190, rate: 0.4, dmg: 40, dtype: 'force', target: 'strong' },
      tiers: [
        { name: 'CURL', blurb: 'Eighty.',                    set: { dmg: 80 } },
        { name: 'FLEX', blurb: 'One fifty. Slightly faster.', set: { dmg: 150, rate: 0.5 } },
      ] },

    // ---- SPECIAL GUESTS -----------------------------------------------
    { id: 'tim-cook', num: 7, name: 'TIMOTHY DONALD COOK', role: 'INVITED GUEST · CUPERTINO, CALIFORNIA', cat: 'guest', rarity: 'holo',
      img: PH + 'c13_tim.jpg', pos: '50% 10%', credit: 'PHOTO: Valery Marchive / CC BY-SA 2.0 / WIKIMEDIA COMMONS (2009)',
      kind: 'tower', blurb: 'Buyback. Converts a slice of the biggest money he can see into AAPL. He sees a long way, crypto included. He brought the computer.',
      tower: { range: 420, rate: 0.5, dmg: 0, pct: 0.08, pctMin: 10, dtype: 'void', target: 'strong', sees: true },
      tiers: [
        { name: 'SERVICES REVENUE',   blurb: 'A bigger slice.',           set: { pct: 0.12 } },
        { name: 'BRING THE COMPUTER', blurb: 'Bigger still, and faster.',  set: { pct: 0.16, rate: 0.7 } },
      ] },
    { id: 'tech-n9ne', num: 8, name: 'TECH N9NE', role: 'SPECIAL GUEST · KANSAS CITY, MISSOURI', cat: 'guest', rarity: 'holo',
      img: PH + 'c14_techn9ne.jpg', pos: '50% 25%', credit: 'PHOTO: Mizery Made / CC BY-SA 3.0 / WIKIMEDIA COMMONS (2006)',
      kind: 'tower', blurb: 'Chopper. Small hits, very many of them. Works on checks.',
      tower: { range: 140, rate: 7, dmg: 1.5, dtype: 'void', target: 'first' },
      tiers: [
        { name: 'SPEED OF SOUND', blurb: 'Faster.', set: { rate: 10 } },
        { name: 'STRANGE MUSIC',  blurb: 'Harder.', set: { dmg: 3 } },
      ] },
    { id: 'lil-wayne', num: 9, name: 'LIL WAYNE', role: 'SPECIAL GUEST · NEW ORLEANS, LOUISIANA', cat: 'guest', rarity: 'holo',
      img: PH + 'c15_lilwayne.jpg', pos: '50% 18%', credit: 'PHOTO: Ryan Dombal / CC BY-SA 2.0 / WIKIMEDIA COMMONS (2007)',
      kind: 'tower', blurb: 'Make it rain. Gives away a slice of a big bill and scatters the rest into smaller ones, back down the track. Small bills are everybody else’s problem.',
      tower: { range: 150, rate: 0.5, dmg: 0, dtype: 'void', target: 'strong', splitShare: 0.15, splitN: 3, splitPush: 60, splitMin: 10 },
      tiers: [
        { name: 'A MILLI',    blurb: 'A bigger slice, four pieces.', set: { splitShare: 0.25, splitN: 4 } },
        { name: 'CARTER III', blurb: 'Bigger, faster.',              set: { splitShare: 0.35, rate: 0.7 } },
      ] },
    { id: 'amazing-atheist', num: 10, name: 'THE AMAZING ATHEIST', role: 'SPECIAL GUEST · LOUISIANA', cat: 'guest', rarity: 'holo',
      img: PH + 'c22_tj.png', pos: '50% 30%', credit: 'PHOTO: DemonMama / CC BY 3.0 / WIKIMEDIA COMMONS (2021)',
      kind: 'tower', blurb: 'The rant. Money in range slows down to argue. Sees through crypto.',
      tower: { range: 150, rate: 1.0, dmg: 4, dtype: 'void', target: 'first', sees: true, slowAura: 0.65 },
      tiers: [
        { name: 'WELL, ACTUALLY', blurb: 'Slower still.',        set: { slowAura: 0.5 } },
        { name: 'DEBATE ME',      blurb: 'Harder, further.',     set: { dmg: 8, range: 180 } },
      ] },
    { id: 'weird-al', num: 11, name: 'WEIRD AL', role: 'SPECIAL GUEST · LYNWOOD, CALIFORNIA', cat: 'guest', rarity: 'holo',
      img: PH + 'c35_weirdal.jpg', pos: '50% 15%', credit: 'PHOTO: Maxamegalon2000 / CC BY-SA 3.0 / WIKIMEDIA COMMONS (2007)',
      kind: 'tower', blurb: 'Parody. Takes a percentage of whatever he hits, so the bigger the bill, the bigger the joke.',
      tower: { range: 150, rate: 0.8, dmg: 0, pct: 0.2, pctMin: 5, dtype: 'void', target: 'strong' },
      tiers: [
        { name: 'EAT IT', blurb: 'A bigger percentage.',      set: { pct: 0.28 } },
        { name: 'POLKA',  blurb: 'Bigger, and two at once.',  set: { pct: 0.36, multi: 2 } },
      ] },
    { id: 'yelawolf', num: 12, name: 'YELAWOLF', role: 'SPECIAL GUEST · GADSDEN, ALABAMA', cat: 'guest', rarity: 'holo',
      img: PH + 'c36_yela.jpg', pos: '50% 30%', credit: 'PHOTO: Dominick Brady / CC BY 2.0 / WIKIMEDIA COMMONS (2008)',
      kind: 'tower', blurb: 'Pop the trunk. Every few seconds every bill in range stops dead, and everything in range takes a hit.',
      tower: { range: 130, rate: 0, dmg: 6, dtype: 'void', target: 'first', pulseEvery: 3, pulseStun: 1.2 },
      tiers: [
        { name: 'SLUMERICAN',    blurb: 'Longer stops.',          set: { pulseStun: 1.8 } },
        { name: 'CATFISH BILLY', blurb: 'More often, harder.',    set: { pulseEvery: 2.2, dmg: 12 } },
      ] },

    // ---- ACTION CARDS -------------------------------------------------
    { id: 'touch-the-ceiling', num: 13, name: 'TOUCH THE CEILING', role: 'ACTION CARD · VERTICAL DIVISION', cat: 'action', rarity: 'rare',
      img: PH + 'c16_ceiling.jpg', pos: '50% 30%', credit: 'PHOTO: TonyTheTiger / CC BY-SA 3.0 / WIKIMEDIA COMMONS',
      kind: 'action', blurb: 'Raise the ceiling. $150 more room in the account, up to the limit. Works between rounds too.',
      action: { target: 'global', effect: 'room', amount: 150 } },
    { id: 'let-me-see-your-guy', num: 14, name: 'LET ME SEE YOUR GUY', role: 'ACTION CARD · VAPE DIPLOMACY', cat: 'action', rarity: 'common',
      img: PH + 'c17_guy.jpg', pos: '45% 50%', credit: 'PHOTO: Lindsay Fox, ecigarettereviewed.com / CC BY 3.0 / WIKIMEDIA COMMONS',
      kind: 'action', blurb: 'A cloud on the track. Money inside it moves at half speed for 15 seconds. Crypto too.',
      action: { target: 'track', effect: 'cloud', len: 140, dur: 15, slow: 0.5 } },
    { id: 'white-monster', num: 15, name: 'DRINK A MONSTER', role: 'ACTION CARD · ZERO SUGAR', cat: 'action', rarity: 'common',
      img: PH + 'c18_monster.jpg', pos: '60% 50%', credit: 'PHOTO: Perman6647 / CC0 / WIKIMEDIA COMMONS',
      kind: 'action', blurb: 'Everybody attacks 60% faster for 12 seconds, and vehicles drive faster. Zero sugar.',
      action: { target: 'global', effect: 'buff', stat: 'rate', mult: 1.6, dur: 12 } },
    { id: 'throw-in-a-lip', num: 16, name: 'THROW IN A LIP', role: 'ACTION CARD · WINTERGREEN DIVISION', cat: 'action', rarity: 'rare',
      img: PH + 'c19_lip.jpg', pos: '50% 22%', credit: 'PHOTO: U.S. MARINE CORPS / PUBLIC DOMAIN / WIKIMEDIA COMMONS',
      kind: 'action', blurb: 'Everybody hits 50% harder for 12 seconds. Wintergreen.',
      action: { target: 'global', effect: 'buff', stat: 'dmg', mult: 1.5, dur: 12 } },
    { id: 'lace-up-the-dcs', num: 17, name: 'LACE UP THE KICKS', role: 'ACTION CARD · FOOTWEAR DIVISION', cat: 'action', rarity: 'common',
      img: PH + 'c20_dcs.jpg', pos: '50% 45%', credit: 'PHOTO: Tking61 / CC0 / WIKIMEDIA COMMONS',
      kind: 'action', blurb: 'Run it back. Every bill on the board is kicked 12% of the way back to the mail. Big money, 6%.',
      action: { target: 'global', effect: 'pushback', frac: 0.12, bigFrac: 0.06 } },
    { id: 'smoke-the-jawn', num: 18, name: 'SMOKE THE JAWN', role: 'ACTION CARD · PHILADELPHIA DIVISION', cat: 'action', rarity: 'rare',
      img: PH + 'c21_jawn.jpg', pos: '52% 45%', credit: 'PHOTO: Elsa Olofsson / CC BY 2.0 / WIKIMEDIA COMMONS',
      kind: 'action', blurb: 'A cloud on the track. Bills that walk into it forget where they were going and walk backwards until the cloud clears, 8 seconds at most. Crypto too. Big money only slows down.',
      action: { target: 'track', effect: 'cloud', len: 120, dur: 8, reverse: true } },

    // ---- PLACES -------------------------------------------------------
    { id: 'white-hen', num: 19, name: 'WHITE HEN', role: 'PLACE CARD · CONVENIENCE DIVISION', cat: 'place', rarity: 'common',
      img: PH + 'c27_whitehen.jpg', pos: '50% 45%', credit: 'PHOTO: peretzpup / CC BY-SA 2.0 / FLICKR',
      kind: 'zone', blurb: 'A stretch of track. Every bill that walks in spends $4. Cashes checks.',
      zone: { len: 110, dtype: 'transaction', toll: 4, tollExit: false },
      tiers: [
        { name: 'SLURPEE',         blurb: '$8 at the door.',                 set: { toll: 8 } },
        { name: 'LOTTERY TICKETS', blurb: '$14 at the door, and again on the way out.', set: { toll: 14, tollExit: true } },
      ] },
    { id: 'the-swamp', num: 20, name: 'THE SWAMP', role: 'PLACE CARD · FORMERLY A POOL', cat: 'place', rarity: 'rare',
      img: PH + 'c28_swamp.jpg', pos: '50% 55%', credit: 'PHOTO: Ursus sapien / CC BY-SA 3.0 / WIKIMEDIA COMMONS',
      kind: 'zone', blurb: 'A stretch of track. Money wades through at 55% speed and comes out soggy: force tears it 25% easier for 6 seconds.',
      zone: { len: 150, dtype: 'transaction', slow: 0.55, soggy: 6 },
      tiers: [
        { name: 'DEEP END', blurb: 'Slower.',                               set: { slow: 0.4 } },
        { name: 'GATOR',    blurb: 'Soggy money also loses 25% more to places.', set: { soggyAll: true } },
      ] },
    { id: 'roulains-room', num: 21, name: 'ROULAIN’S ROOM', role: 'PLACE CARD · EXCHANGE PROGRAM', cat: 'place', rarity: 'holo',
      img: PH + 'c29_roulain.jpg', pos: '45% 45%', credit: 'PHOTO: hapinachu / CC BY-SA 2.0 / FLICKR (2006)',
      kind: 'zone', blurb: 'A stretch of track. The exchange rate is bad: every bill that walks in loses 18% of itself.',
      zone: { len: 100, dtype: 'transaction', pct: 0.18 },
      tiers: [
        { name: 'EXCHANGE RATE', blurb: '25%.',                    set: { pct: 0.25 } },
        { name: 'STUDY ABROAD',  blurb: '32%. Sees crypto.',       set: { pct: 0.32, sees: true } },
      ] },
    { id: 'open-crib', num: 22, name: 'OPEN CRIB', role: 'PLACE CARD · PARENTS OUT OF TOWN', cat: 'place', rarity: 'rare',
      img: PH + 'c30_crib.jpg', pos: '50% 45%', credit: 'PHOTO: Richard Eriksson / CC BY 2.0 / FLICKR',
      kind: 'zone', blurb: 'A stretch of track. Bills stop in for a second, and everything inside keeps spending the whole time.',
      zone: { len: 130, dtype: 'transaction', hold: 1.2, dotDmg: 2, dotEvery: 0.25 },
      tiers: [
        { name: 'HOUSE PARTY', blurb: 'Spends twice as fast.',   set: { dotDmg: 4 } },
        { name: 'COPS CAME',   blurb: 'Everybody stays longer.', set: { hold: 2.0 } },
      ] },
    { id: 'wrestling-practice', num: 23, name: 'WRESTLING MEET', role: 'PLACE CARD · ALL DAY SATURDAY', cat: 'place', rarity: 'common',
      img: PH + 'c31_wrestling.jpg', pos: '50% 55%', credit: 'PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS (2005)',
      kind: 'zone', blurb: 'A stretch of track. Every bill that walks in gets pinned for a second.',
      zone: { len: 90, dtype: 'transaction', hold: 1.0 },
      tiers: [
        { name: 'TAKEDOWN',         blurb: 'Pinned longer.',                     set: { hold: 1.5 } },
        { name: 'ALL DAY SATURDAY', blurb: 'Concessions: $5 at the door.', set: { toll: 5 } },
      ] },
    { id: 'rehab', num: 24, name: 'REHAB', role: 'PLACE CARD · 28 DAYS', cat: 'place', rarity: 'rare',
      img: PH + 'c37_rehab.jpg', pos: '55% 45%', credit: 'PHOTO: Randomgbear / CC BY-SA 3.0 / WIKIMEDIA COMMONS',
      kind: 'zone', blurb: 'A stretch of track. Bills are held for two seconds, and everything comes out clean: no crypto, no strap, no interest, and checks clear into cash.',
      zone: { len: 120, dtype: 'transaction', hold: 2.0, strip: true, sees: true },
      tiers: [
        { name: 'STEP ONE', blurb: 'Held longer.',                 set: { hold: 3.0 } },
        { name: '28 DAYS',  blurb: 'Everything leaves 20% of itself behind.', set: { pct: 0.2 } },
      ] },

    // ---- VEHICLES -----------------------------------------------------
    { id: 'grand-caravan', num: 25, name: 'THE GRAND CARAVAN', role: 'VEHICLE · MOM’S', cat: 'vehicle', rarity: 'common',
      img: PH + 'c32_caravan.jpg', pos: '48% 55%', credit: 'PHOTO: IFCAR / PUBLIC DOMAIN / WIKIMEDIA COMMONS',
      kind: 'vehicle', blurb: 'Patrols a long stretch of track and runs over everything on it. Seats seven.',
      vehicle: { seg: 260, speed: 120, dmg: 3, cd: 0.8, dtype: 'force' },
      tiers: [
        { name: 'STOW AND GO',   blurb: 'Harder.', set: { dmg: 6 } },
        { name: 'MOM’S DRIVING', blurb: 'Faster.', set: { speed: 170 } },
      ] },
    { id: 'tiburon', num: 26, name: 'HYUNDAI TIBURON', role: 'VEHICLE · BASICALLY A FERRARI', cat: 'vehicle', rarity: 'rare',
      img: PH + 'c33_tiburon.jpg', pos: '52% 50%', credit: 'PHOTO: IFCAR / PUBLIC DOMAIN / WIKIMEDIA COMMONS',
      kind: 'vehicle', blurb: 'Patrols a short stretch, fast, and hits hard.',
      vehicle: { seg: 180, speed: 260, dmg: 8, cd: 0.5, dtype: 'force' },
      tiers: [
        { name: 'SPOILER',             blurb: 'Harder.',          set: { dmg: 14 } },
        { name: 'BASICALLY A FERRARI', blurb: 'Faster, harder.',  set: { speed: 340, dmg: 20 } },
      ] },
    { id: 'the-huffy', num: 27, name: 'THE HUFFY', role: 'VEHICLE · BMX DIVISION', cat: 'vehicle', rarity: 'common',
      img: PH + 'c34_huffy.jpg', pos: '50% 45%', credit: 'PHOTO: Yubei9 / CC BY-SA 4.0 / WIKIMEDIA COMMONS',
      kind: 'vehicle', blurb: 'Patrols a short stretch. Small hits, no gas money.',
      vehicle: { seg: 160, speed: 150, dmg: 2, cd: 0.5, dtype: 'force' },
      tiers: [
        { name: 'PEGS',      blurb: 'Harder.', set: { dmg: 4 } },
        { name: 'BUNNY HOP', blurb: 'Faster.', set: { speed: 220 } },
      ] },
    { id: 'razor-scooter', num: 28, name: 'THE RAZOR', role: 'VEHICLE · ANKLE HAZARD', cat: 'vehicle', rarity: 'common',
      img: PH + 'c38_razor.jpg', pos: '45% 45%', credit: 'PHOTO: felixp7 / CC BY-SA 2.0 / FLICKR',
      kind: 'vehicle', blurb: 'Left lying on the track. Everything that walks over it takes a hit to the ankle.',
      vehicle: { stationary: true, len: 60, dmg: 3, cd: 2.0, dtype: 'force' },
      tiers: [
        { name: 'ANKLE HAZARD', blurb: 'Harder.',                   set: { dmg: 6 } },
        { name: 'SHIN HAZARD',  blurb: 'Harder, and bills stop to swear.', set: { dmg: 10, stun: 0.4 } },
      ] },
    { id: 'the-civic', num: 29, name: 'THE CIVIC', role: 'VEHICLE · FIRST CAR', cat: 'vehicle', rarity: 'common',
      img: PH + 'c39_civic.jpg', pos: '50% 50%', credit: 'PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS',
      kind: 'vehicle', blurb: 'Patrols a stretch of track. Reliable. Starts every time.',
      vehicle: { seg: 220, speed: 180, dmg: 4, cd: 0.6, dtype: 'force' },
      tiers: [
        { name: 'COLD AIR INTAKE', blurb: 'Faster.', set: { speed: 240 } },
        { name: 'FIRST CAR',       blurb: 'Harder.', set: { dmg: 8 } },
      ] },
    { id: 'school-bus', num: 30, name: 'THE SCHOOL BUS', role: 'VEHICLE · BACK SEATS', cat: 'vehicle', rarity: 'common',
      img: PH + 'c40_bus.jpg', pos: '50% 50%', credit: 'PHOTO: Rundvald / PUBLIC DOMAIN / WIKIMEDIA COMMONS (2007)',
      kind: 'vehicle', blurb: 'Patrols a long stretch, slowly. Every five seconds it stops, and every bill near it waits for the bus.',
      vehicle: { seg: 240, speed: 90, dmg: 2, cd: 1.0, dtype: 'force', stopEvery: 5, stopDur: 1.5, stopRadius: 60, stopDmg: 0 },
      tiers: [
        { name: 'BACK SEATS', blurb: 'Harder.',                             set: { dmg: 5 } },
        { name: 'FIELD TRIP', blurb: 'A bigger stop, and the stop costs $5.', set: { stopRadius: 100, stopDmg: 5 } },
      ] },

    // ---- ??? ----------------------------------------------------------
    { id: 'stoinly', num: 31, name: 'THE STOINLY', role: '???', cat: 'stoinly', rarity: 'ultra',
      img: PH + 'stoinly-moon.png', pos: '50% 50%', credit: 'ACTUAL PHOTOGRAPH OF THE STOINLY',
      kind: 'tower', blurb: 'The Stoinly, risen. Every six seconds, every dollar on the board gets 10% lighter (at least $2 off every bill), and every card hits 15% harder. Sees everything. There is only one: drop a second copy on the first and the Stoinly rises.',
      tower: { range: 9999, rate: 0, dmg: 0, dtype: 'void', target: 'first', sees: true, global: true, pulseEvery: 6, pulsePct: 0.1, pulseMin: 2, auraAll: true, auraDmg: 0.15, auraRate: 0, unique: true },
      tiers: [
        { name: 'RISEN',               blurb: 'Every five seconds, 15%.',       set: { pulseEvery: 5, pulsePct: 0.15 } },
        { name: 'THE STOINLY IS REAL', blurb: '20%, and every card hits 30% harder.', set: { pulsePct: 0.2, auraDmg: 0.3 } },
      ] },
    { id: 'financial-crisis', num: 32, name: 'THE 2008 FINANCIAL CRISIS', role: '??? · HISTORICAL EVENT · TOO BIG TO FAIL', cat: 'stoinly', rarity: 'ultra',
      img: PH + 'c26_crisis.jpg', pos: '50% 60%', credit: 'PHOTO: Robert Scoble / CC BY 2.0 / WIKIMEDIA COMMONS (SEP 15, 2008, 8:38 PM)',
      kind: 'action', blurb: 'The market crashes. Everything on the board, briefcases and trucks included, loses half its value at once.',
      action: { target: 'global', effect: 'crisis', frac: 0.5 } },
    { id: 'parents-divorce', num: 33, name: 'PARENTS’ DIVORCE', role: '??? · HISTORICAL EVENT · EVERY OTHER WEEKEND', cat: 'stoinly', rarity: 'ultra',
      img: PH + 'c41_divorce.jpg', pos: '45% 55%', credit: 'PHOTO: Artaxerxes / CC BY-SA 4.0 / WIKIMEDIA COMMONS',
      kind: 'action', blurb: 'Everything on the board goes back to the mail, and every bill is split into two half bills. Briefcases and trucks stay whole, but they go back too.',
      action: { target: 'global', effect: 'divorce' } },
  ];

  const CARD_BY_ID = {};
  CARDS.forEach(c => { CARD_BY_ID[c.id] = c; });

  // ---------------------------------------------------------------- waves
  // g(value, count, gap seconds, mods, kind). Groups play one after another;
  // `pause` is the wait after a group. Kinds: bill (default), case, truck, bailout.
  function g(v, n, gap, mods, kind, pause) {
    return { v, n, gap, mods: mods || [], kind: kind || 'bill', pause: pause == null ? 1.5 : pause };
  }
  const WAVES = [
    /* 1 */ [g(1, 12, 0.8)],
    /* 2 */ [g(1, 20, 0.5), g(5, 10, 0.8)],
    /* 3 */ [g(5, 20, 0.5), g(1, 24, 0.25)],
    /* 4 */ [g(1, 40, 0.2), g(5, 16, 0.5)],
    /* 5 */ [g(10, 24, 0.6), g(5, 24, 0.3)],
    /* 6 */ [g(5, 30, 0.3), g(10, 16, 0.5), g(10, 6, 0.9, ['check'])],
    /* 7 */ [g(10, 40, 0.4)],
    /* 8 */ [g(20, 24, 0.6), g(1, 40, 0.15)],
    /* 9 */ [g(20, 14, 0.8, ['accruing']), g(10, 24, 0.3)],
    /* 10 */ [g(20, 32, 0.4), g(20, 10, 0.6, ['check'])],
    /* 11 */ [g(50, 12, 0.9), g(10, 30, 0.25)],
    /* 12 */ [g(10, 16, 0.2, ['wire']), g(20, 24, 0.4)],
    /* 13 */ [g(50, 20, 0.6), g(20, 12, 0.5, ['check'])],
    /* 14 */ [g(20, 10, 0.6, ['crypto']), g(20, 30, 0.35)],
    /* 15 */ [g(1500, 1, 1, [], 'case', 3), g(20, 24, 0.35)],
    /* 16 */ [g(100, 18, 0.8), g(5, 40, 0.15)],
    /* 17 */ [g(50, 18, 0.5, ['strapped']), g(50, 18, 0.5, ['check'])],
    /* 18 */ [g(100, 24, 0.5), g(20, 16, 0.25, ['wire'])],
    /* 19 */ [g(1500, 2, 2.5, [], 'case', 3), g(50, 18, 0.45, ['accruing'])],
    /* 20 */ [g(20, 50, 0.2), g(30, 10, 0.6, ['crypto'])],
    /* 21 */ [g(100, 24, 0.45), g(100, 8, 0.7, ['check'])],
    /* 22 */ [g(1500, 3, 2.5, ['strapped'], 'case', 3), g(100, 14, 0.5)],
    /* 23 */ [g(5000, 1, 1, [], 'truck', 3), g(50, 16, 0.4)],
    /* 24 */ [g(100, 20, 0.5, ['accruing']), g(50, 20, 0.25, ['wire'])],
    /* 25 */ [g(1500, 4, 2.0, [], 'case', 3), g(100, 16, 0.4, ['crypto'])],
    /* 26 */ [g(5000, 2, 3.0, [], 'truck', 3), g(100, 24, 0.4)],
    /* 27 */ [g(100, 50, 0.22)],
    /* 28 */ [g(5000, 3, 2.5, [], 'truck', 3), g(1500, 6, 1.5, ['check'], 'case')],
    /* 29 */ [g(100, 24, 0.3, ['strapped', 'crypto']), g(5000, 2, 2.5, [], 'truck')],
    /* 30 */ [g(100, 24, 0.3, ['wire']), g(15000, 1, 1, [], 'bailout', 3), g(1500, 4, 1.5, ['strapped'], 'case')],
  ];

  // Round-start notices for the first appearance of each money type.
  const INTRO = {
    6: 'Checks from here on. A check is not money yet: force does nothing to it. Places and guests can cash it.',
    9: 'Accruing money grows back if you leave it alone.',
    12: 'Wire transfers are fast.',
    14: 'Crypto from here on. Most cards cannot see it. Rehab cleans it.',
    15: 'A briefcase. When it is emptied, four strapped hundreds fall out, and force does half to strapped money.',
    17: 'Strapped fifties and checks, side by side.',
    23: 'An armored truck. There are briefcases in it.',
    30: 'The bailout. Too big to fail. Stop it anyway.',
  };

  const COPY = {
    title: 'ACCOUNT FULL',
    subtitle: 'STOINLY TRADING CARDS · SERIES 1 · TOWER DEFENSE',
    premise: 'THE BANK SAID MY ACCOUNT IS FULL AND IF I DON’T GIVE THIS MONEY AWAY THEY’LL DELETE IT FOR FREE.',
    premiseBy: '— THE STOINLY',
    howto: [
      'Money comes out of the mail and walks to the account. The account is full: there is $500 of room left, and every dollar that gets in uses some of it. At zero, the bank deletes everything.',
      'Your cards give the money away before it gets there. A hit gives away part of a bill: a $20 that takes a $4 hit keeps walking as a $16.',
      'Strong women and vehicles use force. Places are stretches of track where money gets spent. Special guests do things that are not force. Action cards are played once, during a round. The ??? cards are the ??? cards.',
      'Every round pays gum, and so does every bill you finish. Gum rips packs of five cards, drawn at the same odds as the packs on stoinly.computer. The first pack is free and always has a strong woman in it. The next costs 4 sticks, and each one after that costs 2 more. The gum is not included.',
      'Drag a card from your hand onto the board, or tap it and then tap the board. Tap a placed card to upgrade it with gum, or to pick it back up between rounds. Drop a card on Trade in to swap it for gum.',
    ],
    lose: 'THE BANK DELETED IT.',
    loseSub: 'IT WAS FREE.',
    win: 'THE ACCOUNT IS STILL FULL.',
    winSub: 'THIRTY ROUNDS. THE MONEY IS STILL FREE. THE STOINLY IS REAL.',
    fine: 'A fan game built on the Series 1 card set from stoinly.computer. Every photograph is credited on its card. The gum was never real.',
  };

  AF.DATA = { BOARD, RARITY, LANES, ECON, MONEY, CARDS, CARD_BY_ID, WAVES, INTRO, COPY };
})(typeof window !== 'undefined' ? (window.AF = window.AF || {}) : (global.AF = global.AF || {}));
