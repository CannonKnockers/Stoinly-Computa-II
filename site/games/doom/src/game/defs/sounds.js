(function (ns) {
  'use strict';
  // sounds.js: STOINLY.defs.sounds, the named table of every sound effect as a synth
  // definition (src/core/synth.js) plus the mixer fields volume (0..1) and priority (Doom's
  // numbers: lower wins a channel when all are busy). Everything is 11025 Hz, bit crushed and
  // short, with a short feedback delay standing in for the ring of a small 1993 speaker.
  // The four generic monster voices (GROWL, RASP, HONK, CHIME) are reassigned by defs/monsters.js.

  ns.defs = ns.defs || {};

  // A delay this short is a comb filter: the boxy resonance of a small speaker cone.
  function speakerRing(seconds, feedback, mix) {
    return { time: seconds, feedback: feedback, mix: mix };
  }

  function sound(volume, priority, def) {
    def.volume = volume;
    def.priority = priority;
    return def;
  }

  const sounds = {};

  // Pistol fire: a dry crack and a quick thump, over before the hand has settled; the sound
  // of a toy cap gun recorded in a tin can.
  sounds.PISTOL = sound(1.0, 64, {
    seed: 'pistol',
    length: 0.3,
    gain: 0.9,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.015, 0.9], [0.06, 0.35], [0.18, 0.05], [0.26, 0]],
        lowpass: [[0, 5000], [0.03, 2500], [0.2, 500]], drive: 2.5, bitcrush: 6,
        delay: speakerRing(0.0021, 0.45, 0.4), gain: 0.8 },
      { type: 'sine', pitch: [[0, 260], [0.015, 110], [0.08, 55]],
        amp: [[0, 1], [0.03, 0.8], [0.1, 0.25], [0.18, 0]], drive: 2, gain: 0.7 },
      { type: 'square', pitch: [[0, 1500], [0.02, 300]], duty: 0.3,
        amp: [[0, 0.9], [0.025, 0.3], [0.04, 0]], bitcrush: 5, gain: 0.5 }
    ]
  });

  // Shotgun fire: a wide boom with a crack on the front and a long dull body, as if the room
  // itself took the hit.
  sounds.SHOTGUN = sound(1.0, 64, {
    seed: 'shotgun',
    length: 0.6,
    gain: 0.85,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.03, 1], [0.1, 0.55], [0.3, 0.15], [0.55, 0]],
        lowpass: [[0, 4500], [0.08, 1800], [0.5, 300]], drive: 3, bitcrush: 6,
        delay: speakerRing(0.0027, 0.5, 0.45), gain: 0.85 },
      { type: 'sine', pitch: [[0, 180], [0.03, 80], [0.25, 38]],
        amp: [[0, 1], [0.05, 0.9], [0.2, 0.4], [0.45, 0]], drive: 2.5, gain: 0.8 },
      { type: 'pink', amp: [[0, 0.8], [0.15, 0.4], [0.5, 0]], lowpass: 900, gain: 0.6 },
      { type: 'square', pitch: [[0, 900], [0.03, 150]], duty: 0.25,
        amp: [[0, 0.9], [0.04, 0.2], [0.06, 0]], bitcrush: 5, gain: 0.45 }
    ]
  });

  // Shotgun pump: two metal clacks, the slide back and the slide home, the second heavier.
  sounds.SHOTGUN_PUMP = sound(0.8, 64, {
    seed: 'pump',
    length: 0.5,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.012, 0.5], [0.05, 0]], lowpass: [[0, 3500], [0.04, 900]],
        bitcrush: 6, delay: speakerRing(0.0016, 0.6, 0.5), gain: 0.7 },
      { type: 'square', pitch: [[0, 700], [0.02, 250]], amp: [[0, 0.7], [0.03, 0]], bitcrush: 5, gain: 0.4 },
      { type: 'noise', start: 0.22, amp: [[0, 1], [0.015, 0.6], [0.08, 0]], lowpass: [[0, 3000], [0.06, 600]],
        bitcrush: 6, delay: speakerRing(0.0019, 0.6, 0.5), gain: 0.9 },
      { type: 'square', start: 0.22, pitch: [[0, 520], [0.025, 180]], amp: [[0, 0.8], [0.04, 0]], bitcrush: 5, gain: 0.5 },
      { type: 'sine', start: 0.22, pitch: [[0, 160], [0.03, 70]], amp: [[0, 0.8], [0.06, 0.3], [0.12, 0]], gain: 0.5 }
    ]
  });

  // Chaingun shot: one pistol crack trimmed to nothing but the snap so it can repeat every few tics.
  sounds.CHAINGUN = sound(1.0, 64, {
    seed: 'chaingun',
    length: 0.18,
    gain: 0.9,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.01, 0.8], [0.05, 0.3], [0.12, 0]], lowpass: [[0, 5000], [0.06, 1200]],
        drive: 3, bitcrush: 5, delay: speakerRing(0.0017, 0.4, 0.35), gain: 0.8 },
      { type: 'sine', pitch: [[0, 220], [0.02, 90]], amp: [[0, 1], [0.05, 0.4], [0.1, 0]], drive: 2, gain: 0.6 },
      { type: 'square', pitch: [[0, 1800], [0.015, 400]], duty: 0.2, amp: [[0, 0.8], [0.02, 0]], bitcrush: 5, gain: 0.4 }
    ]
  });

  // Rocket launch: an ignition cough, then the exhaust tearing away and fading down the hall.
  sounds.ROCKET_LAUNCH = sound(1.0, 64, {
    seed: 'rocket',
    length: 0.7,
    gain: 0.85,
    layers: [
      { type: 'noise', amp: [[0, 0.2], [0.08, 1], [0.3, 0.7], [0.65, 0]], lowpass: [[0, 300], [0.1, 3500], [0.6, 600]],
        drive: 2, bitcrush: 6, delay: speakerRing(0.003, 0.35, 0.3), gain: 0.8 },
      { type: 'pink', amp: [[0, 0.5], [0.1, 1], [0.4, 0.5], [0.65, 0]], lowpass: 250, gain: 0.8 },
      { type: 'saw', pitch: [[0, 80], [0.15, 160], [0.6, 60]], amp: [[0, 0.6], [0.2, 0.5], [0.6, 0]],
        lowpass: 500, drive: 2, gain: 0.4 }
    ]
  });

  // Rocket explosion: a slow, deep blast that keeps rumbling after the flash, the biggest
  // thing a small speaker can be asked to do.
  sounds.ROCKET_EXPLODE = sound(1.0, 60, {
    seed: 'explode',
    length: 1.1,
    gain: 0.8,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.05, 1], [0.3, 0.5], [0.7, 0.15], [1.0, 0]],
        lowpass: [[0, 4000], [0.15, 1200], [0.9, 150]], drive: 3.5, bitcrush: 5,
        delay: speakerRing(0.0035, 0.5, 0.4), gain: 0.9 },
      { type: 'sine', pitch: [[0, 150], [0.05, 60], [0.4, 28]], amp: [[0, 1], [0.1, 0.9], [0.5, 0.4], [0.9, 0]],
        drive: 3, gain: 0.9 },
      { type: 'pink', amp: [[0, 0.9], [0.4, 0.6], [1.0, 0]], lowpass: 400, gain: 0.7 }
    ]
  });

  // Plasma shot: an electric chirp that drops fast and sizzles out; a bug zapper with ambition.
  sounds.PLASMA = sound(0.9, 64, {
    seed: 'plasma',
    length: 0.25,
    gain: 0.9,
    layers: [
      { type: 'square', pitch: [[0, 1900], [0.03, 900], [0.1, 420], [0.2, 380]], duty: [[0, 0.5], [0.15, 0.1]],
        amp: [[0, 1], [0.06, 0.8], [0.2, 0.15], [0.24, 0]], lowpass: 3500, bitcrush: 6,
        delay: speakerRing(0.0025, 0.4, 0.3), gain: 0.6 },
      { type: 'sine', pitch: [[0, 300], [0.05, 1400], [0.2, 900]], amp: [[0, 0.7], [0.12, 0.3], [0.22, 0]], gain: 0.4 },
      { type: 'noise', amp: [[0, 0.6], [0.03, 0.2], [0.1, 0]], lowpass: 3000, highpass: 800, gain: 0.4 }
    ]
  });

  // BFG charge: a rising, thickening whine with the hiss building behind it, a capacitor
  // bank filling past the point where it ought to stop.
  sounds.BFG_CHARGE = sound(1.0, 64, {
    seed: 'bfgcharge',
    length: 1.0,
    gain: 0.9,
    layers: [
      { type: 'saw', pitch: [[0, 70], [0.9, 520]], vibrato: { rate: 9, depth: 0.5 },
        amp: [[0, 0.2], [0.4, 0.8], [0.9, 1], [1.0, 0]], lowpass: [[0, 400], [0.9, 3000]], drive: 2, bitcrush: 6, gain: 0.5 },
      { type: 'square', pitch: [[0, 105], [0.9, 780]], duty: [[0, 0.5], [0.9, 0.1]],
        amp: [[0, 0.1], [0.6, 0.6], [0.9, 0.8], [1.0, 0]], lowpass: [[0, 500], [0.9, 3000]], gain: 0.35 },
      { type: 'noise', amp: [[0, 0], [0.7, 0.3], [0.95, 0.6], [1.0, 0]], lowpass: [[0, 500], [1.0, 4000]], gain: 0.4 }
    ]
  });

  // BFG discharge: the charge let go all at once, a blast with a long electric decay that
  // sits below everything else in the mix.
  sounds.BFG_FIRE = sound(1.0, 60, {
    seed: 'bfgfire',
    length: 1.4,
    gain: 0.75,
    layers: [
      { type: 'square', pitch: [[0, 320], [0.08, 70], [0.6, 30]], amp: [[0, 1], [0.3, 0.8], [0.9, 0.3], [1.3, 0]],
        lowpass: [[0, 2500], [0.5, 500]], drive: 3, bitcrush: 5, delay: speakerRing(0.0045, 0.55, 0.5), gain: 0.7 },
      { type: 'noise', amp: [[0, 1], [0.1, 0.9], [0.6, 0.4], [1.3, 0]], lowpass: [[0, 4500], [0.4, 900], [1.3, 150]],
        drive: 3, bitcrush: 5, gain: 0.8 },
      { type: 'pink', amp: [[0, 0.7], [0.5, 0.8], [1.3, 0]], lowpass: 300, gain: 0.8 },
      { type: 'sine', pitch: [[0, 90], [0.3, 35]], amp: [[0, 1], [0.6, 0.6], [1.2, 0]], gain: 0.8 }
    ]
  });

  // Punch whiff: a fist swung through air, a breathy swoosh that rises and is gone.
  sounds.PUNCH_WHIFF = sound(0.6, 64, {
    seed: 'whiff',
    length: 0.18,
    layers: [
      { type: 'noise', amp: [[0, 0.2], [0.04, 1], [0.1, 0.5], [0.17, 0]],
        lowpass: [[0, 800], [0.04, 2800], [0.17, 600]], highpass: 300, bitcrush: 6, gain: 0.9 }
    ]
  });

  // Punch hit: a fist landing on something heavy; a dull thud with a little snap on top.
  sounds.PUNCH_HIT = sound(0.9, 64, {
    seed: 'punch',
    length: 0.22,
    layers: [
      { type: 'sine', pitch: [[0, 170], [0.02, 70], [0.1, 45]], amp: [[0, 1], [0.04, 0.7], [0.15, 0]], drive: 3, gain: 0.9 },
      { type: 'noise', amp: [[0, 1], [0.015, 0.4], [0.06, 0]], lowpass: 1400, bitcrush: 6,
        delay: speakerRing(0.002, 0.4, 0.3), gain: 0.6 }
    ]
  });

  // Bullet puff: a bullet biting a wall, a sharp little tick of grit and plaster.
  sounds.BULLET_PUFF = sound(0.5, 120, {
    seed: 'puff',
    length: 0.09,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.008, 0.7], [0.04, 0.15], [0.08, 0]], lowpass: [[0, 5000], [0.05, 1500]],
        highpass: 600, bitcrush: 5, delay: speakerRing(0.0012, 0.5, 0.4), gain: 0.8 },
      { type: 'square', pitch: [[0, 2400], [0.01, 900]], amp: [[0, 0.6], [0.012, 0]], gain: 0.5 }
    ]
  });

  // Door open: a grinding motor rattles for half a second and the door bangs home at the top.
  sounds.DOOR_OPEN = sound(0.9, 100, {
    seed: 'dooropen',
    length: 0.8,
    layers: [
      { type: 'square', freq: 48, duty: [[0, 0.3], [0.55, 0.45]], vibrato: { rate: 22, depth: 0.6 },
        amp: [[0, 0], [0.03, 0.8], [0.5, 0.8], [0.56, 0]], lowpass: 500, drive: 2, bitcrush: 6, gain: 0.45 },
      { type: 'noise', amp: [[0, 0], [0.03, 0.5], [0.5, 0.5], [0.56, 0]], lowpass: 700, highpass: 150, bitcrush: 6,
        delay: speakerRing(0.012, 0.5, 0.4), gain: 0.35 },
      { type: 'sine', start: 0.56, pitch: [[0, 110], [0.03, 55]], amp: [[0, 1], [0.06, 0.5], [0.2, 0]], drive: 2, gain: 0.8 },
      { type: 'noise', start: 0.56, amp: [[0, 0.8], [0.03, 0.2], [0.08, 0]], lowpass: 1200, gain: 0.5 }
    ]
  });

  // Door close: the same motor sagging in pitch as it lowers, then a heavier bang on the floor.
  sounds.DOOR_CLOSE = sound(0.9, 100, {
    seed: 'doorclose',
    length: 0.8,
    layers: [
      { type: 'square', pitch: [[0, 52], [0.55, 44]], duty: [[0, 0.45], [0.55, 0.3]], vibrato: { rate: 22, depth: 0.6 },
        amp: [[0, 0], [0.03, 0.8], [0.5, 0.8], [0.56, 0]], lowpass: 500, drive: 2, bitcrush: 6, gain: 0.45 },
      { type: 'noise', amp: [[0, 0], [0.03, 0.5], [0.5, 0.5], [0.56, 0]], lowpass: 700, highpass: 150, bitcrush: 6,
        delay: speakerRing(0.012, 0.5, 0.4), gain: 0.35 },
      { type: 'sine', start: 0.56, pitch: [[0, 90], [0.04, 40]], amp: [[0, 1], [0.08, 0.6], [0.24, 0]], drive: 2.5, gain: 0.9 },
      { type: 'noise', start: 0.56, amp: [[0, 1], [0.04, 0.3], [0.12, 0]], lowpass: 900, bitcrush: 6,
        delay: speakerRing(0.004, 0.5, 0.4), gain: 0.55 }
    ]
  });

  // Switch click: a tick as the lever gives and a tock as it seats, a light switch the size of a hand.
  sounds.SWITCH = sound(0.8, 78, {
    seed: 'switch',
    length: 0.16,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.006, 0.3], [0.03, 0]], lowpass: 3500, bitcrush: 5, gain: 0.7 },
      { type: 'square', pitch: [[0, 1100], [0.015, 500]], amp: [[0, 0.8], [0.02, 0]], gain: 0.4 },
      { type: 'noise', start: 0.07, amp: [[0, 1], [0.01, 0.4], [0.06, 0]], lowpass: 1800, bitcrush: 5,
        delay: speakerRing(0.003, 0.5, 0.4), gain: 0.8 },
      { type: 'square', start: 0.07, pitch: [[0, 500], [0.02, 220]], amp: [[0, 0.8], [0.03, 0]], gain: 0.5 }
    ]
  });

  // Item pickup: a bright two-note blip going up, the cheerful bleep of a thing added to a counter.
  sounds.ITEM_PICKUP = sound(0.8, 78, {
    seed: 'itemup',
    length: 0.12,
    layers: [
      { type: 'square', pitch: [[0, 1050], [0.03, 1050], [0.035, 1580], [0.12, 1580]],
        amp: [[0, 0.9], [0.03, 0.8], [0.035, 0.9], [0.08, 0.5], [0.11, 0]], bitcrush: 6, gain: 0.7 },
      { type: 'sine', pitch: [[0, 2100], [0.03, 2100], [0.035, 3160], [0.12, 3160]],
        amp: [[0, 0.4], [0.08, 0.2], [0.11, 0]], gain: 0.4 }
    ]
  });

  // Weapon pickup: a longer rising arpeggio with a shimmer on top, a fanfare for a new gun.
  sounds.WEAPON_PICKUP = sound(0.9, 78, {
    seed: 'weaponup',
    length: 0.45,
    layers: [
      { type: 'square', pitch: [[0, 330], [0.1, 330], [0.1, 440], [0.2, 440], [0.2, 554], [0.3, 554], [0.3, 660], [0.45, 660]],
        duty: 0.3, amp: [[0, 1], [0.09, 0.5], [0.1, 1], [0.19, 0.5], [0.2, 1], [0.29, 0.5], [0.3, 1], [0.42, 0.4], [0.45, 0]],
        lowpass: 3500, bitcrush: 6, delay: speakerRing(0.0025, 0.4, 0.3), gain: 0.6 },
      { type: 'sine', pitch: [[0, 1320], [0.1, 1320], [0.1, 1760], [0.2, 1760], [0.2, 2217], [0.3, 2217], [0.3, 2640], [0.45, 2640]],
        amp: [[0, 0.5], [0.09, 0.2], [0.1, 0.5], [0.19, 0.2], [0.2, 0.5], [0.29, 0.2], [0.3, 0.5], [0.42, 0.15], [0.45, 0]], gain: 0.35 }
    ]
  });

  // Key pickup: two glassy chime notes, a little ceremony for a thing that opens a door.
  sounds.KEY_PICKUP = sound(0.9, 78, {
    seed: 'keyup',
    length: 0.4,
    layers: [
      { type: 'tri', freq: 1047, amp: [[0, 1], [0.1, 0.5], [0.3, 0.15], [0.4, 0]], bitcrush: 7, gain: 0.5 },
      { type: 'sine', freq: 2512, amp: [[0, 0.6], [0.05, 0.2], [0.15, 0]], gain: 0.3 },
      { type: 'tri', start: 0.12, freq: 1568, amp: [[0, 1], [0.1, 0.5], [0.25, 0.1], [0.28, 0]], bitcrush: 7, gain: 0.5 },
      { type: 'sine', start: 0.12, freq: 3763, amp: [[0, 0.5], [0.05, 0.15], [0.12, 0]], gain: 0.25 }
    ]
  });

  // Powerup hum: two detuned drones beat against each other and swell, with a rising shimmer
  // above, the throb of something charging the body.
  sounds.POWERUP = sound(0.9, 60, {
    seed: 'powerup',
    length: 1.0,
    layers: [
      { type: 'square', freq: 110, vibrato: { rate: 5, depth: 0.3 }, duty: [[0, 0.5], [1.0, 0.2]],
        amp: [[0, 0], [0.3, 0.8], [0.7, 0.8], [1.0, 0]], lowpass: [[0, 300], [0.5, 1200], [1.0, 300]], drive: 1.5, bitcrush: 6, gain: 0.5 },
      { type: 'square', freq: 112.5, amp: [[0, 0], [0.3, 0.8], [0.7, 0.8], [1.0, 0]],
        lowpass: [[0, 300], [0.5, 1200], [1.0, 300]], bitcrush: 6, gain: 0.35 },
      { type: 'sine', pitch: [[0, 220], [1.0, 440]], amp: [[0, 0], [0.4, 0.5], [0.8, 0.5], [1.0, 0]], gain: 0.3 }
    ]
  });

  // Teleport: a rush of air that opens bright and closes dark, with a tone falling away
  // underneath it as the floor goes.
  sounds.TELEPORT = sound(1.0, 32, {
    seed: 'teleport',
    length: 1.0,
    gain: 0.9,
    layers: [
      { type: 'noise', amp: [[0, 0], [0.05, 1], [0.3, 0.7], [0.95, 0]], lowpass: [[0, 5000], [0.1, 3500], [0.9, 200]],
        highpass: [[0, 1000], [0.9, 80]], drive: 2, bitcrush: 6, delay: speakerRing(0.004, 0.5, 0.4), gain: 0.8 },
      { type: 'saw', pitch: [[0, 900], [0.2, 700], [0.95, 55]], vibrato: { rate: 12, depth: 0.5 },
        amp: [[0, 0.3], [0.15, 0.8], [0.6, 0.5], [0.95, 0]], lowpass: [[0, 3000], [0.95, 300]], bitcrush: 6, gain: 0.45 },
      { type: 'sine', pitch: [[0, 60], [0.9, 30]], amp: [[0, 0], [0.1, 0.7], [0.6, 0.6], [0.95, 0]], gain: 0.6 }
    ]
  });

  // Player pain: no voice, just the body taking it; a thud with a burst of static.
  sounds.PLAYER_PAIN = sound(1.0, 96, {
    seed: 'plpain',
    length: 0.28,
    layers: [
      { type: 'sine', pitch: [[0, 200], [0.02, 80], [0.1, 50]], amp: [[0, 1], [0.04, 0.7], [0.18, 0]], drive: 3, gain: 0.9 },
      { type: 'noise', amp: [[0, 1], [0.02, 0.5], [0.12, 0]], lowpass: [[0, 2500], [0.12, 400]], bitcrush: 5,
        delay: speakerRing(0.0022, 0.45, 0.4), gain: 0.6 }
    ]
  });

  // Player death: a longer, lower thud and a tone that falls and wavers out; the lights going down.
  sounds.PLAYER_DEATH = sound(1.0, 32, {
    seed: 'pldeath',
    length: 1.1,
    layers: [
      { type: 'sine', pitch: [[0, 140], [0.05, 55], [0.4, 28]], amp: [[0, 1], [0.1, 0.8], [0.5, 0.4], [0.9, 0]], drive: 3, gain: 0.9 },
      { type: 'saw', pitch: [[0, 420], [0.3, 260], [1.0, 45]], vibrato: { rate: 7, depth: 0.4 },
        amp: [[0, 0], [0.05, 0.6], [0.5, 0.45], [1.0, 0]], lowpass: [[0, 2000], [1.0, 250]], bitcrush: 6,
        delay: { time: 0.09, feedback: 0.3, mix: 0.3 }, gain: 0.35 },
      { type: 'noise', amp: [[0, 0.9], [0.05, 0.5], [0.3, 0.2], [0.8, 0]], lowpass: [[0, 2000], [0.6, 300]], bitcrush: 5, gain: 0.5 }
    ]
  });

  // Menu move: the smallest blip, a cursor stepping one line.
  sounds.MENU_MOVE = sound(0.7, 78, {
    seed: 'menumove',
    length: 0.06,
    layers: [
      { type: 'square', freq: 620, amp: [[0, 0.9], [0.03, 0.8], [0.05, 0]], bitcrush: 6, gain: 0.8 }
    ]
  });

  // Menu select: two blips stepping up, a yes.
  sounds.MENU_SELECT = sound(0.8, 78, {
    seed: 'menuselect',
    length: 0.14,
    layers: [
      { type: 'square', pitch: [[0, 620], [0.05, 620], [0.055, 930], [0.14, 930]],
        amp: [[0, 0.9], [0.045, 0.8], [0.05, 0.3], [0.055, 0.9], [0.11, 0.7], [0.14, 0]], bitcrush: 6, gain: 0.8 }
    ]
  });

  // Menu back: two blips stepping down, a no.
  sounds.MENU_BACK = sound(0.7, 78, {
    seed: 'menuback',
    length: 0.12,
    layers: [
      { type: 'square', pitch: [[0, 930], [0.03, 930], [0.035, 500], [0.12, 500]],
        amp: [[0, 0.9], [0.03, 0.8], [0.035, 0.9], [0.09, 0.5], [0.12, 0]], bitcrush: 6, gain: 0.75 }
    ]
  });

  // Intermission counter tick: a dry click for every few percent, fast enough to become a ratchet.
  sounds.COUNT_TICK = sound(0.6, 64, {
    seed: 'tick',
    length: 0.05,
    layers: [
      { type: 'square', freq: 1100, amp: [[0, 0.9], [0.015, 0.6], [0.035, 0]], bitcrush: 5, gain: 0.8 },
      { type: 'noise', amp: [[0, 0.7], [0.005, 0.2], [0.015, 0]], lowpass: 4000, gain: 0.4 }
    ]
  });

  // Intermission pause: the counter stopping with a low thunk and a short tone, a stamp on a total.
  sounds.COUNT_PAUSE = sound(0.8, 60, {
    seed: 'countpause',
    length: 0.3,
    layers: [
      { type: 'sine', pitch: [[0, 320], [0.03, 120], [0.15, 80]], amp: [[0, 1], [0.06, 0.6], [0.25, 0]], drive: 2, gain: 0.8 },
      { type: 'square', pitch: [[0, 440], [0.1, 330]], amp: [[0, 0.6], [0.12, 0.3], [0.25, 0]], lowpass: 1500, bitcrush: 6, gain: 0.4 }
    ]
  });

  // Level exit: a heavy switch thrown and a plate ringing after it, the sound of a level being closed.
  sounds.LEVEL_EXIT = sound(1.0, 60, {
    seed: 'exit',
    length: 0.5,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.01, 0.5], [0.08, 0.1], [0.15, 0]], lowpass: [[0, 3500], [0.1, 700]], bitcrush: 5,
        delay: speakerRing(0.0035, 0.6, 0.5), gain: 0.8 },
      { type: 'sine', pitch: [[0, 140], [0.04, 60], [0.3, 40]], amp: [[0, 1], [0.1, 0.6], [0.45, 0]], drive: 2.5, gain: 0.9 },
      { type: 'square', pitch: [[0, 380], [0.48, 340]], amp: [[0, 0], [0.02, 0.5], [0.3, 0.15], [0.48, 0]], lowpass: 1200,
        delay: speakerRing(0.0029, 0.6, 0.5), gain: 0.3 }
    ]
  });

  // GROWL: a low throat voice, a saw buried under a lowpass with a slow wobble and breath
  // behind it. Something large and unhurried.
  function growl(seed, length, pitch, amp, lowpassSpec, extra) {
    return {
      seed: seed,
      length: length,
      gain: 0.9,
      layers: [
        { type: 'saw', pitch: pitch, vibrato: { rate: 11, depth: 0.7 }, amp: amp, lowpass: lowpassSpec,
          drive: 3, bitcrush: 6, delay: speakerRing(0.009, 0.5, 0.4), gain: 0.65 },
        { type: 'pink', amp: amp, lowpass: 400, bitcrush: 6, gain: extra.breath }
      ]
    };
  }

  // Growl sight: the growl rising as it notices you, then settling into a threat.
  sounds.GROWL_SIGHT = sound(0.9, 98, growl('growlsight', 0.7,
    [[0, 55], [0.25, 95], [0.6, 80]], [[0, 0], [0.08, 0.9], [0.5, 0.8], [0.7, 0]], 550, { breath: 0.5 }));
  // Growl pain: a short bark of the same throat, higher and cut off.
  sounds.GROWL_PAIN = sound(0.9, 96, growl('growlpain', 0.3,
    [[0, 130], [0.05, 110], [0.3, 70]], [[0, 1], [0.1, 0.7], [0.3, 0]], 650, { breath: 0.4 }));
  // Growl death: the growl sinking a full octave and the breath going out of it.
  sounds.GROWL_DEATH = sound(1.0, 70, growl('growldeath', 1.3,
    [[0, 100], [0.3, 85], [1.3, 30]], [[0, 0.9], [0.4, 0.8], [1.0, 0.4], [1.3, 0]], [[0, 600], [1.3, 150]], { breath: 0.6 }));
  // Growl attack: a lunge, the pitch jumping up and dropping as it strikes.
  sounds.GROWL_ATTACK = sound(0.9, 70, growl('growlattack', 0.35,
    [[0, 80], [0.08, 140], [0.35, 65]], [[0, 0.3], [0.05, 1], [0.25, 0.6], [0.35, 0]], 600, { breath: 0.5 }));

  // RASP: a dry, breathy voice, a thin square buzzing under harsh noise, crushed to four bits.
  // Something that breathes through teeth.
  function rasp(seed, length, pitch, amp, noiseAmp, lowpassSpec) {
    return {
      seed: seed,
      length: length,
      gain: 0.9,
      layers: [
        { type: 'square', pitch: pitch, duty: 0.08, vibrato: { rate: 18, depth: 1.2 }, amp: amp, lowpass: lowpassSpec,
          drive: 2, bitcrush: 4, delay: speakerRing(0.0045, 0.5, 0.4), gain: 0.55 },
        { type: 'noise', amp: noiseAmp, lowpass: lowpassSpec, highpass: 300, bitcrush: 4, gain: 0.5 }
      ]
    };
  }

  // Rasp sight: a stuttering intake of breath, three hisses rising to a buzz.
  sounds.RASP_SIGHT = sound(0.9, 98, rasp('raspsight', 0.6,
    [[0, 140], [0.2, 210], [0.6, 170]], [[0, 0.2], [0.1, 0.9], [0.5, 0.8], [0.6, 0]],
    [[0, 0.2], [0.05, 1], [0.15, 0.4], [0.2, 1], [0.3, 0.4], [0.35, 1], [0.55, 0.3], [0.6, 0]], 1800));
  // Rasp pain: a sharp hiss falling in pitch.
  sounds.RASP_PAIN = sound(0.9, 96, rasp('rasppain', 0.25,
    [[0, 260], [0.25, 160]], [[0, 1], [0.08, 0.6], [0.25, 0]], [[0, 1], [0.08, 0.5], [0.25, 0]], 2200));
  // Rasp death: the hiss going on too long and sagging as the buzz dies underneath.
  sounds.RASP_DEATH = sound(1.0, 70, rasp('raspdeath', 1.1,
    [[0, 200], [0.4, 170], [1.1, 60]], [[0, 1], [0.3, 0.8], [0.6, 0.4], [1.1, 0]],
    [[0, 1], [0.3, 0.8], [0.6, 0.5], [1.1, 0]], [[0, 1800], [1.1, 300]]));
  // Rasp attack: a spit, the buzz leaping up and the breath thrown out with it.
  sounds.RASP_ATTACK = sound(0.9, 70, rasp('raspattack', 0.3,
    [[0, 160], [0.05, 280], [0.3, 150]], [[0, 0.6], [0.04, 1], [0.2, 0.5], [0.3, 0]],
    [[0, 0.3], [0.04, 1], [0.15, 0.4], [0.3, 0]], 2000));

  // HONK: a mechanical horn, two squares a fifth apart with hard edges, the klaxon of a thing
  // that was built, not born.
  function honk(seed, length, pitch, amp, lowpassSpec) {
    const fifth = [];
    for (let i = 0; i < pitch.length; i++) {
      fifth.push([pitch[i][0], pitch[i][1] * 1.5]);
    }
    return {
      seed: seed,
      length: length,
      gain: 0.9,
      layers: [
        { type: 'square', pitch: pitch, duty: 0.5, amp: amp, lowpass: lowpassSpec, drive: 2.5, bitcrush: 6,
          delay: speakerRing(0.0022, 0.4, 0.3), gain: 0.5 },
        { type: 'square', pitch: fifth, duty: 0.4, amp: amp, lowpass: lowpassSpec, drive: 2.5, bitcrush: 6, gain: 0.35 },
        { type: 'noise', amp: amp, lowpass: 900, highpass: 200, bitcrush: 5, gain: 0.12 }
      ]
    };
  }

  // Honk sight: two blasts, the second a step higher, a horn answering a horn.
  sounds.HONK_SIGHT = sound(0.9, 98, honk('honksight', 0.6,
    [[0, 196], [0.3, 196], [0.3, 220], [0.6, 220]],
    [[0, 0], [0.01, 1], [0.22, 1], [0.24, 0], [0.3, 0], [0.31, 1], [0.56, 1], [0.6, 0]], 1300));
  // Honk pain: one short blast bending down, as if the horn were dented.
  sounds.HONK_PAIN = sound(0.9, 96, honk('honkpain', 0.25,
    [[0, 240], [0.25, 170]], [[0, 1], [0.2, 0.9], [0.25, 0]], 1300));
  // Honk death: the horn stuttering, then sliding down two octaves as the power runs out.
  sounds.HONK_DEATH = sound(1.0, 70, honk('honkdeath', 1.2,
    [[0, 196], [0.3, 190], [1.2, 50]],
    [[0, 1], [0.3, 1], [0.35, 0.4], [0.45, 1], [0.5, 0.4], [0.6, 1], [1.0, 0.7], [1.2, 0]], [[0, 1300], [1.2, 300]]));
  // Honk attack: a quick double blast rising, the horn leaning in.
  sounds.HONK_ATTACK = sound(0.9, 70, honk('honkattack', 0.3,
    [[0, 220], [0.3, 250]], [[0, 1], [0.1, 1], [0.12, 0], [0.15, 0], [0.16, 1], [0.28, 1], [0.3, 0]], 1300));

  // CHIME: a bell voice; a triangle fundamental with a stretched inharmonic partial above it,
  // struck rather than blown. Something that announces itself.
  function strike(start, freq, decay, gain) {
    return [
      { type: 'tri', start: start, freq: freq, amp: [[0, 1], [decay * 0.3, 0.45], [decay, 0]], bitcrush: 7,
        delay: speakerRing(0.0016, 0.3, 0.2), gain: gain },
      { type: 'sine', start: start, freq: freq * 2.76, amp: [[0, 0.6], [decay * 0.12, 0.2], [decay * 0.4, 0]], gain: gain * 0.5 }
    ];
  }

  function chime(seed, length, strikes) {
    let layers = [];
    for (let i = 0; i < strikes.length; i++) {
      layers = layers.concat(strike(strikes[i][0], strikes[i][1], strikes[i][2], strikes[i][3]));
    }
    return { seed: seed, length: length, gain: 0.9, layers: layers };
  }

  // Chime sight: three strikes climbing a minor chord.
  sounds.CHIME_SIGHT = sound(0.9, 98, chime('chimesight', 0.8,
    [[0, 660, 0.45, 0.5], [0.15, 784, 0.45, 0.5], [0.3, 988, 0.5, 0.55]]));
  // Chime pain: two strikes a semitone apart at once, a clang that beats against itself.
  sounds.CHIME_PAIN = sound(0.9, 96, chime('chimepain', 0.3,
    [[0, 740, 0.28, 0.5], [0, 790, 0.28, 0.5]]));
  // Chime death: strikes falling down the chord with longer rings, ending on a low bong.
  sounds.CHIME_DEATH = sound(1.0, 70, chime('chimedeath', 1.4,
    [[0, 988, 0.4, 0.5], [0.25, 784, 0.45, 0.5], [0.5, 660, 0.5, 0.5], [0.8, 494, 0.6, 0.55], [0.8, 247, 0.6, 0.45]]));
  // Chime attack: one high strike and a quick higher answer, a sting.
  sounds.CHIME_ATTACK = sound(0.9, 70, chime('chimeattack', 0.25,
    [[0, 1320, 0.2, 0.6], [0.06, 1568, 0.18, 0.5]]));

  // ---------------------------------------------------------------- stings (the juice)
  // Short synthesized rewards in the site's arcade voice: bells and square arpeggios.

  // TINK_1..TINK_8: the combo coin, a bright bell whose pitch climbs a whole step per kill
  // in a streak.
  for (let k = 1; k <= 8; k++) {
    const f = 1320 * Math.pow(2, (k - 1) * 2 / 12);
    sounds['TINK_' + k] = sound(0.8, 70, chime('tink' + k, 0.35, [[0, f, 0.3, 0.55], [0.045, f * 1.5, 0.25, 0.35]]));
  }
  // Combo break: a dry crack, a pane of glass giving way.
  sounds.STING_CRACK = sound(0.8, 70, {
    seed: 'crack', length: 0.35, gain: 0.8,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.01, 0.6], [0.08, 0.2], [0.3, 0]], highpass: 1800, bitcrush: 5, gain: 0.8 },
      { type: 'square', pitch: [[0, 2600], [0.05, 700], [0.2, 240]], duty: 0.2, amp: [[0, 0.7], [0.08, 0.2], [0.2, 0]], bitcrush: 4, gain: 0.4 }
    ]
  });
  // A star landing on the tally: a struck chime and a sparkle above it.
  sounds.STING_STAR = sound(1.0, 60, chime('star', 0.7, [[0, 1047, 0.5, 0.55], [0.07, 1568, 0.45, 0.45], [0.14, 2093, 0.5, 0.4]]));
  // Rising arpeggio for rewards (chest, unlock, three stars): C E G C E G C, square and bell.
  function arpeggio(seed, notes, step, ring) {
    const layers = [];
    notes.forEach(function (f, i) {
      layers.push({ type: 'square', start: i * step, freq: f, duty: 0.25, amp: [[0, 0.8], [step * 0.8, 0.5], [step * 1.6, 0]], bitcrush: 6, gain: 0.35 });
      layers.push({ type: 'tri', start: i * step, freq: f * 2, amp: [[0, 0.8], [ring * 0.3, 0.3], [ring, 0]], gain: 0.4 });
    });
    return { seed: seed, length: notes.length * step + ring, gain: 0.85, layers: layers };
  }
  sounds.STING_REWARD = sound(1.0, 50, arpeggio('reward', [523, 659, 784, 1047, 1319, 1568, 2093], 0.065, 0.5));
  sounds.STING_UNLOCK = sound(1.0, 50, arpeggio('unlock', [784, 988, 1175, 1568, 1976, 2349], 0.055, 0.6));
  sounds.STING_CLEAR = sound(1.0, 40, arpeggio('clear', [392, 523, 659, 784, 1047, 1319, 1568, 2093], 0.075, 0.8));
  // The chest rattling when poked: a wooden knock and a coin shiver.
  sounds.STING_SHAKE = sound(0.9, 60, {
    seed: 'shake', length: 0.25, gain: 0.8,
    layers: [
      { type: 'sine', pitch: [[0, 180], [0.04, 90]], amp: [[0, 1], [0.05, 0.3], [0.12, 0]], drive: 2, gain: 0.7 },
      { type: 'noise', amp: [[0, 0.6], [0.02, 0.4], [0.2, 0]], highpass: 3000, bitcrush: 6, gain: 0.35 }
    ]
  });
  // The confetti pop: a burst of filtered noise with a high sparkle tail.
  sounds.STING_POP = sound(1.0, 50, {
    seed: 'pop', length: 0.6, gain: 0.85,
    layers: [
      { type: 'noise', amp: [[0, 1], [0.02, 0.7], [0.1, 0.2], [0.25, 0]], lowpass: [[0, 6000], [0.2, 1200]], drive: 2, gain: 0.7 },
      { type: 'sine', pitch: [[0, 240], [0.05, 90]], amp: [[0, 1], [0.08, 0.3], [0.15, 0]], gain: 0.6 },
      { type: 'tri', start: 0.08, pitch: [[0, 2600], [0.4, 3400]], vibrato: { rate: 30, depth: 0.08 }, amp: [[0, 0.4], [0.4, 0]], gain: 0.25 }
    ]
  });

  ns.defs.sounds = sounds;
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
