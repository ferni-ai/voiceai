import type { FlagSpec } from '../flag-spec.js';

// off | on: no tool runs on its own on a crisis turn. A router (semantic, intelligent, FTIS) asks the turn's crisis reads before it runs a matched tool: patterns, the classifier (awaited within its existing timeout), a soft check-in, and any risk earlier reads noted on the call (the reply gate's included; its read of this turn starts after routing). A read that fails holds the tool, and so does a router call with no check (every caller must pass one; FTIS from the transcript handler waits for its turn's settled read). The direct tool reply that skips the reply model is refused on the same reads, so the turn gets the normal crisis-aware reply (agents/processors/turn-processor/router-crisis-check.ts). Each check logs AUTO_TOOL_CHECK with the router, the outcome (allowed | held | failed | no_check) and the wait in ms, ids and numbers only (tools/semantic-router/integration/auto-execute-hold.ts).
export const ROUTER_EXEC_AFTER_CRISIS_READ = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3816',
  context:
    'dev on: AUTO_TOOL_CHECK outcomes and waitMs (the cost on an ordinary tool turn), ordinary-turn auto-execute rate unchanged, and no semantic_auto_execute on a turn with a crisis read; prod on the owner yes',
} as const satisfies FlagSpec;
