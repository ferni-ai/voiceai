/**
 * Inside Joke Surfacing
 *
 * Relationship texture callbacks.
 *
 * @module superhuman-memory/inside-jokes
 */

import type { HumanMemory } from '../../types/human-memory.js';
import type { ProactiveInsight } from './types.js';

/**
 * Find inside jokes that could be naturally referenced
 */
export function findSurfaceableJokes(
  humanMemory: Partial<HumanMemory> | undefined,
  conversationContext?: string
): ProactiveInsight[] {
  if (!humanMemory?.insideJokes?.length) {
    return [];
  }

  const insights: ProactiveInsight[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const joke of humanMemory.insideJokes) {
    // Skip retired jokes
    if (joke.status === 'retired') {
      continue;
    }

    // Don't overuse - check if used recently
    if (joke.lastUsed && joke.lastUsed > thirtyDaysAgo) {
      continue;
    }

    // Check if context makes this relevant
    const isRelevant =
      conversationContext &&
      (joke.reference.toLowerCase().includes(conversationContext.toLowerCase()) ||
        joke.origin.toLowerCase().includes(conversationContext.toLowerCase()));

    if (isRelevant || joke.status === 'beloved') {
      insights.push({
        id: `joke_${joke.id}_${Date.now()}`,
        type: 'inside_joke',
        priority: isRelevant ? 'medium' : 'low',
        content: `Inside joke: ${joke.reference}`,
        naturalPhrase: `Ha, this reminds me of "${joke.reference}"`,
        context: {
          timing: 'when_relevant',
          tone: 'warm',
          oneTime: false, // Can be used multiple times (with cooldown)
        },
        generatedAt: now,
        sourceId: joke.id,
      });
    }
  }

  return insights;
}
