import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeTurnIndex, turnBuckets, turnFocusIndex } from './turn-navigation';

test('height-derived buckets include first, latest and every exact turn once', () => {
  for (const count of [0, 1, 3, 61, 121, 1000]) {
    for (const height of [0, 24, 120, 480]) {
      const buckets = turnBuckets(count, height);
      const indices = buckets.flatMap(({ start, end }) => Array.from({ length: end - start + 1 }, (_, index) => start + index));
      assert.deepEqual(indices, Array.from({ length: count }, (_, index) => index));
      assert.ok(buckets.length <= Math.max(1, Math.floor(height / 12)));
      if (count) { assert.equal(buckets[0].start, 0); assert.equal(buckets[buckets.length - 1].end, count - 1); }
    }
  }
  assert.ok(turnBuckets(1000, 480).length > turnBuckets(1000, 120).length);
});

test('the compact rail adds a stripe per turn until its viewport limit', () => {
  assert.equal(turnBuckets(3, 240).length, 3);
  assert.equal(turnBuckets(8, 240).length, 8);
  assert.equal(turnBuckets(18, 240).length, 18);
  assert.equal(turnBuckets(1000, 240).length, 20);
  assert.deepEqual(turnBuckets(25, 36), [
    { start: 0, end: 7 }, { start: 8, end: 15 }, { start: 16, end: 24 },
  ]);
});

test('current turn considers the whole ordered visible set and long answers', () => {
  const positions = [{ top: 0, bottom: 100 }, { top: 500, bottom: 650 }, { top: 900, bottom: 1000 }];
  assert.equal(activeTurnIndex(positions, 50, 700), 0);
  assert.equal(activeTurnIndex(positions, 150, 400), 0);
  assert.equal(activeTurnIndex(positions, 700, 850), 1);
  assert.equal(activeTurnIndex(positions, 920, 1100), 2);
  assert.equal(activeTurnIndex(positions, 0, 700), 0);
  assert.equal(activeTurnIndex([], 0, 100), -1);
  assert.equal(activeTurnIndex(positions, 100, 50), -1);
});

test('keyboard movement reaches first and latest without leaving the rail', () => {
  assert.equal(turnFocusIndex('Home', 5, 10), 0);
  assert.equal(turnFocusIndex('End', 0, 10), 9);
  assert.equal(turnFocusIndex('ArrowDown', 9, 10), 9);
  assert.equal(turnFocusIndex('ArrowUp', 0, 10), 0);
  assert.equal(turnFocusIndex('ArrowDown', 4, 10), 5);
  assert.equal(turnFocusIndex('Enter', 4, 10), null);
  assert.equal(turnFocusIndex('Home', 0, 0), null);
});
