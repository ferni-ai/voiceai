/**
 * Creative DNA as shown on the Creative You dashboard.
 *
 * The in-memory Creative DNA counters (videos, podcasts, insights) are only
 * updated by /api/creative/watch/complete and POST /api/creative/insights,
 * which no client calls, and they reset on every deploy. What does persist is
 * the topic history the voice agent records from real conversations
 * (recordConversationTopics → Firestore topic_history). So the dashboard
 * builds "What You're Into" from that history, and returns null — the
 * dashboard's empty state — when there is nothing real to show, instead of a
 * default "Newcomer" profile that looks like something Ferni learned.
 *
 * @module services/creative-you/creative-dna-view
 */

import { getCreativeDNA, type CreativeDNA } from './creative-dna.js';
import { getCreativeYouPersistence } from './persistence.js';

const MAX_TOPICS = 10;

/** The user's Creative DNA with interests from persisted topics, or null when there is none. */
export async function loadCreativeDNAView(userId: string): Promise<CreativeDNA | null> {
  const history = await getCreativeYouPersistence().loadTopicHistory(userId);
  const dna = getCreativeDNA(userId);
  const activity = dna.totalVideosWatched + dna.totalPodcastsListened + dna.totalInsightsSaved;

  if (activity === 0 && dna.topTopics.length === 0 && history.topics.length === 0) {
    return null;
  }

  const scores = new Map<string, { topic: string; score: number }>();
  for (const { topic, score } of dna.topTopics) {
    scores.set(topic.toLowerCase(), { topic, score });
  }
  for (const { topic, count } of history.topics) {
    const key = topic.toLowerCase();
    const existing = scores.get(key);
    if (existing) existing.score += count;
    else scores.set(key, { topic, score: count });
  }

  const topTopics = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, MAX_TOPICS);
  return { ...dna, topTopics };
}
