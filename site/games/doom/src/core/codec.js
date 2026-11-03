(function (ns) {
  'use strict';
  // codec.js: the RLE+base64 codec of section 9 for sheet pixel data. The RLE stream is pairs
  // [run - 1, index] with runs up to 256; the tools encode, the game decodes once at startup.
  // Decoding works on typed arrays end to end (no per-byte strings) so a 4 MB sheet takes
  // tens of milliseconds, and the base64 reader ignores whitespace so data may be wrapped.

  const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const SEXTET = new Uint8Array(256).fill(255);
  for (let i = 0; i < 64; i++) {
    SEXTET[BASE64.charCodeAt(i)] = i;
  }
  const PAD = '='.charCodeAt(0);
  const CHUNK = 8192;

  function rle(bytes) {
    const n = bytes.length;
    let pairs = 0;
    for (let i = 0; i < n;) {
      let j = i + 1;
      while (j < n && j - i < 256 && bytes[j] === bytes[i]) {
        j++;
      }
      pairs++;
      i = j;
    }
    const out = new Uint8Array(pairs * 2);
    let p = 0;
    for (let i = 0; i < n;) {
      let j = i + 1;
      while (j < n && j - i < 256 && bytes[j] === bytes[i]) {
        j++;
      }
      out[p++] = j - i - 1;
      out[p++] = bytes[i];
      i = j;
    }
    return out;
  }

  // Total pixel count of an RLE stream, for callers that do not know the sheet size.
  function rleLength(stream) {
    let total = 0;
    for (let i = 0; i < stream.length; i += 2) {
      total += stream[i] + 1;
    }
    return total;
  }

  function unrle(stream, length) {
    if (stream.length % 2 !== 0) {
      throw new Error('codec.unrle: stream has an odd length (' + stream.length + ')');
    }
    const total = length === undefined ? rleLength(stream) : length;
    const out = new Uint8Array(total);
    let p = 0;
    for (let i = 0; i < stream.length; i += 2) {
      const run = stream[i] + 1;
      const value = stream[i + 1];
      if (p + run > total) {
        throw new Error('codec.unrle: stream holds more than ' + total + ' pixels');
      }
      if (run === 1) {
        out[p] = value;
      } else {
        out.fill(value, p, p + run);
      }
      p += run;
    }
    if (p !== total) {
      throw new Error('codec.unrle: stream holds ' + p + ' pixels, expected ' + total);
    }
    return out;
  }

  function toBase64(bytes) {
    const n = bytes.length;
    const codes = new Uint8Array(Math.ceil(n / 3) * 4);
    let p = 0;
    let i = 0;
    for (; i + 2 < n; i += 3) {
      const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      codes[p++] = BASE64.charCodeAt((v >> 18) & 63);
      codes[p++] = BASE64.charCodeAt((v >> 12) & 63);
      codes[p++] = BASE64.charCodeAt((v >> 6) & 63);
      codes[p++] = BASE64.charCodeAt(v & 63);
    }
    if (i < n) {
      const v = (bytes[i] << 16) | ((i + 1 < n ? bytes[i + 1] : 0) << 8);
      codes[p++] = BASE64.charCodeAt((v >> 18) & 63);
      codes[p++] = BASE64.charCodeAt((v >> 12) & 63);
      codes[p++] = i + 1 < n ? BASE64.charCodeAt((v >> 6) & 63) : PAD;
      codes[p++] = PAD;
    }
    const parts = [];
    for (let s = 0; s < codes.length; s += CHUNK) {
      parts.push(String.fromCharCode.apply(null, codes.subarray(s, Math.min(s + CHUNK, codes.length))));
    }
    return parts.join('');
  }

  function fromBase64(text) {
    const n = text.length;
    const out = new Uint8Array(Math.floor(n * 3 / 4) + 3);
    let p = 0;
    let acc = 0;
    let bits = 0;
    for (let i = 0; i < n; i++) {
      const c = text.charCodeAt(i);
      if (c === PAD) {
        break;
      }
      const v = c < 256 ? SEXTET[c] : 255;
      if (v === 255) {
        if (c === 10 || c === 13 || c === 32 || c === 9) {
          continue;
        }
        throw new Error('codec.fromBase64: invalid character at ' + i);
      }
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[p++] = (acc >> bits) & 255;
        acc &= (1 << bits) - 1;
      }
    }
    return out.subarray(0, p);
  }

  function encode(bytes) {
    return toBase64(rle(bytes));
  }

  function decode(text, length) {
    return unrle(fromBase64(text), length);
  }

  ns.codec = {
    rle: rle,
    unrle: unrle,
    rleLength: rleLength,
    toBase64: toBase64,
    fromBase64: fromBase64,
    encode: encode,
    decode: decode
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
