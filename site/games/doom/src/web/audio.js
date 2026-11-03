(function (ns) {
  'use strict';
  // audio.js: Web Audio for the browser. Sounds are synthesized once (src/core/synth.js)
  // into AudioBuffers when the first key or click allows audio; each game sound event plays
  // with volume by distance (full within 4 units, silent at 20) and a left-right pan by
  // angle. Music is rendered by src/core/music.js into a looping buffer per song. The two
  // gains come from the game (its volume sliders times the STOINLY NEXUS sfx and music).

  const RATE = 11025;

  function create() {
    let ctx = null;
    let sfxGain = null;
    let musGain = null;
    const buffers = {};
    const songs = {};
    let current = null;
    let currentName = null;
    let pending = null;
    const playingAt = {};

    function unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        return;
      }
      ctx = new AC();
      sfxGain = ctx.createGain();
      musGain = ctx.createGain();
      sfxGain.connect(ctx.destination);
      musGain.connect(ctx.destination);
      if (pending) {
        playSong(pending);
      }
    }

    function buffer(name) {
      if (buffers[name] !== undefined) {
        return buffers[name];
      }
      const def = ns.defs.sounds[name];
      if (!def) {
        buffers[name] = null;
        return null;
      }
      const pcm = ns.synth.render(def, RATE);
      const b = ctx.createBuffer(1, pcm.length, RATE);
      b.copyToChannel(pcm, 0);
      buffers[name] = { buffer: b, volume: def.volume === undefined ? 1 : def.volume };
      return buffers[name];
    }

    function play(name, listener, x, y, now) {
      if (!ctx) {
        return;
      }
      const b = buffer(name);
      if (!b) {
        return;
      }
      // the same sound twice in one tic is one sound, as with Doom's channels
      if (playingAt[name] === now) {
        return;
      }
      playingAt[name] = now;
      let vol = b.volume;
      let pan = 0;
      if (listener && x !== null && x !== undefined) {
        const d = Math.hypot(x - listener.x, y - listener.y);
        vol *= d < 4 ? 1 : Math.max(0, 1 - (d - 4) / 16);
        let a = Math.atan2(y - listener.y, x - listener.x) - listener.angle;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        pan = Math.sin(a) * 0.7;
      }
      if (vol <= 0.01) {
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = b.buffer;
      const g = ctx.createGain();
      g.gain.value = vol;
      let node = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        node = p;
      }
      src.connect(g);
      node.connect(sfxGain);
      src.start();
    }

    function playSong(name) {
      if (!ctx) {
        pending = name;
        return;
      }
      if (name === currentName) {
        return;
      }
      currentName = name;
      if (current) {
        try {
          current.stop();
        } catch (e) {
          // already stopped
        }
        current = null;
      }
      const def = ns.music && ns.music.songs[name];
      if (!def) {
        return;
      }
      if (!songs[name]) {
        const pcm = ns.music.renderLoop(def, 22050);
        const b = ctx.createBuffer(1, pcm.length, 22050);
        b.copyToChannel(pcm, 0);
        songs[name] = b;
      }
      const src = ctx.createBufferSource();
      src.buffer = songs[name];
      src.loop = true;
      src.connect(musGain);
      src.start();
      current = src;
    }

    // Final gains, 0..1: the game's app.mix() (its sliders times the nexus volumes).
    function volumes(sfx, music) {
      if (!ctx) {
        return;
      }
      sfxGain.gain.value = sfx;
      musGain.gain.value = music;
    }

    return { unlock: unlock, play: play, playSong: playSong, volumes: volumes, ready: function () { return Boolean(ctx); } };
  }

  ns.web = ns.web || {};
  ns.web.audio = { create: create };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
