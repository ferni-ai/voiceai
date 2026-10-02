/**
 * Learning health memory from conversations (only with Health consent).
 *
 * Sources, in order of trust:
 * 1. What the user said, in their own words (detect.ts) → `explicit`.
 * 2. Facts deep extraction labelled `health` for this conversation
 *    (`bogle_users/{uid}/dynamic_facts`, read-only) → `inferred`, with
 *    `sourceFactIds` so deleting the fact removes what came from it.
 * 3. Logging tools ("log a headache") → `tool`.
 *
 * Mood readings buffered during the call are written at the same moment.
 *
 * @module services/health-memory/capture
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isCategoryEnabled } from '../memory-consent/store.js';
import { detectHealthMentions } from './detect.js';
import { flushMoodTimeline } from './mood-timeline.js';
import { upsertHealthItem } from './store.js';
import { USERS_COLLECTION, type HealthKind, type HealthUpsertOutcome } from './types.js';

const log = createLogger({ module: 'HealthMemoryCapture' });

const SELF = /^(user|me|self|i|myself|the user)$/i;

/** Map an extracted health fact's key onto a health kind. */
export function kindForFactKey(key: string, value: string): HealthKind {
  const k = `${key} ${value}`.toLowerCase();
  if (/medic|takes|prescri|\bmg\b|dose|pill/.test(k)) return 'medication';
  if (/appointment|visit|check-?up/.test(k)) return 'appointment';
  if (/injur|sprain|fractur|broke/.test(k)) return 'injury';
  if (/symptom|pain|ache|fever|nausea/.test(k)) return 'symptom';
  if (/sleep|insomnia/.test(k)) return 'sleep';
  if (/exercise|workout|run|gym|yoga|walk|swim/.test(k)) return 'exercise';
  if (/energy|tired|fatigue|exhaust/.test(k)) return 'energy';
  return 'condition';
}

interface FactRow {
  readonly id: string;
  readonly text: string;
  readonly key: string;
  readonly value: string;
  readonly confidence: number;
}

async function healthFactsFor(userId: string, conversationId: string): Promise<FactRow[]> {
  const fs = getFirestoreDb();
  if (!fs) return [];
  const snap = await fs
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection('dynamic_facts')
    .where('sourceConversationIds', 'array-contains', conversationId)
    .limit(200)
    .get();
  const rows: FactRow[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() ?? {};
    const isHealth = d.category === 'health' || d.factType === 'health';
    const entity = typeof d.entityName === 'string' ? d.entityName : 'user';
    if (!isHealth || !SELF.test(entity.trim())) continue;
    const value = typeof d.value === 'string' ? d.value : '';
    const text = typeof d.text === 'string' ? d.text : value;
    if (!value && !text) continue;
    rows.push({
      id: doc.id,
      text,
      key: typeof d.key === 'string' ? d.key : '',
      value: value || text,
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.6,
    });
  }
  return rows;
}

function tally(counts: Record<string, number>, outcome: HealthUpsertOutcome): void {
  counts[outcome] = (counts[outcome] ?? 0) + 1;
}

/**
 * Conversation summarized (session end or catch-up). Never throws.
 * With Health off: nothing is stored and any buffered mood is dropped.
 */
export async function onConversationSummarized(
  userId: string,
  conversationId: string,
  _summary: string,
  turns: ReadonlyArray<{ role: string; text: string }>
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    if (!(await isCategoryEnabled(userId, 'health'))) {
      await flushMoodTimeline(userId, conversationId); // drops buffers: consent is checked on write
      return { not_consented: 1 };
    }
    for (const turn of turns) {
      if (turn.role !== 'user' || !turn.text) continue;
      for (const m of detectHealthMentions(turn.text)) {
        const r = await upsertHealthItem(userId, { ...m, source: 'explicit', conversationId });
        tally(counts, r.outcome);
      }
    }
    for (const fact of await healthFactsFor(userId, conversationId)) {
      const r = await upsertHealthItem(userId, {
        kind: kindForFactKey(fact.key, fact.value),
        subject: fact.value,
        text: fact.text,
        confidence: Math.min(0.9, fact.confidence),
        source: 'inferred',
        conversationId,
        factId: fact.id,
      });
      tally(counts, r.outcome);
    }
    counts.moodConversations = await flushMoodTimeline(userId, conversationId);
    log.debug({ userId, conversationId, counts }, 'Health memory learned from conversation');
  } catch (error) {
    log.warn({ userId, conversationId, error: String(error) }, 'Health capture failed');
  }
  return counts;
}

/** A logging tool recorded something ("log a headache", "log my run"). Never throws. */
export async function recordHealthFromTool(
  userId: string,
  entry: { kind: HealthKind; subject: string; text: string; conversationId?: string }
): Promise<HealthUpsertOutcome> {
  if (!userId || userId === 'anonymous') return 'not_consented';
  const r = await upsertHealthItem(userId, { ...entry, confidence: 0.95, source: 'tool' });
  return r.outcome;
}
