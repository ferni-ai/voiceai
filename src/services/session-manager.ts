/**
 * Session Manager
 *
 * Handles creation and lifecycle of per-conversation sessions.
 * Each session gets its own set of services and state.
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile } from '../types/user-profile.js';
import type { SpeechCharacteristics } from '../personas/types.js';

// Memory imports
import {
  getHistoryTracker,
  removeHistoryTracker,
  type ConversationTurn,
  setCurrentSessionMomentsGetter,
  clearCurrentSessionMomentsGetter,
} from '../memory/index.js';

// Intelligence imports
import {
  analyzeMessage,
  resetIntelligence,
  getEmotionDetector,
  getTopicTracker,
  getStateMachine,
  getLearningEngine,
  resetLearningEngine,
  UserLearningEngine,
  // Advanced Intelligence Engines
  getResponseQualityTracker,
  removeResponseQualityTracker,
  getConversationPatternAnalyzer,
  removeConversationPatternAnalyzer,
  getProactiveInsightEngine,
  removeProactiveInsightEngine,
  getFinancialJourneyTracker,
  removeFinancialJourneyTracker,
  getCrossSessionThreader,
  removeCrossSessionThreader,
  getVoicePaceAdapter,
  removeVoicePaceAdapter,
  // Human-Level Interaction Engines
  getHumorCalibration,
  removeHumorCalibration,
  getStoryPreference,
  removeStoryPreference,
  getCommunicationMirroring,
  removeCommunicationMirroring,
  getEmotionalMemory,
  removeEmotionalMemory,
} from '../intelligence/index.js';

// Context imports
import { getContextManager, removeContextManager } from '../context/index.js';

// Speech imports
import {
  buildSpeechContext,
  tagTextWithSsmlAdaptive,
  getWPMTracker,
  resetWPMTracker,
  tagSupportResponse,
  tagAdvice,
  tagStory,
  tagWrapUp,
} from '../speech/index.js';

// Local imports
import { getGlobalServices } from './global-services.js';
import { getPersonalizer } from './profile-personalizer.js';
import type { SessionServices, CreateSessionOptions } from './types.js';
import type { HumanizingStateUpdate } from './humanizing-state.js';
import { semanticSearch, ragLookup as semanticRagLookup, summarizeConversation, indexConversationSummary } from '../memory/index.js';

// Handoff state (per-session, not global)
import { createHandoffState, initializeFromPersistedData } from '../tools/handoff-state.js';

// ============================================================================
// SESSION STATE
// ============================================================================

const activeSessions: Map<string, SessionServices> = new Map();

// ============================================================================
// SESSION CREATION
// ============================================================================

/**
 * Create session services for a new conversation
 */
export async function createSessionServices(
  sessionId: string,
  userId?: string,
  isReturningUser?: boolean,
  personaSpeech?: SpeechCharacteristics,
  personaEnergy?: number,
  personaId?: string
): Promise<SessionServices>;

export async function createSessionServices(options: CreateSessionOptions): Promise<SessionServices>;

