#!/usr/bin/env node
/**
 * Bundle Size Check
 *
 * The same check CI runs (.github/workflows/performance-budget.yml): gzipped
 * JavaScript in dist/, total and largest file, against the budgets set in that
 * workflow's env (MAX_BUNDLE_SIZE_KB, MAX_CHUNK_SIZE_KB), which stay the single
 * source of truth. Run after build: node scripts/bundle-size-check.js
 *
 * Exit codes:
 *   0 - Within budget
 *   1 - Over budget, or dist/ or the budgets are missing
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const WORKFLOW = join(__dirname, '..', '..', '..', '.github', 'workflows', 'performance-budget.yml');

/** Read `NAME: <number>` from the workflow's env block. */
function readBudget(name) {
  const fromEnv = process.env[name];
  if (fromEnv) return Number(fromEnv);
  const match = readFileSync(WORKFLOW, 'utf8').match(new RegExp(`^\\s*${name}:\\s*(\\d+)\\s*$`, 'm'));
  if (!match) throw new Error(`${name} not found in ${relative(process.cwd(), WORKFLOW)}`);
  return Number(match[1]);
}

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* jsFiles(path);
    else if (name.endsWith('.js')) yield path;
  }
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.error('❌ dist/ not found. Run `pnpm build` first.');
    process.exit(1);
  }

  const maxTotal = readBudget('MAX_BUNDLE_SIZE_KB');
  const maxChunk = readBudget('MAX_CHUNK_SIZE_KB');

  const sizes = [...jsFiles(DIST_DIR)]
    .map((path) => ({ file: relative(DIST_DIR, path), bytes: gzipSync(readFileSync(path)).length }))
    .sort((a, b) => b.bytes - a.bytes);

  // Same rounding as CI: floor of KB
  const totalKb = Math.floor(sizes.reduce((sum, s) => sum + s.bytes, 0) / 1024);
  const largestKb = Math.floor((sizes[0]?.bytes ?? 0) / 1024);

  console.log('Largest gzipped JS files:');
  for (const { file, bytes } of sizes.slice(0, 10)) {
    console.log(`  ${String(Math.floor(bytes / 1024)).padStart(5)} KB  ${file}`);
  }
  console.log(`\nTotal: ${totalKb} KB across ${sizes.length} files\n`);

  let failed = false;
  const report = (label, value, max) => {
    const ok = value <= max;
    failed ||= !ok;
    console.log(`${ok ? '✅' : '❌'} ${label}: ${value} KB (budget: ${max} KB)`);
  };
  report('Total bundle size', totalKb, maxTotal);
  report('Largest chunk', largestKb, maxChunk);

  process.exit(failed ? 1 : 0);
}

main();
