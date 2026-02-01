/**
 * Better Than Human - Service Instrumentation
 *
 * Provides instrumentation helpers to integrate BTH telemetry
 * into existing superhuman services without modifying their core logic.
 *
 * Usage:
 *   import { instrumentCommitmentDetection } from '../better-than-human-validation/instrumentation.js';
 *
 *   // Wrap the result after detection
 *   const result = detectCommitment(transcript, userId, context);
 *   instrumentCommitmentDetection(userId, sessionId, transcript, result);
 *
 * @module services/better-than-human-validation/instrumentation
 */

import { createLogger } from '../../utils/safe-logger.js';
import { trackBTHCapabilityTriggered, trackBTHOutcome } from './production-telemetry.js';

const log = createLogger({ module: 'BTHInstrumentation' });

// ============================================================================
// COMMITMENT DETECTION INSTRUMENTATION
// ============================================================================

interface CommitmentDetectionResult {
  detected: boolean;
  confidence?: number;
  commitment?: {
    statement: string;
    type: string;
    emotionalWeight?: number;
  };
}

/**
 * Instrument a commitment detection result for BTH telemetry.
 *
 * Call this after detectCommitment() to track the capability trigger.
 */
export function instrumentCommitmentDetection(
  userId: string,
  sessionId: string,
  transcript: string,
  result: CommitmentDetectionResult
): string {
  if (!result.detected || !result.commitment) {
    return '';
  }

  return trackBTHCapabilityTriggered({
    userId,
    sessionId,
    capability: 'commitment_detection',
    trigger: {
      type: 'user_message',
      content: transcript,
      confidence: result.confidence || 0.5,
    },
    action: {
      type: 'injected_context',
      description: `Detected ${result.commitment.type}: "${result.commitment.statement.slice(0, 50)}..."`,
      contextInjected: `User commitment: ${result.commitment.statement}`,
    },
  });
}

/**
 * Track when a commitment follow-up is shown to the user.
 */
export function instrumentCommitmentFollowUp(
  userId: string,
  sessionId: string,
  commitmentId: string,
  commitmentText: string,
  followUpMessage: string
): string {
  return trackBTHCapabilityTriggered({
    userId,
    sessionId,
    capability: 'commitment_detection',
    trigger: {
      type: 'proactive',
      content: `Follow-up on: ${commitmentText}`,
      confidence: 0.9,
    },
    action: {
      type: 'surfaced_pattern',
      description: 'Surfaced commitment for follow-up',
      contextInjected: followUpMessage,
    },
  });
}

// ============================================================================
// CRISIS DETECTION INSTRUMENTATION
// ============================================================================

interface CrisisDetectionResult {
  detected: boolean;
  severity?: 'low' | 'medium' | 'high' | 'urgent';
  signals?: string[];
  confidence?: number;
}

/**
 * Instrument a crisis detection result for BTH telemetry.
 */
export function instrumentCrisisDetection(
  userId: string,
  sessionId: string,
  transcript: string,
  result: CrisisDetectionResult
): string {
  if (!result.detected) {
    return '';
  }

  return trackBTHCapabilityTriggered({
    userId,
    sessionId,
    capability: 'crisis_detection',
    trigger: {
      type: 'user_message',
      content: transcript,
      confidence: result.confidence || 0.7,
    },
    action: {
      type:
        result.severity === 'urgent' || result.severity === 'high'
          ? 'modified_response'
          : 'injected_context',
      description: `Detected ${result.severity || 'unknown'} crisis signal: ${(result.signals || []).join(', ')}`,
    },
  });
}

// ============================================================================
// READING BETWEEN LINES INSTRUMENTATION
// ============================================================================

interface SubtextDetectionResult {
  detected: boolean;
  subtext?: string;
  emotionalUndercurrent?: string;
  confidence?: number;
}

/**
 * Instrument reading between the lines detection.
 */
export function instrumentSubtextDetection(
  userId: string,
  sessionId: string,
  transcript: string,
  result: SubtextDetectionResult
): string {
  if (!result.detected || !result.subtext) {
    return '';
  }

  return trackBTHCapabilityTriggered({
    userId,
    sessionId,
    capability: 'reading_between_lines',
    trigger: {
      type: 'context_detection',
      content: transcript,
      confidence: result.confidence || 0.6,
    },
    action: {
      type: 'injected_context',
      description: `Detected subtext: ${result.emotionalUndercurrent || result.subtext}`,
      contextInjected: result.subtext,
    },
  });
}

// ============================================================================
// PATTERN SURFACING INSTRUMENTATION
// ============================================================================

interface PatternResult {
  patternType: string;
  description: string;
  confidence: number;
  surfacedToUser: boolean;
}

/**
 * Instrument pattern surfacing (when we show user a pattern we noticed).
 */
