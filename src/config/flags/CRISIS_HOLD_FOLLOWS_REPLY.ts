import type { FlagSpec } from '../flag-spec.js';

// off | on: the voice turn handler's memory writers (bond message, learning, unified moments, trust milestone, semantic intelligence, fast capture) hold on a turn the reply gate read as a crisis, not only on one the turn pipeline did. With the gate live, each waits, bounded, for the gate's own read of THIS caller turn and its escalation: the turn context pusher names each caller turn (multi-agent/caller-turn-builder.ts, noted from its first interim), the gate notes its read under that name with the exact words it read (personas/crisis-gate.ts, utils/crisis-memory-hold.ts noteReplyGateTurn, replyGateTurnSettled), so neither the pipeline's read nor an earlier turn's read stands in for it, and holds when the gate read nothing in time, a read did not settle, or any read held the call: fail closed. With the gate off or in shadow, no words are matched: the call's reads must settle clean and the call must not be held (readsSettledClean). Only adds holds; never blocks the handler or a pushed note (agents/voice-agent/crisis-turn-memory.ts). A voice turn the gate never reads (a reply cut before it starts) records nothing.
export const CRISIS_HOLD_FOLLOWS_REPLY = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3892',
  context:
    'first a dev call with the flag on: the turn names noted for the call match the names the handler reads, so ordinary turns still record; then dev on: turns the gate read as crisis with a handler memory write go to 0; turns held for no matching gate read; added write delay p50/p95',
} as const satisfies FlagSpec;
