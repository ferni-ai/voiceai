#!/usr/bin/env node
/**
 * Bundle Size Check
 *
 * Gzipped JavaScript in dist/, against absolute budgets: the total a visitor
 * can download (code plus en-US and at most one other locale, since locale
 * chunks load on demand) and the largest single file. CI's bundle job is the
 * no-growth ratchet (apps/cli/src/commands/quality/ratchet.ts --bundle); this
 * is the local absolute check. Run after build: node scripts/bundle-size-check.js
 *
 * Exit codes:
 *   0 - Within budget
 *   1 - Over budget, or dist/ is missing
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
/** Budgets in gzipped KB; MAX_BUNDLE_SIZE_KB / MAX_CHUNK_SIZE_KB override. */
const BUDGETS = { MAX_BUNDLE_SIZE_KB: 1780, MAX_CHUNK_SIZE_KB: 540 };

function readBudget(name) {
  return Number(process.env[name] ?? BUDGETS[name]);
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

  // Locale chunks (assets/<locale>-<hash>.js) load on demand: a user gets en-US
  // (the fallback) plus at most one other locale, so count those two, not all.
  const LOCALE_CHUNK = /(?:^|\/)(en-US|en-GB|de|fr|es|ar|he|ja|ko|zh-Hans|zh-Hant)-[\w-]{8}\.js$/;
  let codeBytes = 0;
  let enUsBytes = 0;
  let largestLocaleBytes = 0;
  for (const { file, bytes } of sizes) {
    const locale = LOCALE_CHUNK.exec(file)?.[1];
    if (!locale) codeBytes += bytes;
    else if (locale === 'en-US') enUsBytes = bytes;
    else largestLocaleBytes = Math.max(largestLocaleBytes, bytes);
  }

  // Same rounding as CI: floor of KB
  const totalKb = Math.floor((codeBytes + enUsBytes + largestLocaleBytes) / 1024);
  const largestKb = Math.floor((sizes[0]?.bytes ?? 0) / 1024);

  console.log('Largest gzipped JS files:');
  for (const { file, bytes } of sizes.slice(0, 10)) {
    console.log(`  ${String(Math.floor(bytes / 1024)).padStart(5)} KB  ${file}`);
  }
  console.log(`\nTotal: ${totalKb} KB (code + en-US + the largest other locale; ${sizes.length} files)\n`);

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
