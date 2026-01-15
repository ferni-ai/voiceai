/**
 * GCE Resource Warmup
 *
 * Pre-warms resources for faster session starts on GCE.
 * Extracted from gce-voice-worker.ts for maintainability.
 *
 * @module agents/gce/warmup
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WarmupResult {
  /** Whether VAD was loaded */
  vadLoaded: boolean;
  /** Pre-loaded VAD instance */
  preloadedVAD: unknown;
  /** Total warmup duration in ms */
  durationMs: number;
}

export type LogFn = (msg: string, data?: Record<string, unknown>) => void;

// ============================================================================
// WARMUP FUNCTION
// ============================================================================

/**
 * Warm up resources for faster session starts.
 *
 * Pre-loads:
 * - GLOBAL SERVICES (Firestore, memory system) ← CRITICAL for fast first session!
 * - TTS engine (Cartesia)
 * - Persona cache
 * - Tool orchestrator
 * - Context builders
 * - Speculative embeddings
 * - Performance optimization modules
 *
 * NOTE: VAD (Silero) is NO LONGER preloaded - Gemini Realtime has built-in turn detection!
 * This saves 200-400ms on worker startup.
 */
export async function warmupResources(log: LogFn): Promise<WarmupResult> {
  const warmupStart = Date.now();
  // VAD no longer preloaded - Gemini handles turn detection
  const preloadedVAD: unknown = null;
  const vadLoaded = false;

  try {
    // ⚡ CRITICAL: Initialize global services FIRST (blocking)
    // This is the single biggest contributor to slow first-session join times.
    // Firestore connections, memory system, collective learning, etc. must be ready
    // BEFORE a job comes in, or the user waits 2-5 seconds for Ferni to join.
    try {
      const globalServicesStart = Date.now();
      const { initializeServices } = await import('../../services/global-services.js');
      await initializeServices(false); // Skip persona indexing (done separately)
      log('✅ Global services initialized (Firestore, memory system)', {
        durationMs: Date.now() - globalServicesStart,
      });
    } catch (e) {
      log('⚠️ Global services init failed', { error: String(e) });
      // Continue anyway - will retry on first session
    }

    // ⚡ Initialize background agents delivery (lightweight - just push/email)
    // This enables "while you were away" notifications without the full outreach system
    try {
      const { initializeBackgroundDelivery } =
        await import('../../services/background-agents/index.js');
      await initializeBackgroundDelivery();
      log('✅ Background agents delivery initialized');
    } catch (e) {
      log('⚠️ Background delivery init failed (non-critical)', { error: String(e) });
    }

    const tasks: Array<Promise<void>> = [];

    // ⚡ REMOVED: VAD preloading - Gemini Realtime handles turn detection
    // Silero VAD was adding 200-400ms to warmup for no benefit
    // If VAD is needed for specific features, load lazily on demand

    // 1. Pre-warm TTS (just import the module)
    tasks.push(
      (async () => {
        try {
          const ttsStart = Date.now();
          await import('../../speech/tts/cartesia-core.js');
          log('✅ TTS module loaded', { durationMs: Date.now() - ttsStart });
        } catch (e) {
          log('⚠️ TTS load failed', { error: String(e) });
        }
      })()
    );

    // 1b. ⚡ PRE-CACHE CONVERSATIONAL AUDIO - Biggest latency win!
    // Generate TTS audio for greetings, handoffs, banter, and backchannels.
    // Target: ALL conversational phrases under 800ms (most under 200ms when cached).
    tasks.push(
      (async () => {
        try {
          const audioPrewarmStart = Date.now();
          const { prewarmConversationalAudio } =
            await import('../shared/conversational-audio-cache.js');
          const cachedCount = await prewarmConversationalAudio();
          log('✅ Conversational audio pre-cached (greetings, handoffs, banter)', {
            durationMs: Date.now() - audioPrewarmStart,
            phrasesCached: cachedCount,
          });
        } catch (e) {
          log('⚠️ Conversational audio pre-cache failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 2. Pre-load persona cache
    tasks.push(
      (async () => {
        try {
          const personaStart = Date.now();
          const { warmCommonCaches } = await import('../../services/cache/edge-cache.js');
          await warmCommonCaches();

          // Also warm the specific persona bundles (PARALLEL for performance)
          const personas = ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor'];
          const { loadBundle } = await import('../../personas/bundles/loader.js');

          const results = await Promise.allSettled(
            personas.map(async (pid) => {
              await loadBundle(pid);
              return pid;
            })
          );

          const cachedCount = results.filter((r) => r.status === 'fulfilled').length;

          log('✅ Persona cache warmed', {
            durationMs: Date.now() - personaStart,
            cachedPersonas: cachedCount,
          });
        } catch (e) {
          log('⚠️ Persona cache warmup failed', { error: String(e) });
        }
      })()
    );

    // 3a. Pre-load tool manifest (from build-time artifact)
    tasks.push(
      (async () => {
        try {
          const manifestStart = Date.now();
          const { loadToolManifest } = await import('../../tools/registry/manifest-loader.js');
          const manifest = await loadToolManifest();
          log('⚡ Tool manifest loaded (100x faster than dynamic imports)', {
            durationMs: Date.now() - manifestStart,
            totalTools: manifest.totalTools,
            totalDomains: manifest.totalDomains,
          });
        } catch (e) {
          log('⚠️ Tool manifest load failed - will use dynamic imports', { error: String(e) });
        }
      })()
    );

    // 3b. Pre-load embeddings (from build-time artifact)
    tasks.push(
      (async () => {
        try {
          const embeddingsStart = Date.now();
          const { loadPrecomputedEmbeddings } =
            await import('../../tools/semantic-router/precomputed-embeddings.js');
          const embeddings = await loadPrecomputedEmbeddings();
          log('⚡ Pre-computed embeddings loaded (30-50x faster than API)', {
            durationMs: Date.now() - embeddingsStart,
            totalTools: embeddings.totalTools,
            dimension: embeddings.dimension,
          });
        } catch (e) {
          log('⚠️ Pre-computed embeddings load failed - will compute at runtime', {
            error: String(e),
          });
        }
      })()
    );

    // 3c. Pre-initialize tool orchestrator
    tasks.push(
      (async () => {
        try {
          const orchStart = Date.now();
          const { initializeToolOrchestrator } = await import('../../tools/orchestrator/index.js');
          await initializeToolOrchestrator();
          log('✅ Tool orchestrator initialized', { durationMs: Date.now() - orchStart });
        } catch (e) {
          log('⚠️ Tool orchestrator init failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 4. Pre-load context builders (just import the module)
    tasks.push(
      (async () => {
        try {
          const contextStart = Date.now();
          await import('../../intelligence/context-builders/index.js');
          log('✅ Context builders loaded', { durationMs: Date.now() - contextStart });
        } catch (e) {
          log('⚠️ Context builders load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 5. Pre-warm conversation manager
    tasks.push(
      (async () => {
        try {
          const convStart = Date.now();
          await import('../../services/conversation-manager.js');
          log('✅ Conversation manager loaded', { durationMs: Date.now() - convStart });
        } catch (e) {
          log('⚠️ Conversation manager load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 6. Pre-warm trust systems
    tasks.push(
      (async () => {
        try {
          const trustStart = Date.now();
          await import('../../services/trust-systems/index.js');
          log('✅ Trust systems loaded', { durationMs: Date.now() - trustStart });
        } catch (e) {
          log('⚠️ Trust systems load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 7. Pre-warm voice humanization
    tasks.push(
      (async () => {
        try {
          const humanStart = Date.now();
          await import('../../speech/voice-humanization.js');
          await import('../integrations/voice-humanization-integration.js');
          log('✅ Voice humanization loaded', { durationMs: Date.now() - humanStart });
        } catch (e) {
          log('⚠️ Voice humanization load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 8. Initialize speculative embeddings
    tasks.push(
      (async () => {
        try {
          const embeddingStart = Date.now();
          const { initializeSpeculativeEmbeddings } =
            await import('../../memory/speculative-embeddings.js');
          await initializeSpeculativeEmbeddings();
          log('✅ Speculative embeddings initialized', {
            durationMs: Date.now() - embeddingStart,
          });
        } catch (e) {
          log('⚠️ Speculative embeddings init failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 9. Pre-warm scaling systems
    tasks.push(
      (async () => {
        try {
          const perfStart = Date.now();
          await Promise.all([
            import('../shared/performance/index.js'),
            import('../../services/pubsub/pubsub-client.js'),
            import('../../intelligence/core/batched-llm-analysis.js'),
            import('../../intelligence/core/context-service.js'),
            import('../../memory/parallel-memory-search.js'),
          ]);
          log('✅ Performance optimization modules pre-loaded', {
            durationMs: Date.now() - perfStart,
          });
        } catch (e) {
          log('⚠️ Performance modules pre-load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 10. ⚡ LLM WARMUP - Pre-establish connections for faster first response
    // Import LLM providers to trigger connection establishment
    // This saves ~200-400ms on first session by having connections ready
    tasks.push(
      (async () => {
        try {
          const llmWarmupStart = Date.now();
          // Import providers to trigger any lazy initialization
          await Promise.all([
            import('@livekit/agents-plugin-google').then((mod) => {
              // Just importing establishes the SDK connection pool
              log('✅ Gemini SDK loaded', { durationMs: Date.now() - llmWarmupStart });
            }),
            // Also pre-warm OpenAI if enabled (for USE_OPENAI_REALTIME mode)
            process.env.OPENAI_API_KEY
              ? import('@livekit/agents-plugin-openai').then(() => {
                  log('✅ OpenAI SDK loaded', { durationMs: Date.now() - llmWarmupStart });
                })
              : Promise.resolve(),
          ]);
        } catch (e) {
          log('⚠️ LLM warmup failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 11. Pre-warm warm greeting generator (ensures greeting text is ready instantly)
    tasks.push(
      (async () => {
        try {
          const warmGreetingStart = Date.now();
          const { prewarmGreetingsForAllPersonas } = await import('../shared/warm-greeting.js');
          prewarmGreetingsForAllPersonas();
          log('✅ Warm greetings pre-generated', { durationMs: Date.now() - warmGreetingStart });
        } catch (e) {
          log('⚠️ Warm greeting prewarm failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 11b. ⚡ PRE-RENDER GREETING AUDIO - Eliminates TTS latency on first greeting!
    // Generates actual audio bytes for most likely greetings so first response is instant.
    tasks.push(
      (async () => {
        try {
          const audioPrewarmStart = Date.now();
          const { prewarmGreetingAudio } =
            await import('../shared/performance/greeting-audio-prewarm.js');
          const result = await prewarmGreetingAudio(false); // false = primary personas only
          log('✅ Greeting audio pre-rendered (instant first greeting)', {
            durationMs: Date.now() - audioPrewarmStart,
            greetingsCached: result.cachedCount,
            personas: result.personas,
          });
        } catch (e) {
          log('⚠️ Greeting audio prewarm failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 12. ⚡ FAST-JOIN: Pre-warm session pool for sub-3-second agent joining
    // This creates ready-to-use Gemini sessions so users hear greeting within 2 seconds
    tasks.push(
      (async () => {
        try {
          const fastJoinStart = Date.now();
          const { initializeFastJoin } = await import('./fast-join.js');
          await initializeFastJoin({
            poolSize: 2, // Keep 2 warm sessions ready
            enablePooling: process.env.ENABLE_SESSION_POOLING !== 'false',
          });
          log('✅ Fast-join session pool warmed', { durationMs: Date.now() - fastJoinStart });
        } catch (e) {
          log('⚠️ Fast-join init failed (non-fatal, will create sessions on demand)', {
            error: String(e),
          });
        }
      })()
    );

    // 13. ⚡ DAY AWARENESS CACHE: Pre-warm shared day context (date, holidays, season)
    // First user of the day gets instant day awareness instead of computing fresh.
    // Refreshes in background every 5 minutes to stay current.
    tasks.push(
      (async () => {
        try {
          const dayAwarenessStart = Date.now();
          const { initDayAwarenessCache, getDayAwareness } =
            await import('../../services/day-awareness-cache.js');
          initDayAwarenessCache();
          // Force initial cache population
          const context = getDayAwareness();
          log('✅ Day awareness cache warmed', {
            durationMs: Date.now() - dayAwarenessStart,
            timeOfDay: context.timeOfDay,
            dayOfWeek: context.dayOfWeek,
            holiday: context.holiday?.name,
          });
        } catch (e) {
          log('⚠️ Day awareness cache init failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    await Promise.all(tasks);
    const durationMs = Date.now() - warmupStart;

    // =========================================================================
    // STARTUP SLA CHECK (added after Dec 2024 startup hang incident)
    // =========================================================================
    // Warmup should complete in <10 seconds. If it takes longer, something is
    // blocking that needs investigation. This catches issues like:
    // - Database queries iterating over large datasets
    // - Network calls without timeouts
    // - Synchronous operations that scale with data volume
    // =========================================================================
    const WARMUP_SLA_MS = 10000; // 10 second budget
    const WARMUP_WARNING_MS = 5000; // Warn at 5 seconds

    if (durationMs > WARMUP_SLA_MS) {
      log('🚨 STARTUP SLA VIOLATION: Warmup took too long!', {
        durationMs,
        slaBudgetMs: WARMUP_SLA_MS,
        overage: durationMs - WARMUP_SLA_MS,
        action: 'Investigate which warmup task is blocking',
      });
    } else if (durationMs > WARMUP_WARNING_MS) {
      log('⚠️ Warmup approaching SLA limit', {
        durationMs,
        slaBudgetMs: WARMUP_SLA_MS,
        headroomMs: WARMUP_SLA_MS - durationMs,
      });
    } else {
      log('✅ Resource warmup complete', { durationMs, slaBudgetMs: WARMUP_SLA_MS });
    }

    return { vadLoaded, preloadedVAD, durationMs };
  } catch (e) {
    log('⚠️ Warmup failed (proceeding anyway)', { error: String(e) });
    return {
      vadLoaded: false,
      preloadedVAD: null,
      durationMs: Date.now() - warmupStart,
    };
  }
}
