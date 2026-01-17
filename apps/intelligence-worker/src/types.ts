/**
 * Intelligence Worker Types
 *
 * Type definitions for the intelligence processing worker.
 */

import type { Firestore } from '@google-cloud/firestore';

// ============================================================================
// CONFIG
// ============================================================================

export interface WorkerConfig {
  db: Firestore;
  projectId: string;
  dryRun: boolean;
}

// ============================================================================
// PUB/SUB MESSAGE TYPES
// ============================================================================

/**
 * Base message structure for all intelligence events
 */
export interface IntelligenceEvent {
  /** Unique event ID for deduplication */
  eventId: string;
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Event type */
  type: IntelligenceEventType;
  /** Timestamp when event was created */
  timestamp: string;
  /** Event-specific payload */
  payload: unknown;
}

export type IntelligenceEventType =
  | 'pattern_detection'
  | 'predictive_intelligence'
  | 'key_moment'
  | 'trust_recording'
  | 'response_quality'
  | 'outreach_extraction'
  | 'voice_identity'
  | 'tool_usage'
  | 'humanization_analytics'
  | 'profile_save'
  | 'mismatch_insight'
  | 'creative_you_topic';

// ============================================================================
// PATTERN DETECTION
// ============================================================================

export interface PatternDetectionPayload {
  /** User's message text */
  message: string;
  /** Detected topic */
  topic: string;
  /** Primary emotion detected */
  emotion: string;
}

// ============================================================================
// PREDICTIVE INTELLIGENCE
// ============================================================================

export interface PredictiveIntelligencePayload {
  /** User's message */
  message: string;
  /** Detected topic */
  topic: string;
  /** Primary emotion */
  emotion: string;
  /** Emotion intensity 0-1 */
  emotionIntensity: number;
  /** Voice strain indicator */
  voiceStrain?: number;
  /** Day of week 0-6 */
  dayOfWeek: number;
  /** Hour of day 0-23 */
  hourOfDay: number;
  /** Turn count in session */
  turnCount: number;
  /** Total session count for user */
  sessionCount: number;
  /** User's relationship stage */
  relationshipStage?: string;
}

// ============================================================================
// KEY MOMENT DETECTION
// ============================================================================

export interface KeyMomentPayload {
  /** Persona handling the conversation */
  personaId: string;
  /** User's message */
  message: string;
  /** Detected topic */
  topic: string;
  /** Primary emotion */
  emotion: string;
  /** Emotion intensity 0-1 */
  emotionIntensity: number;
}

// ============================================================================
// TRUST RECORDING
// ============================================================================

export interface TrustRecordingPayload {
  /** Persona ID */
  personaId: string;
  /** Trust signal type */
  signalType: 'boundary_respected' | 'vulnerability_shared' | 'growth_noted' | 'callback_made';
  /** Context/details */
  context: string;
  /** Confidence level 0-1 */
  confidence: number;
}

// ============================================================================
// RESPONSE QUALITY
// ============================================================================

export interface ResponseQualityPayload {
  /** Persona ID */
  personaId: string;
  /** User's message */
  userMessage: string;
  /** Agent's response */
  agentResponse: string;
  /** Turn number */
  turnNumber: number;
  /** Response latency in ms */
  latencyMs?: number;
  /** Was the user interrupted */
  wasInterrupted?: boolean;
}

// ============================================================================
// PROFILE SAVE
// ============================================================================

export interface ProfileSavePayload {
  /** Fields that were updated */
  updatedFields: string[];
  /** Profile data to merge */
  profileData: Record<string, unknown>;
}

// ============================================================================
// OUTREACH EXTRACTION
// ============================================================================

export interface OutreachExtractionPayload {
  /** User's message to analyze */
  message: string;
}

// ============================================================================
// TOOL USAGE
// ============================================================================

export interface ToolUsagePayload {
  /** Tool ID that was used */
  toolId: string;
  /** Execution duration in ms */
  durationMs?: number;
  /** Was execution successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// PROCESSING RESULTS
// ============================================================================

export interface ProcessingResult {
  success: boolean;
  eventId: string;
  eventType: IntelligenceEventType;
  durationMs: number;
  error?: string;
}

export interface BatchProcessingResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: ProcessingResult[];
}

