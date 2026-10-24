#!/usr/bin/env node
/**
 * Will `vitest run --changed HEAD^1` (Unit Tests on a pull request, ci.yml) run the
 * WHOLE unit suite? It does when any changed file matches a forceRerunTriggers glob
 * of vitest.config.unit.ts (a persona bundle or other data file under src/,
 * package.json, the lockfile, tsconfig). One shard can't finish ~2,200 files inside
 * its 25 min, so ci.yml gives such a PR the four shards a full run gets: #2508
 * edited three persona JSONs and was cancelled at the timeout three times with no
 * failing test (runs 40040043019, 40091994728).
 *
 * It asks vitest for the resolved triggers and matches with vitest's own picomatch,
 * on the same `git diff --name-only HEAD^1...HEAD` paths resolved from the repo
 * root, so the answer is vitest's and the glob list lives in one place.
 *
 * Writes `needed=true|false` to $GITHUB_OUTPUT (stdout without it). Any failure
 * says `true`: four shards cost runners, a wrong `false` costs a timed-out PR.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** picomatch as vitest's own dist resolves it: the same version vitest matches with. */
function vitestPicomatch() {
  return createRequire(fileURLToPath(import.meta.resolve('vitest')))('picomatch');
}

/** vitest's resolved forceRerunTriggers for a config (defaults and setup files included). */
export async function loadTriggers(root = process.cwd(), config = 'vitest.config.unit.ts') {
  const { resolveConfig } = await import('vitest/node');
  const resolved = await resolveConfig({ root, config, mode: 'test' });
  const triggers = resolved?.test?.forceRerunTriggers;
  if (!Array.isArray(triggers) || triggers.length === 0) {
    throw new Error(`no forceRerunTriggers resolved from ${config}`);
  }
  return triggers;
}

/** The files `vitest --changed <base>` reads as committed changes. */
export function changedFiles(root = process.cwd(), base = 'HEAD^1') {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\n').filter((line) => line !== '');
}

/** The first repo-relative path that matches a trigger, as vitest matches it, or undefined. */
export function firstTrigger(files, triggers, root = process.cwd()) {
  const isMatch = vitestPicomatch()(triggers);
  return files.find((file) => isMatch(resolve(root, file)));
}

export async function fullSuiteNeeded({
  root = process.cwd(),
  base = 'HEAD^1',
  listFiles = changedFiles,
  readTriggers = loadTriggers,
} = {}) {
  try {
    const files = listFiles(root, base);
    // An empty diff means the checkout lacks the base, not that nothing changed.
    if (files.length === 0) return { needed: true, reason: `no files changed since ${base}` };
    const hit = firstTrigger(files, await readTriggers(root), root);
    return hit
      ? { needed: true, reason: `${hit} is a forceRerunTriggers file` }
      : {
          needed: false,
          reason: `none of ${files.length} changed files is a forceRerunTriggers file`,
        };
  } catch (error) {
    return {
      needed: true,
      reason: `check failed (${error instanceof Error ? error.message : error})`,
    };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { needed, reason } = await fullSuiteNeeded({ base: process.argv[2] ?? 'HEAD^1' });
  const line = `needed=${needed}`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
  else console.log(line);
  console.log(
    `${needed ? 'Whole unit suite (4 shards)' : 'Affected unit tests only (1 shard)'}: ${reason}`
  );
  if (reason.startsWith('check failed'))
    console.log(`::warning::Unit Tests: ${reason}, so all 4 shards run`);
}
