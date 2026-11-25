import type { FlagSpec } from '../flag-spec.js';

// off | on (owner, 2026-11-15): a crisis escalation that rejects never clears the held reply. After the classifier's verdict, its own decision stands with no easing step; before it, a failed read: the classifier-timeout path decides, its check-in with 988 on safety words on even when CRISIS_TIMEOUT_CHECKIN is off. Voice gate only; logs stage and error class only (agents/personas/crisis-gate-failure.ts).
export const CRISIS_GATE_FAIL_CLOSED = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3898',
  context: 'dev on: escalation_failed turns release no held reply; the owner sets prod timing',
} as const satisfies FlagSpec;
