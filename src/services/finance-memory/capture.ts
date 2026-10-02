/**
 * Learning money memory from conversations (only with Money consent).
 *
 * Sources, in order of trust:
 * 1. What the user said, in their own words (detect.ts), buffered per turn
 *    and written at most once a minute and when the conversation is
 *    summarized → `explicit` (the only source that may keep an amount).
 * 2. Facts deep extraction labelled `finance` for this conversation
 *    (`dynamic_facts`, read-only) → `inferred`, with `sourceFactIds`, no amounts.
 *
 * With Money off nothing is buffered or written, and switching it off drops
 * whatever is buffered at once.
 *
 * @module services/finance-memory/capture
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isCategoryEnabled, onConsentChange } from '../memory-consent/store.js';
import { detectFinanceMentions, type FinanceMention } from './detect.js';
import { factToMention } from './facts-mapping.js';
import { linkSavingsGoal, syncBillDate } from './links.js';
import { listFinanceItems, setFinanceLinks, upsertFinanceItem } from './store.js';
import { USERS_COLLECTION, type FinanceItem, type FinanceUpsertOutcome } from './types.js';

const log = createLogger({ module: 'FinanceMemoryCapture' });

const FLUSH_EVERY_MS = 60_000;
const MAX_BUFFERS = 2_000;

interface Buffer {
  readonly mentions: Map<string, FinanceMention>;
  lastFlushAt: number;
}

/** userId → conversationId → pending mentions. */
const buffers = new Map<string, Map<string, Buffer>>();

const realUser = (userId: string): boolean => Boolean(userId) && userId !== 'anonymous';
const keyOf = (m: FinanceMention): string => `${m.kind}|${m.subject}`;

/** Forget everything buffered for a user (consent switched off). */
export function dropFinanceBuffers(userId: string): void {
  buffers.delete(userId);
}

/** Tests. */
export function clearFinanceBuffers(): void {
  buffers.clear();
}

export function bufferedFinanceCount(userId: string): number {
  let n = 0;
  for (const b of buffers.get(userId)?.values() ?? []) n += b.mentions.size;
  return n;
}

// Money switched off in this process: forget anything not yet written.
onConsentChange((userId, category, enabled) => {
  if (category === 'finances' && !enabled) dropFinanceBuffers(userId);
});

function bufferFor(userId: string, conversationId: string): Buffer {
  let perUser = buffers.get(userId);
  if (!perUser) {
    if (buffers.size >= MAX_BUFFERS) {
      const oldest = buffers.keys().next().value;
      if (oldest !== undefined) buffers.delete(oldest);
    }
    perUser = new Map();
    buffers.set(userId, perUser);
  }
  let buffer = perUser.get(conversationId);
  if (!buffer) {
    buffer = { mentions: new Map(), lastFlushAt: Date.now() };
    perUser.set(conversationId, buffer);
  }
  return buffer;
}

function takeBuffer(userId: string, conversationId: string): FinanceMention[] {
  const perUser = buffers.get(userId);
  const buffer = perUser?.get(conversationId);
  if (!perUser || !buffer) return [];
  perUser.delete(conversationId);
  if (perUser.size === 0) buffers.delete(userId);
  return [...buffer.mentions.values()];
}

/** Write one item and connect it to its goal / reminder. */
async function apply(
  userId: string,
  mention: FinanceMention,
  source: 'explicit' | 'inferred',
  conversationId?: string,
  factId?: string
): Promise<FinanceUpsertOutcome> {
  const { amount, ...rest } = mention;
  const r = await upsertFinanceItem(userId, {
    ...rest,
    ...(source === 'explicit' && amount ? { amount } : {}),
    source,
    ...(conversationId ? { conversationId } : {}),
    ...(factId ? { factId } : {}),
  });
  if ((r.outcome === 'created' || r.outcome === 'updated') && r.item) {
    await connect(userId, r.item);
  }
  return r.outcome;
}

async function connect(userId: string, item: FinanceItem): Promise<void> {
  const goal = await linkSavingsGoal(userId, item);
  const dateId = await syncBillDate(userId, item);
  await setFinanceLinks(userId, item.id, {
    ...(goal ?? {}),
    ...(dateId && dateId !== item.dateId ? { dateId } : {}),
  });
}

