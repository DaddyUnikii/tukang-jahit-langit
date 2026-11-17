import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPure, levelById, same, plain } from './helpers.mjs';

const box = mountPure();
const { SkyCore, SkyLevels } = box.window;

function fresh(id = 1) {
  return SkyCore.createState(levelById(id));
}

function run(state, steps) {
  let current = state;
  for (const step of steps) {
    const result = step.op === 'sew'
      ? SkyCore.sew(current, step.a, step.b, step.strands)
      : step.op === 'cut'
        ? SkyCore.cut(current, step.a, step.b)
        : step.op === 'upgrade'
          ? SkyCore.upgrade(current, step.a, step.b)
          : SkyCore.guide(current);
    assert.equal(result.ok, true, `${step.op} ${step.a}-${step.b}: ${result.error}`);
    current = result.state;
  }
  return current;
}

test('level data is well formed', () => {
  assert.equal(SkyLevels.levels.length, 8);
  const seen = new Set();
  for (const level of SkyLevels.levels) {
    assert.ok(Number.isInteger(level.id), 'id is an integer');
    assert.ok(level.id >= 1 && level.id <= 8, 'id in range');
    assert.ok(!seen.has(level.id), 'ids are unique');
    seen.add(level.id);
    assert.equal(typeof level.name.en, 'string');
    assert.equal(typeof level.name.id, 'string');
    assert.ok(Number.isInteger(level.thread) && level.thread > 0, 'thread is a positive integer');
    assert.ok(Number.isInteger(level.moves) && level.moves > 0, 'moves is a positive integer');
    assert.ok(Number.isInteger(level.flock) && level.flock > 0, 'flock is a positive integer');
    assert.ok(level.start >= 0 && level.start < level.islands.length, 'start is an island');
    assert.ok(level.house >= 0 && level.house < level.islands.length, 'house is an island');
    assert.notEqual(level.start, level.house, 'start is not the house');
    assert.ok(Array.isArray(level.links) && level.links.length >= 2, 'links exist');
    assert.ok(Array.isArray(level.storm), 'storm is an array');
    assert.ok(level.flower === null || Number.isInteger(level.flower), 'flower is an index or null');
  }
});

test('island coordinates stay in the board and clear of each other', () => {
  for (const level of SkyLevels.levels) {
    const points = level.islands;
    for (let i = 0; i < points.length; i++) {
      assert.ok(points[i].x >= 60 && points[i].x <= 1220, `level ${level.id} island ${i} x in 60..1220`);
      assert.ok(points[i].y >= 120 && points[i].y <= 660, `level ${level.id} island ${i} y in 120..660`);
      assert.equal(typeof points[i].label, 'string');
      for (let j = i + 1; j < points.length; j++) {
        const apart = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        assert.ok(apart >= 110, `level ${level.id}: islands ${i}/${j} are ${apart.toFixed(1)}px apart`);
      }
    }
  }
});

