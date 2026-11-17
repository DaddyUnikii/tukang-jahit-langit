/* Tukang Jahit Langit — sky-progress.js
 * Saved progress: unlocked evening, stars, language, mute. Never throws.
 * Attaches window.SkyProgress.
 */
(function (global) {
  'use strict';

  var KEY = 'tukang-jahit-langit-progress-v1';
  var LEVELS = 8;

  function defaults() {
    var stars = [];
    for (var i = 0; i < LEVELS; i++) stars.push(0);
    return { unlocked: 1, stars: stars, lang: 'en', muted: false };
  }

  function storage() {
    try {
      var store = global.localStorage;
      if (!store || typeof store.getItem !== 'function') return null;
      return store;
    } catch (error) {
      return null;
    }
  }

  function wholeNumber(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }

  /* A stored number is pulled into range and onto whole numbers; anything else falls back. */
  function clamp(value, low, high, fallback) {
    if (typeof value !== 'number' || !isFinite(value)) return fallback;
    var whole = Math.floor(value);
    if (whole < low) return low;
    if (whole > high) return high;
    return whole;
  }

  function sanitise(raw) {
    var out = defaults();
    if (!raw || typeof raw !== 'object') return out;
    out.unlocked = clamp(raw.unlocked, 1, LEVELS, 1);
    out.lang = raw.lang === 'id' ? 'id' : 'en';
    out.muted = raw.muted === true;
    var stars = raw.stars;
    if (Array.isArray(stars)) {
      for (var i = 0; i < LEVELS; i++) out.stars[i] = clamp(stars[i], 0, 3, 0);
    }
    return out;
  }

  function parse(text) {
    if (typeof text !== 'string' || text.length === 0) return defaults();
    var raw;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      return defaults();
    }
    return sanitise(raw);
  }

  function load() {
    var store = storage();
    if (!store) return defaults();
    var text = null;
    try {
      text = store.getItem(KEY);
    } catch (error) {
      return defaults();
    }
    return parse(text);
  }

  function persist(value) {
    var store = storage();
    if (!store || typeof store.setItem !== 'function') return;
    try {
      store.setItem(KEY, JSON.stringify(value));
    } catch (error) {
      // A full or read-only store loses the save, never the game.
    }
  }

  function save(patch) {
    var current = load();
    var next = sanitise(current);
    if (patch && typeof patch === 'object') {
      if (Object.prototype.hasOwnProperty.call(patch, 'unlocked')) next.unlocked = patch.unlocked;
      if (Object.prototype.hasOwnProperty.call(patch, 'stars')) next.stars = patch.stars;
      if (Object.prototype.hasOwnProperty.call(patch, 'lang')) next.lang = patch.lang;
      if (Object.prototype.hasOwnProperty.call(patch, 'muted')) next.muted = patch.muted;
      next = sanitise(next);
    }
    persist(next);
    return next;
  }

  function reset() {
    var fresh = defaults();
    persist(fresh);
    return fresh;
  }

  global.SkyProgress = {
    load: load,
    save: save,
    reset: reset,
    key: KEY
  };
})(typeof window !== 'undefined' ? window : this);
