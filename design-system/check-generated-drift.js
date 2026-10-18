#!/usr/bin/env node
/**
 * Design-system drift gate: runs `pnpm tokens:sync` (build:design-system plus the
 * website/brand token copies) and exits 1 when any file it writes differs from
 * what was on disk, i.e. a committed generated file is not what the generators
 * produce from design-system/tokens/*.json.
 *
 * `tokens:check` compares mtimes, which a git checkout makes equal, so it can't
 * fail in CI; this compares content. Timestamps are blanked first (generators
 * stamp output). PNG rewrites are reported, not gated: their pixels depend on
 * the platform's SVG renderer. The tree is restored afterwards unless --fix.
 *
 *   pnpm tokens:drift          # exit 1 on drift, tree untouched
 *   pnpm tokens:drift --fix    # keep the regenerated files
 */

import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { withoutTimestamps } from './lib/write-if-changed.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIX = process.argv.includes('--fix');
const RASTER = /\.(png|ico|jpe?g|webp)$/i;
const MAX = 256 * 1024 * 1024;

const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: MAX });
const abs = (file) => path.join(ROOT, file);
const read = (file) => (fs.existsSync(abs(file)) ? fs.readFileSync(abs(file)) : null);
const restore = (file, was) => (was === null ? fs.rmSync(abs(file), { force: true }) : fs.writeFileSync(abs(file), was));

/** Modified or untracked paths (respects .gitignore). */
function changedPaths() {
  const entries = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).toString().split('\0');
  const paths = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    paths.add(entries[i].slice(3));
    if (/^[RC]/.test(entries[i])) i++; // the rename source follows
  }
  return paths;
}

function headContent(file) {
  try {
    return git(['show', `HEAD:${file}`]);
  } catch {
    return null; // untracked
  }
}

function same(a, b) {
  if (a === null || b === null) return a === b;
  return a.equals(b) || withoutTimestamps(a.toString('utf8')) === withoutTimestamps(b.toString('utf8'));
}

// Files already differing from HEAD keep their on-disk content as the baseline.
const before = new Map([...changedPaths()].map((file) => [file, read(file)]));

const build = spawnSync('pnpm', ['run', '--silent', 'tokens:sync'], { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX });
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '');
  process.stderr.write(build.stderr ?? '');
  console.error(`\n❌ tokens:sync failed (exit ${build.status}); cannot check drift.`);
  process.exit(build.status ?? 1);
}

const drifted = [];
for (const file of changedPaths()) {
  const was = before.has(file) ? before.get(file) : headContent(file);
  const now = read(file);
  if (same(was, now)) {
    if (now !== null && !now.equals(was)) restore(file, was); // stamp-only rewrite
  } else if (RASTER.test(file)) {
    console.log(`ℹ️  ignored raster rewrite: ${file}`);
    restore(file, was);
  } else {
    drifted.push({ file, was });
  }
}

if (drifted.length === 0) {
  console.log('✅ Design-system generated files match their tokens.');
  process.exit(0);
}

console.error(`❌ ${drifted.length} generated file(s) differ from what the generators produce:\n`);
for (const { file, was } of drifted) console.error(`  ${was === null ? 'new    ' : 'changed'}  ${file}`);
if (FIX) {
  console.error('\n--fix: kept the regenerated files. Review and commit them.');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-drift-'));
for (const { file, was } of drifted) {
  fs.writeFileSync(path.join(tmp, 'disk'), was ?? '');
  const diff = spawnSync('git', ['diff', '--no-index', '--no-color', '-U0', path.join(tmp, 'disk'), file], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: MAX,
  });
  const lines = (diff.stdout ?? '').split('\n').filter((l) => /^[-+@]/.test(l) && !/^(---|\+\+\+) /.test(l));
  console.error(`\n--- ${file} (on disk -> generated)\n${lines.slice(0, 30).join('\n')}`);
  if (lines.length > 30) console.error(`... ${lines.length - 30} more lines`);
  restore(file, was); // a check never overwrites anyone's edits
}
fs.rmSync(tmp, { recursive: true, force: true });
console.error('\nRun `pnpm tokens:drift --fix` and commit the result. Edit design-system/tokens/*.json, never a generated file.');
process.exit(1);
