const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { validatePath } = require('../lib/path-validator');

const ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mdview-pv-')));

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

test('accepts an absolute .md path under the root', () => {
  const file = path.join(ROOT, 'foo.md');
  fs.writeFileSync(file, '# hello');
  const out = validatePath(file, ROOT);
  assert.strictEqual(out, fs.realpathSync(file));
});

test('rejects relative paths', () => {
  assert.throws(() => validatePath('foo.md', ROOT), /not absolute/);
});

test('rejects paths with wrong extension', () => {
  const file = path.join(ROOT, 'foo.txt');
  fs.writeFileSync(file, 'x');
  assert.throws(() => validatePath(file, ROOT), /\.md/);
});

test('rejects paths outside the root', () => {
  // /tmp is outside the temp ROOT we created
  assert.throws(() => validatePath('/tmp/foo.md', ROOT), /outside root/);
});

test('rejects ../ traversal', () => {
  const escape = path.join(ROOT, 'sub', '..', '..', 'evil.md');
  assert.throws(() => validatePath(escape, ROOT), /outside root|does not exist/);
});

test('rejects when the file does not exist', () => {
  assert.throws(() => validatePath(path.join(ROOT, 'missing.md'), ROOT), /does not exist/);
});

test('follows symlinks via realpath', () => {
  const target = path.join(ROOT, 'real.md');
  const link = path.join(ROOT, 'link.md');
  fs.writeFileSync(target, 'x');
  fs.symlinkSync(target, link);
  assert.strictEqual(validatePath(link, ROOT), fs.realpathSync(link));
});
