import type { FlagSpec } from '../flag-spec.js';

// on: after a call, something the caller said that changed how Ferni sees a topic is kept
// (persona-growth-after-call.ts), and a later call may offer it once, in the first recall note
// (persona-growth-recall.ts). Read after the call through envForCaller and per call by the
// recall hook, so a cohort can turn it on for one person first.
export const PERSONA_GROWTH = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
