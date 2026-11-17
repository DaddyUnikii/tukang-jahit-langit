/* Tukang Jahit Langit — sky-render.js
 * Geometry and Canvas2D painting. No game logic, no state mutation.
 * Attaches window.SkyRender.
 */
(function (global) {
  'use strict';

  var BOARD_W = 1280;
  var BOARD_H = 720;
  var ISLAND_HIT = 26;
  var BRIDGE_HIT = 14;
  var TOOLBAR_IDS = ['sew', 'guide', 'cut', 'undo', 'restart', 'strand', 'help', 'book', 'lang', 'sound'];
  var TOOLBAR_KEYS = {
    sew: 'S',
    guide: 'G',
    cut: 'C',
    undo: 'U',
    restart: 'R',
    strand: '1/2',
    help: '?',
    book: 'B',
    lang: 'L',
    sound: 'M'
  };

  function labelFor(id, lang) {
    var en = {
      sew: 'Sew', guide: 'Guide', cut: 'Cut', undo: 'Undo', restart: 'Restart',
      strand: 'Strand', help: 'Help', book: 'Book', lang: 'ID', sound: 'Sound'
    };
    var id_ = {
      sew: 'Jahit', guide: 'Antar', cut: 'Potong', undo: 'Urung', restart: 'Ulang',
      strand: 'Lapis', help: 'Bantu', book: 'Buku', lang: 'EN', sound: 'Suara'
    };
    return (lang === 'id' ? id_ : en)[id] || id;
  }

  function levelOf(state) {
    return (state && state.level) || { islands: [], links: [], house: 0, flower: null, storm: [] };
  }

  function scaleFor(width, height) {
    var w = Number(width) > 0 ? Number(width) : BOARD_W;
    var h = Number(height) > 0 ? Number(height) : BOARD_H;
    return { sx: w / BOARD_W, sy: h / BOARD_H, w: w, h: h };
  }

  function project(level, index, width, height, pad) {
    var size = scaleFor(width, height);
    var island = level.islands[index];
    if (!island) return null;
    var margin = pad === undefined ? 34 : pad;
    var x = island.x * size.sx;
    var y = island.y * size.sy;
    var maxX = Math.max(margin, size.w - margin);
    var maxY = Math.max(margin, size.h - margin);
    return {
      x: Math.min(maxX, Math.max(margin, x)),
      y: Math.min(maxY, Math.max(margin, y)),
      label: island.label === undefined ? String(index + 1) : String(island.label),
      index: index
    };
  }

  function layout(state, width, height) {
    var level = levelOf(state);
    var size = scaleFor(width, height);
    var islands = [];
    for (var i = 0; i < level.islands.length; i++) islands.push(project(level, i, size.w, size.h));

    var houseIslandId = typeof level.house === 'number' ? level.house : -1;
    var housePoint = islands[houseIslandId] || islands[0] || { x: size.w / 2, y: size.h / 2 };
    var house = { x: housePoint.x, y: housePoint.y - 26 };

    var pad = Math.max(6, Math.min(18, Math.round(size.w * 0.012)));
    var gap = Math.max(2, Math.round(size.w * 0.004));
    var count = TOOLBAR_IDS.length;
    var totalGap = gap * (count - 1) + pad * 2;
    var slot = Math.max(18, Math.floor((size.w - totalGap) / count));
    var heightOfBar = Math.max(20, Math.min(44, Math.round(size.h * 0.06)));
    var barY = Math.max(0, size.h - heightOfBar - pad);
    if (barY + heightOfBar > size.h) barY = Math.max(0, size.h - heightOfBar);

    var toolbar = [];
    for (var t = 0; t < count; t++) {
      var id = TOOLBAR_IDS[t];
      var x = pad + t * (slot + gap);
      var w = slot;
      if (x + w > size.w) {
        w = Math.max(1, size.w - x);
      }
      toolbar.push({
        id: id,
        label: labelFor(id, 'en'),
        key: TOOLBAR_KEYS[id],
        rect: { x: x, y: barY, w: w, h: heightOfBar }
      });
    }

    var hud = {
      rect: { x: pad, y: pad, w: Math.max(1, size.w - pad * 2), h: Math.max(1, Math.round(size.h * 0.06)) },
      line: '',
      thread: state && typeof state.thread === 'number' ? state.thread : 0,
      flock: state && typeof state.flock === 'number' ? state.flock : 0,
      home: state && typeof state.home === 'number' ? state.home : 0,
      moves: state && typeof state.moves === 'number' ? state.moves : 0
    };

    return { islands: islands, house: house, houseIslandId: houseIslandId, toolbar: toolbar, hud: hud, width: size.w, height: size.h };
  }

  function islandAt(state, x, y, width, height) {
    var board = layout(state, width, height);
    var best = -1;
    var bestDistance = Infinity;
    for (var i = 0; i < board.islands.length; i++) {
      var island = board.islands[i];
      var dx = island.x - x;
      var dy = island.y - y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= ISLAND_HIT && distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  }

  function segmentDistance(px, py, ax, ay, bx, by) {
    var vx = bx - ax;
    var vy = by - ay;
    var lengthSquared = vx * vx + vy * vy;
    if (lengthSquared === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
    var t = ((px - ax) * vx + (py - ay) * vy) / lengthSquared;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var cx = ax + t * vx;
    var cy = ay + t * vy;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
  }

  function bridgeAt(state, x, y, width, height) {
    if (!state || !state.bridges || !state.bridges.length) return null;
    var board = layout(state, width, height);
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < state.bridges.length; i++) {
      var bridge = state.bridges[i];
      var pa = board.islands[bridge.a];
      var pb = board.islands[bridge.b];
      if (!pa || !pb) continue;
      var distance = segmentDistance(x, y, pa.x, pa.y, pb.x, pb.y);
      if (distance <= BRIDGE_HIT && distance < bestDistance) {
        bestDistance = distance;
        best = { a: bridge.a, b: bridge.b };
      }
    }
    return best;
  }

  // ------------------------------------------------------------ painting

  function tornPaper(ctx, width, height) {
    var bands = ['#101a2e', '#15233d', '#1a2d4c', '#20375a', '#274266'];
    for (var i = 0; i < bands.length; i++) {
      var top = Math.round((height / bands.length) * i);
      var bottom = Math.round((height / bands.length) * (i + 1));
      ctx.fillStyle = bands[i];
      ctx.beginPath();
      ctx.moveTo(0, top);
      for (var x = 0; x <= width; x += 40) {
        var wobble = Math.sin((x + i * 33) * 0.013) * 6 + Math.cos(x * 0.031 + i) * 3;
        ctx.lineTo(x, top + wobble);
      }
      ctx.lineTo(width, bottom);
      for (var x2 = width; x2 >= 0; x2 -= 40) {
        var wobble2 = Math.cos((x2 + i * 21) * 0.011) * 7;
        ctx.lineTo(x2, bottom + wobble2);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(240, 226, 196, 0.06)';
    ctx.lineWidth = 1;
    for (var y = 24; y < height; y += 37) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y * 0.05) * 3);
      ctx.lineTo(width, y + Math.cos(y * 0.04) * 4);
      ctx.stroke();
    }
  }

  function drawStars(ctx, x, y, count) {
    ctx.fillStyle = 'rgba(255, 244, 214, 0.35)';
    for (var i = 0; i < 42; i++) {
      var sx = ((i * 199) % Math.max(1, Math.round(x))) + 3;
      var sy = ((i * 137) % Math.max(1, Math.round(y))) + 3;
      var size = 1 + (i % 3) * 0.6;
      ctx.fillRect(sx, sy, size, size);
    }
  }

  function drawLinks(ctx, state, board) {
    var level = levelOf(state);
    var links = level.links || [];
    var sewn = {};
    var bridges = (state && state.bridges) || [];
    for (var i = 0; i < bridges.length; i++) {
      var key = bridges[i].a + ':' + bridges[i].b;
      sewn[key] = true;
      sewn[bridges[i].b + ':' + bridges[i].a] = true;
    }
    ctx.save();
    ctx.setLineDash([6, 9]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(198, 214, 240, 0.28)';
    for (var l = 0; l < links.length; l++) {
      var a = links[l][0];
      var b = links[l][1];
      if (sewn[a + ':' + b]) continue;
      var pa = board.islands[a];
      var pb = board.islands[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBridges(ctx, state, board) {
    var bridges = (state && state.bridges) || [];
    for (var i = 0; i < bridges.length; i++) {
      var bridge = bridges[i];
      var pa = board.islands[bridge.a];
      var pb = board.islands[bridge.b];
      if (!pa || !pb) continue;
      var dx = pb.x - pa.x;
      var dy = pb.y - pa.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len;
      var ny = dx / len;
      var offsets = bridge.strands === 2 ? [-3.5, 3.5] : [0];
      for (var s = 0; s < offsets.length; s++) {
        var off = offsets[s];
        ctx.strokeStyle = bridge.strands === 2 ? '#ffe08a' : '#f6c860';
        ctx.lineWidth = bridge.strands === 2 ? 3 : 4;
        ctx.beginPath();
        ctx.moveTo(pa.x + nx * off, pa.y + ny * off);
        ctx.lineTo(pb.x + nx * off, pb.y + ny * off);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120, 74, 20, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }

  function drawIslandPins(ctx, state, board) {
    var level = levelOf(state);
    var storm = level.storm || [];
    for (var i = 0; i < board.islands.length; i++) {
      var island = board.islands[i];
      var isStorm = storm.indexOf(i) >= 0;
      ctx.beginPath();
      ctx.arc(island.x, island.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = isStorm ? '#3a2a3f' : '#efe3c6';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isStorm ? '#b06ad8' : '#8a7348';
      ctx.stroke();

      if (isStorm) {
        ctx.save();
        ctx.shadowColor = 'rgba(190, 120, 255, 0.9)';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(210, 150, 255, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(island.x, island.y, 27, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = isStorm ? '#e8d4ff' : '#33301f';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(island.label, island.x, island.y + 1);
    }
  }

  function drawHouse(ctx, board) {
    var house = board.house;
    var x = house.x;
    var y = house.y;
    ctx.save();
    ctx.fillStyle = '#f3d9a4';
    ctx.fillRect(x - 14, y - 6, 28, 22);
    ctx.beginPath();
    ctx.moveTo(x - 20, y - 6);
    ctx.lineTo(x, y - 26);
    ctx.lineTo(x + 20, y - 6);
    ctx.closePath();
    ctx.fillStyle = '#a4552f';
    ctx.fill();
    ctx.fillStyle = '#ffd873';
    ctx.fillRect(x - 5, y + 2, 10, 14);
    ctx.shadowColor = 'rgba(255, 214, 120, 0.85)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(x, y + 2, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 214, 120, 0.28)';
    ctx.fill();
    ctx.restore();
  }

  function drawFlower(ctx, board, level) {
    var flower = level.flower;
    if (flower === null || flower === undefined || flower === -1) return;
    var island = board.islands[flower];
    if (!island) return;
    var x = island.x + 17;
    var y = island.y - 17;
    ctx.save();
    ctx.fillStyle = '#f28fb8';
    for (var p = 0; p < 5; p++) {
      var angle = (Math.PI * 2 * p) / 5;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFlock(ctx, state, board) {
    var at = state && typeof state.at === 'number' ? state.at : -1;
    var island = board.islands[at];
    if (!island) return;
    var flock = state && typeof state.flock === 'number' ? state.flock : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 240, 160, 0.95)';
    ctx.shadowColor = 'rgba(255, 228, 120, 0.95)';
    ctx.shadowBlur = 14;
    for (var i = 0; i < Math.max(1, flock); i++) {
      var angle = (Math.PI * 2 * i) / Math.max(1, flock) + 0.6;
      var cx = island.x + Math.cos(angle) * 11;
      var cy = island.y - 22 + Math.sin(angle) * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  var METHODS = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'rect', 'fill',
    'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'setLineDash', 'translate',
    'rotate', 'scale', 'clip', 'ellipse'
  ];

  /* A context may be a stub with only some of Canvas2D. Anything missing becomes a no-op. */
  function guard(ctx) {
    if (!ctx) return null;
    if (typeof Proxy === 'function') {
      return new Proxy(ctx, {
        get: function (target, key) {
          var value = target[key];
          if (typeof value === 'function') return value.bind(target);
          if (value === undefined) return function () {};
          return value;
        },
        set: function (target, key, value) {
          try { target[key] = value; } catch (error) { /* a frozen stub keeps its own values */ }
          return true;
        }
      });
    }
    var copy = {};
    for (var i = 0; i < METHODS.length; i++) {
      var name = METHODS[i];
      copy[name] = typeof ctx[name] === 'function' ? ctx[name].bind(ctx) : function () {};
    }
    return copy;
  }

  function draw(rawCtx, state, opts) {
    var options = opts || {};
    var ctx = guard(rawCtx);
    if (!ctx) return;
    var width = options.width || (rawCtx && rawCtx.canvas && rawCtx.canvas.width) || BOARD_W;
    var height = options.height || (rawCtx && rawCtx.canvas && rawCtx.canvas.height) || BOARD_H;
    var board = layout(state, width, height);
    var level = levelOf(state);

    ctx.clearRect(0, 0, width, height);
    tornPaper(ctx, width, height);
    drawStars(ctx, width, height);
    drawLinks(ctx, state, board);
    drawBridges(ctx, state, board);
    drawHouse(ctx, board);
    drawIslandPins(ctx, state, board);
    drawFlower(ctx, board, level);
    drawFlock(ctx, state, board);

    if (options.pending !== undefined && options.pending !== null) {
      var island = board.islands[options.pending];
      if (island) {
        ctx.save();
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(island.x, island.y, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  global.SkyRender = {
    layout: layout,
    islandAt: islandAt,
    bridgeAt: bridgeAt,
    draw: draw,
    toolbarIds: TOOLBAR_IDS.slice()
  };
})(typeof window !== 'undefined' ? window : this);
