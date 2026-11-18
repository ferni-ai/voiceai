import type { FlagSpec } from '../flag-spec.js';

// off | on: no tool runs on its own on a crisis turn. A router (semantic, intelligent, FTIS) asks the turn's crisis reads before it runs a matched tool: patterns, the classifier (awaited within its existing timeout), a soft check-in, and any risk earlier reads noted on the call (the reply gate's included; its read of this turn starts after routing). A read that fails holds the tool. The direct tool reply that skips the reply model is refused on the same reads, so the turn gets the normal crisis-aware reply (agents/processors/turn-processor/turn-crisis.ts autoToolsAllowed). Logs AUTO_TOOL_HELD with the router and a count, no words (tools/semantic-router/integration/auto-execute-hold.ts).
export const CRISIS_BLOCKS_AUTO_TOOLS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3816',
  context:
    'dev on: AUTO_TOOL_HELD counts, ordinary-turn auto-execute rate unchanged, and no semantic_auto_execute on a turn with a crisis read; prod on the owner yes',
} as const satisfies FlagSpec;
