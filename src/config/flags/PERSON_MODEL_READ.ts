import type { FlagSpec } from '../flag-spec.js';

// on: each persona setup reads the caller's call sheet (bogle_users/{uid}/person_model/current, built nightly under PERSON_MODEL) and adds it to the model instructions after "Who You're Talking To" (agents/multi-agent/call-sheet). Started at setup start and taken without waiting just before the model is made, so a slow read means no sheet, never a later first word. Members with the owner proven on the line only; skipped when anything was forgotten since the build, under a MINOR_CARE hold, with crisis risk on the call or a crisis signal in the last 14 days, or when the sheet is 3 days old or more. Off: nothing is read and the instructions are as before.
export const PERSON_MODEL_READ = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-08',
  issue: 'TBD',
  context:
    'Keep if the natural-use eval rises with leaks at 0 and first-word timing unchanged; else delete.',
} as const satisfies FlagSpec;
