/**
 * Scheduled-job parity: the jobs `infra/cloud-scheduler-*.yaml` says should exist, the
 * paths the server handles (`JOB_PATHS`), and the jobs live in Cloud Scheduler. Pure apart
 * from reading the yaml directory; the drift script (scheduler-drift.ts) and the parity test
 * both use it. Jobs are matched by uri path (pathname + query), never by host: the yaml uses
 * several hostnames, some of them placeholders.
 *
 * @module scripts/ops/scheduler-parity-lib
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, parseAllDocuments } from 'yaml';

export interface YamlJob {
  readonly name: string;
  /** Pathname plus query of the job's uri, e.g. `/api/jobs/bq-erasure`. */
  readonly path: string;
  readonly file: string;
}

export interface LiveJob {
  readonly name: string;
  /** Null when the job has no HTTP target (Pub/Sub). */
  readonly path: string | null;
  /** Cloud Scheduler state: ENABLED, PAUSED, DISABLED, UPDATE_FAILED. */
  readonly state: string;
}

export interface SchedulerDiff {
  /** Defined in a yaml, but no ENABLED live job targets its path. */
  readonly inYamlNotEnabledLive: readonly YamlJob[];
  /** ENABLED live, but no yaml job targets its path. */
  readonly enabledLiveNotInYaml: readonly LiveJob[];
  /** Present live in any state other than ENABLED. */
  readonly pausedLive: readonly LiveJob[];
}

/**
 * `JOB_PATHS` entries that no yaml schedules, each with the reason. The parity test fails when
 * an entry here is scheduled after all or no longer handled, so the list cannot go stale.
 */
const SCRIPT_ONLY =
  'only in scripts/deploy-cloud-scheduler.ts, no infra yaml entry (2026-11-10, #3679)';
const NO_ENTRY = 'no scheduler entry anywhere as of 2026-11-10, see #3679';
const REMOVED =
  'dropped from cloud-scheduler-jobs.yaml in the 2026-02-23 audit, not re-added (#3679)';
