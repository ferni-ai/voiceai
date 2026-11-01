#!/usr/bin/env node
/**
 * How many unit test files does `vitest run --changed HEAD^1` (Unit Tests on a pull
 * request, ci.yml) run, and is that too many for one shard?
 *
 * A file under src/config/flags/ reaches ~1,400-1,565 test files through the
 * generated barrel src/config/flags/index.generated.ts. One shard timed out on
 * those at its 25 min: 7 of 22 single-shard attempts in four hours, and 12 of 22
 * took 20+ min (2026-10-29). A full run, split over four shards, never took more
 * than 14 min. Above THRESHOLD affected files, ci.yml splits the affected set over
 * the same four shards (`--changed HEAD^1 --shard=N/4`; vitest shards the files
 * --changed selected, not the whole suite). At or below it the PR stays on one.
 *
 * Counts with `vitest list --filesOnly`, which resolves --changed exactly as `run`
 * does. (`list` ignores --shard, so it cannot be used to preview a shard's slice.)
 *
 * Writes `count=<n>` and `sharded=true|false` to $GITHUB_OUTPUT (stdout without it).
 * Any failure says `sharded=true`: four shards cost runners, a wrong `false` costs a
 * timed-out PR. Same bias as unit-full-suite-needed.mjs.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Affected test files above which one shard is too slow. A shard runs ~550 files in 14 min. */
export const THRESHOLD = 700;

/** The test files `vitest --changed <base>` selects for a config, one repo-relative path each. */
export function listAffected(root = process.cwd(), base = 'HEAD^1') {
  const out = execFileSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'list',
      '--config',
      'vitest.config.unit.ts',
      '--changed',
      base,
      '--filesOnly',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test' },
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );
  return out.split('\n').filter((line) => line.trim() !== '');
}

export function affectedDecision({
  root = process.cwd(),
  base = 'HEAD^1',
  threshold = THRESHOLD,
  list = listAffected,
} = {}) {
  try {
    const count = list(root, base).length;
    return count > threshold
      ? { count, sharded: true, reason: `${count} affected files > ${threshold}` }
      : { count, sharded: false, reason: `${count} affected files <= ${threshold}` };
  } catch (error) {
    return {
      count: -1,
      sharded: true,
      reason: `check failed (${error instanceof Error ? error.message : error})`,
    };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { count, sharded, reason } = affectedDecision({ base: process.argv[2] ?? 'HEAD^1' });
  const lines = `count=${count}\nsharded=${sharded}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
  else console.log(lines.trimEnd());
  console.log(
    `${sharded ? 'Affected unit tests on 4 shards' : 'Affected unit tests on 1 shard'}: ${reason}`
  );
  if (reason.startsWith('check failed'))
    console.log(`::warning::Unit Tests: ${reason}, so the affected tests run on all 4 shards`);
}
