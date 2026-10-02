/**
 * Planner for collapsing legacy duplicate facts and entities onto their
 * deterministic ids (see fact-identity.ts). Pure: takes a user's documents,
 * returns the writes and deletes; scripts/migrate-dedupe-dynamic-facts.ts
 * applies the plan. Running it again on migrated data plans nothing.
 *
 * Legacy documents carry a sessionId, not a conversation id, so their
 * provenance is kept as `legacySessionIds`; any conversation ids already
 * present are unioned into `sourceConversationIds`.
 *
 * @module memory/dynamic/fact-migration
 */

import { entityIdFor, factIdForExtracted, factText } from './fact-identity.js';
import { categoryForFactType } from './fact-store.js';
import { toMillis, type DocData } from './firestore-shapes.js';

export interface SourceDoc {
  id: string;
  data: DocData;
}

export interface MigrationPlan {
  /** Full documents to write at the deterministic id (replacing what is there). */
  writes: Array<{ id: string; data: DocData }>;
  /** Doc ids to delete (merged duplicates, or facts the user deleted). */
  deletes: string[];
  /** Duplicate groups collapsed. */
  merged: number;
  /** Docs removed because their fact is tombstoned. */
  tombstoned: number;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];
}

function unionOf(docs: SourceDoc[], pick: (d: DocData) => string[]): string[] {
  const out: string[] = [];
  for (const d of docs) for (const s of pick(d.data)) if (!out.includes(s)) out.push(s);
  return out;
}

function seenAt(d: DocData): number {
  return toMillis(d.updatedAt) || toMillis(d.extractedAt) || toMillis(d.firstSeenAt);
}

function firstAt(d: DocData): number {
  return toMillis(d.firstSeenAt) || toMillis(d.extractedAt) || toMillis(d.updatedAt);
}

const CONTRACT_FIELDS = [
  'text',
  'category',
  'confidence',
  'sourceConversationIds',
  'firstSeenAt',
  'updatedAt',
  'userEdited',
];

/** Plan the fact migration for one user. */
export function planFactMigration(
  docs: SourceDoc[],
  tombstonedIds: ReadonlySet<string>
): MigrationPlan {
  const plan: MigrationPlan = { writes: [], deletes: [], merged: 0, tombstoned: 0 };
  const groups = new Map<string, SourceDoc[]>();
  for (const doc of docs) {
    const d = doc.data;
    if (
      typeof d.entityName !== 'string' ||
      typeof d.key !== 'string' ||
      d.value === undefined ||
      d.value === null
    ) {
      continue; // Not an extracted fact (e.g. written by hand); leave it.
    }
    const id = factIdForExtracted({
      entityName: d.entityName,
      key: d.key,
      value: String(d.value),
      factType: typeof d.factType === 'string' ? d.factType : undefined,
    });
    const list = groups.get(id) ?? [];
    list.push(doc);
    groups.set(id, list);
  }

  for (const [id, group] of groups) {
    if (tombstonedIds.has(id)) {
      for (const g of group) plan.deletes.push(g.id);
      plan.tombstoned += group.length;
      continue;
    }
    const only = group.length === 1 ? group[0] : null;
    if (only && only.id === id && CONTRACT_FIELDS.every((f) => only.data[f] !== undefined))
      continue;

    const edited = group
      .filter((g) => g.data.userEdited === true)
      .sort((a, b) => toMillis(b.data.editedAt) - toMillis(a.data.editedAt))[0];
    const newest = [...group].sort((a, b) => seenAt(b.data) - seenAt(a.data))[0];
    const base = edited ?? newest;
    const value = String(base.data.value);
    const sameValue = group.filter((g) => String(g.data.value) === value);
    const confidence = Math.max(
      ...sameValue.map((g) => (typeof g.data.confidence === 'number' ? g.data.confidence : 0.5))
    );
    const factType = typeof base.data.factType === 'string' ? base.data.factType : 'attribute';
    const firstSeen = Math.min(...group.map((g) => firstAt(g.data) || Date.now()));
    const updated = Math.max(...group.map((g) => seenAt(g.data) || 0)) || Date.now();
    const conversationIds = unionOf(group, (d) => [
      ...strings(d.sourceConversationIds),
      ...(typeof d.conversationId === 'string' ? [d.conversationId] : []),
    ]);
    const sessionIds = unionOf(group, (d) => [
      ...strings(d.legacySessionIds),
      ...(typeof d.sessionId === 'string' ? [d.sessionId] : []),
    ]);

    const data: DocData = {
      ...base.data,
      text:
        base.data.userEdited === true && typeof base.data.text === 'string'
          ? base.data.text
          : factText({
              entityName: String(base.data.entityName),
              key: String(base.data.key),
              value,
            }),
      category:
        base.data.userEdited === true && typeof base.data.category === 'string'
          ? base.data.category
          : categoryForFactType(factType),
      confidence:
        base.data.userEdited === true && typeof base.data.confidence === 'number'
          ? base.data.confidence
          : confidence,
      sourceConversationIds: conversationIds,
      legacySessionIds: sessionIds,
      firstSeenAt: new Date(firstSeen),
      updatedAt: new Date(updated),
      userEdited: base.data.userEdited === true,
      syncedToSpanner: false,
    };
    plan.writes.push({ id, data });
    for (const g of group) if (g.id !== id) plan.deletes.push(g.id);
    if (group.length > 1) plan.merged++;
  }
  return plan;
}

