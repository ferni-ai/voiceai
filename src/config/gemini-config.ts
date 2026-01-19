/**
 * Centralized Gemini/Vertex AI Configuration
 *
 * ONE SOURCE OF TRUTH for all Gemini API usage across the codebase.
 * All services should import from here instead of reading env vars directly.
 *
 * @module config/gemini-config
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'GeminiConfig' });

// ============================================================================
// CONFIGURATION (from .env) - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * USE_VERTEX_AI - The ONE flag to control Vertex AI vs Gemini API
 *
 * - true (default): Use Vertex AI (higher quotas, no 429 rate limits)
 * - false: Use Gemini API with API key
 */
export const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';

/** Google Cloud Project ID (required for Vertex AI) */
export const { GOOGLE_CLOUD_PROJECT } = process.env;

/** Google Cloud Location (default: us-central1) */
export const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

/** Gemini API Key (for non-Vertex AI usage) */
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

/** Alias for backward compatibility */
export const GOOGLE_API_KEY = GEMINI_API_KEY;

// ============================================================================
// MODEL CONFIGURATION (from .env)
// ============================================================================

/** Default Gemini model (from .env or fallback) */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

/** Default temperature for generation (0.0 - 2.0) */
export const GEMINI_TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE || '0.8');

/** Low temperature for consistent/deterministic output (routing, classification) */
export const GEMINI_TEMPERATURE_LOW = parseFloat(process.env.GEMINI_TEMPERATURE_LOW || '0.3');

/** High temperature for creative output (expressions, stories) */
export const GEMINI_TEMPERATURE_HIGH = parseFloat(process.env.GEMINI_TEMPERATURE_HIGH || '0.9');

/** Default max output tokens */
export const GEMINI_MAX_OUTPUT_TOKENS = parseInt(
  process.env.GEMINI_MAX_OUTPUT_TOKENS || '1024',
  10
);

/** Short max tokens for quick responses */
export const GEMINI_MAX_OUTPUT_TOKENS_SHORT = parseInt(
  process.env.GEMINI_MAX_OUTPUT_TOKENS_SHORT || '500',
  10
);

/** Long max tokens for detailed responses */
export const GEMINI_MAX_OUTPUT_TOKENS_LONG = parseInt(
  process.env.GEMINI_MAX_OUTPUT_TOKENS_LONG || '2000',
  10
);

/** Default language */
export const GEMINI_LANGUAGE = process.env.GEMINI_LANGUAGE || 'en-US';

// ============================================================================
// PURPOSE-SPECIFIC MODELS (from .env with sensible defaults)
// ============================================================================

/**
 * Model for fast extraction tasks (entity, fact, relationship extraction)
 * Optimized for: Speed, structured output, low cost
 * Default: gemini-1.5-flash (fast, cheap, good at structured extraction)
 */
export const EXTRACTION_MODEL = process.env.LLM_EXTRACTION_MODEL || 'gemini-1.5-flash';

/**
 * Model for embedding generation
 * Default: text-embedding-004 (Google's latest embedding model)
 */
export const EMBEDDING_MODEL = process.env.LLM_EMBEDDING_MODEL || 'text-embedding-004';

/**
 * Model for OpenAI fallback operations
 * Default: gpt-4o-mini (fast, cheap, good for fallback)
 */
export const OPENAI_FALLBACK_MODEL = process.env.LLM_OPENAI_FALLBACK_MODEL || 'gpt-4o-mini';

/**
 * Model for evaluation tasks (coherence, quality scoring)
 * Default: gemini-2.0-flash (balanced quality/speed)
 */
export const EVALUATION_MODEL = process.env.LLM_EVALUATION_MODEL || 'gemini-2.0-flash';

/**
 * Model for classification/routing tasks
 * Optimized for: Consistency, low latency
 * Default: gemini-1.5-flash (fast, deterministic with low temp)
 */
export const CLASSIFICATION_MODEL = process.env.LLM_CLASSIFICATION_MODEL || 'gemini-1.5-flash';

/**
 * Model for content generation (marketing, outreach)
 * Optimized for: Quality, creativity
 * Default: gemini-2.0-flash-exp (latest features, good quality)
 */
export const CONTENT_GENERATION_MODEL =
  process.env.LLM_CONTENT_GENERATION_MODEL || 'gemini-2.0-flash-exp';

/**
 * Model for light/fast tasks (humanization, expressions)
 * Optimized for: Ultra-low latency, minimal cost
 * Default: gemini-2.0-flash-lite (fastest available)
 */
export const LIGHT_MODEL = process.env.LLM_LIGHT_MODEL || 'gemini-2.0-flash-lite';

