/**
 * Signal Dispatchers for Personality Bridge
 *
 * Wrappers around the canonical emotion-event-dispatcher functions.
 * These translate personality v2 domain events into the correct signal
 * types expected by the frontend EQ system.
 *
 * IMPORTANT: This module uses the canonical dispatchers from emotion-event-dispatcher.ts
 * to ensure correct signal types. Do NOT send signals directly - always use these wrappers
 * or the canonical functions.
 *
 * @module personality/bridge/signal-dispatchers
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VulnerabilityDeposit } from '../domain/model/vulnerability-deposit.js';
import type { GrowthMilestone } from '../domain/model/growth-milestone.js';
import type { EmotionalPattern } from '../domain/model/emotional-pattern.js';
import type { AnticipatedEmotion } from '../domain/model/value-objects/anticipated-emotion.js';

// Import canonical dispatchers from emotion-event-dispatcher
import {
  dispatchVisibleVulnerability,
  dispatchSpontaneousDelight,
  dispatchSuperhumanObservation,
  dispatchEmotionalBondDeepen,
  type SendDataMessageFn as CanonicalSendDataMessageFn,
} from '../../agents/realtime/emotion-event-dispatcher.js';

const log = createLogger({ module: 'PersonalitySignalDispatchers' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Function to send data message to frontend
 * Re-export from canonical source for convenience
 */
export type SendDataMessageFn = CanonicalSendDataMessageFn;

/**
 * Anticipation data for signal dispatch
 */
export interface AnticipationData {
  emotion: string;
  confidence: number;
  signals: string[];
  shouldPrepareEmpathy?: boolean;
}

// ============================================================================
// VULNERABILITY LEVEL TO TYPE MAPPING
// ============================================================================

/**
 * Map personality v2 vulnerability levels to frontend vulnerability types
 *
 * v2 levels: 'surface' | 'personal' | 'vulnerable' | 'sacred'
 * Frontend types: 'uncertainty' | 'admission' | 'reflection' | 'growth'
 */
function mapVulnerabilityLevelToType(
  level: string
): 'uncertainty' | 'admission' | 'reflection' | 'growth' {
  switch (level) {
    case 'sacred':
      return 'growth'; // Deep vulnerability = growth through sharing
    case 'vulnerable':
      return 'admission'; // Admitting struggles
    case 'personal':
      return 'reflection'; // Reflecting on personal matters
    case 'surface':
    default:
      return 'uncertainty'; // Default to uncertainty
  }
}

/**
 * Map vulnerability level to signal intensity
 */
function mapVulnerabilityLevelToIntensity(level: string): number {
  switch (level) {
    case 'sacred':
      return 0.95;
    case 'vulnerable':
      return 0.8;
    case 'personal':
      return 0.6;
    case 'surface':
      return 0.4;
    default:
      return 0.5;
  }
}

// ============================================================================
// ANTICIPATION SIGNALS
// ============================================================================

/**
 * Dispatch anticipation signal to frontend EQ system
 *
 * This enables "Better Than Human" anticipatory presence - showing
 * micro-expressions BEFORE the user finishes speaking.
 *
 * Note: The canonical dispatchAnticipatoryPresence is designed for time-of-day
 * awareness (late night, etc.). For emotion anticipation, we send a custom
 * signal with anticipated emotion data included.
 *
 * @param sendDataMessage - Function to send data to frontend
 * @param anticipation - Anticipated emotion data from v2 system
 */
