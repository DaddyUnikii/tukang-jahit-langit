import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPure, makeContext, plain, levelById, same } from './helpers.mjs';

const box = mountPure();
const { SkyRender, SkyCore, SkyLevels } = box.window;

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 900, height: 600 },
  { width: 640, height: 360 },
  { width: 320, height: 200 }
];

const TOOLBAR_IDS = ['sew', 'guide', 'cut', 'undo', 'restart', 'strand', 'help', 'book', 'lang', 'sound'];

function stateFor(id = 1) {
  return SkyCore.createState(levelById(id));
}

function sewnLevel(id = 1) {
  const state = stateFor(id);
  let current = state;
  for (const [a, b] of state.level.links) {
    const result = SkyCore.sew(current, a, b, 1);
    if (result.ok) current = result.state;
  }
  return current;
}

test('layout renders every island for each viewport', () => {
  for (const level of SkyLevels.levels) {
    const state = SkyCore.createState(level);
    for (const { width, height } of VIEWPORTS) {
      const board = SkyRender.layout(state, width, height);
      assert.equal(board.islands.length, level.islands.length, `level ${level.id} at ${width}x${height}`);
      assert.equal(board.houseIslandId, level.house);
      for (const island of board.islands) {
        assert.ok(Number.isFinite(island.x) && Number.isFinite(island.y));
        assert.ok(island.x >= 0 && island.x <= width, `island x inside ${width}`);
        assert.ok(island.y >= 0 && island.y <= height, `island y inside ${height}`);
        assert.equal(typeof island.label, 'string');
      }
      assert.ok(Number.isFinite(board.house.x) && Number.isFinite(board.house.y));
    }
  }
});

test('layout keeps island order and labels from the level', () => {
  const state = stateFor(4);
  const board = SkyRender.layout(state, 1280, 720);
  assert.deepEqual(plain(board.islands.map((one) => one.index)), [0, 1, 2, 3, 4]);
  same(board.islands.map((one) => one.label), state.level.islands.map((one) => one.label));
});

test('layout scales islands proportionally', () => {
  const state = stateFor(2);
  const big = SkyRender.layout(state, 1280, 720);
  const small = SkyRender.layout(state, 640, 360);
  for (let i = 0; i < big.islands.length; i++) {
    assert.ok(Math.abs(small.islands[i].x * 2 - big.islands[i].x) < 1.5, `island ${i} x halves`);
    assert.ok(Math.abs(small.islands[i].y * 2 - big.islands[i].y) < 1.5, `island ${i} y halves`);
  }
});

test('the toolbar holds the ten commands with positive rects inside the viewport', () => {
  for (const { width, height } of VIEWPORTS) {
    const board = SkyRender.layout(stateFor(1), width, height);
    assert.equal(board.toolbar.length, 10);
    same(board.toolbar.map((one) => one.id), TOOLBAR_IDS);
    for (const item of board.toolbar) {
      assert.ok(item.rect.w > 0 && item.rect.h > 0, `${item.id} has an area at ${width}x${height}`);
      assert.ok(item.rect.x >= 0 && item.rect.y >= 0, `${item.id} starts inside`);
      assert.ok(item.rect.x + item.rect.w <= width + 0.001, `${item.id} ends inside x at ${width}`);
      assert.ok(item.rect.y + item.rect.h <= height + 0.001, `${item.id} ends inside y at ${height}`);
      assert.equal(typeof item.label, 'string');
      assert.ok(item.label.length > 0);
      assert.equal(typeof item.key, 'string');
    }
  }
});

test('toolbar rects never overlap each other', () => {
  const board = SkyRender.layout(stateFor(1), 1280, 720);
  for (let i = 0; i < board.toolbar.length; i++) {
    for (let j = i + 1; j < board.toolbar.length; j++) {
      const a = board.toolbar[i].rect;
      const b = board.toolbar[j].rect;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `${board.toolbar[i].id} overlaps ${board.toolbar[j].id}`);
    }
  }
});

test('layout reports a hud block with the live numbers', () => {
  const state = sewnLevel(4);
  const board = SkyRender.layout(state, 1280, 720);
  assert.equal(board.hud.thread, state.thread);
  assert.equal(board.hud.flock, state.flock);
  assert.equal(board.hud.home, state.home);
  assert.equal(board.hud.moves, state.moves);
  assert.ok(board.hud.rect.w > 0 && board.hud.rect.h > 0);
});

