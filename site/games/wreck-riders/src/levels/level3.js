/* Wreck Riders - level 3 "Minefield Meadow". Day; a rolling green meadow that turns scorched towards the finish.
 * y is DOWN (smaller y = higher). Ground y under each object is taken from the polylines below. */
WR.defineLevel({
  id: 'minefield-meadow', name: 'Minefield Meadow', subtitle: 'Lovely day for a picnic. Mind your step.', par: 60,
  theme: { skyTop: '#5fb2f2', skyBottom: '#f3f0d8', ground: '#6e4a2c', grass: '#78c04e', accent: '#e8442a', mood: 'day' },
  start: [4, 0], deathY: 17,
  ground: [
    // start flat, slope down to the kicker lip, mine trench (sharp lip on purpose), crest mine, boost-pad flat,
    // glass, climb to the hilltop under the log shelf, downhill to the saw pit (no kicker, so loose logs roll into the pit)
    WR.smooth([[-10, 0], [14, 0], [21, 1.0], [22.5, 0.8]], 2).concat(
      [[23.3, 2.3], [25.4, 2.3]],
      WR.smooth([[26.4, 1.0], [29, 1.0], [32, 0.0], [35, 1.0], [52, 1.0], [62, 0.6],
        [80, -2.5], [84, -2.5], [99, 2.0], [107, 2.3]], 2)),
    // far side of the saw pit, then the trampoline pillars over the mine pit (vertical walls stay sharp on purpose;
    // each mat sits in a 0.2 m recess so its top is flush with the pillar),
    // the scorched hilltop, the van's downhill, run-out with crates, finish
    [[112, 14], [112, 3.0], [118, 3.0], [118, 7], [121, 7], [121, 3.4], [121.5, 3.4], [121.5, 3.6], [126.5, 3.6],
      [126.5, 3.4], [127, 3.4], [127, 7], [130, 7], [130, 3.8], [130.5, 3.8], [130.5, 4.0], [135.5, 4.0], [135.5, 3.8],
      [136, 3.8], [136, 7], [139, 7]].concat(
      WR.smooth([[139, 4.2], [150, 4.2], [181, 13], [193, 13], [203, 11.8], [231, 11.8]], 4)),
  ],
  objects: [
    { t: 'sign', x: 8, y: 0, text: 'MINES! HOP OVER THEM' },
    // --- mine meadow ---
    { t: 'mine', x: 24.35, y: 2.3 },
    { t: 'mine', x: 32, y: 0.25 },
    { t: 'boost', x: 44, y: 1.0, a: 0, speed: 16 },
    { t: 'mine', x: 43.4, y: 1.0 },
    { t: 'mine', x: 44.6, y: 1.0 },
    // --- log shelf ---
    { t: 'sign', x: 53, y: 0.954, text: 'LOGS! KEEP ROLLING' },
    { t: 'glass', x: 57.5, y: 0.28, w: 0.15, h: 1.0 },
    { t: 'platform', x: 84, y: -8.6, w: 6, h: 0.4, a: -0.45 },
    { t: 'ball', x: 82.32, y: -8.62, r: 0.55, triggerX: 58 },
    { t: 'ball', x: 84.57, y: -9.71, r: 0.55, triggerX: 58 },
    // --- saw pit ---
    { t: 'sign', x: 103, y: 2.15, text: 'TIME THE SAW' },
    { t: 'blade', x: 109.5, y: 6, r: 1.0, dy: -6.5, period: 2.6 },
    // --- trampoline chain over the mine pit: hop from pad to pad ---
    { t: 'sign', x: 115, y: 3.0, text: 'HOP PAD TO PAD' },
    { t: 'mine', x: 119, y: 7 },
    { t: 'mine', x: 120, y: 7 },
    { t: 'tramp', x: 124, y: 3.6, w: 5 },
    { t: 'mine', x: 128, y: 7 },
    { t: 'mine', x: 129, y: 7 },
    { t: 'tramp', x: 133, y: 4.0, w: 5 },
    { t: 'mine', x: 137, y: 7 },
    { t: 'mine', x: 138, y: 7 },
    // --- van drop and chase ---
    { t: 'platform', x: 151.4, y: 0.9, w: 3, h: 0.4 },
    { t: 'van', x: 155, y: 0.7, triggerX: 154 },
    { t: 'sign', x: 146, y: 4.2, text: 'RUN!' },
    // --- crates at the bottom of the hill: smash through before the van arrives ---
    { t: 'crate', x: 187, y: 12.55, w: 0.9, h: 0.9, density: 2 },
    { t: 'crate', x: 190, y: 12.55, w: 0.9, h: 0.9, density: 2 },
    { t: 'crate', x: 190, y: 11.75, w: 0.7, h: 0.7, density: 2 },
    { t: 'finish', x: 220, y: 11.8 },
  ],
});