export async function dispatchAnticipationSignal(
  sendDataMessage: SendDataMessageFn,
  anticipation: AnticipationData
): Promise<void> {
  try {
    // Send anticipation signal with emotion prediction data
    // This extends the standard anticipatory_presence with emotion data
    await sendDataMessage('humanization_signal', {
      signalType: 'anticipatory_presence',
      anticipatedEmotion: anticipation.emotion,
      confidence: anticipation.confidence,
      signals: anticipation.signals,
      shouldPrepareEmpathy: anticipation.shouldPrepareEmpathy ?? false,
      intensity: anticipation.confidence, // Use confidence as intensity
      timestamp: Date.now(),
    });

    log.debug(
      {
        emotion: anticipation.emotion,
        confidence: anticipation.confidence,
        signalCount: anticipation.signals.length,
      },
      '🔮 Dispatched anticipation signal'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to dispatch anticipation signal');
  }
}

/**
 * Dispatch anticipation from AnticipatedEmotion value object
 */
export async function dispatchAnticipationFromValueObject(
  sendDataMessage: SendDataMessageFn,
  anticipated: AnticipatedEmotion
): Promise<void> {
  await dispatchAnticipationSignal(sendDataMessage, {
    emotion: anticipated.emotion,
    confidence: anticipated.confidenceScore, // Use numeric confidenceScore, not string confidence
    signals: anticipated.signals,
    shouldPrepareEmpathy: anticipated.shouldPrepareEmpathy,
  });
}

// ============================================================================
// VULNERABILITY SIGNALS
// ============================================================================

/**
 * Vulnerability data for signal dispatch
 * This is a simplified view of VulnerabilityDeposit for signal dispatch
 */
export interface VulnerabilityData {
  level: string;
  category: string;
  isFirstTime?: boolean;
  acknowledgment?: string;
}

/**
 * Dispatch vulnerability detection signal to frontend
 *
 * Uses the canonical dispatchVisibleVulnerability which sends 'visible_vulnerability'
 * signal type (NOT 'vulnerability' which the frontend ignores).
 *
 * @param sendDataMessage - Function to send data to frontend
 * @param data - Vulnerability data (can be VulnerabilityDeposit or simplified object)
 * @param isFirstTime - Whether this is a first-time vulnerability share
 */
export async function dispatchVulnerabilitySignal(
  sendDataMessage: SendDataMessageFn,
  data: VulnerabilityData | VulnerabilityDeposit,
  isFirstTime: boolean
): Promise<void> {
  try {
    const { level } = data;

    // Use the canonical dispatcher with correct signal type
    await dispatchVisibleVulnerability(sendDataMessage, {
      vulnerabilityType: mapVulnerabilityLevelToType(level),
      intensity: mapVulnerabilityLevelToIntensity(level),
    });

    log.debug(
      {
        level,
        mappedType: mapVulnerabilityLevelToType(level),
        isFirstTime,
      },
      '💜 Dispatched vulnerability signal (visible_vulnerability)'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to dispatch vulnerability signal');
  }
}

// ============================================================================
// GROWTH CELEBRATION SIGNALS
// ============================================================================

/**
 * Growth milestone data for signal dispatch
 * This is a simplified view of GrowthMilestone for signal dispatch
 */
export interface GrowthMilestoneData {
  area: string;
  significance: string;
  description?: string;
  celebrationMessage?: string;
  isReadyToCelebrate?: boolean;
}

/**
 * Map milestone significance to signal intensity
 */
function mapSignificanceToIntensity(significance: string): number {
  switch (significance) {
    case 'major':
    case 'breakthrough':
      return 0.9;
    case 'significant':
    case 'notable':
      return 0.7;
    case 'minor':
      return 0.5;
    default:
      return 0.6;
  }
}

/**
 * Dispatch growth celebration signal to frontend
 *
 * Uses the canonical dispatchSpontaneousDelight which sends 'spontaneous_delight'
 * signal type to trigger celebratory avatar behaviors.
 *
 * @param sendDataMessage - Function to send data to frontend
 * @param data - Growth milestone data (can be GrowthMilestone class or simplified object)
 */
export async function dispatchGrowthCelebrationSignal(
  sendDataMessage: SendDataMessageFn,
  data: GrowthMilestoneData | GrowthMilestone
): Promise<void> {
  try {
    const significance = typeof data.significance === 'string' ? data.significance : 'notable';
    const description = 'description' in data ? data.description : (data as GrowthMilestone).label;

    // Use the canonical dispatcher
    await dispatchSpontaneousDelight(sendDataMessage, {
      trigger: description ?? `growth_${data.area}`,
      intensity: mapSignificanceToIntensity(significance),
    });

    log.debug(
      {
        area: data.area,
        significance,
      },
      '🌱 Dispatched growth celebration signal (spontaneous_delight)'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to dispatch growth celebration signal');
  }
}

// ============================================================================
// PATTERN SURFACING SIGNALS
// ============================================================================

/**
 * Pattern data for signal dispatch
 * This is a simplified view of EmotionalPattern for signal dispatch
 */
export interface PatternData {
  patternType: string;
  description: string;
  confidence: number;
  insightToShare?: string;
  isReadyToSurface?: boolean;
}

/**
 * Map pattern type to observation type for frontend
 */
function mapPatternTypeToObservationType(
  patternType: string
): 'pattern' | 'correlation' | 'temporal' | 'insight' {
  switch (patternType) {
    case 'temporal':
      return 'temporal';
    case 'topic_emotion':
      return 'correlation';
    case 'person_related':
      return 'correlation';
    default:
      return 'pattern';
  }
}

/**
 * Dispatch superhuman observation signal for pattern surfacing
 *
 * Uses the canonical dispatchSuperhumanObservation which sends 'superhuman_observation'
 * signal type to trigger "I've noticed..." avatar behavior.
 *
 * @param sendDataMessage - Function to send data to frontend
 * @param data - Pattern data (can be EmotionalPattern class or simplified object)
 */
export async function dispatchPatternSurfacingSignal(
  sendDataMessage: SendDataMessageFn,
  data: PatternData | EmotionalPattern
): Promise<void> {
  try {
    const { patternType, description, insightToShare } = data;
    const confidence = 'confidence' in data ? data.confidence : 0.5;

    // Use the canonical dispatcher
    await dispatchSuperhumanObservation(sendDataMessage, {
      observationType: mapPatternTypeToObservationType(patternType),
      observationContent: insightToShare ?? description,
      intensity: Math.min(0.9, confidence + 0.1), // Confidence + slight boost
    });

    log.debug(
      {
        patternType,
        confidence,
      },
      '🔍 Dispatched pattern surfacing signal (superhuman_observation)'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to dispatch pattern surfacing signal');
  }
}

// ============================================================================
// BREAKTHROUGH / EMOTIONAL BOND SIGNALS
// ============================================================================

/**
 * Dispatch emotional bond deepening signal
 *
 * Uses the canonical dispatchEmotionalBondDeepen which sends 'emotional_bond_deepen'
 * signal type when a significant emotional moment strengthens the relationship.
 *
 * @param sendDataMessage - Function to send data to frontend
 * @param trigger - What triggered the bond deepening
 * @param intensity - Signal intensity (0-1)
 */
export async function dispatchEmotionalBondSignal(
  sendDataMessage: SendDataMessageFn,
  trigger: string,
  intensity = 0.7
): Promise<void> {
  try {
    // Use the canonical dispatcher
    await dispatchEmotionalBondDeepen(sendDataMessage, {
      trigger,
      intensity,
      relationshipContext: trigger,
    });

    log.debug(
      { trigger, intensity },
      '💕 Dispatched emotional bond signal (emotional_bond_deepen)'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to dispatch emotional bond signal');
  }
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

// Re-export canonical dispatchers for direct use when appropriate
export {
  dispatchVisibleVulnerability,
  dispatchSpontaneousDelight,
  dispatchSuperhumanObservation,
  dispatchEmotionalBondDeepen,
  dispatchAnticipatoryPresence,
} from '../../agents/realtime/emotion-event-dispatcher.js';

// Note: dispatchAnticipatoryPresence is re-exported but not used internally
// because it's designed for time-of-day context. We provide dispatchAnticipationSignal
// for emotion prediction which sends the same signal type with different payload.
