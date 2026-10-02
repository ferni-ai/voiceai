/**
 * Facts and people: list, edit, delete (with tombstones and derived-store cleanup).
 *
 * @module services/memory-control/facts
 */

import type { DocumentData, DocumentReference, Firestore } from '@google-cloud/firestore';
import { factIdFor } from '../../memory/dynamic/fact-identity.js';
import { err, ok } from '../../memory/result.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  asString,
  asStringArray,
  getDb,
  removeDoc,
  toIso,
  userCollection,
  writeDoc,
  type UndoJournal,
} from './db.js';
import {
  factVectorId,
  reindexVector,
  removeGraphRecords,
  removeVectors,
} from './derived-stores.js';
import {
  deleteExplicitFact,
  editExplicitFact,
  isExplicitId,
  listExplicitFacts,
} from './explicit-facts.js';
import type {
  Fact,
  MemoryControlResult,
  MemoryOverview,
  Person,
  TombstoneReason,
} from './types.js';

const log = createLogger({ module: 'MemoryControlFacts' });

const MAX_FACTS = 2000;
const MAX_PEOPLE = 1000;
export const MAX_FACT_TEXT = 500;
const SELF_SUBJECTS = new Set(['user', 'the user', 'me', 'i', 'self']);

export const unavailable = {
  code: 'unavailable',
  message: 'Memory storage is unavailable',
} as const;
export const notFound = { code: 'not_found', message: 'Not found' } as const;

// ============================================================================
// MAPPING
// ============================================================================

function humanize(key: string): string {
  return key.replace(/[_-]+/g, ' ').trim();
}

/** Human-readable text for a fact doc (new docs carry `text`; legacy ones key/value). */
export function factText(data: DocumentData): string {
  const text = asString(data.text);
  if (text) return text;
  const subject = asString(data.subject) ?? asString(data.entityName) ?? '';
  const key = asString(data.predicate) ?? asString(data.key) ?? '';
  const value = asString(data.value) ?? asString(data.content) ?? asString(data.fact) ?? '';
  const statement = key ? `${humanize(key)}: ${value}` : value;
  if (!subject || SELF_SUBJECTS.has(subject.toLowerCase())) return statement;
  return `${subject} · ${statement}`;
}

/** Conversation IDs a fact was learned from (legacy docs carry a single `sessionId`). */
export function factSources(data: DocumentData): string[] {
  const ids = asStringArray(data.sourceConversationIds);
  if (ids.length > 0) return ids;
  const legacy = asString(data.sessionId) ?? asString(data.conversationId);
  return legacy ? [legacy] : [];
}

export function toFact(id: string, data: DocumentData): Fact {
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5;
  return {
    id,
    text: factText(data),
    category: asString(data.category) ?? asString(data.factType) ?? 'general',
    confidence: Math.max(0, Math.min(1, confidence)),
    sourceConversationIds: factSources(data),
    userEdited: data.userEdited === true,
    updatedAt: toIso(
      data.updatedAt ?? data.editedAt ?? data.extractedAt ?? data.firstSeenAt ?? data.createdAt
    ),
  };
}

export function isPersonEntity(data: DocumentData): boolean {
  return typeof data.type === 'string' && data.type.toLowerCase() === 'person';
}

function attr(data: DocumentData, key: string): string | undefined {
  const attributes = data.attributes as Record<string, unknown> | undefined;
  return asString(data[key]) ?? asString(attributes?.[key]);
}

