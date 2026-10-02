/**
 * Capture: turning what the user says into aspirations.
 *
 *   captureFromUtterance(userId, text, ctx)   live, per user turn (explicit)
 *   onConversationSummarized(userId, conversationId, summary, turns)
 *       after a conversation is summarized: first-person statements in the
 *       user's turns are explicit; third-person summary sentences are
 *       inferred and only become commitments with repeated evidence
 *       (see isConfirmed in types.ts).
 *
 * Neither throws; failures are logged.
 *
 * @module services/aspirations/capture
 */

import { createLogger } from '../../utils/safe-logger.js';
import { addDays, formatCivil, localToday } from '../important-dates/date-math.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { recordCheckIn } from './check-ins.js';
import {
  detectInSummary,
  detectInUtterance,
  matchItems,
  type DetectedAspiration,
} from './detection.js';
import { titlesOverlap } from './identity.js';
import { listAspirations, saveAspiration, upsertAspiration } from './store.js';
import type { AspirationRecord, AspirationSource, AspirationStatus } from './types.js';

const log = createLogger({ module: 'aspirations:capture' });

export interface CaptureContext {
  conversationId?: string;
  personaId?: string;
  now?: Date;
}

export interface CaptureResult {
  upserted: string[];
  checkIns: string[];
  statusChanges: string[];
}

const empty = (): CaptureResult => ({ upserted: [], checkIns: [], statusChanges: [] });

/** Reuse an existing item's title when the new one is a looser phrasing of it. */
function canonicalTitle(item: DetectedAspiration, existing: readonly AspirationRecord[]): string {
  const same = existing.find((r) => r.level === item.level && titlesOverlap(r.title, item.title));
  return same ? same.title : item.title;
}

async function upsertDetected(
  userId: string,
  item: DetectedAspiration,
  source: AspirationSource,
  existing: readonly AspirationRecord[],
  ctx: CaptureContext
): Promise<string | null> {
  const out = await upsertAspiration(userId, {
    level: item.level,
    title: canonicalTitle(item, existing),
    source,
    confidence: item.confidence,
    ...(ctx.conversationId ? { sourceConversationIds: [ctx.conversationId] } : {}),
    ...(ctx.personaId ? { personaId: ctx.personaId } : {}),
    ...(item.level === 'habit'
      ? {
          habit: {
            schedule: {
              frequency: item.frequency ?? 'daily',
              ...(item.days ? { days: item.days } : {}),
            },
          },
        }
      : {}),
  });
  if (!out.success) {
    log.warn({ userId, error: out.error.message }, 'Aspiration capture failed');
    return null;
  }
  return out.data.status === 'skipped_tombstoned' ? null : out.data.id;
}

async function setStatus(
  userId: string,
  r: AspirationRecord,
  status: AspirationStatus
): Promise<boolean> {
  if (r.status === status) return false;
  const now = new Date().toISOString();
  const saved = await saveAspiration(userId, {
    ...r,
    status,
    statusChangedAt: now,
    updatedAt: now,
    lastMentionedAt: now,
  });
  return saved.success;
}

/** Live capture from one user turn. */
export async function captureFromUtterance(
  userId: string,
  text: string,
  ctx: CaptureContext = {}
): Promise<CaptureResult> {
  const result = empty();
  if (!userId || !text || text.length > 2000) return result;
  const events = detectInUtterance(text);
  if (events.length === 0) return result;
  try {
    const listed = await listAspirations(userId);
    const items = listed.success ? listed.data : [];
    const open = items.filter((r) => r.status !== 'let-go' && r.status !== 'achieved');
    for (const e of events) {
      if (e.kind === 'aspiration') {
        const id = await upsertDetected(userId, e.item, 'explicit', items, ctx);
        if (id) result.upserted.push(id);
      } else if (e.kind === 'check-in') {
        const [habit] = matchItems(e.phrase, open, 'habit');
        if (!habit) continue;
        const now = ctx.now ?? new Date();
        const today = localToday(now, await resolveTimeZone(userId));
        const date = formatCivil(e.yesterday ? addDays(today, -1) : today);
        const saved = await recordCheckIn(
          userId,
          habit.id,
          {
            status: e.status,
            date,
            ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
          },
          now
        );
        if (saved.success) result.checkIns.push(habit.id);
      } else {
        const candidates = e.phrase
          ? matchItems(e.phrase, open, e.kind === 'let-go' ? e.level : undefined)
          : open.filter((r) =>
              e.kind === 'let-go' ? r.level === (e.level ?? 'dream') : r.level === 'goal'
            );
        // Only act when it's clear which one they mean.
        if (candidates.length !== 1 && !(e.phrase && candidates.length > 0)) continue;
        const target = candidates[0];
        if (await setStatus(userId, target, e.kind === 'let-go' ? 'let-go' : 'achieved')) {
          result.statusChanges.push(target.id);
        }
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Aspiration capture skipped');
  }
  return result;
}

export type SummaryInput =
  | string
  | { keyPoints?: string[]; mainTopics?: string[]; text?: string; summary?: string };
export interface SummaryTurn {
  role: 'user' | 'assistant' | string;
  text?: string;
  content?: string;
}

function summaryText(summary: SummaryInput): string {
  if (typeof summary === 'string') return summary;
  return [summary.text, summary.summary, ...(summary.keyPoints ?? [])].filter(Boolean).join('\n');
}

/**
 * Hook for the capture pipeline (Agent A's summarizer calls this once per
 * summarized conversation). Idempotent per conversation: re-running adds no
 * new evidence because evidence counts once per conversation id.
 */
export async function onConversationSummarized(
  userId: string,
  conversationId: string,
  summary: SummaryInput,
  turns: readonly SummaryTurn[] = []
): Promise<CaptureResult> {
  const result = empty();
  if (!userId || !conversationId) return result;
  try {
    const listed = await listAspirations(userId);
    const items = listed.success ? listed.data : [];
    const ctx: CaptureContext = { conversationId };
    const seen = new Set<string>();
    for (const turn of turns) {
      if (turn.role !== 'user') continue;
      for (const e of detectInUtterance(turn.text ?? turn.content ?? '')) {
        if (e.kind !== 'aspiration') continue; // check-ins/let-gos are live-only (their day is now)
        const id = await upsertDetected(userId, e.item, 'explicit', items, ctx);
        if (id && !seen.has(id)) {
          seen.add(id);
          result.upserted.push(id);
        }
      }
    }
    for (const item of detectInSummary(summaryText(summary))) {
      const id = await upsertDetected(userId, item, 'inferred', items, ctx);
      if (id && !seen.has(id)) {
        seen.add(id);
        result.upserted.push(id);
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId, conversationId }, 'Summary capture skipped');
  }
  return result;
}
