import type { FlagSpec } from '../flag-spec.js';

// On: POST /api/me/focus saves a Focus hold to messagingPrefs.focus (api/routes/focus.ts),
// and the policy's focusGate holds what Ferni starts while it lasts (messaging/policy.ts).
// Read per person (COHORT_FLAGS). Off: the route answers 404 and nothing is saved.
export const FOCUS_HOLD = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
