/**
 * Search THIS user's own memory: their facts and people, and their past
 * conversations. Backs the recallFromMemory and recallPreviousConversation
 * tools (and the JSON-workaround executor), which used to search persona
 * content or return only the last summary.
 *
 * - Facts/people: ranked like per-turn recall (keyword + semantic, user-edited
 *   facts first) over bogle_users/{uid}/dynamic_facts and dynamic_entities.
 * - Conversations: summaries from the vector store (filtered to the user) when
 *   available, plus keyword search over recent conversations' summaries and
 *   turns, returned as dated snippets with conversation ids.
 *
 * Everything is scoped by userId; nothing here reads persona content.
 *
 * @module memory/recall/user-memory-search
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { USERS_COLLECTION, toMillis, type FirestoreLike } from '../dynamic/firestore-shapes.js';
import { getRecallEmbedder, type Embedder } from './recall-embeddings.js';
import { contentWords, displayText, rankFacts } from './recall-ranking.js';
import { dedupeFacts, factId, toRecallFact, type RecallFact } from './session-recall.js';
import { loadUserFactDocs, loadUserPeople } from './user-memory-store.js';

const log = createLogger({ module: 'UserMemorySearch' });

export interface MemoryHit {
  id: string;
  kind: 'fact' | 'person';
  text: string;
  score: number;
  updatedAt?: Date;
}

export interface ConversationHit {
  conversationId: string;
  date?: Date;
  snippet: string;
  source: 'summary' | 'turns';
  score: number;
}

export interface SearchDeps {
  db?: FirestoreLike | null;
  /** null = keyword-only. Default: the shared recall embedder. */
  embed?: Embedder | null;
}

export interface ConversationSearchDeps {
  db?: FirestoreLike | null;
  /** Vector search over the user's conversation summaries; null to skip. */
  summarySearch?: ((query: string, userId: string) => Promise<ConversationHit[]>) | null;
}

function resolveDb(db: FirestoreLike | null | undefined): FirestoreLike | null {
  if (db !== undefined) return db;
  return getFirestoreDb() as unknown as FirestoreLike | null;
}

const SNAPSHOT_FACTS = 400;
const MAX_EMBEDDED = 150;

function personToFact(p: Record<string, unknown> & { id: string }): RecallFact | null {
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!name) return null;
  const attrs = (p.attributes as Record<string, unknown> | undefined) ?? {};
  const relationship = String(p.relationship ?? attrs.relationship ?? attrs.role ?? '').trim();
  const notes = String(p.notes ?? '').trim();
  const details = Object.entries(attrs)
    .filter(([k]) => k !== 'relationship' && k !== 'role')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
    .join(', ');
  const text = [`${name}${relationship ? ` (${relationship})` : ''}`, notes, details]
    .filter(Boolean)
    .join(' - ');
  return {
    id: `person:${p.id}`,
    entity: name,
    key: relationship ? 'relationship' : '',
    value: relationship || notes || details || name,
    confidence: typeof p.confidence === 'number' ? p.confidence : 0.6,
    text,
    userEdited: p.userEdited === true,
    updatedAtMs: toMillis(p.updatedAt ?? p.extractedAt) || undefined,
  };
}

