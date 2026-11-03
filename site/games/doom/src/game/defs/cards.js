(function (ns) {
  'use strict';
  // cards.js (defs): the 33 SERIES 1 cards from stoinly.computer, generated from
  // ../data/cards/series1.json (names, role lines, lanes, rarities and photo credits). The photos themselves are baked
  // into the sprite sheets by tools/photos.py; credits show on the credits crawl.
  // The collection screen and the PULLED CARD messages read this table.

  ns.defs = ns.defs || {};
  ns.defs.cards = [
    { num: 1, name: "THE MACHINE", role: "IFBB PROFESSIONAL", lane: "strong", rarity: "rare", credit: "PHOTO: Karenkushkyan / CC BY-SA 4.0 / WIKIMEDIA COMMONS" },
    { num: 2, name: "THE ORIGINAL", role: "FOUNDING MOTHER \u00b7 1979", lane: "strong", rarity: "holo", credit: "PHOTO: Kellie Everts, 1979 / CC0 / WIKIMEDIA COMMONS" },
    { num: 3, name: "THE GLAMAZONS", role: "TAG TEAM", lane: "strong", rarity: "rare", credit: "PHOTO: istolethetv / CC BY 2.0 / WIKIMEDIA COMMONS" },
    { num: 4, name: "PURPLE POWER PRINCESS", role: "ROYALTY DIVISION", lane: "strong", rarity: "common", credit: "PHOTO: istolethetv / CC BY 2.0 / WIKIMEDIA COMMONS" },
    { num: 5, name: "QUEEN OF THE CIRCUIT", role: "IFBB PROFESSIONAL", lane: "strong", rarity: "rare", credit: "PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS (2007)" },
    { num: 6, name: "THE BICEP", role: "BICEPS DEPARTMENT", lane: "strong", rarity: "holo", credit: "PHOTO: Fbbcraze / CC BY-SA 4.0 / WIKIMEDIA COMMONS" },
    { num: 7, name: "TIMOTHY DONALD COOK", role: "INVITED GUEST \u00b7 CUPERTINO, CALIFORNIA", lane: "guest", rarity: "holo", credit: "PHOTO: Valery Marchive / CC BY-SA 2.0 / WIKIMEDIA COMMONS (2009)" },
    { num: 8, name: "TECH N9NE", role: "SPECIAL GUEST \u00b7 KANSAS CITY, MISSOURI", lane: "guest", rarity: "holo", credit: "PHOTO: Mizery Made / CC BY-SA 3.0 / WIKIMEDIA COMMONS (2006)" },
    { num: 9, name: "LIL WAYNE", role: "SPECIAL GUEST \u00b7 NEW ORLEANS, LOUISIANA", lane: "guest", rarity: "holo", credit: "PHOTO: Ryan Dombal / CC BY-SA 2.0 / WIKIMEDIA COMMONS (2007)" },
    { num: 10, name: "THE AMAZING ATHEIST", role: "SPECIAL GUEST \u00b7 LOUISIANA", lane: "guest", rarity: "holo", credit: "PHOTO: DemonMama / CC BY 3.0 / WIKIMEDIA COMMONS (2021)" },
    { num: 11, name: "WEIRD AL", role: "SPECIAL GUEST \u00b7 LYNWOOD, CALIFORNIA", lane: "guest", rarity: "holo", credit: "PHOTO: Maxamegalon2000 / CC BY-SA 3.0 / WIKIMEDIA COMMONS (2007)" },
    { num: 12, name: "YELAWOLF", role: "SPECIAL GUEST \u00b7 GADSDEN, ALABAMA", lane: "guest", rarity: "holo", credit: "PHOTO: Dominick Brady / CC BY 2.0 / WIKIMEDIA COMMONS (2008)" },
    { num: 13, name: "TOUCH THE CEILING", role: "ACTION CARD \u00b7 VERTICAL DIVISION", lane: "action", rarity: "rare", credit: "PHOTO: TonyTheTiger / CC BY-SA 3.0 / WIKIMEDIA COMMONS" },
    { num: 14, name: "LET ME SEE YOUR GUY", role: "ACTION CARD \u00b7 VAPE DIPLOMACY", lane: "action", rarity: "common", credit: "PHOTO: Lindsay Fox, ecigarettereviewed.com / CC BY 3.0 / WIKIMEDIA COMMONS" },
    { num: 15, name: "DRINK A MONSTER", role: "ACTION CARD \u00b7 ZERO SUGAR", lane: "action", rarity: "common", credit: "PHOTO: Perman6647 / CC0 / WIKIMEDIA COMMONS" },
    { num: 16, name: "THROW IN A LIP", role: "ACTION CARD \u00b7 WINTERGREEN DIVISION", lane: "action", rarity: "rare", credit: "PHOTO: U.S. MARINE CORPS / PUBLIC DOMAIN / WIKIMEDIA COMMONS" },
    { num: 17, name: "LACE UP THE KICKS", role: "ACTION CARD \u00b7 FOOTWEAR DIVISION", lane: "action", rarity: "common", credit: "PHOTO: Tking61 / CC0 / WIKIMEDIA COMMONS" },
    { num: 18, name: "SMOKE THE JAWN", role: "ACTION CARD \u00b7 PHILADELPHIA DIVISION", lane: "action", rarity: "rare", credit: "PHOTO: Elsa Olofsson / CC BY 2.0 / WIKIMEDIA COMMONS" },
    { num: 19, name: "WHITE HEN", role: "PLACE CARD \u00b7 CONVENIENCE DIVISION", lane: "place", rarity: "common", credit: "PHOTO: peretzpup / CC BY-SA 2.0 / FLICKR" },
    { num: 20, name: "THE SWAMP", role: "PLACE CARD \u00b7 FORMERLY A POOL", lane: "place", rarity: "rare", credit: "PHOTO: Ursus sapien / CC BY-SA 3.0 / WIKIMEDIA COMMONS" },
    { num: 21, name: "ROULAIN'S ROOM", role: "PLACE CARD \u00b7 EXCHANGE PROGRAM", lane: "place", rarity: "holo", credit: "PHOTO: hapinachu / CC BY-SA 2.0 / FLICKR (2006)" },
    { num: 22, name: "OPEN CRIB", role: "PLACE CARD \u00b7 PARENTS OUT OF TOWN", lane: "place", rarity: "rare", credit: "PHOTO: Richard Eriksson / CC BY 2.0 / FLICKR" },
    { num: 23, name: "WRESTLING MEET", role: "PLACE CARD \u00b7 ALL DAY SATURDAY", lane: "place", rarity: "common", credit: "PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS (2005)" },
    { num: 24, name: "REHAB", role: "PLACE CARD \u00b7 28 DAYS", lane: "place", rarity: "rare", credit: "PHOTO: Randomgbear / CC BY-SA 3.0 / WIKIMEDIA COMMONS" },
    { num: 25, name: "THE GRAND CARAVAN", role: "VEHICLE \u00b7 MOM'S", lane: "vehicle", rarity: "common", credit: "PHOTO: IFCAR / PUBLIC DOMAIN / WIKIMEDIA COMMONS" },
    { num: 26, name: "HYUNDAI TIBURON", role: "VEHICLE \u00b7 BASICALLY A FERRARI", lane: "vehicle", rarity: "rare", credit: "PHOTO: IFCAR / PUBLIC DOMAIN / WIKIMEDIA COMMONS" },
    { num: 27, name: "THE HUFFY", role: "VEHICLE \u00b7 BMX DIVISION", lane: "vehicle", rarity: "common", credit: "PHOTO: Yubei9 / CC BY-SA 4.0 / WIKIMEDIA COMMONS" },
    { num: 28, name: "THE RAZOR", role: "VEHICLE \u00b7 ANKLE HAZARD", lane: "vehicle", rarity: "common", credit: "PHOTO: felixp7 / CC BY-SA 2.0 / FLICKR" },
    { num: 29, name: "THE CIVIC", role: "VEHICLE \u00b7 FIRST CAR", lane: "vehicle", rarity: "common", credit: "PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS" },
    { num: 30, name: "THE SCHOOL BUS", role: "VEHICLE \u00b7 BACK SEATS", lane: "vehicle", rarity: "common", credit: "PHOTO: Rundvald / PUBLIC DOMAIN / WIKIMEDIA COMMONS (2007)" },
    { num: 31, name: "THE STOINLY", role: "???", lane: "stoinly", rarity: "ultra", credit: "ACTUAL PHOTOGRAPH OF THE STOINLY" },
    { num: 32, name: "THE 2008 FINANCIAL CRISIS", role: "??? \u00b7 HISTORICAL EVENT \u00b7 TOO BIG TO FAIL", lane: "stoinly", rarity: "ultra", credit: "PHOTO: Robert Scoble / CC BY 2.0 / WIKIMEDIA COMMONS (SEP 15, 2008, 8:38 PM)" },
    { num: 33, name: "PARENTS' DIVORCE", role: "??? \u00b7 HISTORICAL EVENT \u00b7 EVERY OTHER WEEKEND", lane: "stoinly", rarity: "ultra", credit: "PHOTO: Artaxerxes / CC BY-SA 4.0 / WIKIMEDIA COMMONS" }
  ];
  ns.defs.laneColors = {
    strong: { plate: 224 + 13, role: 112 + 14 },
    guest: { plate: 128 + 9, role: 128 + 13 },
    action: { plate: 176 + 9, role: 176 + 14 },
    place: { plate: 96 + 9, role: 96 + 14 },
    vehicle: { plate: 80 + 9, role: 80 + 13 },
    stoinly: { plate: 96 + 15, role: 48 + 4 }
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
