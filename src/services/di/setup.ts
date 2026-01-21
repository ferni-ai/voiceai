/**
 * DI Container Setup
 *
 * Bootstraps all services through the DI container.
 * Provides a single entry point for service configuration.
 *
 * Usage:
 *   // In startup/prewarm
 *   await bootstrapServices();
 *
 *   // In tests
 *   await bootstrapServices({ useMocks: true });
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getContainer, Tokens, resetContainer } from './container.js';
import {
  registerUserIdentificationService,
  UserIdentificationToken,
} from './user-identification-di.js';
import type { GlobalServices } from '../types.js';

// ============================================================================
// BOOTSTRAP OPTIONS
// ============================================================================

export interface BootstrapOptions {
  /** Use mock implementations for testing */
  useMocks?: boolean;
  /** Index persona content (expensive, only do once) */
  indexPersona?: boolean;
  /** Skip team handler initialization */
  skipTeamHandlers?: boolean;
}

// ============================================================================
// SERVICE REGISTRATION
// ============================================================================

/**
 * Register core storage services
 */
async function registerStorageServices(useMocks = false): Promise<void> {
  const container = getContainer();

  if (useMocks) {
    // Register mock stores for testing
    const { InMemoryStore } = await import('../../memory/in-memory-store.js');
    const mockStore = new InMemoryStore();
    await mockStore.initialize();
    container.registerInstance(Tokens.MemoryStore, mockStore);

    const { VectorStore } = await import('../../memory/vector-store.js');
    const mockVectorStore = new VectorStore();
    container.registerInstance(Tokens.VectorStore, mockVectorStore);

    getLogger().info('Registered mock storage services');
  } else {
    // Register real stores - lazy loaded
    container.registerSingleton(Tokens.MemoryStore, async () => {
      const { initializeMemorySystem } = await import('../../memory/index.js');
      const { store } = await initializeMemorySystem({ indexPersona: false });
      return store;
    });

    container.registerSingleton(Tokens.VectorStore, async () => {
      const { getVectorStore } = await import('../../memory/index.js');
      return getVectorStore();
    });

    getLogger().info('Registered storage services');
  }
}

/**
 * Register application services
 */
async function registerApplicationServices(): Promise<void> {
  const container = getContainer();

  // User Identification Service
  registerUserIdentificationService(container);

  // Productivity Store
  container.registerSingleton(Tokens.ProductivityStore, async () => {
    const { initializeProductivityStore } = await import('../stores/productivity-store.js');
    return initializeProductivityStore();
  });

  // Background Tasks
  container.registerSingleton(Tokens.BackgroundTasks, async () => {
    const { initializeBackgroundTasks } = await import('../scheduling/background-tasks.js');
    return initializeBackgroundTasks();
  });

  // Agent Bus
  container.registerSingleton(Tokens.AgentBus, async () => {
    const { getAgentBus } = await import('../agent-bus.js');
    return getAgentBus();
  });

  // Persona Registry (OCP-compliant)
  container.registerSingleton(Tokens.PersonaRegistry, async () => {
    const { getPersonaRegistry } = await import('../../personas/registry/persona-registry-impl.js');
    return getPersonaRegistry();
  });

  // TTS Services (Clean Architecture)
  container.registerSingleton(Tokens.TTSCache, async () => {
    const { createTTSCache } = await import('../tts/tts-cache.js');
    return createTTSCache();
  });

  container.registerSingleton(Tokens.TTSProvider, async () => {
    const { getCartesiaProvider } = await import('../../speech/tts-gateway/providers/cartesia.js');
    return getCartesiaProvider();
  });

  container.registerSingleton(Tokens.TTSGateway, async () => {
    const { initTTSGateway, isTTSGatewayEnabled, createDelegatingTTSCache, getCartesiaProvider } =
      await import('../../speech/tts-gateway/index.js');
    if (!isTTSGatewayEnabled()) {
      // Return null if gateway disabled - callers should check isTTSGatewayEnabled()
      return null;
    }

    // Import existing caches for delegation
    const { getCachedGreetingAudio } = await import(
      '../../agents/shared/greeting-audio-cache.js'
    );
    const { getCachedAudio: getCachedConversationalAudio } = await import(
      '../../agents/shared/conversational-audio-cache.js'
    );

    // Create delegating cache that checks existing caches on miss
    // Note: Legacy caches return ArrayBuffer | null, so we estimate duration
    const legacyCacheLookup = async (
      text: string,
      voiceId: string
    ): Promise<{ audio: ArrayBuffer; durationMs: number } | null> => {
      // Try greeting cache first
      const greeting = getCachedGreetingAudio(text, voiceId);
      if (greeting) {
        // Estimate duration: 16-bit PCM at 24kHz
        const durationMs = Math.round((greeting.byteLength / 2 / 24000) * 1000);
        return { audio: greeting, durationMs };
      }
      // Try conversational cache
      const conversational = getCachedConversationalAudio(text, voiceId);
      if (conversational) {
        const durationMs = Math.round((conversational.byteLength / 2 / 24000) * 1000);
        return { audio: conversational, durationMs };
      }
      return null;
    };

    const cache = createDelegatingTTSCache({}, legacyCacheLookup);
    const provider = getCartesiaProvider();

    return initTTSGateway({
      provider,
      cache,
      enableTracing: true,
    });
  });

  // Life Data Store
  container.registerSingleton(Tokens.LifeDataStore, async () => {
    const { getLifeDataStore } = await import('../stores/life-data-store.js');
    return getLifeDataStore();
  });

  getLogger().info('Registered application services');
}

