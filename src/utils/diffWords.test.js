import diffWords from './diffWords';

test('identifies added and removed words', () => {
  const diff = diffWords('hello world', 'hello brave new world');
  expect(diff).toEqual([
    { type: 'same', text: 'hello' },
    { type: 'added', text: 'brave' },
    { type: 'added', text: 'new' },
    { type: 'same', text: 'world' },
  ]);
});

