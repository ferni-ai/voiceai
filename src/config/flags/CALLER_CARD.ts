import type { FlagSpec } from '../flag-spec.js';

// on: the prompt of every persona gets the caller card (home, people, recent calls; Coming up only with DATES_IN_HELLO on), built once per call at call start, and extraction keeps home and current location apart. Not read yet: the card lands in its own PR (docs/plans/2026-10-31-right-moment-memory.md §5.4). Off: the prompt is as before.
export const CALLER_CARD = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
