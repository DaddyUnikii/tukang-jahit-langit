/* tests/helpers.mjs — a node:vm sandbox that runs the game's classic scripts.
 *
 * The game is six classic <script> files that attach globals to `window`. This
 * harness builds a small DOM, a canvas 2D context recorder, localStorage and
 * AudioContext stubs, then runs the files in contract load order so the tests
 * can talk to window.SkyCore / SkyGame / ... exactly as a browser would.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
export const GAME_DIR = join(here, '..', 'game');

export const LOAD_ORDER = [
  'levels.js',
  'sky-core.js',
  'sky-render.js',
  'sky-audio.js',
  'sky-progress.js',
  'sky-game.js'
];

export const STORAGE_KEY = 'tukang-jahit-langit-progress-v1';

/* ------------------------------------------------------------------ DOM */

class ClassList {
  constructor(node) {
    this.node = node;
    this.items = new Set();
  }
  add(...names) {
    for (const name of names) this.items.add(name);
    this.node.className = [...this.items].join(' ');
  }
  remove(...names) {
    for (const name of names) this.items.delete(name);
    this.node.className = [...this.items].join(' ');
  }
  contains(name) {
    return this.items.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.items.has(name) : !!force;
    if (on) this.items.add(name);
    else this.items.delete(name);
    this.node.className = [...this.items].join(' ');
    return on;
  }
}

class Element {
  constructor(tagName, doc) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this._text = '';
    this.hidden = false;
    this.className = '';
    this.classList = new ClassList(this);
    this.listeners = new Map();
    this.disabled = false;
  }
  /* Like a real DOM node: textContent is this node's text plus every descendant's. */
  get textContent() {
    let text = this._text || '';
    for (const child of this.children) text += child.textContent;
    return text;
  }
  set textContent(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = value === null || value === undefined ? '' : String(value);
  }
  get id() {
    return this.attributes.get('id') || '';
  }
  set id(value) {
    this.attributes.set('id', String(value));
  }
  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }
  getAttribute(name) {
    if (String(name) === 'class') return this.className || null;
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }
  removeAttribute(name) {
    this.attributes.delete(String(name));
  }
  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const node of nodes) this.appendChild(node);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const want = String(selector).trim();
    const out = [];
    const matches = (node) => {
      if (want.startsWith('.')) return node.classList.contains(want.slice(1));
      if (want.startsWith('#')) return node.id === want.slice(1);
      return node.tagName === want.toUpperCase();
    };
    const walk = (node) => {
      for (const child of node.children) {
        if (matches(child)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const at = list.indexOf(handler);
    if (at >= 0) list.splice(at, 1);
  }
  /* Real events bubble: the node's own listeners, then each ancestor's. */
  dispatch(type, event = {}) {
    const target = event.target || this;
    const base = { ...event, target };
    for (let node = this; node; node = node.parentNode) {
      const list = node.listeners.get(type) || [];
      for (const handler of list) handler({ ...base, currentTarget: node, bubbles: node !== this });
    }
  }
  getBoundingClientRect() {
    return this.rect || { left: 0, top: 0, width: 0, height: 0 };
  }
  getContext() {
    return null;
  }
}

/* A recording 2D context: every Canvas2D call is a no-op that logs its name. */
export function makeContext(canvas) {
  const calls = [];
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0 };
  const ctx = {
    canvas,
    calls,
    saveCount: 0,
    record(name) {
      calls.push(name);
    },
    save() { this.saveCount += 1; calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    closePath() { calls.push('closePath'); },
    moveTo() { calls.push('moveTo'); },
    lineTo() { calls.push('lineTo'); },
    arc() { calls.push('arc'); },
    rect() { calls.push('rect'); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    fillRect() { calls.push('fillRect'); },
    strokeRect() { calls.push('strokeRect'); },
    clearRect() { calls.push('clearRect'); },
    fillText() { calls.push('fillText'); },
    setLineDash() { calls.push('setLineDash'); },
    measureText(text) { return { width: String(text).length * 7 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    translate() { calls.push('translate'); },
    rotate() { calls.push('rotate'); },
    scale() { calls.push('scale'); },
    quadraticCurveTo() { calls.push('quadraticCurveTo'); },
    bezierCurveTo() { calls.push('bezierCurveTo'); },
    ellipse() { calls.push('ellipse'); },
    clip() { calls.push('clip'); }
  };
  for (const key of Object.keys(state)) {
    Object.defineProperty(ctx, key, {
      get() { return state[key]; },
      set(value) { state[key] = value; }
    });
  }
  return ctx;
}

/* ------------------------------------------------------------------ storage */

export function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem(key) {
      return map.has(String(key)) ? map.get(String(key)) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    get length() {
      return map.size;
    }
  };
}

export function makeAudioContext(log) {
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = { connect() {} };
      this.state = 'running';
      this.created = 0;
      if (log) log.push('new AudioContext');
    }
    createOscillator() {
      const node = {
        type: 'sine',
        frequency: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {}
        },
        connect() {},
        start() {},
        stop() {}
      };
      if (log) log.push('createOscillator');
      return node;
    }
    createGain() {
      const node = {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}
      };
      if (log) log.push('createGain');
      return node;
    }
    resume() {
      if (log) log.push('resume');
    }
  }
  return FakeAudioContext;
}