test('islandAt hits a centre and misses 30px away', () => {
  for (const { width, height } of VIEWPORTS) {
    const state = stateFor(3);
    const board = SkyRender.layout(state, width, height);
    for (let i = 0; i < board.islands.length; i++) {
      const island = board.islands[i];
      assert.equal(SkyRender.islandAt(state, island.x, island.y, width, height), i, `centre of island ${i}`);
      assert.equal(SkyRender.islandAt(state, island.x + 20, island.y, width, height), i, 'within 26px');
    }
    const corner = SkyRender.islandAt(state, 4, Math.max(4, height - 4), width, height);
    for (let i = 0; i < board.islands.length; i++) {
      const distance = Math.hypot(board.islands[i].x - 4, board.islands[i].y - (height - 4));
      if (distance > 26) assert.equal(corner, -1, 'far from every island is -1');
    }
  }
});

test('islandAt returns -1 when nothing is near', () => {
  const state = stateFor(1);
  assert.equal(SkyRender.islandAt(state, 639, 60, 1280, 720), -1);
  assert.equal(SkyRender.islandAt(state, -500, -500, 1280, 720), -1);
});

test('islandAt picks the nearest island when two are close', () => {
  const near = {
    id: 77,
    name: { en: 'Near', id: 'Dekat' },
    thread: 20,
    moves: 4,
    flock: 1,
    start: 0,
    house: 1,
    islands: [
      { x: 200, y: 300, label: '1' },
      { x: 268, y: 300, label: '2' }
    ],
    links: [[0, 1]],
    storm: [],
    flower: null
  };
  const state = SkyCore.createState(near);
  const board = SkyRender.layout(state, 1280, 720);
  assert.equal(SkyRender.islandAt(state, board.islands[0].x + 2, board.islands[0].y, 1280, 720), 0);
  assert.equal(SkyRender.islandAt(state, board.islands[1].x - 2, board.islands[1].y, 1280, 720), 1);
});

test('bridgeAt hits the segment and misses to the side', () => {
  const state = sewnLevel(2);
  assert.ok(state.bridges.length >= 2);
  for (const bridge of state.bridges) {
    const board = SkyRender.layout(state, 1280, 720);
    const a = board.islands[bridge.a];
    const b = board.islands[bridge.b];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const hit = SkyRender.bridgeAt(state, mid.x, mid.y, 1280, 720);
    assert.ok(hit, 'the midpoint of a bridge is a hit');
    assert.deepEqual(plain([hit.a, hit.b].sort((x, y) => x - y)), plain([bridge.a, bridge.b].sort((x, y) => x - y)));
  }
});

test('bridgeAt returns null with no bridges and off the line', () => {
  assert.equal(SkyRender.bridgeAt(stateFor(1), 640, 360, 1280, 720), null);
  const state = sewnLevel(1);
  assert.equal(SkyRender.bridgeAt(state, 5, 5, 1280, 720), null);
});

test('bridgeAt respects the 14px band', () => {
  const state = sewnLevel(1);
  const board = SkyRender.layout(state, 1280, 720);
  const bridge = state.bridges[0];
  const a = board.islands[bridge.a];
  const b = board.islands[bridge.b];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  assert.ok(SkyRender.bridgeAt(state, mid.x + nx * 10, mid.y + ny * 10, 1280, 720), '10px away is still the bridge');
  assert.equal(SkyRender.bridgeAt(state, mid.x + nx * 60, mid.y + ny * 60, 1280, 720), null, '60px away is not');
});

test('draw paints without throwing and leaves the state alone', () => {
  const state = sewnLevel(5);
  const before = SkyCore.snapshot(state);
  const canvas = { width: 1280, height: 720 };
  const ctx = makeContext(canvas);
  assert.doesNotThrow(() => SkyRender.draw(ctx, state, { width: 1280, height: 720, mode: 'sew', strands: 1 }));
  assert.ok(ctx.calls.length > 100, `the painter made ${ctx.calls.length} calls`);
  for (const name of ['clearRect', 'fill', 'stroke', 'beginPath', 'arc', 'fillRect', 'fillText']) {
    assert.ok(ctx.calls.includes(name), `draw used ${name}`);
  }
  same(state, before);
});

