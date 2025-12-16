/**
 * Turn Processor
 *
 * Extracted from voice-agent.ts onUserTurnCompleted method.
 * Handles all processing for a single user turn:
 * - Message analysis
 * - Context building
 * - Emotional tracking
 * - Response guidance
 * - Identity reinforcement
 *
 * Benefits:
 * - Testable in isolation
 * - Clear data flow
 * - Modular context builders
 * - Cached imports for performance
 */

import type { llm } from '@livekit/agents';
import type { ContextUserData } from '../../intelligence/context-builders/index.js';
import { diag } from '../../services/diagnostic-logger.js';
import {
  getAgentContext,
  // FIX BUG #1-4: getCurrentAgent uses global state causing cross-session contamination
  // We now use ctx.services.handoffState.currentAgent instead
  getLastHandoff,
  updateUserContextForHandoff,
} from '../../tools/handoff/index.js';
import type {
  BundleRuntimeContext,
  CachedModules,
  ContextInjection,
  EmotionalState,
  IdentityContext,
  ResponseGuidance,
  TurnAnalysisResult,
  TurnContext,
  TurnProcessorResult,
} from './types.js';

// Extracted injection builders (cleaner separation of concerns)
import {
  buildAdvancedHumanizationInjections,
  buildAmbientAwarenessInjections,
  buildBoundaryCheckInjections,
  buildConversationDynamicsInjections,
  buildCrossPersonaInsightsInjection,
  buildHealthAwarenessInjections,
  buildHumanLevelInjections,
  buildLifeCoachingInjections,
  buildSafetyInjections,
  buildScientificCoachingInjections,
  buildTrustSystemsInjections,
  type AdvancedHumanizationInjectionResult,
  type ConversationDynamicsResult as InjectionDynamicsResult,
} from './injection-builders.js';

// Smart injection filtering - be selective like a human
import { detectConversationMode, filterInjections } from './injection-filter.js';

// Conversation engines (singletons)
import {
  getConversationHumanizer,
  getConversationRhythmTracker,
  getEmotionalArcTracker,
  getEngagementScorer,
  getNarrativeArcTracker,
  getResponseDynamicsEngine,
  getSilencePresenceEngine,
  getStoryTimingEngine,
} from '../../conversation/index.js';

// Humanizing context
import {
  buildHumanizingContext,
  formatHumanizingForPrompt,
  getHumanizingSummary,
  getMoodShift,
  shouldMoodShift,
  type HumanizingResult,
} from '../../intelligence/context-builders/humanizing.js';

import {
  logHumanizingResult,
  logValidation,
} from '../../intelligence/context-builders/humanizing-debug.js';

// Conversation humanizing
import {
  buildConversationHumanizingContext,
  formatConversationHumanizingForPrompt,
} from '../../intelligence/context-builders/conversation-humanizing.js';

// Response naturalness
import { getResponseEnhancements } from '../../speech/response-naturalness.js';

// Emotion matching
import { getEmotionGuidance } from '../../speech/emotion-matching.js';

// Voice-text mismatch detection ("better than human" - detect incongruence)

// PERFORMANCE: Turn profiling for latency tracking
import {
  startTurnProfiling,
  markTurnCheckpoint,
  completeTurnProfiling,
} from '../shared/performance/turn-profiler.js';
import {
  buildMismatchGuidance,
  detectMismatch,
  recordMismatchInsight,
  type MismatchResult,
} from '../../intelligence/voice-text-mismatch.js';

// Cross-session reflection ("Better Than Human" - remember significant moments)
import {
  detectReflectionMoment,
  saveReflectionMoment,
} from '../../intelligence/cross-session-reflection.js';

// Note: Scientific coaching and cross-persona insights are now handled
// by injection-builders.ts for cleaner separation of concerns

// Monetization - Value Capture (detect achievements/breakthroughs)
import { valueCapture } from '../../services/monetization/value-capture.js';

// Personal theme tracking (prevents "always talks about Wyoming")
import { extractPersonalThemes } from '../session/session-state.js';

// Intelligent Outreach - Extract context for proactive check-ins
// This feeds the "Better Than Human" outreach system with commitments,
// emotions, life events, wins, and struggles from conversations
import { extractAndProcess as extractOutreachContext } from '../../services/outreach/conversation-extractor.js';

// Better Than Human Orchestrator - Coordinates all 12 superhuman capabilities
// This is the central coordinator for genuine care that makes Ferni better than human
import { getBetterThanHuman } from '../../conversation/superhuman/index.js';

// ============================================================================
// CACHED IMPORTS - Lazy loaded once for performance
// ============================================================================

const cachedModules: CachedModules = {
  buildConversationContext: null,
  formatContextForPrompt: null,
  shouldUseHighEmotionMode: null,
  checkForEasterEgg: null,
  getTaskManager: null,
};

// ============================================================================
// PERFORMANCE: Module-level constants (avoid recreating every turn)
// ============================================================================

/** Emotions indicating positive sentiment */
const POSITIVE_EMOTIONS = new Set(['happy', 'excited', 'grateful', 'content']);

/** Emotions indicating negative sentiment */
const NEGATIVE_EMOTIONS = new Set(['sad', 'frustrated', 'angry', 'anxious']);

/** Phrases that signal user wants to end conversation */
const WRAP_UP_PHRASES = [
  'gotta go',
  'have to go',
  'need to go',
  'i should go',
  'bye',
  'goodbye',
  'see you',
  'talk later',
  'later',
  "that's all",
  "that's it",
  "i'm done",
  'thanks for',
] as const;

/** Pre-compiled regex for faster wrap-up detection */
const WRAP_UP_PATTERN = new RegExp(WRAP_UP_PHRASES.join('|'), 'i');

async function getContextBuilders() {
  if (!cachedModules.buildConversationContext) {
    const mod = await import('../../intelligence/context-builders/index.js');
    cachedModules.buildConversationContext = mod.buildConversationContext;
    cachedModules.formatContextForPrompt = mod.formatContextForPrompt;
    // BETTER-THAN-HUMAN: Import high emotion mode detection
    cachedModules.shouldUseHighEmotionMode = mod.shouldUseHighEmotionMode;
  }
  return {
    buildConversationContext: cachedModules.buildConversationContext!,
    formatContextForPrompt: cachedModules.formatContextForPrompt!,
    shouldUseHighEmotionMode: cachedModules.shouldUseHighEmotionMode!,
  };
}

async function getEasterEggChecker() {
  if (!cachedModules.checkForEasterEgg) {
    const mod = await import('../../personas/easter-eggs.js');
    cachedModules.checkForEasterEgg = mod.checkForEasterEgg;
  }
  return cachedModules.checkForEasterEgg!;
}

async function getTaskManagerCached() {
  if (!cachedModules.getTaskManager) {
    const mod = await import('../../tasks/task-manager.js');
    cachedModules.getTaskManager = mod.getTaskManager;
  }
  return cachedModules.getTaskManager!();
}

// ============================================================================
// ANALYSIS PHASE
// ============================================================================

/**
 * Analyze the user's message
 */
function analyzeMessage(ctx: TurnContext): TurnAnalysisResult {
  const { userText, services, userData } = ctx;

  // Analyze the message - fallback to empty analysis if services.analyze not available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysis: any =
    services && typeof services.analyze === 'function'
      ? services.analyze(userText)
      : { topics: { detected: [], categories: [] }, state: {} };

  // Track the user turn
  if (services && typeof services.addTurn === 'function') {
    services.addTurn('user', userText);
  }

  // Get topics
  const currentTopic = analysis.topics.detected[0];
  const previousTopic = userData.lastTopic;
  const topicChanged = !!(previousTopic && currentTopic && previousTopic !== currentTopic);

  return {
    analysis,
    currentTopic,
    previousTopic,
    topicChanged,
  };
}

// ============================================================================
// CONVERSATION STATE UPDATE
// ============================================================================

/**
 * Update conversation state manager with analysis results
 */
