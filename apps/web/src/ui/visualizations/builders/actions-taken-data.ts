/**
 * GET /api/story/actions (src/api/story-routes.ts) in the shape "What I've Done for
 * You" draws.
 *
 * A count the server didn't send stays unknown (null), so the card says "Unknown"
 * instead of a 0 nobody measured. "Kept" is Ferni's promises, the same tally as
 * Trust & Growth's "I follow through" (tallyPromises on the server).
 *
 * @module visualizations/builders/actions-taken-data
 */

import type { ActionsTakenData, CareMoment } from './actions-taken.js';

const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** The progress object when all three counts are numbers, else null (unknown). */
function progressOf(raw: unknown): ActionsTakenData['commitmentProgress'] {
  const p = raw as { kept?: unknown; pending?: unknown; total?: unknown } | null | undefined;
  const kept = count(p?.kept);
  const pending = count(p?.pending);
  const total = count(p?.total);
  return kept === null || pending === null || total === null ? null : { kept, pending, total };
}

export function toActionsTakenData(raw: unknown): ActionsTakenData {
  const body = (raw ?? {}) as {
    recentCare?: unknown;
    summary?: Record<string, unknown>;
    commitmentProgress?: unknown;
    totalActions?: unknown;
  };
  const summary = body.summary ?? {};
  const recentCare = Array.isArray(body.recentCare) ? (body.recentCare as CareMoment[]) : [];
  const commitmentProgress = progressOf(body.commitmentProgress);
  return {
    recentCare,
    summary: {
      callsMade: count(summary.callsMade) ?? 0,
      messagesSent: count(summary.messagesSent) ?? 0,
      remindersKept: count(summary.remindersKept) ?? 0,
      commitmentsFulfilled: count(summary.commitmentsFulfilled) ?? commitmentProgress?.kept ?? null,
    },
    commitmentProgress,
    totalActions: count(body.totalActions) ?? recentCare.length,
  };
}
