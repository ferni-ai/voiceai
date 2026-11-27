/**
 * The turn handling every call session starts from: when a caller's pause ends their turn, how
 * little speech counts as an interruption, and that the SDK may start a reply early.
 *
 * These were `voiceOptions` and a top-level `preemptiveGeneration`, which @livekit/agents 1.9.3
 * migrates with a deprecation warning on every session (20 warnings in 3 days of prod logs). The
 * values are unchanged; `turnHandling` is where the SDK reads them now.
 *
 * @module agents/shared/base-turn-handling
 */
import { endpointingDelays } from './turn-patience.js';

export interface BaseTurnHandling {
  interruption: { minWords: number; minDuration: number };
  endpointing: { minDelay: number; maxDelay: number };
  preemptiveGeneration: { enabled: boolean };
}

export function baseTurnHandling(
  env: Record<string, string | undefined> = process.env
): BaseTurnHandling {
  const { minEndpointingDelay, maxEndpointingDelay } = endpointingDelays(env);
  return {
    interruption: { minWords: 1, minDuration: 150 }, // 150 ms: was 200, for faster barge-in
    endpointing: { minDelay: minEndpointingDelay, maxDelay: maxEndpointingDelay }, // turn-patience.ts
    preemptiveGeneration: { enabled: true },
  };
}