/**
 * Model for realtime/voice applications
 * Default: gemini-2.0-flash-exp (optimized for streaming)
 */
export const REALTIME_MODEL = process.env.LLM_REALTIME_MODEL || 'gemini-2.0-flash-exp';

/**
 * OpenAI realtime model (for OpenAI realtime API)
 * Default: gpt-realtime (GA production model, replaces deprecated gpt-4o-realtime-preview)
 */
export const OPENAI_REALTIME_MODEL = process.env.LLM_OPENAI_REALTIME_MODEL || 'gpt-realtime';

/**
 * OpenAI high-quality model (for content generation, analysis)
 * Default: gpt-4o (highest quality)
 */
export const OPENAI_QUALITY_MODEL = process.env.LLM_OPENAI_QUALITY_MODEL || 'gpt-4o';

// ============================================================================
// TIMEOUT CONFIGURATION (from .env)
// ============================================================================

/** Standard LLM timeout (5s default) */
export const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '5000', 10);

/** Short LLM timeout for fast operations (2s default) */
export const LLM_SHORT_TIMEOUT_MS = parseInt(process.env.LLM_SHORT_TIMEOUT_MS || '2000', 10);

/** Long LLM timeout for complex operations (15s default) */
export const LLM_LONG_TIMEOUT_MS = parseInt(process.env.LLM_LONG_TIMEOUT_MS || '15000', 10);

// ============================================================================
// PURPOSE-SPECIFIC TEMPERATURES (from .env with sensible defaults)
// ============================================================================

/**
 * Temperature for classification/analysis tasks (very low for consistency)
 * Use for: entity extraction, fact extraction, link detection, routing
 * Default: 0.1 (deterministic, structured output)
 */
export const TEMP_CLASSIFICATION = parseFloat(process.env.LLM_TEMP_CLASSIFICATION || '0.1');

/**
 * Temperature for extraction/analytical tasks (low for accuracy)
 * Use for: deep analysis, memory capture, structured reasoning
 * Default: 0.3 (mostly deterministic with slight variation)
 */
export const TEMP_EXTRACTION = parseFloat(process.env.LLM_TEMP_EXTRACTION || '0.3');

/**
 * Temperature for balanced tasks (moderate-low)
 * Use for: summarization, formatting, structured generation
 * Default: 0.5 (balanced between deterministic and creative)
 */
export const TEMP_BALANCED = parseFloat(process.env.LLM_TEMP_BALANCED || '0.5');

/**
 * Temperature for reasoning/generation tasks (moderate)
 * Use for: transcript intelligence, message enrichment, insight generation
 * Default: 0.7 (balanced creativity and coherence)
 */
export const TEMP_REASONING = parseFloat(process.env.LLM_TEMP_REASONING || '0.7');

/**
 * Temperature for content/creative tasks (moderate-high)
 * Use for: outreach content, journal responses, coaching content
 * Default: 0.8 (creative but grounded)
 */
export const TEMP_CONTENT = parseFloat(process.env.LLM_TEMP_CONTENT || '0.8');

/**
 * Temperature for creative/expressive tasks (high)
 * Use for: persona expressions, greetings, creative writing, humanization
 * Default: 0.9 (maximum creativity while maintaining coherence)
 */
export const TEMP_CREATIVE = parseFloat(process.env.LLM_TEMP_CREATIVE || '0.9');

// ============================================================================
// PURPOSE-SPECIFIC MAX TOKENS (from .env with sensible defaults)
// ============================================================================

/**
 * Tiny token limit for minimal responses
 * Use for: classification labels, yes/no answers, single values
 * Default: 100
 */
export const MAX_TOKENS_TINY = parseInt(process.env.LLM_MAX_TOKENS_TINY || '100', 10);

/**
 * Short token limit for brief responses
 * Use for: practice responses, short summaries, confirmations
 * Default: 200
 */
export const MAX_TOKENS_SHORT = parseInt(process.env.LLM_MAX_TOKENS_SHORT || '200', 10);

/**
 * Medium token limit for standard responses
 * Use for: journal analysis, entity extraction, default operations
 * Default: 500
 */
export const MAX_TOKENS_MEDIUM = parseInt(process.env.LLM_MAX_TOKENS_MEDIUM || '500', 10);

/**
 * Standard token limit for detailed responses
 * Use for: message enrichment, insight generation, context building
 * Default: 800
 */
export const MAX_TOKENS_STANDARD = parseInt(process.env.LLM_MAX_TOKENS_STANDARD || '800', 10);

/**
 * Long token limit for comprehensive responses
 * Use for: batched analysis, transcript intelligence, detailed summaries
 * Default: 1500
 */
export const MAX_TOKENS_LONG = parseInt(process.env.LLM_MAX_TOKENS_LONG || '1500', 10);

