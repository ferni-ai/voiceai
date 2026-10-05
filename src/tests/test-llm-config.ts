/**
 * Test LLM Configuration
 *
 * Centralizes LLM model selection for synthetic tests.
 * Uses TEST_LLM_MODEL env var, defaulting to gemini-3.5-flash.
 *
 * @module test-llm-config
 */

/**
 * LLM model for synthetic testing
 * - Set TEST_LLM_MODEL env var to override
 * - Default: gemini-3.5-flash
 *
 * Served on the Vertex global location (GEMINI_LOCATION) and the Gemini API.
 */
export const TEST_LLM_MODEL = process.env.TEST_LLM_MODEL || 'gemini-3.5-flash';

/**
 * Default timeout for LLM calls in tests (30 seconds)
 */
export const LLM_TEST_TIMEOUT = 30000;

/**
 * Rate limiting delay between LLM calls (for quota management)
 */
export const LLM_CALL_DELAY_MS = 500;