export async function createSessionServices(
  sessionIdOrOptions: string | CreateSessionOptions,
  userId?: string,
  isReturningUser?: boolean,
  personaSpeech?: SpeechCharacteristics,
  personaEnergy?: number,
  personaId?: string
): Promise<SessionServices> {
  // Handle both calling conventions
  let sessionId: string;
  if (typeof sessionIdOrOptions === 'object') {
    sessionId = sessionIdOrOptions.sessionId;
    userId = sessionIdOrOptions.userId;
    isReturningUser = sessionIdOrOptions.isReturningUser;
    personaSpeech = sessionIdOrOptions.personaSpeech;
    personaEnergy = sessionIdOrOptions.personaEnergy;
    personaId = sessionIdOrOptions.personaId;
  } else {
    sessionId = sessionIdOrOptions;
  }

  getLogger().info(`Creating session services: ${sessionId} (user: ${userId || 'unknown'})`);

  // Ensure global services are initialized
  const global = await getGlobalServices();

  // Track last detected user emotion for voice tone matching
  let lastUserEmotion: string | undefined = undefined;

  // Track humanizing state updates during session
  const humanizingStateUpdates: Array<HumanizingStateUpdate> = [];

  // FIX BUG #session-13: Validate userId format before profile operations
  const isValidUserId = (id: string | undefined): id is string => {
    if (!id) return false;
    // Must be non-empty string
    if (typeof id !== 'string' || id.trim().length === 0) return false;
    // Reasonable length (typical UUIDs are 36 chars, Firebase UIDs are ~28)
    if (id.length > 128 || id.length < 4) return false;
    // Only allow alphanumeric, dashes, underscores, and common ID characters
    if (!/^[a-zA-Z0-9_\-.:@]+$/.test(id)) {
      getLogger().warn({ userId: id.slice(0, 20) }, 'Invalid userId format');
      return false;
    }
    return true;
  };

  // Load or create user profile
  let userProfile: UserProfile | null = null;
  const validatedUserId = isValidUserId(userId) ? userId : undefined;
  if (validatedUserId) {
    userProfile = await global.store.getProfile(validatedUserId);
    if (!userProfile) {
      const { createUserProfile } = await import('../types/user-profile.js');
      userProfile = createUserProfile(validatedUserId);
      await global.store.saveProfile(userProfile);
    }
    isReturningUser = userProfile.totalConversations > 0;
  } else if (userId) {
    getLogger().warn({ providedUserId: userId?.slice(0, 20) }, 'Skipping profile operations due to invalid userId');
  }

  // Create session-specific components
  const historyTracker = getHistoryTracker(sessionId, userId);
  const contextManager = getContextManager(sessionId, userProfile || undefined);

  // Reset intelligence and tasks for new session
  resetIntelligence(isReturningUser);
  resetWPMTracker();
  resetLearningEngine();

  // Get learning engine for this session
  const learningEngine = getLearningEngine();

  // Reset task manager
  const { resetTaskManager, getTaskManager } = await import('../tasks/task-manager.js');
  resetTaskManager();
  const taskManager = getTaskManager();

  // Get state machine with returning user flag
  const stateMachine = getStateMachine(isReturningUser);

  // Get personalizer for profile-based enhancements
  const personalizer = getPersonalizer();

  // Wire up real-time key moment retrieval from current session
  setCurrentSessionMomentsGetter(() => learningEngine.getCurrentSessionKeyMoments());

  // ============================================================================
  // HANDOFF STATE (per-session to prevent cross-session contamination)
  // ============================================================================

  // Determine initial agent - use personaId if provided, otherwise default to 'ferni'
  const initialAgent = (personaId || 'ferni') as import('../services/agent-bus.js').AgentId;
  const handoffState = createHandoffState(initialAgent);

  // Initialize from user profile if available (for returning users)
  if (userProfile?.customData) {
    const customData = userProfile.customData as {
      meetingCounts?: Record<string, number>;
      lastTopicsPerPersona?: Record<string, string>;
    };
    if (customData.meetingCounts || customData.lastTopicsPerPersona) {
      initializeFromPersistedData(handoffState, {
        meetingCounts: customData.meetingCounts,
        lastTopics: customData.lastTopicsPerPersona,
      });
      getLogger().info('Loaded handoff state from user profile');
    }
  }

  // ============================================================================
  // ADVANCED INTELLIGENCE ENGINES
  // ============================================================================

  const engineKey = userId || sessionId;

  const responseQualityTracker = getResponseQualityTracker(engineKey);
  const patternAnalyzer = getConversationPatternAnalyzer(engineKey);
  const proactiveEngine = getProactiveInsightEngine(engineKey);
  const journeyTracker = getFinancialJourneyTracker(engineKey);
  const voicePaceAdapter = getVoicePaceAdapter(engineKey);

  // ============================================================================
  // HUMAN-LEVEL INTERACTION ENGINES
  // ============================================================================

  const humorCalibration = getHumorCalibration(engineKey);
  const storyPreference = getStoryPreference(engineKey);
  const communicationMirroring = getCommunicationMirroring(engineKey);
  const emotionalMemory = getEmotionalMemory(engineKey);
  
  // Start emotional memory session
  emotionalMemory.startSession(sessionId);
  
  // Load emotional memory from profile for returning users
  if (userProfile?.customData && isReturningUser) {
    const customData = userProfile.customData as {
      emotionalMoments?: import('../intelligence/emotional-memory.js').EmotionalMoment[];
    };
    if (customData.emotionalMoments?.length) {
      emotionalMemory.importMoments(customData.emotionalMoments);
      getLogger().info({ count: customData.emotionalMoments.length }, 'Loaded emotional memory from profile');
    }
  }

  // ============================================================================
  // CROSS-SESSION THREADER (with persistence from user profile)
  // FIX: Load existing threads and follow-ups for returning users
  // ============================================================================
  
  let existingThreads: import('../intelligence/cross-session-threader.js').OpenThread[] | undefined;
  let existingFollowUps: import('../intelligence/cross-session-threader.js').PromisedFollowUp[] | undefined;
  
  if (userProfile?.customData && isReturningUser) {
    const customData = userProfile.customData as {
      openThreads?: import('../intelligence/cross-session-threader.js').OpenThread[];
      promisedFollowUps?: import('../intelligence/cross-session-threader.js').PromisedFollowUp[];
    };
    
    existingThreads = customData.openThreads;
    existingFollowUps = customData.promisedFollowUps;
    
    if (existingThreads?.length || existingFollowUps?.length) {
      getLogger().info({
        openThreads: existingThreads?.filter(t => t.status === 'open').length || 0,
        pendingFollowUps: existingFollowUps?.filter(f => !f.delivered).length || 0,
      }, 'Loaded cross-session threads from user profile');
    }
  }
  
  const crossSessionThreader = getCrossSessionThreader(
    engineKey,
    existingThreads,
    existingFollowUps
  );
  
  // Set current session ID for thread tracking
  crossSessionThreader.setCurrentSession(sessionId);

  // ============================================================================
  // PROACTIVE INSIGHTS GENERATION (for returning users)
  // Generate proactive check-ins based on user history
  // ============================================================================

  if (userProfile && isReturningUser) {
    try {
      const patternData = patternAnalyzer.analyzePatterns();
      const responsePrefs = responseQualityTracker.calculatePreferences();
      
      const insightResult = proactiveEngine.generateInsights(
        userProfile,
        patternData,
        responsePrefs
      );
      
      if (insightResult.highPriorityCount > 0) {
        getLogger().info({
          totalInsights: insightResult.insights.length,
          highPriority: insightResult.highPriorityCount,
          suggestedStarter: insightResult.suggestedConversationStarter?.slice(0, 50),
        }, 'Generated proactive insights for returning user');
      }
    } catch (insightError) {
      getLogger().debug({ error: String(insightError) }, 'Failed to generate proactive insights (non-blocking)');
    }
  }

  // Wire task manager to capture insights for learning
  taskManager.setInsightCallback((type, key, value, confidence) => {
    learningEngine.captureExternalInsight({
      type: type as
        | 'preference'
        | 'concern'
        | 'goal'
        | 'relationship'
        | 'communication_style'
        | 'topic_interest'
        | 'emotional_pattern',
      key,
      value,
      confidence,
      source: 'inferred',
    });
  });

  getLogger().info('Advanced intelligence engines initialized');

  // ============================================================================
  // SESSION SERVICES OBJECT
  // ============================================================================

  const services: SessionServices = {
    sessionId,
    userId,
    personaId,
    sessionStartTime: Date.now(),
    userProfile,
    historyTracker,
    contextManager,
    learningEngine,

    // Handoff State (per-session, fixes BUG #1-4)
    handoffState,

    // Advanced Intelligence Engines
    responseQualityTracker,
    patternAnalyzer,
    proactiveEngine,
    journeyTracker,
    crossSessionThreader,
    voicePaceAdapter,

    // Human-Level Interaction Engines
    humorCalibration,
    storyPreference,
    communicationMirroring,
    emotionalMemory,

    // ========================================================================
    // ANALYSIS METHODS
    // ========================================================================

    analyze: (message: string) => {
      const analysis = analyzeMessage(message, {
        userName: userProfile?.name,
        isReturningUser,
      });

      if (analysis.emotion?.primary) {
        lastUserEmotion = analysis.emotion.primary;
      }

      // If emotion detection confidence is low, enhance with LLM asynchronously
      // This won't block the response but will improve future understanding
      if (analysis.emotion.confidence < 0.5) {
        // Fire-and-forget LLM enhancement
        (async () => {
          try {
            const { createEmotionLLMCaller } = await import('./llm-utils.js');
            const emotionDetector = getEmotionDetector();
            const llmCaller = createEmotionLLMCaller();
            const enhancedEmotion = await emotionDetector.detectWithLLM(message, llmCaller);
            
            // Update the last emotion if LLM got better result
            if (enhancedEmotion.confidence > analysis.emotion.confidence) {
              lastUserEmotion = enhancedEmotion.primary;
              getLogger().debug({
                keyword: analysis.emotion.primary,
                llm: enhancedEmotion.primary,
              }, 'LLM-enhanced emotion detection');
            }
          } catch {
            // Non-blocking, ignore errors
          }
        })();
      }

      learningEngine.processUserTurn(
        message,
        {
          emotion: analysis.emotion,
          intent: analysis.intent,
          state: analysis.state,
        },
        userProfile
      );

      // Feed pattern analyzer
      if (analysis.topics.detected.length > 0) {
        for (const topic of analysis.topics.detected) {
          patternAnalyzer.recordTopic(topic, analysis.emotion.intensity || 0.5);
        }
      }

      // Feed voice pace adapter
      const sessionDurationMinutes = Math.floor((Date.now() - services.sessionStartTime) / 60000);
      voicePaceAdapter.recordObservation({
        userMessage: message,
        responseTimeSeconds: sessionDurationMinutes > 0 ? 2 : 5,
        topic: analysis.topics.detected[0] || 'general',
        emotionalState: analysis.emotion.primary,
      });

      return analysis;
    },

    addTurn: (role: 'user' | 'assistant', content: string, durationMs?: number) => {
      const turn: ConversationTurn = {
        role,
        content,
        timestamp: new Date(),
      };

      if (role === 'user') {
        historyTracker.addUserTurn(content, { durationMs });
        if (durationMs) {
          getWPMTracker().addSample(content, durationMs);
        }
      } else {
        historyTracker.addAssistantTurn(content);
        learningEngine.processAssistantTurn(content);
      }

      contextManager.addTurn(turn);
    },

    // ========================================================================
    // CONTEXT METHODS
    // ========================================================================

    getPromptContext: () => {
      const state = stateMachine.getState();
      const guidance = stateMachine.getGuidance();
      const emotion = getEmotionDetector().detect('');

      return contextManager.buildPromptContext(state, guidance, emotion);
    },

    getDynamicContext: () => {
      return learningEngine.buildDynamicContext(userProfile);
    },

    getEnhancedPromptContext: () => {
      const sections: string[] = [];

      const baseContext = contextManager.buildPromptContext(
        stateMachine.getState(),
        stateMachine.getGuidance(),
        getEmotionDetector().detect('')
      );
      if (baseContext.formattedForPrompt) {
        sections.push(baseContext.formattedForPrompt);
      }

      const dynamicContext = learningEngine.buildDynamicContext(userProfile);
      if (dynamicContext.formattedForPrompt) {
        sections.push(dynamicContext.formattedForPrompt);
      }

      if (userProfile) {
        const personalizedGuidance = personalizer.enhancePromptWithPersonalization('', userProfile);
        if (personalizedGuidance.trim()) {
          sections.push(personalizedGuidance);
        }
      }

      return sections.join('\n\n');
    },

    // ========================================================================
    // SPEECH METHODS
    // ========================================================================

    getSpeechContext: (text?: string, userEmotion?: string) => {
      const state = stateMachine.getState();
      const emotion = text ? getEmotionDetector().detect(text) : undefined;
      const topics = text ? getTopicTracker().extract(text).detected : undefined;

      const currentWPM = getWPMTracker().getAverageWPM();

      let effectiveWPM = currentWPM;
      if (userProfile?.averageWPM) {
        effectiveWPM = Math.round(currentWPM * 0.7 + userProfile.averageWPM * 0.3);
      } else if (userProfile?.speakingPace) {
        const paceToWPM = { slow: 110, moderate: 150, fast: 180 };
        effectiveWPM = Math.round(currentWPM * 0.7 + paceToWPM[userProfile.speakingPace] * 0.3);
      }

      const detectedUserEmotion = userEmotion || lastUserEmotion;

      return buildSpeechContext({
        userWPM: effectiveWPM,
        userText: text,
        emotion,
        userEmotion: detectedUserEmotion,
        phase: state.phase,
        topics,
        turnCount: historyTracker.getTurnCount(),
        personaSpeech,
        personaEnergy,
      });
    },

    tagWithSsml: (text: string) => {
      const speechContext = services.getSpeechContext(text);
      const state = stateMachine.getState();
      const textLower = text.toLowerCase();

      const storyPatterns =
        /\b(i remember|back in|when i was|years ago|one time|there was|let me tell you|i'll never forget|i once|my father|at vanguard|in 1974|in 1975|in 2008)\b/i;
      const isStory = storyPatterns.test(textLower);

      if (isStory) {
        return tagStory(text, speechContext, personaId);
      }

      switch (state.phase) {
        case 'supporting':
          return tagSupportResponse(text, speechContext, personaId);
        case 'advising':
          return tagAdvice(text, speechContext, personaId);
        case 'wrapping_up':
          return tagWrapUp(text, speechContext, personaId);
        default:
          return tagTextWithSsmlAdaptive(text, speechContext, personaId);
      }
    },

    // ========================================================================
    // MEMORY METHODS
    // ========================================================================

    searchKnowledge: (query: string) => {
      return semanticRagLookup(query);
    },

    searchPastConversations: async (query: string) => {
      if (!userId) return null;

      try {
        const results = await semanticSearch(query, {
          topK: 3,
          sources: ['conversation'],
          userId,
          minScore: 0.4,
        });

        if (results.length === 0) return null;

        const snippets = results.map((r) => r.content.slice(0, 200)).join(' | ');
        return `From previous conversations: ${snippets}`;
      } catch (error) {
        getLogger().debug({ error, userId }, 'Failed to search past conversations');
        return null;
      }
    },

    // ========================================================================
    // QUALITY TRACKING METHODS
    // ========================================================================

    trackResponseQuality: (response: string, userReaction: 'positive' | 'neutral' | 'negative') => {
      const responseAnalysis = responseQualityTracker.analyzeResponse(response);
      const engagementMap = { positive: 0.85, neutral: 0.5, negative: 0.2 };

      const responseStyle = {
        length: response.length,
        type: responseAnalysis.type,
        hasStory: responseAnalysis.hadStory,
        hasAdvice: responseAnalysis.hadAdvice,
        hasQuestion: responseAnalysis.hadQuestion,
        hasHumor: responseAnalysis.hadHumor,
        engagementScore: engagementMap[userReaction],
      };

      if (userReaction === 'positive') {
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'response_style_positive',
          value: responseStyle,
          confidence: 0.7,
          source: 'inferred',
        });
      } else if (userReaction === 'negative') {
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'response_style_negative',
          value: responseStyle,
          confidence: 0.7,
          source: 'inferred',
        });
      }

      getLogger().debug(
        {
          responseType: responseAnalysis.type,
          reaction: userReaction,
          length: responseAnalysis.length,
        },
        'Response quality tracked'
      );
    },

    recordResponseSignal: (params: {
      agentResponse: string;
      userResponse: string;
      topic: string;
      conversationPhase: string;
      emotion?: { primary: string; intensity: number };
    }) => {
      const { agentResponse, userResponse, topic, conversationPhase, emotion } = params;

      // Record the full quality signal
      const signal = responseQualityTracker.recordSignal(
        agentResponse,
        userResponse,
        topic,
        conversationPhase,
        emotion
      );

      // Feed high/low engagement signals into learning engine
      if (signal.engagementScore >= 0.8) {
        const responseAnalysis = responseQualityTracker.analyzeResponse(agentResponse);
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'high_engagement_response',
          value: {
            type: responseAnalysis.type,
            length: responseAnalysis.length,
            hadStory: responseAnalysis.hadStory,
            hadHumor: responseAnalysis.hadHumor,
            topic,
            engagementScore: signal.engagementScore,
          },
          confidence: 0.8,
          source: 'inferred',
        });
      } else if (signal.engagementScore <= 0.3) {
        const responseAnalysis = responseQualityTracker.analyzeResponse(agentResponse);
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'low_engagement_response',
          value: {
            type: responseAnalysis.type,
            length: responseAnalysis.length,
            hadStory: responseAnalysis.hadStory,
            hadHumor: responseAnalysis.hadHumor,
            topic,
            engagementScore: signal.engagementScore,
          },
          confidence: 0.7,
          source: 'inferred',
        });
      }

      // Feed into community insights if available
      try {
        const { getCommunityInsights } = require('../intelligence/community-insights.js');
        const communityInsights = getCommunityInsights();
        if (communityInsights && personaId) {
          communityInsights.recordEngagementSignal({
            personaId,
            responseType: signal.responseType,
            topic,
            engagementScore: signal.engagementScore,
            timestamp: new Date(),
          });
        }
      } catch {
        // Community insights not available
      }

      getLogger().debug(
        {
          engagementScore: signal.engagementScore,
          responseType: signal.responseType,
          userReaction: signal.userReaction,
        },
        'Full response signal recorded'
      );
    },

    captureInsight: (type: string, key: string, value: unknown, confidence: number) => {
      learningEngine.captureExternalInsight({
        type: type as
          | 'preference'
          | 'concern'
          | 'goal'
          | 'relationship'
          | 'communication_style'
          | 'topic_interest'
          | 'emotional_pattern',
        key,
        value,
        confidence,
        source: 'inferred',
      });
    },

    getProactiveInsights: async () => {
      if (!userProfile) {
        return { insights: [], highPriorityCount: 0 };
      }

      const insights = proactiveEngine.getUndeliveredInsights();
      const highPriorityCount = insights.filter((i) => i.priority === 'high').length;
      const nextInsight = proactiveEngine.getNextInsight();
      const suggestedConversationStarter = nextInsight?.message;

      return {
        insights,
        highPriorityCount,
        suggestedConversationStarter,
        // Include insight ID for delivery tracking
        suggestedInsightId: nextInsight?.id,
      };
    },
    
    /**
     * Mark a proactive insight as delivered
     */
    markInsightDelivered: (insightId: string) => {
      proactiveEngine.markDelivered(insightId);
    },

    getOpenThreads: () => {
      return crossSessionThreader.getOpenThreads();
    },

    /**
     * Get a natural conversation starter from open threads
     * Use this to resume conversations across sessions
     */
    getThreadConversationStarter: () => {
      return crossSessionThreader.getConversationStarter();
    },

    /**
     * Get thread context formatted for prompt injection
     */
    getThreadContextForPrompt: () => {
      return crossSessionThreader.getThreadContext();
    },

    /**
     * Update humanizing state
     * FIX BUG #session-8: Limit array growth to prevent memory issues
     */
    updateHumanizingState: (update: HumanizingStateUpdate) => {
      const MAX_HUMANIZING_UPDATES = 100; // Reasonable limit for a single session
      
      if (humanizingStateUpdates.length >= MAX_HUMANIZING_UPDATES) {
        // Remove oldest updates when limit reached
        humanizingStateUpdates.shift();
        getLogger().debug({ sessionId }, 'Evicted oldest humanizing state update (limit reached)');
      }
      
      humanizingStateUpdates.push(update);
      getLogger().debug(
        { sessionId, updateCount: humanizingStateUpdates.length },
        '🎭 Humanizing state update recorded'
      );
    },

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * Save user profile with error handling
     * FIX BUG #session-7: Don't fail silently on save errors
     */
    saveProfile: async () => {
      if (userProfile && validatedUserId) {
        try {
          const history = historyTracker.getSessionHistory();
          const state = stateMachine.getState();

          const { updateProfileFromSession } = await import('../types/user-profile.js');
          const updated = updateProfileFromSession(userProfile, {
            name: userProfile.name,
            mood: state.currentMood,
            energyLevel:
              state.distressLevel < 0.3 ? 'high' : state.distressLevel < 0.6 ? 'medium' : 'low',
            topicsDiscussed: history.metadata.topicsDiscussed,
            emotionalMoments: history.metadata.emotionalJourney.map((e) => ({
              timestamp: new Date(),
              emotion: e,
              intensity: 0.5,
            })),
            sessionDurationMinutes: Math.floor(historyTracker.getDurationSeconds() / 60),
          });

          const sessionWPM = getWPMTracker().getAverageWPM();
          if (sessionWPM > 0) {
            if (updated.averageWPM) {
              updated.averageWPM = Math.round(updated.averageWPM * 0.7 + sessionWPM * 0.3);
            } else {
              updated.averageWPM = sessionWPM;
            }
            updated.speakingPace = sessionWPM < 120 ? 'slow' : sessionWPM > 180 ? 'fast' : 'moderate';
          }

          await global.store.saveProfile(updated);
          services.userProfile = updated;

          getLogger().info(`Saved profile for user: ${validatedUserId}`);
        } catch (error) {
          // FIX BUG #session-7: Log errors instead of silent failure
          getLogger().error(
            { userId: validatedUserId, error: String(error) },
            'Failed to save user profile'
          );
          throw error; // Re-throw to allow caller to handle
        }
      }
    },

    endSession: async () => {
      getLogger().info(`Ending session: ${sessionId}`);
      
      // FIX BUG #session-6: Timeout for summarization to prevent blocking cleanup
      const SUMMARIZE_TIMEOUT_MS = 10000; // 10 seconds
      
      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T | null> => {
        return Promise.race([
          promise,
          new Promise<null>((resolve) => {
            setTimeout(() => {
              getLogger().warn({ sessionId, operation: name }, 'Operation timed out during session end');
              resolve(null);
            }, timeoutMs);
          }),
        ]);
      };

      if (validatedUserId && userProfile) {
        try {
          const turns = historyTracker.getSimpleTurns();
          
          // FIX BUG #session-20: Handle empty turns gracefully
          // Still finalize learning even if no turns (may have session-level insights)
          if (turns.length === 0) {
            getLogger().debug({ sessionId }, 'No conversation turns to summarize');
          }
          
          let summary = null;
          if (turns.length > 0) {
            // FIX BUG #session-6: Generate conversation summary with timeout
            // Try LLM summarization first for richer understanding, fall back to extraction
            try {
              const { createSummarizationLLMCaller } = await import('./llm-utils.js');
              const { summarizeWithLLM } = await import('../memory/index.js');
              const llmCaller = createSummarizationLLMCaller();
              
              summary = await withTimeout(
                summarizeWithLLM(sessionId, turns, llmCaller),
                SUMMARIZE_TIMEOUT_MS,
                'summarizeWithLLM'
              );
              
              if (summary) {
                getLogger().debug('Used LLM summarization');
              }
            } catch {
              // LLM failed, fall through to extraction
            }
            
            // Fall back to extraction-based summarization
            if (!summary) {
              summary = await withTimeout(
                summarizeConversation(sessionId, turns),
                SUMMARIZE_TIMEOUT_MS,
                'summarizeConversation'
              );
            }
            
            if (!summary) {
              getLogger().warn({ sessionId }, 'Skipping summary persistence due to timeout');
            } else {
              await global.store.saveSummary(validatedUserId, summary);

              // Index for semantic retrieval
              try {
                const summaryText = [
                  ...summary.mainTopics,
                  ...summary.keyPoints,
                  summary.emotionalArc,
                ].join(' ');

                await indexConversationSummary(validatedUserId, {
                  id: summary.id,
                  text: summaryText,
                  topics: summary.mainTopics,
                  timestamp: summary.timestamp,
                  embedding: summary.embedding,
                });

                getLogger().info('Indexed conversation for future retrieval');
              } catch (indexError) {
                getLogger().warn(`Failed to index conversation (non-blocking): ${indexError}`);
              }
            }
          } // Close turns.length > 0 block

          // FIX BUG #session-20: Finalize learning regardless of turns count
          // Learning engine may have captured session-level insights
          const learningData = learningEngine.finalizeSession(userProfile);
          const stats = learningEngine.getSessionStats();

          getLogger().info(
            {
              keyMoments: stats.keyMoments,
              insights: stats.insights,
              detailsCaptured: stats.detailsCaptured,
              topicsDiscussed: stats.topicsDiscussed,
            },
            'Session learning stats'
          );

          // Apply learning to profile
          let updatedProfile = UserLearningEngine.applyLearningToProfile(
            userProfile,
            learningData
          );

          // Apply humanizing state updates
          if (humanizingStateUpdates.length > 0) {
            try {
              const {
                getHumanizingState,
                mergeHumanizingStateUpdate,
                applyHumanizingStateToProfile,
                logHumanizingStateSummary,
              } = await import('./humanizing-state.js');

              let humanizingState = getHumanizingState(updatedProfile);

              for (const update of humanizingStateUpdates) {
                humanizingState = mergeHumanizingStateUpdate(humanizingState, update);
              }

              updatedProfile = applyHumanizingStateToProfile(updatedProfile, humanizingState);
              logHumanizingStateSummary(humanizingState, validatedUserId || 'unknown');
            } catch (humanizingError) {
              getLogger().warn(
                { error: String(humanizingError) },
                'Failed to persist humanizing state (non-fatal)'
              );
            }
          }

          if (summary?.keyPoints) {
            updatedProfile.lastConversationSummary = summary.keyPoints.slice(0, 2).join('; ');
          }

          // Persist handoff state to profile for cross-session continuity
          try {
            const { getMeetingCounts, getLastTopicsPerPersona } = await import('../tools/handoff-state.js');
            const meetingCounts = getMeetingCounts(handoffState);
            const lastTopicsPerPersona = getLastTopicsPerPersona(handoffState);
            
            if (!updatedProfile.customData) {
              updatedProfile.customData = {};
            }
            (updatedProfile.customData as Record<string, unknown>).meetingCounts = meetingCounts;
            (updatedProfile.customData as Record<string, unknown>).lastTopicsPerPersona = lastTopicsPerPersona;
            
            getLogger().debug(
              { meetingCounts: Object.keys(meetingCounts).length },
              'Persisted handoff state to profile'
            );
          } catch (handoffPersistError) {
            getLogger().warn(
              { error: String(handoffPersistError) },
              'Failed to persist handoff state (non-fatal)'
            );
          }

          // Persist cross-session threads for conversation continuity
          // This enables "Where were we?" moments across sessions
          try {
            const threadData = crossSessionThreader.getAllData();
            const openThreadCount = threadData.threads.filter(t => t.status === 'open').length;
            const pendingFollowUps = threadData.followUps.filter(f => !f.delivered).length;
            
            if (openThreadCount > 0 || pendingFollowUps > 0) {
              (updatedProfile.customData as Record<string, unknown>).openThreads = threadData.threads;
              (updatedProfile.customData as Record<string, unknown>).promisedFollowUps = threadData.followUps;
              
              getLogger().info(
                { openThreads: openThreadCount, pendingFollowUps },
                'Persisted cross-session threads to profile'
              );
            }
          } catch (threadPersistError) {
            getLogger().warn(
              { error: String(threadPersistError) },
              'Failed to persist cross-session threads (non-fatal)'
            );
          }

          // Persist emotional memory for cross-session emotional continuity
          // This enables "Last time you seemed stressed about X" moments
          try {
            const moments = emotionalMemory.exportMoments();
            if (moments.length > 0) {
              // Keep only recent moments (last 50) to avoid profile bloat
              const recentMoments = moments.slice(-50);
              (updatedProfile.customData as Record<string, unknown>).emotionalMoments = recentMoments;
              
              getLogger().info(
                { momentCount: recentMoments.length },
                'Persisted emotional memory to profile'
              );
            }
          } catch (emotionalMemoryError) {
            getLogger().warn(
              { error: String(emotionalMemoryError) },
              'Failed to persist emotional memory (non-fatal)'
            );
          }

          services.userProfile = updatedProfile;
          await services.saveProfile();

          getLogger().info(
            {
              userId: validatedUserId,
              newKeyMoments: learningData.keyMoments.length,
              newInsights: learningData.insights.length,
              followUps: learningData.followUps.length,
            },
            'Applied learning to user profile'
          );
        } catch (error) {
          getLogger().warn(`Failed to save conversation summary/learning: ${error}`);
        }
      }

      // Cleanup core components
      removeHistoryTracker(sessionId);
      removeContextManager(sessionId);
      resetLearningEngine();
      clearCurrentSessionMomentsGetter();

      // FIX BUG #session-5: Always cleanup session-specific intelligence engines
      // Preserving engines for authenticated users was causing memory leaks
      // The per-user data is already persisted to the profile above
      const cleanupEngineKey = validatedUserId || sessionId;
      removeResponseQualityTracker(cleanupEngineKey);
      removeConversationPatternAnalyzer(cleanupEngineKey);
      removeProactiveInsightEngine(cleanupEngineKey);
      removeFinancialJourneyTracker(cleanupEngineKey);
      removeCrossSessionThreader(cleanupEngineKey);
      removeVoicePaceAdapter(cleanupEngineKey);
      
      // Cleanup human-level interaction engines
      removeHumorCalibration(cleanupEngineKey);
      removeStoryPreference(cleanupEngineKey);
      removeCommunicationMirroring(cleanupEngineKey);
      removeEmotionalMemory(cleanupEngineKey);
      
      // FIX BUG #session-12: Clean up task manager callback
      try {
        const { resetTaskManager } = await import('../tasks/task-manager.js');
        resetTaskManager();
      } catch {
        // Task manager may not be loaded
      }
      
      getLogger().info({ userId: validatedUserId }, 'Intelligence engines cleaned up');

      activeSessions.delete(sessionId);

      // Clear life data cache
      if (userId) {
        try {
          const { getLifeDataStore } = await import('./life-data-store.js');
          getLifeDataStore().clearUserCache(userId);
        } catch (error) {
          getLogger().debug({ error }, 'Failed to clear life data cache (non-blocking)');
        }
      }

      getLogger().info(`Session ${sessionId} ended and cleaned up`);
    },
  };

  // Store in active sessions
  activeSessions.set(sessionId, services);

  return services;
}

