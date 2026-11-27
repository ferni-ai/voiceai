import type { FlagSpec } from '../flag-spec.js';

// On: any caller turn that names the account holder in the third person ("a friend of Sam", "Sam's coworker", "how do I impress Sam?") puts a guest on the line for the rest of the call (room-guests.ts, utils/guest-names-owner.ts), whether or not ROOM_GUESTS is on. With a guest on the line the call never changes the account's name (name-correction.ts ownerMayKeep: no preferredName write, no "from now on?"; rememberName in both of its paths,), a name the guest gives is used for this call only and rememberName tells the model so, never "stored", and a yes confirms no text or call (live-call-behaviors.ts speakerIsAccountOwner). The owner speaking of their own name ("I'm Sam", "I used to go by Sam", "Sam is my dead name") is not a guest. Off: as before.
export const NAME_GUEST_NAMES_OWNER = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#4389',
  context:
    'Keep if dev owner calls lose no real owner rename or send confirm to the "guest named the owner" check; else narrow it. Known false guests: an owner named with a word ("Hope", "Will") who says "I hope..."; an owner who speaks of someone else with their own first name. Either loses the account rename and the send confirm for that call.',
} as const satisfies FlagSpec;
