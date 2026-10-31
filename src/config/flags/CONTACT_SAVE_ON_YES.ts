import type { FlagSpec } from '../flag-spec.js';

// on: a number the owner gives in a call request is saved when the owner says yes to the read-back (telephony/owner-contact.ts), before the call is placed or deferred, for the person asked for in both stores (entity_store and contact_relationships); a changed number is read back first, a number that is another person's asks "is <them> at the same number?", and nothing is saved for a MINOR_CARE hold or an unknown session. Off: a number is saved only when a confirmed call to someone the lookup didn't find is placed, as before.
export const CONTACT_SAVE_ON_YES = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
