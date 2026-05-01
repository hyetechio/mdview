const { test } = require('node:test');
const assert = require('node:assert');
const { initial, reduce, IDLE, PROBE, COMPOSE } = require('../public/comment-state');

const SEL_A = { text: 'foo', before: '', after: '', rect: { top: 10, left: 20 } };
const SEL_B = { text: 'bar', before: 'x', after: 'y', rect: { top: 50, left: 60 } };

test('initial state is IDLE with no selection', () => {
  assert.deepStrictEqual(initial(), { mode: IDLE, selection: null });
});

test('IDLE + SELECT → PROBE carrying the selection', () => {
  const r = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  assert.strictEqual(r.mode, PROBE);
  assert.strictEqual(r.selection, SEL_A);
});

test('PROBE + new SELECT → PROBE with new selection (replaces)', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'SELECT', selection: SEL_B });
  assert.strictEqual(s.mode, PROBE);
  assert.strictEqual(s.selection, SEL_B);
});

test('PROBE + OPEN_COMPOSE → COMPOSE preserving selection', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  assert.strictEqual(s.mode, COMPOSE);
  assert.strictEqual(s.selection, SEL_A);
});

test('PROBE + CLEAR_SELECTION → IDLE', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'CLEAR_SELECTION' });
  assert.deepStrictEqual(s, { mode: IDLE, selection: null });
});

test('COMPOSE + new SELECT → COMPOSE with new selection (the user-requested fix)', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  s = reduce(s, { type: 'SELECT', selection: SEL_B });
  assert.strictEqual(s.mode, COMPOSE);
  assert.strictEqual(s.selection, SEL_B);
});

test('COMPOSE + CLEAR_SELECTION → COMPOSE (do not close input on stray click)', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  const prev = s;
  s = reduce(s, { type: 'CLEAR_SELECTION' });
  assert.strictEqual(s, prev);
});

test('COMPOSE + CANCEL → IDLE', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  s = reduce(s, { type: 'CANCEL' });
  assert.deepStrictEqual(s, { mode: IDLE, selection: null });
});

test('COMPOSE + SAVE → IDLE', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  s = reduce(s, { type: 'SAVE' });
  assert.deepStrictEqual(s, { mode: IDLE, selection: null });
});

test('IDLE + CANCEL/SAVE/OPEN_COMPOSE/CLEAR_SELECTION → no-op', () => {
  const i = initial();
  for (const t of ['CANCEL', 'SAVE', 'OPEN_COMPOSE', 'CLEAR_SELECTION']) {
    assert.strictEqual(reduce(i, { type: t }), i, `${t} from IDLE should be no-op`);
  }
});

test('PROBE + CANCEL/SAVE → no-op', () => {
  const s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  for (const t of ['CANCEL', 'SAVE']) {
    assert.strictEqual(reduce(s, { type: t }), s, `${t} from PROBE should be no-op`);
  }
});

test('COMPOSE + OPEN_COMPOSE → no-op', () => {
  let s = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  assert.strictEqual(reduce(s, { type: 'OPEN_COMPOSE' }), s);
});

test('SELECT with null selection → no-op (defensive)', () => {
  const i = initial();
  assert.strictEqual(reduce(i, { type: 'SELECT', selection: null }), i);
  const probe = reduce(i, { type: 'SELECT', selection: SEL_A });
  assert.strictEqual(reduce(probe, { type: 'SELECT', selection: null }), probe);
});

test('unknown action type → no-op', () => {
  const i = initial();
  assert.strictEqual(reduce(i, { type: 'NOPE' }), i);
});

test('reachability: every state can be reached', () => {
  const idle = initial();
  const probe = reduce(idle, { type: 'SELECT', selection: SEL_A });
  const compose = reduce(probe, { type: 'OPEN_COMPOSE' });
  assert.strictEqual(idle.mode, IDLE);
  assert.strictEqual(probe.mode, PROBE);
  assert.strictEqual(compose.mode, COMPOSE);
});

test('reachability: every state has an exit (no dead ends)', () => {
  // IDLE → PROBE
  const probe = reduce(initial(), { type: 'SELECT', selection: SEL_A });
  assert.notStrictEqual(probe.mode, IDLE);
  // PROBE → IDLE
  assert.strictEqual(reduce(probe, { type: 'CLEAR_SELECTION' }).mode, IDLE);
  // PROBE → COMPOSE
  const compose = reduce(probe, { type: 'OPEN_COMPOSE' });
  assert.strictEqual(compose.mode, COMPOSE);
  // COMPOSE → IDLE (two ways)
  assert.strictEqual(reduce(compose, { type: 'SAVE' }).mode, IDLE);
  assert.strictEqual(reduce(compose, { type: 'CANCEL' }).mode, IDLE);
});

test('full happy-path round trip', () => {
  let s = initial();
  s = reduce(s, { type: 'SELECT', selection: SEL_A });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  s = reduce(s, { type: 'SAVE' });
  s = reduce(s, { type: 'SELECT', selection: SEL_B });
  s = reduce(s, { type: 'OPEN_COMPOSE' });
  s = reduce(s, { type: 'CANCEL' });
  assert.deepStrictEqual(s, { mode: IDLE, selection: null });
});
