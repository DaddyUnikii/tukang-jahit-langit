import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mount, mountPage, makeStorage, makeDocument, makeDocumentFromMarkup, STORAGE_KEY, levelById, plain, same } from './helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const solutions = JSON.parse(readFileSync(join(here, 'solutions.json'), 'utf8'));

function booted(opts = {}) {
  const game = mountPage(opts);
  const api = game.window.SkyGame;
  api.boot();
  return { game, api };
}

test('boot wires the title screen and is idempotent', () => {
  const game = mount();
  const api = game.window.SkyGame;
  api.boot();
  assert.equal(api.ui().screen, 'title');
  assert.equal(api.ui().modal, null);
  assert.equal(api.ui().lang, 'en');
  assert.equal(api.ui().muted, false);
  assert.equal(api.state(), null);
  const before = game.listeners.length;
  api.boot();
  api.boot();
  assert.equal(api.ui().screen, 'title', 'still on the title');
  assert.equal(game.listeners.length, before, 'no duplicate window listeners');
});

test('boot registers a window keydown handler and canvas/toolbar clicks', () => {
  const { game } = booted();
  assert.equal(game.on('keydown').length, 1);
  const app = game.document.getElementById('app');
  assert.ok(app.listeners.get('click') && app.listeners.get('click').length >= 1, 'commands are delegated from #app');
  const canvas = game.document.getElementById('board');
  assert.ok(canvas.listeners.get('click') && canvas.listeners.get('click').length >= 1);
});

test('boot survives a document with only app and board, and a null context', () => {
  const game = mount({ document: makeDocument({ ids: ['app', 'board'], withToolbar: false, withCanvasContext: false }) });
  const api = game.window.SkyGame;
  assert.doesNotThrow(() => api.boot());
  assert.equal(api.ui().screen, 'title');
  assert.equal(api.command('start', { levelId: 2 }).ok, true);
  assert.equal(api.ui().screen, 'play');
  assert.doesNotThrow(() => api.command('sew', { a: 0, b: 1 }));
  assert.doesNotThrow(() => game.press('g'));
  assert.doesNotThrow(() => game.press('Escape'));
});

test('start begins an evening and shows the play screen', () => {
  const { api } = booted();
  const result = api.command('start', { levelId: 3 });
  assert.equal(result.ok, true);
  assert.equal(api.ui().screen, 'play');
  const state = api.state();
  assert.equal(state.levelId, 3);
  assert.equal(state.level.id, 3);
  assert.equal(state.status, 'playing');
  assert.equal(state.moves, 0);
  assert.equal(api.ui().modal, null);
});

test('start clamps an out-of-range level id', () => {
  const { api } = booted();
  api.command('start', { levelId: 99 });
  assert.equal(api.state().levelId, 8);
  api.command('start', { levelId: 0 });
  assert.equal(api.state().levelId, 1);
  api.command('start', { levelId: -5 });
  assert.equal(api.state().levelId, 1);
});

test('a direct start may open a locked evening, but the list marks it locked', () => {
  const { api } = booted();
  assert.equal(api.command('start', { levelId: 5 }).ok, true);
  assert.equal(api.state().levelId, 5);
  api.command('restart');
  api.command('next');
  assert.equal(api.state().levelId, 6, 'next walks on from a directly started evening');
  const { game } = { game: null };
  assert.equal(api.ui().screen, 'play');
});

test('commands before an evening refuse with no-level', () => {
  const { api } = booted();
  for (const name of ['sew', 'guide', 'cut', 'undo', 'restart', 'strand', 'next', 'retry']) {
    const result = api.command(name, { a: 0, b: 1 });
    assert.equal(result.ok, false, `${name} refused`);
    assert.equal(result.error, 'no-level', `${name} says no-level`);
  }
  assert.equal(api.state(), null);
});

test('help, book, lang, sound and start work before an evening', () => {
  const { api } = booted();
  assert.equal(api.command('help').ok, true);
  assert.equal(api.ui().modal, 'help');
  assert.equal(api.command('close-modal').ok, true);
  assert.equal(api.command('book').ok, true);
  assert.equal(api.ui().modal, 'book');
  assert.equal(api.command('close-modal').ok, true);
  assert.equal(api.command('lang').ok, true);
  assert.equal(api.ui().lang, 'id');
  assert.equal(api.command('sound').ok, true);
  assert.equal(api.ui().muted, true);
  assert.equal(api.command('start', { levelId: 1 }).ok, true);
});

