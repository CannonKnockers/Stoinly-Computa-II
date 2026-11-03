(function (ns) {
  'use strict';
  // music.js: the songs and the sequencer that renders them. A song is a tempo, a set of
  // instruments and an order of patterns; a pattern is one bar of sixteen steps per track,
  // written as space-separated cells: a note (E2, F#3, Bb4), '.' for rest, '-' to hold the
  // previous note one more step, and for drums k (kick), s (snare), h (hat), c (crash).
  // renderLoop() renders one pass of the song to PCM that loops without a click: every
  // voice is released inside the loop and the tail of the last bar is folded onto the start.
  // The style is a 1993 FM sound card: square and saw leads, palm-muted bass, noise drums.

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function freq(name) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) {
      throw new Error('music: bad note ' + name);
    }
    let n = NOTE[m[1]] + (m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0)) + (Number(m[3]) + 1) * 12;
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  // instruments: { wave, attack, decay, sustain, release, gain, cutoff, detune, vibrato }
  const INST = {
    bass: { wave: 'saw', attack: 0.004, decay: 0.12, sustain: 0.35, release: 0.05, gain: 0.32, cutoff: 900, mute: true },
    sub: { wave: 'tri', attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.1, gain: 0.35, cutoff: 600 },
    gtr: { wave: 'square', attack: 0.003, decay: 0.08, sustain: 0.45, release: 0.04, gain: 0.16, cutoff: 1800, duty: 0.3, detune: 0.004, drive: true },
    lead: { wave: 'square', attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.12, gain: 0.13, cutoff: 3200, duty: 0.25, vibrato: 0.012 },
    pad: { wave: 'saw', attack: 0.4, decay: 0.3, sustain: 0.8, release: 0.6, gain: 0.07, cutoff: 1200, detune: 0.006 },
    bell: { wave: 'sine', attack: 0.002, decay: 0.5, sustain: 0.0, release: 0.3, gain: 0.18, cutoff: 6000, fm: 3.5 },
    organ: { wave: 'tri', attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.1, gain: 0.12, cutoff: 2000 },
    moon: { wave: 'sine', attack: 1.5, decay: 1.0, sustain: 0.9, release: 2.0, gain: 0.12, cutoff: 8000, vibrato: 0.004 }
  };

  function osc(wave, ph, duty) {
    const p = ph - Math.floor(ph);
    switch (wave) {
      case 'square':
        return p < (duty || 0.5) ? 1 : -1;
      case 'saw':
        return 2 * p - 1;
      case 'tri':
        return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
      default:
        return Math.sin(p * Math.PI * 2);
    }
  }

  function renderNote(out, rate, start, dur, hz, inst, vel) {
    const a = inst.attack;
    const d = inst.decay;
    const s = inst.sustain;
    const r = inst.release;
    const total = Math.floor((dur + r) * rate);
    const k = 1 - Math.exp(-2 * Math.PI * inst.cutoff / rate);
    let lp = 0;
    let ph = 0;
    let ph2 = 0;
    const n0 = Math.floor(start * rate);
    for (let i = 0; i < total; i++) {
      const t = i / rate;
      let env;
      if (t < a) {
        env = t / a;
      } else if (t < a + d) {
        env = 1 - (1 - s) * (t - a) / d;
      } else if (t < dur) {
        env = s;
      } else {
        env = s * Math.max(0, 1 - (t - dur) / r);
      }
      if (inst.mute) {
        env *= Math.exp(-t * 9);
      }
      let f = hz;
      if (inst.vibrato && t > 0.15) {
        f *= 1 + Math.sin(t * Math.PI * 2 * 5.5) * inst.vibrato;
      }
      ph += f / rate;
      let v;
      if (inst.fm) {
        ph2 += f * inst.fm / rate;
        v = Math.sin((ph + Math.sin(ph2 * Math.PI * 2) * 0.25 * env) * Math.PI * 2);
      } else {
        v = osc(inst.wave, ph, inst.duty);
        if (inst.detune) {
          v = 0.6 * v + 0.4 * osc(inst.wave, ph * (1 + inst.detune), inst.duty);
        }
      }
      if (inst.drive) {
        v = Math.tanh(v * 2.2) * 0.8;
      }
      lp += (v - lp) * k;
      const j = n0 + i;
      if (j < out.length) {
        out[j] += lp * env * inst.gain * vel;
      }
    }
  }

  // Noise drums with a seeded generator so a song renders the same every time.
  function renderDrum(out, rate, start, kind, rnd) {
    const n0 = Math.floor(start * rate);
    const len = Math.floor(rate * (kind === 'c' ? 0.6 : (kind === 'h' ? 0.04 : (kind === 's' ? 0.14 : 0.16))));
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      let v = 0;
      if (kind === 'k') {
        const f = 110 * Math.exp(-t * 30) + 45;
        v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18) * 0.7;
      } else if (kind === 's') {
        const noise = rnd() * 2 - 1;
        lp += (noise - lp) * 0.5;
        v = (lp * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.3) * Math.exp(-t * 22) * 0.55;
      } else if (kind === 'h') {
        v = (rnd() * 2 - 1) * Math.exp(-t * 90) * 0.2;
      } else if (kind === 'c') {
        v = (rnd() * 2 - 1) * Math.exp(-t * 6) * 0.22;
      }
      const j = n0 + i;
      if (j < out.length) {
        out[j] += v;
      }
    }
  }

  function renderLoop(song, rate) {
    const stepSec = 60 / song.bpm / 4;
    const bars = song.order.length;
    const len = Math.floor(bars * 16 * stepSec * rate);
    const tail = Math.floor(rate * 2.5);
    const out = new Float32Array(len + tail);
    let seed = 12345;
    const rnd = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    song.order.forEach(function (pname, bar) {
      const pat = song.patterns[pname];
      if (!pat) {
        throw new Error('music: ' + song.name + ' has no pattern ' + pname);
      }
      for (const track in pat) {
        const cells = pat[track].trim().split(/\s+/);
        if (cells.length !== 16) {
          throw new Error('music: ' + song.name + '.' + pname + '.' + track + ' has ' + cells.length + ' steps');
        }
        const instName = track.replace(/\d+$/, '');
        for (let i = 0; i < 16; i++) {
          const c = cells[i];
          if (c === '.' || c === '-') {
            continue;
          }
          const t0 = (bar * 16 + i) * stepSec;
          if (instName === 'drums') {
            for (const ch of c) {
              renderDrum(out, rate, t0, ch, rnd);
            }
            continue;
          }
          let steps = 1;
          while (i + steps < 16 && cells[i + steps] === '-') {
            steps++;
          }
          const inst = INST[song.instruments && song.instruments[instName] || instName];
          if (!inst) {
            throw new Error('music: unknown instrument ' + instName);
          }
          renderNote(out, rate, t0, steps * stepSec * 0.92, freq(c), inst, 1);
        }
      }
    });
    // fold the tail past the loop point back onto the start, then a soft limit
    const res = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      res[i] = out[i] + (i < tail ? out[len + i] : 0);
    }
    let peak = 0;
    for (let i = 0; i < len; i++) {
      peak = Math.max(peak, Math.abs(res[i]));
    }
    const gain = peak > 0.9 ? 0.9 / peak : 1;
    for (let i = 0; i < len; i++) {
      res[i] = Math.tanh(res[i] * gain * 1.1);
    }
    return res;
  }

  const D = {
    rock: 'k . h . s . h . k k h . s . h .',
    rockFill: 'k . h . s . h . k k s . s s s c',
    four: 'k . h . k . h . k . h . k . h .',
    fourS: 'k . h . ks . h . k . h . ks . h h',
    stomp: 'k . . . s . . . k . . . s . . .',
    slow: 'k . . . . . . . s . . . . . . .',
    crash: 'kc . h . s . h . k k h . s . h .'
  };

  const songs = {
    D_HEN: {
      bpm: 140,
      patterns: {
        a: { bass: 'E2 E2 E2 E2 G2 E2 E2 E2 A2 E2 E2 E2 G2 E2 F#2 E2', gtr: 'E3 E3 . E3 G3 . E3 . A3 . E3 . G3 - F#3 -', drums: D.rock },
        b: { bass: 'C2 C2 C2 C2 D2 D2 D2 D2 E2 E2 E2 E2 E2 E2 D2 B1', gtr: 'C3 . C3 . D3 . D3 . E3 . E3 . E3 D3 B2 -', drums: D.rockFill },
        c: { bass: 'E2 E2 E2 E2 G2 E2 E2 E2 A2 E2 E2 E2 G2 E2 F#2 E2', gtr: 'E3 E3 . E3 G3 . E3 . A3 . E3 . G3 - F#3 -', lead: 'B4 - - - D5 - B4 - A4 - G4 - F#4 - E4 -', drums: D.rock },
        // the muzak interlude the riff keeps interrupting
        m: { organ: 'C4 - E4 - G4 - E4 - D4 - F4 - A4 - F4 -', sub: 'C2 - - - - - - - D2 - - - - - - -', drums: '. . h . . . h . . . h . . . h .' }
      },
      order: ['a', 'a', 'b', 'c', 'a', 'b', 'm', 'c']
    },
    D_SWAMP: {
      bpm: 100,
      patterns: {
        a: { bass: 'D2 - - D2 - - F2 - E2 - - - Bb1 - A1 -', gtr: 'D3 - - D3 - - F3 - E3 - - - Bb2 - A2 -', drums: D.slow },
        b: { bass: 'D2 - - D2 - - F2 - G2 - F2 - E2 - C2 -', gtr: 'D3 - - D3 - - F3 - G3 - F3 - E3 - C3 -', pad: 'D4 - - - - - - - A3 - - - - - - -', drums: 'k . . k s . . . k . . . s . h .' }
      },
      order: ['a', 'a', 'b', 'a']
    },
    D_ROOM: {
      bpm: 130,
      patterns: {
        a: { bass: 'A2 . A2 C3 . A2 . G2 . A2 . E2 . G2 . .', lead: 'A4 . C5 . E5 . A5 . E5 . C5 . A4 . E4 .', drums: 'k . h k . h s . k . h . s . h .' },
        b: { bass: 'F2 . F2 A2 . F2 . E2 . F2 . C2 . E2 . .', lead: 'A5 . E5 . C5 . A4 . C5 . E5 . A5 . E6 .', drums: 'k . h k . h s . k . h . s . s s' }
      },
      order: ['a', 'b', 'a', 'b']
    },
    D_CRIB: {
      bpm: 150,
      patterns: {
        a: { bass: 'E2 E2 E3 E2 E2 E2 E3 E2 G2 G2 G3 G2 A2 A2 A3 A2', gtr: 'E3 . E3 . . E3 G3 . E3 . E3 . A3 . G3 .', drums: D.four },
        b: { bass: 'E2 E2 E3 E2 E2 E2 E3 E2 G2 G2 G3 G2 A2 A2 A3 A2', gtr: 'E3 . E3 . . E3 G3 . E3 . E3 . A3 . G3 .', lead: 'E5 E5 G5 E5 D5 - B4 - E5 E5 G5 E5 A5 - G5 -', drums: D.fourS },
        c: { bass: 'C2 C2 C3 C2 D2 D2 D3 D2 B1 B1 B2 B1 E2 E2 E3 E2', gtr: 'C3 . C3 . D3 . D3 . B2 . B2 . E3 . E3 .', lead: 'E5 E5 G5 E5 D5 - B4 - E5 E5 G5 E5 A5 - G5 -', drums: D.fourS }
      },
      order: ['a', 'b', 'b', 'c', 'a', 'b', 'c', 'b']
    },
    D_MEET: {
      bpm: 120,
      patterns: {
        a: { bass: 'G1 - G1 - . . G1 - Bb1 - . . C2 - Bb1 -', gtr: 'G2 - G2 - . . G2 - Bb2 - . . C3 - Bb2 -', drums: D.stomp },
        b: { bass: 'G1 - G1 - . . G1 - Bb1 - . . C2 - D2 -', gtr: 'G2 - G2 - . . G2 - Bb2 - . . C3 - D3 -', bell: 'G5 . . . . . . . . . . . D5 . . .', drums: 'k . . . ks . . . k . k . ks . . .' }
      },
      order: ['a', 'a', 'b', 'a', 'b', 'b']
    },
    D_REHAB: {
      bpm: 80,
      patterns: {
        a: { sub: 'A1 - - - - - - - A1 - - - - - - -', organ: 'E4 - - - F4 - - - E4 - - - F4 - - -', pad: 'A3 - - - - - - - - - - - - - - -', drums: D.slow },
        b: { sub: 'Bb1 - - - - - - - Bb1 - - - - - - -', organ: 'F4 - - - F#4 - - - F4 - - - F#4 - - -', pad: 'Bb3 - - - - - - - - - - - - - - -', drums: D.slow }
      },
      order: ['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b']
    },
    D_INTER: {
      bpm: 120,
      patterns: {
        a: { bass: 'C2 . C3 . G2 . C3 . F2 . F3 . G2 . G3 .', lead: 'E5 . G5 . C6 . G5 . A5 . F5 . D5 . B4 .', drums: 'k . h h s . h h k . h h s . h h' }
      },
      order: ['a', 'a']
    },
    D_FEED: {
      bpm: 90,
      patterns: {
        a: { sub: 'E1 - - - - - - - - - - - - - - -', pad: 'E3 - - - - - - - G3 - - - - - - -', bell: 'B4 . . . . . . . . . . . E5 . . .', drums: '. . . . . . . . . . . . . . h .' },
        b: { sub: 'C1 - - - - - - - D1 - - - - - - -', pad: 'C3 - - - - - - - D3 - - - - - - -', bell: 'G4 . . . . . . . A4 . . . . . . .', drums: '. . . . . . . . . . . . . . h .' }
      },
      order: ['a', 'a', 'b', 'a']
    },
    D_STOI: {
      bpm: 60,
      patterns: {
        a: { moon: 'E6 - - - - - - - - - - - - - - -', pad: 'E3 - - - - - - - - - - - - - - -', sub: 'E1 - - - - - - - - - - - - - - -' }
      },
      order: ['a', 'a']
    }
  };
  for (const k in songs) {
    songs[k].name = k;
  }

  ns.music = { songs: songs, renderLoop: renderLoop, freq: freq };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
