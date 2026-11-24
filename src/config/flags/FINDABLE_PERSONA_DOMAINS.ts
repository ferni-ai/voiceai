import type { FlagSpec } from '../flag-spec.js';

// on: under TOOL_CORE_STATIC, findTools for a persona may also find and pin tools from that persona's own manifest domains (Alex and Nayan: decisions; Jordan and Maya: life-thesis), never home, concierge or the NEVER_FINDABLE domains (findable-domains.ts). A persona without the domain gains nothing.
export const FINDABLE_PERSONA_DOMAINS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-03-01',
  issue: '#4328',
  context:
    'Only matters while TOOL_CORE_STATIC is on; try both together in dev before any promotion.',
} as const satisfies FlagSpec;
