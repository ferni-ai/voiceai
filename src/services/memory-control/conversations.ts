/**
 * Conversations: list, read (full transcript, both roles) and cascading delete.
 *
 * Cascade for deleteConversation (see docs/architecture/USER-MEMORY-CONTROL.md):
 * turns → thread(s) tied to the conversation → its summaries + summary
 * embeddings → extraction history → provenance on facts/entities/relationships
 * (a fact whose last source is removed and that the user never edited is
 * deleted and tombstoned) → the conversation doc.
 *
 * @module services/memory-control/conversations
 */

import type { DocumentData, DocumentReference, Firestore } from '@google-cloud/firestore';
import { err, ok } from '../../memory/result.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  asString,
  deleteQuery,
  getDb,
  removeDoc,
  toIso,
  userCollection,
  userRef,
  writeDoc,
  type UndoJournal,
} from './db.js';
import { removeVectors, summaryVectorId } from './derived-stores.js';
import { factSources, notFound, removeFacts, unavailable } from './facts.js';
import type {
  ConversationDeletion,
  ConversationDetail,
  ConversationPage,
  ConversationSummary,
  ConversationTurnView,
  MemoryControlResult,
  TombstoneReason,
} from './types.js';

const log = createLogger({ module: 'MemoryControlConversations' });

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
const MAX_TURNS = 5000;
const MAX_THREADS = 200;

// ============================================================================
// MAPPING
// ============================================================================

export function toConversationSummary(id: string, data: DocumentData): ConversationSummary {
  const summary: ConversationSummary = {
    id,
    startedAt: toIso(data.startedAt ?? data.createdAt),
    turnCount: typeof data.turnCount === 'number' ? data.turnCount : 0,
  };
  const endedAt = toIso(data.endedAt);
  const personaId = asString(data.personaId);
  const text = asString(data.summary);
  if (endedAt) summary.endedAt = endedAt;
  if (personaId) summary.personaId = personaId;
  if (text) summary.summary = text;
  return summary;
}

function toRole(value: unknown): 'user' | 'assistant' {
  return value === 'user' || value === 'human' ? 'user' : 'assistant';
}

export function toTurn(data: DocumentData): ConversationTurnView {
  return {
    role: toRole(data.role),
    text: asString(data.text) ?? asString(data.content) ?? '',
    timestamp: toIso(data.timestamp),
  };
}

function turnOrder(a: DocumentData, b: DocumentData): number {
  const ta = toIso(a.timestamp) ?? '';
  const tb = toIso(b.timestamp) ?? '';
  if (ta !== tb) return ta.localeCompare(tb);
  const na = typeof a.turnNumber === 'number' ? a.turnNumber : 0;
  const nb = typeof b.turnNumber === 'number' ? b.turnNumber : 0;
  return na - nb;
}

// ============================================================================
// READ
// ============================================================================