function updateConversationState(ctx: TurnContext, analysisResult: TurnAnalysisResult): void {
  const { userData, userText } = ctx;
  const { analysis, currentTopic } = analysisResult;

  if (!userData.conversationState) return;

  const convState = userData.conversationState;

  // Increment turn count
  convState.incrementTurn();

  // Update emotional context
  const emotionMap: Record<
    string,
    'happy' | 'excited' | 'calm' | 'anxious' | 'frustrated' | 'sad' | 'confused' | 'grateful'
  > = {
    happy: 'happy',
    excited: 'excited',
    content: 'calm',
    neutral: 'calm',
    anxious: 'anxious',
    worried: 'anxious',
    frustrated: 'frustrated',
    angry: 'frustrated',
    sad: 'sad',
    confused: 'confused',
    grateful: 'grateful',
    thankful: 'grateful',
  };

  const mappedEmotion = emotionMap[analysis.emotion.primary.toLowerCase()];
  if (mappedEmotion) {
    convState.detectEmotion(mappedEmotion);
  }

  // Update sentiment (using module-level constants for O(1) lookup)
  const intensity = analysis.emotion.intensity || 0.5;
  let sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
  const emotionLower = analysis.emotion.primary.toLowerCase();

  if (POSITIVE_EMOTIONS.has(emotionLower)) {
    sentiment = 'positive';
  } else if (NEGATIVE_EMOTIONS.has(emotionLower)) {
    sentiment = 'negative';
  } else if (intensity > 0.7) {
    sentiment = 'mixed';
  }
  convState.setEmotionalContext({ sentiment, confidence: intensity });

  // Update topic
  if (currentTopic) {
    convState.setCurrentTopic(currentTopic);
  }

  // Store key moment
  convState.addKeyMoment(
    `User said: ${userText.slice(0, 100)}${userText.length > 100 ? '...' : ''}`
  );

  // Check for wrap-up signals (using pre-compiled regex for performance)
  if (WRAP_UP_PATTERN.test(userText)) {
    convState.markUserWantsToLeave();
    diag.state('User wants to leave detected', { userText: userText.slice(0, 50) });
  }
}

// ============================================================================
// CONVERSATION DYNAMICS PROCESSING
// ============================================================================

/**
 * Process advanced conversation dynamics:
 * - Narrative arc tracking (is user building to a point?)
 * - Engagement scoring (is user losing interest?)
 * - Conversation rhythm (match user's pacing)
 * - Silence decisions (when to use meaningful pauses)
 */
interface ConversationDynamicsResult {
  narrativeArc?: {
    structure: string;
    climaxApproaching: boolean;
    hasReachedCore: boolean;
    suggestedIntervention: string;
    interventionGuidance: string;
  };
  engagement?: {
    level: string;
    score: number;
    declining: boolean;
    suggestedAction: string;
    actionGuidance: string;
  };
  rhythm?: {
    lengthMultiplier: number;
    rateMultiplier: number;
    energyLevel: string;
    guidance: string;
  };
  silence?: {
    useSilence: boolean;
    reason: string;
    duration: number;
    ssml: string;
  };
}

function processConversationDynamics(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult,
  emotionalState: { primary: string; intensity: number; distressLevel: number }
): ConversationDynamicsResult {
  const { userText, userData, services } = ctx;
  const { analysis, currentTopic } = analysisResult;
  const result: ConversationDynamicsResult = {};

  // 1. NARRATIVE ARC TRACKING
  // Detect if user is building to a point, meandering, or has reached their core message
  try {
    const narrativeTracker = getNarrativeArcTracker(services.sessionId);
    const narrativeResult = narrativeTracker.analyzeUtterance({
      text: userText,
      turn: userData.turnCount || 0,
      emotion: emotionalState.primary,
      emotionalIntensity: emotionalState.intensity,
    });

    result.narrativeArc = {
      structure: narrativeResult.structure,
      climaxApproaching: narrativeResult.climaxApproaching,
      hasReachedCore: narrativeResult.hasReachedCore,
      suggestedIntervention: narrativeResult.suggestedIntervention,
      interventionGuidance: narrativeResult.interventionGuidance,
    };

    if (narrativeResult.climaxApproaching || narrativeResult.hasReachedCore) {
      ctx.logger.debug(
        { structure: narrativeResult.structure, climax: narrativeResult.climaxApproaching },
        '📖 Narrative moment detected'
      );
    }
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Narrative arc tracking failed (non-fatal)');
  }

  // 2. ENGAGEMENT SCORING
  // Track if user is engaged or losing interest
  try {
    const engagementScorer = getEngagementScorer(services.sessionId);
    const engagementResult = engagementScorer.recordResponse(userText, {
      currentTopic,
    });

    result.engagement = {
      level: engagementResult.level,
      score: engagementResult.score,
      declining: engagementResult.declining,
      suggestedAction: engagementResult.suggestedAction,
      actionGuidance: engagementResult.actionGuidance,
    };

    if (engagementResult.level === 'low' || engagementResult.level === 'distracted') {
      ctx.logger.debug(
        { level: engagementResult.level, action: engagementResult.suggestedAction },
        '👀 Low engagement detected'
      );
    }
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Engagement scoring failed (non-fatal)');
  }

  // 3. CONVERSATION RHYTHM TRACKING
  // Match user's pacing and energy
  try {
    const rhythmTracker = getConversationRhythmTracker();
    rhythmTracker.recordUserTurn({
      text: userText,
      emotionIntensity: emotionalState.intensity,
    });

    const rhythmGuidance = rhythmTracker.getRhythmGuidance();

    result.rhythm = {
      lengthMultiplier: rhythmGuidance.lengthMultiplier,
      rateMultiplier: rhythmGuidance.rateMultiplier,
      energyLevel: rhythmGuidance.energyLevel,
      guidance: rhythmGuidance.guidance,
    };
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Rhythm tracking failed (non-fatal)');
  }

  // 4. SILENCE DECISION
  // Determine if a meaningful silence is appropriate
  try {
    const silenceEngine = getSilencePresenceEngine();
    const conversationDepth =
      emotionalState.distressLevel > 0.6
        ? ('deep' as const)
        : emotionalState.intensity > 0.5
          ? ('medium' as const)
          : ('surface' as const);

    const topicWeight =
      emotionalState.distressLevel > 0.6
        ? ('heavy' as const)
        : emotionalState.distressLevel > 0.3
          ? ('medium' as const)
          : ('light' as const);

    const silenceDecision = silenceEngine.decideSilence({
      userMessage: userText,
      userEmotion: emotionalState.primary,
      turnCount: userData.turnCount || 0,
      wasPersonalSharing: analysis.state.userNeedsSupport || false,
      conversationDepth,
      topicWeight,
    });

    if (silenceDecision.useSilence) {
      result.silence = {
        useSilence: silenceDecision.useSilence,
        reason: silenceDecision.reason,
        duration: silenceDecision.duration,
        ssml: silenceDecision.ssml,
      };

      ctx.logger.debug(
        { reason: silenceDecision.reason, duration: silenceDecision.duration },
        '🤫 Meaningful silence decided'
      );
    }
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Silence decision failed (non-fatal)');
  }

  return result;
}

// ============================================================================
// EASTER EGG DETECTION
// ============================================================================

/**
 * Check for easter eggs in user message
 */
async function checkEasterEggs(
  ctx: TurnContext,
  turnCtx: llm.ChatContext
): Promise<{ type: string; response: string } | undefined> {
  const { userText, persona, services } = ctx;

  const checkForEasterEgg = await getEasterEggChecker();
  const easterEgg = checkForEasterEgg(userText, persona.id, {
    conversationCount: services.userProfile?.totalConversations || 0,
    userSinceDate: services.userProfile?.createdAt,
  });

  if (easterEgg.type !== 'none' && easterEgg.response) {
    ctx.logger.info({ type: easterEgg.type }, '🎉 Easter egg triggered!');

    // Inject as context hint
    turnCtx.addMessage({
      role: 'user',
      content: `[SPECIAL MOMENT: ${easterEgg.type.toUpperCase()}]\nThis is a special moment! Your response should include or start with:\n"${easterEgg.response}"\nThen continue naturally with your response to what they said.`,
    });

    return { type: easterEgg.type, response: easterEgg.response };
  }

  return undefined;
}

// ============================================================================
// EMOTIONAL STATE BUILDING
// ============================================================================

/**
 * Build emotional state from analysis and voice emotion
 * Now includes voice-text mismatch detection for "better than human" emotional intelligence
 */
