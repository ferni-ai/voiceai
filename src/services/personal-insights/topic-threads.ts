/**
 * Life threads: the topics a user keeps coming back to (a work project,
 * marathon training, a move), mined from conversation summaries. Each
 * thread tracks first/last mention, how many conversations it came up in,
 * its trajectory and cadence, unresolved follow-ups and commitments, and the
 * people involved.
 *
 * Recomputed from the summaries each time (a user has tens of them), so a
 * deleted conversation drops out of every thread on the next pass.
 *
 * @module services/personal-insights/topic-threads
 */

import { personMatchTerms, textMentionsPerson } from './people-model.js';
import {
  DAY_MS,
  contentWords,
  isResolved,
  jaccard,
  median,
  sensitivityOf,
  stableId,
  textMatchesTerms,
} from './text-utils.js';
import type {
  LifeThread,
  OpenThread,
  PersonProfile,
  SourceSummary,
  Trajectory,
  UserMemorySources,
} from './types.js';

const GENERIC_TOPICS =
  /^(greeting|greetings|small talk|smalltalk|check[- ]?in|catch[- ]?up|general( conversation| chat)?|casual( chat| conversation)?|introductions?|hello|goodbye|chit[- ]?chat|conversation|misc(ellaneous)?|other|n\/a|none)$/i;
