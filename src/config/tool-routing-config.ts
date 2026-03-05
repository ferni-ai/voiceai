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
 *
 * @module config/tool-routing-config
 */

// ============================================================================
// FTIS MODE
// ============================================================================

/**
 * Whether FTIS is enabled for tool routing.
 *
 * **CURRENTLY DISABLED BY DEFAULT** for troubleshooting (Ferni not talking).
 * Set FTIS_ENABLED=true to re-enable the two-stage hierarchical router.
 *
 * When enabled:
 * - FTIS handles ALL tool classification (two-stage hierarchical)
 * - LLM doesn't use native function calling
 * - JSON workaround is disabled
 * - Tools execute directly based on classification confidence
 *
 * When disabled (current default):
 * - LLM uses native function calling (or JSON workaround with Gemini)
 * - Tool routing goes through normal LLM flow
 */
export function isFTISEnabled(): boolean {
  if (process.env.FTIS_ENABLED === 'true') {
    return true;
  }
  return false;
}

/**
 * @deprecated Use isFTISEnabled() instead. Kept for backward compatibility.
 */
export function isFTISV2OnlyMode(): boolean {
  return isFTISEnabled();
}

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
