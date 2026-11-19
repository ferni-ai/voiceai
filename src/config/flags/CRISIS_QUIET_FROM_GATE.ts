import type { FlagSpec } from '../flag-spec.js';

// off | shadow | on: a crisis the reply gate handles on a call (the 988/911 script, decisionFor's full crisis guidance, or its guidance about someone the caller knows; never a soft check-in) starts the CRISIS_QUIET_DAYS proactive quiet window that hadCrisisWithin reads (agents/safety/crisis-quiet-window.ts). The caller's own crisis: one crisis_signals doc with no words. A MINOR_CARE-held caller, or a crisis about someone else: a quietUntil time on minor_care_holds only. shadow logs what it would write; off runs nothing.
export const CRISIS_QUIET_FROM_GATE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-08',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3677',
  context:
    'Safety: classifier false alarms would quiet proactive outreach for 14 days; Seth decides before on. Never just delete.',
} as const satisfies FlagSpec;
