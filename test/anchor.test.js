const { test } = require('node:test');
const assert = require('node:assert');
const { findAnchor } = require('../lib/anchor');

test('returns the only match when text is unique', () => {
  const src = 'hello world, foo bar baz';
  const r = findAnchor(src, 'foo bar', 'hello world, ', ' baz');
  assert.deepStrictEqual(r, { start: 13, end: 20 });
});

test('disambiguates duplicates using context_before', () => {
  const src = 'first foo. second foo.';
  const r = findAnchor(src, 'foo', 'second ', '.');
  assert.deepStrictEqual(r, { start: 18, end: 21 });
});

test('disambiguates duplicates using context_after when before is empty', () => {
  const src = 'foo and foo and foo end';
  const r = findAnchor(src, 'foo', '', ' end');
  assert.deepStrictEqual(r, { start: 16, end: 19 });
});

test('returns first occurrence when context cannot disambiguate', () => {
  const src = 'foo foo foo';
  const r = findAnchor(src, 'foo', '', '');
  assert.deepStrictEqual(r, { start: 0, end: 3 });
});

test('returns null when text is not in source', () => {
  assert.strictEqual(findAnchor('hello', 'world', '', ''), null);
});

test('partial context match still scores the right occurrence', () => {
  const src = 'A foo Z. B foo Z.';
  // user selected the "B foo" occurrence; context_before is 'B '
  const r = findAnchor(src, 'foo', 'B ', ' Z.');
  assert.deepStrictEqual(r, { start: 11, end: 14 });
});