/**
 * Extended token limit for large content generation
 * Use for: content generation, long-form writing, comprehensive reports
 * Default: 4000
 */
export const MAX_TOKENS_EXTENDED = parseInt(process.env.LLM_MAX_TOKENS_EXTENDED || '4000', 10);

// ============================================================================
// VALIDATION
// ============================================================================

/** Check if Gemini is properly configured */
export function isGeminiConfigured(): boolean {
  if (USE_VERTEX_AI) {
    return !!GOOGLE_CLOUD_PROJECT;
  }
  return !!GEMINI_API_KEY;
}

/** Get a human-readable config status */
export function getGeminiConfigStatus(): string {
  if (USE_VERTEX_AI) {
    if (!GOOGLE_CLOUD_PROJECT) {
      return 'Vertex AI enabled but GOOGLE_CLOUD_PROJECT not set';
    }
    return `Vertex AI (${GOOGLE_CLOUD_PROJECT} @ ${GOOGLE_CLOUD_LOCATION})`;
  }
  if (!GEMINI_API_KEY) {
    return 'Gemini API disabled (no API key)';
  }
  return 'Gemini API (API key)';
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

// Cached client instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: any = null;
// FIX: Promise-based singleton to prevent race condition when multiple callers
// invoke getGeminiClient() concurrently during startup
let clientInitPromise: Promise<unknown | null> | null = null;

/**
 * Get a configured GoogleGenAI client
 *
 * This is the ONLY place that creates Gemini clients.
 * All services should use this instead of creating their own.
 *
 * @returns GoogleGenAI client or null if not configured
 */
export async function getGeminiClient(): Promise<unknown | null> {
  // Fast path: already initialized
  if (cachedClient) return cachedClient;

  // If initialization is in progress, wait for it (prevents race condition)
  if (clientInitPromise) return clientInitPromise;

  // Start initialization and store promise for concurrent callers
  clientInitPromise = initializeGeminiClient();
  return clientInitPromise;
}

async function initializeGeminiClient(): Promise<unknown | null> {
  if (!isGeminiConfigured()) {
    log.warn({ status: getGeminiConfigStatus() }, 'Gemini not properly configured');
    clientInitPromise = null;
    return null;
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');

    if (USE_VERTEX_AI && GOOGLE_CLOUD_PROJECT) {
      cachedClient = new GoogleGenAI({
        vertexai: true,
        project: GOOGLE_CLOUD_PROJECT,
        location: GOOGLE_CLOUD_LOCATION,
      });
      log.info(
        { project: GOOGLE_CLOUD_PROJECT, location: GOOGLE_CLOUD_LOCATION },
        '🔷 Gemini client initialized with Vertex AI'
      );
    } else {
      cachedClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });
      log.info('🔶 Gemini client initialized with API key');
    }

    return cachedClient;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Gemini client');
    clientInitPromise = null; // Allow retry on failure
    return null;
  }
}

/**
 * Reset the cached client (useful for testing or config changes)
 */
export function resetGeminiClient(): void {
  cachedClient = null;
  clientInitPromise = null;
}

/** Alias for backward compatibility */
export const createGeminiClient = getGeminiClient;

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/** Get the default model name */
export function getDefaultModel(): string {
  return GEMINI_MODEL;
}

/** Get the LLM timeout */
export function getLLMTimeout(): number {
  return LLM_TIMEOUT_MS;
}

/** Get the short LLM timeout */
export function getShortLLMTimeout(): number {
  return LLM_SHORT_TIMEOUT_MS;
}

// ============================================================================
// PURPOSE-SPECIFIC MODEL GETTERS
// ============================================================================

/**
 * Get model for extraction tasks (entity, fact, relationship extraction)
 * Use this instead of hardcoding 'gemini-1.5-flash'
 */
export function getExtractionModel(): string {
  return EXTRACTION_MODEL;
}

/**
 * Get model for embedding generation
 * Use this instead of hardcoding 'text-embedding-004'
 */
export function getEmbeddingModel(): string {
  return EMBEDDING_MODEL;
}

/**
 * Get model for OpenAI fallback operations
 * Use this instead of hardcoding 'gpt-4o-mini'
 */
export function getOpenAIFallbackModel(): string {
  return OPENAI_FALLBACK_MODEL;
}

/**
 * Get model for evaluation tasks
 * Use this instead of hardcoding 'gemini-2.0-flash'
 */
export function getEvaluationModel(): string {
  return EVALUATION_MODEL;
}

/**
 * Get model for classification/routing tasks
 * Use this instead of hardcoding 'gemini-1.5-flash'
 */
export function getClassificationModel(): string {
  return CLASSIFICATION_MODEL;
}

