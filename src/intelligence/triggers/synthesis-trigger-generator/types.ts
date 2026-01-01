/**
 * Synthesis Trigger Generator Types
 *
 * Type definitions for the trigger generation system.
 *
 * @module synthesis-trigger-generator/types
 */

import type { LifeContextSnapshot, SynthesisTrigger } from '../life-context-snapshot.js';

/**
 * Template for generating synthesis triggers
 */
export interface TriggerTemplate {
  /** Unique identifier for the trigger */
  id: string;
  /** Category of support this trigger provides */
  category: SynthesisTrigger['category'];
  /** Priority level */
  priority: SynthesisTrigger['priority'];
  /** Condition function that evaluates whether to fire */
  condition: (snapshot: LifeContextSnapshot) => {
    matches: boolean;
    confidence: number;
    reasoning: string;
  };
  /** Array of possible responses to select from */
  suggestedResponses: string[];
  /** Which persona should handle this trigger */
  recommendedPersona: string;
  /** Which domains contribute to this trigger */
  contributingDomains: string[];
}

/**
 * Analytics data structure
 */
export interface SynthesisAnalytics {
  totalTriggersGenerated: number;
  byCategory: Record<SynthesisTrigger['category'], number>;
  byPriority: Record<SynthesisTrigger['priority'], number>;
  byPersona: Record<string, number>;
  averageConfidence: number;
  mostCommonTriggers: Array<{ id: string; count: number }>;
}

/**
 * Internal analytics state
 */
export interface AnalyticsState {
  triggerCounts: Record<string, number>;
  totalGenerated: number;
  categoryBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  personaBreakdown: Record<string, number>;
  confidenceSum: number;
}
