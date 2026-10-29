import type { FlagSpec } from '../flag-spec.js';

// on: "call my mom" is picked by one score (contact-pick-v2.ts): exact name, then the relation name ("Dad"), then the owner's relation in notes ("User's dad", never "her dad" / "not my dad"), and a tie or a name that only contains the relation word asks the caller instead of dialing; a number given is saved under the relation name. Off: the store's first match, as before, except a phoneless first row yields to a same-named row with a number (contact-pick.ts).
export const CONTACT_PICK_V2 = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
