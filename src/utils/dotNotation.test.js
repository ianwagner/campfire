import { flattenObject, unflattenObject } from './dotNotation';

test('flattens nested objects', () => {
  const obj = { a: { b: 1, c: { d: 2 } }, e: 3 };
  expect(flattenObject(obj)).toEqual({ 'a.b': 1, 'a.c.d': 2, e: 3 });
});

test('unflattens dot notation keys', () => {
  const obj = { 'a.b': 1, 'a.c.d': 2, e: 3 };
  expect(unflattenObject(obj)).toEqual({ a: { b: 1, c: { d: 2 } }, e: 3 });
});
