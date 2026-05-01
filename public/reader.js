(function () {
  'use strict';

  const { initial, reduce, IDLE, PROBE, COMPOSE } = window.CommentState;

  const params = new URLSearchParams(location.search);
  const FILE = params.get('file');
  let mdSource = '';
  let comments = [];
  let state = initial();

  const $ = (id) => document.getElementById(id);
  const content = $('mdv-content');
  const sidebar = $('mdv-sidebar');
  const sbList = $('mdv-sb-list');
  const sbInput = $('mdv-sb-input');
  const sbQuote = $('mdv-sb-input-quote');
  const sbText = $('mdv-sb-input-text');
  const popover = $('mdv-popover');
  const filename = $('mdv-filename');
  const countLabel = $('mdv-count');

  if (!FILE) {
    content.textContent = 'No ?file= parameter.';
    return;
  }

  filename.textContent = FILE.split('/').pop();

  async function loadAll() {
    const [mdRes, cRes] = await Promise.all([
      fetch('/api/file?path=' + encodeURIComponent(FILE)),
      fetch('/api/comments?path=' + encodeURIComponent(FILE)),
    ]);
    if (!mdRes.ok) {
      content.textContent = 'Error loading file: ' + mdRes.status;
      return;
    }
    mdSource = await mdRes.text();
    if (cRes.ok) {
      const data = await cRes.json();
      comments = Array.isArray(data.comments) ? data.comments : [];
    }
    render();
  }

  function render() {
    content.innerHTML = window.marked.parse(mdSource);
    renderSidebar();
  }

  function renderSidebar() {
    countLabel.textContent = comments.length + ' comment' + (comments.length === 1 ? '' : 's');
    if (comments.length === 0) {
      sbList.innerHTML = '<div class="mdv-sb-empty">Select any text to add a comment.</div>';
      return;
    }
    sbList.innerHTML = '';
    for (const c of comments) {
      const div = document.createElement('div');
      div.className = 'mdv-sb-comment';
      div.dataset.id = c.id;
      div.innerHTML = `
        <div class="mdv-sb-meta">
          <span>${escapeHtml(new Date(c.created_at).toLocaleString())}</span>
          <button class="mdv-sb-delete" data-id="${escapeAttr(c.id)}">×</button>
        </div>
        <div class="mdv-sb-selected">${escapeHtml(c.selected_text)}</div>
        <div class="mdv-sb-text">${escapeHtml(c.comment)}</div>
      `;
      sbList.appendChild(div);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  function dispatch(action) {
    const prev = state;
    state = reduce(state, action);
    syncUI(prev, state);
  }

  function syncUI(prev, next) {
    // Popover: visible iff PROBE.
    if (next.mode === PROBE && next.selection) {
      popover.hidden = false;
      popover.style.top = Math.max(8, next.selection.rect.top - 36) + 'px';
      popover.style.left = Math.max(8, next.selection.rect.left) + 'px';
    } else {
      popover.hidden = true;
    }
    // Input pane: visible iff COMPOSE. Reset textarea when entering COMPOSE
    // or when the active selection changes mid-COMPOSE.
    if (next.mode === COMPOSE && next.selection) {
      const selectionChanged = prev.mode !== COMPOSE || prev.selection !== next.selection;
      sbQuote.textContent = next.selection.text;
      if (selectionChanged) sbText.value = '';
      sbInput.hidden = false;
      sidebar.classList.add('open');
      if (selectionChanged) sbText.focus();
    } else {
      sbInput.hidden = true;
    }
  }

  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const text = sel.toString();
    if (!text.trim()) return null;
    if (!content.contains(sel.anchorNode) || !content.contains(sel.focusNode)) return null;
    const rendered = content.innerText;
    const idx = rendered.indexOf(text);
    const before = idx > 0 ? rendered.slice(Math.max(0, idx - 30), idx) : '';
    const after = idx >= 0 ? rendered.slice(idx + text.length, idx + text.length + 30) : '';
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return { text, before, after, rect };
  }

  countLabel.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  $('mdv-sb-close').addEventListener('click', () => {
    sidebar.classList.remove('open');
  });

  let selectionTimer = null;

  document.addEventListener('mouseup', (e) => {
    if (popover.contains(e.target) || sidebar.contains(e.target)) return;
    clearTimeout(selectionTimer);
    const cap = captureSelection();
    if (!cap) { dispatch({ type: 'CLEAR_SELECTION' }); return; }
    // Delay so a quick select-then-copy (Cmd+C) flow never sees the popover.
    selectionTimer = setTimeout(() => {
      dispatch({ type: 'SELECT', selection: cap });
    }, 350);
  });

  document.addEventListener('mousedown', (e) => {
    if (popover.contains(e.target) || sidebar.contains(e.target)) return;
    clearTimeout(selectionTimer);
    if (state.mode === PROBE) dispatch({ type: 'CLEAR_SELECTION' });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearTimeout(selectionTimer);
      if (state.mode === PROBE) dispatch({ type: 'CLEAR_SELECTION' });
    }
  });

  $('mdv-popover-add').addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  $('mdv-popover-add').addEventListener('click', () => {
    dispatch({ type: 'OPEN_COMPOSE' });
  });

  $('mdv-sb-cancel').addEventListener('click', () => {
    dispatch({ type: 'CANCEL' });
  });

  $('mdv-sb-save').addEventListener('click', async () => {
    if (state.mode !== COMPOSE || !state.selection) return;
    const text = sbText.value.trim();
    if (!text) return;
    const sel = state.selection;
    const c = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      selected_text: sel.text,
      context_before: sel.before,
      context_after: sel.after,
      comment: text,
      created_at: new Date().toISOString(),
      status: 'open',
    };
    comments.push(c);
    dispatch({ type: 'SAVE' });
    renderSidebar();
    await persist();
  });

  sbList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.mdv-sb-delete');
    if (!btn) return;
    const id = btn.dataset.id;
    comments = comments.filter((c) => c.id !== id);
    renderSidebar();
    await persist();
  });

  async function persist() {
    const r = await fetch('/api/comments?path=' + encodeURIComponent(FILE), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, comments }),
    });
    if (!r.ok) {
      console.error('save failed', r.status);
      alert('Failed to save comment.');
    }
  }

  loadAll();

  window.__mdv = {
    loadAll, render, persist,
    get state() { return state; },
    get comments() { return comments; },
    set comments(v) { comments = v; },
    renderSidebar, escapeHtml,
  };
})();
