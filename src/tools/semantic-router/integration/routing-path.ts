/**
 * The routing path a turn took, and its human-readable descriptions (observability).
 *
 * @module tools/semantic-router/integration/routing-path
 */

/**
 * Routing path type for observability
 */
export type RoutingPath =
  | 'semantic_auto_execute' // Semantic router auto-executed (LLM bypassed)
  | 'semantic_hint' // Semantic router hinted to LLM
  | 'semantic_confirm' // Semantic router requested confirmation
  | 'semantic_conversation' // Semantic router determined no tool needed
  | 'json_fallback' // Fell back to JSON workaround
  | 'disabled' // Semantic routing disabled
  | 'error'; // Routing error

/**
 * Human-readable description of each routing path.
 * Useful for logging and debugging.
 */
const ROUTING_PATH_DESCRIPTIONS: Record<RoutingPath, string> = {
  semantic_auto_execute: '🚀 Semantic Router auto-executed tool (LLM bypassed)',
  semantic_hint: '💡 Semantic Router hinted tool to LLM',
  semantic_confirm: '❓ Semantic Router requested user confirmation',
  semantic_conversation: '💬 Semantic Router: pure conversation (no tool)',
  json_fallback: '🔄 JSON Workaround (LLM function calling)',
  disabled: '⚠️ Semantic routing disabled',
  error: '❌ Routing error occurred',
};

/**
 * Get a human-readable summary of the routing path
 *
 * @param path - The routing path taken
 * @param toolId - Optional tool ID if a tool was involved
 * @param confidence - Optional confidence score
 */
export function getRoutingPathSummary(
  path: RoutingPath,
  toolId?: string,
  confidence?: number
): string {
  const base = ROUTING_PATH_DESCRIPTIONS[path];

  if (toolId && confidence !== undefined) {
    return `${base} - ${toolId} (${(confidence * 100).toFixed(0)}% confidence)`;
  }

  if (toolId) {
    return `${base} - ${toolId}`;
  }

  return base;
}
