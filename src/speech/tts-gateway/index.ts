/**
 * TTS Gateway - Centralized Text-to-Speech
 *
 * SINGLE SOURCE OF TRUTH for all TTS operations in Ferni.
 *
 * This module provides a clean architecture for TTS with:
 * - SSML parsing and buffering (prevents fragmentation)
 * - Unified caching (greeting, conversational, speculative)
 * - Provider abstraction (Cartesia, future providers)
 * - Audio sink abstraction (session, track)
 * - Full E2E tracing
 *
 * Quick Start:
 * ```typescript
 * import {
 *   initTTSGateway,
 *   getTTSGateway,
 *   isTTSGatewayEnabled,
 * } from './speech/tts-gateway';
 *
 * // Initialize once at startup
 * if (isTTSGatewayEnabled()) {
 *   initTTSGateway({
 *     provider: getCartesiaProvider(),
 *     cache: createTTSCache(),
 *   });
 * }
 *
 * // Use throughout the app
 * const gateway = getTTSGateway();
 * const result = await gateway.synthesize({
 *   text: '<break time="200ms"/>Hello!',
 *   voiceId: 'ferni',
 * });
 * ```
 *
 * @module speech/tts-gateway
 */

// ============================================================================
// FEATURE FLAG
// ============================================================================

/**
 * Check if the TTS Gateway is enabled.
 * Set USE_TTS_GATEWAY=false to disable (enabled by default).
 */
export function isTTSGatewayEnabled(): boolean {
  return process.env.USE_TTS_GATEWAY !== 'false';
}

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core types
  AudioFormat,
  SSMLProsodyConfig,
  SSMLParseResult,
  TTSRequest,
  TTSResult,
  AudioFrameStream,

  // Interface types
  ITTSProvider,
  ITTSCache,
  IAudioSink,
  ISSMLProcessor,
  ITTSGateway,

  // Cache types
  CacheEntry,
  CacheStats,

  // Config types
  TTSGatewayConfig,
  GatewayStats,

  // Tracing types
  TraceEventType,
  TraceEvent,
  TTSTrace,

  // Utility types
  VoiceIdResolver,
  DurationEstimator,
  ILogger,
} from './types.js';

export { DEFAULT_AUDIO_FORMAT } from './types.js';

// ============================================================================
// GATEWAY
// ============================================================================

export {
  TTSGateway,
  getTTSGateway,
  initTTSGateway,
  createTTSGateway,
  resetTTSGateway,
} from './gateway.js';

// ============================================================================
// SSML
// ============================================================================

// SSML Processing - SINGLE SOURCE OF TRUTH for all SSML handling
// Used by: tts-wrapper.ts, cache-aware-tts.ts, speech-coordinator.ts
export {
  SSMLProcessor,
  getSSMLProcessor,
  createSSMLProcessor,
  parseSSML,
  stripSSML,
  normalizeForCache,
  containsSSML,
  hasIncompleteSSML,
} from './ssml/index.js';

// ============================================================================
// PROVIDERS
// ============================================================================

export {
  CartesiaTTSProvider,
  getCartesiaProvider,
  createCartesiaProvider,
  type CartesiaProviderConfig,
} from './providers/index.js';

// ============================================================================
// SINKS
// ============================================================================

export {
  LiveKitSessionSink,
  LiveKitTrackSink,
  createSessionSink,
  createTrackSink,
  bufferToAudioFrames,
  type LiveKitSessionSinkConfig,
  type LiveKitTrackSinkConfig,
} from './sinks/index.js';

// ============================================================================
// GATEWAY TTS NODE (Full TTS Replacement)
// ============================================================================

