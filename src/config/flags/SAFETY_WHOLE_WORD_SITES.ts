import type { FlagSpec } from '../flag-spec.js';

// off | shadow | on. Whole-word risk phrases (utils/safety-whole-word.ts) at six sites:
// tools/domains/life-coaching-shared/safety-guards.ts (assessSafety),
// services/principal-alignment/human-referral.ts (analyzeReferralNeed),
// tools/semantic-router/shared-vocabulary.ts (detectEmotionalState),
// intelligence/context-builders/intelligence/predictive-context.ts (concern signals),
// tools/semantic-router/matcher.ts (crisis context boost), and
// services/safety/crisis-agreement.ts (hasRiskContent: plane/plants out, "dying" in).
// shadow: logs each check where on would differ, decides as off.
export const SAFETY_WHOLE_WORD_SITES = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