export async function listConversations(
  userId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<MemoryControlResult<ConversationPage>> {
  const db = getDb();
  if (!db) return err(unavailable);
  const limit = Math.min(
    Math.max(Math.floor(options.limit ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE
  );
  const collection = userCollection(db, userId, 'conversations');

  let query = collection.orderBy('startedAt', 'desc');
  if (options.cursor) {
    const cursorSnap = await collection.doc(options.cursor).get();
    if (!cursorSnap.exists) return err({ code: 'invalid', message: 'Unknown cursor' });
    query = query.startAfter(cursorSnap);
  }
  const snapshot = await query.limit(limit + 1).get();
  const docs = snapshot.docs.slice(0, limit);
  const page: ConversationPage = {
    conversations: docs.map((d) => toConversationSummary(d.id, d.data())),
  };
  if (snapshot.docs.length > limit && docs.length > 0) page.nextCursor = docs[docs.length - 1].id;
  return ok(page);
}

export async function getConversation(
  userId: string,
  conversationId: string
): Promise<MemoryControlResult<ConversationDetail>> {
  const db = getDb();
  if (!db) return err(unavailable);
  const ref = userCollection(db, userId, 'conversations').doc(conversationId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) return err(notFound);

  const turnsSnap = await ref.collection('turns').limit(MAX_TURNS).get();
  const turns = turnsSnap.docs
    .map((d) => d.data())
    .sort(turnOrder)
    .map(toTurn);
  const conversation = toConversationSummary(snap.id, data);
  if (conversation.turnCount < turns.length) conversation.turnCount = turns.length;
  return ok({ conversation, turns });
}

/** Most recent conversation, preferring finished ones (the live call is not "our last conversation"). */
export async function findLatestConversation(
  userId: string,
  excludeId?: string
): Promise<ConversationSummary | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await userCollection(db, userId, 'conversations')
    .orderBy('startedAt', 'desc')
    .limit(5)
    .get();
  const candidates = snap.docs
    .filter((d) => d.id !== excludeId)
    .map((d) => toConversationSummary(d.id, d.data()));
  // Without an ended one, skip the newest: it is most likely the call in progress.
  return candidates.find((c) => c.endedAt) ?? (excludeId ? candidates[0] : candidates[1]) ?? null;
}

// ============================================================================
// CASCADE DELETE
// ============================================================================

async function matchingDocs(
  db: Firestore,
  userId: string,
  collection: string,
  ids: readonly string[],
  fields: readonly string[],
  arrayField?: string
): Promise<Map<string, { ref: DocumentReference; data: DocumentData }>> {
  const found = new Map<string, { ref: DocumentReference; data: DocumentData }>();
  const col = userCollection(db, userId, collection);
  for (const id of ids) {
    const queries = fields.map((f) => col.where(f, '==', id));
    if (arrayField) queries.push(col.where(arrayField, 'array-contains', id));
    for (const q of queries) {
      const snap = await q.get();
      for (const d of snap.docs) found.set(d.id, { ref: d.ref, data: d.data() });
    }
  }
  return found;
}

/**
 * Remove `ids` from the provenance of facts, entities and relationships.
 * Records left with no source are deleted (facts: only when not user-edited,
 * and tombstoned). Returns facts deleted plus fact embeddings removed.
 */
async function cascadeProvenance(
  db: Firestore,
  userId: string,
  ids: readonly string[],
  reason: TombstoneReason,
  journal?: UndoJournal
): Promise<{ facts: number; embeddings: number }> {
  const idSet = new Set(ids);
  const toDeleteFacts: Array<{ ref: DocumentReference; data: DocumentData }> = [];

  for (const collection of ['dynamic_facts', 'dynamic_entities', 'dynamic_relationships']) {
    const docs = await matchingDocs(
      db,
      userId,
      collection,
      ids,
      ['sessionId'],
      'sourceConversationIds'
    );
    for (const { ref, data } of docs.values()) {
      const remaining = factSources(data).filter((s) => !idSet.has(s));
      const isFact = collection === 'dynamic_facts';
      if (remaining.length === 0 && !(isFact && data.userEdited === true)) {
        if (isFact) toDeleteFacts.push({ ref, data });
        else await removeDoc(ref, journal, data);
        continue;
      }
      const updated: DocumentData = { ...data, sourceConversationIds: remaining };
      if (typeof data.sessionId === 'string' && idSet.has(data.sessionId)) delete updated.sessionId;
      await writeDoc(ref, updated, journal, data);
    }
  }

  const { removed, embeddings } = await removeFacts(db, userId, toDeleteFacts, reason, journal);
  return { facts: removed, embeddings };
}

/** Threads tied to the conversation (by ID or a session/conversation field), with messages. */
async function deleteThreads(
  db: Firestore,
  userId: string,
  ids: readonly string[],
  journal?: UndoJournal
): Promise<number> {
  const idSet = new Set(ids);
  const snap = await userCollection(db, userId, 'conversation_threads').limit(MAX_THREADS).get();
  let removed = 0;
  for (const thread of snap.docs) {
    const data = thread.data();
    const linked =
      idSet.has(thread.id) ||
      idSet.has(asString(data.sessionId) ?? '') ||
      idSet.has(asString(data.conversationId) ?? '');
    if (linked) {
      removed += await deleteQuery(thread.ref.collection('messages'), journal);
      await removeDoc(thread.ref, journal, data);
      continue;
    }
    for (const field of ['sessionId', 'conversationId']) {
      for (const id of ids) {
        removed += await deleteQuery(
          thread.ref.collection('messages').where(field, '==', id),
          journal
        );
      }
    }
  }
  return removed;
}

/** Drop the conversation's entries from the profile's embedded summary list. */
async function scrubProfile(
  db: Firestore,
  userId: string,
  ids: readonly string[],
  journal?: UndoJournal
): Promise<void> {
  const ref = userRef(db, userId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data || !Array.isArray(data.conversationSummaries)) return;
  const idSet = new Set(ids);
  const list = data.conversationSummaries as DocumentData[];
  const kept = list.filter(
    (s) => !idSet.has(asString(s?.sessionId) ?? '') && !idSet.has(asString(s?.id) ?? '')
  );
  if (kept.length === list.length) return;
  const updated: DocumentData = { ...data, conversationSummaries: kept };
  // The quick-access copy described the newest summary; drop it if that one went.
  if (kept[kept.length - 1] !== list[list.length - 1]) delete updated.lastConversationSummary;
  await writeDoc(ref, updated, journal, data);
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
  options: { reason?: TombstoneReason; journal?: UndoJournal } = {}
): Promise<MemoryControlResult<{ deleted: ConversationDeletion }>> {
  const db = getDb();
  if (!db) return err(unavailable);
  const { reason = 'user_deleted', journal } = options;

  const ref = userCollection(db, userId, 'conversations').doc(conversationId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) return err(notFound);

  // The voice session ID may differ from the conversation doc ID; both identify it.
  const ids = [
    ...new Set([conversationId, asString(data.sessionId), asString(data.conversationId)]),
  ].filter((v): v is string => Boolean(v));

  const turns = await deleteQuery(ref.collection('turns'), journal);
  await deleteThreads(db, userId, ids, journal);

  let embeddings = 0;
  for (const collection of ['summaries', 'conversation_summaries']) {
    const summaries = await matchingDocs(db, userId, collection, ids, [
      'sessionId',
      'conversationId',
    ]);
    for (const id of ids) {
      const direct = await userCollection(db, userId, collection).doc(id).get();
      const directData = direct.data();
      if (direct.exists && directData)
        summaries.set(direct.id, { ref: direct.ref, data: directData });
    }
    const vectorIds = new Set<string>();
    for (const { ref: summaryRef, data: summaryData } of summaries.values()) {
      vectorIds.add(summaryVectorId(summaryRef.id));
      const ownId = asString(summaryData.id);
      if (ownId) vectorIds.add(summaryVectorId(ownId));
      await removeDoc(summaryRef, journal, summaryData);
    }
    embeddings += await removeVectors(userId, [...vectorIds], journal);
  }

  const history = await matchingDocs(db, userId, 'extraction_history', ids, ['sessionId']);
  for (const h of history.values()) await removeDoc(h.ref, journal, h.data);

  const provenance = await cascadeProvenance(db, userId, ids, reason, journal);
  embeddings += provenance.embeddings;

  await scrubProfile(db, userId, ids, journal);

  await removeDoc(ref, journal, data);
  log.info({ conversationId, turns, facts: provenance.facts, embeddings }, 'Conversation deleted');
  return ok({ deleted: { turns, facts: provenance.facts, embeddings } });
}