/** Plan the entity migration for one user (merges attributes, sums mentions). */
export function planEntityMigration(
  docs: SourceDoc[],
  tombstonedIds: ReadonlySet<string>
): MigrationPlan {
  const plan: MigrationPlan = { writes: [], deletes: [], merged: 0, tombstoned: 0 };
  const groups = new Map<string, SourceDoc[]>();
  for (const doc of docs) {
    const { name, type } = doc.data;
    if (typeof name !== 'string' || typeof type !== 'string' || !name) continue;
    const id = entityIdFor(name, type);
    groups.set(id, [...(groups.get(id) ?? []), doc]);
  }
  for (const [id, group] of groups) {
    if (tombstonedIds.has(id)) {
      for (const g of group) plan.deletes.push(g.id);
      plan.tombstoned += group.length;
      continue;
    }
    if (
      group.length === 1 &&
      group[0].id === id &&
      Array.isArray(group[0].data.sourceConversationIds)
    )
      continue;
    const ordered = [...group].sort((a, b) => seenAt(a.data) - seenAt(b.data));
    const newest = ordered[ordered.length - 1];
    const attributes: Record<string, unknown> = {};
    for (const g of ordered)
      Object.assign(attributes, (g.data.attributes as Record<string, unknown>) ?? {});
    const data: DocData = {
      ...newest.data,
      attributes,
      confidence: Math.max(
        ...group.map((g) => (typeof g.data.confidence === 'number' ? g.data.confidence : 0))
      ),
      mentionCount: group.reduce(
        (n, g) => n + (typeof g.data.mentionCount === 'number' ? g.data.mentionCount : 1),
        0
      ),
      sourceConversationIds: unionOf(group, (d) => strings(d.sourceConversationIds)),
      legacySessionIds: unionOf(group, (d) => [
        ...strings(d.legacySessionIds),
        ...(typeof d.sessionId === 'string' ? [d.sessionId] : []),
      ]),
      firstSeenAt: new Date(Math.min(...group.map((g) => firstAt(g.data) || Date.now()))),
      updatedAt: new Date(Math.max(...group.map((g) => seenAt(g.data) || 0)) || Date.now()),
      userEdited: group.some((g) => g.data.userEdited === true),
      syncedToSpanner: false,
    };
    plan.writes.push({ id, data });
    for (const g of group) if (g.id !== id) plan.deletes.push(g.id);
    if (group.length > 1) plan.merged++;
  }
  return plan;
}
