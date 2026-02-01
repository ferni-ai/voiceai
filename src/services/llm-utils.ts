/**
 * LLM Utility Functions
 *
 * Provides supplementary LLM capabilities for:
 * - Emotion inference (when keyword detection is uncertain)
 * - Conversation summarization (richer than extraction)
 * - Intent disambiguation
 * - Context enrichment
 *
 * These are NOT for main conversation - that goes through the realtime model.
 * These are for background analysis that enhances the agent's understanding.
 *
 * Uses Vertex AI (enterprise tier) for higher quotas than consumer Google AI API.
 *
 * @module services/llm-utils
 */

import {
  getExtractionModel,
  getGeminiClient,
  getOpenAIFallbackModel,
  LLM_TIMEOUT_MS,
  MAX_TOKENS_MEDIUM,
  TEMP_EXTRACTION,
} from '../config/gemini-config.js';
import {
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_RESET_TIMEOUT_MS,
  CIRCUIT_SUCCESS_THRESHOLD,
} from '../config/resilience-config.js';
import { CircuitOpenError, getCircuitBreaker } from '../utils/circuit-breaker.js';
import { getLogger } from '../utils/safe-logger.js';

// Check if Vertex AI is explicitly enabled
const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';

// ============================================================================
// CIRCUIT BREAKERS
// ============================================================================

const vertexAICircuitBreaker = getCircuitBreaker('vertex-ai', {
  failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
  resetTimeout: CIRCUIT_RESET_TIMEOUT_MS,
  successThreshold: CIRCUIT_SUCCESS_THRESHOLD,
});

const openAICircuitBreaker = getCircuitBreaker('openai', {
  failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
  resetTimeout: CIRCUIT_RESET_TIMEOUT_MS,
  successThreshold: CIRCUIT_SUCCESS_THRESHOLD,
});

// ============================================================================
// TYPES
// ============================================================================

export type LLMProvider = 'vertex' | 'openai' | 'anthropic';

export interface LLMCallOptions {
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

// ============================================================================
// VERTEX AI (Primary) - Enterprise tier with higher quotas
// ============================================================================

interface VertexAIClient {
  getGenerativeModel: (config: { model: string }) => {
    generateContent: (params: {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      generationConfig?: { maxOutputTokens?: number; temperature?: number };
    }) => Promise<{
      response: {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
    }>;
  };
}

let vertexAIClient: VertexAIClient | null = null;
// FIX: Use Promise-based singleton to prevent race condition
// When multiple callers invoke getVertexAIClient() concurrently,
// they all wait for the same initialization promise instead of each starting their own
let vertexAIClientInitPromise: Promise<VertexAIClient | null> | null = null;

async function getVertexAIClient(): Promise<VertexAIClient | null> {
  // Fast path: return cached client
  if (vertexAIClient) return vertexAIClient;

  // If initialization is already in progress, wait for it
  if (vertexAIClientInitPromise) {
    return vertexAIClientInitPromise;
  }

  // Start initialization and store the promise so concurrent callers can wait
  vertexAIClientInitPromise = initializeVertexAIClient();
  return vertexAIClientInitPromise;
}

async function initializeVertexAIClient(): Promise<VertexAIClient | null> {
  try {
    const { VertexAI } = await import('@google-cloud/vertexai');

    // Use GCP project from environment (same as Firestore)
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT_ID ||
      'johnb-2025';
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

    getLogger().info({ projectId, location }, 'Initializing Vertex AI client...');
    vertexAIClient = new VertexAI({ project: projectId, location }) as unknown as VertexAIClient;
    getLogger().info('Vertex AI client initialized successfully (enterprise quotas)');
    return vertexAIClient;
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Failed to initialize Vertex AI client');
    // Clear promise so retry is possible
    vertexAIClientInitPromise = null;
    return null;
  }
}

/**
 * Call Vertex AI (Gemini) for supplementary analysis
 * Uses enterprise tier with much higher quotas than consumer API
 */
async function callVertexAI(prompt: string, options: LLMCallOptions = {}): Promise<string | null> {
  // Check circuit breaker first
  if (!vertexAICircuitBreaker.canRequest()) {
    getLogger().warn('Vertex AI circuit breaker is open, skipping request');
    return null;
  }

  try {
    const client = await getVertexAIClient();
    if (!client) {
      getLogger().warn('Vertex AI client is null - initialization failed');
      return null;
    }

    const {
      maxTokens = MAX_TOKENS_MEDIUM,
      temperature = TEMP_EXTRACTION,
      timeout = LLM_TIMEOUT_MS,
    } = options;

    // Use AbortController for timeout
    // eslint-disable-next-line no-undef
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await vertexAICircuitBreaker.execute(async () => {
        // Use Vertex AI SDK - extraction model for supplementary analysis
        // NOTE: Do NOT use getDefaultModel() as it may return a realtime-only model
        // that doesn't work with generateContent API
        const model = client.getGenerativeModel({ model: getExtractionModel() });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature,
          },
        });

        // Extract text from Vertex AI response
        const candidate = result.response?.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        return text?.trim() || null;
      });

