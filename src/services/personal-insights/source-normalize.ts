/**
 * Normalize raw Firestore docs into the source shapes the derivation uses.
 * Tolerant of both the legacy extraction shape (entityName/key/value,
 * sessionId) and the contract shape (text, category, sourceConversationIds).
 *
 * @module services/personal-insights/source-normalize
 */

import type {
  SourceConflict,
  SourceConversation,
  SourceEntity,
  SourceFact,
  SourceRelationship,
  SourceSummary,
} from './types.js';

export type RawDoc = { id: string; data: Record<string, unknown> };

/** Firestore Timestamp, Date, ISO string or epoch ms → epoch ms (0 when unknown). */
export function toMs(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === 'object') {
    const v = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    const s = v.seconds ?? v._seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return 0;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : [];

/** Conversation ids a doc came from: the contract field, else the legacy sessionId. */
export function conversationIdsOf(d: Record<string, unknown>): string[] {
  const ids = strList(d.sourceConversationIds);
  if (ids.length > 0) return ids;
  const single = str(d.conversationId || d.sessionId);
  return single ? [single] : [];
}

export function normalizeFact(doc: RawDoc): SourceFact | null {
  const d = doc.data;
  const subject = str(d.entityName ?? d.subject).trim();
  const predicate = str(d.key ?? d.predicate).trim();
  const value = str(d.value).trim();
  const text =
    str(d.text).trim() ||
    [subject, predicate.replace(/_/g, ' '), value]
      .filter(Boolean)
      .join(subject && predicate ? ' ' : ': ')
      .trim();
  if (!text) return null;
  return {
    id: doc.id,
    subject: subject || 'user',
    predicate,
    value,
    text,
    category: d.category ? str(d.category) : undefined,
    confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
    conversationIds: conversationIdsOf(d),
    at: toMs(d.updatedAt) || toMs(d.extractedAt) || toMs(d.firstSeenAt) || toMs(d.createdAt),
  };
}

export function normalizeEntity(doc: RawDoc): SourceEntity | null {
  const d = doc.data;
  const name = str(d.name).trim();
  if (!name) return null;
  const attributes: Record<string, string> = {};
  if (d.attributes && typeof d.attributes === 'object') {
    for (const [k, v] of Object.entries(d.attributes as Record<string, unknown>))
      attributes[k] = str(v);
  }
  if (d.relationship) attributes.relationship = str(d.relationship);
  return {
    id: doc.id,
    name,
    type: str(d.type || 'thing'),
    attributes,
    conversationIds: conversationIdsOf(d),
    at: toMs(d.updatedAt) || toMs(d.extractedAt) || toMs(d.createdAt),
  };
}

export function normalizeRelationship(doc: RawDoc): SourceRelationship | null {
  const d = doc.data;
  const source = str(d.source).trim();
  const target = str(d.target).trim();
  if (!source || !target) return null;
  return {
    id: doc.id,
    source,
    target,
    type: str(d.type),
    conversationIds: conversationIdsOf(d),
    at: toMs(d.updatedAt) || toMs(d.extractedAt) || toMs(d.createdAt),
  };
}

export function normalizeSummary(doc: RawDoc): SourceSummary | null {
  const d = doc.data;
  const conversationId = str(d.conversationId || d.sessionId || doc.id);
  const summary: SourceSummary = {
    id: doc.id,
    conversationId,
    at: toMs(d.timestamp) || toMs(d.createdAt),
    mainTopics: strList(d.mainTopics ?? d.topics),
    keyPoints: strList(d.keyPoints),
    followUps: [...strList(d.followUpItems), ...strList(d.questionsRemaining)],
    emotionalArc: d.emotionalArc ? str(d.emotionalArc) : undefined,
  };
  return summary.mainTopics.length + summary.keyPoints.length + summary.followUps.length > 0
    ? summary
    : null;
}

export function normalizeConflict(doc: RawDoc): SourceConflict | null {
  const d = doc.data;
  const withPerson = str(d.withPerson).trim();
  if (!withPerson) return null;
  return {
    withPerson,
    relationship: str(d.relationship),
    conflictType: str(d.conflictType || 'disagreement'),
    triggers: strList(d.triggers),
    effectiveApproaches: strList(d.effectiveApproaches),
    ineffectiveApproaches: strList(d.ineffectiveApproaches),
    outcome: str(d.outcome || 'ongoing'),
    timestamp: toMs(d.timestamp),
  };
}

export function normalizeConversation(doc: RawDoc): SourceConversation | null {
  const startedAt = toMs(doc.data.startedAt);
  if (!startedAt) return null;
  return { id: doc.id, startedAt, summary: doc.data.summary ? str(doc.data.summary) : undefined };
}

/**
 * Conversations summarized only on the conversation doc (catch-up path) still
 * count: their summary string becomes a key point.
 */
export function withConversationSummaries(
  summaries: readonly SourceSummary[],
  conversations: readonly SourceConversation[]
): SourceSummary[] {
  const covered = new Set(summaries.map((s) => s.conversationId));
  const extra: SourceSummary[] = [];
  for (const c of conversations) {
    if (!c.summary || covered.has(c.id) || c.summary === 'Brief conversation') continue;
    extra.push({
      id: `conv:${c.id}`,
      conversationId: c.id,
      at: c.startedAt,
      mainTopics: [],
      keyPoints: [c.summary],
      followUps: [],
    });
  }
  return [...summaries, ...extra];
}
