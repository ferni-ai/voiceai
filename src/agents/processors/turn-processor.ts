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
import { diag } from '../../services/diagnostic-logger.js';
import { getCurrentAgent, getAgentContext, updateUserContextForHandoff } from '../../tools/handoff/index.js';
import type { ContextUserData } from '../../intelligence/context-builders/index.js';
import type {
  TurnContext,
  TurnAnalysisResult,
  ContextBuildResult,
  ContextInjection,
  EmotionalState,
  ResponseGuidance,
  IdentityContext,
  BundleRuntimeContext,
  TurnProcessorResult,
  CachedModules,
} from './types.js';

// Conversation engines (singletons)
import {
  getEmotionalArcTracker,
  getResponseDynamicsEngine,
  getStoryTimingEngine,
  getConversationHumanizer,
} from '../../conversation/index.js';

// Humanizing context
import {
  buildHumanizingContext,
  formatHumanizingForPrompt,
  getHumanizingSummary,
  shouldMoodShift,
  getMoodShift,
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
import { getResponseEnhancements, resetCatchphraseTracking } from '../../speech/response-naturalness.js';

// Emotion matching
import { getEmotionModulation, getEmotionGuidance } from '../../speech/emotion-matching.js';

// Voice-text mismatch detection ("better than human" - detect incongruence)
import {
  detectMismatch,
  recordMismatchInsight,
  buildMismatchGuidance,
  type MismatchResult,
} from '../../intelligence/voice-text-mismatch.js';

// Cross-persona insight sharing
import {
  buildInsightContext,
  getInsightsToSurface,
  acknowledgeInsight,
  type InsightForPersona,
} from '../../services/cross-persona-insights.js';

// Personal theme tracking (prevents "always talks about Wyoming")
import { extractPersonalThemes } from '../session/session-state.js';

// ============================================================================
// CACHED IMPORTS - Lazy loaded once for performance
// ============================================================================

const cachedModules: CachedModules = {
  buildConversationContext: null,
  formatContextForPrompt: null,
  checkForEasterEgg: null,
  getTaskManager: null,
};

async function getContextBuilders() {
  if (!cachedModules.buildConversationContext) {
    const mod = await import('../../intelligence/context-builders/index.js');
    cachedModules.buildConversationContext = mod.buildConversationContext;
    cachedModules.formatContextForPrompt = mod.formatContextForPrompt;
  }
  return {
    buildConversationContext: cachedModules.buildConversationContext!,
    formatContextForPrompt: cachedModules.formatContextForPrompt!,
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

  // Analyze the message
  const analysis = services.analyze(userText);

  // Track the user turn
  services.addTurn('user', userText);

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
function updateConversationState(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult
): void {
  const { userData, userText } = ctx;
  const { analysis, currentTopic } = analysisResult;

  if (!userData.conversationState) return;

  const convState = userData.conversationState;

  // Increment turn count
  convState.incrementTurn();

  // Update emotional context
  const emotionMap: Record<string, 'happy' | 'excited' | 'calm' | 'anxious' | 'frustrated' | 'sad' | 'confused' | 'grateful'> = {
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

  // Update sentiment
  const intensity = analysis.emotion.intensity || 0.5;
  let sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
  const posEmotions = ['happy', 'excited', 'grateful', 'content'];
  const negEmotions = ['sad', 'frustrated', 'angry', 'anxious'];

  if (posEmotions.includes(analysis.emotion.primary.toLowerCase())) {
    sentiment = 'positive';
  } else if (negEmotions.includes(analysis.emotion.primary.toLowerCase())) {
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

  // Check for wrap-up signals
  const wrapUpPhrases = [
    'gotta go', 'have to go', 'need to go', 'i should go',
    'bye', 'goodbye', 'see you', 'talk later', 'later',
    "that's all", "that's it", "i'm done", 'thanks for',
  ];

  if (wrapUpPhrases.some((phrase) => userText.toLowerCase().includes(phrase))) {
    convState.markUserWantsToLeave();
    diag.state('User wants to leave detected', { userText: userText.slice(0, 50) });
  }
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
  const emotionModulation = userData.emotionModulation;
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
    userEngagement: analysis.emotion.intensity > 0.6 ? 'high' as const : analysis.emotion.intensity < 0.3 ? 'low' as const : 'medium' as const,
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
 */
function buildIdentityContext(ctx: TurnContext): IdentityContext {
  const { persona } = ctx;

  const activeAgentId = getCurrentAgent();
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

  // Check if handoff occurred
  if (!isSamePersona(activeAgentId, sessionPersonaId) && !isCoach(activeAgentId)) {
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are NOT ${persona.name}. That was the previous persona.
- Your current identity determines your personality, tools, and expertise.
- If asked "who are you?" respond with your CURRENT identity.
=== END IDENTITY ===`;
    }
  } else if (isCoach(activeAgentId) && !isCoach(sessionPersonaId)) {
    // Returned to Ferni
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are FERNI, the life coach.
- You are NOT the previous specialist. You've returned to your coach role.
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
    const previousRelationshipStage = userData.previousRelationshipStage;

    const humanizingContext = {
      persona,
      bundleRuntime,
      voiceEmotion: userData.voiceEmotion || null,
      textEmotion: analysis.emotion ? {
        primary: analysis.emotion.primary,
        confidence: analysis.emotion.confidence || 0.7,
        valence: analysis.emotion.valence || 'neutral',
        distressLevel: analysis.emotion.distressLevel,
        intensity: analysis.emotion.intensity || 0.5,
        markers: analysis.emotion.markers || [],
        suggestedTone: (analysis.emotion.suggestedTone || 'neutral') as 'warm' | 'gentle' | 'enthusiastic' | 'calm' | 'serious' | 'friendly' | 'reassuring' | 'informative' | 'measured',
      } : null,
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
    const topicWeight = analysis.emotion.distressLevel > 0.6
      ? 'heavy' as const
      : analysis.emotion.distressLevel > 0.3
        ? 'medium' as const
        : 'light' as const;

    if (shouldMoodShift(result.mood, analysis.emotion.primary, topicWeight)) {
      const newMoodState = getMoodShift(result.mood.state, `${analysis.emotion.primary}_${topicWeight}`);
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
    result.modeTransitionPhrase = bundleRuntime.getModeTransitionPhrase(previousMode, newMode) || undefined;

    // Sync to userData
    if (userData?.bundleRuntimeState) {
      userData.bundleRuntimeState.currentMode = newMode;
      userData.bundleRuntimeState.lastModeTransition = `${previousMode}_to_${newMode}`;
    }
  }

  // Check situational responses
  const lowerText = userText.toLowerCase();

  const celebrationKeywords = ['promotion', 'got the job', 'engaged', 'married', 'pregnant', 'retired', 'graduated', 'paid off'];
  const condolenceKeywords = ['died', 'passed away', 'cancer', 'lost my', 'funeral', 'divorce', 'laid off', 'fired'];

  for (const keyword of celebrationKeywords) {
    if (lowerText.includes(keyword)) {
      const situation = keyword.includes('job') ? 'job_promotion'
        : keyword.includes('engaged') ? 'engagement'
        : keyword.includes('pregnant') ? 'baby_news'
        : keyword.includes('retired') ? 'retirement'
        : keyword.includes('graduated') ? 'graduation'
        : keyword.includes('paid off') ? 'paid_off_debt'
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
      const situation = (keyword.includes('died') || keyword.includes('passed')) ? 'death_family_member'
        : keyword.includes('cancer') ? 'health_diagnosis'
        : keyword.includes('divorce') ? 'divorce_breakup'
        : (keyword.includes('laid off') || keyword.includes('fired')) ? 'job_loss'
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
  bundleRuntimeContext: BundleRuntimeContext | undefined
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
  const { buildConversationContext, formatContextForPrompt } = await getContextBuilders();

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

  const contextInjections = await buildConversationContext(contextInput);
  if (contextInjections.length > 0) {
    const contextStr = formatContextForPrompt(contextInjections);
    injections.push({
      category: 'context',
      content: contextStr,
      priority: 80,
    });
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

  // 7. Human-level features
  try {
    // Communication style
    services.communicationMirroring.analyzeMessage(userText);
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
      const userLaughed = userData.voiceEmotion?.primary === 'happy' && userData.voiceEmotion?.confidence > 0.6;
      services.humorCalibration.analyzeReaction(userText, userLaughed);
      userData.lastResponseHadHumor = false;
    }

    if (responseGuidance.humor?.shouldAttempt) {
      const humorContent = [
        `[HUMOR OK]`,
        responseGuidance.humor.type ? `Try ${responseGuidance.humor.type} humor.` : '',
        responseGuidance.humor.avoid?.length ? `Avoid: ${responseGuidance.humor.avoid.join(', ')}` : '',
      ].filter(Boolean).join(' ');
      
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
    if (analysis.emotion.primary !== 'neutral' && (analysis.emotion.intensity || 0.5) > 0.5) {
      const intensity = (analysis.emotion.intensity || 0.5) >= 0.7 ? 'strong' : 'moderate';
      services.emotionalMemory.recordMoment(
        analysis.emotion.primary as import('../../intelligence/emotion-detector.js').PrimaryEmotion,
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
    ctx.logger.warn({ error: String(error) }, 'Human-level features failed (non-fatal)');
  }

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

  // 8b. Cross-persona insights (team intelligence)
  try {
    const personaId = persona.id as 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan' | 'jack';
    const insightContext = buildInsightContext(services.userId || 'anonymous', personaId, { maxInsights: 3 });
    if (insightContext) {
      injections.push({
        category: 'team_insights',
        content: insightContext,
        priority: 31,
      });
    }

    // Acknowledge insights we're using
    const insightsToSurface = getInsightsToSurface(services.userId || 'anonymous', personaId, 2);
    for (const item of insightsToSurface) {
      void acknowledgeInsight(services.userId || 'anonymous', item.insight.id, personaId).catch(() => {});
    }
  } catch {
    // Non-fatal
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
      userData: { ...userData, keyMoments: userData.keyMoments?.map((s) => ({ summary: s, timestamp: new Date() })) },
      userProfile: services.userProfile,
      persona,
      bundleRuntime,
      personaId: persona.id,
      turnNumber: userData.turnCount || 0,
      wasPersonalSharing: (analysis.emotion.distressLevel ?? 0) > 0.5 || analysis.emotion.intensity > 0.7,
    };

    const convHumanizingInjections = buildConversationHumanizingContext(conversationHumanizingInput);
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
      const modeGuidance = mode ? [
        `[PERSONA MODE: ${bundleRuntimeContext.currentMode.toUpperCase()}]`,
        `Style: ${mode.description}`,
        `Response length: ${mode.response_length}`,
        `Behaviors: ${mode.behaviors.join(', ')}`,
      ].join('\n') : '';

      injections.push({
        category: 'mode_transition',
        content: `[MODE SHIFT: ${bundleRuntimeContext.previousMode} → ${bundleRuntimeContext.currentMode}]\nConsider transitioning with: "${bundleRuntimeContext.modeTransitionPhrase}"\n${modeGuidance}`,
        priority: 22,
      });
    }

    if (bundleRuntimeContext.situationalResponse) {
      const sr = bundleRuntimeContext.situationalResponse;
      const content = sr.type === 'celebration'
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
    isPositiveMoment: analysis.emotion.primary === 'joy' || analysis.emotion.primary === 'anticipation',
  });

  if (enhancements.prefix) {
    injections.push({
      category: 'response_prefix',
      content: `[RESPONSE STYLE]\nStart your response with a natural acknowledgment like: "${enhancements.prefix.replace(/<[^>]+>/g, '')}"\nThen continue with your substantive response.`,
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

  // Sort by priority (highest first)
  injections.sort((a, b) => b.priority - a.priority);

  return injections;
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

  // Log start
  diag.user('Processing user turn', {
    preview: userText.slice(0, 100),
  });

  if (!userText || userText.trim().length === 0) {
    diag.warn('Empty user text');
    throw new Error('Empty user text');
  }

  // 1. Analyze message
  const analysisResult = analyzeMessage(ctx);

  // 2. Update conversation state
  updateConversationState(ctx, analysisResult);

  // 3. Check easter eggs
  const easterEgg = await checkEasterEggs(ctx, turnCtx);

  // 4. Build emotional state (includes voice-text mismatch detection)
  const emotionalState = buildEmotionalState(ctx, analysisResult);

  // 4b. Record mismatch as cross-persona insight if significant
  if (emotionalState.mismatch?.hasMismatch && emotionalState.mismatch.confidence > 0.5) {
    const personaId = ctx.persona.id as 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan' | 'jack';
    void recordMismatchInsight(services.userId || 'anonymous', personaId, emotionalState.mismatch).catch(() => {
      // Non-critical - don't block on insight recording
    });
  }

  // 5. Build response guidance
  const responseGuidance = buildResponseGuidance(ctx, analysisResult, emotionalState);

  // 6. Build identity context
  const identityContext = buildIdentityContext(ctx);

  // 7. Build humanizing context
  const humanizingResult = buildHumanizingContextForTurn(ctx, analysisResult);

  // 8. Process bundle runtime
  const bundleRuntimeContext = processBundleRuntime(ctx, analysisResult);

  // 9. Build all context injections
  const injections = await buildContextInjections(
    ctx,
    analysisResult,
    emotionalState,
    responseGuidance,
    identityContext,
    humanizingResult,
    bundleRuntimeContext
  );

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

  // 11. Track response quality
  if (userData.lastAgentResponse) {
    services.recordResponseSignal({
      agentResponse: userData.lastAgentResponse,
      userResponse: userText,
      topic: currentTopic || 'general',
      conversationPhase: String(services.getPromptContext().phase || 'building'),
      emotion: {
        primary: analysis.emotion.primary,
        intensity: analysis.emotion.intensity || 0.5,
      },
    });
  }

  // 12. Persist humanizing state
  if (humanizingResult) {
    services.updateHumanizingState({
      sessionId: services.sessionId,
      newShareTags: humanizingResult.usedTags,
      spontaneousShareCount: humanizingResult.spontaneousShare ? 1 : 0,
      currentMood: humanizingResult.mood.state,
      storiesTold: humanizingResult.spontaneousShare?.type === 'micro_story'
        ? humanizingResult.spontaneousShare.tags
        : undefined,
      hotTakesShared: humanizingResult.spontaneousShare?.type === 'hot_take'
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

  // Calculate elapsed time
  const elapsedMs = Date.now() - startTime;

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

  return {
    analysis: analysisResult,
    context: {
      injections,
      humanizingResult: humanizingResult || undefined,
      elapsedMs,
    },
    emotional: emotionalState,
    response: responseGuidance,
    identity: identityContext,
    bundleRuntime: bundleRuntimeContext,
    easterEgg,
  };
}

/**
 * Inject turn processing results into the LLM context
 *
 * Call this after processTurn() to add all context injections to the chat.
 */
export function injectTurnContext(
  turnCtx: llm.ChatContext,
  result: TurnProcessorResult
): void {
  const { injections } = result.context;

  if (injections.length === 0) return;

  // Combine all injection content
  const combinedContent = injections
    .map((inj) => inj.content)
    .join('\n\n');

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

