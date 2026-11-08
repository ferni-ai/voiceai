import type { FlagSpec } from '../flag-spec.js';

// on: /demo-token (no sign-in) keeps persona_id only when it names a built-in persona, an id or alias in personas/persona-ids.ts, and sends its canonical id; any other id gets Ferni, as a custom agent id already does there (servers/api/routes/token-persona-owner.ts). Off: /demo-token passes any non-custom id through, as on main. /token is not changed.
export const DEMO_TOKEN_CORE_PERSONAS_ONLY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3595',
  context:
    'Stopgap until every persona prompt carries the crisis line; then delete, or make it permanent if demos stay core-only.',
} as const satisfies FlagSpec;
