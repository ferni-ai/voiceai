/**
 * Injection Helper Functions
 *
 * Factory functions for creating context injections with proper typing.
 *
 * @module context-builders/core/injection-helpers
 */

import type { ContextInjection, ContextPriority } from './types.js';

// ============================================================================
// INJECTION COUNTER
// ============================================================================

let counter = 0;

/**
 * Reset injection counter (for testing)
 */
export function resetInjectionCounter(): void {
  counter = 0;
}

// ============================================================================
// INJECTION FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a context injection with full customization
 */
export function createInjection(
  source: string,
  content: string,
  priority: ContextPriority,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return {
    id: `${source}_${++counter}`,
    source,
    content,
    priority,
    category: options?.category,
    confidence: options?.confidence ?? 1.0,
  };
}

/**
 * Create a critical priority injection (must follow - safety)
 */
export function createCriticalInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'critical', options);
}

/**
 * BETTER-THAN-HUMAN: High priority for important trust signals
 * Use this for emotional mismatch detection and similar "superhuman" insights
 */
export function createHighInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'high', options);
}

/**
 * Create a standard priority injection (default)
 */
export function createStandardInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'standard', options);
}

/**
 * Create a hint priority injection (nice to have)
 */
export function createHintInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'hint', options);
}
