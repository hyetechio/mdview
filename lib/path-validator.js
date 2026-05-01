const path = require('node:path');
const fs = require('node:fs');

function validatePath(candidate, root) {
  if (!path.isAbsolute(candidate)) {
    const e = new Error(`path is not absolute: ${candidate}`);
    e.code = 'ENOTABS';
    throw e;
  }
  if (path.extname(candidate) !== '.md') {
    const e = new Error(`path does not end in .md: ${candidate}`);
    e.code = 'EBADEXT';
    throw e;
  }
  // Pre-check containment lexically (no fs calls) so non-existent outside-root
  // paths get EOUTSIDE rather than ENOENT.
  const realRoot = fs.realpathSync(root);
  const normalized = path.resolve(candidate);
  const preRel = path.relative(realRoot, normalized);
  if (preRel.startsWith('..') || path.isAbsolute(preRel)) {
    const e = new Error(`path outside root: ${candidate}`);
    e.code = 'EOUTSIDE';
    throw e;
  }
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    const e = new Error(`path does not exist: ${candidate}`);
    e.code = 'ENOENT';
    throw e;
  }
  const rel = path.relative(realRoot, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const e = new Error(`path outside root: ${candidate}`);
    e.code = 'EOUTSIDE';
    throw e;
  }
  return real;
}

module.exports = { validatePath };