/**
 * Register scheduler services
 */
async function registerSchedulerServices(): Promise<void> {
  const container = getContainer();

  // Reminder Scheduler - use start function instead of getter
  container.registerSingleton(Tokens.ReminderScheduler, async () => {
    try {
      const { startReminderScheduler } = await import('../scheduling/reminder-scheduler.js');
      return { start: startReminderScheduler };
    } catch {
      return null;
    }
  });

  // Proactive Scheduler
  container.registerSingleton(Tokens.ProactiveScheduler, async () => {
    const { getProactiveScheduler } = await import('../scheduling/proactive-scheduler.js');
    return getProactiveScheduler();
  });

  getLogger().info('Registered scheduler services');
}

/**
 * Register Superhuman Intelligence services (10 enhancements)
 */
async function registerSuperhumanIntelligenceServices(): Promise<void> {
  const container = getContainer();

  // Phase 1: Response Mode Intelligence
  container.registerSingleton(Tokens.ResponseModeIntelligence, async () => {
    const { getResponseModeDecider } = await import('../../conversation/response-mode/engine.js');
    return getResponseModeDecider();
  });

  // Phase 1: Emotional Momentum Tracking
  container.registerSingleton(Tokens.EmotionalMomentumTracker, async () => {
    const { getEmotionalMomentumTracker } = await import('../../conversation/emotional-arc/momentum/tracker.js');
    return getEmotionalMomentumTracker();
  });

  // Phase 1: Silence Interpreter (enhanced)
  container.registerSingleton(Tokens.SilenceInterpreter, async () => {
    const { analyzeSilence } = await import('../superhuman/silence-interpreter.js');
    return { analyze: analyzeSilence };
  });

  // Phase 2: Micro-Moment Recognition
  container.registerSingleton(Tokens.MicroMomentDetector, async () => {
    const { getMicroMomentDetector } = await import('../../intelligence/deep-understanding/micro-moments/engine.js');
    return getMicroMomentDetector();
  });

  // Phase 2: Avoidance Pattern Detection
  container.registerSingleton(Tokens.AvoidanceDetector, async () => {
    const { getAvoidanceDetector } = await import('../../intelligence/deep-understanding/avoidance-detection/engine.js');
    return getAvoidanceDetector();
  });

  // Phase 2: Rhythm Intelligence
  container.registerSingleton(Tokens.RhythmIntelligence, async () => {
    const { getRhythmIntelligence } = await import('../../conversation/rhythm-intelligence/engine.js');
    return getRhythmIntelligence();
  });

  // Phase 3: Relational Memory
  container.registerSingleton(Tokens.RelationalMemory, async () => {
    const { getRelationalMemory } = await import('../superhuman/relational-memory/engine.js');
    return getRelationalMemory();
  });

  // Phase 3: Pattern Connector
  container.registerSingleton(Tokens.PatternConnector, async () => {
    const { getPatternConnector } = await import('../../intelligence/deep-understanding/pattern-connector/engine.js');
    return getPatternConnector();
  });

  // Phase 3: Story Arc Tracking
  container.registerSingleton(Tokens.StoryArcTracker, async () => {
    const { getStoryArcTracker } = await import('../../intelligence/story-tracking/engine.js');
    return getStoryArcTracker();
  });

  // Phase 4: Voice Biomarker Pipeline
  container.registerSingleton(Tokens.VoiceBiomarkerPipeline, async () => {
    const { getVoiceBiomarkerPipeline } = await import('../../speech/voice-biomarkers/engine.js');
    return getVoiceBiomarkerPipeline();
  });

  getLogger().info('Registered Superhuman Intelligence services (10 enhancements)');
}

