import { expect, test } from 'bun:test';
import { compareResponses } from '../comparison';
import { redisComparisonReply } from './redis-results';

function compare(command: string, left: unknown, right: unknown, ordered = false) {
  const wrap = (value: unknown) => JSON.stringify([redisComparisonReply(command.split(' '), value)]);
  return compareResponses('', '', ordered, wrap(left), wrap(right));
}
test('hash fields may reorder, but swapping their associated values is incorrect', () => {
  expect(compare('HGETALL hash', ['name', 'Alice', 'age', '20'], ['age', '20', 'name', 'Alice'])).toBe(true);
  expect(compare('HGETALL hash', ['name', 'Alice', 'age', '20'], ['age', 'Alice', 'name', '20'])).toBe(false);
});
test('Redis JSON documents compare as structured values and preserve JSON array order', () => {
  expect(compare('JSON.GET person', '{"name":"Alice","age":20}', '{"age":20,"name":"Alice"}')).toBe(true);
  expect(compare('JSON.GET person', '{"values":[1,2]}', '{"values":[2,1]}')).toBe(false);
  expect(compare('JSON.MGET a b $', ['{"x":1,"y":2}', null], ['{"y":2,"x":1}', null])).toBe(true);
});
test('sorted-set members retain their scores when rows reorder', () => {
  expect(compare('ZRANGE scores 0 -1 WITHSCORES', ['Alice', '1', 'Bob', '2'], ['Bob', '2', 'Alice', '1'])).toBe(true);
  expect(compare('ZRANGE scores 0 -1 WITHSCORES', ['Alice', '1', 'Bob', '2'], ['Alice', '2', 'Bob', '1'])).toBe(false);
  expect(compare('ZRANGE scores 0 -1 WITHSCORES', ['Alice', '1', 'Bob', '2'], ['Bob', '2', 'Alice', '1'], true)).toBe(
    false,
  );
});
test('search results preserve document/field associations while ignoring unordered row and field order', () => {
  const left = [2, 'doc:1', ['name', 'Alice', 'age', '20'], 'doc:2', ['name', 'Bob', 'age', '30']];
  const right = [2, 'doc:2', ['age', '30', 'name', 'Bob'], 'doc:1', ['age', '20', 'name', 'Alice']];
  expect(compare('FT.SEARCH idx *', left, right)).toBe(true);
  expect(compare('FT.SEARCH idx *', left, right, true)).toBe(false);
  expect(compare('FT.SEARCH idx *', left, [2, 'doc:2', left[2], 'doc:1', left[4]])).toBe(false);
  expect(compare('FT.SEARCH idx *', left, [3, ...left.slice(1)])).toBe(false);
});
test('search handles score/no-content flags and aggregate fields as complete rows', () => {
  expect(compare('FT.SEARCH idx * NOCONTENT WITHSCORES', [2, 'a', '1', 'b', '2'], [2, 'b', '2', 'a', '1'])).toBe(true);
  expect(
    compare('FT.SEARCH idx * RETURN 1 WITHSCORES', [1, 'a', ['WITHSCORES', 'x']], [1, 'a', ['WITHSCORES', 'x']]),
  ).toBe(true);
  expect(
    compare(
      'FT.AGGREGATE idx * GROUPBY 1 @name',
      [2, ['name', 'Alice'], ['name', 'Bob']],
      [2, ['name', 'Bob'], ['name', 'Alice']],
    ),
  ).toBe(true);
});
test('tuple results preserve order and scan replies preserve cursor plus pair associations', () => {
  expect(compare('MGET a b', ['Alice', 'Bob'], ['Bob', 'Alice'])).toBe(false);
  expect(compare('HSCAN hash 0', ['0', ['name', 'Alice', 'age', '20']], ['0', ['age', '20', 'name', 'Alice']])).toBe(
    true,
  );
  expect(compare('HSCAN hash 0', ['0', ['name', 'Alice']], ['1', ['name', 'Alice']])).toBe(false);
});