      clearTimeout(timeoutId);
      return typeof response === 'string' ? response : null;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        getLogger().debug('LLM call timed out');
        return null;
      }
      if (error instanceof CircuitOpenError) {
        getLogger().debug('Vertex AI circuit breaker opened');
        return null;
      }
      throw error;
    }
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Vertex AI call failed');
    return null;
  }
}

// ============================================================================
// GEMINI API (Consumer tier - used when USE_VERTEX_AI=false)
// ============================================================================

const geminiAPICircuitBreaker = getCircuitBreaker('gemini-api', {
  failureThreshold: 3,
  resetTimeout: 30000,
  successThreshold: 2,
});

/**
 * Call Gemini API for supplementary analysis
 * Uses consumer tier (via centralized gemini-config client)
 */
async function callGeminiAPI(prompt: string, options: LLMCallOptions = {}): Promise<string | null> {
  // Check circuit breaker first
  if (!geminiAPICircuitBreaker.canRequest()) {
    getLogger().warn('Gemini API circuit breaker is open, skipping request');
    return null;
  }

  try {
    const client = await getGeminiClient();
    if (!client) {
      getLogger().warn('Gemini API client is null - not configured');
      return null;
    }

    const {
      maxTokens = MAX_TOKENS_MEDIUM,
      temperature = TEMP_EXTRACTION,
      timeout = LLM_TIMEOUT_MS,
    } = options;

    // Use AbortController for timeout
    // eslint-disable-next-line no-undef
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await geminiAPICircuitBreaker.execute(async () => {
        // Use centralized Gemini client (respects USE_VERTEX_AI setting)
        // NOTE: Use extraction model, NOT default model (may be realtime-only)
        const model = (
          client as {
            models: {
              generateContent: (params: {
                model: string;
                contents: string;
                config?: { maxOutputTokens?: number; temperature?: number };
              }) => Promise<{ text?: string }>;
            };
          }
        ).models.generateContent({
          model: getExtractionModel(),
          contents: prompt,
          config: {
            maxOutputTokens: maxTokens,
            temperature,
          },
        });
        const result = await model;
        return result?.text?.trim() || null;
      });

      clearTimeout(timeoutId);
      return typeof response === 'string' ? response : null;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        getLogger().debug('Gemini API call timed out');
        return null;
      }
      if (error instanceof CircuitOpenError) {
        getLogger().debug('Gemini API circuit breaker opened');
        return null;
      }
      throw error;
    }
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Gemini API call failed');
    return null;
  }
}

// ============================================================================
// OPENAI (Fallback)
// ============================================================================

let openAIClient: unknown = null;
// FIX: Use Promise-based singleton to prevent race condition (same pattern as Vertex AI)
let openAIClientInitPromise: Promise<unknown> | null = null;

async function getOpenAIClient(): Promise<unknown> {
  // Fast path: return cached client
  if (openAIClient) return openAIClient;

  // If initialization is already in progress, wait for it
  if (openAIClientInitPromise) {
    return openAIClientInitPromise;
  }

  // Start initialization and store the promise
  openAIClientInitPromise = initializeOpenAIClient();
  return openAIClientInitPromise;
}

async function initializeOpenAIClient(): Promise<unknown> {
  try {
    const OpenAI = (await import('openai')).default;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      openAIClientInitPromise = null;
      return null;
    }

    openAIClient = new OpenAI({ apiKey });
    return openAIClient;
  } catch {
    openAIClientInitPromise = null;
    return null;
  }
}

