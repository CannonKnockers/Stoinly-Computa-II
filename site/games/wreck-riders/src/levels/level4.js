/* Wreck Riders - level 4 "The Big Drop": a long descent through a night cave.
 * y is DOWN: the start (y=0) is the highest point; every section sits lower (larger y) and the finish is at the bottom.
 * Sections: steep slope -> patrolling saw -> wrecking-ball passage -> spinning beams -> glass wall -> spike-lined chute
 * -> saw -> the big drop (spikes at the foot of the cliff, landing slope, trampoline) -> lift across the chasm -> exit.
 * Ground y under each object is taken from the (smoothed) polylines below (checked with test/levelcheck.js). */
(function () {
  // chute: floor (120,19) -> (142,28); ceiling 3.6 m above the floor, lined with spikes
  const CH_K = 9 / 22, CH_A = Math.atan(CH_K);
  const ceil = (x) => 15.4 + (x - 120) * CH_K;
  WR.defineLevel({
    id: 'the-big-drop', name: 'The Big Drop', subtitle: 'Gravity is free. Brakes are optional. Mostly.', par: 70,
    theme: { skyTop: '#03050c', skyBottom: '#122038', ground: '#4b5667', grass: '#b9cdb4', accent: '#36e2ff', mood: 'night' },
    start: [4, 0], deathY: 47,
    ground: [
      WR.smooth([[-10, 0], [12, 0], [28, 9], [46, 9], [52, 12], [78, 12], [86, 16], [104, 16], [110, 19], [120, 19],
        [129, 22.68], [131, 22.9], [133, 24.32], [142, 28], [178, 28], [178, 30], [182, 30], [192, 34], [196, 34], [196, 34.2], [202, 34.2], [202, 34], [224, 34], [224, 44]], 4),
      WR.smooth([[240, 44], [240, 34.25], [248, 34.25], [268, 38.25], [312, 38.25]], 4),
    ],
    objects: [
      { t: 'sign', x: 7, y: 0, text: 'HOLD DOWN TO BRAKE' },
      // --- steep slope, then a saw that rises and falls at its foot ---
      { t: 'blade', x: 36, y: 8.1, r: 1.1, speed: 10, dy: -4.6, period: 3.2 },
      // --- narrow passage under a rock slab with a wrecking ball ---
      { t: 'sign', x: 43, y: 9, text: 'WAIT FOR THE SWING' },
      // low rock ceilings either side of a tall chamber; the ball only clears the road at the ends of its swing
      { t: 'platform', x: 57.5, y: 5.6, w: 5, h: 6, style: 'rock' },
      { t: 'platform', x: 76.5, y: 5.6, w: 5, h: 6, style: 'rock' },
      { t: 'platform', x: 67, y: 2, w: 14, h: 2, style: 'rock' },
      { t: 'wrecking', x: 67, y: 3, len: 6, r: 0.8, a: 1.0 },
      // --- spinning beams ---
      { t: 'sign', x: 89, y: 16, text: 'MIND THE BEAMS' },
      { t: 'rotator', x: 91, y: 12.4, len: 5, speed: -1.2 },
      { t: 'rotator', x: 100, y: 12.4, len: 5, speed: 1.2, a: 2.07 },
      // --- glass wall ---
      { t: 'glass', x: 115, y: 17.5, w: 0.3, h: 3 },
      // --- spike-lined chute ---
      { t: 'sign', x: 117, y: 19, text: 'LOW CEILING: NO HOPS' },
      { t: 'terrain', pts: [[122, ceil(122)], [140, ceil(140)]], fill: false, style: 'rock' },
      { t: 'platform', x: 131 + Math.sin(CH_A), y: ceil(131) - Math.cos(CH_A), w: 19.5, h: 2, a: CH_A, style: 'rock' },
      { t: 'spikes', x: 126, y: ceil(126), n: 8, a: Math.PI + CH_A },
      { t: 'spikes', x: 131.5, y: ceil(131.5), n: 8, a: Math.PI + CH_A },
      { t: 'spikes', x: 137, y: ceil(137), n: 8, a: Math.PI + CH_A },
      // --- a second saw at the foot of the chute ---
      { t: 'blade', x: 172, y: 27.1, r: 1.1, speed: 10, dy: -5.6, period: 4 },
      // --- the big drop: roll off too slowly and you land on the spikes at the foot of the cliff; land on the slope
      //     below it, or (too fast) on the trampoline at its foot ---
      { t: 'sign', x: 174, y: 28, text: 'THE BIG DROP' },
      { t: 'spikes', x: 179.2, y: 30, n: 7 },
      { t: 'tramp', x: 199, y: 34.2, w: 6, bounce: 0.6 },   // sunk 0.2 m into the floor: the mat is flush
      // --- the lift across the chasm ---
      { t: 'sign', x: 215, y: 34, text: 'WAIT FOR THE LIFT' },
      // The lift is a cradle: its floor sits 0.25 m below the near ledge, between a rear lip (flush with the near ledge
      // when docked) and a front gate that sinks into the floor as the lift crosses. Drive in while it is docked, drop
      // into the cradle, ride across, and drive out level onto the far ledge (0.25 m lower than the near one).
      { t: 'mover', x: 227, y: 34.5, w: 6, h: 0.5, dx: 12, dy: 0, period: 12 },
      { t: 'mover', x: 224.15, y: 34.375, w: 0.3, h: 0.75, dx: 12, dy: 0, period: 12 },
      { t: 'mover', x: 227.45, y: 34.375, w: 0.3, h: 0.75, dx: 12, dy: 0.35, period: 12 },
      // the lift door at the edge of the near ledge: a steel slab that rises out of the rock while the lift is away
      // and sinks just as it docks, so you can wait pressed against it
      { t: 'mover', x: 223.85, y: 35.7, w: 0.3, h: 3.2, dx: 0, dy: -3, period: 12 },
      // --- exit ---
      { t: 'sign', x: 245, y: 34.25, text: 'NEARLY OUT' },
      { t: 'finish', x: 280, y: 38.25 },
    ],
  });
})();
