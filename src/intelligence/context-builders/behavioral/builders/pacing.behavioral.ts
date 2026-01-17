/**
 * Pacing Behavioral Builder
 *
 * Controls response length and pacing based on context.
 * This is critical for voice - we don't want to ramble when
 * the user needs a quick acknowledgment.
 *
 * @module intelligence/context-builders/behavioral/builders/pacing
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals, LengthModifier, PaceModifier } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';
import { DISTRESS } from '../../../distress-levels.js';

// ============================================================================
// PACING RULES
// ============================================================================

interface PacingContext {
  turnCount: number;
  messageLength: number;
  isQuestion: boolean;
  emotionalIntensity: number;
  distressLevel: number;
  isVenting: boolean;
  isFollowUp: boolean;
}

/**
 * Determine appropriate response length
 */
function determineLengthStrategy(ctx: PacingContext): LengthModifier {
  // High distress: Keep it brief, don't overwhelm
  if (ctx.distressLevel >= DISTRESS.MODERATE) {
    return 'brief';
  }

  // Venting: They need to be heard, not lectured
  if (ctx.isVenting) {
    return 'brief';
  }

  // Short user message: Mirror their brevity
  if (ctx.messageLength < 20) {
    return 'brief';
  }

  // First few turns: Don't overwhelm, build rapport
  if (ctx.turnCount <= 2) {
    return 'moderate';
  }

  // Questions usually deserve fuller answers
  if (ctx.isQuestion && ctx.messageLength > 50) {
    return 'moderate';
  }

  // Follow-up questions: Brief is usually better
  if (ctx.isFollowUp) {
    return 'brief';
  }

  // Default: Moderate
  return 'moderate';
}

/**
 * Determine appropriate response pace
 */
function determinePaceStrategy(ctx: PacingContext): PaceModifier {
  // High emotional intensity: Slow down
  if (ctx.emotionalIntensity > 0.7 || ctx.distressLevel >= DISTRESS.MODERATE) {
    return 'slow';
  }

  // Venting: Slow, present
  if (ctx.isVenting) {
    return 'slow';
  }

  // Quick follow-up: Match their brisk energy
  if (ctx.isFollowUp && ctx.messageLength < 30) {
    return 'brisk';
  }

  return 'normal';
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

async function buildPacingBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userText, analysis, userData } = input;

  const ctx: PacingContext = {
    turnCount: userData?.turnCount || 0,
    messageLength: userText?.length || 0,
    isQuestion: analysis?.intent?.isQuestion || false,
    emotionalIntensity: analysis?.emotion?.intensity || 0.5,
    distressLevel: analysis?.emotion?.distressLevel || 0,
    isVenting: analysis?.emotion?.isVenting || false,
    isFollowUp: analysis?.intent?.isFollowUp || false,
  };

  const signals: BehavioralSignals = {
    source: 'pacing',
    confidence: 0.7,
    priority: 45, // Moderate priority
    length: determineLengthStrategy(ctx),
    pace: determinePaceStrategy(ctx),
  };

  // Additional avoidances based on context
  if (ctx.isVenting) {
    signals.avoidances = ['giving long responses', 'asking multiple questions'];
  }

  if (ctx.distressLevel >= DISTRESS.MODERATE) {
    signals.avoidances = [
      ...(signals.avoidances || []),
      'overwhelming with information',
      'being too wordy',
    ];
  }

  return signals;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'pacing',
  description: 'Response length and pacing based on context',
  priority: 45,
  category: 'style',
  build: buildPacingBehavior,
});

export { buildPacingBehavior };
