/**
 * Cognitive Context Builder
 *
 * Integrates persona-specific cognitive intelligence into context injections.
 * Makes each persona THINK differently - not just feel differently.
 *
 * This builder:
 * - Analyzes the current context and selects appropriate reasoning approach
 * - Generates attention cues for what this persona naturally notices
 * - Alerts to potential cognitive biases
 * - Adjusts for user expertise level
 * - Signals appropriate confidence levels
 */

import { registerContextBuilder, createInjection, createStandardInjection, createHintInjection } from './index.js';
import type { ContextBuilderInput, ContextInjection } from './index.js';
import {
  getCognitiveProfile,
  getCognitiveEngine,
  detectQuestionComplexity,
  detectUserExpertise,
} from '../../personas/cognitive-index.js';
import type { CognitiveContext, ReasoningStyle } from '../../personas/cognitive-types.js';

// Track reasoning styles used in this session
const sessionReasoningHistory: Map<string, ReasoningStyle[]> = new Map();

/**
 * Build cognitive intelligence context
 */
async function buildCognitiveContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const personaId = input.persona?.id;

  if (!personaId) {
    return injections;
  }

  // Get cognitive profile for this persona
  const profile = getCognitiveProfile(personaId);
  if (!profile) {
    // No cognitive profile defined for this persona - skip
    return injections;
  }

  // Get or create engine
  const engine = getCognitiveEngine(personaId, profile);

  // Initialize reasoning history for this session
  if (!sessionReasoningHistory.has(personaId)) {
    sessionReasoningHistory.set(personaId, []);
  }
  const previousApproaches = sessionReasoningHistory.get(personaId) || [];

  // Build cognitive context
  const cognitiveContext: CognitiveContext = {
    currentTopic: input.analysis.topics.primary || input.analysis.topics.detected[0] || 'general',
    userExpertise: detectUserExpertiseFromContext(input),
    emotionalWeight: calculateEmotionalWeight(input),
    questionComplexity: detectQuestionComplexity(input.userText),
    turnCount: input.userData.turnCount || 1,
    previousApproaches,
  };

  // Generate cognitive guidance
  const guidance = engine.generateGuidance(cognitiveContext);

  // Track the reasoning approach used
  previousApproaches.push(guidance.recommendedApproach);
  if (previousApproaches.length > 10) {
    previousApproaches.shift(); // Keep only last 10
  }

  // ============================================================================
  // 1. REASONING APPROACH - Core thinking style for this response
  // ============================================================================
  const reasoningPrompt = buildReasoningPrompt(guidance.recommendedApproach, profile.reasoningStyle);
  injections.push(
    createStandardInjection(
      'cognitive-reasoning',
      reasoningPrompt,
      { category: 'cognitive', confidence: 0.9 }
    )
  );

  // ============================================================================
  // 2. ATTENTION CUES - What this persona naturally notices
  // ============================================================================
  if (guidance.attentionCues.length > 0) {
    const attentionContent = guidance.attentionCues.slice(0, 2).join('\n');
    injections.push(
      createHintInjection(
        'cognitive-attention',
        attentionContent,
        { category: 'cognitive', confidence: 0.8 }
      )
    );
  }

  // ============================================================================
  // 3. BIAS AWARENESS - Alert persona to potential cognitive biases
  // ============================================================================
  if (guidance.biasAlerts.length > 0) {
    const biasContent = guidance.biasAlerts[0]; // Just one bias alert per turn
    injections.push(
      createHintInjection(
        'cognitive-bias',
        biasContent,
        { category: 'cognitive', confidence: 0.7 }
      )
    );
  }

  // ============================================================================
  // 4. EXPERTISE ADJUSTMENT - Adapt to user's knowledge level
  // ============================================================================
  if (guidance.expertiseAdjustment) {
    injections.push(
      createHintInjection(
        'cognitive-expertise',
        guidance.expertiseAdjustment,
        { category: 'cognitive', confidence: 0.75 }
      )
    );
  }

  // ============================================================================
  // 5. CONFIDENCE SIGNALING - Express appropriate uncertainty
  // ============================================================================
  if (guidance.confidenceLevel < 0.6) {
    const confidenceContent = buildConfidencePrompt(guidance.confidenceLevel, guidance.suggestedPhrases);
    injections.push(
      createHintInjection(
        'cognitive-confidence',
        confidenceContent,
        { category: 'cognitive', confidence: 0.85 }
      )
    );
  }

  // ============================================================================
  // 6. SHOW REASONING - When to make thinking visible
  // ============================================================================
  if (guidance.showReasoning) {
    const thinkingPhrases = guidance.suggestedPhrases.filter(p =>
      p.toLowerCase().includes('think') ||
      p.toLowerCase().includes('let me') ||
      p.toLowerCase().includes('wondering')
    );

    if (thinkingPhrases.length > 0 || profile.informationProcessing.deliberationLevel > 0.6) {
      injections.push(
        createHintInjection(
          'cognitive-thinking',
          `[SHOW THINKING] This deserves visible reasoning. Consider: "${thinkingPhrases[0] || profile.informationProcessing.thinkingAloudPhrases[0] || 'Let me think through this...'}"`,
          { category: 'cognitive', confidence: 0.7 }
        )
      );
    }
  }

  // ============================================================================
  // 7. SIGNATURE PHRASES - Persona's unique thinking expressions
  // ============================================================================
  if (profile.signatureThinkingPhrases.length > 0 && Math.random() < 0.25) {
    const phrase = profile.signatureThinkingPhrases[
      Math.floor(Math.random() * profile.signatureThinkingPhrases.length)
    ];
    injections.push(
      createHintInjection(
        'cognitive-signature',
        `[SIGNATURE] Consider using your characteristic phrase: "${phrase}"`,
        { category: 'cognitive', confidence: 0.6 }
      )
    );
  }

  return injections;
}

