import type { FlagSpec } from '../flag-spec.js';

// off | on: the voice turn handler's memory writers (bond message, learning, unified moments, trust milestone, semantic intelligence, fast capture) hold on a turn the reply gate read as a crisis, not only on one the turn pipeline did. With the gate live, each waits, bounded, for the gate's own read of the turn and its escalation (personas/crisis-gate.ts notes it: utils/crisis-memory-hold.ts noteReplyGateTurn, replyGateTurnSettled), never taking the pipeline's read for it, and holds when the gate read nothing in time, a read did not settle, or any read held the call: fail closed. With the gate off or in shadow, any read of the turn counts (crisisTurnSettled). Only adds holds; never blocks the handler or a pushed note (agents/voice-agent/crisis-turn-memory.ts). A voice turn the gate never reads (a reply cut before it starts) records nothing.
export const CRISIS_HOLD_FOLLOWS_REPLY = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3892',
  context:
    'dev on: turns the gate read as crisis with a handler memory write go to 0; added write delay p50/p95',
} as const satisfies FlagSpec;
