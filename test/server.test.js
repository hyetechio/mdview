const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

let server, baseUrl, ROOT, mdPath;

before(async () => {
  ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mdview-srv-')));
  mdPath = path.join(ROOT, 'doc.md');
  fs.writeFileSync(mdPath, '# Hello\n\nbody text');
  server = createServer({ root: ROOT });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((r) => server.close(r)).then(() =>
  fs.rmSync(ROOT, { recursive: true, force: true })
));

test('GET /api/ping returns service identity', async () => {
  const r = await fetch(`${baseUrl}/api/ping`);
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.strictEqual(body.service, 'mdview');
});

test('GET / serves index.html with text/html', async () => {
  const r = await fetch(`${baseUrl}/`);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/html/);
});

test('GET /api/file returns MD content', async () => {
  const r = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent(mdPath)}`);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/markdown/);
  assert.strictEqual(await r.text(), '# Hello\n\nbody text');
});

test('GET /api/file rejects paths outside root', async () => {
  const r = await fetch(`${baseUrl}/api/file?path=/etc/hosts`);
  assert.strictEqual(r.status, 400);
});

test('GET /api/file 404s for missing file', async () => {
  const r = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent(path.join(ROOT, 'nope.md'))}`);
  assert.strictEqual(r.status, 404);
});

test('GET /api/comments returns empty doc when no sidecar exists', async () => {
  const r = await fetch(`${baseUrl}/api/comments?path=${encodeURIComponent(mdPath)}`);
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.deepStrictEqual(body, { version: 1, comments: [] });
});

test('PUT /api/comments writes the sidecar; subsequent GET returns it', async () => {
  const payload = {
    version: 1,
    comments: [{
      id: 'c_1', selected_text: 'Hello', context_before: '# ',
      context_after: '\n', comment: 'capitalize?', created_at: '2026-04-30T00:00:00Z',
      status: 'open',
    }],
  };
  const put = await fetch(`${baseUrl}/api/comments?path=${encodeURIComponent(mdPath)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(put.status, 204);

  const sidecar = JSON.parse(fs.readFileSync(mdPath + '.review.json', 'utf8'));
  assert.deepStrictEqual(sidecar, payload);

  const get = await fetch(`${baseUrl}/api/comments?path=${encodeURIComponent(mdPath)}`);
  assert.deepStrictEqual(await get.json(), payload);
});

test('PUT /api/comments rejects malformed JSON', async () => {
  const r = await fetch(`${baseUrl}/api/comments?path=${encodeURIComponent(mdPath)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.strictEqual(r.status, 400);
});

test('PUT /api/comments rejects oversized bodies (> 1 MB)', async () => {
  const big = 'x'.repeat(1024 * 1024 + 10);
  const r = await fetch(`${baseUrl}/api/comments?path=${encodeURIComponent(mdPath)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, comments: [{ comment: big }] }),
  });
  assert.strictEqual(r.status, 413);
});

test('unknown route returns 404', async () => {
  const r = await fetch(`${baseUrl}/api/wat`);
  assert.strictEqual(r.status, 404);
});
