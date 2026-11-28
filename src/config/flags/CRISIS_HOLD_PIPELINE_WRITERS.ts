import type { FlagSpec } from '../flag-spec.js';

// off | on: processTurn's memory writers that still record a crisis turn hold on it instead ("crisis turns record nothing"). Each runs in the background, only once the turn's crisis read settles clean and nothing holds the call (crisis-memory-hold.ts crisisTurnSettled, the turn's one shared wait) and no hold covers the caller (minor-care.ts writeHeld): fail closed, so no read, an unsettled read, a crisis read or a throw records nothing (turn-processor/pipeline-crisis-hold.ts). Never on the reply path. Off: each writes inline, as before.
// Sites: process-turn.ts saveReflectionMoment (cross-session reflection moment, kept on the profile's customData).
export const CRISIS_HOLD_PIPELINE_WRITERS = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3892',
  context:
    'dev on: crisis or held turns with a pipeline memory write go to 0; clean turns keep their writes',
} as const satisfies FlagSpec;
