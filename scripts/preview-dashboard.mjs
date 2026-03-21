import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, "..", ".previews.json");
const PORT = 3000;

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { previews: {} };
  }
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPage(state) {
  const entries = Object.entries(state.previews || {});
  const cards = entries.length
    ? entries
        .map(
          ([branch, info]) => `
      <a href="http://localhost:${info.port}" class="card" target="_blank">
        <div class="branch">${escapeHtml(branch)}</div>
        <div class="meta">
          <span class="port">:${info.port}</span>
          <span class="time">${timeAgo(info.startedAt)}</span>
        </div>
      </a>`,
        )
        .join("")
    : '<div class="empty">No active previews. Run <code>pnpm preview start &lt;branch&gt;</code> to get started.</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <title>Branch Previews</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a0a0f;
      color: #e4e4e7;
      min-height: 100vh;
      padding: 3rem 1.5rem;
    }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }
    .card {
      display: block;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 0.75rem;
      padding: 1.25rem;
      margin-bottom: 0.75rem;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: #6d28d9; }
    .branch { font-weight: 600; font-size: 1rem; margin-bottom: 0.5rem; font-family: "SFMono-Regular", "Consolas", monospace; }
    .meta { display: flex; gap: 1rem; font-size: 0.8rem; color: #a1a1aa; }
    .port { color: #a78bfa; }
    .empty { color: #71717a; text-align: center; padding: 3rem 1rem; }
    code { background: #27272a; padding: 0.2em 0.5em; border-radius: 0.25rem; font-size: 0.85em; }
    .count { color: #71717a; font-size: 0.875rem; font-weight: 400; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Branch Previews <span class="count">(${entries.length})</span></h1>
    <div class="subtitle">Scheduler Dashboard</div>
    ${cards}
  </div>
</body>
</html>`;
}

const server = createServer((req, res) => {
  const state = readState();
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(renderPage(state));
});

server.listen(PORT, () => {
  console.log(`Preview dashboard: http://localhost:${PORT}`);
});