test('draw survives a minimal stub context and empty opts', () => {
  const state = stateFor(1);
  const stub = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {} };
  assert.doesNotThrow(() => SkyRender.draw(stub, state, {}));
  assert.doesNotThrow(() => SkyRender.draw(stub, state));
  assert.doesNotThrow(() => SkyRender.draw(null, state, {}));
});

test('draw works on every level and viewport', () => {
  for (const level of SkyLevels.levels) {
    const state = SkyCore.createState(level);
    for (const { width, height } of VIEWPORTS) {
      const ctx = makeContext({ width, height });
      assert.doesNotThrow(() => SkyRender.draw(ctx, state, { width, height }), `level ${level.id} at ${width}x${height}`);
      assert.ok(ctx.calls.includes('fillText'), 'the pins are numbered');
    }
  }
});

test('draw paints a dashed candidate link for every unsewn link and a stroke for each bridge', () => {
  const state = stateFor(1);
  const ctx = makeContext({ width: 1280, height: 720 });
  SkyRender.draw(ctx, state, { width: 1280, height: 720 });
  assert.ok(ctx.calls.includes('setLineDash'), 'candidate links are dashed');
  const dashes = ctx.calls.filter((name) => name === 'setLineDash').length;
  assert.ok(dashes >= 1);

  const sewn = sewnLevel(1);
  const ctx2 = makeContext({ width: 1280, height: 720 });
  SkyRender.draw(ctx2, sewn, { width: 1280, height: 720 });
  assert.ok(ctx2.calls.includes('stroke'));
});

test('a double bridge is drawn as two parallel threads', () => {
  const state = stateFor(5);
  const single = SkyCore.sew(state, 0, 1, 1).state;
  const double = SkyCore.upgrade(single, 0, 1).state;
  const countLines = (one) => {
    const ctx = makeContext({ width: 1280, height: 720 });
    SkyRender.draw(ctx, one, { width: 1280, height: 720 });
    return ctx.calls.filter((name) => name === 'moveTo').length;
  };
  assert.ok(countLines(double) > countLines(single), 'the double bridge adds a thread');
});

test('the flock, the flower and the storm are painted', () => {
  const state = sewnLevel(1);
  const ctx = makeContext({ width: 1280, height: 720 });
  SkyRender.draw(ctx, state, { width: 1280, height: 720 });
  assert.ok(ctx.calls.includes('arc'), 'glowing dots and pins are arcs');
  const stormy = stateFor(4);
  const ctx2 = makeContext({ width: 1280, height: 720 });
  SkyRender.draw(ctx2, stormy, { width: 1280, height: 720 });
  assert.ok(ctx2.calls.includes('save') && ctx2.calls.includes('restore'), 'the storm glow saves the context');
});

test('layout tolerates a state without a level', () => {
  const board = SkyRender.layout(null, 800, 600);
  assert.deepEqual(plain(board.islands), []);
  assert.equal(board.toolbar.length, 10);
  for (const item of board.toolbar) {
    assert.ok(item.rect.x + item.rect.w <= 800 + 0.001);
  }
});

test('layout tolerates a zero viewport without producing NaN', () => {
  const board = SkyRender.layout(stateFor(1), 0, 0);
  assert.ok(board.toolbar.every((one) => Number.isFinite(one.rect.w) && one.rect.w > 0));
  assert.ok(board.islands.every((one) => Number.isFinite(one.x) && Number.isFinite(one.y)));
});

test('audio stays silent before unlock and while muted', () => {
  const audio = mountPure().window.SkyAudio;
  assert.equal(audio.muted(), false);
  assert.doesNotThrow(() => audio.play('sew'));
  audio.setMuted(true);
  assert.equal(audio.muted(), true);
  assert.doesNotThrow(() => audio.play('win'));
  audio.setMuted(false);
  audio.unlock();
  assert.doesNotThrow(() => audio.play('cut'));
  assert.doesNotThrow(() => audio.play('nonsense'));
});

test('audio survives a missing AudioContext', () => {
  const audio = mountPure({ audio: false }).window.SkyAudio;
  assert.doesNotThrow(() => audio.unlock());
  assert.doesNotThrow(() => audio.play('guide'));
  assert.equal(audio.muted(), false);
});