async function callOpenAI(prompt: string, options: LLMCallOptions = {}): Promise<string | null> {
  // Check circuit breaker first
  if (!openAICircuitBreaker.canRequest()) {
    getLogger().debug('OpenAI circuit breaker is open, skipping request');
    return null;
  }

  try {
    const client = await getOpenAIClient();
    if (!client) return null;

    const { maxTokens = 500, temperature = 0.3, timeout = 5000 } = options;

    const response = await Promise.race([
      openAICircuitBreaker.execute(async () => {
        return (
          client as {
            chat: {
              completions: {
                create: (params: {
                  model: string;
                  messages: Array<{ role: string; content: string }>;
                  max_tokens: number;
                  temperature: number;
                }) => Promise<{ choices: Array<{ message: { content: string } }> }>;
              };
            };
          }
        ).chat.completions.create({
          model: getOpenAIFallbackModel(),
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
        });
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeout);
      }),
    ]);

    if (!response) return null;
    return response.choices[0]?.message?.content || null;
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      getLogger().debug('OpenAI circuit breaker opened');
      return null;
    }
    getLogger().debug({ error: String(error) }, 'OpenAI call failed');
    return null;
  }
}

// ============================================================================
// UNIFIED LLM CALL
// ============================================================================

/**
 * Make a supplementary LLM call with automatic fallback
 *
 * Priority depends on USE_VERTEX_AI setting:
 * - If USE_VERTEX_AI=true (default): Vertex AI → OpenAI → null
 * - If USE_VERTEX_AI=false: Gemini API (consumer) → OpenAI → null
 *
 * Use this for:
 * - Emotion inference when keyword detection is uncertain
 * - Conversation summarization
 * - Intent disambiguation
 *
 * DO NOT use for main conversation responses (those go through realtime model)
 */
export async function callLLM(
  prompt: string,
  options: LLMCallOptions = {}
): Promise<string | null> {
  if (USE_VERTEX_AI) {
    // Try Vertex AI first (enterprise tier with higher quotas)
    const vertexResult = await callVertexAI(prompt, options);
    if (vertexResult) return vertexResult;
  } else {
    // USE_VERTEX_AI=false: Use consumer Gemini API
    const geminiResult = await callGeminiAPI(prompt, options);
    if (geminiResult) return geminiResult;
  }

  // Fall back to OpenAI
  const openAIResult = await callOpenAI(prompt, options);
  if (openAIResult) return openAIResult;

  getLogger().debug('All LLM providers failed or unavailable');
  return null;
}

/**
 * Make an LLM call that expects JSON response
 * Parses the response and returns the object
 */
export async function callLLMForJSON<T>(
  prompt: string,
  options: LLMCallOptions = {}
): Promise<T | null> {
  const response = await callLLM(prompt, options);
  if (!response) return null;

  try {
    // Extract JSON from response (might have markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      getLogger().debug('LLM response did not contain JSON');
      return null;
    }

    return JSON.parse(jsonMatch[0]) as T;
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Failed to parse LLM JSON response');
    return null;
  }
}

// ============================================================================
// SPECIALIZED LLM FUNCTIONS
// ============================================================================

/**
 * Create LLM call function for emotion detection
 * This can be passed to EmotionDetector.detectWithLLM()
 */
export function createEmotionLLMCaller(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const result = await callLLM(prompt, {
      maxTokens: 200,
      temperature: 0.2,
      timeout: 3000,
    });
    return result || '';
  };
}

/**
 * Create LLM call function for summarization
 * This can be passed to summarizeWithLLM()
 */
export function createSummarizationLLMCaller(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const result = await callLLM(prompt, {
      maxTokens: 1000,
      temperature: 0.4,
      timeout: 10000,
    });
    return result || '';
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize LLM utilities
 * Checks for available clients and initializes them
 */
export async function initializeLLMUtils(): Promise<{
  vertexAI: boolean;
  openAI: boolean;
}> {
  if (initialized) {
    return {
      vertexAI: vertexAIClient !== null,
      openAI: openAIClient !== null,
    };
  }

  const vertexAI = (await getVertexAIClient()) !== null;
  const openAI = (await getOpenAIClient()) !== null;

  initialized = true;

  getLogger().info(
    {
      vertexAI,
      openAI,
      anyAvailable: vertexAI || openAI,
    },
    'LLM utilities initialized (using Vertex AI enterprise tier)'
  );

  return { vertexAI, openAI };
}

export default {
  callLLM,
  callLLMForJSON,
  createEmotionLLMCaller,
  createSummarizationLLMCaller,
  initializeLLMUtils,
};
