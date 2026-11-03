/* Wreck Riders - level 5 "The Gauntlet": the finale. Red industrial sky, dark steel ground.
 * y is DOWN (smaller y = higher). Every object's y is the ground height under it (see docs/ENGINE.md, "Level format").
 * Set pieces: (1) harpoon valleys with boost pads, (2) minefield troughs, (3) glass corridor into a wrecking-ball forest,
 * (4) blade pit crossed on two moving platforms, (5) seesaw launch over spikes onto a trampoline,
 * (6) a van dropped onto the final straight, (7) the last ramp jump over a spike pit to the finish. */
WR.defineLevel({
  id: 'the-gauntlet', name: 'The Gauntlet', subtitle: 'Everything at once. Nobody walks out of here.', par: 90,
  theme: { skyTop: '#3a0606', skyBottom: '#c2401c', ground: '#2b2f36', grass: '#5a616b', accent: '#e8261c', mood: 'industrial' },
  start: [5, 0], deathY: 20,
  ground: [
    // (1) harpoon gauntlet: each turret sits on the floor of a 2.5 m deep valley (x 34 and x 65) and fires up at you
    // as you reach the rim; a boost pad there throws its aim off and launches you across onto a landing slope
    WR.smooth([
      [-10, 0], [27, 0], [33, 2.5], [35, 2.5], [40, 0], [41, 0], [49, 2], [58, 2],
      [64, 4.5], [66, 4.5], [71, 2], [72, 2], [80, 4], [82, 4],
    ], 3),
    // (2) minefield: three steep-walled troughs 4 m across between 6 m crests; each crest is 0.5 m lower than the last
    WR.smooth([
      [82, 4], [92, 4], [93, 6.5], [95, 6.5], [96, 4.5], [102, 4.5], [103, 7], [105, 7], [106, 5], [112, 5], [113, 7.5], [115, 7.5], [116, 5.5],
      [120, 5.5],
    ], 0.6),
    // breather, downhill run into (3) the glass corridor and the wrecking-ball forest (y 7)
    WR.smooth([[120, 5.5], [132, 7], [194, 7]], 3),
    // (4) blade pit: lips at 194 and 207, floor at y 11
    [[194, 7], [194, 11], [207, 11], [207, 7]],
    [[207, 7], [226, 7]],
    // (5) spike pit under the seesaw launch (x 226..232.5, floor y 9), trampoline at 234.5
    [[226, 7], [226.2, 9], [232.3, 9], [232.5, 7]],
    WR.smooth([
      [232.5, 7], [248, 7],
      // (6) final straight, gently downhill; the van drops at x 260
      [268, 10], [272, 10],
      // (7) kicker up to the lip
      [278, 8.8],
    ], 2),
    [[278, 8.8], [278.2, 15.5], [289.8, 15.5], [290, 10.5]],
    [[290, 10.5], [304, 10.5]],
  ],
  objects: [
    { t: 'sign', x: 3, y: 0, text: 'THE GAUNTLET' },
    { t: 'sign', x: 12, y: 0, text: 'HIT THE PADS. DUCK.' },
    // (1) harpoon gauntlet: the turrets fire as you come within 20 m; a pad's sudden kick spoils their aim
    { t: 'boost', x: 22, y: 0, a: -0.7, speed: 17 },
    { t: 'harpoon', x: 34, y: 2.5, dir: 'left', range: 20, cooldown: 2.6, delay: 1.0 },
    { t: 'boost', x: 53, y: 2, a: -0.85, speed: 17 },
    { t: 'harpoon', x: 65, y: 4.5, dir: 'left', range: 20, cooldown: 2.6, delay: 1.0 },
    // (2) minefield
    { t: 'sign', x: 86, y: 4, text: 'JUMP CREST TO CREST' },
    { t: 'mine', x: 94, y: 6.5, radius: 4.5 },
    { t: 'mine', x: 104, y: 7, radius: 4.5 },
    { t: 'mine', x: 114, y: 7.5, radius: 4.5 },
    // (3) glass corridor under a steel ceiling, then the wrecking-ball forest under a gantry
    { t: 'sign', x: 117, y: 5.5, text: 'FULL SPEED' },
    { t: 'platform', x: 147, y: 2.6, w: 22, h: 0.4 },
    { t: 'glass', x: 141, y: 5.6, w: 0.25, h: 2.8 },
    { t: 'glass', x: 147, y: 5.6, w: 0.25, h: 2.8 },
    { t: 'glass', x: 153, y: 5.6, w: 0.25, h: 2.8 },
    { t: 'sign', x: 162, y: 7, text: 'TIME THE SWINGS' },
    { t: 'platform', x: 177, y: 0.7, w: 22, h: 0.6 },
    { t: 'wrecking', x: 170, y: 1.0, len: 3.3, r: 0.8, a: 1.3 },
    { t: 'wrecking', x: 177, y: 1.0, len: 3.3, r: 0.8, a: -1.1 },
    { t: 'wrecking', x: 184, y: 1.0, len: 3.3, r: 0.8, a: 0.8 },
    // (4) blade pit with two moving platforms
    { t: 'sign', x: 190, y: 7, text: 'RIDE THE PLATFORMS' },
    // the two lifts sink 0.8 m and come back every 3 s (the second 0.9 s behind the first); the saw in the slot between them rises and falls
    { t: 'mover', x: 197.45, y: 7.2, w: 5.9, h: 0.4, dx: 0, dy: 0.8, period: 3, phase: 1.5 },
    { t: 'mover', x: 203.55, y: 7.2, w: 5.9, h: 0.4, dx: 0, dy: 0.8, period: 3, phase: 0.6 },
    { t: 'blade', x: 200.5, y: 7.5, r: 1.0, speed: 12, dy: 1.6, period: 3 },
    { t: 'blade', x: 197.4, y: 10.2, r: 1.1, speed: 10 },
    { t: 'blade', x: 203.6, y: 10.2, r: 1.1, speed: -10 },
    // (5) seesaw launch over spikes onto the trampoline
    { t: 'sign', x: 215, y: 7, text: 'FAST UP THE SEESAW' },
    { t: 'ramp', x: 222.2, y: 7, pts: [[-1.4, 0], [0.85, 0], [0.85, -0.17]] },   // lip onto the plank's resting end
    { t: 'seesaw', x: 226, y: 7, len: 6, a: -0.2 },
    { t: 'spikes', x: 229.25, y: 9, n: 20 },
    { t: 'tramp', x: 234.5, y: 7, w: 4 },
    // (6) the van drop on the final straight
    { t: 'sign', x: 247, y: 7, text: 'DO NOT STOP' },
    { t: 'van', x: 260, y: 2, triggerX: 254 },
    // (7) the last jump
    { t: 'spikes', x: 284, y: 15.5, n: 38 },
    { t: 'sign', x: 295, y: 10.5, text: 'YOU MADE IT' },
    { t: 'finish', x: 298, y: 10.5 },
  ],
});
