(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const FILE = params.get('file');
  let mdSource = '';
  let comments = [];
  let reviewMode = false;
  let pendingSelection = null;

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
  const toggleEl = $('mdv-mode-toggle');
  const toggleTrack = toggleEl.querySelector('.mdv-toggle-track');
  const toggleLabel = toggleEl.querySelector('.mdv-toggle-label');

  if (!FILE) {
    content.textContent = 'No ?file= parameter.';
    return;
  }

  filename.textContent = FILE.split('/').pop();
  document.body.classList.add('mdv-read');

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
      sbList.innerHTML = '<div class="mdv-sb-empty">Select text in Review mode to add a comment.</div>';
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

  toggleEl.addEventListener('click', (e) => {
    e.preventDefault();
    reviewMode = !reviewMode;
    toggleTrack.classList.toggle('active', reviewMode);
    toggleLabel.classList.toggle('active', reviewMode);
    document.body.classList.toggle('mdv-read', !reviewMode);
    if (reviewMode) sidebar.classList.add('open');
    else sidebar.classList.remove('open');
    hidePopover();
  });

  $('mdv-sb-close').addEventListener('click', () => {
    sidebar.classList.remove('open');
  });

  // Placeholder handlers — wired up in Task 10.
  function hidePopover() { popover.hidden = true; }

  loadAll();

  // Expose for Task 10 to extend.
  window.__mdv = { loadAll, render, get comments() { return comments; }, set comments(v) { comments = v; }, renderSidebar, escapeHtml };
})();
