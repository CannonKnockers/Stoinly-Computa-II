/* Synthesised nexus sounds (Web Audio, no files). Every sound is scaled by StoinlySettings.volume(channel),
 * read at play time, so the volume sliders and mute apply straight away. */

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function vol(channel) {
  try { return window.StoinlySettings.volume(channel); } catch { return 0; }
}

function tone(freq, start, dur, gain, type = 'square') {
  const c = ac();
  if (!c || gain <= 0) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** The settings test beep: two square blips at the sfx volume. Returns the gain used (0 = silent). */
export function testBeep() {
  const v = vol('sfx');
  tone(880, 0, 0.12, 0.25 * v);
  tone(1320, 0.13, 0.16, 0.25 * v);
  return v;
}

/** A rising arpeggio at the music volume, standing in for "music". Returns the gain used. */
export function testMusic() {
  const v = vol('music');
  [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.22, 0.16 * v, 'triangle'));
  return v;
}

/** Tiny UI blip for tabs and switches. */
export function blip(up = true) {
  const v = vol('sfx');
  tone(up ? 1046.5 : 659.25, 0, 0.06, 0.08 * v, 'square');
}
