# mdview

Local Markdown reader with selection-based comment capture. Open a `.md` file in Chrome, select any text, leave a comment. Comments persist in a sidecar JSON file (`<file>.md.review.json`) next to the original — easy for a script or LLM to read and apply as edits later.

Solo / local-only. No auth, no cloud, no deploy. macOS only.

## Install

Requires Node 18.17+ and Google Chrome.

```bash
git clone https://github.com/hyetechio/mdview.git ~/code/mdview
cd ~/code/mdview
npm install
npm link
```

`npm link` puts the `mdview` binary on your `PATH`. Now from anywhere:

```bash
mdview /path/to/some.md
```

First run spawns a tiny local daemon on `127.0.0.1:5237` and opens Chrome. Subsequent runs just open new tabs against the same daemon. The daemon survives across shells.

## Use

1. **Read** — Chrome shows the rendered MD.
2. **Select any text** — a small "Add comment" popover appears above the selection.
3. **Click it** — a sidebar opens with the quoted span and a textarea.
4. **Save** — comment lands in `<file>.md.review.json` next to the original.
5. **Click the comment count** in the top bar to toggle the sidebar.
6. **Click ×** on a comment to delete it.

Comments are persisted as plain JSON:

```json
{
  "version": 1,
  "comments": [
    {
      "id": "c_1730420000_abc",
      "selected_text": "the exact span you highlighted",
      "context_before": "~30 chars before",
      "context_after": "~30 chars after",
      "comment": "your note",
      "created_at": "2026-04-30T12:34:56Z",
      "status": "open"
    }
  ]
}
```

`context_before` / `context_after` make it easy for a follow-up tool to find the right occurrence in the source even when the selected snippet appears multiple times.

## Optional: iTerm ⌘-click integration

If you want ⌘-click on a `.md` path in iTerm to open it in mdview (or VS Code, your choice), add a tiny dispatcher script and point iTerm Semantic History at it.

```bash
mkdir -p ~/bin
cat > ~/bin/open-file <<'EOF'
#!/bin/bash
f="$1"
case "$f" in
  *.md) exec mdview "$f" ;;       # change to: exec open "vscode://file$f"  for VS Code default
  *)    exec open "$f" ;;
esac
EOF
chmod +x ~/bin/open-file
```

Then in iTerm2:
**Settings → Profiles → (your profile) → Advanced → Semantic History → "Run command…"** and enter:

```
/Users/<you>/bin/open-file \1
```

## Daemon control

```bash
# health check
curl -s http://127.0.0.1:5237/api/ping

# kill it (next mdview call respawns it)
pkill -f mdview/server.js
```

Daemon log: `~/.mdview/server.log`.

## Test

```bash
npm test
```

31 tests covering path validation, anchor finding, and HTTP endpoints. No browser tests — the UI is verified by manual smoke.

## Architecture

- **`bin/mdview`** — CLI launcher. Resolves the file, ensures the daemon is up (TCP-probe, lazy-spawn if not), opens Chrome.
- **`server.js`** — HTTP daemon on `127.0.0.1:5237`. Plain Node `http`, zero runtime deps.
- **`lib/path-validator.js`** — Pure: rejects paths outside `$HOME`, non-`.md` files, and missing files. Uses `realpath` to defeat symlink traversal.
- **`lib/anchor.js`** — Pure: finds the right occurrence of a quoted span in the MD source using `context_before` / `context_after`.
- **`lib/handlers.js`** — HTTP handlers for `/api/file`, `/api/comments`, `/api/ping`, and static assets.
- **`public/`** — The reader (HTML + CSS + JS). Renders MD via [marked](https://marked.js.org/) loaded from CDN.

## Security notes

- Server binds to `127.0.0.1` only.
- All file paths must resolve under `$HOME` and end in `.md`.
- 1 MB cap on `PUT /api/comments` body.
- No CSRF token — local single-user only. Don't expose port 5237.

## Limitations / TODO

- macOS only (the CLI shells out to `open`).
- No multi-user / network sharing — that's what [`share-for-feedback`](#) is for.
- No "resolve" action in the UI; the assumption is a separate process (Claude slash command, manual edit) reads the sidecar and applies/dismisses comments.
- No live reload if the MD file is edited on disk while the tab is open. Refresh the tab.
