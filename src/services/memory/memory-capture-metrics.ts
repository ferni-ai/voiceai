/**
 * Memory Capture Metrics
 *
 * Counters for the conversation capture path (turn writes, session-end
 * timers, catch-up summarization). Exposed at
 * `GET /api/observability/memory-capture` so a silent capture failure shows up
 * as a number instead of a buried log line.
 *
 * @module services/memory/memory-capture-metrics
 */

export type TurnRole = 'user' | 'assistant';

export type SessionWaitEndReason =
  | 'room.disconnected'
  | 'room.!isConnected'
  | 'empty_room'
  | 'idle_timeout'
  | 'max_duration';

interface RoleCounters {
  attempted: number;
  succeeded: number;
  retried: number;
  failed: number;
}

interface CatchUpCounters {
  runs: number;
  scanned: number;
  summarized: number;
  skippedActive: number;
  failed: number;
  lastRunAt: string | null;
}

export interface MemoryCaptureMetricsSnapshot {
  turnWrites: Record<TurnRole, RoleCounters>;
  assistantTurnsCaptured: number;
  assistantTurnsDeduped: number;
  sessionWaitEnds: Record<string, number>;
  catchUp: CatchUpCounters;
  lastTurnWriteFailure: { at: string; role: TurnRole; error: string } | null;
}

function emptyRole(): RoleCounters {
  return { attempted: 0, succeeded: 0, retried: 0, failed: 0 };
}

let turnWrites: Record<TurnRole, RoleCounters> = { user: emptyRole(), assistant: emptyRole() };
let assistantTurnsCaptured = 0;
let assistantTurnsDeduped = 0;
let sessionWaitEnds: Record<string, number> = {};
let catchUp: CatchUpCounters = {
  runs: 0,
  scanned: 0,
  summarized: 0,
  skippedActive: 0,
  failed: 0,
  lastRunAt: null,
};
let lastTurnWriteFailure: MemoryCaptureMetricsSnapshot['lastTurnWriteFailure'] = null;

export function recordTurnWriteAttempt(role: TurnRole): void {
  turnWrites[role].attempted += 1;
}

export function recordTurnWriteRetry(role: TurnRole): void {
  turnWrites[role].retried += 1;
}

export function recordTurnWriteResult(role: TurnRole, ok: boolean, error?: string): void {
  if (ok) {
    turnWrites[role].succeeded += 1;
    return;
  }
  turnWrites[role].failed += 1;
  lastTurnWriteFailure = { at: new Date().toISOString(), role, error: error ?? 'unknown' };
}

export function recordAssistantTurnCaptured(): void {
  assistantTurnsCaptured += 1;
}

export function recordAssistantTurnDeduped(): void {
  assistantTurnsDeduped += 1;
}

export function recordSessionWaitEnd(reason: SessionWaitEndReason): void {
  sessionWaitEnds[reason] = (sessionWaitEnds[reason] ?? 0) + 1;
}

export function recordCatchUpRun(stats: {
  scanned: number;
  summarized: number;
  skippedActive: number;
  failed: number;
}): void {
  catchUp = {
    runs: catchUp.runs + 1,
    scanned: catchUp.scanned + stats.scanned,
    summarized: catchUp.summarized + stats.summarized,
    skippedActive: catchUp.skippedActive + stats.skippedActive,
    failed: catchUp.failed + stats.failed,
    lastRunAt: new Date().toISOString(),
  };
}

export function getMemoryCaptureMetrics(): MemoryCaptureMetricsSnapshot {
  return {
    turnWrites: { user: { ...turnWrites.user }, assistant: { ...turnWrites.assistant } },
    assistantTurnsCaptured,
    assistantTurnsDeduped,
    sessionWaitEnds: { ...sessionWaitEnds },
    catchUp: { ...catchUp },
    lastTurnWriteFailure,
  };
}

/** Test helper. */
export function resetMemoryCaptureMetrics(): void {
  turnWrites = { user: emptyRole(), assistant: emptyRole() };
  assistantTurnsCaptured = 0;
  assistantTurnsDeduped = 0;
  sessionWaitEnds = {};
  catchUp = { runs: 0, scanned: 0, summarized: 0, skippedActive: 0, failed: 0, lastRunAt: null };
  lastTurnWriteFailure = null;
}
