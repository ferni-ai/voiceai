/**
 * Scheduled-job parity. The first block reads the real `infra/cloud-scheduler-*.yaml` files and
 * the real `JOB_PATHS`: every scheduled `/api/jobs/` path has a handler, and every handler is
 * scheduled or listed in UNSCHEDULED with a reason (which must itself stay true). The second
 * block checks diffScheduler on fixtures, one per kind of drift.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JOB_PATHS } from '../../../src/api/scheduled-jobs/job-paths.js';
import {
  diffScheduler,
  parseLiveJobs,
  parseSchedulerYaml,
  readYamlJobs,
  renderDiff,
  UNSCHEDULED,
  type LiveJob,
  type YamlJob,
} from '../scheduler-parity-lib.js';

const INFRA = fileURLToPath(new URL('../../../infra', import.meta.url));
const yamlJobs = readYamlJobs(INFRA);
const pathname = (path: string) => new URL(path, 'http://host').pathname;
const scheduled = new Set(yamlJobs.map((j) => pathname(j.path)));

describe('infra yaml, JOB_PATHS and UNSCHEDULED agree', () => {
  it('reads jobs from the yaml lists, not from comments', () => {
    expect(scheduled.has('/api/jobs/bq-erasure')).toBe(true); // ConfigMap data.jobs string
    expect(scheduled.has('/api/jobs/deliver-reminders')).toBe(true); // top-level jobs list
    expect([...scheduled].some((p) => p.includes('marketplace'))).toBe(false); // comments only
  });

  it('every yaml job under /api/jobs/ has a handler in JOB_PATHS', () => {
    const unhandled = yamlJobs
      .filter((j) => pathname(j.path).startsWith('/api/jobs/') && !JOB_PATHS.has(pathname(j.path)))
      .map((j) => `${j.file}: ${j.name} -> ${j.path}`);
    expect(unhandled).toEqual([]);
  });

  it('every JOB_PATHS entry is in a yaml or in UNSCHEDULED', () => {
    const missing = [...JOB_PATHS].filter((p) => !scheduled.has(p) && !(p in UNSCHEDULED));
    expect(missing).toEqual([]);
  });

  it('every UNSCHEDULED entry is still handled and still unscheduled', () => {
    const stale = Object.keys(UNSCHEDULED).filter((p) => scheduled.has(p) || !JOB_PATHS.has(p));
    expect(stale).toEqual([]);
    for (const reason of Object.values(UNSCHEDULED)) expect(reason.trim()).not.toBe('');
  });
});

describe('parseSchedulerYaml', () => {
  it('reads httpTarget.uri and a bare uri, without the host', () => {
    const text = [
      'jobs:',
      '  - name: a',
      '    httpTarget: { uri: "https://x.run.app/api/jobs/a" }',
      '  - name: b',
      '    uri: "https://y.example/process?limit=5"',
    ].join('\n');
    expect(parseSchedulerYaml(text, 'f.yaml')).toEqual([
      { name: 'a', path: '/api/jobs/a', file: 'f.yaml' },
      { name: 'b', path: '/process?limit=5', file: 'f.yaml' },
    ]);
  });

  it('throws on a file with no jobs list rather than reading it as empty', () => {
    expect(() => parseSchedulerYaml('schedules: []', 'f.yaml')).toThrow(/no jobs list/);
    expect(() => parseSchedulerYaml('jobs:\n  - name: a\n', 'f.yaml')).toThrow(/name and uri/);
  });
});

describe('parseLiveJobs', () => {
  it('takes the short name, the uri path and the state', () => {
    const json = JSON.stringify([
      {
        name: 'projects/p/locations/l/jobs/a',
        state: 'PAUSED',
        httpTarget: { uri: 'https://app.example/api/jobs/a' },
      },
      { name: 'projects/p/locations/l/jobs/t', state: 'ENABLED', pubsubTarget: {} },
    ]);
    expect(parseLiveJobs(json)).toEqual([
      { name: 'a', path: '/api/jobs/a', state: 'PAUSED' },
      { name: 't', path: null, state: 'ENABLED' },
    ]);
  });
});

describe('diffScheduler', () => {
  const y = (name: string, path: string): YamlJob => ({ name, path, file: 'f.yaml' });
  const live = (name: string, path: string | null, state = 'ENABLED'): LiveJob => ({
    name,
    path,
    state,
  });
  const yaml = [y('a', '/api/jobs/a'), y('b', '/api/jobs/b')];

  it('reports nothing when every yaml job is enabled live under any name or host', () => {
    const diff = diffScheduler(yaml, [live('a-live', '/api/jobs/a'), live('b', '/api/jobs/b')]);
    expect(diff).toEqual({ inYamlNotEnabledLive: [], enabledLiveNotInYaml: [], pausedLive: [] });
  });

  it('reports a yaml job with no live job', () => {
    const diff = diffScheduler(yaml, [live('a', '/api/jobs/a')]);
    expect(diff.inYamlNotEnabledLive).toEqual([y('b', '/api/jobs/b')]);
  });

  it('reports a paused live job, and its yaml job as not enabled', () => {
    const diff = diffScheduler(yaml, [
      live('a', '/api/jobs/a'),
      live('b', '/api/jobs/b', 'PAUSED'),
    ]);
    expect(diff.pausedLive).toEqual([live('b', '/api/jobs/b', 'PAUSED')]);
    expect(diff.inYamlNotEnabledLive).toEqual([y('b', '/api/jobs/b')]);
    expect(diff.enabledLiveNotInYaml).toEqual([]);
  });

  it('reports an enabled live job that no yaml defines, including one with no http target', () => {
    const extra = [live('x', '/api/jobs/x'), live('t', null)];
    const diff = diffScheduler(yaml, [
      live('a', '/api/jobs/a'),
      live('b', '/api/jobs/b'),
      ...extra,
    ]);
    expect(diff.enabledLiveNotInYaml).toEqual(extra);
    expect(diff.inYamlNotEnabledLive).toEqual([]);
  });

  it('renders each list by name and path', () => {
    const text = renderDiff(diffScheduler(yaml, [live('b', '/api/jobs/b', 'PAUSED')]));
    expect(text).toContain('In yaml, no enabled live job (2)');
    expect(text).toContain('  b  /api/jobs/b  PAUSED');
  });
});
