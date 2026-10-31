import type { FlagSpec } from '../flag-spec.js';

// on: the outgoing persona's goodbye is said from the handoff tool once its consent and target checks pass, before executeHandoff's setup awaits; the orchestrator skips the line already said (tools/handoff/early-goodbye.ts)
export const HANDOFF_EARLY_GOODBYE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
