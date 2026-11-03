(function (ns) {
  'use strict';
  // assets.js: the registry of section 9. assets/build/sheets.js registers sheets (RLE+base64
  // pixel data), frames, textures, flats, fonts and animations; decodeAll() turns every sheet
  // into a Uint8Array once at startup and resolves each entry into a view
  // { sheet, sw, x, y, w, h, ox, oy, fullbright } that the renderer indexes directly.
  // Lookups throw errors that name the missing asset, so a bad level fails loudly.

  const sheets = Object.create(null);
  const frames = Object.create(null);
  const textures = Object.create(null);
  const flats = Object.create(null);
  const fonts = Object.create(null);
  const anims = Object.create(null);
  const sprites = Object.create(null);
  let decoded = false;

  function checkName(kind, table, name) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('assets.' + kind + ': a name is required');
    }
    if (table[name] !== undefined) {
      throw new Error('assets.' + kind + ': "' + name + '" is registered twice');
    }
  }

  function sheet(name, w, h, data) {
    checkName('sheet', sheets, name);
    sheets[name] = { name: name, w: w, h: h, data: data, pixels: null };
    decoded = false;
  }

  function makeView(name, sheetName, x, y, w, h, ox, oy, fullbright, density) {
    return {
      name: name,
      sheetName: sheetName,
      sheet: null,
      sw: 0,
      x: x,
      y: y,
      w: w,
      h: h,
      ox: ox,
      oy: oy,
      fullbright: fullbright ? 1 : 0,
      density: density > 0 ? density : 1
    };
  }

  // density (optional, default 1): texels per sprite pixel; the photo cards use 2.
  function frame(name, sheetName, x, y, w, h, ox, oy, fullbright, density) {
    checkName('frame', frames, name);
    frames[name] = makeView(name, sheetName, x, y, w, h, ox, oy, fullbright, density);
    decoded = false;
  }

  function texture(name, sheetName, x, y, w, h) {
    checkName('texture', textures, name);
    if (flats[name] !== undefined) {
      throw new Error('assets.texture: "' + name + '" is already a flat');
    }
    textures[name] = makeView(name, sheetName, x, y, w, h, 0, 0, 0);
    decoded = false;
  }

  // Flats are always 64x64 (section 9).
  function flat(name, sheetName, x, y) {
    checkName('flat', flats, name);
    if (textures[name] !== undefined) {
      throw new Error('assets.flat: "' + name + '" is already a texture');
    }
    flats[name] = makeView(name, sheetName, x, y, 64, 64, 0, 0, 0);
    decoded = false;
  }

  // glyphs: [[character, frameName, advance], ...]; the glyph frames are registered with
  // frame() first. A font's table maps each character to { frame, advance }.
  function font(name, lineHeight, glyphs) {
    checkName('font', fonts, name);
    const table = Object.create(null);
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      if (table[g[0]] !== undefined) {
        throw new Error('assets.font: font "' + name + '" lists "' + g[0] + '" twice');
      }
      table[g[0]] = { ch: g[0], frameName: g[1], frame: null, advance: g[2] };
    }
    fonts[name] = { name: name, lineHeight: lineHeight, glyphs: table };
    decoded = false;
  }

  function anim(name, frameNames, tics) {
    checkName('anim', anims, name);
    if (!frameNames.length || !(tics > 0)) {
      throw new Error('assets.anim: "' + name + '" needs frames and tics > 0');
    }
    anims[name] = { name: name, frameNames: frameNames.slice(), frames: null, tics: tics };
  }

  function getSheet(name) {
    const s = sheets[name];
    if (s === undefined) {
      throw new Error('assets: no sheet named "' + name + '"');
    }
    return s;
  }

  function getFrame(name) {
    const f = frames[name];
    if (f === undefined) {
      throw new Error('assets: no sprite frame named "' + name + '"');
    }
    return f;
  }

  function getTexture(name) {
    const t = textures[name];
    if (t === undefined) {
      throw new Error('assets: no texture named "' + name + '"');
    }
    return t;
  }

  function getFlat(name) {
    const f = flats[name];
    if (f === undefined) {
      throw new Error('assets: no flat named "' + name + '"');
    }
    return f;
  }

  function getFont(name) {
    const f = fonts[name];
    if (f === undefined) {
      throw new Error('assets: no font named "' + name + '"');
    }
    return f;
  }

  function getAnim(name) {
    const a = anims[name];
    if (a === undefined) {
      throw new Error('assets: no animation named "' + name + '"');
    }
    return a;
  }

  function hasFrame(name) {
    return frames[name] !== undefined;
  }

  // Level files name textures and flats; an animation name stands for its current frame.
  function hasTexture(name) {
    return textures[name] !== undefined || anims[name] !== undefined;
  }

  function hasFlat(name) {
    return flats[name] !== undefined || anims[name] !== undefined;
  }

  function hasFont(name) {
    return fonts[name] !== undefined;
  }

  // True once sheets.js has registered anything, so map.compile knows it may validate names.
  function loaded() {
    for (const name in sheets) {
      return name !== undefined;
    }
    return false;
  }

  function resolveView(kind, view) {
    const s = sheets[view.sheetName];
    if (s === undefined) {
      throw new Error('assets: ' + kind + ' "' + view.name + '" refers to a missing sheet "' + view.sheetName + '"');
    }
    if (view.x < 0 || view.y < 0 || view.x + view.w > s.w || view.y + view.h > s.h) {
      throw new Error('assets: ' + kind + ' "' + view.name + '" lies outside sheet "' + s.name + '"');
    }
    view.sheet = s.pixels;
    view.sw = s.w;
  }

  // Sprite table: sprites[prefix][letter][rotation 0..8]; a rotation-0 frame fills all eight.
  function indexSprites() {
    for (const name in sprites) {
      delete sprites[name];
    }
    for (const name in frames) {
      if (name.length !== 6) {
        continue;
      }
      const letter = name.charAt(4);
      const rot = name.charCodeAt(5) - 48;
      if (letter < 'A' || letter > 'Z' || rot < 0 || rot > 8) {
        continue;
      }
      const prefix = name.slice(0, 4);
      const set = sprites[prefix] || (sprites[prefix] = Object.create(null));
      const rotations = set[letter] || (set[letter] = new Array(9).fill(null));
      rotations[rot] = frames[name];
    }
    for (const prefix in sprites) {
      for (const letter in sprites[prefix]) {
        const rotations = sprites[prefix][letter];
        if (rotations[0] !== null) {
          for (let r = 1; r <= 8; r++) {
            if (rotations[r] === null) {
              rotations[r] = rotations[0];
            }
          }
        }
      }
    }
  }

  function decodeAll() {
    for (const name in sheets) {
      const s = sheets[name];
      if (s.pixels === null) {
        s.pixels = ns.codec.decode(s.data, s.w * s.h);
        s.data = null;
      }
    }
    for (const name in frames) {
      resolveView('frame', frames[name]);
    }
    for (const name in textures) {
      resolveView('texture', textures[name]);
    }
    for (const name in flats) {
      resolveView('flat', flats[name]);
    }
    for (const name in fonts) {
      const glyphs = fonts[name].glyphs;
      for (const ch in glyphs) {
        const g = glyphs[ch];
        if (frames[g.frameName] === undefined) {
          throw new Error('assets: font "' + name + '" glyph "' + ch + '" refers to a missing frame "' + g.frameName + '"');
        }
        g.frame = frames[g.frameName];
      }
    }
    for (const name in anims) {
      const a = anims[name];
      a.frames = a.frameNames.map(function (frameName) {
        const view = textures[frameName] || flats[frameName];
        if (view === undefined) {
          throw new Error('assets: animation "' + name + '" refers to a missing texture or flat "' + frameName + '"');
        }
        return view;
      });
    }
    indexSprites();
    decoded = true;
    return ns.assets;
  }

  // The texture or flat to draw for a name at a tic; plain names return their own view.
  function current(name, tic) {
    const a = anims[name];
    if (a !== undefined) {
      if (a.frames === null) {
        throw new Error('assets.current: decodeAll() has not run');
      }
      return a.frames[Math.floor(tic / a.tics) % a.frames.length];
    }
    const view = textures[name] || flats[name];
    if (view === undefined) {
      throw new Error('assets: no texture, flat or animation named "' + name + '"');
    }
    return view;
  }

  // A sprite frame by prefix, frame letter and rotation 0..8 (0 or a missing rotation
  // falls back to the all-angles frame).
  function spriteFrame(prefix, letter, rotation) {
    const set = sprites[prefix];
    const rotations = set !== undefined ? set[letter] : undefined;
    if (rotations === undefined) {
      throw new Error('assets: no sprite frame "' + prefix + letter + '"');
    }
    const view = rotations[rotation] || rotations[0];
    if (!view) {
      throw new Error('assets: sprite "' + prefix + letter + '" has no rotation ' + rotation);
    }
    return view;
  }

  function texel(view, u, v) {
    return view.sheet[(view.y + v) * view.sw + view.x + u];
  }

  function glyph(fontName, ch) {
    const g = getFont(fontName).glyphs[ch];
    return g === undefined ? null : g;
  }

  // Forgets everything; tests use it to load a synthetic sheets.js.
  function reset() {
    const tables = [sheets, frames, textures, flats, fonts, anims, sprites];
    for (let i = 0; i < tables.length; i++) {
      for (const name in tables[i]) {
        delete tables[i][name];
      }
    }
    decoded = false;
  }

  function isDecoded() {
    return decoded;
  }

  ns.assets = {
    sheets: sheets,
    frames: frames,
    textures: textures,
    flats: flats,
    fonts: fonts,
    anims: anims,
    sprites: sprites,
    sheet: sheet,
    frame: frame,
    texture: texture,
    flat: flat,
    font: font,
    anim: anim,
    decodeAll: decodeAll,
    isDecoded: isDecoded,
    current: current,
    spriteFrame: spriteFrame,
    texel: texel,
    glyph: glyph,
    getSheet: getSheet,
    getFrame: getFrame,
    getTexture: getTexture,
    getFlat: getFlat,
    getFont: getFont,
    getAnim: getAnim,
    hasFrame: hasFrame,
    hasTexture: hasTexture,
    hasFlat: hasFlat,
    hasFont: hasFont,
    loaded: loaded,
    reset: reset
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
