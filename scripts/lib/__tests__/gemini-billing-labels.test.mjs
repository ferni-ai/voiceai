import { afterEach, describe, expect, it, vi } from 'vitest';
import * as src from '../../../src/config/gemini-billing-labels.ts';
import {
  jobFromEntry,
  sanitizeLabelValue,
  scriptBillingLabels,
  withBillingLabels,
} from '../gemini-billing-labels.mjs';

describe('script billing labels', () => {
  it('names the job after the entry script, and GEMINI_BILLING_JOB wins sanitized', () => {
    expect(scriptBillingLabels({}, '/repo/scripts/first-call-eval/simulate.ts')).toEqual({
      ferni_job: 'first-call-eval-simulate',
      ferni_env: 'local',
    });
    expect(
      scriptBillingLabels({ GEMINI_BILLING_JOB: 'Nightly Sweep' }, '/repo/scripts/a.mjs')
    ).toEqual({
      ferni_job: 'nightly_sweep',
      ferni_env: 'local',
    });
    expect(scriptBillingLabels({}, '').ferni_job).toBe('unlabelled');
  });

  it('adds labels to a request body and keeps labels the body set', () => {
    const labels = { ferni_job: 'j', ferni_env: 'local' };
    expect(withBillingLabels({ contents: [] }, labels)).toEqual({ contents: [], labels });
    expect(withBillingLabels({ labels: { ferni_job: 'own' } }, labels).labels).toEqual({
      ferni_job: 'own',
      ferni_env: 'local',
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('defaults to this process: GEMINI_BILLING_JOB, local', () => {
    vi.stubEnv('GEMINI_BILLING_JOB', 'unit_job');
    expect(withBillingLabels({ contents: [] })).toEqual({
      contents: [],
      labels: { ferni_job: 'unit_job', ferni_env: 'local' },
    });
  });

  it('sanitizes and names jobs exactly as the src twin does', () => {
    const values = ['Voice Eval/Judge!!', 'a'.repeat(80), '***', 'ok-name_1', 'Ünïcode'];
    for (const v of values) expect(sanitizeLabelValue(v)).toBe(src.sanitizeLabelValue(v));
    const entries = [
      '/r/scripts/voice-eval/judge.mjs',
      '/r/scripts/x.ts',
      'C:\\r\\dist\\agent.js',
      '',
      undefined,
    ];
    for (const e of entries) expect(jobFromEntry(e)).toBe(src.jobFromEntry(e));
  });
});
