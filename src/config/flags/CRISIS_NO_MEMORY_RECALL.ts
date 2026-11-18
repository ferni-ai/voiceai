import type { FlagSpec } from '../flag-spec.js';

// off | on (crisis lead, 2026-11-18): the caller's recalled memories never reach a crisis reply. A turn the crisis read replaced, guided or eased, or a call with risk noted, builds its background note without them (no read counts as crisis); every crisis-guided request, and every request on a call with risk noted, gets the background note without them. Ordinary turns are unchanged (agents/processors/turn-processor/crisis-memory-recall.ts).
export const CRISIS_NO_MEMORY_RECALL = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/0',
  context:
    'dev on, then the TURN_MEMORY count of crisis-marked turns that still carry recalled memory must read 0; prod on the owner yes, before TURN_MEMORY_RRF_SCALE and TURN_MEMORY_RERANK go back on',
} as const satisfies FlagSpec;