// This is the full gateway integration - replaces LiveKit's internal TTS
// with our gateway, enabling unified caching and proper SSML handling
export {
  createGatewayTTSNode,
  createGatewayTTSNodeForAgent,
  getGatewayTTSMetrics,
  resetGatewayTTSMetrics,
  type GatewayTTSNodeConfig,
  type GatewayTTSMetrics,
} from './gateway-tts-node.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import type { voice } from '@livekit/agents';
import { TransformStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';
import { getTTSGateway, initTTSGateway } from './gateway.js';
import { getCartesiaProvider } from './providers/index.js';
import { createTTSCache, getTTSCache } from '../../services/tts/index.js';
import { parseSSML, getSSMLProcessor } from './ssml/index.js';
import { createSessionSink } from './sinks/index.js';
import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
import type { TTSRequest, TTSResult, IAudioSink, SSMLProsodyConfig } from './types.js';

const log = createLogger({ module: 'TTSGateway' });

/**
 * Initialize the gateway with default configuration.
 *
 * Call this once at application startup.
 */
export function initDefaultGateway(): void {
  if (!isTTSGatewayEnabled()) {
    log.debug({}, 'TTS Gateway disabled (USE_TTS_GATEWAY != true)');
    return;
  }

  try {
    initTTSGateway({
      provider: getCartesiaProvider(),
      cache: createTTSCache(),
      enableTracing: true,
    });
    log.info({}, '🚀 TTS Gateway initialized with defaults');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize TTS Gateway');
  }
}

/**
 * Synthesize text to audio (convenience function).
 *
 * NOTE: Currently not called in production. The gateway is used for SSML
 * processing, but actual TTS is done by LiveKit's internal Cartesia plugin.
 * This function is provided for future direct TTS integration.
 *
 * Requires gateway to be initialized first.
 *
 * @param text - Text to synthesize (may contain SSML)
 * @param voiceId - Voice identifier
 * @param options - Additional options
 * @returns TTS result with audio
 */
export async function synthesize(
  text: string,
  voiceId: string,
  options?: Partial<Omit<TTSRequest, 'text' | 'voiceId'>>
): Promise<TTSResult> {
  const gateway = getTTSGateway();
  return gateway.synthesize({
    text,
    voiceId,
    ...options,
  });
}

/**
 * Speak text to an audio sink (convenience function).
 *
 * @deprecated Use `createGatewayTTSNode()` instead for production TTS.
 * The gateway TTS node handles the full pipeline: SSML parsing, caching,
 * Cartesia synthesis, and audio frame conversion for LiveKit.
 *
 * This function is retained for direct sink output use cases but is not
 * called in the main voice agent pipeline.
 *
 * @param text - Text to speak
 * @param voiceId - Voice identifier
 * @param sink - Audio sink to send to
 * @param options - Additional options
 */
export async function speakTo(
  text: string,
  voiceId: string,
  sink: IAudioSink,
  options?: Partial<Omit<TTSRequest, 'text' | 'voiceId'>>
): Promise<void> {
  const gateway = getTTSGateway();
  return gateway.speakTo(
    {
      text,
      voiceId,
      ...options,
    },
    sink
  );
}

/**
 * Get clean text from SSML input (convenience function).
 *
 * @param text - Text with potential SSML tags
 * @returns Clean text with SSML processed
 */
export function getCleanText(text: string): string {
  return parseSSML(text).cleanText;
}

/**
 * Check if text contains SSML that would be spoken literally without the gateway.
 *
 * @param text - Text to check
 * @returns true if SSML tags are present
 */
export function wouldSpeakSSML(text: string): boolean {
  const result = parseSSML(text);
  return result.hadSSML;
}

// ============================================================================
// BACKWARD COMPATIBILITY FUNCTIONS
// These provide compatibility with the old gateway API used in
// speech-coordinator.ts and tts-wrapper.ts
// ============================================================================

/**
 * Extract SSML to config (backward compatibility).
 *
 * @deprecated Use parseSSML() instead
 */
export function extractSSMLToConfig(text: string) {
  const result = parseSSML(text);
  return {
    text: result.cleanText,
    config: result.prosody,
    hadSSML: result.hadSSML,
    extractedTags: result.originalTags,
  };
}

/**
 * Speak to a LiveKit session (backward compatibility).
 *
 * @deprecated Use `createGatewayTTSNode()` instead for production TTS.
 * This function uses session.say() which only accepts text, so it cannot
 * return cached audio directly. The gateway TTS node bypasses this limitation.
 *
 * This function strips SSML and calls session.say() - useful for one-off
 * utterances but not the main voice agent pipeline.
 *
 * @param session - LiveKit agent session
 * @param text - Text to speak (may contain SSML)
 * @param options - Options including voiceId
 */
export function speakToSession(
  session: voice.AgentSession,
  text: string,
  options: {
    voiceId: string;
    sessionId?: string;
    personaId?: string;
    allowInterruptions?: boolean;
  }
): void {
  // Parse SSML and get clean text
  const result = parseSSML(text);
  const cleanText = result.cleanText;

  if (!cleanText.trim()) {
    log.debug(
      { originalText: truncateForLog(text, 50) },
      'TTS Gateway: Empty text after SSML strip, skipping'
    );
    return;
  }

  const startTime = Date.now();
  
  log.debug(
    {
      originalText: truncateForLog(text, 50),
      cleanText: truncateForLog(cleanText, 50),
      voiceId: options.voiceId,
      hadSSML: result.hadSSML,
    },
    '🎤 TTS Gateway: Speaking to session'
  );

  // 🔊 E2E TRACING: Log TTS pipeline timing
  const debugTTS = process.env.DEBUG_TTS_PIPELINE === 'true' || process.env.DEBUG_GEMINI_ALL === 'true';
  if (debugTTS) {
    process.stderr.write(`\n🔊 [TTS PIPELINE] ${new Date().toISOString()}\n`);
    process.stderr.write(`  📝 Input: "${truncateForLog(text, 100)}"\n`);
    process.stderr.write(`  🧹 Clean: "${truncateForLog(cleanText, 100)}"\n`);
    process.stderr.write(`  🎙️ Voice: ${options.voiceId}\n`);
    process.stderr.write(`  ⏱️ SSML parse: ${Date.now() - startTime}ms\n`);
  }

  // Use session.say() with clean text
  const sayStart = Date.now();
  session.say(cleanText, {
    allowInterruptions: options.allowInterruptions ?? true,
  });
  
  if (debugTTS) {
    process.stderr.write(`  ⏱️ session.say() called: ${Date.now() - sayStart}ms\n`);
    process.stderr.write(`  ⏱️ Total TTS Gateway: ${Date.now() - startTime}ms\n`);
  }
}

/**
 * Create a streaming pipeline for text processing (backward compatibility).
 *
 * This creates a function that:
 * 1. Buffers SSML tags to prevent fragmentation
 * 2. Strips SSML from text
 * 3. Returns clean text stream
 *
 * @param _agent - LiveKit agent (unused, for compatibility)
 * @param _options - Options including voiceId (unused)
 */
export function createStreamingPipeline(
  _agent: voice.Agent,
  _options: {
    voiceId: string;
    sessionId?: string;
    personaId?: string;
    emotion?: string;
  }
): (textStream: NodeReadableStream<string>) => NodeReadableStream<string> {
  // FIX (Jan 2026): TransformStream is now imported at module level
  // This fixes "require is not defined" error in ESM
  const processor = getSSMLProcessor();

  return (textStream: NodeReadableStream<string>) => {
    // Buffer complete SSML tags
    const bufferTransform = processor.createBufferTransform();

    // Parse and strip SSML
    const parseTransform = new TransformStream<string, string>({
      transform: (chunk: string, controller: { enqueue: (text: string) => void }) => {
        const result = processor.parse(chunk);
        if (result.hadSSML) {
          log.debug(
            {
              input: truncateForLog(chunk, 50),
              output: truncateForLog(result.cleanText, 50),
              config: result.prosody,
            },
            '🔧 TTS Gateway Stream: Stripped SSML'
          );
        }
        if (result.cleanText.trim()) {
          controller.enqueue(result.cleanText);
        }
      },
    });

    return textStream
      .pipeThrough(bufferTransform)
      .pipeThrough(parseTransform);
  };
}

// ============================================================================
// RE-EXPORT CACHE (from services layer)
// ============================================================================

export {
  TTSCache,
  DelegatingTTSCache,
  getTTSCache,
  createTTSCache,
  createDelegatingTTSCache,
  setTTSCache,
  type TTSCacheConfig,
} from '../../services/tts/index.js';
