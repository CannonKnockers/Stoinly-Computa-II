(function (ns) {
  'use strict';
  // text.js: draws strings in the three bitmap fonts (SMALL, BIG, LED) into the 320x200
  // framebuffer. Glyphs are stored in one ramp (SMALL grey, BIG red, LED lime); draw()
  // translates them shade for shade into any other ramp, adds Doom's one-pixel drop shadow
  // and wraps to a width. Characters the font lacks fall back to a blank advance.

  const W = 320;
  const H = 200;

  function font(name) {
    return ns.assets.getFont(name);
  }

  function glyphOf(f, ch) {
    return f.glyphs[ch] || f.glyphs[ch.toUpperCase()] || null;
  }

  function width(fontName, str) {
    const f = font(fontName);
    let w = 0;
    for (const ch of String(str)) {
      const g = glyphOf(f, ch);
      w += g ? g.advance : 4;
    }
    return w;
  }

  // Splits text into lines that fit `maxW` pixels, breaking at spaces and at \n.
  function wrap(fontName, str, maxW) {
    const out = [];
    String(str).split('\n').forEach(function (para) {
      let line = '';
      para.split(' ').forEach(function (word) {
        const test = line ? line + ' ' + word : word;
        if (line && width(fontName, test) > maxW) {
          out.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      out.push(line);
    });
    return out;
  }

  // opts: { ramp, align: 'left'|'center'|'right', shadow (default true), level (colormap),
  // count (type-on: draw only the first n characters), wrap (width), lineGap }
  function draw(fb, fontName, x, y, str, opts) {
    const o = opts || {};
    const f = font(fontName);
    const lines = o.wrap ? wrap(fontName, str, o.wrap) : String(str).split('\n');
    const cm = ns.palette.colormap;
    const lvlBase = (o.level === undefined ? 33 : o.level) << 8;
    const ramp = o.ramp === undefined ? -1 : o.ramp;
    let left = o.count === undefined ? Infinity : o.count;
    let yy = y;
    for (let li = 0; li < lines.length && left > 0; li++) {
      const line = lines[li];
      const lw = width(fontName, line);
      let xx = x;
      if (o.align === 'center') {
        xx = Math.round(x - lw / 2);
      } else if (o.align === 'right') {
        xx = x - lw;
      }
      for (const ch of line) {
        if (left-- <= 0) {
          break;
        }
        const g = glyphOf(f, ch);
        if (!g) {
          xx += 4;
          continue;
        }
        const v = g.frame;
        for (let gy = 0; gy < v.h; gy++) {
          const py = yy + gy;
          if (py < 0 || py >= H) {
            continue;
          }
          for (let gx = 0; gx < v.w; gx++) {
            const px = xx + gx;
            if (px < 0 || px >= W) {
              continue;
            }
            let t = v.sheet[(v.y + gy) * v.sw + v.x + gx];
            if (t === 255) {
              continue;
            }
            if (ramp >= 0) {
              const shade = t & 15;
              t = ramp * 16 + (ramp === 15 && shade > 14 ? 14 : shade);
            }
            if (o.shadow !== false && px + 1 < W && py + 1 < H) {
              const si = (py + 1) * W + px + 1;
              if (fb[si] !== undefined) {
                fb[si] = o.shadowIndex === undefined ? 0 : o.shadowIndex;
              }
            }
            fb[py * W + px] = cm[lvlBase + t];
          }
        }
        xx += g.advance;
      }
      yy += f.lineHeight + (o.lineGap || 0);
    }
    return yy;
  }

  // The shadow pass above can overwrite an earlier glyph's right edge; drawing the shadow
  // first for a whole string avoids that, which is what drawShadowed does.
  function drawShadowed(fb, fontName, x, y, str, opts) {
    const o = Object.assign({}, opts || {});
    const shadowRamp = 0;
    draw(fb, fontName, x + 1, y + 1, str, Object.assign({}, o, { shadow: false, ramp: shadowRamp, level: 31 }));
    return draw(fb, fontName, x, y, str, Object.assign({}, o, { shadow: false }));
  }

  function lineHeight(fontName) {
    return font(fontName).lineHeight;
  }

  ns.text = { width: width, wrap: wrap, draw: drawShadowed, drawRaw: draw, lineHeight: lineHeight };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
