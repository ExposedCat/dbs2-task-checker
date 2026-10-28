import { expect, test } from 'bun:test';
import { parse } from 'acorn';
import { prepareMongoResult } from './mongo-results';

test('materializes the final expression without rewriting earlier statements or comments', () => {
  const output = prepareMongoResult([
    'const name = "; // db.fake.find()"',
    'db.people.find({name}).sort({age:1});; // tail',
  ]);
  expect(output.startsWith('const name = "; // db.fake.find()";\n')).toBe(true);
  expect(output).toContain('})(db.people.find({name}).sort({age:1}));; // tail');
  expect(() => parse(output, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true })).not.toThrow();
});
test('retains declarations and handles scalars, awaited expressions, and malformed JavaScript', () => {
  expect(prepareMongoResult(['const x = 1;'])).toBe('const x = 1;');
  expect(prepareMongoResult(['42'])).toContain('})(42)');
  expect(prepareMongoResult(['await db.people.find().toArray()'])).toContain('})(await db.people.find().toArray())');
  expect(() => prepareMongoResult(['db.people.find('])).toThrow();
});