test('every level is connected from start to house over its links', () => {
  for (const level of SkyLevels.levels) {
    const seen = new Set([level.start]);
    const queue = [level.start];
    while (queue.length) {
      const at = queue.shift();
      for (const [a, b] of level.links) {
        const next = a === at ? b : b === at ? a : -1;
        if (next >= 0 && next < level.islands.length && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    assert.ok(seen.has(level.house), `level ${level.id} reaches its house`);
    assert.equal(seen.size, level.islands.length, `level ${level.id} links every island`);
  }
});

test('bridge length is the rounded distance over 120, at least one', () => {
  const state = fresh(8);
  for (const [a, b] of state.level.links) {
    const pa = state.level.islands[a];
    const pb = state.level.islands[b];
    const expected = Math.max(1, Math.round(Math.hypot(pa.x - pb.x, pa.y - pb.y) / 120));
    assert.equal(SkyCore.lengthOf(state, a, b), expected);
  }
});

test('createState has every field the contract names', () => {
  const state = fresh(2);
  assert.equal(state.levelId, 2);
  assert.equal(state.level.id, 2);
  same(state.bridges, []);
  assert.equal(state.thread, state.level.thread);
  assert.equal(state.flock, state.level.flock);
  assert.equal(state.at, state.level.start);
  assert.equal(state.home, 0);
  assert.equal(state.moves, 0);
  same(state.flowers, []);
  same(state.history, []);
  assert.equal(state.status, 'playing');
});

test('sew subtracts len * strands and counts one move', () => {
  const state = fresh(1);
  const len = SkyCore.lengthOf(state, 0, 1);
  const result = SkyCore.sew(state, 0, 1, 1);
  assert.equal(result.ok, true);
  assert.equal(result.state.thread, state.thread - len);
  assert.equal(result.state.moves, 1);
  same(result.state.bridges, [{ a: 0, b: 1, strands: 1, len }]);
  assert.equal(SkyCore.conservation(result.state), true);
});

test('sew with two strands costs twice the length', () => {
  const state = fresh(5);
  const len = SkyCore.lengthOf(state, 0, 1);
  const result = SkyCore.sew(state, 0, 1, 2);
  assert.equal(result.ok, true);
  assert.equal(result.state.thread, state.thread - len * 2);
  assert.equal(result.state.bridges[0].strands, 2);
  assert.equal(SkyCore.capacity(result.state.bridges[0]), 3);
});

test('sew refuses with no-link, exists, storm, no-thread in that order', () => {
  const state = fresh(4);
  assert.equal(SkyCore.sew(state, 0, 4, 1).error, 'no-link');
  assert.equal(SkyCore.sew(state, 0, 2, 1).error, 'storm');
  const sewn = SkyCore.sew(state, 0, 1, 1).state;
  assert.equal(SkyCore.sew(sewn, 1, 0, 1).error, 'exists');
  const poor = { ...state, thread: 0 };
  assert.equal(SkyCore.sew(poor, 0, 1, 1).error, 'no-thread');
});

test('sew refuses a strand count outside one or two', () => {
  const state = fresh(1);
  assert.equal(SkyCore.sew(state, 0, 1, 3).error, 'strands');
  assert.equal(SkyCore.sew(state, 0, 1, 0).error, 'strands');
});

test('cut refunds exactly the thread the bridge spent', () => {
  const state = fresh(4);
  const sewn = SkyCore.sew(state, 1, 3, 2).state;
  const cut = SkyCore.cut(sewn, 1, 3);
  assert.equal(cut.ok, true);
  assert.equal(cut.state.thread, state.thread);
  same(cut.state.bridges, []);
  assert.equal(cut.state.moves, sewn.moves + 1);
  assert.equal(SkyCore.conservation(cut.state), true);
});

test('cut refuses with none and occupied', () => {
  const state = fresh(4);
  assert.equal(SkyCore.cut(state, 0, 1).error, 'none');
  const sewn = run(state, [{ op: 'sew', a: 0, b: 1 }, { op: 'guide' }]);
  assert.equal(sewn.at, 1);
  assert.equal(SkyCore.cut(sewn, 0, 1).error, 'occupied');
});

test('upgrade turns a single into a double for one more length', () => {
  const state = fresh(5);
  const len = SkyCore.lengthOf(state, 0, 1);
  const sewn = SkyCore.sew(state, 0, 1, 1).state;
  const doubled = SkyCore.upgrade(sewn, 1, 0);
  assert.equal(doubled.ok, true);
  assert.equal(doubled.state.thread, state.thread - len * 2);
  assert.equal(doubled.state.bridges[0].strands, 2);
  assert.equal(doubled.state.bridges[0].len, len);
  assert.equal(SkyCore.conservation(doubled.state), true);
  assert.equal(SkyCore.upgrade(doubled.state, 0, 1).ok, false);
});

test('guide walks the shortest way home and wins at the house', () => {
  const state = run(fresh(1), [{ op: 'sew', a: 0, b: 1 }, { op: 'sew', a: 1, b: 2 }]);
  const first = SkyCore.guide(state);
  assert.equal(first.ok, true);
  assert.equal(first.state.at, 1);
  assert.equal(first.state.status, 'playing');
  const second = SkyCore.guide(first.state);
  assert.equal(second.state.at, 2);
  assert.equal(second.state.status, 'won');
  assert.equal(second.state.home, second.state.level.flock);
  assert.equal(second.state.flock, 0);
});

test('guide takes the shortest path, not merely the lowest neighbour', () => {
  const level = {
    id: 99,
    name: { en: 'Probe', id: 'Uji' },
    thread: 60,
    moves: 9,
    flock: 1,
    start: 0,
    house: 2,
    islands: [
      { x: 100, y: 300, label: '1' },
      { x: 400, y: 300, label: '2' },
      { x: 700, y: 300, label: '3' },
      { x: 100, y: 600, label: '4' },
      { x: 700, y: 600, label: '5' }
    ],
    links: [[0, 1], [0, 3], [3, 4], [4, 2], [1, 2]],
    storm: [],
    flower: null
  };
  let state = SkyCore.createState(level);
  for (const [a, b] of level.links) state = SkyCore.sew(state, a, b, 1).state;
  const hop = SkyCore.guide(state);
  assert.equal(hop.state.at, 1, 'takes the two-hop path through island 1, the lower index');
});

test('guide is deterministic: the same state always takes the same hop', () => {
  const twin = {
    id: 98,
    name: { en: 'Twin', id: 'Kembar' },
    thread: 40,
    moves: 9,
    flock: 1,
    start: 0,
    house: 3,
    islands: [
      { x: 100, y: 300, label: '1' },
      { x: 500, y: 200, label: '2' },
      { x: 500, y: 500, label: '3' },
      { x: 900, y: 350, label: '4' }
    ],
    links: [[0, 1], [0, 2], [1, 3], [2, 3]],
    storm: [],
    flower: null
  };
  let base = SkyCore.createState(twin);
  for (const [a, b] of twin.links) base = SkyCore.sew(base, a, b, 1).state;
  const first = SkyCore.guide(base).state;
  const again = SkyCore.guide(base).state;
  same(first, again);
  assert.equal(first.at, 1, 'two equal ways home, the lower island wins');
});

test('guide refuses with no-route when nothing leaves the island', () => {
  const state = fresh(1);
  assert.equal(SkyCore.guide(state).error, 'no-route');
});

test('a bridge too thin snaps: it is gone, thread is not refunded, and the flight is lost', () => {
  const state = fresh(5);
  const sewn = SkyCore.sew(state, 0, 1, 1).state;
  const snapped = SkyCore.guide(sewn);
  assert.equal(snapped.ok, true);
  same(snapped.state.bridges, []);
  assert.equal(snapped.state.thread, sewn.thread, 'no refund');
  assert.equal(snapped.state.flock, sewn.flock, 'the flock survives');
  assert.equal(snapped.state.moves, sewn.moves + 1);
  assert.equal(snapped.state.status, 'lost');
  assert.equal(SkyCore.stars(snapped.state), 0);
});

test('a double bridge carries a heavy flock', () => {
  const state = fresh(5);
  const doubled = run(state, [{ op: 'sew', a: 0, b: 1 }, { op: 'upgrade', a: 0, b: 1 }]);
  assert.equal(doubled.bridges[0].strands, 2);
  const hop = SkyCore.guide(doubled);
  assert.equal(hop.ok, true);
  assert.equal(hop.state.at, 1);
  assert.equal(hop.state.status, 'playing');
});

test('a snap leaves the evening lost only when no bridge can still carry the flock home', () => {
  const state = fresh(5);
  const both = run(state, [
    { op: 'sew', a: 0, b: 1 },
    { op: 'sew', a: 1, b: 3, strands: 2 }
  ]);
  const snapped = SkyCore.guide(both);
  assert.equal(snapped.state.status, 'lost');
  assert.equal(snapped.state.bridges.length, 1, 'the far bridge survives');
});

test('the flower is collected when the flock lands on it', () => {
  const state = fresh(1);
  const sewn = run(state, [{ op: 'sew', a: 0, b: 1 }, { op: 'sew', a: 1, b: 2 }]);
  const hop = SkyCore.guide(sewn);
  assert.equal(hop.state.at, 1);
  same(hop.state.flowers, [1]);
  const twice = SkyCore.guide(hop.state);
  same(twice.state.flowers, [1], 'collected once');
});

test('undo restores the previous snapshot exactly', () => {
  const start = fresh(7);
  const sewn = SkyCore.sew(start, 0, 1, 2).state;
  const undone = SkyCore.undo(sewn);
  assert.equal(undone.ok, true);
  assert.equal(undone.state.thread, start.thread);
  same(undone.state.bridges, []);
  assert.equal(undone.state.moves, start.moves);
  assert.equal(SkyCore.conservation(undone.state), true);
});

test('undo works after a cut and after a guide', () => {
  const base = run(fresh(4), [{ op: 'sew', a: 1, b: 3 }, { op: 'sew', a: 0, b: 1 }]);
  const cut = SkyCore.cut(base, 1, 3).state;
  const back = SkyCore.undo(cut).state;
  same(back.bridges, base.bridges);
  assert.equal(back.thread, base.thread);
  const moved = SkyCore.guide(base).state;
  assert.equal(moved.at, 1);
  const rewound = SkyCore.undo(moved).state;
  assert.equal(rewound.at, base.at);
  assert.equal(rewound.moves, base.moves);
});

test('undo on an empty history fails with no-history and changes nothing', () => {
  const state = fresh(3);
  const result = SkyCore.undo(state);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'no-history');
  same(result.state, state);
});

test('restart returns a fresh state for the same level', () => {
  const state = run(fresh(2), [{ op: 'sew', a: 0, b: 1 }]);
  const again = SkyCore.restart(state);
  assert.equal(again.ok, true);
  same(again.state.bridges, []);
  assert.equal(again.state.thread, state.level.thread);
  assert.equal(again.state.moves, 0);
  same(again.state.history, []);
  assert.equal(again.state.status, 'playing');
});

test('stars follow the move thresholds and a loss scores zero', () => {
  const level = levelById(1);
  const quick = { ...SkyCore.createState(level), moves: level.moves };
  assert.equal(SkyCore.stars(quick), 3);
  const mid = { ...SkyCore.createState(level), moves: level.moves + 1 };
  assert.equal(SkyCore.stars(mid), 2);
  const over = { ...SkyCore.createState(level), moves: Math.ceil(level.moves * 1.5) + 1 };
  assert.equal(SkyCore.stars(over), 1);
  const lost = { ...SkyCore.createState(level), moves: 1, status: 'lost' };
  assert.equal(SkyCore.stars(lost), 0);
});

test('status mirrors the stored status', () => {
  const state = fresh(1);
  assert.equal(SkyCore.status(state), 'playing');
  assert.equal(SkyCore.status({ ...state, status: 'won' }), 'won');
});

test('conservation holds after every kind of move', () => {
  let state = fresh(6);
  const steps = [
    { op: 'sew', a: 0, b: 1, strands: 2 },
    { op: 'sew', a: 1, b: 3, strands: 2 },
    { op: 'sew', a: 3, b: 4 },
    { op: 'cut', a: 3, b: 4 },
    { op: 'undo' },
    { op: 'guide' },
    { op: 'upgrade', a: 3, b: 4 },
    { op: 'guide' }
  ];
  for (const step of steps) {
    const result = step.op === 'sew'
      ? SkyCore.sew(state, step.a, step.b, step.strands)
      : step.op === 'cut'
        ? SkyCore.cut(state, step.a, step.b)
        : step.op === 'upgrade'
          ? SkyCore.upgrade(state, step.a, step.b)
          : step.op === 'undo'
            ? SkyCore.undo(state)
            : SkyCore.guide(state);
    assert.equal(result.ok, true, `${step.op}: ${result.error}`);
    state = result.state;
    assert.equal(SkyCore.conservation(state), true, `conservation after ${step.op}`);
  }
});

test('no operation mutates the state it is given', () => {
  const state = run(fresh(4), [{ op: 'sew', a: 0, b: 1 }]);
  const before = SkyCore.snapshot(state);
  SkyCore.sew(state, 1, 3, 1);
  SkyCore.cut(state, 0, 1);
  SkyCore.upgrade(state, 0, 1);
  SkyCore.guide(state);
  SkyCore.undo(state);
  SkyCore.restart(state);
  same(state, before);
});

test('every returned state is a new object, even on failure', () => {
  const state = fresh(1);
  const ok = SkyCore.sew(state, 0, 1, 1);
  assert.notEqual(ok.state, state);
  const bad = SkyCore.cut(state, 0, 1);
  assert.notEqual(bad.state, state, 'even a refusal hands back its own copy');
  bad.state.thread = -999;
  assert.equal(state.thread, state.level.thread, 'mutating the refusal leaves the input alone');
});

test('snapshot is a deep copy safe to mutate', () => {
  const state = run(fresh(2), [{ op: 'sew', a: 0, b: 1 }]);
  const copy = SkyCore.snapshot(state);
  copy.bridges[0].a = 42;
  copy.bridges.push({ a: 3, b: 3, strands: 2, len: 9 });
  copy.thread = 1000;
  copy.flowers.push(7);
  copy.history.length = 0;
  assert.equal(state.bridges[0].a, 0);
  assert.equal(state.bridges.length, 1);
  assert.equal(state.thread, state.level.thread - state.bridges[0].len);
  same(state.flowers, []);
  assert.equal(state.history.length, 1);
});

test('capacity is one for a single thread and three for a double', () => {
  assert.equal(SkyCore.capacity({ a: 0, b: 1, strands: 1, len: 2 }), 1);
  assert.equal(SkyCore.capacity({ a: 0, b: 1, strands: 2, len: 2 }), 3);
});

test('level one is winnable with two sews and no cut', () => {
  const level = levelById(1);
  const won = run(SkyCore.createState(level), [
    { op: 'sew', a: level.start, b: 1 },
    { op: 'sew', a: 1, b: level.house },
    { op: 'guide' },
    { op: 'guide' }
  ]);
  assert.equal(won.status, 'won');
  assert.equal(SkyCore.stars(won), 3);
  assert.equal(won.thread, level.thread - 2 * SkyCore.lengthOf(won, 0, 1));
});

test('level three cannot be sewn end to end without cutting', () => {
  const level = levelById(3);
  const state = SkyCore.createState(level);
  const len0 = SkyCore.lengthOf(state, 0, 1);
  const len1 = SkyCore.lengthOf(state, 1, 2);
  const len2 = SkyCore.lengthOf(state, 2, 3);
  assert.ok(len0 + len1 + len2 > level.thread, 'straight through costs more than the skein holds');

  const first = SkyCore.sew(state, 0, 1, 1).state;
  const second = SkyCore.sew(first, 1, 2, 1).state;
  const blocked = SkyCore.sew(second, 2, 3, 1);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'no-thread');

  const walked = SkyCore.guide(second).state;
  const walker = SkyCore.guide(walked).state;
  const cut = SkyCore.cut(walker, 0, 1);
  assert.equal(cut.ok, true);
  const rest = SkyCore.sew(cut.state, 2, 3, 1);
  assert.equal(rest.ok, true);
  const won = SkyCore.guide(rest.state).state;
  assert.equal(won.status, 'won');
});

test('level eight needs a heavy bridge and a cut', () => {
  const level = levelById(8);
  assert.ok(level.flock >= 3, 'a heavy flock');
  const state = SkyCore.createState(level);
  const thin = SkyCore.sew(state, 0, 1, 1).state;
  const snapped = SkyCore.guide(thin).state;
  assert.equal(snapped.status, 'lost', 'a single thread cannot carry three fireflies');

  const straight = level.links.reduce((sum, [a, b]) => sum + SkyCore.lengthOf(state, a, b), 0);
  assert.ok(straight > level.thread, 'the whole graph costs more thread than one skein');
});

test('a lost evening refuses further flights', () => {
  const level = levelById(8);
  const thin = SkyCore.sew(SkyCore.createState(level), 0, 1, 1).state;
  const lost = SkyCore.guide(thin).state;
  assert.equal(lost.status, 'lost');
  const after = SkyCore.guide(lost);
  assert.equal(after.ok, false);
  assert.equal(after.state.status, 'lost');
});
