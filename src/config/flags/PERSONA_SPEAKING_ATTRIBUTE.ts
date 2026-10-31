import type { FlagSpec } from '../flag-spec.js';

// on: the agent sets participant attributes ferni.persona / ferni.persona_name when each
// persona's audio starts, so the app's name chip follows the voice (persona-speaking-attribute.ts).
export const PERSONA_SPEAKING_ATTRIBUTE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
