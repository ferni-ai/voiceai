/**
 * Topic Management
 *
 * Topic threading verification and proactive goal references.
 *
 * @module intelligence/human-behaviors/topic-management
 */

import type { UserProfile } from '../../types/user-profile.js';

// ============================================================================
// TOPIC THREADING
// ============================================================================

/**
 * Check if topic threading is working
 */
export function verifyTopicThreading(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  topicsToCircleBack: string[]
): {
  working: boolean;
  circledBackTopics: string[];
  missedTopics: string[];
  suggestion: string | null;
} {
  if (topicsToCircleBack.length === 0) {
    return { working: true, circledBackTopics: [], missedTopics: [], suggestion: null };
  }

  const assistantMessages = conversationHistory
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content.toLowerCase());

  const circledBackTopics: string[] = [];
  const missedTopics: string[] = [];

  for (const topic of topicsToCircleBack) {
    const topicLower = topic.toLowerCase();
    const found = assistantMessages.some(
      (msg) =>
        msg.includes(`you mentioned ${topicLower}`) ||
        msg.includes('earlier you said') ||
        msg.includes(`about ${topicLower}`) ||
        msg.includes(`regarding ${topicLower}`) ||
        msg.includes(`back to ${topicLower}`)
    );

    if (found) {
      circledBackTopics.push(topic);
    } else {
      missedTopics.push(topic);
    }
  }

  const working = circledBackTopics.length > 0 || missedTopics.length === 0;

  let suggestion: string | null = null;
  if (missedTopics.length > 0 && conversationHistory.length > 10) {
    const randomMissed = missedTopics[Math.floor(Math.random() * missedTopics.length)];
    suggestion = `You haven't circled back to "${randomMissed}" yet. Consider bringing it up.`;
  }

  return { working, circledBackTopics, missedTopics, suggestion };
}

// ============================================================================
// PROACTIVE GOALS
// ============================================================================

/**
 * Generate proactive goal references
 */
export function getProactiveGoalReference(
  profile: UserProfile | null,
  currentTopic: string
): string | null {
  if (!profile?.goals || profile.goals.length === 0) return null;

  const activeGoals = profile.goals.filter((g) => g.status === 'active');
  if (activeGoals.length === 0) return null;

  // Find a relevant goal
  for (const goal of activeGoals) {
    const goalKeywords = [goal.type, ...(goal.name?.split(' ').slice(0, 5) || [])];
    const topicLower = currentTopic.toLowerCase();

    if (goalKeywords.some((kw) => topicLower.includes(kw.toLowerCase()))) {
      const progress =
        goal.progressPercent ??
        (goal.currentProgress && goal.targetAmount
          ? Math.round((goal.currentProgress / goal.targetAmount) * 100)
          : null);

      if (progress !== null) {
        if (progress >= 100) {
          return `Wait—didn't you already hit your ${goal.type} goal? We should celebrate that!`;
        } else if (progress >= 75) {
          return `You're ${progress}% of the way to your ${goal.type} goal! Almost there!`;
        } else if (progress >= 50) {
          return `Halfway to your ${goal.type} goal. How does that feel?`;
        } else if (progress >= 25) {
          return `I remember your ${goal.type} goal. You're making progress!`;
        }
      }

      return `This connects to that ${goal.type} goal you mentioned. Want to talk about how?`;
    }
  }

  // Random chance to mention a goal unprompted
  if (Math.random() < 0.1 && activeGoals.length > 0) {
    const randomGoal = activeGoals[Math.floor(Math.random() * activeGoals.length)];
    return `By the way, how's that ${randomGoal.type} goal coming along?`;
  }

  return null;
}

export default { verifyTopicThreading, getProactiveGoalReference };
