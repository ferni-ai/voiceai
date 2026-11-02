import type { FlagSpec } from '../flag-spec.js';

// on: the semantic router's LLM fallback, goal planner and ReAct providers call Gemini on Vertex (up to LLM_TIMEOUT_MS) inside intelligent routing, which the turn awaits before the reply (tools/semantic-router/advanced/intelligent/llm-{fallback,providers}.ts). off = those calls fail at once and the router keeps its non-LLM decision. That was the effective behaviour while the old GOOGLE_API_KEY call failed.
export const ROUTER_LLM_VERTEX = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
