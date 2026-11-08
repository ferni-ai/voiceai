import type { FlagSpec } from '../flag-spec.js';

// on: half of call-start greetings that reach the dynamic step ask Gemini (Vertex) for one, with an 800 ms budget (personas/greetings.ts). off = compositional greetings only. Off because gemini-3.5-flash took 1.0-1.9 s on Vertex (2026-10-30, 6/6 over budget): on, it adds 800 ms to those greetings and still falls back.
export const DYNAMIC_GREETING = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
