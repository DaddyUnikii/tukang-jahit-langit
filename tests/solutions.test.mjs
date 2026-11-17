import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mount, mountPure, levelById, plain } from './helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const solutions = JSON.parse(readFileSync(join(here, 'solutions.json'), 'utf8'));

const box = mountPure();
const { SkyCore, SkyLevels } = box.window;

function apply(state, step) {
  if (step.op === 'sew') return SkyCore.sew(state, step.a, step.b, step.strands);
  if (step.op === 'cut') return SkyCore.cut(state, step.a, step.b);
  if (step.op === 'upgrade') return SkyCore.upgrade(state, step.a, step.b);
  if (step.op === 'guide') return SkyCore.guide(state);
  throw new Error(`unknown op ${step.op}`);
}

test('solutions.json covers every evening exactly once', () => {
  assert.equal(solutions.levels.length, 8);
  const ids = solutions.levels.map((one) => one.id).sort((a, b) => a - b);
  assert.deepEqual(plain(ids), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const entry of solutions.levels) {
    assert.ok(Array.isArray(entry.steps) && entry.steps.length > 0, `level ${entry.id} has steps`);
    assert.ok(entry.stars >= 1 && entry.stars <= 3, `level ${entry.id} records a star count`);
    for (const step of entry.steps) {
      assert.ok(['sew', 'cut', 'upgrade', 'guide'].includes(step.op), `level ${entry.id} op ${step.op}`);
      if (step.op !== 'guide') {
        assert.ok(Number.isInteger(step.a) && Number.isInteger(step.b), `level ${entry.id} coordinates`);
      }
    }
  }
});

for (const entry of solutions.levels) {
  test(`level ${entry.id} replays to a win with the recorded stars`, () => {
    const level = levelById(entry.id);
    let state = SkyCore.createState(level);
    const seen = [];
    for (const step of entry.steps) {
      const before = SkyCore.snapshot(state);
      const result = apply(state, step);
      assert.equal(result.ok, true, `level ${entry.id} ${step.op} ${step.a}-${step.b}: ${result.error}`);
      state = result.state;
      assert.equal(SkyCore.conservation(state), true, `level ${entry.id} keeps thread after ${step.op}`);
      same_defence(before, state, entry.id, step);
      seen.push(step.op);
    }
    assert.equal(SkyCore.status(state), 'won', `level ${entry.id} arrives home`);
    assert.equal(state.at, level.house);
    assert.equal(state.home, level.flock);
    assert.equal(state.flock, 0);
    assert.equal(SkyCore.stars(state), entry.stars, `level ${entry.id} earns ${entry.stars} stars`);
    assert.equal(state.moves, entry.moves, `level ${entry.id} spends ${entry.moves} moves`);
    assert.ok(state.moves <= Math.ceil(level.moves * 1.5), `level ${entry.id} stays inside the two-star window`);
  });
}

function same_defence(before, after, id, step) {
  // Nothing but a real move may change the state; a no-op step would be a broken solution.
  assert.notEqual(before.moves, after.moves, `level ${id} ${step.op} counts a move`);
}

test('every level keeps a winnable route inside its thread budget', () => {
  for (const event of solutions.levels) {
    const level = levelById(event.id);
    let state = SkyCore.createState(level);
    for (const step of event.steps) {
      const result = apply(state, step);
      assert.equal(result.ok, true, `level ${event.id}: ${result.error}`);
      assert.ok(result.state.thread >= 0, `level ${event.id} never owes thread`);
      state = result.state;
    }
    assert.equal(SkyCore.status(state), 'won');
  }
});

test('each evening starts fresh and reaches the house only once', () => {
  for (const event of solutions.levels) {
    const level = levelById(event.id);
    let state = SkyCore.createState(level);
    assert.equal(state.status, 'playing');
    assert.equal(state.home, 0);
    let wins = 0;
    for (const step of event.steps) {
      state = apply(state, step).state;
      if (state.status === 'won') wins += 1;
    }
    assert.equal(wins, 1, `level ${event.id} wins exactly once`);
    const more = SkyCore.guide(state);
    assert.equal(more.ok, false, `level ${event.id} is closed after the win`);
  }
});

test('the recorded level 1 solution is the shortest mending: two sews, no cut', () => {
  const entry = solutions.levels.find((one) => one.id === 1);
  const ops = entry.steps.map((step) => step.op);
  assert.equal(ops.filter((op) => op === 'cut').length, 0, 'no cut needed on the first evening');
  assert.equal(ops.filter((op) => op === 'sew').length, 2, 'two sews');
  assert.equal(entry.stars, 3);
});

test('the recorded level 3 and 8 solutions cut to stay inside the thread', () => {
  for (const id of [3, 8]) {
    const entry = solutions.levels.find((one) => one.id === id);
    assert.ok(entry.steps.some((step) => step.op === 'cut'), `level ${id} cuts`);
    assert.equal(entry.stars, 3);
  }
});

test('level 8 needs a double thread, not a single one', () => {
  const entry = solutions.levels.find((one) => one.id === 8);
  assert.ok(entry.steps.some((step) => step.op === 'sew' && step.strands === 2), 'a two-strand seam is laid');
  const level = levelById(8);
  const single = SkyCore.sew(SkyCore.createState(level), entry.steps[0].a, entry.steps[0].b, 1).state;
  const snapped = SkyCore.guide(single).state;
  assert.equal(snapped.status, 'lost', 'a single strand cannot carry the last flock');
});

test('the whole suite of solutions plays through the real controller', () => {
  const game = mount();
  const api = game.window.SkyGame;
  api.boot();
  for (const entry of solutions.levels) {
    assert.equal(api.command('start', { levelId: entry.id }).ok, true, `start level ${entry.id}`);
    assert.equal(api.ui().screen, 'play');
    for (const step of entry.steps) {
      const args = step.op === 'guide' ? null : { a: step.a, b: step.b };
      if (step.op === 'sew' && step.strands) {
        assert.equal(api.command('strand', { strands: step.strands }).ok, true);
      }
      if (step.op === 'sew') {
        assert.equal(api.command('strand', { strands: step.strands || 1 }).ok, true);
      }
      const result = api.command(step.op === 'guide' ? 'guide' : step.op, args);
      assert.equal(result.ok, true, `controller ${step.op} on level ${entry.id}: ${result.error}`);
      assert.equal(game.window.skyDebug.snapshot().status, step === entry.steps[entry.steps.length - 1] ? 'won' : 'playing');
    }
    const snapshot = game.window.skyDebug.snapshot();
    assert.equal(snapshot.status, 'won');
    assert.equal(snapshot.moves, entry.moves);
    assert.equal(game.saved().stars[entry.id - 1], entry.stars, `level ${entry.id} stars are saved`);
  }
});
