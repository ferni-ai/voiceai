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
 * @module services/llm-utils
 */

import { getLogger } from '../utils/safe-logger.js';
import { getCircuitBreaker, CircuitOpenError } from '../utils/circuit-breaker.js';

// ============================================================================
// CIRCUIT BREAKERS
// ============================================================================

const googleAICircuitBreaker = getCircuitBreaker('google-ai', {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
});

const openAICircuitBreaker = getCircuitBreaker('openai', {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
});

// ============================================================================
// TYPES
// ============================================================================

export type LLMProvider = 'google' | 'openai' | 'anthropic';

export interface LLMCallOptions {
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

// ============================================================================
// GOOGLE AI (Primary)
// ============================================================================

let googleAIClient: unknown = null;

async function getGoogleAIClient(): Promise<unknown> {
  if (googleAIClient) return googleAIClient;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      getLogger().warn('No Google AI API key found, LLM utilities will be disabled');
      return null;
    }

    googleAIClient = new GoogleGenAI({ apiKey });
    return googleAIClient;
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Failed to initialize Google AI client');
    return null;
  }
}

/**
 * Call Google AI (Gemini) for supplementary analysis
 */
async function callGoogleAI(prompt: string, options: LLMCallOptions = {}): Promise<string | null> {
  // Check circuit breaker first
  if (!googleAICircuitBreaker.canRequest()) {
    getLogger().debug('Google AI circuit breaker is open, skipping request');
    return null;
  }

  try {
    const client = await getGoogleAIClient();
    if (!client) return null;

    const { maxTokens = 500, temperature = 0.3, timeout = 5000 } = options;

    // Use AbortController for timeout
    // eslint-disable-next-line no-undef
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await googleAICircuitBreaker.execute(async () => {
        // Get the generative model
        const model = (
          client as {
            getGenerativeModel: (params: { model: string }) => {
              generateContent: (
                contents: string,
                config?: { maxOutputTokens: number; temperature: number }
              ) => Promise<{ response: { text: () => string } }>;
            };
          }
        ).getGenerativeModel({ model: 'gemini-1.5-flash' });

        const result = await model.generateContent(prompt, {
          maxOutputTokens: maxTokens,
          temperature,
        });
        return result;
      });

      clearTimeout(timeoutId);
      // Access text via response.text() method
      return response?.response?.text?.() || null;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        getLogger().debug('LLM call timed out');
        return null;
      }
      if (error instanceof CircuitOpenError) {
        getLogger().debug('Google AI circuit breaker opened');
        return null;
      }
      throw error;
    }
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Google AI call failed');
    return null;
  }
}

// ============================================================================
// OPENAI (Fallback)
// ============================================================================

let openAIClient: unknown = null;

async function getOpenAIClient(): Promise<unknown> {
  if (openAIClient) return openAIClient;

  try {
    const OpenAI = (await import('openai')).default;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return null;
    }

    openAIClient = new OpenAI({ apiKey });
    return openAIClient;
  } catch {
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
          model: 'gpt-4o-mini',
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
 * Priority: Google AI → OpenAI → null
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
  // Try Google AI first (faster, cheaper)
  const googleResult = await callGoogleAI(prompt, options);
  if (googleResult) return googleResult;

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
 * Checks for available API keys and initializes clients
 */
export async function initializeLLMUtils(): Promise<{
  googleAI: boolean;
  openAI: boolean;
}> {
  if (initialized) {
    return {
      googleAI: googleAIClient !== null,
      openAI: openAIClient !== null,
    };
  }

  const googleAI = (await getGoogleAIClient()) !== null;
  const openAI = (await getOpenAIClient()) !== null;

  initialized = true;

  getLogger().info(
    {
      googleAI,
      openAI,
      anyAvailable: googleAI || openAI,
    },
    'LLM utilities initialized'
  );

  return { googleAI, openAI };
}

export default {
  callLLM,
  callLLMForJSON,
  createEmotionLLMCaller,
  createSummarizationLLMCaller,
  initializeLLMUtils,
};