/** Write what's buffered for a conversation. Never throws. Returns items written. */
export async function flushFinanceBuffer(userId: string, conversationId: string): Promise<number> {
  const pending = takeBuffer(userId, conversationId);
  let written = 0;
  for (const m of pending) {
    const outcome = await apply(userId, m, 'explicit', conversationId);
    if (outcome === 'created' || outcome === 'updated') written++;
  }
  return written;
}

/**
 * Per user turn (voice transcript handler, next to preference capture).
 * Detects money things the user said and buffers them. Never throws.
 */
export async function recordUserTurnFinances(
  userId: string,
  text: string,
  conversationId?: string
): Promise<number> {
  if (!realUser(userId) || !text || text.length < 6) return 0;
  try {
    const mentions = detectFinanceMentions(text);
    if (mentions.length === 0) return 0;
    if (!(await isCategoryEnabled(userId, 'finances'))) {
      dropFinanceBuffers(userId);
      return 0;
    }
    const conv = conversationId ?? 'live';
    const buffer = bufferFor(userId, conv);
    for (const m of mentions) buffer.mentions.set(keyOf(m), m);
    if (Date.now() - buffer.lastFlushAt >= FLUSH_EVERY_MS) await flushFinanceBuffer(userId, conv);
    return mentions.length;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Finance turn capture failed');
    return 0;
  }
}

async function financeFactsFor(
  userId: string,
  conversationId: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const fs = getFirestoreDb();
  if (!fs) return [];
  try {
    const snap = await fs
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('dynamic_facts')
      .where('sourceConversationIds', 'array-contains', conversationId)
      .limit(200)
      .get();
    return snap.docs.map((d) => ({ id: d.id, data: (d.data() ?? {}) as Record<string, unknown> }));
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Could not read finance facts');
    return [];
  }
}

/** Move every active bill's reminder to its next due day. Never throws. */
export async function refreshBillDates(userId: string): Promise<number> {
  let moved = 0;
  for (const item of await listFinanceItems(userId)) {
    if (item.kind !== 'bill' || !item.dueDay || item.status === 'done') continue;
    const dateId = await syncBillDate(userId, item);
    if (dateId && dateId !== item.dateId) {
      await setFinanceLinks(userId, item.id, { dateId });
      moved++;
    }
  }
  return moved;
}

/**
 * Conversation summarized (session end or catch-up). Never throws.
 * With Money off: nothing is stored and buffers are dropped.
 */
export async function onConversationSummarized(
  userId: string,
  conversationId: string,
  _summary: string,
  turns: ReadonlyArray<{ role: string; text: string }>
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const tally = (o: FinanceUpsertOutcome) => {
    counts[o] = (counts[o] ?? 0) + 1;
  };
  try {
    if (!realUser(userId)) return counts;
    if (!(await isCategoryEnabled(userId, 'finances'))) {
      dropFinanceBuffers(userId);
      return { not_consented: 1 };
    }
    const mentions = new Map<string, FinanceMention>();
    // Everything buffered for this user (live turns are keyed by session id).
    for (const conv of [...(buffers.get(userId)?.keys() ?? [])]) {
      for (const m of takeBuffer(userId, conv)) mentions.set(keyOf(m), m);
    }
    for (const turn of turns) {
      if (turn.role !== 'user' || !turn.text) continue;
      for (const m of detectFinanceMentions(turn.text)) mentions.set(keyOf(m), m);
    }
    for (const m of mentions.values()) tally(await apply(userId, m, 'explicit', conversationId));

    for (const fact of await financeFactsFor(userId, conversationId)) {
      const m = factToMention(fact.data);
      if (m) tally(await apply(userId, m, 'inferred', conversationId, fact.id));
    }
    counts.billsMoved = await refreshBillDates(userId);
    log.debug({ userId, conversationId, counts }, 'Money memory learned from conversation');
  } catch (error) {
    log.warn({ userId, conversationId, error: String(error) }, 'Finance capture failed');
  }
  return counts;
}