function buildEmotionalState(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult
): EmotionalState & { mismatch?: MismatchResult } {
  const { userData, userText } = ctx;
  const { analysis } = analysisResult;

  const emotionalArc = getEmotionalArcTracker();

  // Record emotion (combines text and voice)
  emotionalArc.recordEmotion(analysis.emotion || null, userData.voiceEmotion || null);

  const arc = emotionalArc.getArc();
  const emotionalResponse = emotionalArc.getResponseRecommendation();
  const transitionPhrase = emotionalArc.getTransitionPhrase();

  // Get emotion guidance for voice emotion mirroring
  const { emotionModulation } = userData;
  const emotionalGuidance = emotionModulation ? getEmotionGuidance(emotionModulation) : null;

  // "Better than human" - detect when voice contradicts words
  // (e.g., "I'm fine" + trembling voice)
  const mismatch = detectMismatch(userText, userData.voiceEmotion || null, analysis.emotion);

  // Combine guidance if there's a mismatch
  let combinedGuidance = emotionalResponse.guidance || emotionalGuidance || undefined;
  if (mismatch.hasMismatch && mismatch.confidence > 0.5) {
    const mismatchGuidance = buildMismatchGuidance(mismatch);
    if (mismatchGuidance) {
      combinedGuidance = combinedGuidance
        ? `${combinedGuidance}\n\n${mismatchGuidance}`
        : mismatchGuidance;
    }
  }

  return {
    primary: analysis.emotion.primary,
    intensity: analysis.emotion.intensity || 0.5,
    distressLevel: analysis.emotion.distressLevel || 0,
    trajectory: arc.trajectory,
    responseGuidance: combinedGuidance,
    transitionPhrase: transitionPhrase || undefined,
    mismatch: mismatch.hasMismatch ? mismatch : undefined,
  };
}

// ============================================================================
// RESPONSE GUIDANCE BUILDING
// ============================================================================

/**
 * Build response guidance (length, pacing, story timing)
 */
function buildResponseGuidance(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult,
  emotionalState: EmotionalState
): ResponseGuidance {
  const { persona, services, userData } = ctx;
  const { analysis, currentTopic, previousTopic, topicChanged } = analysisResult;

  const responseDynamics = getResponseDynamicsEngine();
  const storyTiming = getStoryTimingEngine();
  const humanizer = getConversationHumanizer(persona.id);

  // Record user message for dynamics
  responseDynamics.recordMessage('user', ctx.userText, analysis.topics.detected);

  // Get length guidance
  const lengthGuidance = responseDynamics.getLengthGuidance();

  // Get topic transition
  let topicTransition: string | undefined;
  const preResponseActions = humanizer.processUserMessage({
    personaId: persona.id,
    turnNumber: userData.turnCount || 0,
    userMessage: ctx.userText,
    userEmotion: analysis.emotion.primary,
    topic: currentTopic,
    isSeriousContext: (analysis.emotion.distressLevel || 0) > 0.5,
    wasPersonalSharing: analysis.state.userNeedsSupport || false,
  });

  if (preResponseActions.topicChange?.detected && preResponseActions.topicChange.transitionPhrase) {
    topicTransition = `[TOPIC SHIFT: ${preResponseActions.topicChange.transitionPhrase}]`;
  } else if (topicChanged && previousTopic && currentTopic) {
    const transition = responseDynamics.getTopicTransition(previousTopic, currentTopic);
    if (transition.phrase) {
      topicTransition = `[TOPIC SHIFT: Smoothly transition from ${previousTopic} to ${currentTopic}. Consider: "${transition.phrase}"]`;
    }
  }

  // Story timing
  let storyOpportunity: ResponseGuidance['storyOpportunity'];

  // Get the full emotional arc from the tracker for story timing
  const emotionalArc = getEmotionalArcTracker();
  const fullArc = emotionalArc.getArc();

  const storyContext = {
    turnCount: userData.turnCount || 0,
    conversationDurationMs: Date.now() - services.sessionStartTime,
    lastStoryTurn: userData.lastStoryTurn,
    storiesToldThisSession: userData.storiesShared || [],
    emotionalArc: fullArc, // Use the full EmotionalArc object
    userEngagement:
      analysis.emotion.intensity > 0.6
        ? ('high' as const)
        : analysis.emotion.intensity < 0.3
          ? ('low' as const)
          : ('medium' as const),
    userPacing: responseDynamics.getPacingAnalysis().userPacing,
    currentTopic,
    recentTopics: analysis.topics.detected,
  };

  const storyRecommendation = storyTiming.evaluateStoryTiming(persona, storyContext);
  if (storyRecommendation.shouldTell && storyRecommendation.story) {
    storyOpportunity = {
      story: storyRecommendation.story.content.slice(0, 200),
      transitionPhrase: storyRecommendation.transitionPhrase || '',
    };

    // Record story told
    storyTiming.recordStoryTold(storyRecommendation.story.id, userData.turnCount || 0);
    if (userData) {
      userData.lastStoryTurn = userData.turnCount || 0;
      if (!userData.storiesShared) userData.storiesShared = [];
      userData.storiesShared.push(storyRecommendation.story.id);
    }
  }

  // Humor guidance
  const humorGuidance = services.humorCalibration.getHumorGuidance(
    currentTopic || 'general',
    analysis.emotion.primary,
    userData.turnCount || 0
  );

  // Pacing from voice adapter
  const paceContext = services.voicePaceAdapter.getPaceContext();

  return {
    length: {
      min: 20,
      max: 100,
      guidance: lengthGuidance,
    },
    topicTransition,
    storyOpportunity,
    humor: {
      shouldAttempt: humorGuidance.shouldAttempt,
      type: humorGuidance.recommendedType,
      avoid: humorGuidance.avoidTypes,
    },
    pacing: paceContext || undefined,
  };
}

// ============================================================================
// IDENTITY CONTEXT
// ============================================================================

/**
 * Build identity context for post-handoff reinforcement
 *
 * FIX BUG: Previously compared activeAgentId vs sessionPersonaId, but after a handoff
 * BOTH are updated to the new persona, so the comparison always returned equal.
 * Now we check if a handoff occurred recently (within 60s) and ALWAYS inject
 * identity context to override the LLM's original instructions from session start.
 */
