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

    // 2. Pre-load persona cache
    tasks.push(
      (async () => {
        try {
          const personaStart = Date.now();
          const { warmCommonCaches } = await import('../shared/performance/edge-cache.js');
          await warmCommonCaches();

          // Also warm the specific persona bundles
          const personas = ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor'];
          let cachedCount = 0;
          for (const pid of personas) {
            try {
              const { loadBundle } = await import('../../personas/bundles/loader.js');
              await loadBundle(pid);
              cachedCount++;
            } catch {
              // Some personas may not exist
            }
          }

          log('✅ Persona cache warmed', {
            durationMs: Date.now() - personaStart,
            cachedPersonas: cachedCount,
          });
        } catch (e) {
          log('⚠️ Persona cache warmup failed', { error: String(e) });
        }
      })()
    );

    // 3. Pre-initialize tool orchestrator
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
            import('../../intelligence/batched-llm-analysis.js'),
            import('../../intelligence/context-service.js'),
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

    await Promise.all(tasks);
    const durationMs = Date.now() - warmupStart;
    log('✅ Resource warmup complete', { durationMs });

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
