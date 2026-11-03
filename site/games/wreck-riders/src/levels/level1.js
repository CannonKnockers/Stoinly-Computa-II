/* Wreck Riders - level 1 "Ward Nine": the introduction. Bright day on the hospital hill.
 * y is DOWN: the start (y=0) is the top of the hill, every later section sits lower (larger y).
 * Corners are rounded with WR.smooth; vertical steps (pit walls, the trampoline ledge) stay sharp on purpose. */
WR.defineLevel({
  id: 'ward-nine', name: 'Ward Nine', subtitle: 'Discharged early. It is all downhill from here.', par: 40,
  theme: { skyTop: '#4aa8f0', skyBottom: '#d9f1ff', ground: '#8b5a2b', grass: '#5cb85c', accent: '#ff8c1a', mood: 'day' },
  start: [4, 0], deathY: 16,
  ground: [
    // hilltop start, gentle downhill, run-up; the small gap (bottomless, 1.5 m) starts at x 50
    WR.smooth([[-12, 0], [20, 0], [34, 3.4], [50, 3.4]], 4),
    // landing, kicker lip, spike pit 1 (x 60..61.6), wrecking-ball flat, downhill to the glass
    WR.smooth([[51.5, 3.7], [56, 3.7], [60, 3.2], [60, 5], [61.6, 5], [61.6, 3.7], [82, 3.7], [94, 6.5], [106, 6.5],
      // 1.5 m ledge drop onto the trampoline floor, spike pit 2 (x 114..115.6), easy slope home
      [106, 8], [114, 8], [114, 10], [115.6, 10], [115.6, 8.5], [126.4, 8.5], [146.4, 11], [200, 11]], 3),
  ],
  objects: [
    // --- tutorial signs on the hilltop ---
    { t: 'sign', x: 7, y: 0, text: 'UP = GO' },
    { t: 'sign', x: 11, y: 0, text: 'LEFT / RIGHT = LEAN' },
    { t: 'sign', x: 15, y: 0, text: 'SPACE = ROCKET/HOP/BOUNCE' },
    { t: 'sign', x: 38, y: 3.4, text: 'Z = EJECT (NOT ADVISED)' },
    { t: 'sign', x: 46, y: 3.4, text: 'MIND THE GAP' },
    // --- spike pit 1 behind a kicker ---
    { t: 'sign', x: 54, y: 3.7, text: 'JUMP THE SPIKES' },
    { t: 'spikes', x: 60.8, y: 5, n: 5 },
    // --- wrecking ball under a gantry beam ---
    { t: 'sign', x: 66, y: 3.7, text: 'WAIT FOR THE SWING' },
    { t: 'platform', x: 74, y: -6.9, w: 8, h: 0.6 },
    { t: 'wrecking', x: 74, y: -6.6, len: 8, r: 0.7, a: 1.6 },
    // --- glass barrier at the bottom of the slope ---
    { t: 'sign', x: 78, y: 3.7, text: 'SMASH THROUGH' },
    { t: 'glass', x: 100, y: 5.6, w: 0.2, h: 1.8 },
    // --- ledge drop onto the trampoline, which throws you over spike pit 2 ---
    { t: 'sign', x: 103, y: 6.5, text: 'DROP ONTO THE TRAMPOLINE' },
    { t: 'tramp', x: 110, y: 8, w: 7, bounce: 1.0 },
    { t: 'spikes', x: 114.8, y: 10, n: 5 },
    // --- easy slope home, then a crate stack in front of the exit ---
    { t: 'sign', x: 121.4, y: 8.5, text: 'NEARLY THERE' },
    { t: 'sign', x: 155, y: 11, text: 'EXIT' },
    { t: 'crate', x: 159.48, y: 10.75, w: 0.5, h: 0.5, density: 2 },
    { t: 'crate', x: 160.0, y: 10.75, w: 0.5, h: 0.5, density: 2 },
    { t: 'crate', x: 160.52, y: 10.75, w: 0.5, h: 0.5, density: 2 },
    { t: 'crate', x: 159.74, y: 10.25, w: 0.5, h: 0.5, density: 2 },
    { t: 'crate', x: 160.26, y: 10.25, w: 0.5, h: 0.5, density: 2 },
    { t: 'crate', x: 160.0, y: 9.75, w: 0.5, h: 0.5, density: 2 },
    { t: 'finish', x: 170, y: 11 },
  ],
});
