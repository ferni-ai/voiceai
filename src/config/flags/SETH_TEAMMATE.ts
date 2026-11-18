import type { FlagSpec } from '../flag-spec.js';

// on: the seth teammate may speak in Seth's own consented clone (ROSTER_VOICE_SETH; getVoiceIdForPersona('seth') in config/voice-ids.ts). Off, or with the setting unset, Seth has no voice and is unreachable, and never speaks in Ferni's.
export const SETH_TEAMMATE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4067',
  context:
    'Keep once Seth has approved his lines on dev and the teammate ships on prod; else delete.',
} as const satisfies FlagSpec;
