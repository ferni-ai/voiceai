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
  type MemoryStore,
  type VectorStore,
  type ConversationHistoryTracker,
  type ConversationTurn,
} from '../memory/index.js';

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
  type ConversationAnalysis,
  type EmotionResult,
  type IntentResult,
  type ConversationState,
} from '../intelligence/index.js';

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

  // Methods
  analyze: (message: string) => ConversationAnalysis;
  addTurn: (role: 'user' | 'assistant', content: string, durationMs?: number) => void;
  getPromptContext: () => PromptContext;
  getSpeechContext: (text?: string) => SpeechContext;
  tagWithSsml: (text: string) => string;
  searchKnowledge: (query: string) => Promise<string | null>;
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

  // Reset task manager
  const { resetTaskManager } = await import('../tasks/task-manager.js');
  resetTaskManager();

  // Get state machine with returning user flag
  const stateMachine = getStateMachine(isReturningUser);

  // Create session services object
  const services: SessionServices = {
    sessionId,
    userId,
    sessionStartTime: Date.now(),  // Track when session started
    userProfile,
    historyTracker,
    contextManager,

    /**
     * Analyze a user message
     */
    analyze: (message: string) => {
      return analyzeMessage(message, {
        userName: userProfile?.name,
        isReturningUser,
      });
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
     * Get speech context for SSML
     */
    getSpeechContext: (text?: string) => {
      const state = stateMachine.getState();
      const emotion = text ? getEmotionDetector().detect(text) : undefined;
      const topics = text ? getTopicTracker().extract(text).detected : undefined;

      return buildSpeechContext({
        userWPM: getWPMTracker().getAverageWPM(),
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
            const summary = await summarizeConversation(sessionId, turns);
            await global.store.saveSummary(userId, summary);

            // Update profile with last summary
            userProfile.lastConversationSummary = summary.keyPoints.slice(0, 2).join('; ');
            await services.saveProfile();
          }
        } catch (error) {
          getLogger().warn(`Failed to save conversation summary: ${error}`);
        }
      }

      // Cleanup
      removeHistoryTracker(sessionId);
      removeContextManager(sessionId);
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

export default {
  initializeServices,
  getGlobalServices,
  createSessionServices,
  getSessionServices,
  getActiveSessionIds,
};