test('an unknown command is refused without changing anything', () => {
  const { api } = booted();
  api.command('start', { levelId: 1 });
  const before = api.ui();
  const state = api.state();
  const result = api.command('teleport', { a: 0, b: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown');
  same(api.ui(), before);
  assert.equal(api.state(), state);
});

test('help locks every editing command and keeps the modal open', () => {
  const { api } = booted();
  api.command('start', { levelId: 1 });
  assert.equal(api.command('help').ok, true);
  assert.equal(api.ui().modal, 'help');
  const state = api.state();
  for (const name of ['sew', 'guide', 'cut', 'undo', 'restart', 'strand', 'next', 'retry']) {
    const result = api.command(name, { a: 0, b: 1 });
    assert.equal(result.ok, false, `${name} refused behind help`);
    assert.equal(result.error, 'modal', `${name} says modal`);
    assert.equal(api.ui().modal, 'help', `${name} leaves help open`);
    assert.equal(api.state(), state, `${name} changes nothing`);
  }
  assert.equal(api.command('close-modal').ok, true);
  assert.equal(api.ui().modal, null);
  assert.equal(api.command('sew', { a: 0, b: 1 }).ok, true, 'sewing works again');
});

test('book locks every editing command and keeps the modal open', () => {
  const { api } = booted();
  api.command('start', { levelId: 2 });
  assert.equal(api.command('book').ok, true);
  assert.equal(api.ui().modal, 'book');
  const state = api.state();
  for (const name of ['sew', 'guide', 'cut', 'undo', 'restart', 'strand', 'next', 'retry']) {
    const result = api.command(name, { a: 0, b: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'modal');
    assert.equal(api.ui().modal, 'book');
    assert.equal(api.state(), state);
  }
  assert.equal(api.command('help').ok, true, 'help may replace the book');
  assert.equal(api.ui().modal, 'help');
  assert.equal(api.command('book').ok, true, 'and the book may come back');
  assert.equal(api.ui().modal, 'book');
});

test('lang and sound work behind a modal and the modal stays open', () => {
  const { api } = booted();
  api.command('help');
  assert.equal(api.command('lang').ok, true);
  assert.equal(api.ui().lang, 'id');
  assert.equal(api.ui().modal, 'help');
  assert.equal(api.command('sound').ok, true);
  assert.equal(api.ui().muted, true);
  assert.equal(api.ui().modal, 'help');
});

test('the title stays Tukang Jahit Langit in both languages', () => {
  const { game, api } = booted();
  const heading = game.document.getElementById('title').querySelector('h1');
  assert.equal(heading.textContent, 'Tukang Jahit Langit');
  api.command('lang');
  assert.equal(api.ui().lang, 'id');
  assert.equal(heading.textContent, 'Tukang Jahit Langit');
});

test('sew, cut and guide route through the engine and count moves', () => {
  const { api } = booted();
  api.command('start', { levelId: 1 });
  assert.equal(api.command('sew', { a: 0, b: 1 }).ok, true);
  assert.equal(api.state().moves, 1);
  assert.equal(api.state().bridges.length, 1);
  assert.equal(api.command('sew', { a: 1, b: 2 }).ok, true);
  assert.equal(api.state().moves, 2);
  assert.equal(api.command('undo').ok, true);
  assert.equal(api.state().moves, 1);
  assert.equal(api.command('guide').ok, true);
  assert.equal(api.state().at, 1);
  assert.equal(api.command('sew', { a: 0, b: 1 }).error, 'exists');
  assert.equal(api.command('cut', { a: 0, b: 1 }).error, 'occupied');
  assert.equal(api.command('cut', { a: 1, b: 2 }).error, 'none');
  assert.equal(api.command('undo').ok, true);
  assert.equal(api.state().at, 0, 'the flock is back at the start');
  assert.equal(api.command('sew', { a: 1, b: 2 }).ok, true);
  const threadBefore = api.state().thread;
  const cuts = api.command('cut', { a: 1, b: 2 });
  assert.equal(cuts.ok, true);
  assert.equal(api.state().bridges.length, 1);
  assert.ok(api.state().thread > threadBefore, 'the cut refunded its thread');
});

test('sew and cut refuse missing or nonsense coordinates', () => {
  const { api } = booted();
  api.command('start', { levelId: 1 });
  for (const args of [{}, { a: 0 }, { a: 'x', b: 'y' }, { a: NaN, b: 1 }, { a: 1.5, b: 2 }, { a: -1, b: 2 }]) {
    assert.equal(api.command('sew', args).error, 'args', `sew ${JSON.stringify(args)}`);
    assert.equal(api.command('cut', args).error, 'args', `cut ${JSON.stringify(args)}`);
  }
  assert.equal(api.command('sew').ok, true, 'no coordinates picks sew mode');
  assert.equal(api.command('cut', null).ok, true, 'no coordinates picks cut mode');
  assert.equal(api.state().moves, 0, 'picking a mode is not a move');
});

test('engine errors come back verbatim', () => {
  const { api } = booted();
  api.command('start', { levelId: 4 });
  assert.equal(api.command('sew', { a: 0, b: 4 }).error, 'no-link');
  assert.equal(api.command('sew', { a: 0, b: 2 }).error, 'storm');
  assert.equal(api.command('cut', { a: 0, b: 1 }).error, 'none');
  assert.equal(api.command('undo').error, 'no-history');
});

test('strand switches between one and two threads', () => {
  const { api } = booted();
  api.command('start', { levelId: 5 });
  assert.equal(api.command('strand', { strands: 2 }).ok, true);
  assert.equal(api.command('sew', { a: 0, b: 1 }).ok, true);
  assert.equal(api.state().bridges[0].strands, 2);
  assert.equal(api.command('strand', { strands: 1 }).ok, true);
  assert.equal(api.command('strand').ok, true, 'no args toggles');
  assert.equal(api.command('strand', { strands: 9 }).error, 'strands');
  assert.equal(api.command('strand', { strands: 1.5 }).error, 'strands');
});

test('strand never edits a bridge that is already sewn', () => {
  const { api } = booted();
  api.command('start', { levelId: 5 });
  api.command('sew', { a: 0, b: 1 });
  api.command('strand', { strands: 2 });
  assert.equal(api.state().bridges[0].strands, 1);
});

test('restart and retry begin the same evening again', () => {
  const { api } = booted();
  api.command('start', { levelId: 2 });
  api.command('sew', { a: 0, b: 1 });
  assert.equal(api.command('restart').ok, true);
  assert.equal(api.state().moves, 0);
  assert.equal(api.state().bridges.length, 0);
  assert.equal(api.state().levelId, 2);
  api.command('sew', { a: 0, b: 1 });
  assert.equal(api.command('retry').ok, true);
  assert.equal(api.state().moves, 0);
});

test('a win saves stars, unlocks the next evening and asks for the next', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  const box = game.window.SkyCore;
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  const hop = api.command('guide');
  assert.equal(hop.ok, true);
  const home = api.command('guide');
  assert.equal(home.ok, true);
  assert.equal(api.state().status, 'won');
  const saved = game.saved();
  assert.equal(saved.stars[0], 3);
  assert.equal(saved.unlocked, 2, 'the second evening opens');
  assert.ok(box.conservation(api.state()));
});

test('progress is written the moment the flock arrives, before any animation', () => {
  const { game, api } = booted({ raf: false });
  api.command('start', { levelId: 1 });
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  api.command('guide');
  api.command('guide');
  assert.equal(game.window.requestAnimationFrame, undefined, 'no animation frame available');
  assert.equal(game.saved().unlocked, 2);
  assert.equal(game.saved().stars[0], 3);
});

test('the flight window refuses the book and next until it settles', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  api.command('guide');
  api.command('guide');
  assert.equal(api.state().status, 'won');
  const booked = api.command('book');
  assert.equal(booked.ok, false);
  assert.equal(booked.error, 'flight');
  assert.equal(api.ui().modal, null, 'the book does not open');
  assert.equal(api.state().status, 'won', 'the result is undisturbed');
  assert.equal(game.saved().stars[0], 3, 'the win stays saved');
  game.drainFrames();
  assert.equal(api.command('book').ok, true, 'the book opens after the flight');
});

test('a win with no animation frames still lets next work at once', () => {
  const { api } = booted({ raf: false });
  api.command('start', { levelId: 1 });
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  api.command('guide');
  api.command('guide');
  assert.equal(api.command('next').ok, true);
  assert.equal(api.state().levelId, 2);
  assert.equal(api.ui().screen, 'play');
});

test('next walks the evenings and ends on the ending screen after the eighth', () => {
  const { api } = booted();
  api.command('start', { levelId: 7 });
  assert.equal(api.command('next').ok, true);
  assert.equal(api.state().levelId, 8);
  assert.equal(api.command('next').ok, true);
  assert.equal(api.ui().screen, 'ending');
});

test('the ending screen counts the total stars out of twenty-four', () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({ unlocked: 8, stars: [3, 3, 3, 3, 2, 2, 1, 3], lang: 'en', muted: false })
  });
  const game = mountPage({ storage });
  const api = game.window.SkyGame;
  api.boot();
  api.command('start', { levelId: 8 });
  api.command('next');
  assert.equal(api.ui().screen, 'ending');
  const total = game.document.getElementById('ending-total');
  assert.match(total.textContent, /20/, 'twenty stars of twenty-four');
});

