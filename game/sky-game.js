/* Tukang Jahit Langit — sky-game.js
 * The controller: owns the DOM, the only code that talks to the engine.
 * Attaches window.SkyGame and window.skyDebug.
 */
(function (global) {
  'use strict';

  var doc = global.document || null;
  var FLIGHT_MS = 700;
  var STRANDS = [1, 2];

  var level = null;
  var state = null;
  var screen = 'title';
  var modal = null;
  var mode = 'sew';
  var strands = 1;
  var pendingIsland = -1;
  var flyUntil = 0;
  var bound = false;

  function blank() {
    return { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0], lang: 'en', muted: false };
  }

  // Always an object: a command may run before boot(), so nothing may read a null save.
  var progress = blank();

  // Button captions, kept apart from the prose: `help` is both a command and a paragraph list.
  var LABELS = {
    en: { sew: 'Sew', guide: 'Guide', cut: 'Cut', undo: 'Undo', restart: 'Restart', strand: 'Strand', help: 'Help', book: 'Book', lang: 'ID', sound: 'Sound' },
    id: { sew: 'Jahit', guide: 'Antar', cut: 'Potong', undo: 'Urung', restart: 'Ulang', strand: 'Lapis', help: 'Bantu', book: 'Buku', lang: 'EN', sound: 'Suara' }
  };

  function caption(name) {
    var table = LABELS[lang()] || LABELS.en;
    return table[name] || name;
  }

  function ensureProgress() {
    if (!progress) progress = blank();
    if (!progress.stars || !progress.stars.length) progress.stars = blank().stars;
    return progress;
  }

  // ------------------------------------------------------------ text

  var TEXT = {
    en: {
      title: 'Tukang Jahit Langit',
      tagline: 'The sky tore again. Sew the islands back with thread, then walk the fireflies home before the storm eats the seams.',
      play: 'Play',
      evenings: 'Evenings',
      evening: 'Evening',
      levelsTitle: 'Eight evenings',
      locked: 'locked',
      thread: 'Thread',
      flock: 'Flock',
      home: 'Home',
      moves: 'Moves',
      stars: 'Stars',
      sew: 'Sew', guide: 'Guide', cut: 'Cut', undo: 'Undo', restart: 'Restart',
      strand: 'Strand', help: 'Help', book: 'Book', sound: 'Sound',
      helpTitle: 'How to mend the sky',
      help: [
        'Pick Sew and click two islands joined by a dashed link. One sew lays a single thread; two strands hold a heavier flock.',
        'Guide sends the fireflies one hop along the shortest way home. A bridge too thin for the flock snaps and is gone.',
        'Cut takes a bridge back and refunds its thread, but never while the fireflies stand on one of its ends.',
        'Undo steps back one move, Restart begins the evening again. A flower on the way home is worth collecting.'
      ],
      bookTitle: 'The mending book',
      close: 'Close',
      win: 'Evening mended',
      lose: 'A seam snapped',
      endTitle: 'The sky is whole',
      endTotal: 'You gathered {stars} of 24 stars.',
      toast: {
        'no-thread': 'Not enough thread for that seam.',
        'no-link': 'No link runs between those pins.',
        exist: 'Those pins are already sewn.',
        exists: 'Those pins are already sewn.',
        busy: 'The fireflies are still flying.',
        storm: 'That island crackles. It cannot hold a seam.',
        none: 'No bridge runs between those pins.',
        occupied: 'The fireflies are standing on that bridge.',
        'no-route': 'No bridge leaves this island.',
        snap: 'The bridge snapped under the flock.',
        'no-history': 'Nothing to undo.',
        over: 'This evening is over. Restart it.',
        args: 'Pick two islands first.',
        modal: 'Close the window first.',
        flight: 'The fireflies are still flying.',
        'no-level': 'Choose an evening first.',
        strands: 'A seam holds one or two strands.',
        'no-next': 'No evening to move on from.',
        unknown: 'Nothing happens.'
      }
    },
    id: {
      title: 'Tukang Jahit Langit',
      tagline: 'Langit robek lagi. Jahit pulau-pulau itu dengan benang, lalu antar kunang-kunang pulang sebelum badai memakan jahitannya.',
      play: 'Main',
      evenings: 'Malam',
      evening: 'Malam',
      levelsTitle: 'Delapan malam',
      locked: 'terkunci',
      thread: 'Benang',
      flock: 'Kawanan',
      home: 'Rumah',
      moves: 'Langkah',
      stars: 'Bintang',
      sew: 'Jahit', guide: 'Antar', cut: 'Potong', undo: 'Urung', restart: 'Ulang',
      strand: 'Lapis', help: 'Bantu', book: 'Buku', sound: 'Suara',
      helpTitle: 'Cara menambal langit',
      help: [
        'Pilih Jahit lalu klik dua pulau yang tersambung garis putus-putus. Satu jahitan memasang satu benang; dua lapis menahan kawanan yang berat.',
        'Antar menerbangkan kunang-kunang satu lompatan lewat jalan terpendek menuju rumah. Jembatan yang terlalu tipis akan putus dan hilang.',
        'Potong menarik kembali sebuah jembatan dan mengembalikan benangnya, tetapi tidak saat kunang-kunang berdiri di ujungnya.',
        'Urung mundur satu langkah, Ulang memulai malam lagi. Bunga di jalan pulang layak dipetik.'
      ],
      bookTitle: 'Buku tambalan',
      close: 'Tutup',
      win: 'Malam sudah ditambal',
      lose: 'Jahitan putus',
      endTitle: 'Langit sudah utuh',
      endTotal: 'Kau mengumpulkan {stars} dari 24 bintang.',
      toast: {
        'no-thread': 'Benang tidak cukup untuk jahitan itu.',
        'no-link': 'Tidak ada tautan antara kedua pasak itu.',
        exists: 'Kedua pasak itu sudah dijahit.',
        busy: 'Kunang-kunang masih terbang.',
        storm: 'Pulau itu berderak. Tidak bisa dijahit.',
        none: 'Tidak ada jembatan di antara kedua pasak itu.',
        occupied: 'Kunang-kunang berdiri di jembatan itu.',
        'no-route': 'Tidak ada jembatan yang keluar dari pulau ini.',
        snap: 'Jembatan putus di bawah kawanan.',
        'no-history': 'Tidak ada yang bisa diurungkan.',
        over: 'Malam ini sudah selesai. Ulangi dulu.',
        args: 'Pilih dua pulau dulu.',
        modal: 'Tutup jendelanya dulu.',
        flight: 'Kunang-kunang masih terbang.',
        'no-level': 'Pilih malam dulu.',
        strands: 'Satu jahitan memuat satu atau dua lapis.',
        'no-next': 'Tidak ada malam untuk dilanjutkan.',
        unknown: 'Tidak terjadi apa-apa.'
      }
    }
  };

  function words() {
    return TEXT[lang()] || TEXT.en;
  }

  function lang() {
    return progress && progress.lang === 'id' ? 'id' : 'en';
  }

  function nameOf(entry) {
    if (!entry || !entry.name) return '';
    return entry.name[lang()] || entry.name.en || '';
  }

  // ------------------------------------------------------------ dom

  function el(id) {
    if (!doc || typeof doc.getElementById !== 'function') return null;
    try {
      return doc.getElementById(id) || null;
    } catch (error) {
      return null;
    }
  }

  function write(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function toggle(id, visible) {
    var node = el(id);
    if (node) node.hidden = !visible;
  }

  function canvas() {
    return el('board');
  }

  function size() {
    var node = canvas();
    var width = node && node.width ? node.width : 1280;
    var height = node && node.height ? node.height : 720;
    if (!(width > 0)) width = 1280;
    if (!(height > 0)) height = 720;
    return { width: width, height: height };
  }

  function ctxOf() {
    var node = canvas();
    if (!node || typeof node.getContext !== 'function') return null;
    try {
      return node.getContext('2d') || null;
    } catch (error) {
      return null;
    }
  }

  function save() {
    ensureProgress();
    if (!global.SkyProgress) return;
    try {
      progress = global.SkyProgress.save({
        unlocked: progress.unlocked,
        stars: progress.stars,
        lang: progress.lang,
        muted: progress.muted
      });
    } catch (error) {
      // Storage is a convenience; the evening still plays.
    }
  }

  function starsOf(index) {
    if (!progress || !progress.stars) return 0;
    return progress.stars[index] || 0;
  }

  // ------------------------------------------------------------ paint

  function draw() {
    var ctx = ctxOf();
    if (!ctx || !global.SkyRender) return;
    var box = size();
    try {
      global.SkyRender.draw(ctx, state, {
        width: box.width,
        height: box.height,
        mode: mode,
        strands: strands,
        pending: pendingIsland >= 0 ? pendingIsland : null,
        lang: lang()
      });
    } catch (error) {
      // A blank frame is better than a dead game.
    }
  }

  function hud() {
    var map = words();
    if (!level || !state) {
      write('hud-level', '');
      write('hud-thread', '');
      write('hud-flock', '');
      write('hud-home', '');
      write('hud-moves', '');
      write('hud-stars', '');
      return;
    }
    write('hud-level', map.evening + ' ' + level.id + ' · ' + nameOf(level));
    write('hud-thread', map.thread + ' ' + state.thread);
    write('hud-flock', map.flock + ' ' + state.flock);
    write('hud-home', map.home + ' ' + state.home + '/' + level.flock);
    write('hud-moves', map.moves + ' ' + state.moves + '/' + level.moves);
    var earned = global.SkyCore ? global.SkyCore.stars(state) : 0;
    var stars = '';
    for (var i = 0; i < 3; i++) stars += i < earned ? '★' : '☆';
    write('hud-stars', stars);
  }

  function toast(message) {
    var node = el('toast');
    if (!node) return;
    node.textContent = message;
    if (typeof node.classList === 'object' && node.classList && typeof node.classList.add === 'function') {
      node.classList.add('is-visible');
      if (typeof global.setTimeout === 'function') {
        var current = message;
        global.setTimeout(function () {
          if (node.textContent === current && node.classList && typeof node.classList.remove === 'function') {
            node.classList.remove('is-visible');
          }
        }, 2200);
      }
    }
  }

  function refresh() {
    hud();
    draw();
    paintToolbar();
    renderLevelList();
  }

  function paintToolbar() {
    var buttons = listButtons();
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var name = attribute(button, 'data-command');
      if (!name || !button.classList) continue;
      var active = (name === 'sew' || name === 'cut' || name === 'guide') && name === mode;
      if (name === 'strand') active = strands === 2;
      if (typeof button.classList.toggle === 'function') button.classList.toggle('is-active', !!active);
    }
    var langButton = el('toolbar');
    if (langButton) {
      langButton.setAttribute('data-lang', lang());
    }
  }

  function attribute(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return null;
    try {
      return node.getAttribute(name);
    } catch (error) {
      return null;
    }
  }

  function listButtons() {
    var bar = el('toolbar');
    if (!bar) return [];
    var found = [];
    var nodes = bar.querySelectorAll ? bar.querySelectorAll('button') : [];
    for (var i = 0; i < nodes.length; i++) found.push(nodes[i]);
    if (!found.length && bar.children) {
      for (var k = 0; k < bar.children.length; k++) found.push(bar.children[k]);
    }
    return found;
  }

  function renderLevelList() {
    var host = el('level-list');
    if (!host || !doc) return;
    var levels = global.SkyLevels && global.SkyLevels.levels ? global.SkyLevels.levels : [];
    var map = words();
    write('levels-title', map.levelsTitle);
    if (typeof host.replaceChildren === 'function' && typeof doc.createElement === 'function') {
      var frag = [];
      for (var i = 0; i < levels.length; i++) frag.push(levelButton(levels[i]));
      host.replaceChildren.apply(host, frag);
      return;
    }
    if (typeof doc.createElement !== 'function') return;
  }

  function levelButton(entry) {
    var node = doc.createElement('button');
    node.setAttribute('type', 'button');
    node.setAttribute('data-level', String(entry.id));
    var locked = entry.id > progress.unlocked;
    if (locked) node.setAttribute('disabled', 'disabled');
    var title = doc.createElement('span');
    title.className = 'level-name';
    title.textContent = entry.id + ' · ' + nameOf(entry);
    var meta = doc.createElement('span');
    meta.className = 'level-meta';
    meta.textContent = locked ? words().locked : words().stars + ' ' + starsOf(entry.id - 1) + '/3';
    node.appendChild(title);
    node.appendChild(meta);
    return node;
  }

  // ------------------------------------------------------------ screens

  function show(next) {
    screen = next;
    toggle('title', next === 'title');
    toggle('levels', next === 'levels');
    toggle('ending', next === 'ending');
    if (next === 'ending') {
      var total = 0;
      for (var i = 0; i < 8; i++) total += starsOf(i);
      write('ending-title', words().endTitle);
      write('ending-total', words().endTotal.replace('{stars}', String(total)));
    }
    if (next === 'levels') renderLevelList();
    toggle('modal', modal !== null);
    refresh();
  }

  function openModal(kind) {
    modal = kind;
    var node = el('modal');
    var map = words();
    if (kind === 'help') {
      write('modal-title', map.helpTitle);
      fillHelp(map);
    } else if (kind === 'book') {
      write('modal-title', map.bookTitle);
      fillBook(map);
    }
    if (node) node.hidden = false;
    toggle('modal', true);
    draw();
  }

  function clearNode(node) {
    if (!node) return;
    if (typeof node.replaceChildren === 'function') {
      node.replaceChildren();
      return;
    }
    if (typeof doc.createElement !== 'function') return;
  }

  function fillHelp(map) {
    var body = el('modal-body');
    if (!body || !doc || typeof doc.createElement !== 'function') return;
    clearNode(body);
    var list = doc.createElement('ul');
    for (var i = 0; i < map.help.length; i++) {
      var item = doc.createElement('li');
      item.textContent = map.help[i];
      list.appendChild(item);
    }
    body.appendChild(list);
  }

  function fillBook(map) {
    var body = el('modal-body');
    if (!body || !doc || typeof doc.createElement !== 'function') return;
    clearNode(body);
    var levels = global.SkyLevels && global.SkyLevels.levels ? global.SkyLevels.levels : [];
    for (var i = 0; i < levels.length; i++) {
      var entry = levels[i];
      var row = doc.createElement('div');
      row.className = 'book-row' + (entry.id > progress.unlocked ? ' is-locked' : '');
      var name = doc.createElement('span');
      name.textContent = entry.id + ' · ' + nameOf(entry);
      var starNode = doc.createElement('span');
      starNode.className = 'book-stars';
      var earned = starsOf(entry.id - 1);
      var mark = '';
      for (var s = 0; s < 3; s++) mark += s < earned ? '★' : '☆';
      starNode.textContent = mark;
      row.appendChild(name);
      row.appendChild(starNode);
      body.appendChild(row);
    }
  }

  function closeModal() {
    modal = null;
    toggle('modal', false);
    draw();
  }

  // ------------------------------------------------------------ flight

  function flying() {
    if (!flyUntil) return false;
    if (Date.now() < flyUntil) return true;
    flyUntil = 0;
    return false;
  }

  function startFlight() {
    // Without animation frames there is no flight to watch: the evening simply settles.
    if (typeof global.requestAnimationFrame !== 'function') {
      flyUntil = 0;
      settleWin();
      return;
    }
    flyUntil = Date.now() + FLIGHT_MS;
    var frames = 0;
    var step = function () {
      frames += 1;
      draw();
      if (frames < 42 && flying()) {
        global.requestAnimationFrame(step);
      } else {
        flyUntil = 0;
        settleWin();
      }
    };
    global.requestAnimationFrame(step);
  }

  function settleWin() {
    if (!state || state.status !== 'won') return;
    if (level && level.id >= 8) show('ending');
    else show('levels');
  }

  // ------------------------------------------------------------ engine helpers

  function adopt(result) {
    if (!result) return { ok: false, error: 'unknown' };
    if (result.ok) {
      state = result.state;
      if (state.status === 'won') recordWin();
      else if (state.status === 'lost') toast(words().toast.snap);
      pendingIsland = -1;
      return { ok: true };
    }
    if (result.error) {
      var line = words().toast[result.error];
      if (line) toast(line);
    }
    return { ok: false, error: result.error };
  }

  function recordWin() {
    if (!level) return;
    var earned = global.SkyCore ? global.SkyCore.stars(state) : 0;
    var index = level.id - 1;
    if (progress) {
      var stars = progress.stars.slice();
      if (earned > (stars[index] || 0)) stars[index] = earned;
      progress.stars = stars;
      if (progress.unlocked < Math.min(8, level.id + 1)) progress.unlocked = Math.min(8, level.id + 1);
      save();
    }
    toast(words().win);
    startFlight();
  }

  function begin(id) {
    var levels = global.SkyLevels && global.SkyLevels.levels ? global.SkyLevels.levels : [];
    if (!levels.length || !global.SkyCore) return { ok: false, error: 'no-level' };
    var wanted = Number(id);
    if (!isFinite(wanted)) wanted = 1;
    wanted = Math.round(wanted);
    if (wanted < 1) wanted = 1;
    if (wanted > levels.length) wanted = levels.length;
    level = levels[wanted - 1];
    state = global.SkyCore.createState(level);
    flyUntil = 0;
    mode = 'sew';
    strands = 1;
    pendingIsland = -1;
    if (global.SkyAudio) global.SkyAudio.play('ui');
    show('play');
    return { ok: true };
  }

  function ready() {
    return !!(level && state);
  }

  function blocked(name) {
    var guarded = { sew: true, guide: true, cut: true, undo: true, restart: true, strand: true, next: true, retry: true };
    if (!guarded[name]) return null;
    if (modal !== null) return 'modal';
    if (!ready()) return 'no-level';
    return null;
  }

  function pair(args) {
    if (!args || typeof args !== 'object') return null;
    var a = args.a;
    var b = args.b;
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    if (!isFinite(a) || !isFinite(b)) return null;
    if (Math.floor(a) !== a || Math.floor(b) !== b) return null;
    if (a < 0 || b < 0) return null;
    return { a: a, b: b };
  }

  // ------------------------------------------------------------ commands

  function sound(name) {
    if (global.SkyAudio) global.SkyAudio.play(name);
  }

  function command(name, args) {
    var stop = blocked(name);
    if (stop) {
      var line = words().toast[stop];
      if (line) toast(line);
      return { ok: false, error: stop };
    }
    switch (name) {
      case 'start':
        return begin(args && args.levelId !== undefined ? args.levelId : 1);
      case 'sew': {
        if (args === undefined || args === null) {
          mode = 'sew';
          pendingIsland = -1;
          sound('ui');
          refresh();
          return { ok: true };
        }
        var pairAB = pair(args);
        if (!pairAB) return { ok: false, error: 'args' };
        var sewn = global.SkyCore.sew(state, pairAB.a, pairAB.b, strands);
        var outcome = adopt(sewn);
        sound(sewn.ok ? 'sew' : 'ui');
        if (sewn.ok) mode = 'sew';
        refresh();
        return outcome;
      }
      case 'cut': {
        if (args === undefined || args === null) {
          mode = 'cut';
          pendingIsland = -1;
          sound('ui');
          refresh();
          return { ok: true };
        }
        var cutAB = pair(args);
        if (!cutAB) return { ok: false, error: 'args' };
        var cutResult = global.SkyCore.cut(state, cutAB.a, cutAB.b);
        var cutOutcome = adopt(cutResult);
        sound(cutResult.ok ? 'cut' : 'ui');
        refresh();
        return cutOutcome;
      }
      case 'guide': {
        var guided = global.SkyCore.guide(state);
        var guideOutcome = adopt(guided);
        sound(guided.ok ? 'guide' : 'ui');
        if (guided.ok && guided.state.status === 'lost') {
          global.SkyAudio && global.SkyAudio.play('lose');
        } else if (guided.ok && guided.state.status === 'won') {
          global.SkyAudio && global.SkyAudio.play('win');
        }
        refresh();
        return guideOutcome;
      }
      case 'undo': {
        var undone = global.SkyCore.undo(state);
        var undoOutcome = adopt(undone);
        if (undone.ok) flyUntil = 0;
        sound('ui');
        refresh();
        return undoOutcome;
      }
      case 'restart':
        return begin(level.id);
      case 'retry':
        if (flying()) {
          var retryLine = words().toast.flight;
          if (retryLine) toast(retryLine);
          return { ok: false, error: 'flight' };
        }
        return begin(level.id);
      case 'strand': {
        var next = null;
        if (args && typeof args === 'object' && args.strands !== undefined) {
          next = args.strands;
        } else {
          next = strands === 1 ? 2 : 1;
        }
        if (typeof next !== 'number' || !isFinite(next) || Math.floor(next) !== next || STRANDS.indexOf(next) < 0) {
          return { ok: false, error: 'strands' };
        }
        strands = next;
        mode = 'sew';
        sound('ui');
        refresh();
        return { ok: true };
      }
      case 'next': {
        if (flying()) {
          var flightLine = words().toast.flight;
          if (flightLine) toast(flightLine);
          return { ok: false, error: 'flight' };
        }
        var from = level ? level.id : 0;
        if (!from) {
          var none = words().toast['no-next'];
          if (none) toast(none);
          return { ok: false, error: 'no-next' };
        }
        flyUntil = 0;
        if (from >= 8) {
          sound('ui');
          show('ending');
          return { ok: true };
        }
        return begin(from + 1);
      }
      case 'book': {
        if (flying()) {
          var busyLine = words().toast.flight;
          if (busyLine) toast(busyLine);
          return { ok: false, error: 'flight' };
        }
        if (args && typeof args === 'object' && args.levelId !== undefined) {
          var chosen = Number(args.levelId);
          if (isFinite(chosen)) openModal('book');
          else return { ok: false, error: 'args' };
        } else {
          openModal('book');
        }
        sound('ui');
        return { ok: true };
      }
      case 'help':
        openModal('help');
        sound('ui');
        return { ok: true };
      case 'close-modal':
        if (modal !== null) closeModal();
        else toggle('modal', false);
        sound('ui');
        return { ok: true };
      case 'lang':
        ensureProgress();
        progress.lang = lang() === 'id' ? 'en' : 'id';
        save();
        sound('ui');
        renderChrome();
        refresh();
        return { ok: true };
      case 'sound':
        ensureProgress();
        progress.muted = !progress.muted;
        if (global.SkyAudio) global.SkyAudio.setMuted(progress.muted);
        save();
        if (!progress.muted) sound('ui');
        renderChrome();
        return { ok: true };
      default:
        return { ok: false, error: 'unknown' };
    }
  }

  function renderChrome() {
    var map = words();
    write('title-tagline', map.tagline);
    var play = el('play');
    if (play) play.textContent = map.play;
    var back = el('ending-back');
    if (back) back.textContent = map.evenings;
    var langButton = el('toolbar');
    var buttons = listButtons();
    for (var i = 0; i < buttons.length; i++) {
      var node = buttons[i];
      var name = attribute(node, 'data-command');
      if (!name) continue;
      var label = caption(name);
      var nameNode = node.querySelector ? node.querySelector('.name') : null;
      if (nameNode) nameNode.textContent = label;
      else node.textContent = label;
    }
    if (langButton) langButton.setAttribute('data-lang', lang());
    hud();
    renderLevelList();
  }

  // ------------------------------------------------------------ input

  function clickAt(clientX, clientY) {
    var node = canvas();
    if (!node) return { ok: false, error: 'no-level' };
    var box = { left: 0, top: 0, width: size().width, height: size().height };
    if (typeof node.getBoundingClientRect === 'function') {
      var rect = node.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        box = { left: rect.left || 0, top: rect.top || 0, width: rect.width, height: rect.height };
      }
    }
    var x = ((clientX - box.left) / box.width) * size().width;
    var y = ((clientY - box.top) / box.height) * size().height;
    return tap(x, y);
  }

  function tap(x, y) {
    if (!ready()) return { ok: false, error: 'no-level' };
    if (modal !== null) {
      toast(words().toast.modal);
      return { ok: false, error: 'modal' };
    }
    var layout = global.SkyRender.layout(state, size().width, size().height);
    for (var i = 0; i < layout.toolbar.length; i++) {
      var rect = layout.toolbar[i].rect;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return command(layout.toolbar[i].id, null);
      }
    }
    var island = global.SkyRender.islandAt(state, x, y, size().width, size().height);
    if (mode === 'sew') {
      if (island < 0) {
        pendingIsland = -1;
        draw();
        toast(words().toast.args);
        return { ok: false, error: 'args' };
      }
      if (pendingIsland < 0) {
        pendingIsland = island;
        draw();
        return { ok: true };
      }
      if (pendingIsland === island) {
        pendingIsland = -1;
        draw();
        return { ok: true };
      }
      var from = pendingIsland;
      pendingIsland = -1;
      return command('sew', { a: from, b: island });
    }
    if (island >= 0) {
      pendingIsland = island;
      draw();
      if (mode === 'guide') return command('guide', null);
      return { ok: true };
    }
    var bridge = global.SkyRender.bridgeAt(state, x, y, size().width, size().height);
    if (bridge) {
      if (mode === 'cut') return command('cut', { a: bridge.a, b: bridge.b });
      return command('guide', null);
    }
    toast(words().toast.args);
    return { ok: false, error: 'args' };
  }

  function key(event) {
    var name = event && (event.key || event.code);
    if (!name) return;
    var lower = String(name).toLowerCase();
    var handled = true;
    if (lower === 's') command('sew', null);
    else if (lower === 'g' || name === ' ' || name === 'Spacebar') command('guide', null);
    else if (lower === 'c') command('cut', null);
    else if (lower === 'u' || lower === 'z') command('undo', null);
    else if (lower === 'r') command('restart', null);
    else if (lower === 'n') command('next', null);
    else if (lower === '1') command('strand', { strands: 1 });
    else if (lower === '2') command('strand', { strands: 2 });
    else if (lower === 'escape' || name === 'Esc') {
      if (modal !== null) closeModal();
      else if (screen === 'play') show('levels');
    } else if (lower === 'b') command('book', null);
    else if (lower === 'h' || lower === '?') command('help', null);
    else handled = false;
    if (handled && typeof event.preventDefault === 'function') event.preventDefault();
  }

  function onCanvas(event) {
    if (!event) return;
    var x = event.clientX;
    var y = event.clientY;
    if (typeof x !== 'number' || typeof y !== 'number') {
      var node = canvas();
      if (node && typeof node.getBoundingClientRect === 'function') {
        var rect = node.getBoundingClientRect();
        x = (rect.left || 0) + (rect.width || 0) / 2;
        y = (rect.top || 0) + (rect.height || 0) / 2;
      } else {
        x = 0;
        y = 0;
      }
    }
    clickAt(x, y);
  }

  function onToolbar(event) {
    var target = event && event.target;
    var node = target;
    for (var depth = 0; node && depth < 6; depth++) {
      var name = attribute(node, 'data-command');
      if (name) {
        command(name, null);
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
      node = node.parentNode;
    }
  }

  function onPlay(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    show('levels');
  }

  /* A click may land on a child span: walk up to whatever carries the attribute. */
  function closest(node, name) {
    for (var depth = 0; node && depth < 6; depth++) {
      var value = attribute(node, name);
      if (value !== null && value !== undefined && value !== '') return value;
      node = node.parentNode;
    }
    return null;
  }

  function onAction(event) {
    var target = event && event.target;
    var action = closest(target, 'data-action');
    if (action === 'play' || action === 'levels' || action === 'back') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      show(action === 'play' ? 'levels' : action === 'back' ? 'title' : 'levels');
      return;
    }
    var levelId = closest(target, 'data-level');
    if (levelId !== null) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      command('start', { levelId: Number(levelId) });
    }
  }

  function listen(node, type, handler) {
    if (node && typeof node.addEventListener === 'function') {
      try {
        node.addEventListener(type, handler);
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  function boot() {
    try {
      progress = global.SkyProgress ? global.SkyProgress.load() : blank();
    } catch (error) {
      progress = blank();
    }
    ensureProgress();
    if (global.SkyAudio) global.SkyAudio.setMuted(!!progress.muted);
    if (!bound) {
      bound = true;
      listen(canvas(), 'click', onCanvas);
      listen(canvas(), 'pointerdown', function () {
        if (global.SkyAudio) global.SkyAudio.unlock();
      });
      // One delegated click handler for every data-command button, wherever it sits.
      if (!listen(el('app'), 'click', onToolbar)) listen(el('toolbar'), 'click', onToolbar);
      listen(el('levels'), 'click', onAction);
      listen(el('title'), 'click', onPlay);
      listen(el('ending'), 'click', onAction);
      listen(global, 'keydown', key);
    }
    renderChrome();
    if (!ready()) {
      modal = null;
      toggle('modal', false);
      show('title');
    } else {
      show(screen);
    }
    return { ok: true };
  }

  global.SkyGame = {
    boot: boot,
    start: function (levelId) {
      return begin(levelId);
    },
    command: command,
    state: function () {
      return state;
    },
    ui: function () {
      return { screen: screen, lang: lang(), modal: modal, muted: !!(progress && progress.muted) };
    }
  };

  global.skyDebug = {
    snapshot: function () {
      if (!state || !global.SkyCore) return null;
      return global.SkyCore.snapshot(state);
    }
  };
  /* The page boots itself. A script at the end of <body> already has its DOM;
     anything earlier waits for DOMContentLoaded. */
  function autoBoot() {
    try {
      boot();
    } catch (error) {
      // A broken boot must not leave a blank page without a hint.
      if (global.console && typeof global.console.error === 'function') global.console.error('Tukang Jahit Langit: boot failed', error);
    }
  }

  if (doc && typeof doc.readyState === 'string' && doc.readyState !== 'loading') {
    autoBoot();
  } else if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('DOMContentLoaded', autoBoot);
  }
})(typeof window !== 'undefined' ? window : this);
