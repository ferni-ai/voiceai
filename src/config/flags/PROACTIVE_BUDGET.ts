import type { FlagSpec } from '../flag-spec.js';

// on: one proactive budget per call (memory/recall/proactive-budget.ts). The greeting's follow-up, the hello's date, the first recall note's thread and the S1 commitment insight all take one slot keyed by the call's sessionId: whoever asks first holds it for the call, a declined ask still counts, a crisis risk spends it for safety, and a claim with no sessionId or during a crisis read is refused. Off: each asker keeps its own limit as before (the opener claim keyed by userId).
export const PROACTIVE_BUDGET = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/pull/3591',
  context:
    'Right-moment B0: turn on in dev with the caller card and follow-up lanes, then measure asks per call before prod.',
} as const satisfies FlagSpec;
