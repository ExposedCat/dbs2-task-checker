import { expect, test } from 'bun:test';
import { taskOrderMatters } from './task-order';
import { prepareRedisCommand } from './execute/redis-command';

test('existing questions and references determine ordering without extra dataset fields', () => {
  const task = { kind: 'Select', question: 'Return names', solution: ['db.people.find()'], test: null };
  expect(taskOrderMatters(task)).toBe(false);
  expect(taskOrderMatters({ ...task, question: 'Return names sorted ascending' })).toBe(true);
  expect(taskOrderMatters({ ...task, solution: ['db.people.find().sort({name:1})'] })).toBe(true);
  expect(taskOrderMatters({ ...task, solution: ['ZREVRANGE scores 0 2'] })).toBe(true);
  expect(taskOrderMatters({ ...task, orderMatters: false, solution: ['ZREVRANGE scores 0 2'] })).toBe(false);
});
test('legacy Redis count syntax is supported and native COUNT limits are preserved', () => {
  expect(prepareRedisCommand('GEOSEARCH locations FROMLONLAT 1 2 BYRADIUS 5 km COUNT'.split(' '), false)).toEqual({
    command: 'GEOSEARCH locations FROMLONLAT 1 2 BYRADIUS 5 km'.split(' '),
    count: true,
  });
  expect(prepareRedisCommand('GEOSEARCH locations FROMLONLAT 1 2 BYRADIUS 5 km COUNT 3'.split(' '), false).count).toBe(
    false,
  );
});