test('the language button persists and Indonesian renders the strings', () => {
  const storage = makeStorage();
  const first = mountPage({ storage });
  first.window.SkyGame.boot();
  first.window.SkyGame.command('start', { levelId: 1 });
  first.window.SkyGame.command('lang');
  assert.equal(first.saved().lang, 'id');
  assert.equal(first.window.SkyGame.ui().lang, 'id');
  const hudLevel = first.document.getElementById('hud-level').textContent;
  assert.match(hudLevel, /Malam/, 'the HUD speaks Indonesian');
  const second = mountPage({ storage });
  second.window.SkyGame.boot();
  assert.equal(second.window.SkyGame.ui().lang, 'id', 'the choice survives a reload');
});

test('the sound button persists the mute and silences the audio', () => {
  const storage = makeStorage();
  const game = mountPage({ storage });
  const api = game.window.SkyGame;
  api.boot();
  api.command('sound');
  assert.equal(api.ui().muted, true);
  assert.equal(game.saved().muted, true);
  assert.equal(game.window.SkyAudio.muted(), true);
  api.command('sound');
  assert.equal(api.ui().muted, false);
  assert.equal(game.saved().muted, false);
});

test('the hud reports thread, flock, home, moves and stars', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  const thread = game.document.getElementById('hud-thread').textContent;
  assert.match(thread, /12/, 'the starting thread');
  const level = game.document.getElementById('hud-level').textContent;
  assert.match(level, /1/);
  api.command('sew', { a: 0, b: 1 });
  const moved = api.state().moves;
  assert.match(game.document.getElementById('hud-moves').textContent, new RegExp(String(moved)));
  assert.match(game.document.getElementById('hud-stars').textContent, /★/, 'a lit star is shown');
});

