/**
 * Services Bootstrap
 *
 * Initializes and wires together all the enhanced voice AI components.
 * Provides a unified interface for the agent to access all services.
 */

import { log } from '@livekit/agents';

// Types
import type { UserProfile } from '../types/user-profile.js';

// Memory
import {
  initializeMemorySystem,
  getDefaultStore,
  getVectorStore,
  getHistoryTracker,
  removeHistoryTracker,
  ragLookup as semanticRagLookup,
  summarizeConversation,
  indexConversationSummary,
  semanticSearch,
  type MemoryStore,
  type VectorStore,
  type ConversationHistoryTracker,
  type ConversationTurn,
} from '../memory/index.js';

// Key Moment Retrieval integration (now exported from memory/index.ts)
import { setCurrentSessionMomentsGetter, clearCurrentSessionMomentsGetter } from '../memory/index.js';

// User Identification
export {
  normalizePhoneNumber,
  isValidPhoneNumber,
  formatPhoneForDisplay,
  identifyByPhone,
  identifyByWebAuth,
  identifyFromMetadata,
  linkPhoneToProfile,
  linkWebAuthToPhone,
} from './user-identification.js';

// Intelligence
import {
  analyzeMessage,
  resetIntelligence,
  getEmotionDetector,
  getTopicTracker,
  getStateMachine,
  getLearningEngine,
  resetLearningEngine,
  UserLearningEngine,
  type ConversationAnalysis,
  type EmotionResult,
  type IntentResult,
  type ConversationState,
  type DynamicUserContext,
  type ConversationLearningData,
} from '../intelligence/index.js';

// Profile Personalizer
import { getPersonalizer } from './profile-personalizer.js';

// Context
import {
  getContextManager,
  removeContextManager,
  type ContextManager,
  type PromptContext,
} from '../context/index.js';

// Speech
import {
  buildSpeechContext,
  tagTextWithSsmlAdaptive,
  getWPMTracker,
  resetWPMTracker,
  type SpeechContext,
  tagSupportResponse,
  tagAdvice,
  tagStory,
  tagWrapUp,
} from '../speech/index.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Session services - created per conversation
 */
export interface SessionServices {
  sessionId: string;
  userId?: string;
  sessionStartTime: number;  // Timestamp when session started

  // Profile & Memory
  userProfile: UserProfile | null;
  historyTracker: ConversationHistoryTracker;
  contextManager: ContextManager;
  learningEngine: UserLearningEngine;

  // Methods
  analyze: (message: string) => ConversationAnalysis;
  addTurn: (role: 'user' | 'assistant', content: string, durationMs?: number) => void;
  getPromptContext: () => PromptContext;
  getDynamicContext: () => DynamicUserContext;
  getEnhancedPromptContext: () => string;
  getSpeechContext: (text?: string) => SpeechContext;
  tagWithSsml: (text: string) => string;
  searchKnowledge: (query: string) => Promise<string | null>;
  searchPastConversations: (query: string) => Promise<string | null>;
  trackResponseQuality: (response: string, userReaction: 'positive' | 'neutral' | 'negative') => void;
  captureInsight: (type: string, key: string, value: unknown, confidence: number) => void;
  saveProfile: () => Promise<void>;
  endSession: () => Promise<void>;
}

/**
 * Global services - shared across sessions
 */