/**
 * Register reliability services (Function Calling Reliability system)
 *
 * These services combat Gemini's function calling degradation:
 * - Session Health Monitor: Tracks session health and triggers context refresh
 * - Parallel Tool Executor: Runs critical tools with parallel fallback
 * - Context Pruner: Prunes conversation context to improve LLM reliability
 */
async function registerReliabilityServices(): Promise<void> {
  const container = getContainer();

  // Session Health Monitor - tracks session decay and triggers refresh
  container.registerSingleton(Tokens.SessionHealthMonitor, async () => {
    const {
      initializeHealthMonitor,
      recordTurn: recordHealthTurn,
      recordToolCallSuccess: recordHealthSuccess,
      recordToolCallLeakage: recordHealthLeakage,
      getSessionHealth,
      clearHealthMonitor,
    } = await import('../../agents/shared/session-health-monitor.js');

    // Return object implementing ISessionHealthMonitor
    return {
      initialize: initializeHealthMonitor,
      recordTurn: recordHealthTurn,
      recordToolCallSuccess: recordHealthSuccess,
      recordToolCallLeakage: recordHealthLeakage,
      getHealth: getSessionHealth,
      clear: clearHealthMonitor,
    };
  });

  // Parallel Tool Executor - runs critical tools with parallel attempts
  container.registerSingleton(Tokens.ParallelToolExecutor, async () => {
    const { isCriticalTool, executeWithParallelFallback } = await import(
      '../../agents/shared/parallel-tool-executor.js'
    );

    // Return object implementing IParallelToolExecutor
    return {
      execute: async (
        toolId: string,
        args: Record<string, unknown>,
        executor: (args: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>
      ) => {
        if (!isCriticalTool(toolId)) {
          // For non-critical tools, just execute directly
          return executor(args);
        }
        // For critical tools, use parallel execution
        return executeWithParallelFallback(toolId, args, executor, {
          maxParallel: 2,
          timeoutMs: 5000,
          verbose: false,
        });
      },
      isCritical: isCriticalTool,
    };
  });

  // Context Pruner - prunes conversation context to improve reliability
  container.registerSingleton(Tokens.ContextPruner, async () => {
    const { shouldPruneContext, pruneConversationContext } = await import(
      '../../agents/shared/conversation-priming.js'
    );

    // Return object implementing IContextPruner
    return {
      shouldPrune: shouldPruneContext,
      prune: pruneConversationContext,
    };
  });

  getLogger().info('Registered reliability services (Session Health, Parallel Executor, Context Pruner)');
}

/**
 * Register memory services (Better than Human memory capabilities)
 */
async function registerMemoryServices(): Promise<void> {
  const container = getContainer();

  // Cognitive Memory - learns user's thinking style
  container.registerSingleton(Tokens.CognitiveMemory, async () => {
    const { getCognitiveMemoryService } = await import('../memory/cognitive-memory.js');
    return getCognitiveMemoryService();
  });

  // Voice Memory - recognizes returning users by voice
  container.registerSingleton(Tokens.VoiceMemory, async () => {
    const { getVoiceMemory } = await import('../memory/voice-memory.js');
    return getVoiceMemory();
  });

  // Unified Memory - consolidated memory access
  container.registerSingleton(Tokens.UnifiedMemory, async () => {
    const { getUnifiedMemoryService } = await import('../memory/unified-service.js');
    return getUnifiedMemoryService();
  });

  // Learned Memories - tracks what user has been told
  container.registerSingleton(Tokens.LearnedMemories, async () => {
    const { getLearnedMemoriesService } = await import('../memory/learned-memories.js');
    return getLearnedMemoriesService();
  });

  // Proactive Memory Surfacing - surfaces relevant memories
  container.registerSingleton(Tokens.ProactiveMemorySurfacing, async () => {
    const { getProactiveMemorySurfacing } = await import('../memory/proactive-memory-surfacing.js');
    return getProactiveMemorySurfacing();
  });

  getLogger().info('Registered memory services');
}

// ============================================================================
// BOOTSTRAP FUNCTION
// ============================================================================

/**
 * Bootstrap all services through DI container
 *
 * This is the single entry point for service initialization.
 * Call this during app startup or test setup.
 */
export async function bootstrapServices(options: BootstrapOptions = {}): Promise<void> {
  const { useMocks = false, skipTeamHandlers = false } = options;

  getLogger().info({ useMocks, skipTeamHandlers }, 'Bootstrapping services via DI...');

  // Register all services
  await registerStorageServices(useMocks);
  await registerApplicationServices();
  await registerSchedulerServices();
  await registerMemoryServices();
  await registerSuperhumanIntelligenceServices();
  await registerReliabilityServices();

  // Initialize team handlers unless skipped
  if (!skipTeamHandlers && !useMocks) {
    try {
      const { initializeTeamHandlers } = await import('../../tools/index.js');
      await initializeTeamHandlers();
      getLogger().info('Team handlers initialized');
    } catch (error) {
      getLogger().warn({ error: String(error) }, 'Team handlers initialization skipped');
    }
  }

  getLogger().info('DI bootstrap complete');
}

/**
 * Reset DI container and clear all registrations
 * Use in tests to get a clean slate
 */
export async function resetServices(): Promise<void> {
  resetContainer();
  getLogger().info('DI container reset');
}

// ============================================================================
// CONVENIENCE RESOLVERS
// ============================================================================

/**
 * Resolve MemoryStore from container
 */
export async function resolveMemoryStore() {
  const container = getContainer();
  return container.resolve(Tokens.MemoryStore);
}

/**
 * Resolve VectorStore from container
 */
export async function resolveVectorStore() {
  const container = getContainer();
  return container.resolve(Tokens.VectorStore);
}

/**
 * Resolve ProductivityStore from container
 */
export async function resolveProductivityStore() {
  const container = getContainer();
  return container.resolve(Tokens.ProductivityStore);
}

/**
 * Resolve AgentBus from container
 */
export async function resolveAgentBus() {
  const container = getContainer();
  return container.resolve(Tokens.AgentBus);
}

/**
 * Resolve CognitiveMemory from container
 */
export async function resolveCognitiveMemory() {
  const container = getContainer();
  return container.resolve(Tokens.CognitiveMemory);
}

/**
 * Resolve VoiceMemory from container
 */
export async function resolveVoiceMemory() {
  const container = getContainer();
  return container.resolve(Tokens.VoiceMemory);
}

/**
 * Resolve UnifiedMemory from container
 */
export async function resolveUnifiedMemory() {
  const container = getContainer();
  return container.resolve(Tokens.UnifiedMemory);
}

/**
 * Resolve LearnedMemories from container
 */
export async function resolveLearnedMemories() {
  const container = getContainer();
  return container.resolve(Tokens.LearnedMemories);
}

/**
 * Resolve ProactiveMemorySurfacing from container
 */
export async function resolveProactiveMemorySurfacing() {
  const container = getContainer();
  return container.resolve(Tokens.ProactiveMemorySurfacing);
}

/**
 * Resolve PersonaRegistry from container
 */
export async function resolvePersonaRegistry() {
  const container = getContainer();
  return container.resolve(Tokens.PersonaRegistry);
}

/**
 * Resolve TTS Gateway from container
 * Returns null if gateway is disabled (USE_TTS_GATEWAY != 'true')
 */
export async function resolveTTSGateway() {
  const container = getContainer();
  return container.resolve(Tokens.TTSGateway);
}

/**
 * Resolve TTS Cache from container
 */
export async function resolveTTSCache() {
  const container = getContainer();
  return container.resolve(Tokens.TTSCache);
}

/**
 * Resolve SessionHealthMonitor from container
 */
export async function resolveSessionHealthMonitor() {
  const container = getContainer();
  return container.resolve(Tokens.SessionHealthMonitor);
}

/**
 * Resolve ParallelToolExecutor from container
 */
export async function resolveParallelToolExecutor() {
  const container = getContainer();
  return container.resolve(Tokens.ParallelToolExecutor);
}

/**
 * Resolve ContextPruner from container
 */
export async function resolveContextPruner() {
  const container = getContainer();
  return container.resolve(Tokens.ContextPruner);
}

/**
 * Get GlobalServices-compatible object from DI container
 * For backward compatibility with existing code
 */
export async function getServicesFromDI(): Promise<GlobalServices> {
  const container = getContainer();

  // Resolve services - they may be async factories
  const storeResult = container.resolve(Tokens.MemoryStore);
  const vectorStoreResult = container.resolve(Tokens.VectorStore);
  const productivityStoreResult = container.resolve(Tokens.ProductivityStore);
  const backgroundTasksResult = container.resolve(Tokens.BackgroundTasks);

  // Await if they're promises
  const [store, vectorStore, productivityStore, backgroundTasks] = await Promise.all([
    Promise.resolve(storeResult),
    Promise.resolve(vectorStoreResult),
    Promise.resolve(productivityStoreResult),
    Promise.resolve(backgroundTasksResult),
  ]);

  return {
    store: store as GlobalServices['store'],
    vectorStore: vectorStore as GlobalServices['vectorStore'],
    productivityStore: productivityStore as GlobalServices['productivityStore'],
    backgroundTasks: backgroundTasks as GlobalServices['backgroundTasks'],
    initialized: true,
  };
}
