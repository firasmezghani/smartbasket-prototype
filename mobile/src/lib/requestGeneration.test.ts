import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestGeneration } from './requestGeneration';

test('a later request supersedes an earlier one', () => {
  const gen = createRequestGeneration();
  const a = gen.next(); // request A starts
  const b = gen.next(); // request B starts (newer)

  // B resolves first and is still current.
  assert.equal(gen.isCurrent(b), true);
  // A resolves after B, so it must not write.
  assert.equal(gen.isCurrent(a), false);
});

test('an older request that resolves last is still rejected', () => {
  const gen = createRequestGeneration();
  const first = gen.next();
  const second = gen.next();

  // The second request commits, then the slow first one resolves.
  assert.equal(gen.isCurrent(second), true); // second commits
  assert.equal(gen.isCurrent(first), false); // first is dropped
});

test('a stale load-more is invalidated when the filter changes', () => {
  const gen = createRequestGeneration();
  gen.next(); // initial results load
  const loadMoreToken = gen.current(); // load-more captures the current generation

  gen.next(); // filter / search changed -> new generation

  // The in-flight load-more must not append.
  assert.equal(gen.isCurrent(loadMoreToken), false);
});

test('the current token keeps committing until superseded', () => {
  const gen = createRequestGeneration();
  const token = gen.next();
  assert.equal(gen.isCurrent(token), true);
  assert.equal(gen.isCurrent(token), true); // repeated pages under the same filter
  assert.equal(gen.current(), token);
  gen.next();
  assert.equal(gen.isCurrent(token), false);
});

test('generations are strictly monotonic', () => {
  const gen = createRequestGeneration(5);
  assert.equal(gen.current(), 5);
  assert.equal(gen.next(), 6);
  assert.equal(gen.next(), 7);
  assert.equal(gen.current(), 7);
});
