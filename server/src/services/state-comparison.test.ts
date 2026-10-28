import { expect, test } from 'bun:test';
import { sameStateChanges, stateChanges, type StateObservation, normalizeMongoSnapshot } from './state-comparison';
const redis = (before: Record<string, unknown>, after: Record<string, unknown>, startedAt = 0): StateObservation => ({
  engine: 'redis',
  before,
  after,
  startedAt,
});
const key = (value: unknown, expiresAt = -1) => ({ type: 'string', value, expiresAt });
const mongo = (before: unknown[], after: unknown[]): StateObservation => ({
  engine: 'mongodb',
  before: { people: { documents: before, indexes: [] } },
  after: { people: { documents: after, indexes: [] } },
  startedAt: 0,
});
const oid = (n: number) => ({ $oid: n.toString(16).padStart(24, '0') });

test('unchanged generated seed entities do not affect net state changes', () => {
  const a = redis({ stream: 'generated-1', name: 'Bob' }, { stream: 'generated-1', name: 'Alice' });
  const b = redis({ stream: 'generated-2', name: 'Bob' }, { stream: 'generated-2', name: 'Alice' });
  expect(stateChanges(a)).toEqual({ name: 'Alice' });
  expect(sameStateChanges(a, b)).toBe(true);
  expect(sameStateChanges(a, redis({}, { unrelated: 'Alice' }))).toBe(false);
  expect(sameStateChanges(a, redis({ name: 'Bob' }, { name: 'Alice', unrelated: 'Bob' }))).toBe(false);
});
test('deletion, expiration changes, and ordered values are checked', () => {
  const expected = redis({}, { 'key:a': key(['Alice', 'Bob'], 301000) }, 1000);
  expect(sameStateChanges(expected, redis({}, { 'key:a': key(['Alice', 'Bob'], 305010) }, 5000))).toBe(true);
  expect(sameStateChanges(expected, redis({}, { 'key:a': key(['Bob', 'Alice'], 305000) }, 5000))).toBe(false);
  expect(sameStateChanges(expected, redis({}, { 'key:a': key(['Alice', 'Bob'], 500000) }, 5000))).toBe(false);
  expect(sameStateChanges(redis({ name: 1 }, {}), redis({ wrong: 1 }, {}))).toBe(false);
});
test('Mongo generated seed IDs are paired by original document identity, retaining the target and other fields', () => {
  const a = mongo(
    [
      { _id: oid(1), name: 'Alice', n: 1 },
      { _id: oid(2), name: 'Bob', n: 2 },
    ],
    [
      { _id: oid(1), name: 'Alice', n: 3 },
      { _id: oid(2), name: 'Bob', n: 2 },
    ],
  );
  const b = mongo(
    [
      { _id: oid(3), name: 'Alice', n: 1 },
      { _id: oid(4), name: 'Bob', n: 2 },
    ],
    [
      { _id: oid(3), name: 'Alice', n: 3 },
      { _id: oid(4), name: 'Bob', n: 2 },
    ],
  );
  expect(sameStateChanges(a, b)).toBe(true);
  b.after = {
    people: {
      documents: [
        { _id: oid(3), name: 'Alice', n: 1 },
        { _id: oid(4), name: 'Bob', n: 3 },
      ],
      indexes: [],
    },
  };
  expect(sameStateChanges(a, b)).toBe(false);
});
test('generated insert IDs normalize but explicit reference ObjectIds remain significant', () => {
  const a = mongo([], [{ _id: oid(1), name: 'Alice' }]);
  const b = mongo([], [{ _id: oid(2), name: 'Alice' }]);
  expect(sameStateChanges(a, b)).toBe(true);
  expect(sameStateChanges(a, b, [oid(1).$oid])).toBe(false);
});
test('Mongo document and object-field order normalize while embedded array and compound index order remain significant', () => {
  const a = normalizeMongoSnapshot('{"c":{"documents":[{"n":2},{"n":1}],"indexes":[]}}');
  const b = normalizeMongoSnapshot('{"c":{"indexes":[],"documents":[{"n":1},{"n":2}]}}');
  expect(a).toEqual(b);
  expect(sameStateChanges(mongo([], [{ a: [1, 2] }]), mongo([], [{ a: [2, 1] }]))).toBe(false);
});
