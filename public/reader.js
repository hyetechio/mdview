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
    injectComponentButtons();
    renderSidebar();
  }

  // Marker-paragraph detection. Email drafts use bold field labels: **Subject:**, **To:**, **Cc:**,
  // **Bcc:**, **From:**. Each becomes its own "copy field value" component.
  // After a marker run, the contiguous block of non-marker content up to the next <hr> or another
  // marker is treated as the "Body" component and gets a "Copy Body" button (clean HTML).
  const FIELD_MARKERS = ['Subject:', 'To:', 'Cc:', 'Bcc:', 'From:'];

  function injectComponentButtons() {
    // Email-mode gate: only inject component-copy buttons if a Subject marker exists.
    // Non-email markdown gets no per-component buttons (and no "Copy all" — see below).
    const blocks = Array.from(content.children);
    const isEmail = blocks.some((b) => matchFieldMarker(b) === 'Subject');

    const copyAllBtn = $('mdv-copy-all');
    if (copyAllBtn) {
      if (isEmail) {
        copyAllBtn.hidden = false;
        copyAllBtn.textContent = 'Copy email for Gmail';
        copyAllBtn.title = 'Copy entire email body as clean HTML, paste-ready for Gmail compose';
      } else {
        copyAllBtn.hidden = true;
      }
    }

    if (!isEmail) return;

    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      const fieldName = matchFieldMarker(b);
      if (fieldName) {
        wrapAsComponent([b], fieldName, getFieldValue(b, fieldName));
        i += 1;
        // Skip past any additional field-marker paragraphs (each gets its own button)
        let firstBodyIdx = i;
        while (firstBodyIdx < blocks.length && matchFieldMarker(blocks[firstBodyIdx])) {
          const f2 = matchFieldMarker(blocks[firstBodyIdx]);
          wrapAsComponent([blocks[firstBodyIdx]], f2, getFieldValue(blocks[firstBodyIdx], f2));
          firstBodyIdx += 1;
        }
        // Body span ends at next <hr> or doc end
        let bodyEnd = firstBodyIdx;
        while (bodyEnd < blocks.length && blocks[bodyEnd].tagName !== 'HR') {
          bodyEnd += 1;
        }
        if (bodyEnd > firstBodyIdx) {
          wrapAsComponent(blocks.slice(firstBodyIdx, bodyEnd), 'Body', null);
        }
        i = bodyEnd;
      } else {
        i += 1;
      }
    }
  }

  function matchFieldMarker(el) {
    if (!el || el.tagName !== 'P') return null;
    const first = el.firstElementChild;
    if (!first || first.tagName !== 'STRONG') return null;
    const text = first.textContent.trim();
    for (const m of FIELD_MARKERS) {
      if (text === m || text === m.replace(':', '')) return m.replace(':', '');
    }
    return null;
  }

  function getFieldValue(p, fieldName) {
    // Concatenate everything after the leading <strong> as the value.
    const strong = p.firstElementChild;
    let value = '';
    let node = strong.nextSibling;
    while (node) {
      value += node.textContent;
      node = node.nextSibling;
    }
    return value.trim();
  }

  function wrapAsComponent(blocks, label, plainValue) {
    if (!blocks.length) return;
    const parent = blocks[0].parentNode;
    const wrap = document.createElement('div');
    wrap.className = 'mdv-component mdv-component-' + label.toLowerCase();
    parent.insertBefore(wrap, blocks[0]);
    blocks.forEach((b) => wrap.appendChild(b));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mdv-component-btn';
    btn.textContent = 'Copy ' + label + ' for Gmail';
    btn.title = 'Copy ' + label + ' as clean HTML, paste-ready for Gmail';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyComponent(wrap, btn, plainValue, label);
    });
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('mouseup', (e) => e.stopPropagation());
    wrap.appendChild(btn);
  }

  // Strip style/class/id attributes from a node tree, leaving only semantic HTML.
  // Gmail (and other rich-text editors) inherit their own styles when pasted HTML has none.
  function stripAttrs(root) {
    const all = root.querySelectorAll('*');
    all.forEach((el) => {
      el.removeAttribute('style');
      el.removeAttribute('class');
      el.removeAttribute('id');
      // Drop any data-* attributes too
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('data-')) el.removeAttribute(attr.name);
      }
    });
    if (root.removeAttribute) {
      root.removeAttribute('style');
      root.removeAttribute('class');
      root.removeAttribute('id');
    }
    return root;
  }

  // Remove our own copy-button markup from a clone so it doesn't end up in the clipboard.
  function stripCopyMarkup(node) {
    node.querySelectorAll('.mdv-copy-btn, .mdv-component-btn').forEach((b) => b.remove());
    node.querySelectorAll('.mdv-copyable').forEach((el) => el.classList.remove('mdv-copyable'));
  }

  async function writeHtmlToClipboard(html, plain) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error('Clipboard API unavailable (need a recent browser, served over localhost)');
    }
    await navigator.clipboard.write([
      new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
  }

  // Copy an email component to the clipboard.
  // - Field components (Subject, To, Cc, Bcc, From): plainValue is the bare value text. Copy as
  //   plain text only — pasting "Re: ..." into a Subject input keeps no formatting weirdness.
  // - Body component: plainValue is null. Copy as clean HTML + plain. Paste into Gmail compose body.
  async function copyComponent(wrap, btn, plainValue, label) {
    const original = btn.textContent;
    try {
      if (plainValue !== null && plainValue !== undefined) {
        await navigator.clipboard.writeText(plainValue);
      } else {
        const clone = wrap.cloneNode(true);
        stripCopyMarkup(clone);
        stripAttrs(clone);
        // Unwrap: copy inner content, not the .mdv-component div itself.
        const html = clone.innerHTML;
        const plain = wrap.innerText
          .replace(new RegExp('Copy ' + label + ' for Gmail\\s*$'), '')
          .trim();
        await writeHtmlToClipboard(html, plain);
      }
      btn.textContent = '✓ Copied';
      btn.classList.add('mdv-copied');
    } catch (e) {
      console.error('clipboard write failed', e);
      btn.textContent = '✗ Error';
    }
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('mdv-copied');
    }, 1400);
  }

  async function copyAll() {
    const btn = $('mdv-copy-all');
    const original = btn.textContent;
    try {
      const clone = content.cloneNode(true);
      stripCopyMarkup(clone);
      stripAttrs(clone);
      const html = clone.innerHTML;
      const plain = content.innerText;
      await writeHtmlToClipboard(html, plain);
      btn.textContent = '✓ Copied';
      btn.classList.add('mdv-copied');
    } catch (e) {
      console.error('clipboard write failed', e);
      btn.textContent = '✗ Error';
    }
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('mdv-copied');
    }, 1400);
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

  $('mdv-copy-all').addEventListener('click', () => { copyAll(); });

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
