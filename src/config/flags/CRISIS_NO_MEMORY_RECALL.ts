import type { FlagSpec } from '../flag-spec.js';

// off | on (crisis lead, 2026-11-18): what is stored about the caller never reaches a crisis reply. A line with crisis words, or a call with crisis risk, runs no memory search; a turn the crisis read replaced, guided or eased, or a call with risk noted, builds its background note without stored memory (no read counts as crisis; every category intelligence/utils/caller-memory-categories.ts marks); every crisis-guided request, and every request on a call with risk noted, gets the background note without it. Ordinary turns are unchanged (agents/processors/turn-processor/crisis-memory-recall.ts). Owner 'intelligence': FLAG_OWNERS has no crisis owner, and the memory pipeline is intelligence's.
export const CRISIS_NO_MEMORY_RECALL = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4104',
  context:
    'dev on, then the TURN_MEMORY count of crisis-marked turns that still carry recalled memory must read 0; prod on the owner yes, before TURN_MEMORY_RRF_SCALE and TURN_MEMORY_RERANK go back on',
} as const satisfies FlagSpec;
