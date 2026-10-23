#!/usr/bin/env node
/**
 * CI speed, measured: how long work waits for a runner, how long the merge queue
 * takes and how often it fails, and how long a PR takes to merge.
 *
 * On 2026-10-18 PR jobs waited a median ~30 min for a runner, 331 of 600
 * merge-queue CI runs failed, and nobody had these numbers until someone dug
 * them out by hand. The cheap fixes (#2054, #2058, the re-arm gate) were picked
 * over paying for larger runners on the condition that the queue's wait for a
 * runner falls under 15 minutes; this is the measurement that says whether it did.
 *
 *   node scripts/ci/ci-speed.mjs [--hours 24] [--json]   (needs gh)
 *
 * Runner wait is Setup's wait plus the slowest wait behind it (runnerWait).
 * CI runs only (ci.yml): it holds every required check but Menu E2E and Build & Test.
 *
 * gh calls retry a GitHub 5xx or a network error (3 tries, 2 s then 6 s): one
 * 502 on one run's jobs crashed the 2026-10-23 report. A run whose jobs still
 * can't be read is left out and named in the report; auth errors, 404s and bad
 * JSON still fail the job.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MIN = 60_000;

/** The q-th quantile (0..1) of the numbers, nearest rank; null when empty. */
export function quantile(values, q) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  return xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))];
}

/**
 * Minutes a CI run spent waiting for runners: Setup's wait, plus how long the
 * last job behind Setup waited after Setup finished (every job but Build needs
 * only Setup). Null until those jobs have started.
 */
export function runnerWait(run, jobs) {
  const setup = jobs.find((j) => /^Setup\b/.test(j.name ?? ''));
  const t = (x) => Date.parse(x ?? '');
  if (!setup || !Number.isFinite(t(setup.started_at)) || !Number.isFinite(t(setup.completed_at))) return null;
  const behind = jobs
    .filter((j) => j !== setup && j.name !== 'Build' && j.conclusion !== 'skipped')
    .map((j) => t(j.started_at))
    .filter(Number.isFinite);
  if (behind.length === 0) return null;
  const first = t(setup.started_at) - t(run.created_at);
  const rest = Math.max(0, Math.max(...behind) - t(setup.completed_at));
  return (first + rest) / MIN;
}

/** Minutes a completed run took from its creation to its last update. */
export function wallMinutes(run) {
  return (Date.parse(run.updated_at) - Date.parse(run.created_at)) / MIN;
}

/** Counts by conclusion, and the failure rate among runs that reached a verdict. */
export function outcomes(runs) {
  const by = {};
  for (const r of runs) by[r.conclusion ?? r.status] = (by[r.conclusion ?? r.status] ?? 0) + 1;
  const verdicts = (by.success ?? 0) + (by.failure ?? 0);
  return { by, failureRate: verdicts ? (by.failure ?? 0) / verdicts : null };
}

const fmt = (m) => (m == null ? 'n/a' : m < 1 ? '<1 min' : `${Math.round(m)} min`);
const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);

export function report(s) {
  return [
    `## CI speed, last ${s.hours} h`,
    '',
    '| | p50 | p90 | n |',
    '|---|---|---|---|',
    `| PR CI: wait for a runner | ${fmt(s.prWait.p50)} | ${fmt(s.prWait.p90)} | ${s.prWait.n} |`,
    `| Merge queue CI: wait for a runner | ${fmt(s.mgWait.p50)} | ${fmt(s.mgWait.p90)} | ${s.mgWait.n} |`,
    `| Merge queue CI: passing run, start to finish | ${fmt(s.mgPass.p50)} | ${fmt(s.mgPass.p90)} | ${s.mgPass.n} |`,
    `| PR opened to merged | ${fmt(s.merge.p50)} | ${fmt(s.merge.p90)} | ${s.merge.n} |`,
    '',
    `Merge queue CI runs: ${Object.entries(s.mg.by).map(([k, v]) => `${v} ${k}`).join(', ')}; ` +
      `**${pct(s.mg.failureRate)} of verdicts failed**. ${s.merged} PRs merged, ` +
      `${s.merged ? (s.mgRuns / s.merged).toFixed(1) : 'n/a'} queue runs per merge.`,
    '',
    `Target: merge-queue wait for a runner under 15 min at p50; above it, larger runners are the next step (#2053).`,
    ...(s.skipped?.length
      ? ['', `> **Warning:** ${s.skipped.length} run(s) left out of the runner waits: GitHub's API ` +
          `kept failing after ${DELAYS_MS.length + 1} tries (${s.skipped.join(', ')}).`]
      : []),
  ].join('\n');
}