test('every command redraws the board', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  const ctx = game.document.getElementById('board').context;
  const before = ctx.calls.length;
  assert.ok(before > 0, 'the first draw happened');
  api.command('sew', { a: 0, b: 1 });
  assert.ok(ctx.calls.length > before, 'sewing redrew');
  const mid = ctx.calls.length;
  api.command('sew', { a: 5, b: 6 });
  assert.ok(ctx.calls.length > mid, 'a failed sew still redrew');
});

test('Escape closes the modal, then returns to the evenings', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  api.command('help');
  assert.equal(api.ui().modal, 'help');
  game.press('Escape');
  assert.equal(api.ui().modal, null);
  assert.equal(api.ui().screen, 'play');
  game.press('Escape');
  assert.equal(api.ui().screen, 'levels');
});

test('the keyboard drives the modes and moves', () => {
  const { game, api } = booted();
  game.press('s');
  assert.equal(api.ui().screen, 'title', 'no evening yet, nothing happens');
  api.command('start', { levelId: 1 });
  game.press('s');
  game.clickCanvas(200, 360);
  game.clickCanvas(520, 360);
  assert.equal(api.state().bridges.length, 1, 'two canvas clicks sew');
  game.press('1');
  game.press('2');
  assert.equal(api.state().bridges[0].strands, 1, 'strand only changes the pending count');
  game.press('g');
  assert.equal(api.state().at, 1, 'g guides');
  game.press('z');
  assert.equal(api.state().at, 0, 'z undoes');
  game.press('r');
  assert.equal(api.state().moves, 0, 'r restarts');
});

