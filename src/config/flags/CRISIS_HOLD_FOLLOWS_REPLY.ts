import type { FlagSpec } from '../flag-spec.js';

// off | on: the voice turn handler's memory writers (bond message, learning, unified moments, trust milestone, semantic intelligence, fast capture) hold on a turn the reply gate read as a crisis, not only on one the turn pipeline did. Each waits, bounded, for the call's crisis reads to settle (utils/crisis-memory-hold.ts crisisTurnSettled) and holds when they did not or when any read held the call: fail closed. Only adds holds; never blocks the handler or a pushed note (agents/voice-agent/crisis-turn-memory.ts). Needs CRISIS_GUARD_MODE=live for the gate's reads to count.
export const CRISIS_HOLD_FOLLOWS_REPLY = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3892',
  context:
    'dev on: turns the gate read as crisis with a handler memory write go to 0; added write delay p50/p95',
} as const satisfies FlagSpec;
