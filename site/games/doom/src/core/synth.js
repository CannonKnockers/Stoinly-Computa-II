(function (ns) {
  'use strict';
  // synth.js: renders a sound definition (section 10) into a Float32Array of samples, 11025
  // Hz by default. A definition layers oscillators and noise under pitch, duty and amplitude
  // envelopes, one-pole filters, soft-clip drive, bit crush and a feedback delay, then
  // applies a final gain and a hard limit. It is deterministic from its seed and DOM-free, so
  // Node tests, the WAV preview tools and the browser's AudioBuffers get identical samples.

  /* A definition (every field but length and layers is optional):
     {
       seed: 1,                      number or string; noise layer i draws from rng.create(seed + ':' + i)
       length: 0.25,                 seconds of output
       gain: 1,                      final multiplier, applied before the limit
       limit: 1,                     hard clamp to [-limit, limit]
       layers: [{
         type: 'square' | 'saw' | 'tri' | 'sine' | 'noise' | 'pink',
         start: 0,                   seconds into the sound where the layer begins (two-event sounds)
         length: to the end,         seconds the layer runs, delay tail included
         gain: 1,                    layer level when mixed in
         freq: 440,                  start pitch in Hz
         freqEnd: none,              glide target reached at the layer's end (geometric)
         pitch: [[t, hz], ...],      pitch envelope, overrides freq and freqEnd
         vibrato: { rate, depth },   Hz and semitones
         duty: 0.5 | [[t, d], ...],  square only, 0..1
         amp: [[t, level], ...],     amplitude envelope, linear between points, held flat outside them
         lowpass: hz | [[t, hz]],    one-pole; an envelope sweeps it
         highpass: hz | [[t, hz]],   one-pole
         drive: 0,                   tanh soft clip; 1 is mild, 4 is heavy
         bitcrush: 16,               output bits, 2..16
         delay: { time, feedback, mix }   seconds, 0..0.98, wet level added to the dry signal
       }]
     }
     Pitch and cutoff envelopes interpolate geometrically (constant octaves per second), so a
     sweep sounds even; amplitude and duty envelopes interpolate linearly. Per layer the
     order is oscillator x amp, lowpass, highpass, drive, bitcrush, delay, gain. */

  const TAU = Math.PI * 2;
  const DEFAULT_RATE = 11025;
  const MAX_SECONDS = 60;
  const MAX_DELAY_FEEDBACK = 0.98;
  const SQUARE = 0;
  const SAW = 1;
  const TRI = 2;
  const SINE = 3;
  const NOISE = 4;
  const PINK = 5;
  const TYPES = { square: SQUARE, saw: SAW, tri: TRI, sine: SINE, noise: NOISE, pink: PINK };
  // Kellet's three-pole pink filter comes out about seven times louder than the white noise
  // it is fed; this scales a long pink run to peak near 1 like every other oscillator (its RMS
  // is then about 0.25 against white's 0.58, the crest factor of pink noise).
  const PINK_GAIN = 0.14;

  function fail(where, message) {
    throw new Error('synth: ' + where + ': ' + message);
  }

  function isPointList(value) {
    return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]);
  }

  function checkPoints(points, where) {
    if (!isPointList(points)) {
      fail(where, 'expected a list of [seconds, value] points');
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        fail(where, 'point ' + i + ' must be [seconds, value]');
      }
      if (p[0] < 0) {
        fail(where, 'point ' + i + ' is before the layer starts');
      }
      if (i > 0 && p[0] < points[i - 1][0]) {
        fail(where, 'point ' + i + ' goes back in time');
      }
    }
    return points;
  }

  // Fills out[0..n) from [seconds, value] points. Values are held flat before the first and
  // after the last point; a geometric segment whose ends are not both positive falls back to
  // linear so a sweep down to zero still works.
  function fillCurve(out, n, rate, points, geometric) {
    const count = points.length;
    let seg = 0;
    let t0 = points[0][0];
    let v0 = points[0][1];
    let t1 = count > 1 ? points[1][0] : t0;
    let v1 = count > 1 ? points[1][1] : v0;
    let lnRatio = geometric && v0 > 0 && v1 > 0 ? Math.log(v1 / v0) : 0;
    let span = t1 - t0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      while (seg < count - 2 && t >= t1) {
        seg++;
        t0 = t1;
        v0 = v1;
        t1 = points[seg + 1][0];
        v1 = points[seg + 1][1];
        lnRatio = geometric && v0 > 0 && v1 > 0 ? Math.log(v1 / v0) : 0;
        span = t1 - t0;
      }
      let v;
      if (t <= t0 || count === 1) {
        v = v0;
      } else if (t >= t1 || span <= 0) {
        v = v1;
      } else {
        const f = (t - t0) / span;
        v = lnRatio !== 0 ? v0 * Math.exp(lnRatio * f) : v0 + (v1 - v0) * f;
      }
      out[i] = v;
    }
    return out;
  }

  // A number or an envelope becomes a per-sample curve; the loops never branch on which.
  function curveOf(spec, fallback, n, rate, geometric, where) {
    const out = new Float32Array(n);
    if (spec === undefined) {
      out.fill(fallback);
    } else if (typeof spec === 'number') {
      if (!Number.isFinite(spec)) {
        fail(where, 'must be a finite number');
      }
      out.fill(spec);
    } else {
      fillCurve(out, n, rate, checkPoints(spec, where), geometric);
    }
    return out;
  }

  // Converts a cutoff curve into one-pole coefficients in place: a = 1 - exp(-2 pi fc / rate).
  function toCoefficients(curve, n, rate) {
    for (let i = 0; i < n; i++) {
      curve[i] = 1 - Math.exp(-TAU * curve[i] / rate);
    }
    return curve;
  }

  function applyVibrato(freq, n, rate, vibrato, where) {
    const vibratoRate = vibrato.rate;
    const depth = vibrato.depth;
    if (!(vibratoRate > 0) || !(depth >= 0)) {
      fail(where, 'vibrato needs rate > 0 and depth >= 0');
    }
    const k = depth / 12;
    for (let i = 0; i < n; i++) {
      freq[i] *= Math.pow(2, k * Math.sin(TAU * vibratoRate * i / rate));
    }
  }

  function squareWave(buf, n, rate, freq, duty, amp) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      buf[i] = (phase < duty[i] ? 1 : -1) * amp[i];
      phase += freq[i] / rate;
      if (phase >= 1) {
        phase -= Math.floor(phase);
      }
    }
  }

  function sawWave(buf, n, rate, freq, amp) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      buf[i] = (2 * phase - 1) * amp[i];
      phase += freq[i] / rate;
      if (phase >= 1) {
        phase -= Math.floor(phase);
      }
    }
  }

  function triangleWave(buf, n, rate, freq, amp) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      buf[i] = (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase) * amp[i];
      phase += freq[i] / rate;
      if (phase >= 1) {
        phase -= Math.floor(phase);
      }
    }
  }

  function sineWave(buf, n, rate, freq, amp) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      buf[i] = Math.sin(TAU * phase) * amp[i];
      phase += freq[i] / rate;
      if (phase >= 1) {
        phase -= Math.floor(phase);
      }
    }
  }

  function whiteNoise(buf, n, amp, rng) {
    for (let i = 0; i < n; i++) {
      buf[i] = (rng.next() * 2 - 1) * amp[i];
    }
  }

  // Kellet's economy pink filter: three leaky integrators on white noise.
  function pinkNoise(buf, n, amp, rng) {
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < n; i++) {
      const white = rng.next() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      buf[i] = (b0 + b1 + b2 + white * 0.1848) * PINK_GAIN * amp[i];
    }
  }

  function lowpass(buf, n, coef) {
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += coef[i] * (buf[i] - y);
      buf[i] = y;
    }
  }

  function highpass(buf, n, coef) {
    let low = 0;
    for (let i = 0; i < n; i++) {
      const x = buf[i];
      low += coef[i] * (x - low);
      buf[i] = x - low;
    }
  }

  // tanh soft clip, normalized so a full-scale input still peaks at 1.
  function drive(buf, n, amount) {
    const norm = 1 / Math.tanh(amount);
    for (let i = 0; i < n; i++) {
      buf[i] = Math.tanh(buf[i] * amount) * norm;
    }
  }

  function bitcrush(buf, n, bits) {
    const levels = Math.pow(2, bits - 1);
    const inv = 1 / levels;
    for (let i = 0; i < n; i++) {
      buf[i] = Math.round(buf[i] * levels) * inv;
    }
  }

  // Feedback delay; the wet signal is added on top of the dry one so a short time with
  // feedback acts as a comb, which is where the small-speaker ring of the sounds comes from.
  function delay(buf, n, rate, spec, where) {
    const size = Math.round((spec.time || 0) * rate);
    if (!(size >= 1)) {
      fail(where, 'delay time must be at least one sample');
    }
    const feedback = Math.min(MAX_DELAY_FEEDBACK, Math.max(0, spec.feedback || 0));
    const mix = spec.mix === undefined ? 0.5 : spec.mix;
    const line = new Float32Array(size);
    let pos = 0;
    for (let i = 0; i < n; i++) {
      const delayed = line[pos];
      const x = buf[i];
      line[pos] = x + delayed * feedback;
      buf[i] = x + delayed * mix;
      pos++;
      if (pos === size) {
        pos = 0;
      }
    }
  }

  function renderLayer(out, n, rate, layer, index, seed) {
    const where = 'layer ' + index;
    if (!layer || typeof layer !== 'object') {
      fail(where, 'must be an object');
    }
    const type = TYPES[layer.type];
    if (type === undefined) {
      fail(where, 'unknown type ' + JSON.stringify(layer.type));
    }
    const start = Math.round((layer.start || 0) * rate);
    if (!(start >= 0 && start < n)) {
      fail(where, 'start ' + layer.start + ' is outside the sound');
    }
    let len = n - start;
    if (layer.length !== undefined) {
      len = Math.min(len, Math.round(layer.length * rate));
    }
    if (!(len > 0)) {
      fail(where, 'length must be positive');
    }
    const buf = new Float32Array(len);
    const amp = curveOf(layer.amp, 1, len, rate, false, where + ' amp');

    if (type === NOISE || type === PINK) {
      const rng = ns.rng.create(String(seed) + ':' + index);
      if (type === NOISE) {
        whiteNoise(buf, len, amp, rng);
      } else {
        pinkNoise(buf, len, amp, rng);
      }
    } else {
      let pitch;
      if (layer.pitch !== undefined) {
        pitch = checkPoints(layer.pitch, where + ' pitch');
      } else {
        const startHz = layer.freq === undefined ? 440 : layer.freq;
        if (!Number.isFinite(startHz)) {
          fail(where, 'freq must be a finite number');
        }
        pitch = layer.freqEnd === undefined ? [[0, startHz]] : [[0, startHz], [len / rate, layer.freqEnd]];
      }
      const freq = fillCurve(new Float32Array(len), len, rate, pitch, true);
      if (layer.vibrato) {
        applyVibrato(freq, len, rate, layer.vibrato, where);
      }
      if (type === SQUARE) {
        squareWave(buf, len, rate, freq, curveOf(layer.duty, 0.5, len, rate, false, where + ' duty'), amp);
      } else if (type === SAW) {
        sawWave(buf, len, rate, freq, amp);
      } else if (type === TRI) {
        triangleWave(buf, len, rate, freq, amp);
      } else {
        sineWave(buf, len, rate, freq, amp);
      }
    }

    if (layer.lowpass !== undefined) {
      lowpass(buf, len, toCoefficients(curveOf(layer.lowpass, rate, len, rate, true, where + ' lowpass'), len, rate));
    }
    if (layer.highpass !== undefined) {
      highpass(buf, len, toCoefficients(curveOf(layer.highpass, 0, len, rate, true, where + ' highpass'), len, rate));
    }
    if (layer.drive) {
      if (!(layer.drive > 0)) {
        fail(where, 'drive must be positive');
      }
      drive(buf, len, layer.drive);
    }
    if (layer.bitcrush !== undefined) {
      if (!(layer.bitcrush >= 2 && layer.bitcrush <= 16)) {
        fail(where, 'bitcrush must be 2..16 bits');
      }
      bitcrush(buf, len, layer.bitcrush);
    }
    if (layer.delay) {
      delay(buf, len, rate, layer.delay, where);
    }
    const gain = layer.gain === undefined ? 1 : layer.gain;
    for (let i = 0; i < len; i++) {
      out[start + i] += buf[i] * gain;
    }
  }

  function render(def, sampleRate) {
    const rate = sampleRate === undefined ? DEFAULT_RATE : sampleRate;
    if (!def || typeof def !== 'object') {
      fail('definition', 'must be an object');
    }
    if (!(rate >= 1000 && rate <= 192000)) {
      fail('definition', 'sample rate ' + sampleRate + ' is out of range');
    }
    if (!(def.length > 0 && def.length <= MAX_SECONDS)) {
      fail('definition', 'length must be 0..' + MAX_SECONDS + ' seconds');
    }
    if (!Array.isArray(def.layers) || def.layers.length === 0) {
      fail('definition', 'needs at least one layer');
    }
    const n = Math.round(def.length * rate);
    const out = new Float32Array(n);
    const seed = def.seed === undefined ? 0 : def.seed;
    for (let i = 0; i < def.layers.length; i++) {
      renderLayer(out, n, rate, def.layers[i], i, seed);
    }
    const gain = def.gain === undefined ? 1 : def.gain;
    const limit = def.limit === undefined ? 1 : def.limit;
    for (let i = 0; i < n; i++) {
      let v = out[i] * gain;
      if (v > limit) {
        v = limit;
      } else if (v < -limit) {
        v = -limit;
      }
      out[i] = v;
    }
    return out;
  }

  function peak(samples, from, to) {
    const end = to === undefined ? samples.length : to;
    let best = 0;
    for (let i = from || 0; i < end; i++) {
      const a = samples[i] < 0 ? -samples[i] : samples[i];
      if (a > best) {
        best = a;
      }
    }
    return best;
  }

  function rms(samples, from, to) {
    const begin = from || 0;
    const end = to === undefined ? samples.length : to;
    if (end <= begin) {
      return 0;
    }
    let sum = 0;
    for (let i = begin; i < end; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / (end - begin));
  }

  ns.synth = {
    DEFAULT_RATE: DEFAULT_RATE,
    MAX_SECONDS: MAX_SECONDS,
    TYPES: Object.keys(TYPES),
    render: render,
    fillCurve: fillCurve,
    peak: peak,
    rms: rms
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
