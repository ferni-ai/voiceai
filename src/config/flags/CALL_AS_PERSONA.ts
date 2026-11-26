import type { FlagSpec } from '../flag-spec.js';

// On: a call the owner asks a teammate to place (callOnBehalf) is placed by that persona, in its own name and voice: the request records the asking persona, the signed dispatch carries it as persona_id, the script, opener, voicemail and prompt say its name, and the reply says "Alex will call David now" (tools/domains/telephony/scripts/calling-persona.ts). Ferni team only; anything else calls as Ferni. Off: nothing recorded, Ferni calls as before.
export const CALL_AS_PERSONA = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4106',
  context:
    'Keep if the people called accept the teammate who was asked (no more refusals or confusion than Ferni-placed calls); else delete.',
} as const satisfies FlagSpec;
