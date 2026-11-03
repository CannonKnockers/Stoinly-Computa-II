(function (ns) {
  'use strict';
  // palette.js: the 256-entry palette of section 6 (16 ramps of 16 shades built from anchor
  // colors with perceptual spacing), the memoized nearest() lookup, the 34-level colormap
  // built in linear light, the fullbright set, the screen tints and the index-to-RGBA tables
  // that web/main.js uses for the framebuffer conversion. Everything is built once at load.

  const GAMMA = 2.2;
  const RAMP_COUNT = 16;
  const RAMP_SIZE = 16;
  const TRANSPARENT = 255;
  const LIGHT_LEVELS = 32;
  const CMAP_INVERSE = 32;
  const CMAP_FULLBRIGHT = 33;
  const CMAP_COUNT = 34;

  // Anchor colors per ramp in ascending luminance; the first is shade 0 and the last is the
  // brightest shade exactly. The named colors of section 6 and the site survey are kept
  // verbatim; the rest fill the ramps so each one reads as one material from dark to light.
  const ANCHORS = [
    ['#000000', '#ffffff'],                                                   // 0 neutral grey
    ['#0c0a08', '#3c3630', '#7a7268', '#b8b0a4', '#f4efe6'],                  // 1 warm grey / concrete
    ['#0e0704', '#3e2412', '#7a4a22', '#b07a3c', '#e2b672'],                  // 2 brown: wood, dirt, cardboard
    ['#100c04', '#4d3800', '#8c7338', '#c4aa72', '#f2e8c9'],                  // 3 tan / beige / card frame cream
    ['#160a06', '#4e2c1c', '#8e5a3e', '#c48c68', '#e8b896', '#ffe4cc'],       // 4 skin
    ['#140004', '#5a0010', '#a0101c', '#c41f1f', '#ff0033'],                  // 5 red, scam red at the top
    ['#140800', '#5c2600', '#a84a00', '#d86a00', '#ff9500', '#ffd700'],       // 6 orange / gold
    ['#141000', '#4a3c00', '#8c7800', '#c8b400', '#ffee00'],                  // 7 yellow
    ['#040a03', '#1a2c10', '#34501e', '#527a2c', '#00d455', '#00ff00'],       // 8 green: grass and hedge greens, lime at the top
    ['#001212', '#2b4d4d', '#3d6b6b', '#5aa39a', '#7fd4c4', '#c8fff2'],       // 9 teal, card-face teals
    ['#001416', '#00484e', '#008490', '#00c4d4', '#00ffff'],                  // 10 cyan
    ['#000820', '#002a80', '#0055e0', '#4d9fff', '#bfe0ff'],                  // 11 blue
    ['#000000', '#000a1f', '#000033', '#1a1a70', '#6666ff'],                  // 12 navy / indigo
    ['#0a0214', '#1a0533', '#3d2a5c', '#6b5a8c', '#9a86b8', '#b8a0e0'],       // 13 purple
    ['#14000e', '#4c0040', '#8a0a70', '#c81ca0', '#ff00ff'],                  // 14 magenta / hot pink
    ['#141626', '#333a62', '#4a5490', '#767ea6', '#8890b8', '#c4c8e4', '#f4f6ff'] // 15 silver / lavender foil
  ];

  // Ramps whose top four shades glow (section 6); ramp 15 glows entirely. Red glows so
  // EXIT signs, neon and LED digits can be lit in red.
  const GLOW_RAMPS = [5, 7, 8, 10, 14];

  const TINTS = {
    damage: { rgb: [255, 0, 0], max: 0.75 },
    pickup: { rgb: [255, 224, 96], max: 0.4 },
    suit: { rgb: [0, 255, 0], max: 0.3 }
  };

  const rgb = new Uint8Array(768);
  const colormap = new Uint8Array(CMAP_COUNT * 256);
  const isFullbright = new Uint8Array(256);
  const FULLBRIGHT = new Set();
  const SRGB_TO_LINEAR = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    SRGB_TO_LINEAR[i] = Math.pow(i / 255, GAMMA);
  }

  function linearToByte(v) {
    if (v <= 0) {
      return 0;
    }
    if (v >= 1) {
      return 255;
    }
    return Math.round(Math.pow(v, 1 / GAMMA) * 255);
  }

  function hexToBytes(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function luminanceOf(lr, lg, lb) {
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  }

  // CIE L* from relative luminance and back: the perceptual scale the shades are spaced on.
  function lightnessOf(y) {
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  }

  function luminanceFromLightness(l) {
    return l > 8 ? Math.pow((l + 16) / 116, 3) : l / 903.3;
  }

  // Shade s gets the lightness L0 + (L15 - L0) * s / 15; its color is the point on the
  // anchor polyline (in linear light) with exactly that luminance, so steps look even while
  // hue and saturation follow the anchors. Ends are copied verbatim so named colors stay exact.
  function buildRamp(ramp) {
    const anchors = ANCHORS[ramp];
    const count = ramp === RAMP_COUNT - 1 ? RAMP_SIZE - 1 : RAMP_SIZE;
    const bytes = anchors.map(hexToBytes);
    const linear = bytes.map(function (c) {
      return [SRGB_TO_LINEAR[c[0]], SRGB_TO_LINEAR[c[1]], SRGB_TO_LINEAR[c[2]]];
    });
    const lum = linear.map(function (c) {
      return luminanceOf(c[0], c[1], c[2]);
    });
    for (let k = 1; k < lum.length; k++) {
      if (lum[k] <= lum[k - 1]) {
        throw new Error('palette: ramp ' + ramp + ' anchor ' + anchors[k] + ' is not brighter than ' + anchors[k - 1]);
      }
    }
    const l0 = lightnessOf(lum[0]);
    const l1 = lightnessOf(lum[lum.length - 1]);
    for (let s = 0; s < count; s++) {
      const index = ramp * RAMP_SIZE + s;
      let out;
      if (s === 0) {
        out = bytes[0];
      } else if (s === count - 1) {
        out = bytes[bytes.length - 1];
      } else {
        const y = luminanceFromLightness(l0 + (l1 - l0) * s / (count - 1));
        let k = 0;
        while (k < lum.length - 2 && y > lum[k + 1]) {
          k++;
        }
        const t = (y - lum[k]) / (lum[k + 1] - lum[k]);
        out = [
          linearToByte(linear[k][0] + (linear[k + 1][0] - linear[k][0]) * t),
          linearToByte(linear[k][1] + (linear[k + 1][1] - linear[k][1]) * t),
          linearToByte(linear[k][2] + (linear[k + 1][2] - linear[k][2]) * t)
        ];
      }
      rgb[index * 3] = out[0];
      rgb[index * 3 + 1] = out[1];
      rgb[index * 3 + 2] = out[2];
    }
  }

  for (let ramp = 0; ramp < RAMP_COUNT; ramp++) {
    buildRamp(ramp);
  }
  // Index 255 is transparent in sprite data and black in the palette.
  rgb[765] = 0;
  rgb[766] = 0;
  rgb[767] = 0;

  for (let g = 0; g < GLOW_RAMPS.length; g++) {
    for (let s = 12; s < RAMP_SIZE; s++) {
      FULLBRIGHT.add(GLOW_RAMPS[g] * RAMP_SIZE + s);
    }
  }
  for (let i = 240; i < 255; i++) {
    FULLBRIGHT.add(i);
  }
  FULLBRIGHT.forEach(function (i) {
    isFullbright[i] = 1;
  });

  // Weighted RGB distance (2, 4, 3) over the drawable entries 0..254, memoized by packed
  // color; the first of equally close entries wins so duplicates resolve to the lowest index.
  const nearestCache = new Map();
  function nearest(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    const hit = nearestCache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < 255; i++) {
      const dr = rgb[i * 3] - r;
      const dg = rgb[i * 3 + 1] - g;
      const db = rgb[i * 3 + 2] - b;
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    nearestCache.set(key, best);
    return best;
  }

  function luminance(index) {
    return luminanceOf(SRGB_TO_LINEAR[rgb[index * 3]], SRGB_TO_LINEAR[rgb[index * 3 + 1]], SRGB_TO_LINEAR[rgb[index * 3 + 2]]);
  }

  function lightness(index) {
    return lightnessOf(luminance(index));
  }

  // Light levels scale linear light by (1 - L / 32) so darkening slides down the ramps;
  // level 32 is the inverted greyscale of the invulnerability effect; 33 is the identity.
  function buildColormap() {
    for (let level = 0; level < LIGHT_LEVELS; level++) {
      const factor = 1 - level / LIGHT_LEVELS;
      const base = level * 256;
      for (let i = 0; i < 255; i++) {
        if (isFullbright[i] === 1 || level === 0) {
          colormap[base + i] = i;
        } else {
          colormap[base + i] = nearest(
            linearToByte(SRGB_TO_LINEAR[rgb[i * 3]] * factor),
            linearToByte(SRGB_TO_LINEAR[rgb[i * 3 + 1]] * factor),
            linearToByte(SRGB_TO_LINEAR[rgb[i * 3 + 2]] * factor)
          );
        }
      }
      colormap[base + TRANSPARENT] = TRANSPARENT;
    }
    const inverseBase = CMAP_INVERSE * 256;
    for (let i = 0; i < 255; i++) {
      if (isFullbright[i] === 1) {
        colormap[inverseBase + i] = i;
      } else {
        // Pick the ramp 0 shade whose luminance is closest to the inverted luminance, so the
        // invulnerability view is pure grey rather than the nearest warm or cool near-grey.
        const want = 1 - luminance(i);
        let best = 0;
        let bestDiff = Infinity;
        for (let g = 0; g < 16; g++) {
          const diff = Math.abs(luminance(g) - want);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = g;
          }
        }
        colormap[inverseBase + i] = best;
      }
    }
    colormap[inverseBase + TRANSPARENT] = TRANSPARENT;
    const identityBase = CMAP_FULLBRIGHT * 256;
    for (let i = 0; i < 256; i++) {
      colormap[identityBase + i] = i;
    }
  }
  buildColormap();

  // One pixel in the ImageData layout: little-endian hosts store RGBA bytes as 0xAABBGGRR.
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  function packPixel(r, g, b) {
    if (littleEndian) {
      return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
    return ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
  }

  // Uint32Array(256) of RGBA pixels for the current tint: `tint` is a key of palette.tints
  // or null, `strength` 0..1 scales that tint's maximum blend (damage 0.75, pickup 0.4,
  // suit 0.3). Pass `out` to refill a table instead of allocating one every frame.
  function rgbaTable(tint, strength, out) {
    const table = out || new Uint32Array(256);
    let amount = 0;
    let tr = 0;
    let tg = 0;
    let tb = 0;
    if (tint) {
      const def = TINTS[tint];
      if (!def) {
        throw new Error('palette.rgbaTable: unknown tint "' + tint + '"');
      }
      amount = def.max * (strength === undefined ? 1 : (strength < 0 ? 0 : (strength > 1 ? 1 : strength)));
      tr = def.rgb[0];
      tg = def.rgb[1];
      tb = def.rgb[2];
    }
    for (let i = 0; i < 256; i++) {
      const r = rgb[i * 3];
      const g = rgb[i * 3 + 1];
      const b = rgb[i * 3 + 2];
      table[i] = packPixel(
        Math.round(r + (tr - r) * amount),
        Math.round(g + (tg - g) * amount),
        Math.round(b + (tb - b) * amount)
      );
    }
    return table;
  }

  function index(ramp, shade) {
    return ramp * RAMP_SIZE + shade;
  }

  function rampOf(i) {
    return i >> 4;
  }

  function shadeOf(i) {
    return i & 15;
  }

  ns.palette = {
    GAMMA: GAMMA,
    RAMP_COUNT: RAMP_COUNT,
    RAMP_SIZE: RAMP_SIZE,
    TRANSPARENT: TRANSPARENT,
    LIGHT_LEVELS: LIGHT_LEVELS,
    CMAP_INVERSE: CMAP_INVERSE,
    CMAP_FULLBRIGHT: CMAP_FULLBRIGHT,
    CMAP_COUNT: CMAP_COUNT,
    ANCHORS: ANCHORS,
    rgb: rgb,
    colormap: colormap,
    FULLBRIGHT: FULLBRIGHT,
    isFullbright: isFullbright,
    tints: TINTS,
    nearest: nearest,
    luminance: luminance,
    lightness: lightness,
    rgbaTable: rgbaTable,
    index: index,
    rampOf: rampOf,
    shadeOf: shadeOf,
    littleEndian: littleEndian
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