export function instrumentPatternSurfacing(
  userId: string,
  sessionId: string,
  pattern: PatternResult
): string {
  return trackBTHCapabilityTriggered({
    userId,
    sessionId,
    capability: 'pattern_surfacing',
    trigger: {
      type: 'context_detection',
      content: pattern.description,
      confidence: pattern.confidence,
    },
    action: {
      type: pattern.surfacedToUser ? 'surfaced_pattern' : 'injected_context',
      description: `${pattern.patternType}: ${pattern.description}`,
    },
  });
}

// ============================================================================
// VOICE BIOMARKER INSTRUMENTATION
// ============================================================================

interface VoiceBiomarkerResult {
  strain?: number;
  tremor?: number;
  speechRate?: number;
  pauseFrequency?: number;
  overallConcern: number;
}

/**
 * Instrument voice biomarker detection.
 */
export function instrumentVoiceBiomarkers(
  userId: string,
  sessionId: string,
  biomarkers: VoiceBiomarkerResult
): string {
  // Only track if concern level is significant
  if (biomarkers.overallConcern < 0.4) {
    return '';
  }

  const signals: string[] = [];
  if (biomarkers.strain && biomarkers.strain > 0.5) signals.push('voice strain');
  if (biomarkers.tremor && biomarkers.tremor > 0.5) signals.push('tremor');
  if (biomarkers.speechRate && biomarkers.speechRate > 1.5) signals.push('rapid speech');
  if (biomarkers.pauseFrequency && biomarkers.pauseFrequency > 0.7) signals.push('frequent pauses');

  return trackBTHCapabilityTriggered({
    userId,
    sessionId,
    capability: 'voice_biomarkers',
    trigger: {
      type: 'voice_signal',
      content: `Detected: ${signals.join(', ')}`,
      confidence: biomarkers.overallConcern,
    },
    action: {
      type: 'injected_context',
      description: `Voice signals detected: ${signals.join(', ')}`,
    },
  });
}

// ============================================================================
// EMOTIONAL VOCABULARY INSTRUMENTATION
// ============================================================================

/**
 * Instrument when we help user with emotional vocabulary.
 */
export function instrumentEmotionalVocabulary(
  userId: string,
  sessionId: string,
  userExpression: string,
  suggestedVocabulary: string[]
): string {
  return trackBTHCapabilityTriggered({
    userId,
    sessionId,
    capability: 'emotional_vocabulary',
    trigger: {
      type: 'user_message',
      content: userExpression,
      confidence: 0.8,
    },
    action: {
      type: 'modified_response',
      description: `Offered vocabulary options: ${suggestedVocabulary.slice(0, 3).join(', ')}`,
    },
  });
}

// ============================================================================
// OUTCOME TRACKING
// ============================================================================

/**
 * Track outcome for a previously triggered capability.
 *
 * Call this when we can observe the result of our intervention.
 */
export function trackCapabilityOutcome(
  eventId: string,
  outcome: {
    commitmentKept?: boolean;
    crisisEscalated?: boolean;
    returnedToTopic?: boolean;
    deeperVulnerability?: boolean;
  }
): void {
  if (!eventId) return;

  trackBTHOutcome({
    eventId,
    outcome,
  });
}

// ============================================================================
// BATCH INSTRUMENTATION HELPER
// ============================================================================

interface SuperhumanDetectionBatch {
  commitment?: CommitmentDetectionResult;
  crisis?: CrisisDetectionResult;
  subtext?: SubtextDetectionResult;
  pattern?: PatternResult;
  voiceBiomarkers?: VoiceBiomarkerResult;
}

/**
 * Instrument multiple capability detections at once.
 *
 * Useful for turn processing where multiple capabilities might trigger.
 */
export function instrumentTurnDetections(
  userId: string,
  sessionId: string,
  transcript: string,
  detections: SuperhumanDetectionBatch
): string[] {
  const eventIds: string[] = [];

  if (detections.commitment?.detected) {
    const id = instrumentCommitmentDetection(userId, sessionId, transcript, detections.commitment);
    if (id) eventIds.push(id);
  }

  if (detections.crisis?.detected) {
    const id = instrumentCrisisDetection(userId, sessionId, transcript, detections.crisis);
    if (id) eventIds.push(id);
  }

  if (detections.subtext?.detected) {
    const id = instrumentSubtextDetection(userId, sessionId, transcript, detections.subtext);
    if (id) eventIds.push(id);
  }

  if (detections.pattern) {
    const id = instrumentPatternSurfacing(userId, sessionId, detections.pattern);
    if (id) eventIds.push(id);
  }

  if (detections.voiceBiomarkers && detections.voiceBiomarkers.overallConcern > 0.4) {
    const id = instrumentVoiceBiomarkers(userId, sessionId, detections.voiceBiomarkers);
    if (id) eventIds.push(id);
  }

  if (eventIds.length > 0) {
    log.debug(
      { userId, sessionId, eventCount: eventIds.length },
      'Instrumented superhuman detections'
    );
  }

  return eventIds;
}
