import type { FlagSpec } from '../flag-spec.js';

// off | on (Seth, 2026-11-10): a crisis read that failed (timeout, error, unusable reply) on a turn the patterns read as nothing, whose latest caller line holds a safety word, gets a warm check-in: are you safe right now, 988, then carry on. Never the crisis script, never silent (code adds the question or 988 when the reply lacks them). Voice gate only; notes no call risk; logs counts only (services/safety/crisis-timeout-checkin.ts).
export const CRISIS_TIMEOUT_CHECKIN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
