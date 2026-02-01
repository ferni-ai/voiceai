/**
 * FTIS Configuration
 *
 * Configuration for the Ferni Tool Intelligence System (FTIS).
 * Placed in config/ (level 10) so both services and agents can import.
 *
 * @module config/tool-routing-config
 */

// ============================================================================
// FTIS V2 MODE
// ============================================================================

/**
 * Environment flag for FTIS V2 only mode.
 *
 * **ENABLED BY DEFAULT** (Jan 2026)
 *
 * When enabled (default):
 * - FTIS V2 handles ALL tool classification
 * - LLM doesn't use native function calling
 * - JSON workaround is disabled
 * - Tools execute directly based on classification
 *
 * To disable: Set `FTIS_V2_ONLY_MODE=false`
 */
export function isFTISV2OnlyMode(): boolean {
  // FTIS V2 is now DISABLED BY DEFAULT (Jan 2026)
  // JSON workaround is more reliable for Gemini Live
  // Semantic router still pre-filters tools (800 → 15-30)
  //
  // Enable with: FTIS_V2_ONLY_MODE=true
  if (process.env.FTIS_V2_ONLY_MODE === 'true') {
    return true;
  }
  // Default: disabled - use JSON workaround + semantic router
  return false;
}

// ============================================================================
// FTIS CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Confidence threshold for direct execution.
 * When FTIS V2 classification confidence exceeds this threshold,
 * tools are executed directly without LLM confirmation.
 */
export const FTIS_DIRECT_EXECUTION_THRESHOLD = 0.85;

/**
 * Minimum confidence for tool hints.
 * Below this threshold, no tool hints are provided to the LLM.
 */
export const FTIS_TOOL_HINT_THRESHOLD = 0.5;
