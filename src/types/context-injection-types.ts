/**
 * Context Injection Types
 *
 * Shared types for context injection system used by:
 * - agents/processors (level 100)
 * - intelligence/context-routing (level 70)
 * - intelligence/context-builders (level 70)
 *
 * Placed in types/ (level 10) to avoid architecture layer violations.
 *
 * @module types/context-injection-types
 */

// ============================================================================
// CONTEXT INJECTIONS - Guidance for LLM
// ============================================================================

/**
 * A single context injection to add to the LLM prompt
 */
export interface ContextInjection {
  /** Category of the injection (for filtering/logging) */
  category: string;
  /** The injection content */
  content: string;
  /** Priority (higher = more important) */
  priority: number;
}
