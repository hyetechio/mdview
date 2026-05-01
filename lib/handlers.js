const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { validatePath } = require('./path-validator');

const MAX_BODY = 1024 * 1024; // 1 MB
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/reader.js': { file: 'reader.js', type: 'application/javascript; charset=utf-8' },
  '/reader.css': { file: 'reader.css', type: 'text/css; charset=utf-8' },
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'content-type': 'application/json' });
}

async function readBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) {
      const e = new Error('payload too large');
      e.status = 413;
      throw e;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handlePing(req, res) {
  sendJson(res, 200, { service: 'mdview', version: 1 });
}

async function handleStatic(req, res, urlPath) {
  const entry = STATIC_FILES[urlPath];
  if (!entry) return send(res, 404, 'not found');
  try {
    const data = await fsp.readFile(path.join(PUBLIC_DIR, entry.file));
    send(res, 200, data, { 'content-type': entry.type });
  } catch {
    send(res, 500, 'static read failed');
  }
}

function statusForValidatorError(e) {
  return e.code === 'ENOENT' ? 404 : 400;
}

async function handleGetFile(req, res, params, ctx) {
  let p;
  try { p = validatePath(params.get('path') || '', ctx.root); }
  catch (e) { return send(res, statusForValidatorError(e), e.message); }
  try {
    const data = await fsp.readFile(p);
    send(res, 200, data, { 'content-type': 'text/markdown; charset=utf-8' });
  } catch {
    send(res, 500, 'read failed');
  }
}

async function handleGetComments(req, res, params, ctx) {
  let p;
  try { p = validatePath(params.get('path') || '', ctx.root); }
  catch (e) { return send(res, statusForValidatorError(e), e.message); }
  const sidecar = p + '.review.json';
  try {
    const data = await fsp.readFile(sidecar, 'utf8');
    send(res, 200, data, { 'content-type': 'application/json' });
  } catch (e) {
    if (e.code === 'ENOENT') return sendJson(res, 200, { version: 1, comments: [] });
    sendJson(res, 500, { error: 'sidecar read failed' });
  }
}

async function handlePutComments(req, res, params, ctx) {
  let p;
  try { p = validatePath(params.get('path') || '', ctx.root); }
  catch (e) { return send(res, statusForValidatorError(e), e.message); }
  let body;
  try { body = await readBody(req); }
  catch (e) { return send(res, e.status || 500, e.message); }
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { return send(res, 400, 'invalid json'); }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.comments)) {
    return send(res, 400, 'invalid sidecar shape');
  }
  try {
    await fsp.writeFile(p + '.review.json', JSON.stringify(parsed, null, 2));
    send(res, 204, '');
  } catch {
    send(res, 500, 'write failed');
  }
}

async function dispatch(req, res, ctx) {
  const url = new URL(req.url, 'http://localhost');
  const params = url.searchParams;
  const m = req.method;
  const p = url.pathname;

  if (m === 'GET' && p === '/api/ping') return handlePing(req, res);
  if (m === 'GET' && p === '/api/file') return handleGetFile(req, res, params, ctx);
  if (m === 'GET' && p === '/api/comments') return handleGetComments(req, res, params, ctx);
  if (m === 'PUT' && p === '/api/comments') return handlePutComments(req, res, params, ctx);
  if (m === 'GET' && STATIC_FILES[p]) return handleStatic(req, res, p);

  send(res, 404, 'not found');
}

module.exports = { dispatch };
