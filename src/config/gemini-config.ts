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
// TIMEOUT CONFIGURATION (from .env)
// ============================================================================

/** Standard LLM timeout (5s default) */
export const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '5000', 10);

/** Short LLM timeout for fast operations (2s default) */
export const LLM_SHORT_TIMEOUT_MS = parseInt(process.env.LLM_SHORT_TIMEOUT_MS || '2000', 10);

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
    },
    '📋 Gemini configuration loaded'
  );
}
