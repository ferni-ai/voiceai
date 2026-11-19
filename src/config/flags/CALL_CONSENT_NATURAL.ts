import type { FlagSpec } from '../flag-spec.js';

// on: only owner words begun after the read-back started playing answer it (VAD lag taken off);
// a natural yes needs the judge's yes and a small word set (no names, digits, bare "right", "um");
// a "yes, tell him X" message is read back first; crisis risk on the call holds all outbound.
// Off: as before. The CONSENT_NATURAL_DECISION count line (enums only) logs in both states.
export const CALL_CONSENT_NATURAL = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4093',
  context:
    'Keep until the dev consent eval shows natural yeses placing and no pre-read-back word cancelling; then default on and delete.',
} as const satisfies FlagSpec;