/**
 * Detect user expertise from context
 */
function detectUserExpertiseFromContext(
  input: ContextBuilderInput
): 'novice' | 'intermediate' | 'expert' | 'unknown' {
  // Check user profile for expertise indicators
  if (input.userProfile) {
    // Formal communication style often indicates expertise
    if (input.userProfile.communicationStyle === 'formal') {
      return 'intermediate';
    }
    // Concise preference often indicates familiarity with topic
    if (input.userProfile.preferences?.verbosity === 'concise') {
      return 'intermediate';
    }
    // Storytelling preference may indicate novice wanting more context
    if (input.userProfile.preferences?.verbosity === 'storytelling') {
      return 'novice';
    }
  }

  // Check conversation history
  const historyTracker = input.services.historyTracker;
  if (historyTracker) {
    const turns = historyTracker.getSimpleTurns();
    const userMessages = turns.filter(t => t.role === 'user').map(t => t.content);

    if (userMessages.length >= 2) {
      const topic = input.analysis.topics.primary || 'general';
      return detectUserExpertise(userMessages, topic);
    }
  }

  return 'unknown';
}

/**
 * Calculate emotional weight of the conversation
 */
function calculateEmotionalWeight(input: ContextBuilderInput): number {
  const emotion = input.analysis.emotion;

  let weight = emotion.intensity || 0.3;

  // Increase for distress
  if (emotion.distressLevel) {
    weight = Math.max(weight, emotion.distressLevel);
  }

  // Increase for support needs
  if (emotion.needsSupport) {
    weight = Math.max(weight, 0.7);
  }

  // Increase for venting
  if (emotion.isVenting) {
    weight = Math.max(weight, 0.6);
  }

  // Increase for mental health signals
  if (emotion.mentalHealthSignals && emotion.mentalHealthSignals.length > 0) {
    weight = Math.max(weight, 0.8);
  }

  return Math.min(1.0, weight);
}

/**
 * Build reasoning approach prompt
 */
function buildReasoningPrompt(approach: ReasoningStyle, primaryStyle: ReasoningStyle): string {
  const approachDescriptions: Record<ReasoningStyle, string> = {
    analytical: 'Think through this analytically. Work from evidence and patterns to conclusions. Use clear logical steps.',
    intuitive: 'Trust your intuitive sense here. See the whole picture before the parts. Connect through understanding.',
    empathetic: 'Lead with emotional awareness. Validate feelings before moving to problem-solving. Connect human-to-human.',
    systematic: 'Approach this systematically. Break it into clear steps. Consider the process and structure.',
    narrative: 'Think in stories and journeys. Connect this to a larger narrative. Use metaphors and meaning.',
    pragmatic: 'Focus on what works. What are the practical outcomes? Be action-oriented and results-focused.',
  };

  const isSwitching = approach !== primaryStyle;
  const switchNote = isSwitching
    ? ` (Note: Shifting from your usual ${primaryStyle} approach to ${approach} for this context)`
    : '';

  return `[COGNITIVE MODE: ${approach.toUpperCase()}]${switchNote}\n${approachDescriptions[approach]}`;
}

/**
 * Build confidence prompt
 */
function buildConfidencePrompt(confidence: number, suggestedPhrases: string[]): string {
  const level = confidence < 0.3 ? 'low' : confidence < 0.5 ? 'moderate' : 'uncertain';
  const phrase = suggestedPhrases[0] || 'I\'m not entirely sure about this...';

  return `[CONFIDENCE: ${Math.round(confidence * 100)}% - ${level}]\nExpress appropriate uncertainty. Consider: "${phrase}"`;
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'cognitive',
  description: 'Persona-specific cognitive intelligence - reasoning style, attention, biases',
  priority: 75, // High priority - shapes how persona thinks
  build: buildCognitiveContext,
});

export { buildCognitiveContext };
export default buildCognitiveContext;

