const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { resolveTarget, probeMdview } = require('../bin/mdview');

let ROOT;

before(() => {
  ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mdview-cli-')));
});

after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

test('resolveTarget returns absolute realpath for an existing .md under root', () => {
  const file = path.join(ROOT, 'doc.md');
  fs.writeFileSync(file, '#');
  const out = resolveTarget(file, ROOT);
  assert.strictEqual(out, fs.realpathSync(file));
});

test('resolveTarget rejects non-md files', () => {
  const file = path.join(ROOT, 'doc.txt');
  fs.writeFileSync(file, 'x');
  assert.throws(() => resolveTarget(file, ROOT), /\.md/);
});

test('resolveTarget rejects missing files', () => {
  assert.throws(() => resolveTarget(path.join(ROOT, 'nope.md'), ROOT), /does not exist/);
});

test('resolveTarget resolves relative paths against cwd', () => {
  const file = path.join(ROOT, 'rel.md');
  fs.writeFileSync(file, '#');
  const cwd = process.cwd();
  process.chdir(ROOT);
  try {
    const out = resolveTarget('rel.md', ROOT);
    assert.strictEqual(out, fs.realpathSync(file));
  } finally {
    process.chdir(cwd);
  }
});

test('probeMdview returns false when nothing is listening', async () => {
  // pick a port nothing should be on
  const r = await probeMdview(1, 200);
  assert.strictEqual(r, false);
});

test('probeMdview returns true when the mdview daemon answers /api/ping', async () => {
  const http = require('node:http');
  const srv = http.createServer((req, res) => {
    if (req.url === '/api/ping') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ service: 'mdview', version: 1 }));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  try {
    const r = await probeMdview(port, 500);
    assert.strictEqual(r, true);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('probeMdview returns false when something else is on the port', async () => {
  const http = require('node:http');
  const srv = http.createServer((req, res) => {
    res.writeHead(200).end('not mdview');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  try {
    const r = await probeMdview(port, 500);
    assert.strictEqual(r, false);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});
