/**
 * Money memory connects to the stores that already own a concept instead of
 * keeping a parallel copy:
 *
 * - Savings goals are aspirations (level 'goal', category 'financial'), the
 *   same place legacy `profile.goals` financial goals were migrated to. The
 *   finance item keeps only the money side (amount, how it's going) and the
 *   goal's id. An existing goal with an overlapping title is reused.
 * - Bills with a due day get their next due date in important dates
 *   (kind 'deadline', subtype 'bill'), so they are reminded like any date.
 *   The key is stable per bill; each refresh moves it to the next due day.
 *
 * Every function here never throws.
 *
 * @module services/finance-memory/links
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { FinanceItem, FinanceTombstoneReason } from './types.js';

const log = createLogger({ module: 'FinanceMemoryLinks' });

const DAY = 86_400_000;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "house" → "Save for a house"; "emergency fund" → "Build an emergency fund". */
export function savingsGoalTitle(subject: string): string {
  const s = subject.trim();
  if (/emergency fund|rainy day/.test(s)) return 'Build an emergency fund';
  if (/^(retirement|college|university|school|tuition)/.test(s)) return `Save for ${s}`;
  if (/^(a|an|the|my|our)\s/.test(s)) return `Save for ${s.replace(/^my\s/, '')}`;
  return `Save for ${/^[aeiou]/.test(s) ? 'an' : 'a'} ${s}`;
}

/** Next calendar day (YYYY-MM-DD, UTC) that falls on `dueDay` (clamped to month length). */
export function nextDueDate(dueDay: number, now: Date = new Date()): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let offset = 0; offset < 2; offset++) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + offset;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const candidate = Date.UTC(y, m, Math.min(dueDay, last));
    if (candidate >= today) return new Date(candidate).toISOString().slice(0, 10);
  }
  return new Date(today + 30 * DAY).toISOString().slice(0, 10);
}

/**
 * Find or create the aspiration goal for a savings item. Returns the link to
 * store, or null when there's nothing to link (tombstoned goal, failure).
 */
export async function linkSavingsGoal(
  userId: string,
  item: FinanceItem
): Promise<{ aspirationId: string; aspirationCreated: boolean } | null> {
  if (item.kind !== 'savings' || item.aspirationId) return null;
  try {
    const asp = await import('../aspirations/index.js');
    const title = savingsGoalTitle(item.subject);
    const goals = await asp.listAspirations(userId, { level: 'goal' });
    if (goals.success) {
      const match = goals.data.find(
        (g) =>
          g.status !== 'let-go' &&
          (asp.titlesOverlap(g.title, title) || asp.titlesOverlap(g.title, item.subject))
      );
      if (match) return { aspirationId: match.id, aspirationCreated: false };
    }
    const result = await asp.upsertAspiration(userId, {
      level: 'goal',
      title,
      category: 'financial',
      source: item.source === 'inferred' ? 'inferred' : 'explicit',
      confidence: item.confidence,
      sourceConversationIds: [...item.sourceConversationIds],
    });
    if (!result.success || result.data.status === 'skipped_tombstoned') return null;
    return { aspirationId: result.data.id, aspirationCreated: result.data.status === 'created' };
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not link savings goal');
    return null;
  }
}

/** Create or move the bill's important date to its next due day. Returns the date id. */
export async function syncBillDate(
  userId: string,
  item: FinanceItem,
  now: Date = new Date()
): Promise<string | undefined> {
  if (item.kind !== 'bill' || !item.dueDay || item.status === 'done') return item.dateId;
  try {
    const dates = await import('../important-dates/index.js');
    const input = {
      key: `deadline:bill:${item.subject}`,
      title: `${cap(item.subject.replace(/\s+bill$/, ''))} due`,
      date: nextDueDate(item.dueDay, now),
      recurring: false,
      kind: 'deadline' as const,
      source: item.userEdited || item.source === 'user' ? ('user' as const) : ('detected' as const),
      sourceConversationIds: [...item.sourceConversationIds],
      confidence: item.confidence,
      subtype: 'bill',
    };
    const id = dates.importantDateIdFor(input.key);
    const existing = await dates.getImportantDate(userId, id);
    if (existing.success && existing.data.date === input.date) return id;
    const result = await dates.upsertImportantDate(userId, input);
    if (!result.success || result.data.status === 'skipped_tombstoned') return undefined;
    return id;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Bill date sync failed');
    return item.dateId;
  }
}

/**
 * Clean up after a deleted item: its bill reminder always goes; the savings
 * goal goes only when money memory created it and `withGoal` is set (the user
 * asked to delete their money memories). A goal the user made stays.
 */
export async function removeLinks(
  userId: string,
  item: FinanceItem,
  reason: FinanceTombstoneReason,
  opts: { withGoal?: boolean } = {}
): Promise<void> {
  const tomb = reason === 'voice_forget' ? 'voice_forget' : 'user_deleted';
  if (item.dateId) {
    try {
      const { deleteImportantDate } = await import('../important-dates/index.js');
      await deleteImportantDate(userId, item.dateId, tomb);
    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Could not remove bill reminder');
    }
  }
  if (opts.withGoal && item.aspirationId && item.aspirationCreated) {
    try {
      const asp = await import('../aspirations/index.js');
      const goal = await asp.getAspiration(userId, item.aspirationId);
      if (goal.success && !goal.data.userEdited) {
        await asp.deleteAspiration(userId, item.aspirationId, tomb);
      }
    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Could not remove savings goal');
    }
  }
}
