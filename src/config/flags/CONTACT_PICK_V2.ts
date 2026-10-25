import type { FlagSpec } from '../flag-spec.js';

// on: when several saved contacts match "call my mom" and have a number, the exact name or relationship match wins, then the most recently updated (contact-pick.ts). Off: the first match with a number, in stored order. Contacts with no number are skipped either way.
export const CONTACT_PICK_V2 = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
