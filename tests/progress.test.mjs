import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPure, makeStorage, STORAGE_KEY, same } from './helpers.mjs';

function progressIn(storage) {
  return mountPure({ storage }).window.SkyProgress;
}

function storageWith(value) {
  return makeStorage({ [STORAGE_KEY]: JSON.stringify(value) });
}

test('a fresh save has the documented defaults', () => {
  const progress = progressIn(makeStorage());
  same(progress.load(), { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0], lang: 'en', muted: false });
});

test('missing storage still yields defaults and never throws', () => {
  const progress = progressIn(null);
  same(progress.load(), { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0], lang: 'en', muted: false });
  const saved = progress.save({ unlocked: 3 });
  assert.equal(saved.unlocked, 3);
});

test('a stored save round-trips', () => {
  const storage = makeStorage();
  const progress = progressIn(storage);
  progress.save({ unlocked: 4, stars: [3, 2, 1, 0, 0, 0, 0, 0], lang: 'id', muted: true });
  const again = progressIn(storage);
  same(again.load(), { unlocked: 4, stars: [3, 2, 1, 0, 0, 0, 0, 0], lang: 'id', muted: true });
});

test('save merges a patch over the current save', () => {
  const progress = progressIn(makeStorage());
  progress.save({ unlocked: 5 });
  const merged = progress.save({ lang: 'id' });
  assert.equal(merged.unlocked, 5);
  assert.equal(merged.lang, 'id');
  assert.equal(merged.muted, false);
});

test('save writes the object it returns', () => {
  const storage = makeStorage();
  const progress = progressIn(storage);
  const returned = progress.save({ unlocked: 6, muted: true });
  same(JSON.parse(storage.getItem(STORAGE_KEY)), returned);
});

test('corrupt JSON becomes the defaults', () => {
  for (const bad of ['{', 'not json', '[]', 'null', 'true', '42', '{"unlocked":']) {
    const progress = progressIn(makeStorage({ [STORAGE_KEY]: bad }));
    same(progress.load(), { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0], lang: 'en', muted: false }, `corrupt: ${bad}`);
  }
});

test('out-of-range fields are clamped', () => {
  const progress = progressIn(storageWith({
    unlocked: 99, stars: [9, -3, 2, 2.6, '3', null, 1, 0], lang: 'fr', muted: 'yes'
  }));
  const loaded = progress.load();
  assert.equal(loaded.unlocked, 8);
  same(loaded.stars, [3, 0, 2, 2, 0, 0, 1, 0]);
  assert.equal(loaded.lang, 'en');
  assert.equal(loaded.muted, false);
});

test('a short or long star list is padded and trimmed to eight', () => {
  const short = progressIn(storageWith({ stars: [3, 3] })).load();
  same(short.stars, [3, 3, 0, 0, 0, 0, 0, 0]);
  const long = progressIn(storageWith({ stars: [1, 1, 1, 1, 1, 1, 1, 1, 3, 3] })).load();
  assert.equal(long.stars.length, 8);
});

test('a non-array stars field becomes the default list', () => {
  const progress = progressIn(storageWith({ unlocked: 2, stars: { 0: 3 } }));
  same(progress.load().stars, [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('unlocked below one is clamped up', () => {
  const progress = progressIn(storageWith({ unlocked: 0 }));
  assert.equal(progress.load().unlocked, 1);
  const negative = progressIn(storageWith({ unlocked: -4 }));
  assert.equal(negative.load().unlocked, 1);
  const fraction = progressIn(storageWith({ unlocked: 3.7 }));
  assert.equal(fraction.load().unlocked, 3, 'a fraction is floored to a whole evening');
  const word = progressIn(storageWith({ unlocked: 'four' }));
  assert.equal(word.load().unlocked, 1, 'a non-number falls back to one');
});

test('reset restores and persists the defaults', () => {
  const storage = makeStorage();
  const progress = progressIn(storage);
  progress.save({ unlocked: 7, lang: 'id', muted: true });
  const fresh = progress.reset();
  same(fresh, { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0], lang: 'en', muted: false });
  same(progress.load(), fresh);
});

test('a storage that throws on read, write and clear never breaks the game', () => {
  const angry = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('full'); },
    removeItem() { throw new Error('denied'); }
  };
  const progress = progressIn(angry);
  same(progress.load(), { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0], lang: 'en', muted: false });
  const saved = progress.save({ unlocked: 2, muted: true });
  assert.equal(saved.unlocked, 2);
  assert.equal(saved.muted, true);
});

test('a getter that throws on the storage itself is survived', () => {
  const progress = mountPure({ storage: null }).window.SkyProgress;
  assert.doesNotThrow(() => progress.load());
  assert.doesNotThrow(() => progress.save({ stars: [3, 3, 3, 3, 3, 3, 3, 3] }));
});

test('save ignores unknown keys and keeps the documented shape', () => {
  const progress = progressIn(makeStorage());
  const saved = progress.save({ unlocked: 2, extra: 'ignored', stars: [3] });
  assert.equal(saved.unlocked, 2);
  assert.equal(saved.extra, undefined);
  same(saved.stars, [3, 0, 0, 0, 0, 0, 0, 0]);
});
