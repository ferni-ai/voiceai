/**
 * Advanced Humanization Processor
 *
 * Coordinates all 10 deep humanization capabilities:
 * 1. Subtext Detection - Read between the lines
 * 2. Emotional Aftercare - Guide back to equilibrium
 * 3. Conversational Repair - Recover from miscommunication
 * 4. Hope Injection - Subtle forward-looking language
 * 5. Curiosity Engine - Genuine interest in their life
 * 6. Energy Regulation - Lead vs match energy
 * 7. Micro-Affirmations - Tiny validations throughout
 * 8. Temporal Context - Life rhythm awareness
 * 9. Relationship Events - Track milestones
 * 10. Paradoxical Intervention - Know when advice backfires
 */

import { diag } from '../../services/observability/diagnostic-logger.js';
import {
  buildAdvancedHumanizationInjections,
  type AdvancedHumanizationInjectionResult,
} from './injection-builders.js';
import type { EmotionalState, TurnAnalysisResult, TurnContext } from './types.js';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Process advanced humanization for a turn
 */
export async function processAdvancedHumanization(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult,
  emotionalState: EmotionalState
): Promise<AdvancedHumanizationInjectionResult | null> {
  const { services, userData } = ctx;
  const { analysis, currentTopic } = analysisResult;

  // Determine relationship depth from profile
  // Map from UserProfile's RelationshipStage to advanced humanization's depth
  let relationshipDepth: 'new' | 'developing' | 'established' | 'deep' = 'developing';
  const stage = services.userProfile?.relationshipStage;
  if (stage) {
    const stageStr = String(stage).toLowerCase();
    if (stageStr.includes('new') || stageStr.includes('stranger')) {
      relationshipDepth = 'new';
    } else if (
      stageStr.includes('acquaint') ||
      stageStr.includes('getting') ||
      stageStr.includes('building')
    ) {
      relationshipDepth = 'developing';
    } else if (stageStr.includes('friend') || stageStr.includes('established')) {
      relationshipDepth = 'established';
    } else if (
      stageStr.includes('trusted') ||
      stageStr.includes('old') ||
      stageStr.includes('deep')
    ) {
      relationshipDepth = 'deep';
    }
  }

  try {
    const result = await buildAdvancedHumanizationInjections({
      sessionId: services.sessionId,
      userId: services.userId || 'anonymous',
      userText: ctx.userText,
      turnCount: userData.turnCount || 0,
      detectedEmotion: analysis.emotion.primary,
      valence:
        analysis.emotion.valence === 'positive'
          ? 0.5
          : analysis.emotion.valence === 'negative'
            ? -0.5
            : 0,
      arousal: analysis.emotion.intensity || 0.5,
      topic: currentTopic,
      relationshipDepth,
      prosodyHints: userData.voiceEmotion
        ? {
            speechRate: userData.voiceEmotion.confidence, // Use as proxy
            volume: userData.voiceEmotion.confidence || 0.5, // Use confidence as proxy for volume too
          }
        : undefined,
    });

    return result;
  } catch (error) {
    diag.warn('Advanced humanization failed (non-fatal)', { error: String(error) });
    return null;
  }
}
