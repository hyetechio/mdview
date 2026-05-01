function findAnchor(source, selectedText, contextBefore, contextAfter) {
  if (!selectedText) return null;
  const matches = [];
  let i = source.indexOf(selectedText);
  while (i !== -1) {
    matches.push(i);
    i = source.indexOf(selectedText, i + 1);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) {
    return { start: matches[0], end: matches[0] + selectedText.length };
  }

  let best = matches[0];
  let bestScore = -1;
  for (const start of matches) {
    const before = source.slice(Math.max(0, start - contextBefore.length), start);
    const after = source.slice(start + selectedText.length, start + selectedText.length + contextAfter.length);
    const score = commonSuffix(before, contextBefore) + commonPrefix(after, contextAfter);
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return { start: best, end: best + selectedText.length };
}

function commonSuffix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

module.exports = { findAnchor };