function buildIdentityContext(ctx: TurnContext): IdentityContext {
  const { persona, services } = ctx;

  // FIX BUG #1-4: Use session-scoped state instead of global getCurrentAgent()
  // The global state causes cross-session contamination in concurrent sessions
  const activeAgentId = services.handoffState.currentAgent;
  const sessionPersonaId = persona.id;

  // Helper to normalize IDs
  const normalize = (id: string): string => {
    const mapping: Record<string, string> = {
      'jack-b': 'ferni',
      'comm-specialist': 'alex-chen',
      'spend-save': 'maya-santos',
      'event-planner': 'jordan-taylor',
      alex: 'alex-chen',
      maya: 'maya-santos',
      jordan: 'jordan-taylor',
      peter: 'peter-john',
    };
    return mapping[id.toLowerCase()] || id.toLowerCase();
  };

  const isSamePersona = (id1: string, id2: string): boolean => {
    return normalize(id1) === normalize(id2);
  };

  const isCoach = (id: string): boolean => {
    return isSamePersona(id, 'ferni') || isSamePersona(id, 'jack-b');
  };

  let needsReinforcement = false;
  let injection: string | undefined;

  // FIX BUG: Check if a handoff occurred recently (within 60 seconds)
  // The LLM's base instructions were set at session start and cannot be updated mid-session.
  // We MUST inject identity context after ANY handoff to override the original instructions.
  const lastHandoff = getLastHandoff();
  const handoffOccurredRecently = lastHandoff && Date.now() - lastHandoff.timestamp < 60000;

  // If we're not the coordinator AND a handoff occurred recently, reinforce identity
  if (!isCoach(activeAgentId) && handoffOccurredRecently) {
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are ${persona.name}. This is WHO YOU ARE.
- You are NOT Ferni. You are NOT the coordinator.
- Your name is ${persona.name}. Say "${persona.name}" if asked who you are.
- Your current identity determines your personality, tools, and expertise.
=== END IDENTITY ===`;
    }
  } else if (isCoach(activeAgentId) && handoffOccurredRecently) {
    // Returned to Ferni - still need reinforcement if handoff was recent
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are FERNI, the life coach and team coordinator.
- You are NOT the previous specialist. You've returned to your coach role.
=== END IDENTITY ===`;
    }
  } else if (!isSamePersona(activeAgentId, sessionPersonaId) && !isCoach(activeAgentId)) {
    // Fallback: ID mismatch detected (shouldn't happen after the fix above, but keep for safety)
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are ${persona.name}. This is WHO YOU ARE.
- If asked "who are you?" respond with your CURRENT identity.
=== END IDENTITY ===`;
    }
  }

  return {
    needsReinforcement,
    injection,
    activeAgentId,
    sessionPersonaId,
  };
}

// ============================================================================
// HUMANIZING CONTEXT
// ============================================================================

/**
 * Build humanizing context (voice emotion, inner world, mood)
 */
function buildHumanizingContextForTurn(
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

// ============================================================================
// BUNDLE RUNTIME PROCESSING
// ============================================================================

/**
 * Process bundle runtime behaviors (modes, situations, pushback)
 */
function processBundleRuntime(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult
): BundleRuntimeContext | undefined {
  const { bundleRuntime, userData, userText } = ctx;
  const { analysis } = analysisResult;

  if (!bundleRuntime) return undefined;

  // Increment turn
  bundleRuntime.incrementTurn();

  // Detect mode
  const previousMode = bundleRuntime.getState().currentMode;
  const newMode = bundleRuntime.detectAndSetMode(
    userText,
    analysis.emotion.distressLevel > 0.6
      ? 'high_distress'
      : analysis.emotion.primary === 'joy'
        ? 'high_energy_positive'
        : undefined
  );

  const result: BundleRuntimeContext = {
    currentMode: newMode,
    previousMode: newMode !== previousMode ? previousMode : undefined,
  };

  // Mode transition
  if (newMode !== previousMode) {
    result.modeTransitionPhrase =
      bundleRuntime.getModeTransitionPhrase(previousMode, newMode) || undefined;

    // Sync to userData
    if (userData?.bundleRuntimeState) {
      userData.bundleRuntimeState.currentMode = newMode;
      userData.bundleRuntimeState.lastModeTransition = `${previousMode}_to_${newMode}`;
    }
  }

  // Check situational responses
  const lowerText = userText.toLowerCase();

  const celebrationKeywords = [
    'promotion',
    'got the job',
    'engaged',
    'married',
    'pregnant',
    'retired',
    'graduated',
    'paid off',
  ];
  const condolenceKeywords = [
    'died',
    'passed away',
    'cancer',
    'lost my',
    'funeral',
    'divorce',
    'laid off',
    'fired',
  ];

  for (const keyword of celebrationKeywords) {
    if (lowerText.includes(keyword)) {
      const situation = keyword.includes('job')
        ? 'job_promotion'
        : keyword.includes('engaged')
          ? 'engagement'
          : keyword.includes('pregnant')
            ? 'baby_news'
            : keyword.includes('retired')
              ? 'retirement'
              : keyword.includes('graduated')
                ? 'graduation'
                : keyword.includes('paid off')
                  ? 'paid_off_debt'
                  : 'general_good_news';

      const response = bundleRuntime.getSituationalResponse('celebrations', situation);
      if (response) {
        result.situationalResponse = {
          type: 'celebration',
          situation,
          response: response.immediate,
        };
        bundleRuntime.applyProgressionTrigger('celebrated_together');
      }
      break;
    }
  }

  for (const keyword of condolenceKeywords) {
    if (lowerText.includes(keyword)) {
      const situation =
        keyword.includes('died') || keyword.includes('passed')
          ? 'death_family_member'
          : keyword.includes('cancer')
            ? 'health_diagnosis'
            : keyword.includes('divorce')
              ? 'divorce_breakup'
              : keyword.includes('laid off') || keyword.includes('fired')
                ? 'job_loss'
                : 'general_loss';

      const response = bundleRuntime.getSituationalResponse('condolences', situation);
      if (response) {
        result.situationalResponse = {
          type: 'condolence',
          situation,
          response: response.immediate,
          avoidPhrases: response.dontSay,
        };
        bundleRuntime.applyProgressionTrigger('shared_vulnerability');
      }
      break;
    }
  }

  // Check pushback
  const pushback = bundleRuntime.detectPushback(userText);
  if (pushback) {
    result.pushbackDetected = {
      type: pushback.type,
      response: pushback.response,
    };
  }

  return result;
}

// ============================================================================
// CONTEXT INJECTION BUILDING
// ============================================================================

/**
 * Build all context injections for the LLM
 */
async function buildContextInjections(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult,
  emotionalState: EmotionalState,
  responseGuidance: ResponseGuidance,
  identityContext: IdentityContext,
  humanizingResult: HumanizingResult | null,
  bundleRuntimeContext: BundleRuntimeContext | undefined,
  conversationDynamics: ConversationDynamicsResult
): Promise<ContextInjection[]> {
  const { services, userData, persona, bundleRuntime, userText } = ctx;
  const { analysis, currentTopic } = analysisResult;

  const injections: ContextInjection[] = [];

  // 1. Identity reinforcement (highest priority)
  if (identityContext.needsReinforcement && identityContext.injection) {
    injections.push({
      category: 'identity',
      content: identityContext.injection,
      priority: 100,
    });
  }

  // 2. Modular context builders
  const { buildConversationContext, formatContextForPrompt, shouldUseHighEmotionMode } =
    await getContextBuilders();

  const contextUserData: ContextUserData = {
    ...(userData || {}),
    keyMoments: userData.keyMoments?.map((summary) => ({
      summary,
      timestamp: new Date(),
    })),
  };

  const contextInput = {
    userText,
    analysis,
    services,
    userData: contextUserData,
    userProfile: services.userProfile,
    persona,
    bundleRuntime,
  };

  // 2a. SAFETY FIRST: Crisis Detection (extracted to injection-builders.ts)
  const safetyInjections = await buildSafetyInjections({
    userText,
    services,
    userData,
    persona,
    analysis,
    currentTopic,
    emotionalState,
  });
  injections.push(...safetyInjections);

  const contextInjections = await buildConversationContext(contextInput);
  if (contextInjections.length > 0) {
    // BETTER-THAN-HUMAN: Reduce context noise in high-emotion moments
    // When the user is distressed, we want the AI to focus on what matters
    const highEmotionMode = shouldUseHighEmotionMode(analysis);
    if (highEmotionMode) {
      diag.info('🎯 High emotion mode: Reducing context noise for focused support');
    }

    const contextStr = formatContextForPrompt(contextInjections, {
      highEmotionMode,
    });
    injections.push({
      category: 'context',
      content: contextStr,
      priority: 80,
    });
  }

  // 2b. Scientific Coaching Context (extracted to injection-builders.ts)
  const scientificResult = await buildScientificCoachingInjections({
    userText,
    services,
    userData,
    persona,
    analysis,
    currentTopic,
    emotionalState,
  });
  injections.push(...scientificResult.injections);

  // Store adaptive endpointing recommendation in userData for voice agent
  if (scientificResult.endpointingRecommendation) {
    (userData as Record<string, unknown>).adaptiveEndpointing =
      scientificResult.endpointingRecommendation;
    diag.debug('Adaptive endpointing updated', scientificResult.endpointingRecommendation);
  }

  // 2c. Life Coaching Context (extracted to injection-builders.ts)
  const coachingInjections = await buildLifeCoachingInjections({
    userText,
    services,
    userData,
    persona,
    analysis,
    currentTopic,
    emotionalState,
  });
  injections.push(...coachingInjections);

  // 2d. Trust Systems Context (extracted to injection-builders.ts)
  const trustInjections = await buildTrustSystemsInjections({
    userText,
    services,
    userData,
    persona,
    analysis,
    currentTopic,
    emotionalState,
  });
  injections.push(...trustInjections);

  // 2d-1. RELATIONSHIP STAGE CONTEXT - "Better than Human" relationship awareness
  // The system knows exactly where it stands with this person
  try {
    const relationshipStage = services.userProfile?.relationshipStage || userData.relationshipStage;
    const totalConversations = services.userProfile?.totalConversations || 1;
    const firstMet = services.userProfile?.createdAt;

    if (relationshipStage || totalConversations > 1) {
      const stageName = String(relationshipStage || 'building');

      const daysKnown = firstMet
        ? Math.floor((Date.now() - new Date(firstMet).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Determine guidance based on conversation count (more reliable than stage names)
      let guidance: string;
      if (totalConversations <= 1) {
        guidance = `This is early in your relationship. Be warm but don't presume intimacy.
Don't reference "our conversations" or "as we've discussed" yet.
Focus on getting to know them. Ask their name if you don't know it.`;
      } else if (totalConversations <= 5) {
        guidance = `You're getting to know each other. Building rapport.
You can reference previous conversations but keep it light.
Share some of yourself - it builds trust.`;
      } else if (totalConversations <= 20) {
        guidance = `You have history together. They trust you.
Reference past conversations when relevant. Remember details.
You can go deeper - they've shown you who they are.`;
      } else {
        guidance = `Deep relationship. Real trust. They've let you in.
You know their patterns, their fears, their dreams.
Speak with the intimacy of someone who truly knows them.`;
      }

      injections.push({
        category: 'relationship_stage',
        content: `[🤝 RELATIONSHIP CONTEXT]
Stage: ${stageName}
Conversations: ${totalConversations}
${daysKnown > 0 ? `Days known: ${daysKnown}` : 'First meeting today'}

${guidance}`,
        priority: 85,
      });

      diag.debug('📊 Relationship stage injected', {
        stage: stageName,
        conversations: totalConversations,
      });
    }
  } catch (relationshipError) {
    diag.debug('Relationship stage injection skipped', { error: String(relationshipError) });
  }

  // 2d-2. BETTER THAN HUMAN ORCHESTRATOR - Superhuman insights coordination
  // Activates all 12 engines for genuine "better than human" moments
  try {
    const userId = services.userId || 'unknown';
    const sessionId = services.sessionId || `session-${Date.now()}`;
    const sessionCount = services.userProfile?.totalConversations || 0;

    const bthOrchestrator = getBetterThanHuman(userId, sessionId, persona.id, sessionCount);

    // Map user data relationship stage to BTH stage
    const userStage = userData.relationshipStage;
    type BthStage = 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend';
    const bthStageMap: Record<string, BthStage> = {
      stranger: 'new_acquaintance',
      acquaintance: 'getting_to_know',
      friend: 'trusted_advisor',
      trusted_advisor: 'old_friend',
    };
    const bthRelationshipStage: BthStage =
      (userStage && bthStageMap[userStage]) || 'getting_to_know';

    // Get time of day
    const hour = new Date().getHours();
    const timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    const dayOfWeek = new Date().getDay();

    // Build context for the orchestrator using its expected interface
    const bthContext = {
      userMessage: userText,
      turnCount: userData.turnCount || 0,
      sessionCount,
      topic: analysis.topics?.detected?.[0],
      emotion: analysis.emotion.primary,
      isSessionStart: (userData.turnCount || 0) <= 1,
      relationshipStage: bthRelationshipStage,
      personaId: persona.id,
      userId,
      sessionId,
      timeOfDay,
      dayOfWeek,
    };

    // Use the analyze method
    const insight = bthOrchestrator.analyze(bthContext);

    // Inject top prioritized actions (limit to avoid overwhelming)
    if (insight && insight.prioritizedActions && insight.prioritizedActions.length > 0) {
      const topActions = insight.prioritizedActions.slice(0, 2); // Max 2 per turn

      for (const action of topActions) {
        if (action.content && action.priority > 0.5) {
          injections.push({
            category: 'superhuman_insight',
            content: `[🌟 BETTER THAN HUMAN - ${action.type}]
${action.content}

${action.reason ? `Why: ${action.reason}` : ''}
Placement: ${action.placement || 'natural'} - weave this in naturally.`,
            priority: Math.round(action.priority * 100),
          });
        }
      }

      if (topActions.length > 0) {
        diag.info('🌟 BetterThanHuman insights active', {
          count: topActions.length,
          types: topActions.map((a) => a.type).join(', '),
        });
      }
    }
  } catch (bthError) {
    diag.debug('BetterThanHuman orchestration skipped', { error: String(bthError) });
    // Non-fatal - continue without superhuman insights
  }

  // 2e. Ambient Awareness - "Better than Human" environment detection
  // A human friend on the phone might not notice you're in a car or coffee shop. We do.
  const ambientInjections = buildAmbientAwarenessInjections(userData);
  injections.push(...ambientInjections);

  // 2f. Boundary Check - "Better than Human" detailed boundary guidance
  // We don't just know what to avoid, we know HOW to approach sensitive areas
  const boundaryInjections = await buildBoundaryCheckInjections({
    userId: services.userId || 'unknown',
    currentTopic,
  });
  injections.push(...boundaryInjections);

  // 2g. Health Awareness - "Better than Human" service health transparency
  // A human friend would be honest about technical difficulties. So are we.
  const healthInjections = await buildHealthAwarenessInjections();
  injections.push(...healthInjections);

  // 2g. Value Capture - Detect achievements/breakthroughs for optional contribution prompt
  // This runs silently and stores detected events for later potential prompting
  try {
    const userId = services.userId || 'unknown';
    const valueEvent = await valueCapture.detect({
      userId,
      message: userText,
      conversationId: services.sessionId,
    });

    if (valueEvent) {
      diag.info('💰 Value event detected', {
        type: valueEvent.type,
        estimatedValue: valueEvent.estimatedValueCents,
      });

      // Store on userData for later frontend integration
      // This allows the UI to optionally prompt for contribution after conversation
      (userData as Record<string, unknown>).lastValueEvent = {
        type: valueEvent.type,
        eventId: valueEvent.id,
        message: userText.slice(0, 100),
        timestamp: valueEvent.createdAt,
      };

      // Check if we should show value capture (rate-limited, not disruptive)
      const recentValuePromptCount =
        ((userData as Record<string, unknown>).valuePromptCount as number) || 0;
      const shouldShow = valueCapture.shouldShow({
        event: valueEvent,
        recentValuePromptCount,
        conversationTurnCount: userData.turnCount || 0,
      });

      if (shouldShow) {
        // Flag for potential post-conversation prompt (not during!)
        (userData as Record<string, unknown>).shouldPromptValueCapture = true;
        (userData as Record<string, unknown>).valuePromptCount = recentValuePromptCount + 1;
      }
    }
  } catch (valueError) {
    diag.debug('Value capture detection skipped', { error: String(valueError) });
    // Non-fatal - monetization detection should never block conversation
  }

  // 3. Task wisdom
  try {
    const taskManager = await getTaskManagerCached();
    const taskContext = taskManager.processUserTurn(analysis, userText, {
      isReturningUser: userData.isReturningUser,
      lastSummary: services.userProfile?.lastConversationSummary,
    });

    if (taskContext.length > 0) {
      injections.push({
        category: 'tasks',
        content: `[TASK GUIDANCE]\n${taskContext.join('\n\n')}`,
        priority: 70,
      });
    }
  } catch {
    // Non-fatal
  }

  // 4. Response length guidance
  injections.push({
    category: 'response_length',
    content: responseGuidance.length.guidance,
    priority: 60,
  });

  // 5. Topic transition
  if (responseGuidance.topicTransition) {
    injections.push({
      category: 'topic_transition',
      content: responseGuidance.topicTransition,
      priority: 55,
    });
  }

  // 6. Pacing guidance
  if (responseGuidance.pacing) {
    injections.push({
      category: 'pacing',
      content: `[PACING GUIDANCE]\n${responseGuidance.pacing}`,
      priority: 50,
    });
  }

  // 7. Human-level features (extracted to injection-builders.ts)
  const humanLevelInjections = await buildHumanLevelInjections({
    services,
    userData,
    userText,
    analysis,
    currentTopic,
    humorGuidance: responseGuidance.humor,
    logger: ctx.logger,
  });
  injections.push(...humanLevelInjections);

  // 8. Emotional guidance
  if (emotionalState.responseGuidance) {
    injections.push({
      category: 'emotional_guidance',
      content: emotionalState.responseGuidance,
      priority: 33,
    });
  }

  if (emotionalState.transitionPhrase) {
    injections.push({
      category: 'emotional_transition',
      content: `[EMOTIONAL SHIFT DETECTED: Consider acknowledging with something like: "${emotionalState.transitionPhrase}"]`,
      priority: 32,
    });
  }

  // 8b. Cross-persona insights (extracted to injection-builders.ts)
  const insightsInjection = await buildCrossPersonaInsightsInjection(services, persona.id);
  if (insightsInjection) {
    injections.push(insightsInjection);
  }

  // 9. Story opportunity
  if (responseGuidance.storyOpportunity) {
    injections.push({
      category: 'story_opportunity',
      content: `[STORY OPPORTUNITY: Consider sharing this story: "${responseGuidance.storyOpportunity.story}..." Transition: "${responseGuidance.storyOpportunity.transitionPhrase}"]`,
      priority: 30,
    });
  }

  // 10. Humanizing context
  if (humanizingResult && humanizingResult.injections.length > 0) {
    const humanizingPrompt = formatHumanizingForPrompt(humanizingResult);
    if (humanizingPrompt) {
      injections.push({
        category: 'humanizing',
        content: humanizingPrompt,
        priority: 28,
      });
    }
  }

  // 11. Conversation humanizing
  try {
    const conversationHumanizingInput = {
      userText,
      analysis,
      services,
      userData: {
        ...userData,
        keyMoments: userData.keyMoments?.map((s) => ({ summary: s, timestamp: new Date() })),
      },
      userProfile: services.userProfile,
      persona,
      bundleRuntime,
      personaId: persona.id,
      turnNumber: userData.turnCount || 0,
      wasPersonalSharing:
        (analysis.emotion.distressLevel ?? 0) > 0.5 || analysis.emotion.intensity > 0.7,
    };

    const convHumanizingInjections = buildConversationHumanizingContext(
      conversationHumanizingInput
    );
    if (convHumanizingInjections.length > 0) {
      const prompt = formatConversationHumanizingForPrompt(convHumanizingInjections);
      if (prompt) {
        injections.push({
          category: 'conversation_humanizing',
          content: prompt,
          priority: 25,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // 12. Bundle runtime context
  if (bundleRuntimeContext) {
    if (bundleRuntimeContext.modeTransitionPhrase) {
      const mode = bundleRuntime?.getCurrentMode();
      const modeGuidance = mode
        ? [
            `[PERSONA MODE: ${bundleRuntimeContext.currentMode.toUpperCase()}]`,
            `Style: ${mode.description}`,
            `Response length: ${mode.response_length}`,
            `Behaviors: ${mode.behaviors.join(', ')}`,
          ].join('\n')
        : '';

      injections.push({
        category: 'mode_transition',
        content: `[MODE SHIFT: ${bundleRuntimeContext.previousMode} → ${bundleRuntimeContext.currentMode}]\nConsider transitioning with: "${bundleRuntimeContext.modeTransitionPhrase}"\n${modeGuidance}`,
        priority: 22,
      });
    }

    if (bundleRuntimeContext.situationalResponse) {
      const sr = bundleRuntimeContext.situationalResponse;
      const content =
        sr.type === 'celebration'
          ? `[CELEBRATION DETECTED: ${sr.situation}]\nUse this celebratory tone: "${sr.response}"`
          : `[SENSITIVE MOMENT: ${sr.situation}]\nRespond with care: "${sr.response}"\nAVOID phrases like: ${sr.avoidPhrases?.join(', ') || ''}`;

      injections.push({
        category: 'situational_response',
        content,
        priority: 20,
      });
    }

    if (bundleRuntimeContext.pushbackDetected) {
      injections.push({
        category: 'pushback',
        content: `[USER PUSHBACK DETECTED: ${bundleRuntimeContext.pushbackDetected.type}]\nRespond with curiosity not defense: "${bundleRuntimeContext.pushbackDetected.response}"`,
        priority: 18,
      });
    }
  }

  // 13. Response naturalness
  const turnCount = userData.turnCount || 0;
  const enhancements = getResponseEnhancements({
    personaId: persona.id,
    turnCount,
    userEmotion: analysis.emotion.primary,
    topicWeight: 'medium',
    isQuestion: userText.includes('?'),
    isFollowUp: turnCount > 0,
    isGreeting: turnCount === 0,
    isPositiveMoment:
      analysis.emotion.primary === 'joy' || analysis.emotion.primary === 'anticipation',
  });

  if (enhancements.prefix) {
    injections.push({
      category: 'response_prefix',
      content: `[RESPONSE STYLE]\nStart your response with: "${enhancements.prefix.replace(/<[^>]+>/g, '')}"\nThen continue with your substantive response.\n\n⛔ NEVER SAY: "Good question", "Great question", "Well...", "That's a great point" - these are AI clichés. Just respond naturally.`,
      priority: 15,
    });
  }

  if (enhancements.suffix) {
    injections.push({
      category: 'catchphrase',
      content: `[CATCHPHRASE MOMENT]\nIf appropriate, weave in this signature phrase naturally: "${enhancements.suffix.replace(/<[^>]+>/g, '')}"`,
      priority: 12,
    });
  }

  // 14. Conversation state summary
  if (userData.conversationState) {
    const convSummary = userData.conversationState.getSummaryForLLM();
    if (convSummary) {
      injections.push({
        category: 'conversation_state',
        content: `[CONVERSATION STATE]\n${convSummary}`,
        priority: 10,
      });
    }

    const wrapUp = userData.conversationState.shouldWrapUp();
    if (wrapUp.should) {
      injections.push({
        category: 'wrap_up',
        content: `[CONSIDER WRAPPING UP]\nReasons: ${wrapUp.reasons.join(', ')}\nLook for a natural moment to offer a graceful conclusion.`,
        priority: 8,
      });
    }
  }

  // 15. Conversation dynamics (extracted to injection-builders.ts)
  // Map to the injection builder's expected type (which has stricter level typing)
  const dynamicsForBuilder: InjectionDynamicsResult = {
    narrativeArc: conversationDynamics.narrativeArc,
    engagement: conversationDynamics.engagement
      ? {
          level: conversationDynamics.engagement.level as 'low' | 'medium' | 'high' | 'distracted',
          declining: conversationDynamics.engagement.declining,
          suggestedAction: conversationDynamics.engagement.suggestedAction,
          actionGuidance: conversationDynamics.engagement.actionGuidance,
        }
      : undefined,
    rhythm: conversationDynamics.rhythm
      ? {
          lengthMultiplier: conversationDynamics.rhythm.lengthMultiplier,
          energyLevel: conversationDynamics.rhythm.energyLevel as 'low' | 'medium' | 'high',
          guidance: conversationDynamics.rhythm.guidance,
        }
      : undefined,
    silence: conversationDynamics.silence,
  };
  const dynamicsInjections = buildConversationDynamicsInjections(dynamicsForBuilder);
  injections.push(...dynamicsInjections);

  // Sort by priority (highest first)
  injections.sort((a, b) => b.priority - a.priority);

  return injections;
}

// ============================================================================
// ADVANCED HUMANIZATION PROCESSING
// ============================================================================

/**
 * Process advanced humanization for a turn
 *
 * This coordinates all 10 deep humanization capabilities:
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
async function processAdvancedHumanization(
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

// ============================================================================
// MAIN TURN PROCESSOR
// ============================================================================

/**
 * Process a complete user turn
 *
 * This is the main entry point that orchestrates all turn processing.
 * Extracted from voice-agent.ts onUserTurnCompleted method.
 *
 * @param ctx - Turn context with all required inputs
 * @returns Complete turn processing result
 */
export async function processTurn(ctx: TurnContext): Promise<TurnProcessorResult> {
  const startTime = Date.now();
  const { turnCtx, userText, userData, services, logger } = ctx;
  const turnNumber = userData?.turnCount || 1;

  // PERFORMANCE: Start turn profiling
  startTurnProfiling(services.sessionId, turnNumber);

  // Log start
  diag.user('Processing user turn', {
    preview: userText.slice(0, 100),
  });

  if (!userText || userText.trim().length === 0) {
    diag.warn('Empty user text');
    throw new Error('Empty user text');
  }

  // 1. Analyze message (synchronous - required for all downstream)
  const analysisResult = analyzeMessage(ctx);
  markTurnCheckpoint(services.sessionId, turnNumber, 'analysisComplete');

  // 2. Update conversation state (synchronous)
  updateConversationState(ctx, analysisResult);

  // ============================================================================
  // PARALLEL PROCESSING: Run independent async operations concurrently
  // This saves ~30-50ms by not waiting for each operation sequentially
  // ============================================================================

  // Start independent async operations in parallel
  const easterEggPromise = checkEasterEggs(ctx, turnCtx);

  // Fire-and-forget humanization processing (doesn't block turn)
  void (async () => {
    try {
      const { processUserMessage } =
        await import('../../conversation/humanization/voice-agent-integration.js');
      processUserMessage(services.sessionId, userText, {
        voiceEmotion: userData?.voiceEmotion
          ? {
              primary: userData.voiceEmotion.primary,
              confidence: userData.voiceEmotion.confidence,
            }
          : undefined,
        topic: analysisResult.currentTopic,
      });
    } catch {
      // Non-fatal - don't log noise
    }
  })();

  // 4. Build emotional state (synchronous - depends on analysis)
  const emotionalState = buildEmotionalState(ctx, analysisResult);

  // 4b. Record mismatch as cross-persona insight (fire-and-forget)
  if (emotionalState.mismatch?.hasMismatch && emotionalState.mismatch.confidence > 0.5) {
    const personaId = ctx.persona.id as
      | 'ferni'
      | 'maya'
      | 'peter'
      | 'alex'
      | 'jordan'
      | 'nayan'
      | 'jack';
    void recordMismatchInsight(
      services.userId || 'anonymous',
      personaId,
      emotionalState.mismatch
    ).catch((err) => {
      diag.debug('Failed to record mismatch insight (non-critical)', { error: String(err) });
    });
  }

  // 4c. Process conversation dynamics (synchronous - depends on analysis + emotion)
  const conversationDynamics = processConversationDynamics(ctx, analysisResult, {
    primary: emotionalState.primary,
    intensity: emotionalState.intensity,
    distressLevel: emotionalState.distressLevel,
  });

  // Wait for easter egg check (should be fast, but was started in parallel)
  const easterEgg = await easterEggPromise;

  // 5. Build response guidance
  const responseGuidance = buildResponseGuidance(ctx, analysisResult, emotionalState);

  // 5b. HUMAN-FIRST 2FA: Process message for magic moments and contact detection
  // This detects:
  // - Phone numbers/emails in user message (auto-saves them)
  // - Magic moments (emotional highs perfect for phone ask)
  // - Verification codes (if user is verifying)
  let identityMessageResult:
    | {
        shouldAskForPhone?: boolean;
        contactDetected?: boolean;
        verificationResult?: { verified: boolean; message: string };
        llmContextUpdate?: string;
      }
    | undefined;

  try {
    const { onUserMessage } =
      await import('../../services/trust-and-identity/voice-agent-integration.js');
    const emotionalIntensity = emotionalState.intensity ?? 0.5;

    identityMessageResult = await onUserMessage(services.sessionId, userText, emotionalIntensity);

    if (identityMessageResult.contactDetected) {
      diag.user('📱 Contact info detected and saved');
    }

    if (identityMessageResult.shouldAskForPhone) {
      diag.user('✨ Magic moment detected - phone ask pending');
    }

    if (identityMessageResult.verificationResult) {
      diag.user('🔐 Verification code processed', {
        verified: identityMessageResult.verificationResult.verified,
      });
    }
  } catch (identityErr) {
    // Non-fatal - don't block turn processing
    diag.warn('Identity message processing failed (non-fatal)', { error: String(identityErr) });
  }

  // 5c. INTELLIGENCE: Detect moments and record to relationship memory
  // This is what makes Ferni "remember" meaningful moments across sessions
  try {
    const { processMessageWithIntelligenceSystem } = await import(
      '../integrations/conversation-session-integration.js'
    );
    const intelligenceResult = await processMessageWithIntelligenceSystem(
      services.sessionId,
      userText,
      undefined, // AI response not yet available
      (analysisResult as { currentTopic?: string }).currentTopic
    );

    if (intelligenceResult) {
      if (intelligenceResult.shouldAcknowledge) {
        diag.user('🧠 Moment detected - should acknowledge');
      }
      if (intelligenceResult.concerns.length > 0) {
        diag.user('⚠️ Concerns detected', {
          count: intelligenceResult.concerns.length,
          severities: intelligenceResult.concerns.map((c) => c.severity),
        });
      }
    }
  } catch (intelligenceErr) {
    // Non-fatal - don't block turn processing
    diag.debug('Intelligence processing failed (non-fatal)', { error: String(intelligenceErr) });
  }

  // 6. Build identity context
  const identityContext = buildIdentityContext(ctx);

  // 7. Build humanizing context
  const humanizingResult = buildHumanizingContextForTurn(ctx, analysisResult);

  // 8. Process bundle runtime
  const bundleRuntimeContext = processBundleRuntime(ctx, analysisResult);

  // ============================================================================
  // PARALLEL CONTEXT BUILDING: Run context + humanization concurrently
  // These are the two heaviest async operations - running in parallel saves ~50ms
  // ============================================================================

  // PERFORMANCE: Mark context building start
  markTurnCheckpoint(services.sessionId, turnNumber, 'contextBuildStart');

  const [injections, advancedHumanizationResult] = await Promise.all([
    // 9. Build all context injections
    buildContextInjections(
      ctx,
      analysisResult,
      emotionalState,
      responseGuidance,
      identityContext,
      humanizingResult,
      bundleRuntimeContext,
      conversationDynamics
    ),

    // 9a. ADVANCED HUMANIZATION: Process through all 10 deep capabilities
    // This is the core "Better Than Human" humanization layer
    processAdvancedHumanization(ctx, analysisResult, emotionalState),
  ]);

  // Add advanced humanization injections
  if (advancedHumanizationResult) {
    injections.push(...advancedHumanizationResult.injections);
    // Re-sort after adding
    injections.sort((a, b) => b.priority - a.priority);
  }

  // 9b. Add identity-related context injections (verification results, contact detection)
  if (identityMessageResult) {
    // If verification code was detected and processed
    if (identityMessageResult.verificationResult) {
      injections.push({
        category: 'identity_verification',
        content: identityMessageResult.verificationResult.verified
          ? `[VERIFICATION SUCCESS] User verified their phone! Thank them warmly: "${identityMessageResult.verificationResult.message}"`
          : `[VERIFICATION NEEDED] ${identityMessageResult.verificationResult.message}`,
        priority: 100, // High priority
      });
    }

    // If contact info was detected in their message
    if (identityMessageResult.contactDetected) {
      injections.push({
        category: 'contact_detected',
        content: `[CONTACT SAVED] User provided their contact info! Thank them warmly and naturally - you can now follow up with them between sessions.`,
        priority: 50, // Medium priority
      });
    }

    // Note: Phone ask injection happens in voice-agent.ts via getResponseModification()
    // because it needs to be injected AFTER turn processing, right before the response
  }

  // 10. Update userData for handoff system
  const { currentTopic, analysis } = analysisResult;
  if (userData) {
    userData.lastTopic = currentTopic;
    userData.lastUserMessage = userText;
    userData.lastEmotionAnalysis = {
      primary: analysis.emotion.primary,
      intensity: analysis.emotion.intensity || 0.5,
      distressLevel: analysis.emotion.distressLevel,
    };

    updateUserContextForHandoff({
      lastUserMessage: userText,
      emotionAnalysis: userData.lastEmotionAnalysis,
    });
  }

  // 11. Track response quality with story/question metadata
  if (userData.lastAgentResponse) {
    // Check if a story was told in the previous response
    const turnCount = userData.turnCount || 1;
    const wasStoryTold = userData.lastStoryTurn === turnCount - 1;
    const lastStoryId =
      wasStoryTold && userData.storiesShared?.length
        ? userData.storiesShared[userData.storiesShared.length - 1]
        : undefined;

    // Extract any question asked in the previous response
    // Match sentences ending with ? that are meaningful questions
    const questionMatch = userData.lastAgentResponse.match(/(?:^|[.!]\s*)([A-Z][^?]*\?)/g);
    // Use the last question as most questions come at the end
    const questionAsked = questionMatch?.length
      ? questionMatch[questionMatch.length - 1].trim()
      : undefined;

    services.recordResponseSignal({
      agentResponse: userData.lastAgentResponse,
      userResponse: userText,
      topic: currentTopic || 'general',
      conversationPhase: String(services.getPromptContext().phase || 'building'),
      emotion: {
        primary: analysis.emotion.primary,
        intensity: analysis.emotion.intensity || 0.5,
      },
      storyId: lastStoryId,
      questionAsked,
    });
  }

  // 12. Persist humanizing state
  if (humanizingResult) {
    services.updateHumanizingState({
      sessionId: services.sessionId,
      newShareTags: humanizingResult.usedTags,
      spontaneousShareCount: humanizingResult.spontaneousShare ? 1 : 0,
      currentMood: humanizingResult.mood.state,
      storiesTold:
        humanizingResult.spontaneousShare?.type === 'micro_story'
          ? humanizingResult.spontaneousShare.tags
          : undefined,
      hotTakesShared:
        humanizingResult.spontaneousShare?.type === 'hot_take'
          ? humanizingResult.spontaneousShare.tags
          : undefined,
      innerWorldRevealed: humanizingResult.innerWorldContent?.map((c) => ({
        type: c.type,
        content: c.content,
      })),
      relationshipTransition: humanizingResult.relationshipTransition
        ? {
            from: userData.previousRelationshipStage || 'stranger',
            to: humanizingResult.relationship.stage,
            acknowledged: true,
          }
        : undefined,
    });
  }

  // 13. INTELLIGENT OUTREACH: Extract commitments, emotions, life events
  // This feeds the "Better Than Human" proactive outreach system
  // Runs async to not block the response - outreach happens later anyway
  const userId = services.userId;
  if (userId && userText.length > 10) {
    // Fire and forget - don't await
    extractOutreachContext(userId, userText).catch((outreachErr) => {
      // Non-fatal - outreach extraction should never block conversation
      diag.debug('Outreach extraction skipped', { error: String(outreachErr) });
    });
  }

  // 14. CROSS-SESSION REFLECTION: Detect moments worth reflecting on later
  // "Better Than Human" - We remember significant moments and reflect on them next session
  if (services.userProfile && (analysis.emotion.intensity || 0.5) > 0.6) {
    const reflectionMoment = detectReflectionMoment(
      userText,
      currentTopic || 'general',
      analysis.emotion.primary,
      analysis.emotion.intensity || 0.5,
      services.sessionId,
      ctx.persona.id
    );

    if (reflectionMoment) {
      saveReflectionMoment(services.userProfile, reflectionMoment);
      diag.debug('Reflection moment captured', {
        type: reflectionMoment.type,
        topic: reflectionMoment.topic,
        weight: reflectionMoment.emotionalWeight,
      });
    }
  }

  // Calculate elapsed time
  const elapsedMs = Date.now() - startTime;

  // PERFORMANCE: Mark context build complete and complete profiling
  markTurnCheckpoint(services.sessionId, turnNumber, 'contextBuildComplete');
  const profilingMetrics = completeTurnProfiling(services.sessionId, turnNumber);
  if (profilingMetrics && profilingMetrics.tier !== 'excellent' && profilingMetrics.tier !== 'good') {
    diag.warn('Turn performance below target', {
      tier: profilingMetrics.tier,
      totalMs: profilingMetrics.latencies.totalTurnMs,
      bottleneck: profilingMetrics.bottleneck.component,
      bottleneckMs: profilingMetrics.bottleneck.latencyMs,
    });
  }

  // Log completion
  logger.info(
    {
      emotion: analysis.emotion.primary,
      distress: analysis.emotion.distressLevel.toFixed(2),
      intent: analysis.intent.primary,
      topics: analysis.topics.detected.slice(0, 3),
      phase: analysis.state.phase,
      contextCount: injections.length,
      emotionalTrajectory: emotionalState.trajectory,
      elapsedMs,
    },
    'Turn processing complete'
  );

  if (elapsedMs > 1000) {
    logger.warn({ elapsedMs }, 'Turn processing took longer than expected');
  }

  // Build value capture result if detected
  const lastValueEvent = (userData as Record<string, unknown>).lastValueEvent as
    | { type: string; eventId: string }
    | undefined;
  const shouldPromptValue = (userData as Record<string, unknown>).shouldPromptValueCapture;

  const valueCapture = lastValueEvent
    ? {
        type: lastValueEvent.type,
        eventId: lastValueEvent.eventId,
        shouldPrompt: !!shouldPromptValue,
      }
    : undefined;

  // Build advanced humanization result for return
  const advancedHumanization = advancedHumanizationResult
    ? {
        responsePrefix: advancedHumanizationResult.responsePrefix,
        responseSuffix: advancedHumanizationResult.responseSuffix,
        stopDirectAdvice: advancedHumanizationResult.stopDirectAdvice,
        toneGuidance: advancedHumanizationResult.toneGuidance,
        lengthGuidance: advancedHumanizationResult.lengthGuidance,
      }
    : undefined;

  // SMART FILTERING: Only include injections relevant to this conversation mode
  // A human doesn't think about ALL possible response strategies every time.
  // They focus on what matters in the moment.
  // Crisis detection happens in safety injections, so we check if any crisis injection was added
  const crisisDetected = injections.some(
    (inj) => inj.category === 'safety' || inj.category === 'crisis_response'
  );
  const conversationMode = detectConversationMode(
    ctx.userText,
    emotionalState.intensity,
    crisisDetected
  );

  const filteredInjections = filterInjections(injections, {
    mode: conversationMode,
    userText: ctx.userText,
    emotionalIntensity: emotionalState.intensity,
    crisisDetected,
  });

  return {
    analysis: analysisResult,
    context: {
      injections: filteredInjections,
      humanizingResult: humanizingResult || undefined,
      elapsedMs,
    },
    emotional: emotionalState,
    response: responseGuidance,
    identity: identityContext,
    bundleRuntime: bundleRuntimeContext,
    easterEgg,
    valueCapture,
    advancedHumanization,
  };
}

/**
 * Inject turn processing results into the LLM context
 *
 * Call this after processTurn() to add all context injections to the chat.
 */
export function injectTurnContext(turnCtx: llm.ChatContext, result: TurnProcessorResult): void {
  const { injections } = result.context;

  if (injections.length === 0) return;

  // DEBUG: Log all injections being added
  const debugInjections = process.env.DEBUG_INJECTIONS === 'true';
  if (debugInjections) {
    const totalChars = injections.reduce((sum, inj) => sum + inj.content.length, 0);
    const categories = injections.map((inj) => `${inj.category}(${inj.content.length})`).join(', ');
    process.stderr.write(`\n${'='.repeat(80)}\n`);
    process.stderr.write(
      `[INJECTION DEBUG] ${injections.length} injections, ${totalChars} chars total\n`
    );
    process.stderr.write(`[INJECTION DEBUG] Categories: ${categories}\n`);
    process.stderr.write(`${'='.repeat(80)}\n`);

    // Log each injection content (truncated)
    for (const inj of injections) {
      const preview = inj.content.slice(0, 200).replace(/\n/g, ' ');
      process.stderr.write(`[${inj.category}] (priority ${inj.priority}): ${preview}...\n`);
    }
    process.stderr.write(`${'='.repeat(80)}\n\n`);
  }

  // Combine all injection content
  const combinedContent = injections.map((inj) => inj.content).join('\n\n');

  turnCtx.addMessage({
    role: 'user',
    content: combinedContent,
  });
}

/**
 * Get celebration events from context injections
 * (For sending visual feedback to frontend)
 */
export function getCelebrationEvents(
  result: TurnProcessorResult
): Array<{ category: string; content: string }> {
  const celebrationCategories = ['milestone', 'achievement', 'aha_moment', 'good_news'];

  return result.context.injections
    .filter((inj) => celebrationCategories.includes(inj.category))
    .map((inj) => ({ category: inj.category, content: inj.content }));
}
