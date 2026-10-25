/**
 * Latency A/Bs set their arm per eval caller (a cohort or an override), so both
 * arms run in the same hour on one build and provider drift cancels. The flag
 * has to reach the reader each turn uses, for that caller and no one else.
 */
import { describe, expect, it } from 'vitest';
import { actionClaimStreamEnabled } from '../../../agents/personas/action-claim-guard.js';
import { preemptStableMode } from '../../../agents/multi-agent/preempt-stable-context.js';
import { applyCallerFlags, type Cohort, type CohortStore } from '../cohort-flags.js';

const store = (cohorts: Record<string, Cohort[]>): CohortStore => ({
  cohortsFor: async (u) => cohorts[u] ?? [],
  overridesFor: async () => ({}),
  sampledCohorts: async () => [],
});

describe('latency A/B flags, per caller', () => {
  it('reach the per-turn readers for the caller whose cohort set them, and no one else', async () => {
    const s = store({
      'voice-eval-arm-on': [
        {
          id: 'latency-ab',
          enabled: true,
          flags: { ACTION_CLAIM_STREAM: 'on', PREEMPT_STABLE_CONTEXT: 'defer' },
        },
      ],
    });
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    expect(actionClaimStreamEnabled(env)).toBe(false);
    expect(preemptStableMode(env)).toBe('off');

    await applyCallerFlags('voice-eval-arm-on', { store: s, env });
    expect(actionClaimStreamEnabled(env)).toBe(true);
    expect(preemptStableMode(env)).toBe('defer');

    await applyCallerFlags('voice-eval-arm-off', { store: s, env });
    expect(actionClaimStreamEnabled(env)).toBe(false);
    expect(preemptStableMode(env)).toBe('off');
  });
});
