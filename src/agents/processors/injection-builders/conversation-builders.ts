/**
 * Conversation & Human-Level Injection Builders
 *
 * Handles conversation dynamics (narrative arc, engagement, rhythm, silence)
 * and human-level features (communication style, humor, story preference, emotional memory).
 *
 * Priority: 35-52
 */

import {
  FILLER_EMOTION_MIN_CONFIDENCE,
  EMOTION_STRONG_INTENSITY,
} from '../../../config/emotion-thresholds.js';
import type { ContextInjection } from '../types.js';
import type { ConversationDynamicsResult, HumanLevelFeaturesContext } from './types.js';

// ============================================================================
// CONVERSATION DYNAMICS INJECTION BUILDER
// Priority: 38-52
// ============================================================================

/**
 * Build conversation dynamics injections
 * Includes: narrative arc, engagement, rhythm, silence
 */
export function buildConversationDynamicsInjections(
  dynamics: ConversationDynamicsResult
): ContextInjection[] {
  const injections: ContextInjection[] = [];

  // Narrative arc - when user is building to a point
  if (dynamics.narrativeArc) {
    const {
      structure,
      climaxApproaching,
      hasReachedCore,
      suggestedIntervention,
      interventionGuidance,
    } = dynamics.narrativeArc;

    if (structure !== 'direct' || climaxApproaching || hasReachedCore) {
      const narrativeContent = hasReachedCore
        ? `[NARRATIVE: USER REACHED CORE] ${interventionGuidance}`
        : climaxApproaching
          ? `[NARRATIVE: CLIMAX APPROACHING] User is building to something important. ${interventionGuidance}`
          : structure === 'circular'
            ? `[NARRATIVE: CIRCULAR] User keeps returning to the same concern. ${interventionGuidance}`
            : structure === 'meandering'
              ? `[NARRATIVE: MEANDERING] ${interventionGuidance}`
              : `[NARRATIVE: ${structure.toUpperCase()}] Action: ${suggestedIntervention}. ${interventionGuidance}`;

      injections.push({
        category: 'narrative_arc',
        content: narrativeContent,
        priority: 48,
      });
    }
  }

  // Engagement tracking - when user seems disengaged
  if (dynamics.engagement) {
    const { level, declining, suggestedAction, actionGuidance } = dynamics.engagement;

    if (level === 'low' || level === 'distracted' || declining) {
      const engagementContent =
        level === 'distracted'
          ? `[⚠️ USER DISTRACTED] ${actionGuidance}`
          : level === 'low'
            ? `[ENGAGEMENT: LOW] ${actionGuidance}`
            : `[ENGAGEMENT: DECLINING] Consider: ${suggestedAction}. ${actionGuidance}`;

      injections.push({
        category: 'engagement',
        content: engagementContent,
        priority: declining ? 52 : 42,
      });
    }
  }

  // Rhythm guidance - match user's pacing
  if (dynamics.rhythm && dynamics.rhythm.guidance) {
    const { lengthMultiplier, energyLevel, guidance } = dynamics.rhythm;

    // Only inject if there's meaningful deviation from default
    if (lengthMultiplier < 0.8 || lengthMultiplier > 1.2 || energyLevel !== 'medium') {
      injections.push({
        category: 'rhythm',
        content: `[RHYTHM MATCH] ${guidance}${energyLevel !== 'medium' ? ` Energy: ${energyLevel}.` : ''}`,
        priority: 38,
      });
    }
  }

  // Silence decision - meaningful pauses
  if (dynamics.silence?.useSilence) {
    const { reason, duration } = dynamics.silence;
    injections.push({
      category: 'silence',
      content: `[MEANINGFUL SILENCE: ${reason.toUpperCase()}] Before responding, take ${Math.round(duration / 1000)}s pause. This communicates presence and care.`,
      priority: 46,
    });
  }

  return injections;
}

// ============================================================================
// HUMAN-LEVEL FEATURES INJECTION BUILDER
// Priority: 35-45
// ============================================================================

/**
 * Build human-level features injections
 * Includes: communication style, humor, story preference, emotional memory
 */
export async function buildHumanLevelInjections(
  ctx: HumanLevelFeaturesContext
): Promise<ContextInjection[]> {
  const { services, userData, userText, analysis, currentTopic, humorGuidance, logger } = ctx;
  const injections: ContextInjection[] = [];

  try {
    // Communication style
    await services.communicationMirroring.analyzeMessage(userText);
    const styleGuidance = services.communicationMirroring.formatGuidanceForPrompt();
    if (styleGuidance) {
      injections.push({
        category: 'communication_style',
        content: styleGuidance,
        priority: 45,
      });
    }

    // Humor calibration
    if (userData.lastResponseHadHumor) {
      const userLaughed =
        userData.voiceEmotion?.primary === 'happy' && userData.voiceEmotion.confidence > 0.6;
      services.humorCalibration.analyzeReaction(userText, userLaughed);
      userData.lastResponseHadHumor = false;
    }

    if (humorGuidance?.shouldAttempt) {
      const humorContent = [
        `[HUMOR OK]`,
        humorGuidance.type ? `Try ${humorGuidance.type} humor.` : '',
        humorGuidance.avoid?.length ? `Avoid: ${humorGuidance.avoid.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      injections.push({
        category: 'humor',
        content: humorContent,
        priority: 40,
      });
    }

    // Story preference
    if (userData.lastResponseHadStory) {
      services.storyPreference.analyzeEngagement(userText);
      userData.lastResponseHadStory = false;
    }

    const storyPrefGuidance = services.storyPreference.getStoryGuidance(
      currentTopic || 'general',
      analysis.emotion.primary,
      userData.turnCount || 0
    );
    if (storyPrefGuidance.shouldTellStory && storyPrefGuidance.recommendedType) {
      injections.push({
        category: 'story_preference',
        content: `[STORY PREFERENCE] User responds well to ${storyPrefGuidance.recommendedType} stories. Preferred: ${storyPrefGuidance.recommendedLength || 'medium'} length.`,
        priority: 38,
      });
    }

    // Emotional memory
    if (
      analysis.emotion.primary !== 'neutral' &&
      (analysis.emotion.intensity ?? FILLER_EMOTION_MIN_CONFIDENCE) > FILLER_EMOTION_MIN_CONFIDENCE
    ) {
      const intensity =
        (analysis.emotion.intensity ?? FILLER_EMOTION_MIN_CONFIDENCE) >= EMOTION_STRONG_INTENSITY
          ? 'strong'
          : 'moderate';
      services.emotionalMemory.recordMoment(
        analysis.emotion.primary as import('../../../intelligence/index.js').PrimaryEmotion,
        currentTopic || 'general',
        userText.slice(0, 50),
        userText,
        intensity
      );
    }

    const emotionalContext = services.emotionalMemory.formatForPrompt();
    if (emotionalContext) {
      injections.push({
        category: 'emotional_memory',
        content: emotionalContext,
        priority: 35,
      });
    }
  } catch (error) {
    logger.warn({ error: String(error) }, 'Human-level features failed (non-fatal)');
  }

  return injections;
}