/** Waits between tries of a gh call that failed transiently: 3 tries in all. */
export const DELAYS_MS = [2000, 6000];

/**
 * True for a failure worth retrying: an HTTP 5xx from GitHub, or the network.
 * Not 401/403 (auth), 404, or a gh that can't run.
 */
export function isTransient(err) {
  const text = `${err?.stderr ?? ''}\n${err?.message ?? ''}`;
  return (
    /\bHTTP 5\d\d\b/.test(text) ||
    /error connecting to|dial tcp|i\/o timeout|connection reset|TLS handshake timeout|unexpected EOF|no such host|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(text)
  );
}

/** A gh call that kept failing transiently after every retry. */
export class GhUnavailable extends Error {
  constructor(args, cause) {
    const why = String(cause?.stderr || cause?.message || cause).trim().split('\n').pop();
    super(`gh ${args.join(' ')}: ${why}`);
    this.name = 'GhUnavailable';
    this.cause = cause;
  }
}

const exec = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * `gh <args>` parsed as JSON, retrying transient failures DELAYS_MS apart. Throws
 * GhUnavailable when they run out; any other failure, and bad JSON, at once.
 */
export function gh(args, { run = exec, wait = sleep, warn = console.error } = {}) {
  for (let attempt = 0; ; attempt++) {
    let out;
    try {
      out = run(args);
    } catch (err) {
      if (!isTransient(err)) throw err;
      if (attempt >= DELAYS_MS.length) throw new GhUnavailable(args, err);
      warn(`${new GhUnavailable(args, err).message}; try ${attempt + 2} in ${DELAYS_MS[attempt] / 1000} s`);
      wait(DELAYS_MS[attempt]);
      continue;
    }
    return JSON.parse(out);
  }
}

function runs(repo, event, since) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = gh(['api', `repos/${repo}/actions/workflows/ci.yml/runs?event=${event}&created=>=${since}&per_page=100&page=${page}`]);
    out.push(...r.workflow_runs);
    if (r.workflow_runs.length < 100) break;
  }
  return out;
}

/**
 * Waits for up to `limit` runs (newest first), one jobs call each. A run whose
 * jobs GitHub won't serve is null (left out) and its id goes in `skipped`.
 */
export function waits(repo, list, limit, skipped = [], call = gh) {
  return list.slice(0, limit).map((run) => {
    try {
      return runnerWait(run, call(['api', `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`]).jobs);
    } catch (err) {
      if (!(err instanceof GhUnavailable)) throw err;
      console.error(`::warning::CI speed: left out run ${run.id}: ${err.message}`);
      skipped.push(run.id);
      return null;
    }
  });
}

function stats(values) {
  const xs = values.filter((v) => v != null);
  return { p50: quantile(xs, 0.5), p90: quantile(xs, 0.9), n: xs.length };
}

function main() {
  const argv = process.argv.slice(2);
  const hours = Number(argv[argv.indexOf('--hours') + 1]) || 24;
  const repo = process.env.GITHUB_REPOSITORY ?? gh(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
  const since = new Date(Date.now() - hours * 60 * MIN).toISOString().slice(0, 19) + 'Z';
  const pr = runs(repo, 'pull_request', since);
  const mg = runs(repo, 'merge_group', since);
  const merged = gh(['pr', 'list', '-R', repo, '--state', 'merged', '--limit', '1000',
    '--search', `merged:>=${since}`, '--json', 'createdAt,mergedAt']);
  const skipped = [];
  const s = {
    hours,
    prWait: stats(waits(repo, pr, 60, skipped)),
    mgWait: stats(waits(repo, mg, 60, skipped)),
    mgPass: stats(mg.filter((r) => r.conclusion === 'success').map(wallMinutes)),
    merge: stats(merged.map((p) => (Date.parse(p.mergedAt) - Date.parse(p.createdAt)) / MIN)),
    mg: outcomes(mg),
    mgRuns: mg.length,
    merged: merged.length,
    skipped,
  };
  console.log(argv.includes('--json') ? JSON.stringify(s) : report(s));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
