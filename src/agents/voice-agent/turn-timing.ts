/**
 * Turn Timing
 *
 * The timing side effects of a user turn: latency profilers (turn profiler
 * and adaptive timing) and the turn-pace clock used for gap detection.
 *
 * Extracted from turn-handler.ts.
 *
 * @module voice-agent/turn-timing
 */

import {
  calculateAndRecordTurnGap,
  recordTurnEndTime,
} from '../../intelligence/context-builders/awareness/system-state-awareness.js';
import {
  completeTurnProfiling,
  markTurnCheckpoint,
  startTurnProfiling,
} from '../../services/performance/turn-profiler.js';
import { completeTurnProfile, startTurnProfile } from '../shared/performance/adaptive-timing.js';

type TurnCheckpoint = Parameters<typeof markTurnCheckpoint>[2];

/** Timing side effects of one turn, bound to its session and turn number */
export interface TurnTiming {
  startProfiling: () => void;
  startProfile: () => void;
  mark: (checkpoint: TurnCheckpoint) => void;
  completeProfile: () => void;
  completeProfiling: () => ReturnType<typeof completeTurnProfiling>;
  recordTurnGap: () => number;
  recordTurnEnd: () => void;
}

/**
 * The turn's timing side effects (latency profilers, turn-pace clock). An
 * advisory run gets no-ops: it overlaps the agent's own reply.
 */
export function turnTiming(sessionId: string, turnNumber: number, advisory: boolean): TurnTiming {
  if (advisory) {
    return {
      startProfiling: () => undefined,
      startProfile: () => undefined,
      mark: (_checkpoint: TurnCheckpoint) => undefined,
      completeProfile: () => undefined,
      completeProfiling: () => null,
      recordTurnGap: () => 0,
      recordTurnEnd: () => undefined,
    };
  }
  return {
    startProfiling: () => startTurnProfiling(sessionId, turnNumber),
    startProfile: () => startTurnProfile(sessionId, turnNumber),
    mark: (checkpoint: TurnCheckpoint) => markTurnCheckpoint(sessionId, turnNumber, checkpoint),
    completeProfile: () => completeTurnProfile(sessionId, turnNumber),
    completeProfiling: () => completeTurnProfiling(sessionId, turnNumber),
    recordTurnGap: () => calculateAndRecordTurnGap(sessionId),
    recordTurnEnd: () => recordTurnEndTime(sessionId),
  };
}
