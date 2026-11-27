import type { FlagSpec } from '../flag-spec.js';

// off | gemini-3.8-flash | gemini-4-argon | gemini-4-carbon | gemini-4-hydrogen | gemini-4-neon. Dev only (FIRESTORE_DATABASE=ferni-dev exactly; anywhere else it does nothing): each call draws a sticky arm, about half trial and half control, and a trial call's requests that are clear of crisis handling go to the named model; every other request, crisis-marked, a pending verdict, risk noted or unknown, goes to today's gemini-3.5-flash (trial-lane.ts). Each TURN_RECEIPT then carries trial {arm, held, model, backup}.
export const CASCADE_TRIAL_MODEL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#4467',
  context:
    'the #4467 bake-off on dev: heard gap, first sentence, tool correctness, repetition, humanness and cost against control',
} as const satisfies FlagSpec;
