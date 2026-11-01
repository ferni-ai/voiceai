import type { FlagSpec } from '../flag-spec.js';

// on: the legacy persona humanization (subtext, aftercare) asks Gemini on Vertex for a line, capped at LLM_SHORT_TIMEOUT_MS, and the turn waits on it (personas/shared/llm-advanced-humanization.ts). off = no LLM call, cache or static lines only. That was the effective behaviour while the old GOOGLE_API_KEY call failed. Flash-lite took 0.8-1.0 s (2026-10-30).
export const HUMANIZATION_LLM = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
