/**
 * Memory export: facts, people, every conversation with its full transcript
 * (both roles) and summaries. JSON, or a single multi-section CSV file
 * (one `# section` header line, then a header row and data rows per section).
 *
 * @module services/memory-control/export
 */

import type { DocumentData } from '@google-cloud/firestore';
import { err, ok } from '../../memory/result.js';
import { getDb, toIso, userCollection } from './db.js';
import { getConversation, toConversationSummary } from './conversations.js';
import { listMemories, unavailable } from './facts.js';
import type { ExportFormat, MemoryControlResult, MemoryExport, MemoryExportFile } from './types.js';

const MAX_CONVERSATIONS = 5000;
const MAX_SUMMARIES = 5000;

/** Make a Firestore document JSON-safe: Timestamps → ISO, drop embedding vectors. */
export function plain(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  const iso = typeof value === 'object' ? toIso(value) : null;
  if (
    iso &&
    (value instanceof Date || typeof (value as { toDate?: unknown }).toDate === 'function')
  ) {
    return iso;
  }
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'embedding') continue;
      out[k] = plain(v);
    }
    return out;
  }
  return value;
}

function summaryLinks(summary: Record<string, unknown>): string[] {
  return ['sessionId', 'conversationId', 'id']
    .map((k) => summary[k])
    .filter((v): v is string => typeof v === 'string');
}

export async function collectMemoryExport(
  userId: string
): Promise<MemoryControlResult<MemoryExport>> {
  const db = getDb();
  if (!db) return err(unavailable);
  const overview = await listMemories(userId);
  if (!overview.ok) return overview;

  const summariesSnap = await userCollection(db, userId, 'summaries').limit(MAX_SUMMARIES).get();
  const summaries = summariesSnap.docs.map((d) => ({
    docId: d.id,
    ...(plain(d.data()) as Record<string, unknown>),
  }));

  const convSnap = await userCollection(db, userId, 'conversations')
    .orderBy('startedAt', 'desc')
    .limit(MAX_CONVERSATIONS)
    .get();
  const conversations: MemoryExport['conversations'] = [];
  for (const doc of convSnap.docs) {
    const detail = await getConversation(userId, doc.id);
    const data: DocumentData = doc.data();
    const ids = new Set([doc.id, data.sessionId, data.conversationId].filter(Boolean));
    conversations.push({
      ...(detail.ok
        ? detail.value
        : { conversation: toConversationSummary(doc.id, data), turns: [] }),
      summaries: summaries.filter((s) => summaryLinks(s).some((id) => ids.has(id))),
    });
  }

  return ok({
    exportedAt: new Date().toISOString(),
    userId,
    facts: overview.value.facts,
    people: overview.value.people,
    conversations,
    summaries,
  });
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value)
    ? value.join(';')
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function section(name: string, header: string[], rows: unknown[][]): string[] {
  return [`# ${name}`, header.join(','), ...rows.map((r) => r.map(csvCell).join(',')), ''];
}

export function toCsv(data: MemoryExport): string {
  const lines = [`# Ferni memory export`, `# exportedAt,${data.exportedAt}`, ''];
  lines.push(
    ...section(
      'facts',
      ['id', 'text', 'category', 'confidence', 'sourceConversationIds', 'userEdited', 'updatedAt'],
      data.facts.map((f) => [
        f.id,
        f.text,
        f.category,
        f.confidence,
        f.sourceConversationIds,
        f.userEdited,
        f.updatedAt,
      ])
    ),
    ...section(
      'people',
      ['id', 'name', 'relationship', 'notes', 'updatedAt'],
      data.people.map((p) => [p.id, p.name, p.relationship, p.notes, p.updatedAt])
    ),
    ...section(
      'conversations',
      ['id', 'startedAt', 'endedAt', 'personaId', 'turnCount', 'summary'],
      data.conversations.map(({ conversation: c }) => [
        c.id,
        c.startedAt,
        c.endedAt,
        c.personaId,
        c.turnCount,
        c.summary,
      ])
    ),
    ...section(
      'turns',
      ['conversationId', 'index', 'role', 'timestamp', 'text'],
      data.conversations.flatMap(({ conversation, turns }) =>
        turns.map((t, i) => [conversation.id, i + 1, t.role, t.timestamp, t.text])
      )
    ),
    ...section(
      'summaries',
      ['id', 'sessionId', 'timestamp', 'content'],
      data.summaries.map((s) => [s.docId, s.sessionId, s.timestamp, s])
    )
  );
  return lines.join('\n');
}

export async function exportMemories(
  userId: string,
  format: ExportFormat = 'json'
): Promise<MemoryControlResult<MemoryExportFile>> {
  const data = await collectMemoryExport(userId);
  if (!data.ok) return data;
  const date = data.value.exportedAt.slice(0, 10);
  if (format === 'csv') {
    return ok({
      filename: `ferni-memories-${date}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: toCsv(data.value),
    });
  }
  return ok({
    filename: `ferni-memories-${date}.json`,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(data.value, null, 2),
  });
}
