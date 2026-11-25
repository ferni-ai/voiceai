import type { FlagSpec } from '../flag-spec.js';

// on: a proven sponsored caller of the owner reaches the family circle
export const SETH_FAMILY_CIRCLE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4067',
} as const satisfies FlagSpec;
