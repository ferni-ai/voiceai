import type { FlagSpec } from '../flag-spec.js';

// off | on (#4314): a vehicle running in the garage, said in everyday words ("the engine is running in the garage and the door is shut", "left the car running and shut the door", "the truck's idling in the garage and i'm breathing the fumes"), reads as the caller's own imminent crisis (911 first) when the turn says the door is shut, names the fumes, or holds the caller's own crisis words. Escalate-only. Engine off, door open, someone else's car, a joke, the past, or an everyday reason (warming up, heading out, the mechanic) keep main's read. Off: only "engine running ... garage" side by side reads imminent, as before. Read from process.env (safety/crisis-garage-imminent.ts, called by crisis-guard.ts).
export const CRISIS_CO_GARAGE_IMMINENT = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4314',
  context:
    'Promote after an independent verify, the crisis owner yes and clean dev nights with no false emergency scripts; then make permanent, else delete.',
} as const satisfies FlagSpec;
