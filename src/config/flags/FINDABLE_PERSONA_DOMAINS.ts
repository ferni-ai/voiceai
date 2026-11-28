import type { FlagSpec } from '../flag-spec.js';

// on: under TOOL_CORE_STATIC, findTools for a persona may also find and pin the decisions and life-thesis tools when that persona's manifest lists the domain (Alex and Nayan: decisions; Jordan and Maya: life-thesis). An allowlist (PERSONA_FINDABLE_DOMAINS, findable-domains.ts): no other manifest domain is ever added, so no call, text, post or share tool. A persona without either domain gains nothing.
export const FINDABLE_PERSONA_DOMAINS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-03-01',
  issue: '#4328',
  context:
    'Only matters while TOOL_CORE_STATIC is on; try both together in dev before any promotion.',
} as const satisfies FlagSpec;
