/**
 * Behavioral Context Orchestrator
 *
 * Produces the behavioral directive: a structured instruction that tells the
 * model HOW to behave, not facts about the user that might leak.
 *
 * No behavioral builder feeds it today (the builder registry was never loaded
 * on the live path and has been removed), so the directive is the aggregator's
 * default style.
 *
 * @module intelligence/context-builders/behavioral/orchestrator
 */

import {
  aggregateBehavior,
  formatBehavioralDirective,
  formatForSystemPrompt,
  type AggregatedBehavior,
} from './aggregator.js';

export interface BehavioralResult {
  /** The aggregated behavior */
  behavior: AggregatedBehavior;

  /** Formatted directive for the prompt */
  directive: string;

  /** Compact format for system prompt */
  compactDirective: string;
}

/**
 * Build the behavioral directive.
 */
export function buildBehavioralContext(): BehavioralResult {
  const behavior = aggregateBehavior([]);
  return {
    behavior,
    directive: formatBehavioralDirective(behavior),
    compactDirective: formatForSystemPrompt(behavior),
  };
}
