/**
 * Test LLM Configuration
 *
 * Centralizes LLM model selection for synthetic tests.
 * Uses TEST_LLM_MODEL env var, defaulting to gemini-3-flash-preview.
 *
 * @module test-llm-config
 */

/**
 * LLM model for synthetic testing
 * - Set TEST_LLM_MODEL env var to override
 * - Default: gemini-3-flash-preview (Gemini 3 Flash, released Dec 2024)
 *
 * Available models:
 * - gemini-3-flash-preview: Latest, fastest (recommended for tests)
 * - gemini-2.0-flash-exp: Experimental 2.0 features
 * - gemini-1.5-flash-latest: Stable, fast
 * - gemini-1.5-pro-latest: Higher quality, slower
 */
export const TEST_LLM_MODEL = process.env.TEST_LLM_MODEL || 'gemini-3-flash-preview';

/**
 * Default timeout for LLM calls in tests (30 seconds)
 */
export const LLM_TEST_TIMEOUT = 30000;

/**
 * Rate limiting delay between LLM calls (for quota management)
 */
export const LLM_CALL_DELAY_MS = 500;
