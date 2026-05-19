/**
 * Verifies every `var(--name)` reference in the project resolves to either:
 *   (a) a `--name:` declaration in src/app/globals.css or @aleph-front/ds/styles/tokens.css, or
 *   (b) a `var(--name, fallback)` call with a fallback value (treated as safe).
 *
 * Catches the class of bug where a token is referenced but never defined —
 * e.g. `var(--duration-default)` silently resolved to 0s because the token
 * doesn't exist in the DS or this project.
 *
 * Runs as part of `pnpm check`. Exits 1 on any unresolved reference.
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const GLOBALS_CSS = join(SRC_DIR, "app", "globals.css");
const DS_TOKENS_CSS = join(
  ROOT,
  "node_modules",
  "@aleph-front",
  "ds",
  "src",
  "styles",
  "tokens.css",
);

const TOKEN_DECL = /(?:^|[\s;{])(--[a-zA-Z0-9_-]+)\s*:/g;
const VAR_REF = /var\(\s*(--[a-zA-Z0-9_-]+)(\s*,)?/g;

function collectDeclarations(file: string): Set<string> {
  const out = new Set<string>();
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(TOKEN_DECL)) {
    out.add(m[1]!);
  }
  return out;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (/\.test\.(ts|tsx)$/.test(name)) continue;
    if (/\.(css|ts|tsx)$/.test(name)) files.push(full);
  }
  return files;
}

type Issue = { file: string; line: number; token: string };

function scanFile(file: string, defined: Set<string>): Issue[] {
  const issues: Issue[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(VAR_REF)) {
      const token = m[1]!;
      const hasFallback = m[2] !== undefined;
      if (hasFallback) continue;
      if (defined.has(token)) continue;
      issues.push({ file, line: i + 1, token });
    }
  });
  return issues;
}

function main(): void {
  const defined = new Set<string>([
    ...collectDeclarations(GLOBALS_CSS),
    ...collectDeclarations(DS_TOKENS_CSS),
  ]);

  const files = walk(SRC_DIR);
  const issues = files.flatMap((f) => scanFile(f, defined));

  if (issues.length === 0) {
    console.log(
      `check-css-tokens: ${defined.size} tokens defined, all var() refs resolve.`,
    );
    return;
  }

  console.error(
    `check-css-tokens: ${issues.length} unresolved var() reference${issues.length === 1 ? "" : "s"}:\n`,
  );
  for (const { file, line, token } of issues) {
    console.error(`  ${relative(ROOT, file)}:${line}  var(${token})`);
  }
  console.error(
    `\nFix by either: (1) defining the token in globals.css, (2) using the correct token name, or (3) adding a fallback: var(${issues[0]!.token}, <fallback>).`,
  );
  process.exit(1);
}

main();
