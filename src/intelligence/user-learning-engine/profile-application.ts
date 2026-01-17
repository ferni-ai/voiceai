/**
 * Profile Application Module
 *
 * Applies learning data to user profile:
 * - Key moments
 * - Emotional patterns
 * - Preference updates
 * - Follow-ups
 * - Topic interests
 * - Concerns
 * - Stories told
 *
 * @module user-learning-engine/profile-application
 */

import type { UserProfile } from '../../types/user-profile.js';
import type { ConversationLearningData } from './types.js';

/**
 * Apply learning data to user profile
 */
export function applyLearningToProfile(
  profile: UserProfile,
  learning: ConversationLearningData
): UserProfile {
  const updated = { ...profile };
  const now = new Date();

  // Apply key moments
  updated.keyMoments = [...(updated.keyMoments || []), ...learning.keyMoments];

  // Apply emotional patterns
  updated.emotionalPatterns = [
    ...(updated.emotionalPatterns || []),
    ...learning.emotionalPatterns,
  ].slice(-50);

  // Apply preference updates
  if (
    learning.preferenceUpdates.responseLength &&
    learning.preferenceUpdates.responseLength !== 'unknown'
  ) {
    updated.preferences = {
      ...updated.preferences,
      verbosity:
        learning.preferenceUpdates.responseLength === 'brief'
          ? 'concise'
          : learning.preferenceUpdates.responseLength === 'thorough'
            ? 'storytelling'
            : 'balanced',
    };
  }

  if (
    learning.preferenceUpdates.humorReceptivity &&
    learning.preferenceUpdates.humorReceptivity !== 'unknown'
  ) {
    updated.humorAppreciation = learning.preferenceUpdates.humorReceptivity;
  }

  // Apply follow-ups
  for (const followUp of learning.followUps) {
    if (!updated.pendingFollowUps.some((f) => f.topic === followUp.topic)) {
      updated.pendingFollowUps.push({
        topic: followUp.topic,
        targetDate: followUp.suggestedDate,
        reason: followUp.reason,
      });
    }
  }

  // Update topics from insights
  for (const insight of learning.insights) {
    if (insight.type === 'topic_interest' && typeof insight.value === 'string') {
      if (!updated.preferredTopics.includes(insight.value)) {
        updated.preferredTopics.push(insight.value);
      }
    }
  }

  // Update concerns from insights
  for (const insight of learning.insights) {
    if (insight.type === 'concern' && typeof insight.value === 'string') {
      if (!updated.financialAnxietyTriggers) {
        updated.financialAnxietyTriggers = [];
      }
      // Extract key concern topic
      const concernWords = insight.value
        .toLowerCase()
        .match(/\b(market|crash|retire|debt|job|money|savings|invest|fees|loss)\b/);
      if (concernWords && !updated.financialAnxietyTriggers.includes(concernWords[1])) {
        updated.financialAnxietyTriggers.push(concernWords[1]);
      }
    }
  }

  // Update last conversation summary from farewell
  if (learning.farewellSummary) {
    updated.lastConversationSummary = learning.farewellSummary.keyThingsToRemember
      .slice(0, 2)
      .join('; ');
  }

  // Track stories told (to avoid repetition in future)
  if (learning.storiesTold && learning.storiesTold.length > 0) {
    if (!updated.sharedStories) {
      updated.sharedStories = [];
    }
    for (const story of learning.storiesTold) {
      // Only add if not already tracked
      if (!updated.sharedStories.some((s) => s.storyId === story.storyId)) {
        updated.sharedStories.push({
          storyId: story.storyId,
          theme: story.theme,
          sharedAt: story.sharedAt,
          context: story.theme,
        });
      }
    }
    // Keep only last 50 stories
    updated.sharedStories = updated.sharedStories.slice(-50);
  }

  updated.updatedAt = now;
  updated.version++;

  return updated;
}