/* ------------------------------------------------------------------ document */

const BASE_IDS = [
  'app', 'board', 'hud', 'hud-level', 'hud-thread', 'hud-flock', 'hud-home', 'hud-moves',
  'hud-stars', 'toolbar', 'title', 'title-tagline', 'play', 'levels', 'levels-title',
  'level-list', 'levels-back', 'ending', 'ending-title', 'ending-total', 'ending-back',
  'modal', 'modal-card', 'modal-title', 'modal-body', 'modal-close', 'toast'
];

const TOOLBAR_COMMANDS = ['sew', 'guide', 'cut', 'undo', 'restart', 'strand', 'help', 'book', 'lang', 'sound'];

export function makeDocument(options = {}) {
  const {
    ids = BASE_IDS,
    withToolbar = true,
    withCanvasContext = true,
    canvasWidth = 1280,
    canvasHeight = 720,
    rect = { left: 0, top: 0, width: 1280, height: 720 }
  } = options;

  const doc = {
    idMap: new Map(),
    created: [],
    documentElement: null,
    createElement(tagName) {
      const node = new Element(tagName, doc);
      doc.created.push(node);
      return node;
    },
    getElementById(id) {
      return doc.idMap.get(String(id)) || null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  };

  for (const id of ids) {
    const node = doc.createElement(id === 'board' ? 'canvas' : id === 'toolbar' ? 'nav' : 'div');
    node.setAttribute('id', id);
    doc.idMap.set(id, node);
    if (id === 'board') {
      node.width = canvasWidth;
      node.height = canvasHeight;
      node.rect = rect;
      if (withCanvasContext) node.getContext = () => node.context || (node.context = makeContext(node));
      else node.getContext = () => null;
    }
  }

  if (withToolbar) {
    const bar = doc.getElementById('toolbar');
    if (bar) {
      for (const name of TOOLBAR_COMMANDS) {
        const button = doc.createElement('button');
        button.setAttribute('type', 'button');
        button.setAttribute('data-command', name);
        const label = doc.createElement('span');
        label.className = 'name';
        label.textContent = name;
        const key = doc.createElement('span');
        key.className = 'key';
        button.appendChild(label);
        button.appendChild(key);
        bar.appendChild(button);
      }
    }
  }

  return doc;
}

/* ------------------------------------------------------------------ loader */

/**
 * Boots the game in a fresh sandbox.
 *   opts.document  a document from makeDocument(), or null to build the default one
 *   opts.storage   a storage stub, or null for a fresh one
 *   opts.audio     true to install a FakeAudioContext, false for none
 *   opts.raf       false to leave requestAnimationFrame absent
 *   opts.files     which scripts to run (default: the contract load order)
 */
export function mount(opts = {}) {
  const doc = opts.document === null ? null : opts.document || makeDocument();
  const storage = opts.storage === undefined ? makeStorage() : opts.storage;
  const audioLog = [];
  const listeners = [];
  const frames = [];
  const sandbox = {
    console,
    document: doc,
    localStorage: storage,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  if (opts.audio !== false) sandbox.AudioContext = makeAudioContext(audioLog);
  if (opts.raf !== false) {
    sandbox.requestAnimationFrame = (fn) => {
      frames.push(fn);
      return frames.length;
    };
    sandbox.cancelAnimationFrame = () => {};
  }
  sandbox.addEventListener = (type, handler) => {
    listeners.push({ type, handler });
  };
  sandbox.removeEventListener = (type, handler) => {
    const at = listeners.findIndex((one) => one.type === type && one.handler === handler);
    if (at >= 0) listeners.splice(at, 1);
  };
  sandbox.innerWidth = 1280;
  sandbox.innerHeight = 720;

  const context = vm.createContext(sandbox);
  const files = opts.files || LOAD_ORDER;
  for (const file of files) {
    const source = readFileSync(join(GAME_DIR, file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }

  return {
    window: sandbox,
    document: doc,
    storage,
    frames,
    audioLog,
    listeners,
    context,
    /** Every listener registered on the window for a type. */
    on(type) {
      return listeners.filter((one) => one.type === type).map((one) => one.handler);
    },
    /** Fire a window keydown through every registered handler. */
    press(key, extra = {}) {
      const event = { key, preventDefault() {}, ...extra };
      for (const handler of this.on('keydown')) handler(event);
      return event;
    },
    /** Fire a canvas click at client coordinates. */
    clickCanvas(x, y) {
      const canvas = doc.getElementById('board');
      canvas.dispatch('click', { clientX: x, clientY: y, preventDefault() {} });
    },
    /** Fire a toolbar click on the named command's button. */
    clickToolbar(name) {
      const bar = doc.getElementById('toolbar');
      const button = bar.querySelectorAll('button').find((one) => one.getAttribute('data-command') === name);
      if (!button) throw new Error(`no toolbar button for ${name}`);
      bar.dispatch('click', { target: button, preventDefault() {} });
    },
    /** Drain the queued animation frames (each callback once). */
    drainFrames(limit = 200) {
      let ran = 0;
      while (frames.length && ran < limit) {
        const fn = frames.shift();
        fn(16 * (ran + 1));
        ran += 1;
      }
      return ran;
    },
    /** The saved progress object as the game stores it. */
    saved() {
      const raw = storage.getItem(STORAGE_KEY);
      return raw === null ? null : JSON.parse(raw);
    }
  };
}

/** Loads only the pure files (no controller), for engine and render tests. */
export function mountPure(opts = {}) {
  return mount({ ...opts, files: ['levels.js', 'sky-core.js', 'sky-render.js', 'sky-audio.js', 'sky-progress.js'] });
}

/** A level object from the real level data. */
export function levelById(id, opts = {}) {
  const box = mountPure(opts);
  const found = box.window.SkyLevels.levels.find((one) => one.id === id);
  if (!found) throw new Error(`no level ${id}`);
  return found;
}

/** A value rebuilt in this realm, so cross-realm arrays compare structurally. */
export function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** deepEqual across the vm boundary: both sides are rebuilt in this realm first. */
export function same(actual, expected, message) {
  assert.deepEqual(plain(actual), plain(expected), message);
}

export { Element };

/* ------------------------------------------------------------------ markup */

/**
 * Builds a document from the real game/index.html: every element, id, class and
 * data-attribute the page ships is present, so tests exercise the actual markup.
 * A tiny tokenizer is enough — the page is plain, hand-written HTML.
 */
export function makeDocumentFromMarkup(options = {}) {
  const html = readFileSync(join(GAME_DIR, 'index.html'), 'utf8');
  const { withCanvasContext = true, canvasWidth = 1280, canvasHeight = 720 } = options;
  const doc = {
    idMap: new Map(),
    created: [],
    scripts: [],
    createElement(tagName) {
      const node = new Element(tagName, doc);
      doc.created.push(node);
      return node;
    },
    getElementById(id) {
      return doc.idMap.get(String(id)) || null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  };

  const root = doc.createElement('html');
  const stack = [root];
  const tokens = html.match(/<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const name = (token.match(/^<\s*([a-zA-Z0-9-]+)/) || [])[1];
      if (!name) continue;
      const node = doc.createElement(name);
      const attrs = token.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*"([^"]*)")?/g);
      for (const match of attrs) {
        const key = match[1];
        if (key === name || key === '') continue;
        node.setAttribute(key, match[2] === undefined ? '' : match[2]);
      }
      if (node.getAttribute('id')) doc.idMap.set(node.getAttribute('id'), node);
      if (node.tagName === 'SCRIPT' && node.getAttribute('src')) doc.scripts.push(node.getAttribute('src'));
      if (node.tagName === 'LINK' || node.tagName === 'META' || node.tagName === 'BR' || node.tagName === 'IMG') {
        stack[stack.length - 1].appendChild(node);
        continue;
      }
      stack[stack.length - 1].appendChild(node);
      stack.push(node);
      continue;
    }
    const text = token.trim();
    if (!text) continue;
    const parent = stack[stack.length - 1];
    parent.textContent = (parent.textContent || '') + text;
  }

  const canvas = doc.getElementById('board');
  if (canvas) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.rect = { left: 0, top: 0, width: canvasWidth, height: canvasHeight };
    canvas.getContext = withCanvasContext ? () => canvas.context || (canvas.context = makeContext(canvas)) : () => null;
  }
  doc.root = root;
  return doc;
}

/** Boots the game on the real index.html markup. */
export function mountPage(opts = {}) {
  return mount({ ...opts, document: makeDocumentFromMarkup(opts.markup || {}) });
}
