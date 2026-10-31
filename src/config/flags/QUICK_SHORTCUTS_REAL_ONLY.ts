import type { FlagSpec } from '../flag-spec.js';

// on: while ASSISTANT_ACTIONS_REAL is off, quickCall/quickText/quickEmail are not offered (decided once per call), so the model calls reachOut/callOnBehalf directly instead of a shortcut that only answers 'use reachOut' (agents/shared/quick-shortcuts-real-only.ts)
export const QUICK_SHORTCUTS_REAL_ONLY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
