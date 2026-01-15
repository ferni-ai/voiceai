/**
 * Dynamic Context Building Module
 *
 * Builds rich context for prompt enrichment based on:
 * - Communication preferences
 * - Key moments
 * - Remembered details
 * - Relationship depth
 * - Emotional history
 * - Active goals
 * - Known concerns
 *
 * @module user-learning-engine/context-building
 */

import type { UserProfile, KeyMoment, EmotionalPattern } from '../../types/user-profile.js';
import { inferUserPreferences, getPreferenceGuidance } from '../human-behaviors/index.js';
import type { LearningInsight, DynamicUserContext } from './types.js';
import type { SmallDetail } from '../tracking/conversation-quality.js';

/**
 * Build dynamic context for prompt enrichment
 */
export function buildDynamicContext(
  profile: UserProfile | null,
  sessionInsights: LearningInsight[],
  sessionKeyMoments: KeyMoment[],
  sessionSmallDetails: SmallDetail[],
  sessionEmotions: EmotionalPattern[],
  topicsDiscussed: string[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): DynamicUserContext {
  const sections: string[] = [];

  // 1. Communication guidance
  let communicationGuidance = '';
  let preferenceGuidance = '';

  if (profile) {
    // From profile
    if (profile.communicationStyle !== 'mixed') {
      communicationGuidance = `User prefers ${profile.communicationStyle} communication.`;
    }
    if (profile.preferences.verbosity !== 'balanced') {
      communicationGuidance += ` Keep responses ${profile.preferences.verbosity === 'concise' ? 'short and direct' : 'detailed with stories'}.`;
    }
    if (profile.humorAppreciation === 'high') {
      communicationGuidance += ' Feel free to be playful and joke.';
    } else if (profile.humorAppreciation === 'low') {
      communicationGuidance += ' Keep it serious, minimal humor.';
    }
  }

  // From session insights (override profile with recent learnings)
  const recentInsights = sessionInsights.filter(
    (i) => i.type === 'preference' || i.type === 'communication_style'
  );
  for (const insight of recentInsights) {
    if (insight.key === 'communicationStyle') {
      communicationGuidance = `User ${insight.source === 'inferred' ? 'seems to' : ''} prefer${insight.source === 'inferred' ? '' : 's'} ${insight.value} communication.`;
    }
  }

  // Get preference guidance from inference
  if (conversationHistory.length >= 3) {
    const userMessages = conversationHistory.filter((m) => m.role === 'user').map((m) => m.content);
    const inferred = inferUserPreferences(userMessages, profile);
    preferenceGuidance = getPreferenceGuidance(inferred);
  }

  // 2. Key moments from this session
  const relevantKeyMoments = sessionKeyMoments.slice(-3).map((km) => km.summary);

  // Key moments from profile (recent ones)
  if (profile?.keyMoments) {
    const recentProfileMoments = profile.keyMoments
      .filter((km) => {
        const daysSince = (Date.now() - new Date(km.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince < 30; // Last 30 days
      })
      .slice(-2)
      .map((km) => km.summary);
    relevantKeyMoments.push(...recentProfileMoments);
  }

  // 3. Remembered details
  const rememberedDetails: string[] = [];
  for (const detail of sessionSmallDetails.slice(-5)) {
    rememberedDetails.push(`${detail.type}: ${detail.value}`);
  }

  // 4. Topics
  const relevantPastTopics = [...topicsDiscussed];
  if (profile?.preferredTopics) {
    relevantPastTopics.push(...profile.preferredTopics.slice(0, 3));
  }

  // 5. Relationship depth
  let relationshipDepth = 'New conversation';
  if (profile) {
    if (profile.relationshipStage === 'old_friend') {
      relationshipDepth = `Close relationship - ${profile.totalConversations} conversations, ${Math.round(profile.totalMinutesTalked / 60)} hours together`;
    } else if (profile.relationshipStage === 'trusted_advisor') {
      relationshipDepth = `Trusted advisor - ${profile.totalConversations} conversations`;
    } else if (profile.relationshipStage === 'getting_to_know') {
      relationshipDepth = `Getting to know each other - ${profile.totalConversations} conversations so far`;
    }
  }

  // 6. Emotional history
  let emotionalHistory = '';
  if (sessionEmotions.length > 0) {
    const emotions = sessionEmotions.map((e) => e.emotion);
    const journey = [...new Set(emotions)].join(' → ');
    emotionalHistory = `This session: ${journey}`;
  }
  if (profile?.emotionalPatterns && profile.emotionalPatterns.length > 0) {
    const recent = profile.emotionalPatterns.slice(-5).map((p) => p.emotion);
    emotionalHistory += emotionalHistory
      ? `. Recent history: ${recent.join(', ')}`
      : `Recent: ${recent.join(', ')}`;
  }

  // 7. Active goals
  const activeGoals: string[] = [];
  if (profile?.goals) {
    for (const goal of profile.goals.filter(
      (g) => g.status === 'active' || g.status === 'on_track'
    )) {
      let goalStr = `${goal.type}: ${goal.name}`;
      if (goal.progressPercent !== undefined) {
        goalStr += ` (${goal.progressPercent}% complete)`;
      }
      activeGoals.push(goalStr);
    }
  }

  // 8. Known concerns
  const knownConcerns: string[] = [];
  if (profile?.primaryConcerns) {
    knownConcerns.push(...profile.primaryConcerns.filter((c) => c !== 'none' && c !== 'general'));
  }
  const concernInsights = sessionInsights.filter((i) => i.type === 'concern');
  for (const insight of concernInsights) {
    if (typeof insight.value === 'string') {
      knownConcerns.push(insight.value.slice(0, 50));
    }
  }

  // Build formatted context
  if (communicationGuidance) {
    sections.push(`[COMMUNICATION STYLE]\n${communicationGuidance}`);
  }
  if (preferenceGuidance) {
    sections.push(`[LEARNED PREFERENCES]\n${preferenceGuidance}`);
  }
  if (relevantKeyMoments.length > 0) {
    sections.push(
      `[KEY MOMENTS TO REMEMBER]\n${relevantKeyMoments.map((m) => `• ${m}`).join('\n')}`
    );
  }
  if (rememberedDetails.length > 0) {
    sections.push(`[REMEMBERED DETAILS]\n${rememberedDetails.map((d) => `• ${d}`).join('\n')}`);
  }
  if (activeGoals.length > 0) {
    sections.push(`[USER'S ACTIVE GOALS]\n${activeGoals.map((g) => `• ${g}`).join('\n')}`);
  }
  if (knownConcerns.length > 0) {
    sections.push(
      `[KNOWN CONCERNS - Handle Gently]\n${knownConcerns.map((c) => `• ${c}`).join('\n')}`
    );
  }
  if (emotionalHistory) {
    sections.push(`[EMOTIONAL CONTEXT]\n${emotionalHistory}`);
  }

  return {
    communicationGuidance,
    preferenceGuidance,
    relevantKeyMoments,
    relevantPastTopics: [...new Set(relevantPastTopics)],
    rememberedDetails,
    relationshipDepth,
    emotionalHistory,
    activeGoals,
    knownConcerns,
    formattedForPrompt: sections.join('\n\n'),
  };
}