export const UNSCHEDULED: Readonly<Record<string, string>> = {
  '/api/jobs/aggregate-community-insights': SCRIPT_ONLY,
  '/api/jobs/better-than-human-outreach': SCRIPT_ONLY,
  '/api/jobs/brand-ambassador-engagement': SCRIPT_ONLY,
  '/api/jobs/brand-award-deadline-check': SCRIPT_ONLY,
  '/api/jobs/brand-metrics-collection': SCRIPT_ONLY,
  '/api/jobs/brand-milestone-check': SCRIPT_ONLY,
  '/api/jobs/brand-publish-stories': SCRIPT_ONLY,
  '/api/jobs/brand-story-review-reminder': SCRIPT_ONLY,
  '/api/jobs/brand-weekly-report': SCRIPT_ONLY,
  '/api/jobs/brand-workstream-progress': SCRIPT_ONLY,
  '/api/jobs/cleanup-orphaned-uploads': NO_ENTRY,
  '/api/jobs/daily-admin-report': REMOVED,
  '/api/jobs/daily-outreach': SCRIPT_ONLY,
  '/api/jobs/deep-analysis': NO_ENTRY,
  '/api/jobs/evaluate-thinking-of-you': SCRIPT_ONLY,
  '/api/jobs/family-checkin-calls': SCRIPT_ONLY,
  '/api/jobs/flush-ml-state': SCRIPT_ONLY,
  '/api/jobs/gtm-daily-publishing': SCRIPT_ONLY,
  '/api/jobs/gtm-weekly-content': SCRIPT_ONLY,
  '/api/jobs/person-model': NO_ENTRY,
  '/api/jobs/process-insight-actions': SCRIPT_ONLY,
  '/api/jobs/reply-reports-summary': NO_ENTRY,
  '/api/jobs/reset-weekly-counters': SCRIPT_ONLY,
  '/api/jobs/rollup-outreach-analytics': SCRIPT_ONLY,
  '/api/jobs/rollup-persona-metrics': SCRIPT_ONLY,
  '/api/jobs/run-deep-analysis': SCRIPT_ONLY,
  '/api/jobs/run-predictive-analysis': SCRIPT_ONLY,
  '/api/jobs/semantic-router-learning': REMOVED,
  '/api/jobs/sync-trust-profiles': SCRIPT_ONLY,
  '/api/jobs/ttl-backfill': NO_ENTRY,
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Host-free path of a uri: `https://x.run.app/a/b?c=1` -> `/a/b?c=1`. */
export function uriPath(uri: string): string {
  const url = new URL(uri);
  return url.pathname + url.search;
}

/**
 * The jobs of one scheduler yaml: a top-level `jobs:` list, or (cloud-scheduler-jobs.yaml)
 * a ConfigMap whose `data.jobs` is a yaml string. Documents that hold only comments are
 * skipped. Throws on any other shape, so a file in a new format fails loudly instead of
 * contributing no jobs. Jobs named only in comments are not jobs.
 */
export function parseSchedulerYaml(text: string, file: string): YamlJob[] {
  const docs = parseAllDocuments(text);
  if (!Array.isArray(docs)) throw new Error(`${file}: empty`);
  const values: unknown[] = docs.map((d) => {
    if (d.errors.length) throw new Error(`${file}: ${d.errors[0].message}`);
    return d.toJS();
  });
  const lists = values.filter((v) => v !== null && v !== undefined).map((v) => jobList(v, file));
  if (lists.length === 0) throw new Error(`${file}: no jobs list`);
  return lists.flat().map((entry, i) => {
    const target = isRecord(entry) && isRecord(entry.httpTarget) ? entry.httpTarget : entry;
    const name = isRecord(entry) ? entry.name : undefined;
    const uri = isRecord(target) ? target.uri : undefined;
    if (typeof name !== 'string' || typeof uri !== 'string') {
      throw new Error(`${file}: job ${i} needs a string name and uri`);
    }
    return { name, path: uriPath(uri), file };
  });
}

function jobList(doc: unknown, file: string): unknown[] {
  let entries: unknown;
  if (isRecord(doc) && 'jobs' in doc) entries = doc.jobs;
  else if (isRecord(doc) && isRecord(doc.data) && typeof doc.data.jobs === 'string') {
    entries = parse(doc.data.jobs);
  } else throw new Error(`${file}: no jobs list (expected \`jobs:\` or \`data.jobs\`)`);
  if (entries === null) return [];
  if (!Array.isArray(entries)) throw new Error(`${file}: jobs is not a list`);
  return entries;
}

/** Every job of every `cloud-scheduler-*.yaml` in a directory, in file order. */
export function readYamlJobs(infraDir: string): YamlJob[] {
  return readdirSync(infraDir)
    .filter((f) => /^cloud-scheduler-.*\.ya?ml$/.test(f))
    .sort()
    .flatMap((f) => parseSchedulerYaml(readFileSync(join(infraDir, f), 'utf8'), f));
}

/** Live jobs from `gcloud scheduler jobs list --format=json`. */
export function parseLiveJobs(json: string): LiveJob[] {
  const rows: unknown = JSON.parse(json);
  if (!Array.isArray(rows)) throw new Error('gcloud output is not a list');
  return rows.map((row, i) => {
    if (!isRecord(row) || typeof row.name !== 'string' || typeof row.state !== 'string') {
      throw new Error(`live job ${i} has no name or state`);
    }
    const http = isRecord(row.httpTarget) ? row.httpTarget.uri : undefined;
    const appEngine = isRecord(row.appEngineHttpTarget)
      ? row.appEngineHttpTarget.relativeUri
      : undefined;
    const path =
      typeof http === 'string' ? uriPath(http) : typeof appEngine === 'string' ? appEngine : null;
    return { name: row.name.split('/').pop() ?? row.name, path, state: row.state };
  });
}

export function diffScheduler(
  yamlJobs: readonly YamlJob[],
  liveJobs: readonly LiveJob[]
): SchedulerDiff {
  const enabled = liveJobs.filter((j) => j.state === 'ENABLED');
  const enabledPaths = new Set(enabled.map((j) => j.path));
  const yamlPaths = new Set(yamlJobs.map((j) => j.path));
  return {
    inYamlNotEnabledLive: yamlJobs.filter((j) => !enabledPaths.has(j.path)),
    enabledLiveNotInYaml: enabled.filter((j) => j.path === null || !yamlPaths.has(j.path)),
    pausedLive: liveJobs.filter((j) => j.state !== 'ENABLED'),
  };
}

/** The diff as plain text, one job per line, by name and path. */
export function renderDiff(diff: SchedulerDiff): string {
  const section = (title: string, lines: string[]) =>
    [`${title} (${lines.length})`, ...(lines.length ? lines : ['  none'])].join('\n');
  return [
    section(
      'In yaml, no enabled live job',
      diff.inYamlNotEnabledLive.map((j) => `  ${j.name}  ${j.path}  (${j.file})`)
    ),
    section(
      'Enabled live, in no yaml',
      diff.enabledLiveNotInYaml.map((j) => `  ${j.name}  ${j.path ?? '(no http target)'}`)
    ),
    section(
      'Live but not enabled',
      diff.pausedLive.map((j) => `  ${j.name}  ${j.path ?? '(no http target)'}  ${j.state}`)
    ),
  ].join('\n\n');
}
