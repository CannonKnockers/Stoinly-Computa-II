(function (ns) {
  'use strict';
  // kit.js: how the six maps are written. A map is one block of ASCII rows; each character
  // is a cell type from `cells`, or a thing from `things` standing on a cell type (`on`).
  // Tags can be given as characters (every cell drawn with that character belongs to the
  // tag). make() turns this into the level format of architecture section 7 and registers
  // it in STOINLY.levels.

  function make(spec) {
    const rows = spec.map;
    const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const grid = [];
    const things = [];
    const legend = Object.assign({}, spec.cells);
    const thingLegend = {};
    const tags = Object.assign({}, spec.tags || {});
    const tagChars = spec.tagChars || {};
    const tagByChar = {};
    for (const name in tagChars) {
      tags[name] = tags[name] || [];
      for (const ch of tagChars[name]) {
        (tagByChar[ch] = tagByChar[ch] || []).push(name);
      }
    }
    let tcode = 0;
    const thingCode = {};
    rows.forEach(function (row, y) {
      if (row.length !== w) {
        throw new Error('levels/kit: ' + spec.slug + ' row ' + y + ' is ' + row.length + ' wide, not ' + w);
      }
      let g = '';
      let t = '';
      for (let x = 0; x < w; x++) {
        const ch = row.charAt(x);
        const th = spec.things && spec.things[ch];
        if (th) {
          g += th.on;
          if (!thingCode[ch]) {
            // things layer characters: any printable ASCII not used as '.'
            const code = String.fromCharCode(33 + tcode++);
            thingCode[ch] = code === '.' ? String.fromCharCode(33 + tcode++) : code;
            const entry = Object.assign({}, th);
            delete entry.on;
            thingLegend[thingCode[ch]] = entry;
          }
          t += thingCode[ch];
        } else {
          if (legend[ch] === undefined) {
            throw new Error('levels/kit: ' + spec.slug + ' row ' + y + ' col ' + x + ': no cell or thing for "' + ch + '"');
          }
          g += ch;
          t += '.';
        }
        const cellCh = th ? th.on : ch;
        (tagByChar[ch] || []).concat(th ? (tagByChar[cellCh] || []) : []).forEach(function (name) {
          tags[name].push([x, y]);
        });
      }
      grid.push(g);
      things.push(t);
    });
    const def = {
      slug: spec.slug,
      name: spec.name,
      hour: spec.hour,
      hourNum: spec.hourNum,
      card: spec.card,
      music: spec.music,
      sky: spec.sky || 'SKY1',
      par: spec.par,
      defaults: spec.defaults,
      legend: legend,
      grid: grid,
      thingLegend: thingLegend,
      things: things,
      tags: tags,
      movers: spec.movers || [],
      triggers: spec.triggers || [],
      extra: spec.extra || []
    };
    ns.levels = ns.levels || [];
    ns.levels.push(def);
    return def;
  }

  // Common cell recipes, so the maps share a vocabulary.
  const C = {
    lot: function (light) {
      return { floor: 'FASPHLT1', ceil: 'SKY', fz: 0, cz: 3, light: light || 9 };
    },
    wall: function (tex, extra) {
      return Object.assign({ wall: tex }, extra || {});
    },
    room: function (floor, ceil, light, extra) {
      return Object.assign({ floor: floor, ceil: ceil, fz: 0, cz: 2, light: light }, extra || {});
    }
  };

  ns.levelKit = { make: make, C: C };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
