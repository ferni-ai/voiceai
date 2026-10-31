/**
 * One ferni_events.followthrough_outcomes row (bq-events.ts) per follow-up answer that
 * commitment-follow-through.ts settled: how a commitment Ferni asked about went. Off unless
 * FOLLOWTHROUGH_BQ and BQ_EVENTS are both on.
 *
 * Enums and a number only, never the commitment or the answer; the user and the commitment
 * id are hashed by bq-events. surfaced_via is left empty: the answer is settled wherever the
 * commitment context builder runs, which can't say which surface asked.
 *
 * @module services/analytics/bq-followthrough
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { emitEvent } from './bq-events.js';

const HOUR_MS = 60 * 60 * 1000;

/** A settled answer as the follow-through hands it back (FollowUpAnswer). */
export interface SettledAnswer {
  id: string;
  outcome: string;
  askedAtMs: number;
  answeredAtMs: number;
}

/** Queues the row; false when off or refused. Never throws, never awaits the network. */
export function reportFollowThrough(
  userId: string,
  answer: SettledAnswer,
  env: Env = process.env
): boolean {
  if (!flagOn('FOLLOWTHROUGH_BQ', env)) return false;
  const { askedAtMs, answeredAtMs } = answer;
  return emitEvent(
    'followthrough_outcomes',
    {
      item_kind: 'commitment',
      outcome: answer.outcome,
      delay_hours: askedAtMs > 0 ? Math.max(0, answeredAtMs - askedAtMs) / HOUR_MS : null,
    },
    { userId, itemId: answer.id },
    env
  );
}