export interface GlobalServices {
  store: MemoryStore; // Can be InMemoryStore, FirestoreStore, or PostgresStore
  vectorStore: VectorStore;
  initialized: boolean;
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

let globalServices: GlobalServices | null = null;
const activeSessions: Map<string, SessionServices> = new Map();

// ============================================================================
// INITIALIZATION
// ============================================================================

// Track if persona has been indexed in this process
let personaIndexed = false;

/**
 * Initialize all global services
 * @param indexPersona - Whether to index persona content (expensive, should only do once)
 */
export async function initializeServices(indexPersona: boolean = true): Promise<GlobalServices> {
  if (globalServices?.initialized) {
    getLogger().info('Services already initialized');
    return globalServices;
  }

  getLogger().info('Initializing voice AI services...');

  // Only index persona on first init, not on subsequent session creations
  const shouldIndexPersona = indexPersona && !personaIndexed;

  try {
    // Initialize memory system - only index persona if not already done
    const { store, vectorStore } = await initializeMemorySystem({
      indexPersona: shouldIndexPersona,
    });

    if (shouldIndexPersona) {
      personaIndexed = true;
      getLogger().info('Persona content indexed (first time)');
    }

    globalServices = {
      store,
      vectorStore,
      initialized: true,
    };

    getLogger().info('Voice AI services initialized successfully');
    return globalServices;
  } catch (error) {
    getLogger().error(`Failed to initialize services: ${error}`);

    // Fallback - create with basic stores
    globalServices = {
      store: getDefaultStore(),
      vectorStore: getVectorStore(),
      initialized: false,
    };

    return globalServices;
  }
}

/**
 * Get global services (initializes if needed, but skips persona indexing if already done)
 */
export function getGlobalServices(): Promise<GlobalServices> {
  if (!globalServices) {
    // Don't re-index persona - it should have been done in prewarm
    return initializeServices(false);
  }
  return Promise.resolve(globalServices);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create session services for a new conversation
 */
export async function createSessionServices(
  sessionId: string,
  userId?: string,
  isReturningUser?: boolean
): Promise<SessionServices> {
  getLogger().info(`Creating session services: ${sessionId} (user: ${userId || 'unknown'})`);

  // Ensure global services are initialized
  const global = await getGlobalServices();

  // Load or create user profile
  let userProfile: UserProfile | null = null;
  if (userId) {
    userProfile = await global.store.getProfile(userId);
    if (!userProfile) {
      // Create new profile
      const { createUserProfile } = await import('../types/user-profile.js');
      userProfile = createUserProfile(userId);
      await global.store.saveProfile(userProfile);
    }
    isReturningUser = userProfile.totalConversations > 0;
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
  const { resetTaskManager } = await import('../tasks/task-manager.js');
  resetTaskManager();

  // Get state machine with returning user flag
  const stateMachine = getStateMachine(isReturningUser);

  // Get personalizer for profile-based enhancements
  const personalizer = getPersonalizer();

  // Wire up real-time key moment retrieval from current session
  setCurrentSessionMomentsGetter(() => learningEngine.getCurrentSessionKeyMoments());

  // Create session services object
  const services: SessionServices = {
    sessionId,
    userId,
    sessionStartTime: Date.now(),  // Track when session started
    userProfile,
    historyTracker,
    contextManager,
    learningEngine,

    /**
     * Analyze a user message AND feed the learning engine
     */
    analyze: (message: string) => {
      const analysis = analyzeMessage(message, {
        userName: userProfile?.name,
        isReturningUser,
      });

      // Feed learning engine with analysis
      learningEngine.processUserTurn(message, {
        emotion: analysis.emotion,
        intent: analysis.intent,
        state: analysis.state,
      }, userProfile);

      return analysis;
    },

    /**
     * Add a conversation turn
     */
    addTurn: (role: 'user' | 'assistant', content: string, durationMs?: number) => {
      const turn: ConversationTurn = {
        role,
        content,
        timestamp: new Date(),
      };

      // Add to history tracker
      if (role === 'user') {
        historyTracker.addUserTurn(content, { durationMs });
        // Track WPM
        if (durationMs) {
          getWPMTracker().addSample(content, durationMs);
        }
      } else {
        historyTracker.addAssistantTurn(content);
        // Feed learning engine for assistant turns too (for context)
        learningEngine.processAssistantTurn(content);
      }

      // Add to context manager
      contextManager.addTurn(turn);
    },

    /**
     * Get prompt context for injection
     */
    getPromptContext: () => {
      const state = stateMachine.getState();
      const guidance = stateMachine.getGuidance();
      const emotion = getEmotionDetector().detect(''); // Use last detected

      return contextManager.buildPromptContext(state, guidance, emotion);
    },

    /**
     * Get dynamic context from learning engine
     * This includes learned preferences, key moments, and insights
     */
    getDynamicContext: () => {
      return learningEngine.buildDynamicContext(userProfile);
    },

    /**
     * Get enhanced prompt context combining all sources
     * This is the PRIMARY context injection method for making Jack smarter
     */
    getEnhancedPromptContext: () => {
      const sections: string[] = [];

      // 1. Base prompt context (phase, relationship, emotional)
      const baseContext = contextManager.buildPromptContext(
        stateMachine.getState(),
        stateMachine.getGuidance(),
        getEmotionDetector().detect('')
      );
      if (baseContext.formattedForPrompt) {
        sections.push(baseContext.formattedForPrompt);
      }

      // 2. Dynamic learning context (preferences, key moments, insights)
      const dynamicContext = learningEngine.buildDynamicContext(userProfile);
      if (dynamicContext.formattedForPrompt) {
        sections.push(dynamicContext.formattedForPrompt);
      }

      // 3. Profile-based personalization (goals, concerns, communication style)
      if (userProfile) {
        const personalizedGuidance = personalizer.enhancePromptWithPersonalization('', userProfile);
        if (personalizedGuidance.trim()) {
          sections.push(personalizedGuidance);
        }
      }

      return sections.join('\n\n');
    },

    /**
     * Get speech context for SSML
     * Now blends current session WPM with learned profile preferences
     */
    getSpeechContext: (text?: string) => {
      const state = stateMachine.getState();
      const emotion = text ? getEmotionDetector().detect(text) : undefined;
      const topics = text ? getTopicTracker().extract(text).detected : undefined;

      // Get current session WPM
      const currentWPM = getWPMTracker().getAverageWPM();
      
      // Blend with profile's learned preferences if available
      let effectiveWPM = currentWPM;
      if (userProfile?.averageWPM) {
        // Blend: 70% current session, 30% historical for personalization
        effectiveWPM = Math.round(currentWPM * 0.7 + userProfile.averageWPM * 0.3);
      } else if (userProfile?.speakingPace) {
        // Use pace hint if no WPM stored yet
        const paceToWPM = { slow: 110, moderate: 150, fast: 180 };
        effectiveWPM = Math.round(currentWPM * 0.7 + paceToWPM[userProfile.speakingPace] * 0.3);
      }

      return buildSpeechContext({
        userWPM: effectiveWPM,
        userText: text,
        emotion,
        phase: state.phase,
        topics,
        turnCount: historyTracker.getTurnCount(),
      });
    },

    /**
     * Tag text with adaptive SSML
     * Uses specialized taggers based on conversation phase and content detection
     */
    tagWithSsml: (text: string) => {
      const speechContext = services.getSpeechContext(text);
      const state = stateMachine.getState();
      const textLower = text.toLowerCase();

      // Detect story content (Jack telling an anecdote)
      const storyPatterns =
        /\b(i remember|back in|when i was|years ago|one time|there was|let me tell you|i'll never forget|i once|my father|at vanguard|in 1974|in 1975|in 2008)\b/i;
      const isStory = storyPatterns.test(textLower);

      // Select specialized tagger based on content and phase
      if (isStory) {
        // Jack is telling a story - more dynamic delivery
        return tagStory(text, speechContext);
      }

      switch (state.phase) {
        case 'supporting':
          // User needs emotional support - extra gentle
          return tagSupportResponse(text, speechContext);

        case 'advising':
          // Giving financial advice - measured and thoughtful
          return tagAdvice(text, speechContext);

        case 'wrapping_up':
          // Saying goodbye - warm and unhurried
          return tagWrapUp(text, speechContext);

        default:
          // Default: use generic adaptive SSML
          return tagTextWithSsmlAdaptive(text, speechContext);
      }
    },

    /**
     * Search knowledge base
     */
    searchKnowledge: (query: string) => {
      return semanticRagLookup(query);
    },

    /**
     * Search past conversations for this user
     * Returns relevant past discussion snippets
     */
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
        
        // Format as natural reference
        const snippets = results
          .map(r => r.content.slice(0, 200))
          .join(' | ');
        
        return `From previous conversations: ${snippets}`;
      } catch (error) {
        getLogger().debug({ error, userId }, 'Failed to search past conversations');
        return null;
      }
    },

    /**
     * Track response quality for learning what works
     * Called when we detect user reaction to Jack's response
     */
    trackResponseQuality: (response: string, userReaction: 'positive' | 'neutral' | 'negative') => {
      // Track in learning engine for session-level patterns
      const responseStyle = {
        length: response.length,
        hasStory: /\b(i remember|back in|when i was)\b/i.test(response),
        hasAdvice: /\b(should|recommend|consider|try)\b/i.test(response),
        hasQuestion: response.includes('?'),
        hasHumor: /\b(haha|joke|kidding|funny)\b/i.test(response),
      };
      
      // Store quality signal in insights
      if (userReaction === 'positive') {
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'response_style_positive',
          value: responseStyle,
          confidence: 0.6,
          source: 'inferred',
        });
        getLogger().debug({ responseStyle, reaction: userReaction }, 'Positive response quality signal');
      } else if (userReaction === 'negative') {
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'response_style_negative',
          value: responseStyle,
          confidence: 0.6,
          source: 'inferred',
        });
        getLogger().debug({ responseStyle, reaction: userReaction }, 'Negative response quality signal');
      }
    },

    /**
     * Capture an insight from external sources (tasks, conversation manager, etc.)
     * This feeds the learning engine from other modules
     */
    captureInsight: (type: string, key: string, value: unknown, confidence: number) => {
      learningEngine.captureExternalInsight({
        type: type as 'preference' | 'concern' | 'goal' | 'relationship' | 'communication_style' | 'topic_interest' | 'emotional_pattern',
        key,
        value,
        confidence,
        source: 'inferred',
      });
    },

    /**
     * Save user profile
     */
    saveProfile: async () => {
      if (userProfile && userId) {
        const history = historyTracker.getSessionHistory();
        const state = stateMachine.getState();

        // Update profile with session data
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

        // Update learned speaking pace from this session
        const sessionWPM = getWPMTracker().getAverageWPM();
        if (sessionWPM > 0) {
          // Blend with existing or set new
          if (updated.averageWPM) {
            updated.averageWPM = Math.round(updated.averageWPM * 0.7 + sessionWPM * 0.3);
          } else {
            updated.averageWPM = sessionWPM;
          }
          // Update pace category
          updated.speakingPace = sessionWPM < 120 ? 'slow' : sessionWPM > 180 ? 'fast' : 'moderate';
        }

        await global.store.saveProfile(updated);
        services.userProfile = updated;

        getLogger().info(`Saved profile for user: ${userId}`);
      }
    },

    /**
     * End the session
     */
    endSession: async () => {
      getLogger().info(`Ending session: ${sessionId}`);

      // Generate and save conversation summary
      if (userId && userProfile) {
        try {
          const turns = historyTracker.getSimpleTurns();
          if (turns.length > 0) {
            // 1. Generate conversation summary
            const summary = await summarizeConversation(sessionId, turns);
            await global.store.saveSummary(userId, summary);

            // 2. Index conversation for semantic retrieval in future sessions
            try {
              const summaryText = [
                ...summary.mainTopics,
                ...summary.keyPoints,
                summary.emotionalArc,
              ].join(' ');
              
              await indexConversationSummary(userId, {
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

            // 3. Finalize learning and apply to profile
            const learningData = learningEngine.finalizeSession(userProfile);
            const stats = learningEngine.getSessionStats();

            getLogger().info({
              keyMoments: stats.keyMoments,
              insights: stats.insights,
              detailsCaptured: stats.detailsCaptured,
              topicsDiscussed: stats.topicsDiscussed,
            }, 'Session learning stats');

            // 4. Apply learning to profile
            const updatedProfile = UserLearningEngine.applyLearningToProfile(userProfile, learningData);

            // 5. Also apply basic summary
            updatedProfile.lastConversationSummary = summary.keyPoints.slice(0, 2).join('; ');

            // 6. Save updated profile
            services.userProfile = updatedProfile;
            await services.saveProfile();

            getLogger().info({
              userId,
              newKeyMoments: learningData.keyMoments.length,
              newInsights: learningData.insights.length,
              followUps: learningData.followUps.length,
            }, 'Applied learning to user profile');
          }
        } catch (error) {
          getLogger().warn(`Failed to save conversation summary/learning: ${error}`);
        }
      }

      // Cleanup
      removeHistoryTracker(sessionId);
      removeContextManager(sessionId);
      resetLearningEngine();
      clearCurrentSessionMomentsGetter();
      activeSessions.delete(sessionId);

      getLogger().info(`Session ${sessionId} ended and cleaned up`);
    },
  };

  // Store in active sessions
  activeSessions.set(sessionId, services);

  return services;
}

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

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Types
  type UserProfile,
  type ConversationAnalysis,
  type EmotionResult,
  type IntentResult,
  type ConversationState,
  type PromptContext,
  type SpeechContext,
  type ConversationTurn,

  // Re-export key functions for direct access
  analyzeMessage,
  semanticRagLookup,
  tagTextWithSsmlAdaptive,
  buildSpeechContext,
};

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Gracefully shut down all services
 * Call this on process exit to clean up resources
 */
