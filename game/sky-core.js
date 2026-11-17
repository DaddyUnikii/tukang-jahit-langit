/* Tukang Jahit Langit — sky-core.js
 * Pure state engine. No DOM, no canvas, no timers, no randomness.
 * Attaches window.SkyCore.
 */
(function (global) {
  'use strict';

  var STRANDS_MIN = 1;
  var STRANDS_MAX = 2;

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      var list = [];
      for (var i = 0; i < value.length; i++) list.push(clone(value[i]));
      return list;
    }
    var out = {};
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = clone(value[key]);
    }
    return out;
  }

  function isIndex(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0;
  }

  function pointOf(level, index) {
    if (!level || !level.islands) return null;
    var island = level.islands[index];
    return island ? island : null;
  }

  function distanceBetween(level, a, b) {
    var pa = pointOf(level, a);
    var pb = pointOf(level, b);
    if (!pa || !pb) return 0;
    var dx = pa.x - pb.x;
    var dy = pa.y - pb.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lengthOfLevel(level, a, b) {
    return Math.max(1, Math.round(distanceBetween(level, a, b) / 120));
  }

  function isLink(level, a, b) {
    if (!level || !level.links || a === b) return false;
    for (var i = 0; i < level.links.length; i++) {
      var link = level.links[i];
      if ((link[0] === a && link[1] === b) || (link[0] === b && link[1] === a)) return true;
    }
    return false;
  }

  function isStorm(level, index) {
    if (!level || !level.storm || !level.storm.length) return false;
    for (var i = 0; i < level.storm.length; i++) if (level.storm[i] === index) return true;
    return false;
  }

  function findBridge(state, a, b) {
    var bridges = state.bridges || [];
    for (var i = 0; i < bridges.length; i++) {
      var bridge = bridges[i];
      if ((bridge.a === a && bridge.b === b) || (bridge.a === b && bridge.b === a)) return bridge;
    }
    return null;
  }

  function bridgesAt(state, index) {
    var found = [];
    var bridges = state.bridges || [];
    for (var i = 0; i < bridges.length; i++) {
      if (bridges[i].a === index || bridges[i].b === index) found.push(bridges[i]);
    }
    return found;
  }

  function other(bridge, index) {
    return bridge.a === index ? bridge.b : bridge.a;
  }

  function capacity(bridge) {
    return bridge && bridge.strands === 2 ? 3 : 1;
  }

  function neighbours(state, index) {
    var out = [];
    var found = bridgesAt(state, index);
    for (var i = 0; i < found.length; i++) out.push(other(found[i], index));
    return out;
  }

  /* Hop counts to the house over the level's legal links: the route the flock intends to take. */
  function stridesToHouse(state) {
    var house = state.level.house;
    var links = state.level.links || [];
    var dist = {};
    dist[house] = 0;
    var queue = [house];
    for (var head = 0; head < queue.length; head++) {
      var at = queue[head];
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var next = link[0] === at ? link[1] : link[1] === at ? link[0] : -1;
        if (next < 0) continue;
        if (Object.prototype.hasOwnProperty.call(dist, next)) continue;
        dist[next] = dist[at] + 1;
        queue.push(next);
      }
    }
    return dist;
  }

  /* Can a flock of `flock` walk from `from` to `to` over bridges that can carry it? */
  function carries(state, from, to, flock) {
    if (from === to) return true;
    var seen = {};
    var queue = [from];
    seen[from] = true;
    for (var head = 0; head < queue.length; head++) {
      var at = queue[head];
      var here = bridgesAt(state, at);
      for (var i = 0; i < here.length; i++) {
        if (capacity(here[i]) < flock) continue;
        var next = other(here[i], at);
        if (seen[next]) continue;
        if (next === to) return true;
        seen[next] = true;
        queue.push(next);
      }
    }
    return false;
  }

  function createState(level) {
    if (!level || typeof level !== 'object') throw new TypeError('SkyCore.createState: a level is required');
    return {
      levelId: level.id,
      level: clone(level),
      bridges: [],
      thread: level.thread,
      flock: level.flock,
      at: level.start,
      home: 0,
      moves: 0,
      flowers: [],
      history: [],
      status: 'playing'
    };
  }

  function restoreInto(state, bare, history) {
    var out = clone(bare);
    out.history = history;
    out.level = clone(state.level);
    return out;
  }

  function pushHistory(state, out) {
    var bare = clone(state);
    bare.history = [];
    out.history = state.history.concat([bare]);
    return out;
  }

  // A refusal still hands back a state of its own: nothing the caller does to it can reach the input.
  function fail(error, state) {
    return { ok: false, error: error, state: clone(state) };
  }

  function spent(state) {
    var total = 0;
    for (var i = 0; i < state.bridges.length; i++) {
      total += state.bridges[i].len * state.bridges[i].strands;
    }
    return total;
  }

  function conservation(state) {
    return state.thread + spent(state) === state.level.thread;
  }

  function strandCount(value) {
    if (value === undefined || value === null) return STRANDS_MIN;
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value) return NaN;
    if (value < STRANDS_MIN || value > STRANDS_MAX) return NaN;
    return value;
  }

  function sew(state, a, b, strands) {
    var wanted = strandCount(strands);
    if (wanted !== wanted) return fail('strands', state);
    if (state.flight === true) return fail('busy', state);
    if (!isIndex(a) || !isIndex(b)) return fail('no-link', state);
    if (!isLink(state.level, a, b)) return fail('no-link', state);
    if (findBridge(state, a, b)) return fail('exists', state);
    if (isStorm(state.level, a) || isStorm(state.level, b)) return fail('storm', state);
    var len = lengthOfLevel(state.level, a, b);
    var cost = len * wanted;
    if (state.thread < cost) return fail('no-thread', state);

    var out = clone(state);
    out.bridges.push({ a: a, b: b, strands: wanted, len: len });
    out.thread = state.thread - cost;
    out.moves = state.moves + 1;
    return { ok: true, state: pushHistory(state, out) };
  }

  function cut(state, a, b) {
    if (state.flight === true) return fail('busy', state);
    if (!isIndex(a) || !isIndex(b)) return fail('none', state);
    var bridge = findBridge(state, a, b);
    if (!bridge) return fail('none', state);
    if (state.at === a || state.at === b) return fail('occupied', state);

    var out = clone(state);
    var kept = [];
    for (var i = 0; i < out.bridges.length; i++) {
      var one = out.bridges[i];
      var same = (one.a === bridge.a && one.b === bridge.b) || (one.a === bridge.b && one.b === bridge.a);
      if (!same) kept.push(one);
    }
    out.bridges = kept;
    out.thread = state.thread + bridge.len * bridge.strands;
    out.moves = state.moves + 1;
    return { ok: true, state: pushHistory(state, out) };
  }

  function upgrade(state, a, b) {
    if (state.flight === true) return fail('busy', state);
    if (!isIndex(a) || !isIndex(b)) return fail('none', state);
    var bridge = findBridge(state, a, b);
    if (!bridge) return fail('none', state);
    if (bridge.strands === STRANDS_MAX) return fail('exists', state);
    if (state.thread < bridge.len) return fail('no-thread', state);

    var out = clone(state);
    for (var i = 0; i < out.bridges.length; i++) {
      var one = out.bridges[i];
      var same = (one.a === bridge.a && one.b === bridge.b) || (one.a === bridge.b && one.b === bridge.a);
      if (same) one.strands = STRANDS_MAX;
    }
    out.thread = state.thread - bridge.len;
    out.moves = state.moves + 1;
    return { ok: true, state: pushHistory(state, out) };
  }

  function guide(state) {
    if (state.status !== 'playing') return fail('over', state);
    if (state.flight === true) return fail('busy', state);
    var here = bridgesAt(state, state.at);
    if (!here.length) return fail('no-route', state);

    var dist = stridesToHouse(state);
    var best = -1;
    var bestKey = null;
    for (var i = 0; i < here.length; i++) {
      var next = other(here[i], state.at);
      var reach = Object.prototype.hasOwnProperty.call(dist, next) ? dist[next] : Infinity;
      // Shortest remaining path wins; a tie goes to the lower far island, so the route is fixed for a state.
      var key = [reach, next];
      if (bestKey === null || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        bestKey = key;
        best = i;
      }
    }
    var chosen = here[best];
    var far = other(chosen, state.at);
    var out = clone(state);
    out.moves = state.moves + 1;

    if (capacity(chosen) < state.flock) {
      var kept = [];
      for (var k = 0; k < out.bridges.length; k++) {
        var one = out.bridges[k];
        var same = (one.a === chosen.a && one.b === chosen.b) || (one.a === chosen.b && one.b === chosen.a);
        if (!same) kept.push(one);
      }
      out.bridges = kept;
      if (!carries(out, out.at, out.level.house, out.flock)) out.status = 'lost';
      return { ok: true, state: pushHistory(state, out) };
    }

    out.at = far;
    var flower = out.level.flower;
    if (flower !== null && flower !== undefined && flower !== -1) {
      if (out.at === flower && out.flowers.indexOf(flower) < 0) out.flowers.push(flower);
    }
    if (out.at === out.level.house) {
      out.home = state.home + state.flock;
      out.flock = 0;
      out.status = 'won';
    }
    return { ok: true, state: pushHistory(state, out) };
  }

  function undo(state) {
    var history = state.history || [];
    if (!history.length) return fail('no-history', state);
    var bare = history[history.length - 1];
    var out = restoreInto(state, bare, history.slice(0, history.length - 1));
    return { ok: true, state: out };
  }

  function restart(state) {
    return { ok: true, state: createState(state.level) };
  }

  function stars(state) {
    if (state.status === 'lost') return 0;
    var target = state.level.moves;
    if (state.moves <= target) return 3;
    if (state.moves <= Math.ceil(target * 1.5)) return 2;
    return 1;
  }

  function status(state) {
    return state.status;
  }

  function lengthOf(state, a, b) {
    return lengthOfLevel(state.level, a, b);
  }

  function snapshot(state) {
    return clone(state);
  }

  global.SkyCore = {
    createState: createState,
    sew: sew,
    cut: cut,
    upgrade: upgrade,
    guide: guide,
    undo: undo,
    restart: restart,
    stars: stars,
    status: status,
    lengthOf: lengthOf,
    capacity: capacity,
    conservation: conservation,
    snapshot: snapshot
  };
})(typeof window !== 'undefined' ? window : this);