/**
 * Get model for content generation (marketing, outreach)
 * Use this instead of hardcoding 'gemini-2.0-flash-exp'
 */
export function getContentGenerationModel(): string {
  return CONTENT_GENERATION_MODEL;
}

/**
 * Get model for light/fast tasks (humanization, expressions)
 * Use this instead of hardcoding 'gemini-2.0-flash-lite'
 */
export function getLightModel(): string {
  return LIGHT_MODEL;
}

/**
 * Get model for realtime/voice applications
 * Use this instead of hardcoding 'gemini-2.0-flash-exp'
 */
export function getRealtimeModel(): string {
  return REALTIME_MODEL;
}

/**
 * Get OpenAI realtime model
 * Use this instead of hardcoding 'gpt-realtime'
 */
export function getOpenAIRealtimeModel(): string {
  return OPENAI_REALTIME_MODEL;
}

/**
 * Get OpenAI high-quality model (for content generation)
 * Use this instead of hardcoding 'gpt-4o'
 */
export function getOpenAIQualityModel(): string {
  return OPENAI_QUALITY_MODEL;
}

// ============================================================================
// PURPOSE-SPECIFIC TEMPERATURE GETTERS
// ============================================================================

/** Get temperature for classification/analysis tasks */
export function getTempClassification(): number {
  return TEMP_CLASSIFICATION;
}

/** Get temperature for extraction/analytical tasks */
export function getTempExtraction(): number {
  return TEMP_EXTRACTION;
}

/** Get temperature for reasoning/generation tasks */
export function getTempReasoning(): number {
  return TEMP_REASONING;
}

/** Get temperature for content/creative tasks */
export function getTempContent(): number {
  return TEMP_CONTENT;
}

/** Get temperature for creative/expressive tasks */
export function getTempCreative(): number {
  return TEMP_CREATIVE;
}

/** Get temperature for balanced tasks */
export function getTempBalanced(): number {
  return TEMP_BALANCED;
}

// ============================================================================
// PURPOSE-SPECIFIC MAX TOKENS GETTERS
// ============================================================================

/** Get max tokens for tiny responses */
export function getMaxTokensTiny(): number {
  return MAX_TOKENS_TINY;
}

/** Get max tokens for short responses */
export function getMaxTokensShort(): number {
  return MAX_TOKENS_SHORT;
}

/** Get max tokens for medium responses */
export function getMaxTokensMedium(): number {
  return MAX_TOKENS_MEDIUM;
}

/** Get max tokens for standard responses */
export function getMaxTokensStandard(): number {
  return MAX_TOKENS_STANDARD;
}

/** Get max tokens for long responses */
export function getMaxTokensLong(): number {
  return MAX_TOKENS_LONG;
}

/** Get max tokens for extended responses */
export function getMaxTokensExtended(): number {
  return MAX_TOKENS_EXTENDED;
}

// ============================================================================
// STARTUP LOG
// ============================================================================

// Log config on module load (for debugging)
if (process.env.NODE_ENV !== 'test') {
  log.info(
    {
      useVertexAI: USE_VERTEX_AI,
      project: GOOGLE_CLOUD_PROJECT || '(not set)',
      location: GOOGLE_CLOUD_LOCATION,
      model: GEMINI_MODEL,
      temperature: GEMINI_TEMPERATURE,
      timeoutMs: LLM_TIMEOUT_MS,
      hasApiKey: !!GEMINI_API_KEY,
      status: getGeminiConfigStatus(),
      purposeModels: {
        extraction: EXTRACTION_MODEL,
        embedding: EMBEDDING_MODEL,
        openAIFallback: OPENAI_FALLBACK_MODEL,
        openAIQuality: OPENAI_QUALITY_MODEL,
        evaluation: EVALUATION_MODEL,
        classification: CLASSIFICATION_MODEL,
        contentGeneration: CONTENT_GENERATION_MODEL,
        light: LIGHT_MODEL,
        realtime: REALTIME_MODEL,
      },
      temperatures: {
        classification: TEMP_CLASSIFICATION,
        extraction: TEMP_EXTRACTION,
        balanced: TEMP_BALANCED,
        reasoning: TEMP_REASONING,
        content: TEMP_CONTENT,
        creative: TEMP_CREATIVE,
      },
      maxTokens: {
        tiny: MAX_TOKENS_TINY,
        short: MAX_TOKENS_SHORT,
        medium: MAX_TOKENS_MEDIUM,
        standard: MAX_TOKENS_STANDARD,
        long: MAX_TOKENS_LONG,
        extended: MAX_TOKENS_EXTENDED,
      },
    },
    '📋 Gemini configuration loaded'
  );
}
