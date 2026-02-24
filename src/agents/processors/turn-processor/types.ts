/**
 * Turn Processor - Local Types
 *
 * Types specific to the turn processor orchestration.
 * Shared types live in ../types.ts
 */

import type { ContextInjection, TrustContextSummary } from '../types.js';

/**
 * Result from building context injections
 */
export interface ContextInjectionsResult {
  /** All context injections for LLM */
  injections: ContextInjection[];
  /** Trust context summary for post-response monitoring */
  trustContextSummary: TrustContextSummary;
}
