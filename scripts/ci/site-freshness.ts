#!/usr/bin/env node
/**
 * Site freshness: catches the green-but-stale signals the 2026-11-16 audit found.
 * design.ferni.ai served a January build for ten months while its nightly build passed,
 * and the weekly blog draft failed three Mondays running without anyone looking.
 *
 * - Stale site: a site is stale when the newest commit on main touching its source folder
 *   is more than MAX_LAG_DAYS newer than the live page's last-modified header. A site
 *   that answers without that header, or with an error, fails too: no evidence is red.
 * - Failing schedule: a scheduled workflow fails when none of its last RUNS_CHECKED
 *   completed scheduled runs succeeded, or when it has fewer than that (a schedule that
 *   never fires looks exactly like one that was never written).
 *
 *   node --experimental-strip-types scripts/ci/site-freshness.ts [--report-dir <dir>]
 *
 * Writes <dir>/stale-site.md and <dir>/scheduled-run.md (empty when green) for
 * site-health-issue.ts, and exits 1 on any finding. Reads main through `gh api`, so it
 * needs no clone history. Env: REPO (default ferni-ai/voiceai), GH_TOKEN.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Each public site's host and the folder on main it is built from. */
const SOURCES: Record<string, string> = {
  'ferni.ai': 'apps/website/ferni-website',
  'developers.ferni.ai': 'apps/website/developers-portal',
  'marketplace.ferni.ai': 'apps/website/marketplace-portal',
  'design.ferni.ai': 'apps/website/design-system-portal',
};
export const SITES = Object.entries(SOURCES).map(([name, source]) => ({
  name,
  url: `https://${name}/`,
  source,
}));
/** How much newer than the live page main's source may be before the site counts as stale. */
export const MAX_LAG_DAYS = 2;
/** Scheduled workflows that must keep succeeding. */
export const SCHEDULED_WORKFLOWS = ['blog-drafts.yml', 'design-system.yml'];
/** A workflow fails when none of this many latest completed scheduled runs succeeded. */
export const RUNS_CHECKED = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type Kind = 'stale-site' | 'scheduled-run';
export type Finding = { kind: Kind; subject: string; detail: string };
export type Site = (typeof SITES)[number];
export type Live = { status: number; lastModified: string | null };
export type Run = { status: string; conclusion: string; createdAt: string; url: string };

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Is the live site more than MAX_LAG_DAYS behind main's newest commit to its source? */
export function siteFinding(
  site: Site,
  live: Live,
  sourceCommitted: string | null
): Finding | null {
  const finding = (detail: string): Finding => ({ kind: 'stale-site', subject: site.name, detail });
  if (live.status < 200 || live.status > 299)
    return finding(`${site.url} answered HTTP ${live.status}`);
  const liveMs = live.lastModified ? Date.parse(live.lastModified) : NaN;
  if (Number.isNaN(liveMs)) {
    return finding(
      `${site.url} sent no usable last-modified header, so its deploy date is unknown`
    );
  }
  const sourceMs = sourceCommitted ? Date.parse(sourceCommitted) : NaN;
  if (Number.isNaN(sourceMs)) return finding(`no commit on main touches ${site.source}; fix SITES`);
  const lagDays = (sourceMs - liveMs) / DAY_MS;
  if (lagDays <= MAX_LAG_DAYS) return null;
  return finding(
    `main changed ${site.source} on ${day(sourceMs)}, ${Math.floor(lagDays)} days after the ` +
      `live page was built (last-modified ${day(liveMs)}); the limit is ${MAX_LAG_DAYS} days`
  );
}

/** Did none of the workflow's latest RUNS_CHECKED completed scheduled runs succeed? */
export function scheduleFinding(workflow: string, runs: Run[]): Finding | null {
  const latest = runs
    .filter((r) => r.status === 'completed')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, RUNS_CHECKED);
  const finding = (detail: string): Finding => ({
    kind: 'scheduled-run',
    subject: workflow,
    detail,
  });
  if (latest.length < RUNS_CHECKED) {
    return finding(`only ${latest.length} completed scheduled run(s); its schedule may never fire`);
  }
  if (latest.some((r) => r.conclusion === 'success')) return null;
  const list = latest.map((r) => `${r.conclusion} on ${r.createdAt.slice(0, 10)} (${r.url})`);
  return finding(`its last ${RUNS_CHECKED} scheduled runs did not succeed: ${list.join(', ')}`);
}

/** The markdown report for one kind: empty when it has no findings. */
export function report(kind: Kind, findings: Finding[]): string {
  const mine = findings.filter((f) => f.kind === kind);
  return mine.map((f) => `- **${f.subject}**: ${f.detail}\n`).join('');
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

async function live(url: string): Promise<Live> {
  const res = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, lastModified: res.headers.get('last-modified') };
}

function sourceCommitted(repo: string, source: string): string | null {
  const path = `repos/${repo}/commits?sha=main&per_page=1&path=${encodeURIComponent(source)}`;
  return gh(['api', path, '--jq', '.[0].commit.committer.date // empty']).trim() || null;
}

function scheduledRuns(repo: string, workflow: string): Run[] {
  const fields = 'status,conclusion,createdAt,url';
  const args = ['run', 'list', '--repo', repo, '--workflow', workflow, '--event', 'schedule'];
  return JSON.parse(gh([...args, '--limit', '10', '--json', fields])) as Run[];
}

async function main(): Promise<void> {
  const repo = process.env.REPO || 'ferni-ai/voiceai';
  const dirAt = process.argv.indexOf('--report-dir');
  const findings: Finding[] = [];
  for (const site of SITES) {
    const f = siteFinding(site, await live(site.url), sourceCommitted(repo, site.source));
    if (f) findings.push(f);
  }
  for (const workflow of SCHEDULED_WORKFLOWS) {
    const f = scheduleFinding(workflow, scheduledRuns(repo, workflow));
    if (f) findings.push(f);
  }
  const kinds: Kind[] = ['stale-site', 'scheduled-run'];
  const summary = kinds.map((k) => `### ${k}\n${report(k, findings) || 'All green.\n'}`).join('\n');
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (dirAt > 0) {
    const dir = process.argv[dirAt + 1];
    mkdirSync(dir, { recursive: true });
    for (const k of kinds) writeFileSync(join(dir, `${k}.md`), report(k, findings));
  }
  process.exitCode = findings.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
