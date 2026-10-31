import type { FlagSpec } from '../flag-spec.js';

// Share of calls (0-100, by session id) in the latency A/B treatment arm: PREEMPT_STABLE_CONTEXT=on for that call unless a cohort or override of the caller sets it (services/platform/latency-arm.ts).
export const LATENCY_ARM_PERCENT = {
  default: '0',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