// ============================================================================
// SESSION ACCESS
// ============================================================================

/**
 * Get existing session services
 */
export function getSessionServices(sessionId: string): SessionServices | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Get all active session IDs
 */
export function getActiveSessionIds(): string[] {
  return Array.from(activeSessions.keys());
}

/**
 * Get count of active sessions
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Clear all active sessions (for shutdown)
 * FIX BUG #session-15: Properly end each session before clearing to prevent data loss
 */
export async function clearAllSessions(): Promise<number> {
  const count = activeSessions.size;
  
  if (count === 0) {
    return 0;
  }

  getLogger().info({ count }, 'Ending all active sessions');
  
  // End all sessions in parallel with timeout to prevent blocking shutdown
  const SHUTDOWN_TIMEOUT_MS = 5000;
  const endPromises: Promise<void>[] = [];
  
  for (const [sessionId, services] of activeSessions) {
    const endPromise = Promise.race([
      services.endSession().catch(err => {
        getLogger().warn({ sessionId, error: String(err) }, 'Error ending session during shutdown');
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          getLogger().warn({ sessionId }, 'Session end timed out during shutdown');
          resolve();
        }, SHUTDOWN_TIMEOUT_MS);
      }),
    ]) as Promise<void>;
    endPromises.push(endPromise);
  }

  await Promise.all(endPromises);
  activeSessions.clear();
  
  getLogger().info({ count }, 'All sessions ended');
  return count;
}

/**
 * Synchronous version for emergency shutdown (skips proper cleanup)
 * @deprecated Use clearAllSessions() when possible
 */
export function clearAllSessionsSync(): number {
  const count = activeSessions.size;
  getLogger().warn({ count }, 'Emergency session clear (sync) - data may be lost');
  activeSessions.clear();
  return count;
}

