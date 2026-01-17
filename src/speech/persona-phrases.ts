/**
 * Persona Phrases - Single Source of Truth
 *
 * All persona-specific phrases consolidated in one place.
 * This prevents duplication across backchanneling, response-naturalness, etc.
 *
 * INTEGRATION: Uses ProcessingIntelligence for thinking/processing phrases
 * when contextual composition is needed. Legacy THINKING_FILLERS are kept
 * for backward compatibility.
 *
 * NOTE: This file re-exports from the persona-phrases/ subdirectory.
 * The module has been split for better maintainability.
 *
 * @module persona-phrases
 */

// Re-export everything from the subdirectory
export * from './persona-phrases/index.js';
export { default } from './persona-phrases/index.js';
