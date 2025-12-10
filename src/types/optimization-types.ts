/**
 * Optimization Types - Shared types for feedback/recommendation systems
 *
 * This file contains shared types used by both:
 * - src/services/optimization-persistence.ts
 * - src/tools/feedback-collector.ts
 * - src/tools/recommendation-engine.ts
 *
 * Extracted to avoid circular dependencies between services and tools.
 */

// ============================================================================
// FEEDBACK TYPES
// ============================================================================

export type FeedbackType =
  | 'explicit_positive' // User said something positive
  | 'explicit_negative' // User said something negative
  | 'explicit_rating' // User gave a rating
  | 'implicit_success' // Tool worked (inferred from behavior)
  | 'implicit_failure' // Tool didn't work (inferred)
  | 'implicit_retry' // User tried again
  | 'implicit_abandon' // User gave up
  | 'implicit_followup' // User needed clarification
  | 'feature_request'; // User asked for something we don't have

export interface FeedbackRecord {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  agentId: string;

  // What was the feedback about?
  toolId: string | null;
  domain: string | null;

  // Feedback details
  type: FeedbackType;
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 to 1 normalized

  // Context
  userMessage: string;
  toolResult?: string;

  // For feature requests
  requestedCapability?: string;

  // Metadata
  turnNumber: number;
  conversationLength: number;
}

export interface FeedbackSummary {
  toolId: string;
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  averageScore: number;
  retryRate: number;
  abandonRate: number;
  featureRequests: string[];
}

// ============================================================================
// RECOMMENDATION TYPES
// ============================================================================

export type RecommendationType =
  | 'create_tool'
  | 'consolidate_tools'
  | 'deprecate_tool'
  | 'run_experiment'
  | 'improve_tool'
  | 'add_domain'
  | 'modify_loading';

export interface Evidence {
  type: 'usage_data' | 'feedback' | 'pattern' | 'experiment_result';
  summary: string;
  dataPoints: number;
  confidence: number;
}

export interface ImpactAssessment {
  userExperience: 'positive' | 'neutral' | 'negative';
  toolCount: number; // Change in tool count
  complexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  estimatedBenefit: string;
}

export interface ImplementationGuide {
  steps: string[];
  estimatedEffort: 'hours' | 'days' | 'weeks';
  requiredChanges: string[];
  testingStrategy: string;
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  rationale: string;
  evidence: Evidence[];
  impact: ImpactAssessment;
  implementation: ImplementationGuide;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
}
