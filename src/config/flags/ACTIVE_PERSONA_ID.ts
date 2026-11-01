import type { FlagSpec } from '../flag-spec.js';

// on: services.personaId follows each handoff, so whatever is recorded during a teammate's turns (commitment capturedBy, the persona-only context builders) names who actually spoke, and the after-call Maya habit check runs when Maya spoke at any point (services/session/active-persona.ts, plan S1b). Off: it stays the persona the call started with, as before.
export const ACTIVE_PERSONA_ID = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
