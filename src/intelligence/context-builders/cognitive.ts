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
 * - Detects user cognitive style for better matching
 * - Builds reasoning chains for complex situations
 * - Resolves cognitive conflicts between persona style and user needs
 * - Tracks cognitive learning over time
 * - Manages knowledge state to avoid re-explaining
 * - Adapts cognitive approach based on relationship depth
 * - Generates cognitive-appropriate questions
 * - Integrates team cognitive perspectives
 */

import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  createInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getCognitiveProfile,
  getCognitiveEngine,
  detectQuestionComplexity,
  detectUserExpertise,
} from '../../personas/cognitive-index.js';
import type { CognitiveContext, ReasoningStyle } from '../../personas/cognitive-types.js';

// Advanced cognitive features
import {
  detectUserCognitiveStyle,
  buildReasoningChain,
  getReasoningChainGuidance,
  detectCognitiveConflict,
  getCognitiveLearningTracker,
  getKnowledgeStateTracker,
  getCognitiveGrowthProfile,
  buildCognitiveGrowthContext,
  type UserCognitiveStyle,
} from '../../personas/cognitive-advanced.js';

import { generateCognitiveQuestion } from '../../conversation/cognitive-questions.js';
import { generateTeamCommentary } from '../../personas/collaborative-cognition.js';
import { getUnlockedTeamMemberIds } from './team-availability.js';

// Broadcast service for real-time dashboard updates
import {
  broadcastCognitiveMode,
  broadcastUserStyle,
  broadcastConfidence,
  broadcastApproachUsed,
  broadcastQuirkActivated,
  broadcastInsightGenerated,
} from '../../services/cognitive-broadcast.js';

// Cognitive metrics for performance tracking
import {
  cognitiveMetrics,
  recordTurnMetrics,
  maybeBroadcastMetrics,
} from '../../utils/cognitive-metrics.js';

// Track reasoning styles used in this session
const sessionReasoningHistory = new Map<string, ReasoningStyle[]>();

// Track user messages for cognitive style detection
const sessionUserMessages = new Map<string, string[]>();

// Track active reasoning chains
const activeReasoningChains = new Map<string, ReturnType<typeof buildReasoningChain>>();

/**
 * Build cognitive intelligence context
 */