const COMMITMENT =
  /\b(will|i'll|plans? to|planning to|going to|promised|committed to|commit to|decided to|intends? to|goal is|wants? to start)\b/i;
const MAX_THREADS = 40;

interface Cluster {
  key: string;
  words: Set<string>;
  surfaces: Map<string, number>;
  conversations: Map<string, number>; // conversationId -> at
}

function normalizeLabel(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');
}

function findCluster(clusters: Cluster[], words: Set<string>): Cluster | undefined {
  let best: Cluster | undefined;
  let bestScore = 0;
  for (const c of clusters) {
    const subset =
      [...words].every((w) => c.words.has(w)) || [...c.words].every((w) => words.has(w));
    const score = subset ? 1 : jaccard(words, c.words);
    if (score >= 0.5 && score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function trajectoryOf(times: readonly number[], nowMs: number): Trajectory {
  const ages = times.map((t) => (nowMs - t) / DAY_MS);
  const recent = ages.filter((a) => a <= 14).length;
  const prior = ages.filter((a) => a > 14 && a <= 56).length;
  const first = Math.max(...ages);
  const last = Math.min(...ages);
  if (first <= 14 && times.length <= 2) return 'new';
  if (last > 21 || (prior >= 2 && recent === 0)) return 'fading';
  if (recent >= 2 && recent / 14 > (prior / 42) * 1.5) return 'rising';
  return 'steady';
}

/** Mine life threads from a user's summaries. Pure: no I/O. */
export function buildLifeThreads(
  sources: UserMemorySources,
  people: readonly PersonProfile[],
  nowMs: number
): LifeThread[] {
  const summaries = [...sources.summaries].sort((a, b) => a.at - b.at);
  const clusters: Cluster[] = [];

  // 1. Cluster the labelled topics.
  for (const s of summaries) {
    for (const raw of s.mainTopics) {
      const label = normalizeLabel(raw);
      const words = contentWords(label);
      if (!label || GENERIC_TOPICS.test(label) || words.size === 0) continue;
      let c = findCluster(clusters, words);
      if (!c) {
        c = {
          key: label.toLowerCase(),
          words: new Set(words),
          surfaces: new Map(),
          conversations: new Map(),
        };
        clusters.push(c);
      }
      c.surfaces.set(label, (c.surfaces.get(label) ?? 0) + 1);
      c.conversations.set(s.conversationId, s.at);
    }
  }

  // 2. Conversations whose key points mention a thread count too (catch-up
  //    summaries carry key points but no labelled topics).
  const labelOf = (c: Cluster) => [...c.surfaces.entries()].sort((a, b) => b[1] - a[1])[0][0];
  for (const c of clusters) {
    const terms = [...c.surfaces.keys()];
    for (const s of summaries) {
      if (c.conversations.has(s.conversationId)) continue;
      if (textMatchesTerms(s.keyPoints.join('. '), terms))
        c.conversations.set(s.conversationId, s.at);
    }
  }

  const roleHolders = new Map<string, number>();
  for (const p of people)
    if (p.relationship) roleHolders.set(p.relationship, (roleHolders.get(p.relationship) ?? 0) + 1);
  const personTerms = people.map((p) => ({
    id: p.id,
    terms: personMatchTerms(p, !!p.relationship && (roleHolders.get(p.relationship) ?? 0) > 1),
  }));

  const threads: LifeThread[] = [];
  for (const c of clusters) {
    const terms = [...c.surfaces.keys()];
    const times = [...c.conversations.values()].sort((a, b) => a - b);
    const related = summaries.filter((s) => c.conversations.has(s.conversationId));

    const unresolved: OpenThread[] = [];
    const commitments: OpenThread[] = [];
    for (const s of related) {
      for (const item of s.followUps) {
        if (
          !textMatchesTerms(item, terms) &&
          !s.mainTopics.some((t) => c.surfaces.has(normalizeLabel(t)))
        )
          continue;
        const open: OpenThread = {
          text: item,
          mentionedAt: s.at,
          sourceConversationIds: [s.conversationId],
        };
        if (!isResolved(open, summaries)) unresolved.push(open);
      }
      for (const point of s.keyPoints) {
        if (!COMMITMENT.test(point) || !textMatchesTerms(point, terms)) continue;
        const open: OpenThread = {
          text: point,
          mentionedAt: s.at,
          sourceConversationIds: [s.conversationId],
        };
        if (
          !isResolved(
            open,
            summaries.filter((x) => x.conversationId !== s.conversationId)
          )
        )
          commitments.push(open);
      }
    }

    const label = labelOf(c);
    const context = [
      label,
      ...unresolved.map((u) => u.text),
      ...related.flatMap((s) => s.keyPoints.filter((k) => textMatchesTerms(k, terms))),
    ].join('. ');
    const gaps = times.slice(1).map((t, i) => (t - times[i]) / DAY_MS);
    threads.push({
      id: stableId('thread', c.key),
      label,
      firstMentionedAt: times[0],
      lastMentionedAt: times[times.length - 1],
      mentionCount: times.length,
      mentionTimes: times,
      trajectory: trajectoryOf(times, nowMs),
      cadenceDays: times.length >= 3 ? median(gaps) : undefined,
      unresolved: dedupeOpen(unresolved).slice(-3),
      commitments: dedupeOpen(commitments).slice(-3),
      personIds: personTerms.filter((p) => textMentionsPerson(context, p.terms)).map((p) => p.id),
      sensitive: sensitivityOf(context),
      sourceConversationIds: [...c.conversations.keys()],
      updatedAt: nowMs,
    });
  }

  threads.sort(
    (a, b) => b.lastMentionedAt - a.lastMentionedAt + (b.mentionCount - a.mentionCount) * 3 * DAY_MS
  );
  return threads.slice(0, MAX_THREADS);
}

function dedupeOpen(items: readonly OpenThread[]): OpenThread[] {
  const seen = new Map<string, OpenThread>();
  for (const i of items) seen.set(i.text.toLowerCase(), i);
  return [...seen.values()].sort((a, b) => a.mentionedAt - b.mentionedAt);
}

/** The summaries of one conversation, for scoring predictions against it. */
export function conversationText(
  summaries: readonly SourceSummary[],
  conversationId: string,
  extra: readonly string[] = []
): string {
  return [
    ...summaries
      .filter((s) => s.conversationId === conversationId)
      .flatMap((s) => [...s.mainTopics, ...s.keyPoints, ...s.followUps]),
    ...extra,
  ].join('. ');
}
