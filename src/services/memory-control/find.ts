/**
 * findMemories — locate facts, people and conversations matching a spoken
 * description ("my sister's surgery", "Sarah", "the job interview").
 *
 * Lexical matching on purpose: forgetting must be predictable and explainable
 * ("I found: Sarah · works as a nurse"), and it must work without embeddings.
 *
 * @module services/memory-control/find
 */

import { err, ok } from '../../memory/result.js';
import { asString, getDb, userCollection } from './db.js';
import { findInDomains } from './domains.js';
import { listMemories, unavailable } from './facts.js';
import { toConversationSummary } from './conversations.js';
import type { MemoryControlResult, MemoryMatch } from './types.js';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'about',
  'all',
  'any',
  'anything',
  'at',
  'did',
  'do',
  'everything',
  'for',
  'forget',
  'from',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'said',
  'that',
  'the',
  'this',
  'to',
  'told',
  'was',
  'we',
  'what',
  'you',
  'your',
]);

const MIN_SCORE = 0.5;
const MAX_MATCHES = 10;
const RECENT_CONVERSATIONS = 50;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Share of query tokens found in the candidate text (prefix match tolerates plurals). */
export function matchScore(queryTokens: readonly string[], candidate: string): number {
  if (queryTokens.length === 0) return 0;
  const words = tokenize(candidate);
  const hits = queryTokens.filter((q) =>
    words.some(
      (w) => w === q || (q.length >= 4 && (w.startsWith(q) || q.startsWith(w)) && w.length >= 4)
    )
  );
  return hits.length / queryTokens.length;
}

function clip(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function findMemories(
  userId: string,
  query: string
): Promise<MemoryControlResult<MemoryMatch[]>> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return ok([]);
  const db = getDb();
  if (!db) return err(unavailable);

  const [overview, convSnap] = await Promise.all([
    listMemories(userId),
    userCollection(db, userId, 'conversations')
      .orderBy('startedAt', 'desc')
      .limit(RECENT_CONVERSATIONS)
      .get(),
  ]);
  if (!overview.ok) return overview;

  const matches: MemoryMatch[] = [];

  for (const person of overview.value.people) {
    const score = matchScore(tokens, `${person.name} ${person.relationship ?? ''}`);
    // A person is matched by name, not by a relationship word alone.
    if (score >= MIN_SCORE && matchScore(tokens, person.name) > 0) {
      const label = person.relationship ? `${person.name} (${person.relationship})` : person.name;
      matches.push({ kind: 'person', id: person.id, label, score: score + 0.01 });
    }
  }

  for (const fact of overview.value.facts) {
    const score = matchScore(tokens, `${fact.text} ${fact.category}`);
    if (score >= MIN_SCORE)
      matches.push({ kind: 'fact', id: fact.id, label: clip(fact.text), score });
  }

  for (const doc of convSnap.docs) {
    const data = doc.data();
    const summary = toConversationSummary(doc.id, data);
    const topics = Array.isArray(data.topics) ? data.topics.join(' ') : '';
    const text = `${summary.summary ?? ''} ${topics} ${asString(data.title) ?? ''}`;
    const score = matchScore(tokens, text);
    if (score >= MIN_SCORE && summary.summary) {
      matches.push({
        kind: 'conversation',
        id: summary.id,
        label: `our conversation about ${clip(summary.summary, 60)}`,
        score: score - 0.01,
      });
    }
  }

  // Registered memory domains (important dates, ...) that support forgetting
  for (const m of await findInDomains(userId, query)) {
    matches.push({ kind: 'domain', id: m.id, label: m.label, score: m.score, domain: m.domain });
  }

  return ok(matches.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES));
}