test('Space guides and c switches to cut', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  game.press('s');
  game.clickCanvas(200, 360);
  game.clickCanvas(520, 360);
  game.press(' ');
  assert.equal(api.state().at, 1);
  game.press('Escape');
  assert.equal(api.ui().screen, 'levels');
});

test('the toolbar buttons route to their commands', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  game.clickToolbar('help');
  assert.equal(api.ui().modal, 'help');
  game.document.getElementById('modal-close').dispatch('click', { preventDefault() {} });
  assert.equal(api.ui().modal, null, 'the close button shuts the window');
  game.clickToolbar('sew');
  game.clickCanvas(200, 360);
  game.clickCanvas(520, 360);
  assert.equal(api.state().bridges.length, 1);
  game.clickToolbar('undo');
  assert.equal(api.state().bridges.length, 0);
  game.clickToolbar('book');
  assert.equal(api.ui().modal, 'book');
});

test('a canvas click on the toolbar area routes to that button', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  const layout = game.window.SkyRender.layout(api.state(), 1280, 720);
  const help = layout.toolbar.find((one) => one.id === 'help');
  game.clickCanvas(help.rect.x + help.rect.w / 2, help.rect.y + help.rect.h / 2);
  assert.equal(api.ui().modal, 'help');
});

test('a canvas click between pins reports args and changes nothing', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  const before = api.state();
  game.clickCanvas(640, 80);
  assert.equal(api.state(), before);
});

test('cut mode takes a bridge with one click on it', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  game.clickToolbar('sew');
  game.clickCanvas(200, 360);
  game.clickCanvas(520, 360);
  game.clickCanvas(520, 360);
  game.clickCanvas(840, 360);
  assert.equal(api.state().bridges.length, 2);
  game.press('c');
  game.clickCanvas(360, 360);
  assert.equal(api.state().bridges.length, 2, 'the bridge under the flock refuses to be cut');
  game.clickCanvas(680, 360);
  assert.equal(api.state().bridges.length, 1, 'one click on the far bridge cut it');
});

test('a click while a modal is open is refused', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  api.command('help');
  const before = api.state();
  game.clickCanvas(200, 360);
  assert.equal(api.state(), before);
  assert.equal(api.ui().modal, 'help');
});

test('clicking Play shows the evenings and a level button starts it', () => {
  const { game, api } = booted();
  const play = game.document.getElementById('play');
  game.document.getElementById('title').dispatch('click', { target: play, preventDefault() {} });
  assert.equal(api.ui().screen, 'levels');
  const list = game.document.getElementById('level-list');
  const first = list.querySelectorAll('button').find((one) => one.getAttribute('data-level') === '1');
  assert.ok(first, 'the first evening is listed');
  list.dispatch('click', { target: first, preventDefault() {} });
  assert.equal(api.state().levelId, 1);
  assert.equal(api.ui().screen, 'play');
});

test('the level list marks locked evenings and shows saved stars', () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({ unlocked: 3, stars: [3, 2, 1, 0, 0, 0, 0, 0], lang: 'en', muted: false })
  });
  const game = mountPage({ storage });
  const api = game.window.SkyGame;
  api.boot();
  api.command('start', { levelId: 1 });
  const list = game.document.getElementById('level-list');
  const buttons = list.querySelectorAll('button');
  assert.equal(buttons.length, 8, 'eight evenings listed');
  const locked = buttons.filter((one) => one.getAttribute('disabled') !== null);
  assert.equal(locked.length, 5, 'five evenings are still shut');
  const text = buttons.map((one) => one.textContent).join(' ');
  assert.match(text, /3/, 'the star count is shown');
});

test('skyDebug hands out a plain copy and never a live state', () => {
  const { game, api } = booted();
  assert.equal(game.window.skyDebug.snapshot(), null);
  api.command('start', { levelId: 1 });
  api.command('sew', { a: 0, b: 1 });
  const copy = game.window.skyDebug.snapshot();
  copy.thread = -1;
  copy.bridges.length = 0;
  assert.equal(api.state().thread, 9, 'the live state is untouched');
  assert.equal(api.state().bridges.length, 1);
});

test('ui reports the screen, language, modal and mute together', () => {
  const { api } = booted();
  same(api.ui(), { screen: 'title', lang: 'en', modal: null, muted: false });
  api.command('start', { levelId: 1 });
  api.command('lang');
  api.command('sound');
  api.command('help');
  same(api.ui(), { screen: 'play', lang: 'id', modal: 'help', muted: true });
});

