/**
 * Centralized Gemini/Vertex AI Configuration
 *
 * ONE SOURCE OF TRUTH for all Gemini API usage across the codebase.
 * All services should import from here instead of reading env vars directly.
 *
 * @module config/gemini-config
 */
/**
 * USE_VERTEX_AI - The ONE flag to control Vertex AI vs Gemini API
 *
 * - true (default): Use Vertex AI (higher quotas, no 429 rate limits)
 * - false: Use Gemini API with API key
 */
export declare const USE_VERTEX_AI: boolean;
/** Google Cloud Project ID (required for Vertex AI) */
export declare const GOOGLE_CLOUD_PROJECT: string | undefined;
/** Google Cloud Location (default: us-central1) */
export declare const GOOGLE_CLOUD_LOCATION: string;
/** Gemini API Key (for non-Vertex AI usage) */
export declare const GEMINI_API_KEY: string | undefined;
/** Alias for backward compatibility */
export declare const GOOGLE_API_KEY: string | undefined;
/** Default Gemini model (from .env or fallback) */
export declare const GEMINI_MODEL: string;
/** Default temperature for generation (0.0 - 2.0) */
export declare const GEMINI_TEMPERATURE: number;
/** Low temperature for consistent/deterministic output (routing, classification) */
export declare const GEMINI_TEMPERATURE_LOW: number;
/** High temperature for creative output (expressions, stories) */
export declare const GEMINI_TEMPERATURE_HIGH: number;
/** Default max output tokens */
export declare const GEMINI_MAX_OUTPUT_TOKENS: number;
/** Short max tokens for quick responses */
export declare const GEMINI_MAX_OUTPUT_TOKENS_SHORT: number;
/** Long max tokens for detailed responses */
export declare const GEMINI_MAX_OUTPUT_TOKENS_LONG: number;
/** Default language */
export declare const GEMINI_LANGUAGE: string;
/** Standard LLM timeout (5s default) */
export declare const LLM_TIMEOUT_MS: number;
/** Short LLM timeout for fast operations (2s default) */
export declare const LLM_SHORT_TIMEOUT_MS: number;
/** Check if Gemini is properly configured */
export declare function isGeminiConfigured(): boolean;
/** Get a human-readable config status */
export declare function getGeminiConfigStatus(): string;
/**
 * Get a configured GoogleGenAI client
 *
 * This is the ONLY place that creates Gemini clients.
 * All services should use this instead of creating their own.
 *
 * @returns GoogleGenAI client or null if not configured
 */
export declare function getGeminiClient(): Promise<unknown | null>;
/**
 * Reset the cached client (useful for testing or config changes)
 */
export declare function resetGeminiClient(): void;
/** Alias for backward compatibility */
export declare const createGeminiClient: typeof getGeminiClient;
/** Get the default model name */
export declare function getDefaultModel(): string;
/** Get the LLM timeout */
export declare function getLLMTimeout(): number;
/** Get the short LLM timeout */
export declare function getShortLLMTimeout(): number;
//# sourceMappingURL=gemini-config.d.ts.map