/* Wreck Riders - level 2 "Harpoon Alley": a factory alley at dusk, watched by harpoon turrets.
 * y is DOWN (smaller y = higher). Turrets sit on short steel shelves (thin unfilled terrain lines with a slab drawn
 * under them) or on the yard floor, and shoot UP at riders coming over the roofs and ridges. Cover = dips in the
 * roof (the rim hides you) and glass panes (they block the line of fire until someone breaks them). */
WR.defineLevel({
  id: 'harpoon-alley', name: 'Harpoon Alley', subtitle: 'The night shift shoots first and asks no questions.', par: 55,
  theme: { skyTop: '#3b1f4f', skyBottom: '#f08a3c', ground: '#6b5d52', grass: '#8a7f73', accent: '#b5501d', mood: 'industrial' },
  start: [4, 0], deathY: 17,
  ground: [
    // start flat, ramp up onto the roof (y -5) with two cover dips, the long ramp down past turret T1's shelf,
    // the lower yard (y 4) and the seesaw pit (a pillar carries the pivot; a ledge holds the plank's near end level),
    // the far rim (y 5.6, it stops the plank at ~20 degrees) and the lift dock (a parking dip that catches a coasting rider)
    WR.smooth([[-10, 0], [14, 0], [28, -5], [31, -5], [35, -3.6], [37, -3.6], [41, -5], [44, -5], [48, -3.6], [50, -3.6],
      [54, -5], [56, -5], [65, -1.5], [73, 3], [80.4, 4]], 4)
      .concat([[80.4, 4.14], [81, 4.14], [81, 8], [84.6, 8], [84.6, 4.69], [85.4, 4.69], [85.4, 8], [89, 8], [89, 5.6]])
      .concat(WR.smooth([[89, 5.6], [92, 5.6], [103, 6.6], [106, 6.6], [110.5, 5.5], [114, 5.5]], 1.5).slice(1)),
    // after the lift gap: flat, the bumpy low tunnel, a climb onto the last ridge, the long ramp down to the finish yard
    WR.smooth([[122, 6.1], [123.6, 5.5], [128, 5.5], [134, 6.5], [141.5, 6.5], [143, 5.7], [144, 6.5], [149.5, 6.5], [151, 5.7], [152, 6.5], [157.5, 6.5],
      [159, 5.7], [160, 6.5], [166, 6.5]], 1.5)
      .concat(WR.smooth([[166, 6.5], [170, 6.5], [186, 2], [198, 2], [224, 10], [236, 10], [238, 13], [252, 13]], 4).slice(1)),
  ],
  objects: [
    { t: 'sign', x: 6, y: 0, text: 'HARPOONS! HIDE IN THE DIPS' },
    { t: 'sign', x: 11, y: 0, text: 'BOOST PADS = SPRINT' },
    // --- the roof: T1 watches it from a shelf beyond the ramp down; the second dip is in range but hides you ---
    { t: 'boost', x: 55, y: -5, a: 0, speed: 12 },
    { t: 'terrain', pts: [[80, 0], [86, 0]], fill: false, style: 'steel' },   // T1's shelf
    { t: 'platform', x: 83, y: 0.25, w: 6, h: 0.5 },
    { t: 'harpoon', x: 80.5, y: 0, dir: 'left', range: 36 },
    { t: 'platform', x: 79.4, y: 0.1, w: 1.2, h: 0.5 },   // T1's blast shield: the gun can't depress onto the ramp below its shelf
    // --- seesaw over the spike pit ---
    { t: 'sign', x: 80.2, y: 4, text: 'SLOW! SEESAW' },
    { t: 'spikes', x: 82.8, y: 8, n: 11 },
    { t: 'spikes', x: 87.2, y: 8, n: 11 },
    { t: 'seesaw', x: 85, y: 4.69, len: 9 },
    // --- the lift: a platform that rises flush with both rims every 10 s; ride across while it is up ---
    { t: 'sign', x: 91, y: 5.6, text: 'WAIT FOR THE LIFT' },
    { t: 'mover', x: 118, y: 5.7, w: 7.8, h: 0.4, dx: 0, dy: 4, period: 10 },
    // --- low tunnel: speed bumps throw fast riders into the ceiling spikes just past them ---
    { t: 'sign', x: 136, y: 6.5, text: 'LOW CEILING: CREEP' },
    { t: 'terrain', pts: [[141, 3.1], [167, 3.1]], fill: false, style: 'steel' },
    { t: 'platform', x: 154, y: 2.8, w: 26, h: 0.6 },
    { t: 'spikes', x: 147.6, y: 3.1, a: Math.PI, n: 16 },
    { t: 'spikes', x: 155.6, y: 3.1, a: Math.PI, n: 16 },
    { t: 'spikes', x: 163.6, y: 3.1, a: Math.PI, n: 16 },
    // --- final turret nest: T2 on a shelf over the ramp's foot, T3 in the bay past the finish; the pane is cover ---
    { t: 'sign', x: 175, y: 5.09, text: 'LAST NEST: FLOOR IT' },
    { t: 'glass', x: 190.5, y: 0.5, w: 0.3, h: 3 },
    { t: 'boost', x: 193, y: 2, a: 0, speed: 15 },
    { t: 'terrain', pts: [[222, 6], [228, 6]], fill: false, style: 'steel' },   // T2's shelf
    { t: 'platform', x: 225, y: 6.25, w: 6, h: 0.5 },
    { t: 'harpoon', x: 222.5, y: 6, dir: 'left' },
    { t: 'platform', x: 221.4, y: 6.1, w: 1.2, h: 0.5 },   // T2's blast shield: same, it only shoots up the ramp
    { t: 'harpoon', x: 242, y: 13, dir: 'left' },   // T3, sunk in the bay so it shoots up at the finish yard
    { t: 'finish', x: 234, y: 10 },
  ],
});
