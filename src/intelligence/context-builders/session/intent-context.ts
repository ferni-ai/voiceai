/**
 * Intent Context Builder
 *
 * Handles intent-based guidance:
 * - Intent-based response guidance
 * - Acknowledgment before advice
 * - Phase-aware guidance
 * - Relationship context
 *
 * These shape the response based on what user wants.
 *
 * Extracted from jack-bogle.ts lines 1007-1051, 1188-1194
 */
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { getTransition } from '../../../tasks/transitions.js';

// ============================================================================
// INTENT HELPERS
// ============================================================================

type EmotionType = 'anxiety' | 'fear' | 'sadness' | 'frustration' | 'neutral';

/**
 * Get acknowledgment phrase before giving advice
 */
function getAcknowledgmentBeforeAdvice(emotion: string): string {
  const acknowledgments = {
    anxiety: [
      'I can hear this is weighing on you...',
      "That's a lot to carry...",
      "It makes sense you'd feel anxious about this...",
    ],
    fear: [
      'Fear is such a powerful emotion...',
      "It's natural to feel scared about the unknown...",
      'I understand why this feels scary...',
    ],
    sadness: [
      'That sounds really hard...',
      "I can hear the heaviness in what you're sharing...",
      "It's okay to feel sad about this...",
    ],
    frustration: [
      "I can understand why you'd be frustrated...",
      'That would frustrate anyone...',
      'You have every right to feel that way...',
    ],
    neutral: [
      "I hear what you're saying...",
      'Let me make sure I understand...',
      "That's an important question...",
    ],
  };
  const phrases = acknowledgments[emotion as EmotionType] || acknowledgments.neutral;
  return phrases[Math.floor(Math.random() * phrases.length)];
}
// ============================================================================
// INTENT CONTEXT BUILDER
// ============================================================================

// Extended services type to access methods
interface IntentServices {
  getPromptContext: () => {
    phase?: string;
    topicContext?: string;
    relationshipContext?: string;
    isReturning?: boolean;
  };
}

/**
 * Build intent-related context injections
 */
function buildIntentContext(input: ContextBuilderInput): ContextInjection[] {
  const { analysis, services } = input;
  const injections: ContextInjection[] = [];
  const primaryIntent = analysis.intent.primary;
  const promptContext = (services as unknown as IntentServices).getPromptContext?.() ?? {
    phase: undefined,
    topicContext: undefined,
    relationshipContext: undefined,
    isReturning: false,
  };
  // -----------------------------------------------
  // INTENT-BASED GUIDANCE
  // -----------------------------------------------
  if (primaryIntent === 'seeking_advice') {
    const transition = getTransition('toWisdom');
    injections.push(
      createStandardInjection(
        'intent_advice',
        `[INTENT: User seeking advice.
TRANSITION INTO ADVICE: "${transition}"
Share wisdom from experience. Use stories to illustrate.
DO NOT: Lecture. DO: Have a conversation.]`
      )
    );
  }
  if (analysis.intent.requiresEmpathy) {
    const transition = getTransition('supportToPractical');
    injections.push(
      createStandardInjection(
        'intent_empathy',
        `[INTENT: User needs empathy.
Prioritize comfort over information. Check in on them.
If you need to shift to practical later: "${transition}"]`
      )
    );
  }
  if (primaryIntent === 'asking_question' || primaryIntent === 'requesting_info') {
    const transition = getTransition('curious');
    injections.push(
      createHintInjection(
        'intent_curious',
        `[INTENT: User is curious.
Engage their curiosity. Consider: "${transition}"
Share interesting stories, draw connections.]`
      )
    );
  }
  if (
    primaryIntent === 'confiding' ||
    primaryIntent === 'sharing_news' ||
    analysis.intent.suggestedApproach?.includes('listen')
  ) {
    const transition = getTransition('checkIn');
    injections.push(
      createStandardInjection(
        'intent_confiding',
        `[INTENT: User sharing personal info.
Listen actively. Remember what they share.
After they finish, consider: "${transition}"]`
      )
    );
  }
  // -----------------------------------------------
  // ACKNOWLEDGMENT BEFORE ADVICE
  // -----------------------------------------------
  if (
    primaryIntent === 'seeking_advice' &&
    analysis.emotion.intensity &&
    analysis.emotion.intensity > 0.4
  ) {
    const ack = getAcknowledgmentBeforeAdvice(analysis.emotion.primary || 'neutral');
    injections.push(
      createStandardInjection(
        'acknowledgment',
        `[ACKNOWLEDGMENT: Before giving advice, acknowledge their emotion first: "${ack}"]`
      )
    );
  }
  // -----------------------------------------------
  // PHASE-AWARE GUIDANCE
  // -----------------------------------------------
  if (promptContext.phase) {
    injections.push(
      createHintInjection(
        'phase',
        `[CONVERSATION PHASE: ${promptContext.phase} - Focus: ${promptContext.topicContext || 'building rapport'}]`
      )
    );
  }
  // -----------------------------------------------
  // RELATIONSHIP CONTEXT
  // -----------------------------------------------
  if (promptContext.relationshipContext && promptContext.isReturning) {
    injections.push(
      createHintInjection('relationship', `[RELATIONSHIP: ${promptContext.relationshipContext}]`)
    );
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('intent', buildIntentContext);
export { buildIntentContext, getAcknowledgmentBeforeAdvice };