export async function shutdownServices(): Promise<void> {
  getLogger().info('Shutting down services...');

  // Clear active sessions
  const sessionCount = activeSessions.size;
  activeSessions.clear();
  getLogger().info({ sessionCount }, 'Cleared active sessions');

  // Clear context managers
  try {
    const { clearAllContextManagers } = await import('../context/context-manager.js');
    clearAllContextManagers();
    getLogger().info('Cleared context managers');
  } catch (error) {
    getLogger().warn({ error }, 'Error clearing context managers');
  }

  // Clear history trackers
  try {
    const { clearAllHistoryTrackers } = await import('../memory/history.js');
    clearAllHistoryTrackers();
    getLogger().info('Cleared history trackers');
  } catch (error) {
    getLogger().warn({ error }, 'Error clearing history trackers');
  }

  // Reset rate limiters
  try {
    const { resetAllRateLimiters } = await import('../tools/rate-limiter.js');
    resetAllRateLimiters();
    getLogger().info('Reset rate limiters');
  } catch (error) {
    getLogger().warn({ error }, 'Error resetting rate limiters');
  }

  // Shutdown memory system
  try {
    const { shutdownMemorySystem } = await import('../memory/index.js');
    await shutdownMemorySystem();
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down memory system');
  }

  // Shutdown tools (Spotify, etc.)
  try {
    const { shutdownTools } = await import('../tools/index.js');
    await shutdownTools();
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down tools');
  }

  // Reset global state
  globalServices = null;
  personaIndexed = false;

  getLogger().info('Services shut down complete');
}

export default {
  initializeServices,
  getGlobalServices,
  createSessionServices,
  getSessionServices,
  getActiveSessionIds,
  shutdownServices,
};
