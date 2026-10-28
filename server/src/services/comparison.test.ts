import { expect, test } from 'bun:test';
import { compareResponses, parseReplies } from './comparison';
import { requiredPoints, validateTestPolicy, hasPassed } from './test-policy';

test('compares structure and values independently of formatting and object key order', () => {
  expect(
    compareResponses('{"name":"Alice","meta":{"a":1,"b":true}}', '{ "meta": { "b": true, "a": 1 }, "name": "Alice" }'),
  ).toBe(true);
  for (const [left, right] of [
    ['1', '"1"'],
    ['null', '"null"'],
    ['{"a":1}', '{"a":1,"b":2}'],
    ['{"a":1}', '{"a":2}'],
  ]) {
    expect(compareResponses(left, right)).toBe(false);
  }
});
test('row order is optional, duplicate counts matter, nested array order is preserved', () => {
  expect(compareResponses('[{"a":1},{"a":2}]', '[{"a":2},{"a":1}]')).toBe(true);
  expect(compareResponses('[1,2]', '[2,1]', true)).toBe(false);
  expect(compareResponses('[1,1,2]', '[1,2,2]')).toBe(false);
  expect(compareResponses('[{"a":[1,2]}]', '[{"a":[2,1]}]')).toBe(false);
  expect(compareResponses('[1,1,2]', '[2,1,1]')).toBe(true);
});
test('decodes multi-command Redis JSON without interpreting quoted newlines or braces', () => {
  expect(parseReplies('"a\\n{b}"\n [1,\n2]\n null\n')).toEqual(['a\n{b}', [1, 2], null]);
  expect(compareResponses('"OK"\n[1,2]', '"OK"\n[2,1]')).toBe(true);
  expect(compareResponses('1\n2', '2\n1')).toBe(false);
  expect(compareResponses('1', '1\n2')).toBe(false);
  expect(compareResponses('1', 'not JSON')).toBe(false);
  for (const output of ['', '{}garbage', '[]]', '"unterminated', '{"a":1'])
    expect(() => parseReplies(output)).toThrow();
});
test('Extended JSON remains structured and large integer values remain distinct', () => {
  expect(
    compareResponses(
      '{"_id":{"$oid":"abc"},"n":{"$numberLong":"9007199254740993"}}',
      '{"n":{"$numberLong":"9007199254740993"},"_id":{"$oid":"abc"}}',
    ),
  ).toBe(true);
  expect(compareResponses('{"$numberLong":"9007199254740992"}', '{"$numberLong":"9007199254740993"}')).toBe(false);
});
test('legacy short tests have attainable defaults and legacy retries use that threshold', () => {
  expect(requiredPoints({ kinds: { read: 2 } })).toBe(2);
  expect(requiredPoints({ kinds: { read: 20 } })).toBe(10);
  expect(requiredPoints({ kinds: { read: 20 }, minPoints: 5 })).toBe(5);
  expect(hasPassed([{ datasetId: 'redis', grade: 2, session: [] }], 'redis', 2)).toBe(true);
  expect(validateTestPolicy({ bank: [], kinds: {}, minPoints: 1 })).not.toBeNull();
});
