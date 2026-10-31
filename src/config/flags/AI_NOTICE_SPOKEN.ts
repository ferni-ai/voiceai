import type { FlagSpec } from '../flag-spec.js';

// on: Ferni says he is an AI, not a person, out loud (NY GBL Art. 47): woven into the first line unless heard in the last 24 h, and again every 3 h of a call at a non-crisis turn boundary; each notice logged and stored (agents/shared/ai-notice.ts). off = no notice.
export const AI_NOTICE_SPOKEN = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
