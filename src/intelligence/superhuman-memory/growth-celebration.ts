/**
 * Growth Arc Celebration
 *
 * "Look how far you've come!"
 *
 * @module superhuman-memory/growth-celebration
 */

import type { HumanMemory, GrowthMarker } from '../../types/human-memory.js';
import type { ProactiveInsight } from './types.js';

/**
 * Find growth moments worth celebrating
 */
export function findCelebratableGrowth(
  humanMemory: Partial<HumanMemory> | undefined,
  currentTopic?: string
): ProactiveInsight[] {
  if (!humanMemory?.growthArc?.markers?.length) {
    return [];
  }

  const insights: ProactiveInsight[] = [];
  const now = new Date();

  for (const marker of humanMemory.growthArc.markers) {
    // Skip if already acknowledged and they deflected
    if (marker.acknowledged && marker.reactionWhenAcknowledged === 'deflected') {
      continue;
    }

    // Check if this relates to current topic
    const isRelevant =
      currentTopic &&
      (marker.description.toLowerCase().includes(currentTopic.toLowerCase()) ||
        marker.before.toLowerCase().includes(currentTopic.toLowerCase()) ||
        marker.after.toLowerCase().includes(currentTopic.toLowerCase()));

    // Prioritize unacknowledged or topic-relevant
    if (!marker.acknowledged || isRelevant) {
      insights.push({
        id: `growth_${marker.id}_${Date.now()}`,
        type: 'growth_celebration',
        priority: !marker.acknowledged ? 'medium' : 'low',
        content: `Growth: ${marker.description}`,
        naturalPhrase: generateGrowthPhrase(marker),
        context: {
          timing: isRelevant ? 'when_relevant' : 'closing',
          tone: 'warm',
          oneTime: !marker.acknowledged, // Only deliver once if not yet acknowledged
        },
        generatedAt: now,
        sourceId: marker.id,
      });
    }
  }

  // Also check challenges with breakthroughs
  if (humanMemory.growthArc.challenges) {
    for (const challenge of humanMemory.growthArc.challenges) {
      if (challenge.status === 'breakthrough' || challenge.status === 'resolved') {
        const isRelevant =
          currentTopic && challenge.challenge.toLowerCase().includes(currentTopic.toLowerCase());

        insights.push({
          id: `challenge_${challenge.id}_${Date.now()}`,
          type: 'growth_celebration',
          priority: 'medium',
          content: `Challenge ${challenge.status}: ${challenge.challenge}`,
          naturalPhrase: `You know, I've noticed how far you've come with ${challenge.challenge}. That's real progress.`,
          context: {
            timing: isRelevant ? 'when_relevant' : 'closing',
            tone: 'warm',
            oneTime: true,
          },
          generatedAt: now,
          sourceId: challenge.id,
        });
      }
    }
  }

  return insights;
}

/**
 * Generate natural growth celebration phrase
 */
function generateGrowthPhrase(marker: GrowthMarker): string {
  const phrases = [
    `You know, I remember when ${marker.before}. Look at you now - ${marker.after}. That's real growth.`,
    `Can I just say - ${marker.after}? That's such a change from ${marker.before}. I'm proud of you.`,
    `I've noticed something: ${marker.description}. That's not nothing - that's you growing.`,
  ];

  // Pick based on marker id for consistency
  const index = marker.id.charCodeAt(0) % phrases.length;
  return phrases[index];
}