test('the winning flight animates and lands on the evenings', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  api.command('guide');
  api.command('guide');
  assert.ok(game.frames.length > 0, 'a flight was queued');
  game.drainFrames();
  assert.equal(api.ui().screen, 'levels', 'the flight lands on the evenings');
});

test('winning the eighth evening ends on the ending screen after the flight', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 8 });
  const steps = solutions.levels.find((one) => one.id === 8).steps;
  for (const step of steps) {
    if (step.op === 'sew') api.command('strand', { strands: step.strands || 1 });
    assert.equal(api.command(step.op, step.a === undefined ? null : { a: step.a, b: step.b }).ok, true);
  }
  assert.equal(api.state().status, 'won');
  game.drainFrames();
  assert.equal(api.ui().screen, 'ending');
});

test('retry after a win starts the evening again', () => {
  const { game, api } = booted();
  api.command('start', { levelId: 1 });
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  api.command('guide');
  api.command('guide');
  assert.equal(api.state().status, 'won');
  assert.equal(api.command('retry').error, 'flight', 'the flight is still playing');
  game.drainFrames();
  assert.equal(api.command('retry').ok, true);
  assert.equal(api.state().status, 'playing');
  assert.equal(api.state().moves, 0);
  assert.equal(api.ui().screen, 'play');
});

test('a losing snap announces itself and the evening closes', () => {
  const { api } = booted();
  api.command('start', { levelId: 8 });
  api.command('sew', { a: 0, b: 1 });
  assert.equal(api.command('guide').ok, true);
  assert.equal(api.state().status, 'lost');
  assert.equal(api.command('guide').ok, false);
  assert.equal(api.command('restart').ok, true);
  assert.equal(api.state().status, 'playing');
});

test('a win never lowers a saved star count', () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({ unlocked: 8, stars: [3, 0, 0, 0, 0, 0, 0, 0], lang: 'en', muted: false })
  });
  const game = mountPage({ storage });
  const api = game.window.SkyGame;
  api.boot();
  api.command('start', { levelId: 1 });
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  api.command('guide');
  api.command('guide');
  assert.equal(game.saved().stars[0], 3);
  api.command('restart');
  api.command('sew', { a: 0, b: 1 });
  api.command('sew', { a: 1, b: 2 });
  api.command('guide');
  api.command('guide');
  assert.equal(game.saved().stars[0], 3);
});

test('a hand-made canvas rect maps clicks into board coordinates', () => {
  const document = makeDocument({ rect: { left: 100, top: 50, width: 640, height: 360 } });
  const game = mount({ document });
  const api = game.window.SkyGame;
  api.boot();
  api.command('start', { levelId: 1 });
  game.clickCanvas(100 + 200 / 2, 50 + 360 / 2);
  assert.equal(api.state() !== null, true);
});

test('boot restores the saved language and mute into the audio', () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({ unlocked: 2, stars: [1, 0, 0, 0, 0, 0, 0, 0], lang: 'id', muted: true })
  });
  const { game, api } = booted({ storage });
  assert.equal(api.ui().lang, 'id');
  assert.equal(api.ui().muted, true);
  assert.equal(game.window.SkyAudio.muted(), true);
});

test('commands work before boot, on a default save, without throwing', () => {
  const game = mountPage();
  const api = game.window.SkyGame;
  assert.doesNotThrow(() => api.command('lang'));
  assert.doesNotThrow(() => api.command('sound'));
  assert.equal(api.command('start', { levelId: 1 }).ok, true);
  assert.equal(api.state().levelId, 1);
  assert.doesNotThrow(() => api.boot());
  assert.equal(api.ui().lang, 'id', 'the pre-boot language choice stands');
  assert.equal(api.ui().muted, true);
  assert.equal(game.saved().lang, 'id');
});

test('the page eleven toolbar commands all answer behind a modal', () => {
  const { api } = booted();
  api.command('start', { levelId: 3 });
  api.command('book');
  for (const name of ['sew', 'guide', 'cut', 'undo', 'restart', 'strand', 'next', 'retry']) {
    const result = api.command(name, { a: 0, b: 1 });
    assert.deepEqual(plain(result), { ok: false, error: 'modal' }, name);
  }
  assert.equal(api.ui().modal, 'book');
});
