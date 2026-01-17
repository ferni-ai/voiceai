/**
 * Humanizing Context Builder
 *
 * Builds humanizing context (voice emotion, inner world, mood)
 * for making AI responses feel more natural and empathetic.
 */

import {
  buildHumanizingContext,
  getHumanizingSummary,
  getMoodShift,
  shouldMoodShift,
  type HumanizingResult,
} from '../../intelligence/context-builders/humanization/humanizing.js';
import {
  logHumanizingResult,
  logValidation,
} from '../../intelligence/context-builders/humanization/humanizing-debug.js';
import { extractPersonalThemes } from '../session/session-state.js';
import type { TurnAnalysisResult, TurnContext } from './types.js';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build humanizing context (voice emotion, inner world, mood)
 */
export function buildHumanizingContextForTurn(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult
): HumanizingResult | null {
  const { persona, bundleRuntime, services, userData, userText } = ctx;
  const { analysis, currentTopic } = analysisResult;

  try {
    const userProfileRelationshipStage = services.userProfile?.relationshipStage;
    const { previousRelationshipStage } = userData;

    const humanizingContext = {
      persona,
      bundleRuntime,
      voiceEmotion: userData.voiceEmotion || null,
      textEmotion: analysis.emotion
        ? {
            primary: analysis.emotion.primary,
            confidence: analysis.emotion.confidence || 0.7,
            valence: analysis.emotion.valence || 'neutral',
            distressLevel: analysis.emotion.distressLevel,
            intensity: analysis.emotion.intensity || 0.5,
            markers: analysis.emotion.markers || [],
            suggestedTone: (analysis.emotion.suggestedTone || 'neutral') as
              | 'warm'
              | 'gentle'
              | 'enthusiastic'
              | 'calm'
              | 'serious'
              | 'friendly'
              | 'reassuring'
              | 'informative'
              | 'measured',
          }
        : null,
      userMessage: userText,
      currentTopic,
      recentTopics: analysis.topics.detected,
      turnCount: userData.turnCount || 0,
      sessionCount: services.userProfile?.totalConversations || 1,
      userName: userData.name,
      isVulnerableMoment: analysis.emotion.distressLevel > 0.5,
      userEmotionIntensity: analysis.emotion.intensity,
      totalTurns: services.userProfile?.totalConversations
        ? services.userProfile.totalConversations * 10 + (userData.turnCount || 0)
        : userData.turnCount || 0,
      sharedVulnerabilities: Math.min((services.userProfile?.totalConversations || 0) / 3, 5),
      celebratedTogether: Math.min((services.userProfile?.totalConversations || 0) / 5, 3),
      difficultConversations: Math.min((services.userProfile?.totalConversations || 0) / 8, 2),
      userProfileRelationshipStage,
      previousRelationshipStage,
      usedShareTags: userData.usedShareTags || [],
      spontaneousShareCount: userData.spontaneousShareCount || 0,
      lastMood: userData.lastMood,
      // Personal theme tracking (prevents "always talks about Wyoming/Japan/book")
      mentionedPersonalThemes: userData.mentionedPersonalThemes || new Set<string>(),
    };

    const result = buildHumanizingContext(humanizingContext);

    // Update userData with tracking
    if (userData) {
      userData.usedShareTags = result.usedTags;
      if (result.spontaneousShare) {
        userData.spontaneousShareCount = (userData.spontaneousShareCount || 0) + 1;
      }
      userData.lastMood = result.mood.state;
      userData.previousRelationshipStage = result.relationship.stage;

      // Track personal themes from inner world content (prevents "always talks about Wyoming")
      if (result.innerWorldContent && result.innerWorldContent.length > 0) {
        const mentionedThemes = userData.mentionedPersonalThemes || new Set<string>();
        for (const content of result.innerWorldContent) {
          const themes = extractPersonalThemes(content.content);
          themes.forEach((theme) => mentionedThemes.add(theme));
        }
        userData.mentionedPersonalThemes = mentionedThemes;
        if (mentionedThemes.size > 0) {
          ctx.logger.debug(
            { themes: Array.from(mentionedThemes) },
            '🏔️ Personal themes tracked (prevents repetition)'
          );
        }
      }
    }

    // Check for mood shift
    const topicWeight =
      analysis.emotion.distressLevel > 0.6
        ? ('heavy' as const)
        : analysis.emotion.distressLevel > 0.3
          ? ('medium' as const)
          : ('light' as const);

    if (shouldMoodShift(result.mood, analysis.emotion.primary, topicWeight)) {
      const newMoodState = getMoodShift(
        result.mood.state,
        `${analysis.emotion.primary}_${topicWeight}`
      );
      ctx.logger.info(
        { from: result.mood.state, to: newMoodState, reason: topicWeight },
        '🌤️ Mood shifting'
      );
      if (userData) {
        userData.lastMood = newMoodState;
      }
    }

    ctx.logger.info({ summary: getHumanizingSummary(result) }, '🎭 Humanizing context built');

    // Debug logging
    logHumanizingResult(result, userText);
    logValidation(result);

    return result;
  } catch (error) {
    ctx.logger.warn({ error: String(error) }, 'Humanizing context failed (non-fatal)');
    return null;
  }
}
