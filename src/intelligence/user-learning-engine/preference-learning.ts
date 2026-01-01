/**
 * Preference Learning Module
 *
 * Learns user preferences from conversation patterns:
 * - Communication style
 * - Response length preferences
 * - Story appetite
 * - Humor receptivity
 *
 * @module user-learning-engine/preference-learning
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import { inferUserPreferences, getPreferenceGuidance } from '../human-behaviors.js';
import type { LearningInsight, PreferenceUpdates } from './types.js';

const log = getLogger();

/**
 * Learn preferences from conversation patterns
 */
export function learnPreferences(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  profile: UserProfile | null,
  sessionInsights: LearningInsight[]
): void {
  const userMessages = conversationHistory.filter((m) => m.role === 'user').map((m) => m.content);

  if (userMessages.length < 3) return;

  const preferences = inferUserPreferences(userMessages, profile);

  // Convert preferences to insights
  if (preferences.communicationStyle !== 'unknown') {
    sessionInsights.push({
      type: 'communication_style',
      key: 'communicationStyle',
      value: preferences.communicationStyle,
      confidence: 0.7,
      source: 'inferred',
      capturedAt: new Date(),
    });
  }

  if (preferences.responseLength !== 'unknown') {
    sessionInsights.push({
      type: 'preference',
      key: 'verbosity',
      value:
        preferences.responseLength === 'brief'
          ? 'concise'
          : preferences.responseLength === 'thorough'
            ? 'storytelling'
            : 'balanced',
      confidence: 0.7,
      source: 'inferred',
      capturedAt: new Date(),
    });
  }

  if (preferences.storyAppetite !== 'unknown') {
    sessionInsights.push({
      type: 'preference',
      key: 'storyAppetite',
      value: preferences.storyAppetite,
      confidence: 0.6,
      source: 'inferred',
      capturedAt: new Date(),
    });
  }

  if (preferences.humorReceptivity !== 'unknown') {
    sessionInsights.push({
      type: 'preference',
      key: 'humorAppreciation',
      value: preferences.humorReceptivity,
      confidence: 0.6,
      source: 'inferred',
      capturedAt: new Date(),
    });
  }

  log.debug({ preferences }, 'Learned user preferences');
}

/**
 * Build preference updates from insights
 */
export function buildPreferenceUpdates(sessionInsights: LearningInsight[]): PreferenceUpdates {
  const updates: PreferenceUpdates = {};

  for (const insight of sessionInsights) {
    if (insight.type === 'preference' && insight.confidence > 0.6) {
      if (insight.key === 'verbosity' && typeof insight.value === 'string') {
        updates.responseLength = insight.value as 'brief' | 'thorough' | 'unknown';
      }
      if (insight.key === 'storyAppetite') {
        updates.storyAppetite = insight.value as 'loves_stories' | 'prefers_facts' | 'unknown';
      }
      if (insight.key === 'humorAppreciation') {
        updates.humorReceptivity = insight.value as 'high' | 'medium' | 'low' | 'unknown';
      }
    }
  }

  return updates;
}

/**
 * Get preference guidance for prompt injection
 */
export function getInferredPreferenceGuidance(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  profile: UserProfile | null
): string {
  if (conversationHistory.length < 3) return '';

  const userMessages = conversationHistory.filter((m) => m.role === 'user').map((m) => m.content);
  const inferred = inferUserPreferences(userMessages, profile);
  return getPreferenceGuidance(inferred);
}