async function buildCognitiveContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  // Start timing cognitive context building
  cognitiveMetrics.startTiming('contextBuildTime');

  const injections: ContextInjection[] = [];
  const personaId = input.persona?.id;
  const userId = input.services.userId || 'anonymous';

  if (!personaId) {
    cognitiveMetrics.endTiming('contextBuildTime');
    return injections;
  }

  // Get cognitive profile for this persona
  const profile = getCognitiveProfile(personaId);
  if (!profile) {
    // No cognitive profile defined for this persona - skip
    cognitiveMetrics.endTiming('contextBuildTime');
    return injections;
  }

  // Get or create engine
  const engine = getCognitiveEngine(personaId, profile);

  // Initialize session tracking
  if (!sessionReasoningHistory.has(personaId)) {
    sessionReasoningHistory.set(personaId, []);
  }
  if (!sessionUserMessages.has(userId)) {
    sessionUserMessages.set(userId, []);
  }

  const previousApproaches = sessionReasoningHistory.get(personaId) || [];
  const userMessages = sessionUserMessages.get(userId) || [];

  // Track user message for cognitive style detection
  userMessages.push(input.userText);
  if (userMessages.length > 20) {
    userMessages.shift();
  }

  // ============================================================================
  // DETECT USER COGNITIVE STYLE
  // ============================================================================
  const userCognitiveStyle = detectUserCognitiveStyle(userMessages);

  // Build cognitive context
  const emotionalWeight = calculateEmotionalWeight(input);
  const questionComplexity = detectQuestionComplexity(input.userText);
  const turnCount = input.userData.turnCount || 1;

  const cognitiveContext: CognitiveContext = {
    currentTopic: input.analysis.topics.primary || input.analysis.topics.detected[0] || 'general',
    userExpertise: detectUserExpertiseFromContext(input),
    emotionalWeight,
    questionComplexity,
    turnCount,
    previousApproaches,
  };

  // ============================================================================
  // COGNITIVE LEARNING - Get recommended approach based on history
  // ============================================================================
  const learningTracker = getCognitiveLearningTracker();
  const learnedRecommendation = learningTracker.getRecommendedApproach(
    userId,
    personaId,
    profile.reasoningStyle
  );

  // Generate cognitive guidance
  const guidance = engine.generateGuidance(cognitiveContext);

  // Consider learned preferences
  let finalApproach = guidance.recommendedApproach;
  if (learnedRecommendation.confidence > 0.7 && learnedRecommendation.approach !== finalApproach) {
    // Learned approach has high confidence - consider it
    finalApproach = learnedRecommendation.approach;
    injections.push(
      createHintInjection('cognitive-learning', `[LEARNED] ${learnedRecommendation.reason}`, {
        category: 'cognitive',
        confidence: learnedRecommendation.confidence,
      })
    );
  }

  // Track the reasoning approach used
  previousApproaches.push(finalApproach);
  if (previousApproaches.length > 10) {
    previousApproaches.shift();
  }

  // 📡 Broadcast cognitive mode selection for dashboard
  broadcastCognitiveMode(
    personaId,
    finalApproach,
    learnedRecommendation.confidence > 0.7 ? 'learned preference' : 'context-driven'
  );

  // 📡 Broadcast approach used for history tracking
  broadcastApproachUsed(
    personaId,
    finalApproach,
    cognitiveContext.currentTopic,
    learnedRecommendation.confidence > 0.5 ? learnedRecommendation.confidence : 0.5
  );

  // ============================================================================
  // 1. REASONING APPROACH - Core thinking style for this response
  // ============================================================================
  const reasoningPrompt = buildReasoningPrompt(finalApproach, profile.reasoningStyle);
  injections.push(
    createStandardInjection('cognitive-reasoning', reasoningPrompt, {
      category: 'cognitive',
      confidence: 0.9,
    })
  );

  // ============================================================================
  // 2. USER COGNITIVE STYLE MATCHING
  // ============================================================================
  if (userCognitiveStyle.primary !== 'unknown' && userCognitiveStyle.confidence > 0.5) {
    const styleGuidance = buildUserStyleGuidance(
      userCognitiveStyle.primary,
      profile.reasoningStyle
    );
    injections.push(
      createHintInjection('cognitive-user-style', styleGuidance, {
        category: 'cognitive',
        confidence: userCognitiveStyle.confidence,
      })
    );

    // 📡 Broadcast user style detection for dashboard
    // Convert CognitiveSignals to Record<string, number> for broadcast
    const signalsAsRecord: Record<string, number> = userCognitiveStyle.signals
      ? {
          analytical: userCognitiveStyle.signals.analyticalScore,
          emotional: userCognitiveStyle.signals.emotionalScore,
          practical: userCognitiveStyle.signals.practicalScore,
          narrative: userCognitiveStyle.signals.narrativeScore,
          systematic: userCognitiveStyle.signals.systematicScore,
          intuitive: userCognitiveStyle.signals.intuitiveScore,
        }
      : {};

    broadcastUserStyle(
      userId,
      userCognitiveStyle.primary as ReasoningStyle,
      userCognitiveStyle.confidence,
      signalsAsRecord
    );
  }

  // ============================================================================
  // 3. COGNITIVE CONFLICT DETECTION
  // ============================================================================
  const requestType = determineRequestType(input);
  const conflict = detectCognitiveConflict(profile, {
    userEmotion: input.analysis.emotion.primary,
    emotionalIntensity: input.analysis.emotion.intensity,
    userCognitiveStyle: userCognitiveStyle.primary,
    currentTopic: cognitiveContext.currentTopic,
    requestType,
  });

  if (conflict?.detected && conflict.severity !== 'mild') {
    injections.push(
      createStandardInjection(
        'cognitive-conflict',
        `[COGNITIVE TENSION] Your ${conflict.personaStyle} style may not match their need for ${conflict.userNeed}. ${conflict.phrase || 'Consider adapting.'}`,
        { category: 'cognitive', confidence: 0.85 }
      )
    );
  }

  // ============================================================================
  // 4. MULTI-STEP REASONING CHAINS (for complex situations)
  // ============================================================================
  const chainKey = `${personaId}_${userId}`;
  let activeChain = activeReasoningChains.get(chainKey);

  if (!activeChain && (questionComplexity === 'complex' || questionComplexity === 'ambiguous')) {
    // Build new reasoning chain for complex situation
    const userNeed = determineUserNeed(input, userCognitiveStyle.primary);
    activeChain = buildReasoningChain(profile, {
      topic: cognitiveContext.currentTopic,
      emotionalWeight,
      complexity: questionComplexity,
      userNeed,
    });
    if (activeChain) {
      activeReasoningChains.set(chainKey, activeChain);
    }
  }

  if (activeChain) {
    const chainGuidance = getReasoningChainGuidance(activeChain);
    if (chainGuidance) {
      injections.push(
        createStandardInjection('cognitive-chain', chainGuidance, {
          category: 'cognitive',
          confidence: 0.9,
        })
      );
    }
    // Advance chain
    activeChain.currentStep++;
    if (activeChain.currentStep > activeChain.totalSteps) {
      activeReasoningChains.delete(chainKey);
    }
  }

  // ============================================================================
  // 5. KNOWLEDGE STATE - Avoid re-explaining
  // ============================================================================
  const knowledgeTracker = getKnowledgeStateTracker();
  const topicGuidance = knowledgeTracker.getExplanationGuidance(
    userId,
    cognitiveContext.currentTopic
  );

  if (topicGuidance.depth !== 'moderate') {
    injections.push(
      createHintInjection('cognitive-knowledge', `[KNOWLEDGE] ${topicGuidance.note}`, {
        category: 'cognitive',
        confidence: 0.8,
      })
    );
  }

  // ============================================================================
  // 6. COGNITIVE GROWTH - Adapt to relationship depth
  // ============================================================================
  const relationshipStage = input.userProfile?.relationshipStage || 'stranger';
  const sessionCount = input.userProfile?.totalConversations || 1;
  const growthProfile = getCognitiveGrowthProfile(
    relationshipStage as 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor',
    sessionCount
  );

  const learning = learningTracker.getLearning(userId, personaId);
  const growthContext = buildCognitiveGrowthContext(growthProfile, learning);
  if (growthContext) {
    injections.push(
      createHintInjection('cognitive-growth', growthContext, {
        category: 'cognitive',
        confidence: 0.75,
      })
    );
  }

  // ============================================================================
  // 7. ATTENTION CUES - What this persona naturally notices
  // ============================================================================
  if (guidance.attentionCues.length > 0) {
    const attentionContent = guidance.attentionCues.slice(0, 2).join('\n');
    injections.push(
      createHintInjection('cognitive-attention', attentionContent, {
        category: 'cognitive',
        confidence: 0.8,
      })
    );
  }

  // ============================================================================
  // 8. BIAS AWARENESS - Alert persona to potential cognitive biases
  // ============================================================================
  if (guidance.biasAlerts.length > 0) {
    const biasContent = guidance.biasAlerts[0];
    injections.push(
      createHintInjection('cognitive-bias', biasContent, { category: 'cognitive', confidence: 0.7 })
    );
  }

  // ============================================================================
  // 9. CONFIDENCE SIGNALING - Express appropriate uncertainty
  // ============================================================================
  // 📡 Broadcast confidence level for dashboard
  broadcastConfidence(
    personaId,
    guidance.confidenceLevel,
    questionComplexity === 'complex' ? 'complex question' : cognitiveContext.currentTopic
  );

  if (guidance.confidenceLevel < 0.6) {
    const confidenceContent = buildConfidencePrompt(
      guidance.confidenceLevel,
      guidance.suggestedPhrases
    );
    injections.push(
      createHintInjection('cognitive-confidence', confidenceContent, {
        category: 'cognitive',
        confidence: 0.85,
      })
    );
  }

  // ============================================================================
  // 10. COGNITIVE QUESTIONS - Suggest style-appropriate questions
  // ============================================================================
  if (turnCount > 2 && Math.random() < 0.4) {
    const question = generateCognitiveQuestion({
      personaId,
      topic: cognitiveContext.currentTopic,
      userCognitiveStyle: userCognitiveStyle.primary,
      emotionalWeight,
      conversationDepth: turnCount > 8 ? 'deep' : turnCount > 4 ? 'moderate' : 'surface',
    });

    if (question) {
      injections.push(
        createHintInjection(
          'cognitive-question',
          `[COGNITIVE QUESTION] Consider asking a ${question.style} question: "${question.text}" (${question.purpose})`,
          { category: 'cognitive', confidence: 0.7 }
        )
      );
    }
  }

  // ============================================================================
  // 11. TEAM COGNITIVE PERSPECTIVE (occasional) - Only unlocked members
  // ============================================================================
  if (turnCount > 5 && Math.random() < 0.15) {
    // Get subscription tier for unlock checking
    const tier: 'free' | 'friend' | 'partner' =
      (input.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
    const unlockedMemberIds = getUnlockedTeamMemberIds(input.userProfile, tier);
    
    const teamCommentary = generateTeamCommentary(
      personaId,
      cognitiveContext.currentTopic,
      'reflection',
      unlockedMemberIds // Only generate commentary about unlocked members
    );
    if (teamCommentary.length > 0) {
      injections.push(
        createHintInjection('cognitive-team', `[TEAM PERSPECTIVE] ${teamCommentary[0]}`, {
          category: 'cognitive',
          confidence: 0.6,
        })
      );
    }
  }

  // ============================================================================
  // 12. SIGNATURE PHRASES - Persona's unique thinking expressions
  // ============================================================================
  if (profile.signatureThinkingPhrases.length > 0 && Math.random() < 0.25) {
    const phrase =
      profile.signatureThinkingPhrases[
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

  // End timing and record metrics
  cognitiveMetrics.endTiming('contextBuildTime');
  recordTurnMetrics();

  // 📡 Broadcast metrics to dashboard (every 10 turns)
  void maybeBroadcastMetrics();

  return injections;
}

// ============================================================================
// HELPER FUNCTIONS FOR ADVANCED FEATURES
// ============================================================================

/**
 * Build guidance for matching user's cognitive style
 */
function buildUserStyleGuidance(
  userStyle: UserCognitiveStyle,
  personaStyle: ReasoningStyle
): string {
  const styleDescriptions: Record<UserCognitiveStyle, string> = {
    analytical: 'They think analytically - use data, evidence, and clear logic.',
    emotional: 'They lead with feelings - acknowledge emotions before analysis.',
    practical: 'They want action - focus on what to do, not why.',
    narrative: 'They think in stories - use metaphors and connect to meaning.',
    systematic: 'They like structure - be organized and step-by-step.',
    intuitive: 'They trust intuition - big picture resonates, details less so.',
    unknown: '',
  };

  const description = styleDescriptions[userStyle];
  const isMatch =
    (userStyle === 'analytical' && personaStyle === 'analytical') ||
    (userStyle === 'emotional' && personaStyle === 'empathetic') ||
    (userStyle === 'practical' && personaStyle === 'pragmatic') ||
    (userStyle === 'narrative' && personaStyle === 'narrative') ||
    (userStyle === 'systematic' && personaStyle === 'systematic') ||
    (userStyle === 'intuitive' && personaStyle === 'intuitive');

  if (isMatch) {
    return `[USER STYLE] ${description} Your styles match well.`;
  }

  return `[USER STYLE] ${description} Adapt your approach slightly.`;
}

/**
 * Determine the type of request user is making
 */
function determineRequestType(
  input: ContextBuilderInput
): 'question' | 'venting' | 'seeking_advice' | 'sharing' | 'celebrating' {
  const intent = input.analysis.intent.primary.toLowerCase();
  const { emotion } = input.analysis;

  if (emotion.isVenting || (emotion.distressLevel && emotion.distressLevel > 0.6)) {
    return 'venting';
  }

  if (intent.includes('advice') || intent.includes('help') || intent.includes('should')) {
    return 'seeking_advice';
  }

  if (input.userText.includes('?')) {
    return 'question';
  }

  if (emotion.primary === 'happy' || emotion.primary === 'excited') {
    return 'celebrating';
  }

  return 'sharing';
}

/**
 * Determine what the user needs from the conversation
 */
function determineUserNeed(
  input: ContextBuilderInput,
  userStyle: UserCognitiveStyle
): 'information' | 'support' | 'decision' | 'exploration' {
  const requestType = determineRequestType(input);

  if (requestType === 'venting') return 'support';
  if (requestType === 'seeking_advice') return 'decision';

  if (userStyle === 'analytical') return 'information';
  if (userStyle === 'narrative' || userStyle === 'intuitive') return 'exploration';

  if (input.userText.includes('?')) return 'information';

  return 'exploration';
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
  const { historyTracker } = input.services;
  if (historyTracker) {
    const turns = historyTracker.getSimpleTurns();
    const userMessages = turns.filter((t) => t.role === 'user').map((t) => t.content);

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
  const { emotion } = input.analysis;

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
    analytical:
      'Think through this analytically. Work from evidence and patterns to conclusions. Use clear logical steps.',
    intuitive:
      'Trust your intuitive sense here. See the whole picture before the parts. Connect through understanding.',
    empathetic:
      'Lead with emotional awareness. Validate feelings before moving to problem-solving. Connect human-to-human.',
    systematic:
      'Approach this systematically. Break it into clear steps. Consider the process and structure.',
    narrative:
      'Think in stories and journeys. Connect this to a larger narrative. Use metaphors and meaning.',
    pragmatic:
      'Focus on what works. What are the practical outcomes? Be action-oriented and results-focused.',
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
  const phrase = suggestedPhrases[0] || "I'm not entirely sure about this...";

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
