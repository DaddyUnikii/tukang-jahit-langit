/* Tukang Jahit Langit — sky-audio.js
 * Short procedural blips. Silent before unlock() and whenever muted.
 * Attaches window.SkyAudio.
 */
(function (global) {
  'use strict';

  var context = null;
  var isMuted = false;

  var recipes = {
    sew: { type: 'triangle', from: 520, to: 780, seconds: 0.12, gain: 0.16 },
    cut: { type: 'sawtooth', from: 420, to: 120, seconds: 0.16, gain: 0.13 },
    guide: { type: 'sine', from: 660, to: 990, seconds: 0.14, gain: 0.12 },
    win: { type: 'sine', from: 523, to: 1046, seconds: 0.42, gain: 0.2 },
    lose: { type: 'sine', from: 330, to: 110, seconds: 0.5, gain: 0.16 },
    ui: { type: 'square', from: 300, to: 360, seconds: 0.06, gain: 0.07 }
  };

  function Constructor() {
    if (typeof global.AudioContext === 'function') return global.AudioContext;
    if (typeof global.webkitAudioContext === 'function') return global.webkitAudioContext;
    return null;
  }

  function unlock() {
    if (context !== null) {
      if (typeof context.resume === 'function') {
        try { context.resume(); } catch (error) { /* a suspended context may refuse; the blips then stay silent */ }
      }
      return;
    }
    var Ctor = Constructor();
    if (!Ctor) return;
    try {
      context = new Ctor();
    } catch (error) {
      context = null;
    }
  }

  function setMuted(next) {
    isMuted = !!next;
  }

  function muted() {
    return isMuted;
  }

  function play(name) {
    if (isMuted || context === null) return;
    var recipe = recipes[name];
    if (!recipe) return;
    try {
      var osc = context.createOscillator();
      var gain = context.createGain();
      var now = typeof context.currentTime === 'number' ? context.currentTime : 0;
      osc.type = recipe.type;
      if (typeof osc.frequency.setValueAtTime === 'function') {
        osc.frequency.setValueAtTime(recipe.from, now);
        if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
          osc.frequency.exponentialRampToValueAtTime(Math.max(40, recipe.to), now + recipe.seconds);
        }
      }
      if (typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(recipe.gain, now);
        if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
          gain.gain.exponentialRampToValueAtTime(0.0001, now + recipe.seconds);
        }
      }
      if (typeof osc.connect === 'function') osc.connect(gain);
      if (typeof gain.connect === 'function') gain.connect(context.destination);
      if (typeof osc.start === 'function') osc.start(now);
      if (typeof osc.stop === 'function') osc.stop(now + recipe.seconds + 0.02);
    } catch (error) {
      // Audio is decoration: a broken context must never break a move.
    }
  }

  global.SkyAudio = {
    unlock: unlock,
    setMuted: setMuted,
    muted: muted,
    play: play
  };
})(typeof window !== 'undefined' ? window : this);
