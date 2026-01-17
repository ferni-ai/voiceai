/**
 * Shared Types for Intelligence Worker
 *
 * These types are shared between the voice agent and intelligence worker
 * to ensure type safety across service boundaries.
 *
 * @module @ferni/shared-types/intelligence
 */

// ============================================================================
// PATTERN DETECTION
// ============================================================================

export interface PatternDetectionPayload {
  userId: string;
  transcript: string;
  topic: string;
  emotion: string;
  timestamp?: number;
  sessionId?: string;
}

export interface PatternDetectionResult {
  patternId: string;
  type: 'behavioral' | 'emotional' | 'conversational' | 'temporal';
  confidence: number;
  description: string;
  actionable: boolean;
}

// ============================================================================
// PREDICTIVE INTELLIGENCE
// ============================================================================

export interface PredictiveIntelligencePayload {
  userId: string;
  context: string;
  recentTopics: string[];
  emotionalTrend: string;
  timestamp?: number;
  sessionId?: string;
}

export interface PredictiveIntelligenceResult {
  predictionId: string;
  predictions: Array<{
    type: string;
    likelihood: number;
    description: string;
    suggestedAction?: string;
  }>;
}

// ============================================================================
// KEY MOMENT DETECTION
// ============================================================================

export interface KeyMomentPayload {
  userId: string;
  transcript: string;
  emotion: string;
  intensity: number;
  topic: string;
  timestamp?: number;
  sessionId?: string;
}

export interface KeyMomentResult {
  momentId: string;
  type: 'breakthrough' | 'vulnerable' | 'celebratory' | 'reflective' | 'milestone';
  significance: number;
  description: string;
  saved: boolean;
}

// ============================================================================
// TRUST RECORDING
// ============================================================================

export interface TrustRecordingPayload {
  userId: string;
  personaId: string;
  trustSignal: string;
  signalType: 'positive' | 'neutral' | 'negative';
  context: string;
  timestamp?: number;
  sessionId?: string;
}

export interface TrustRecordingResult {
  recorded: boolean;
  trustLevel: number;
  delta: number;
}

// ============================================================================
// RESPONSE QUALITY
// ============================================================================

export interface ResponseQualityPayload {
  userId: string;
  sessionId: string;
  responseId: string;
  latencyMs: number;
  userSatisfaction?: number;
  turnCount: number;
  personaId: string;
  timestamp?: number;
}

export interface ResponseQualityResult {
  qualityScore: number;
  factors: Array<{
    name: string;
    score: number;
    weight: number;
  }>;
}

// ============================================================================
// GENERIC EVENT WRAPPER
// ============================================================================

export interface IntelligenceEvent<T = unknown> {
  eventType: string;
  payload: T;
  timestamp: number;
  correlationId?: string;
  source?: string;
}

// ============================================================================
// SCHEDULED JOB PAYLOADS
// ============================================================================

export interface CommunityInsightsAggregationPayload {
  triggerTime: number;
  analysisWindowDays?: number;
}

export interface PersonaEvolutionPayload {
  triggerTime: number;
  computeMetrics?: boolean;
}

export interface TrustProfileSyncPayload {
  triggerTime: number;
  fullSync?: boolean;
}