export function toPerson(id: string, data: DocumentData): Person {
  const person: Person = {
    id,
    name: asString(data.name) ?? 'Someone',
    updatedAt: toIso(data.updatedAt ?? data.lastMentioned ?? data.extractedAt ?? data.createdAt),
  };
  const relationship = attr(data, 'relationship');
  const notes = attr(data, 'notes');
  if (relationship) person.relationship = relationship;
  if (notes) person.notes = notes;
  return person;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Tombstone IDs for a fact doc: its own ID plus the deterministic key ID. */
export function tombstoneIdsFor(docId: string, data: DocumentData): string[] {
  const ids = new Set([docId]);
  const subject = asString(data.subject) ?? asString(data.entityName);
  const predicate = asString(data.predicate) ?? asString(data.key);
  if (subject && predicate) ids.add(factIdFor({ subject, predicate }));
  return [...ids];
}

export async function writeTombstones(
  db: Firestore,
  userId: string,
  ids: readonly string[],
  reason: TombstoneReason,
  journal?: UndoJournal
): Promise<void> {
  const createdAt = new Date();
  for (const id of ids) {
    const ref = userCollection(db, userId, 'memory_tombstones').doc(id);
    await writeDoc(ref, { createdAt, reason }, journal);
  }
}

// ============================================================================
// LIST
// ============================================================================

function byUpdatedDesc<T extends { updatedAt: string | null }>(a: T, b: T): number {
  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
}

/** People grouped by name: extraction may have written one doc per mention. */
export function groupPeople(docs: Array<{ id: string; data: DocumentData }>): Person[] {
  const byName = new Map<string, Person>();
  for (const { id, data } of docs) {
    const person = toPerson(id, data);
    const key = normalizeName(person.name);
    const current = byName.get(key);
    if (!current) {
      byName.set(key, person);
      continue;
    }
    const newer = byUpdatedDesc(person, current) < 0 ? person : current;
    const older = newer === person ? current : person;
    byName.set(key, {
      ...newer,
      relationship: newer.relationship ?? older.relationship,
      notes: newer.notes ?? older.notes,
    });
  }
  return [...byName.values()].sort(byUpdatedDesc);
}

export async function listMemories(userId: string): Promise<MemoryControlResult<MemoryOverview>> {
  const db = getDb();
  if (!db) return err(unavailable);

  const [factsSnap, entitiesSnap] = await Promise.all([
    userCollection(db, userId, 'dynamic_facts').limit(MAX_FACTS).get(),
    userCollection(db, userId, 'dynamic_entities')
      .where('type', '==', 'person')
      .limit(MAX_PEOPLE)
      .get(),
  ]);

  const facts = [
    ...factsSnap.docs.map((d) => toFact(d.id, d.data())),
    ...(await listExplicitFacts(userId)),
  ].sort(byUpdatedDesc);
  const people = groupPeople(
    entitiesSnap.docs
      .filter((d) => isPersonEntity(d.data()))
      .map((d) => ({ id: d.id, data: d.data() }))
  );
  const updatedAt =
    [...facts, ...people]
      .map((m) => m.updatedAt)
      .sort()
      .pop() ?? null;
  return ok({ facts, people, updatedAt });
}

// ============================================================================
// EDIT
// ============================================================================

export async function editFact(
  userId: string,
  factId: string,
  input: { text: string; category?: string }
): Promise<MemoryControlResult<Fact>> {
  const text = input.text.trim();
  if (!text || text.length > MAX_FACT_TEXT) {
    return err({ code: 'invalid', message: `text must be 1-${MAX_FACT_TEXT} characters` });
  }
  const db = getDb();
  if (!db) return err(unavailable);
  if (isExplicitId(factId)) {
    const edited = await editExplicitFact(userId, factId, {
      text,
      category: input.category?.trim(),
    });
    return edited ? ok(edited) : err(notFound);
  }

  const ref = userCollection(db, userId, 'dynamic_facts').doc(factId);
  const snap = await ref.get();
  const before = snap.data();
  if (!snap.exists || !before) return err(notFound);

  const now = new Date();
  const updated: DocumentData = {
    ...before,
    text,
    ...(input.category ? { category: input.category.trim() } : {}),
    userEdited: true,
    editedAt: now,
    updatedAt: now,
    // Let the L2→L3 sync push the corrected fact to the graph again.
    syncedToSpanner: false,
  };
  await ref.set(updated);

  await reindexVector(factVectorId(factId), text);
  await removeGraphRecords(userId, { factDocIds: [factId] });
  return ok(toFact(factId, updated));
}

// ============================================================================
// DELETE
// ============================================================================

/** Delete fact docs with tombstones and derived-store cleanup. */
export async function removeFacts(
  db: Firestore,
  userId: string,
  docs: Array<{ ref: DocumentReference; data: DocumentData }>,
  reason: TombstoneReason,
  journal?: UndoJournal
): Promise<{ removed: number; embeddings: number }> {
  if (docs.length === 0) return { removed: 0, embeddings: 0 };
  const tombstones = docs.flatMap((d) => tombstoneIdsFor(d.ref.id, d.data));
  await writeTombstones(db, userId, tombstones, reason, journal);
  for (const d of docs) await removeDoc(d.ref, journal, d.data);
  const docIds = docs.map((d) => d.ref.id);
  const embeddings = await removeVectors(userId, docIds.map(factVectorId), journal);
  await removeGraphRecords(userId, { factDocIds: docIds });
  return { removed: docs.length, embeddings };
}

export async function deleteFact(
  userId: string,
  factId: string,
  reason: TombstoneReason = 'user_deleted',
  journal?: UndoJournal
): Promise<MemoryControlResult<{ deleted: true }>> {
  const db = getDb();
  if (!db) return err(unavailable);
  if (isExplicitId(factId)) {
    return (await deleteExplicitFact(userId, factId, journal))
      ? ok({ deleted: true })
      : err(notFound);
  }
  const ref = userCollection(db, userId, 'dynamic_facts').doc(factId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) return err(notFound);
  await removeFacts(db, userId, [{ ref, data }], reason, journal);
  log.info({ factId }, 'Fact deleted by user');
  return ok({ deleted: true });
}

/**
 * Forget a person: every person-entity doc with the same name, relationships
 * naming them, and facts about them (tombstoned so extraction can't re-add).
 */
export async function deletePerson(
  userId: string,
  personId: string,
  reason: TombstoneReason = 'user_deleted',
  journal?: UndoJournal
): Promise<MemoryControlResult<{ deleted: true }>> {
  const db = getDb();
  if (!db) return err(unavailable);
  const entities = userCollection(db, userId, 'dynamic_entities');
  const snap = await entities.doc(personId).get();
  const data = snap.data();
  if (!snap.exists || !data || !isPersonEntity(data)) return err(notFound);

  const name = asString(data.name) ?? '';
  const key = normalizeName(name);
  const sameName = name ? await entities.where('name', '==', name).get() : null;
  const entityDocs = [
    { ref: snap.ref, data },
    ...(sameName?.docs ?? [])
      .filter((d) => d.id !== personId && isPersonEntity(d.data()))
      .map((d) => ({ ref: d.ref, data: d.data() })),
  ];
  for (const d of entityDocs) await removeDoc(d.ref, journal, d.data);

  if (name) {
    const rels = userCollection(db, userId, 'dynamic_relationships');
    for (const field of ['source', 'target']) {
      const relSnap = await rels.where(field, '==', name).get();
      for (const d of relSnap.docs) await removeDoc(d.ref, journal, d.data());
    }
    const factSnap = await userCollection(db, userId, 'dynamic_facts')
      .where('entityName', '==', name)
      .get();
    const factDocs = factSnap.docs
      .filter((d) => normalizeName(asString(d.data().entityName) ?? '') === key)
      .map((d) => ({ ref: d.ref, data: d.data() }));
    await removeFacts(db, userId, factDocs, reason, journal);
  }

  await removeGraphRecords(userId, { entityDocIds: entityDocs.map((d) => d.ref.id) });
  log.info({ personId, docs: entityDocs.length }, 'Person deleted by user');
  return ok({ deleted: true });
}
