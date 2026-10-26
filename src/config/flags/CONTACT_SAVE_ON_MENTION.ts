import type { FlagSpec } from '../flag-spec.js';

// On: a number the owner gives callOnBehalf / callAndConverse is saved to their contacts at the
// read-back, before any yes (telephony/contact-on-mention.ts): a new contact, or the number filled
// into a phoneless one. A different saved number is replaced only on the owner's yes to a
// read-back that says so. Off (the kill switch): saved only when a confirmed call to an unknown
// contact is placed, as before. Prod 2026-10-26: dad's number given at 18:47, gone at 22:20.
export const CONTACT_SAVE_ON_MENTION = {
  default: 'on',
  owner: 'tools',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
