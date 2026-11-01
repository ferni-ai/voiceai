import type { FlagSpec } from '../flag-spec.js';

// on: the semantic router's Google embeddings (tool index, learning loops, query embedding where a router has a provider) call gemini-embedding-001 on Vertex; a single query embedding is capped at 1.5 s (tools/semantic-router/embedding-providers.ts). off = every call fails at once and callers keep their non-embedding path. That was the effective behaviour while the old GOOGLE_API_KEY call failed. Warm calls took 235-436 ms, the first ~12 s (2026-10-30).
export const ROUTER_EMBEDDINGS_VERTEX = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
