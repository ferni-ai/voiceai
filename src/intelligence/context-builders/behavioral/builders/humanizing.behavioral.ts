/**
 * Humanizing Behavioral Builder
 *
 * Makes the conversation feel natural and human, not robotic.
 * This controls conversational style signals that prevent
 * overly formal or "AI-sounding" responses.
 *
 * @module intelligence/context-builders/behavioral/builders/humanizing
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals, StyleModifier, QuestionStyle } from '../signals.js';
import { createCallback } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

// ============================================================================
// CONVERSATIONAL FLOW DETECTION
// ============================================================================

type ConversationFlow = 'opening' | 'building' | 'deep' | 'winding_down' | 'flowing';

/**
 * Detect the current conversational flow
 */
function detectConversationFlow(
  turnCount: number,
  emotionalIntensity: number,
  sessionDurationMs: number
): ConversationFlow {
  // Opening: First couple turns
  if (turnCount <= 2) {
    return 'opening';
  }

  // Building: Turns 3-6, establishing rapport
  if (turnCount <= 6) {
    return 'building';
  }

  // Deep: High emotional intensity or heavy topic
  if (emotionalIntensity > 0.7) {
    return 'deep';
  }

  // Winding down: Long session (30+ minutes)
  if (sessionDurationMs > 30 * 60 * 1000) {
    return 'winding_down';
  }

  // Default: Flowing conversation
  return 'flowing';
}

/**
 * Get style based on conversation flow
 */
function getFlowStyle(flow: ConversationFlow): StyleModifier {
  switch (flow) {
    case 'opening':
      return 'exploratory';
    case 'building':
      return 'collaborative';
    case 'deep':
      return 'supportive';
    case 'winding_down':
      return 'collaborative';
    case 'flowing':
    default:
      return 'collaborative';
  }
}

/**
 * Get question style based on context
 */
function getQuestionStyle(
  flow: ConversationFlow,
  isVulnerableMoment: boolean,
  turnsSinceQuestion: number
): QuestionStyle {
  // Don't ask questions in vulnerable moments
  if (isVulnerableMoment) {
    return 'none';
  }

  // Opening: Open-ended to explore
  if (flow === 'opening') {
    return 'open';
  }

  // Building: Curious, exploratory
  if (flow === 'building') {
    return 'open';
  }

  // Deep: Reflective, not probing
  if (flow === 'deep') {
    return 'reflective';
  }

  // If we've asked questions recently, hold back
  if (turnsSinceQuestion < 2) {
    return 'none';
  }

  // Default: Open but not required
  return 'open';
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

async function buildHumanizingBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userData, analysis, services } = input;

  const turnCount = userData?.turnCount || 0;
  const emotionalIntensity = analysis?.emotion?.intensity || 0.5;
  const sessionDurationMs = services?.sessionStartTime ? Date.now() - services.sessionStartTime : 0;

  // Detect conversation flow
  const flow = detectConversationFlow(turnCount, emotionalIntensity, sessionDurationMs);

  const signals: BehavioralSignals = {
    source: 'humanizing',
    confidence: 0.6,
    priority: 35,
    style: getFlowStyle(flow),
    questionStyle: getQuestionStyle(
      flow,
      analysis?.emotion?.needsSupport || false,
      2 // TODO: Track actual turns since question
    ),
  };

  // Conversation-specific hints (not facts, just behavioral nudges)
  const callbacks = [];

  // Opening: Warmth matters
  if (flow === 'opening') {
    signals.tone = 'warm';
  }

  // Building rapport: Be genuinely curious
  if (flow === 'building' && Math.random() < 0.3) {
    callbacks.push(
      createCallback('pattern', 'Show genuine curiosity about what they shared.', 'subtle')
    );
  }

  // Deep conversation: Don't break the moment
  if (flow === 'deep') {
    signals.avoidances = ['changing subject suddenly', 'being too cheerful'];
  }

  // Long conversation: Variety helps
  if (flow === 'winding_down') {
    callbacks.push(
      createCallback('pattern', 'Been talking a while. Natural pauses are okay.', 'subtle')
    );
  }

  if (callbacks.length > 0) {
    signals.callbacks = callbacks;
  }

  return signals;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'humanizing',
  description: 'Natural conversational flow and human-like interaction',
  priority: 35,
  category: 'style',
  build: buildHumanizingBehavior,
});

export { buildHumanizingBehavior };
