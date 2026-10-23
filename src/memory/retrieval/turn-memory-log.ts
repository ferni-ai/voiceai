/**
 * One info line per caller turn that ran the per-turn memory search, so an
 * A/B of TURN_MEMORY_RRF_SCALE / TURN_MEMORY_RERANK can see what retrieval did.
 * Before it, the only record was a debug line, so a dev sweep's logs could not
 * show whether the gate sent anything (release-1cf4bd64b memory-flags A/B).
 *
 * Counts, booleans and numbers only. Memory text, entity names and ids never go
 * in: Cloud Logging is not where a caller's memories belong.
 *
 * @module memory/retrieval/turn-memory-log
 */
import { createLogger } from '../../utils/safe-logger.js';
import type { HybridSearchResult } from './hybrid-search.js';

const log = createLogger({ module: 'TurnMemoryRetrieval' });

/** The message every per-turn line carries; search Cloud Logging for it. */
export const TURN_MEMORY_LOG_MESSAGE = 'TURN_MEMORY';

/** What retrieveForTurn knows once a turn's memories are chosen. */
export interface TurnMemoryLogInput {
  turnNumber: number;
  /** What the hybrid search returned, before any gate. */
  candidates: HybridSearchResult[];
  /** How many memories reached the prompt. */
  injected: number;
  rrfScale: boolean;
  rerank: boolean;
  /** The TURN_MEMORY_RERANK judge answered in time (metrics.rerankingApplied with rerank on). */
  judged: boolean;
  latencyMs: number;
}

/** The logged object. Every field is a number or a boolean. */
export interface TurnMemoryLogFields {
  turn: number;
  candidates: number;
  injected: number;
  /** TURN_MEMORY_RERANK's runner-up gate made the call (rerank on, no judge answer). */
  gate: boolean;
  rrfScale: boolean;
  rerank: boolean;
  /**
   * Best candidate score on the scale the turn gated on: the vector cosine with
   * TURN_MEMORY_RRF_SCALE on, the fused rank score (at most ~0.0098) with it off.
   * 0 when the search found nothing. Rounded to 3 places.
   */
  topScore: number;
  latencyMs: number;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function turnMemoryLogFields(input: TurnMemoryLogInput): TurnMemoryLogFields {
  const scores = input.candidates.map((r) =>
    input.rrfScale ? (r.legScores?.vector ?? 0) : r.score
  );
  return {
    turn: input.turnNumber,
    candidates: input.candidates.length,
    injected: input.injected,
    gate: input.rerank && !input.judged,
    rrfScale: input.rrfScale,
    rerank: input.rerank,
    topScore: round3(Math.max(0, ...scores.filter(Number.isFinite))),
    latencyMs: Math.round(input.latencyMs),
  };
}

/** Emit the per-turn TURN_MEMORY info line. */
export function logTurnMemory(input: TurnMemoryLogInput): void {
  log.info(turnMemoryLogFields(input), TURN_MEMORY_LOG_MESSAGE);
}
