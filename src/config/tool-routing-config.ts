/**
 * FTIS Configuration
 *
 * Configuration for the Ferni Tool Intelligence System (FTIS).
 * FTIS uses a two-stage hierarchical ONNX classifier to route user intents
 * to tools without relying on LLM native function calling.
 *
 * Architecture:
 *   Stage 1: User query → domain (44 domains, e.g., "music_audio", "calendar")
 *   Stage 2: "[domain] query" → meta-tool (112 tools, e.g., "music.play")
 *   Combined confidence = domain_confidence × meta_tool_confidence
 *
 * Placed in config/ (level 10) so both services and agents can import.
 * Whether FTIS is on: isFtisEnabled() in config/tool-config.ts.
 *
 * @module config/tool-routing-config
 */

// ============================================================================
// FTIS CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Confidence threshold for direct execution.
 * When FTIS classification confidence exceeds this threshold,
 * tools are executed directly without LLM confirmation.
 */
export const FTIS_DIRECT_EXECUTION_THRESHOLD = 0.85;

/**
 * Minimum confidence for tool hints.
 * Below this threshold, no tool hints are provided to the LLM.
 */
export const FTIS_TOOL_HINT_THRESHOLD = 0.5;
