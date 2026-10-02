/**
 * Money memory as seen by memory control and consent: deletes and cascades,
 * export, voice-forget search. (Registration lives in
 * services/memory-control/builtin-domains.ts and
 * services/memory-consent/builtin-category-stores.ts.)
 *
 * @module services/finance-memory/lifecycle
 */

import { getConsent } from '../memory-consent/store.js';
import { removeLinks } from './links.js';
import {
  deleteAllFinanceItems,
  deleteFinanceItem,
  listFinanceItems,
  setFinanceProvenance,
} from './store.js';
import type { FinanceItem, FinanceTombstoneReason } from './types.js';

/** Delete one item (tombstoned) and its bill reminder. */
export async function forgetFinanceItem(
  userId: string,
  id: string,
  reason: FinanceTombstoneReason
): Promise<boolean> {
  const item = await deleteFinanceItem(userId, id, reason);
  if (!item) return false;
  await removeLinks(userId, item, reason);
  return true;
}

/**
 * Remove a source (conversation or fact) from every item; an automated item
 * left with no source is deleted and tombstoned. User-edited items stay.
 */
async function removeProvenance(
  userId: string,
  field: 'sourceConversationIds' | 'sourceFactIds',
  ids: readonly string[],
  reason: FinanceTombstoneReason
): Promise<number> {
  if (ids.length === 0) return 0;
  let changed = 0;
  for (const item of await listFinanceItems(userId)) {
    const list = item[field];
    if (!list.some((x) => ids.includes(x))) continue;
    const remaining = list.filter((x) => !ids.includes(x));
    const other =
      field === 'sourceConversationIds' ? item.sourceFactIds : item.sourceConversationIds;
    if (
      !item.userEdited &&
      item.source !== 'user' &&
      remaining.length === 0 &&
      other.length === 0
    ) {
      if (await forgetFinanceItem(userId, item.id, reason)) changed++;
      continue;
    }
    await setFinanceProvenance(userId, item.id, field, remaining);
    changed++;
  }
  return changed;
}

export function deleteFinanceFor(userId: string, conversationId: string): Promise<number> {
  return removeProvenance(
    userId,
    'sourceConversationIds',
    [conversationId],
    'conversation_deleted'
  );
}

export function deleteFinanceDerivedFromFacts(
  userId: string,
  factIds: readonly string[]
): Promise<number> {
  return removeProvenance(userId, 'sourceFactIds', factIds, 'fact_deleted');
}

/**
 * Wipe all money memory. `withGoals`: also remove savings goals that money
 * memory created (the user asked to delete their money memories); delete-all
 * of every memory doesn't need it because aspirations are wiped by their own domain.
 */
export async function deleteAllFinance(
  userId: string,
  opts: { withGoals?: boolean } = {}
): Promise<number> {
  const items = await deleteAllFinanceItems(userId);
  for (const item of items) {
    await removeLinks(userId, item, 'user_deleted', { withGoal: opts.withGoals === true });
  }
  return items.length;
}

export interface FinanceMemoryExport {
  readonly enabled: boolean;
  readonly items: readonly FinanceItem[];
  readonly exportedAt: string;
}

/** Everything money memory holds (export is the user's right whatever the switch says). */
export async function exportFinanceMemory(userId: string): Promise<FinanceMemoryExport> {
  const [consent, items] = await Promise.all([
    getConsent(userId, { fresh: true }),
    listFinanceItems(userId),
  ]);
  return {
    enabled: consent.success && consent.data.categories.finances.enabled,
    items,
    exportedAt: new Date().toISOString(),
  };
}

/** Money items matching a spoken description ("my debt", "the car loan"). */
export async function findFinanceMemory(
  userId: string,
  query: string
): Promise<Array<{ id: string; label: string; score: number }>> {
  const { matchScore, tokenize } = await import('../memory-control/find.js');
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const generic = /\b(money|finances?|financial)\b/i.test(query);
  return (await listFinanceItems(userId))
    .map((i) => ({
      id: i.id,
      label: `the money note "${i.text}"`,
      score: Math.max(
        matchScore(tokens, `${i.subject} ${i.text} ${i.kind}`),
        // "forget what I told you about money" matches every money note.
        generic && tokens.length <= 3 ? 0.6 : 0
      ),
    }))
    .filter((m) => m.score >= 0.5);
}