/** Facts and people of this user relevant to `query`, best first. */
export async function searchUserFacts(
  userId: string,
  query: string,
  opts: { maxItems?: number; maxChars?: number } = {},
  deps: SearchDeps = {}
): Promise<MemoryHit[]> {
  const db = resolveDb(deps.db);
  if (!db || !userId || !query.trim()) return [];
  try {
    const [factDocs, people] = await Promise.all([
      loadUserFactDocs(db, userId, SNAPSHOT_FACTS),
      loadUserPeople(db, userId).catch(() => []),
    ]);
    const facts = dedupeFacts(
      factDocs.map(toRecallFact).filter((f): f is RecallFact => f !== null)
    ).sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
    const persons = people.map(personToFact).filter((f): f is RecallFact => f !== null);
    const all = [...facts, ...persons];

    // Semantic scores when embeddings are available; keyword-only otherwise.
    const embed = deps.embed !== undefined ? deps.embed : await getRecallEmbedder();
    const vectors = new Map<string, number[]>();
    let queryEmbedding: number[] | null = null;
    if (embed && all.length > 0) {
      const sample = all.slice(0, MAX_EMBEDDED);
      const out = await embed([query, ...sample.map((f) => f.text ?? displayText(f))]);
      if (out) {
        queryEmbedding = out[0] ?? null;
        sample.forEach((f, i) => {
          const v = out[i + 1];
          if (v?.length) vectors.set(factId(f), v);
        });
      }
    }

    return rankFacts(all, query, {
      maxItems: opts.maxItems ?? 5,
      maxChars: opts.maxChars ?? 1200,
      queryEmbedding,
      factEmbedding: (f) => vectors.get(factId(f as RecallFact)),
    }).map((r) => {
      const f = r.fact as RecallFact;
      const isPerson = (f.id ?? '').startsWith('person:');
      return {
        id: isPerson ? (f.id ?? '').slice('person:'.length) : (f.id ?? factId(f)),
        kind: isPerson ? 'person' : 'fact',
        text: isPerson ? (f.text ?? f.entity) : displayText(f, 'the user'),
        score: r.score,
        ...(f.updatedAtMs ? { updatedAt: new Date(f.updatedAtMs) } : {}),
      } satisfies MemoryHit;
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Fact search failed');
    return [];
  }
}

// ============================================================================
// CONVERSATIONS
// ============================================================================

const RECENT_CONVERSATIONS = 15;
const TURNS_PER_CONVERSATION = 80;
const SNIPPET_CHARS = 280;

function overlapScore(words: ReadonlySet<string>, text: string): number {
  let n = 0;
  for (const w of contentWords(text)) if (words.has(w)) n++;
  return n;
}

function turnText(d: Record<string, unknown>): string {
  const t = d.text ?? d.content;
  return typeof t === 'string' ? t.trim() : '';
}

/** Default summary search: the user's indexed summaries in the vector store. */
async function vectorSummarySearch(query: string, userId: string): Promise<ConversationHit[]> {
  const { semanticSearch } = await import('../retrieval/semantic-rag.js');
  const results = await semanticSearch(query, {
    topK: 5,
    sources: ['conversation'],
    userId,
    minScore: 0.45,
  });
  return results
    .filter((r) => r.metadata?.userId === userId)
    .map((r) => {
      const meta = r.metadata as Record<string, unknown>;
      const docId = typeof meta.documentId === 'string' ? meta.documentId : '';
      // Older summaries were indexed without a conversation id; cite the summary instead.
      const conversationId =
        (typeof meta.conversationId === 'string' && meta.conversationId) ||
        (docId ? `summary:${docId.replace(/^conversation_/, '')}` : 'unknown');
      const at = toMillis(meta.timestamp);
      return {
        conversationId,
        ...(at ? { date: new Date(at) } : {}),
        snippet: r.content.slice(0, SNIPPET_CHARS),
        source: 'summary' as const,
        score: 1 + r.score * 2,
      };
    });
}

/** Keyword search over this user's recent conversations (summaries and turns). */
async function keywordConversationSearch(
  db: FirestoreLike,
  userId: string,
  query: string
): Promise<ConversationHit[]> {
  const words = contentWords(query);
  if (words.size === 0) return [];
  const convs = await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection('conversations')
    .orderBy('startedAt', 'desc')
    .limit(RECENT_CONVERSATIONS)
    .get();

  const hits = await Promise.all(
    convs.docs.map(async (conv): Promise<ConversationHit | null> => {
      const data = conv.data() ?? {};
      const at = toMillis(data.startedAt);
      const date = at ? new Date(at) : undefined;
      const summary = typeof data.summary === 'string' ? data.summary : '';
      let best: ConversationHit | null = null;
      const summaryScore = summary ? overlapScore(words, summary) : 0;
      if (summaryScore > 0) {
        best = {
          conversationId: conv.id,
          date,
          snippet: summary.slice(0, SNIPPET_CHARS),
          source: 'summary',
          score: summaryScore,
        };
      }
      try {
        const turns = await conv.ref
          .collection('turns')
          .orderBy('timestamp', 'asc')
          .limit(TURNS_PER_CONVERSATION)
          .get();
        for (const t of turns.docs) {
          const td = t.data() ?? {};
          const text = turnText(td);
          const score = text ? overlapScore(words, text) : 0;
          if (score === 0 || (best && score <= best.score)) continue;
          const who = td.role === 'assistant' ? 'You said' : 'They said';
          const tAt = toMillis(td.timestamp);
          best = {
            conversationId: conv.id,
            date: tAt ? new Date(tAt) : date,
            snippet: `${who}: "${text.slice(0, SNIPPET_CHARS)}"`,
            source: 'turns',
            score,
          };
        }
      } catch (error) {
        log.debug({ error: String(error), conversationId: conv.id }, 'Turn search skipped');
      }
      return best;
    })
  );
  return hits.filter((h): h is ConversationHit => h !== null);
}

/** This user's past conversations relevant to `query`, as dated snippets. */
export async function searchUserConversations(
  userId: string,
  query: string,
  opts: { maxResults?: number } = {},
  deps: ConversationSearchDeps = {}
): Promise<ConversationHit[]> {
  if (!userId || !query.trim()) return [];
  const db = resolveDb(deps.db);
  const summarySearch = deps.summarySearch !== undefined ? deps.summarySearch : vectorSummarySearch;

  const [semantic, keyword] = await Promise.all([
    summarySearch ? summarySearch(query, userId).catch(() => []) : Promise.resolve([]),
    db ? keywordConversationSearch(db, userId, query).catch(() => []) : Promise.resolve([]),
  ]);

  const best = new Map<string, ConversationHit>();
  for (const hit of [...semantic, ...keyword]) {
    const seen = best.get(hit.conversationId);
    if (!seen || hit.score > seen.score) best.set(hit.conversationId, hit);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, opts.maxResults ?? 4);
}

// ============================================================================
// FORMATTING (tool results for the LLM)
// ============================================================================

function shortDate(d?: Date): string {
  return d ? d.toISOString().slice(0, 10) : 'date unknown';
}

export function formatFactHits(hits: MemoryHit[]): string {
  return hits.map((h) => `- ${h.text}`).join('\n');
}

export function formatConversationHits(hits: ConversationHit[]): string {
  return hits
    .map((h) => {
      const ref =
        h.conversationId.startsWith('summary:') || h.conversationId === 'unknown'
          ? ''
          : ` · conversation ${h.conversationId}`;
      return `- [${shortDate(h.date)}${ref}] ${h.snippet}`;
    })
    .join('\n');
}
