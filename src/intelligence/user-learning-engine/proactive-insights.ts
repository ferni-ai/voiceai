/**
 * Proactive Insights Module
 *
 * Generates proactive insights - natural suggestions based on what
 * we've learned about the user. Called mid-conversation to suggest
 * things that might naturally come up.
 *
 * @module user-learning-engine/proactive-insights
 */

import type { UserProfile, KeyMoment } from '../../types/user-profile.js';
import type { SmallDetail } from '../conversation-quality.js';

/**
 * Generate proactive insights - natural suggestions based on what we've learned
 * Called mid-conversation to suggest things that might naturally come up
 */
export function getProactiveInsight(
  profile: UserProfile | null,
  turnCount: number,
  sessionSmallDetails: SmallDetail[],
  topicsDiscussed: string[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): string | null {
  // Only suggest proactively after warmup (turns 4-8) or periodically
  if (turnCount < 4) return null;
  if (turnCount > 8 && turnCount % 6 !== 0) return null;

  // 1. Check for pending follow-ups from previous sessions
  if (profile?.pendingFollowUps && profile.pendingFollowUps.length > 0) {
    const followUp = profile.pendingFollowUps[0];
    const daysSince = Math.floor(
      (Date.now() - new Date(followUp.targetDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince >= 0) {
      return `I've been meaning to ask - how's that ${followUp.topic} situation going?`;
    }
  }

  // 2. Check for goal milestones to celebrate or check on
  if (profile?.goals && profile.goals.length > 0) {
    const activeGoals = profile.goals.filter(
      (g) => g.status === 'active' || g.status === 'on_track'
    );

    for (const goal of activeGoals) {
      // Near completion - celebrate
      if (goal.progressPercent && goal.progressPercent >= 90) {
        return `You're so close to that ${goal.type} goal! How does it feel being at ${goal.progressPercent}%?`;
      }
      // Halfway - encourage
      if (goal.progressPercent && goal.progressPercent >= 45 && goal.progressPercent <= 55) {
        return `You're about halfway to your ${goal.type} goal. That's real progress.`;
      }
    }
  }

  // 3. Reference a key moment from previous conversations
  if (profile?.keyMoments && profile.keyMoments.length > 0) {
    const recentMoments = profile.keyMoments.filter((km) => {
      const daysSince = (Date.now() - new Date(km.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince < 30 && km.followUpNeeded;
    });

    if (recentMoments.length > 0 && Math.random() < 0.3) {
      const moment = recentMoments[0];
      const timeAgo = getTimeAgoString(moment.timestamp);

      if (moment.type === 'concern') {
        return `I've been thinking about what you mentioned ${timeAgo}. How are you feeling about that now?`;
      }
      if (moment.type === 'decision') {
        return `How's that decision you made ${timeAgo} working out?`;
      }
    }
  }

  // 4. Small detail callback - shows we remember
  if (sessionSmallDetails.length > 0 && Math.random() < 0.2) {
    const detail = sessionSmallDetails[Math.floor(Math.random() * sessionSmallDetails.length)];

    if (detail.type === 'person_name') {
      return `By the way, how's ${detail.value} doing?`;
    }
    if (detail.type === 'pet_name') {
      return `How's ${detail.value}?`;
    }
  }

  // 5. Topic from this session that wasn't explored deeply
  const shallowTopics = topicsDiscussed.filter((topic) => {
    const mentions = conversationHistory.filter((m) =>
      m.content.toLowerCase().includes(topic.toLowerCase())
    ).length;
    return mentions <= 2;
  });

  if (shallowTopics.length > 0 && Math.random() < 0.25) {
    const topic = shallowTopics[0];
    return `You mentioned ${topic} earlier. Was there more to that?`;
  }

  return null;
}

/**
 * Helper for proactive insights - get time ago string
 */
function getTimeAgoString(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'earlier';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'a few days ago';
  if (diffDays < 14) return 'last week';
  if (diffDays < 30) return 'a couple weeks ago';
  return 'last month';
}
