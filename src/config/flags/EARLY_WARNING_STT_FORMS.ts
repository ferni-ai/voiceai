import type { FlagSpec } from '../flag-spec.js';

// off | shadow | on. One site: services/wellbeing-tracking/early-warning.ts, through
// utils/phrase-match.ts mentions(). on: a message no listed phrase matched also matches
// speech-to-text spellings and forms ("cant go on", "wanna die", "killing myself"), minus
// idioms and negations; it only adds matches. shadow: logs what on would add, decides as off.
export const EARLY_WARNING_STT_FORMS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
