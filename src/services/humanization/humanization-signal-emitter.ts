/**
 * Humanization Signal Emitter
 *
 * Bridges the backend DeepHumanizationEngine to the frontend Ferni EQ system.
 * Sends real-time signals about conversation dynamics so the avatar can respond
 * BEFORE the words arrive - creating the "they understand me" feeling.
 *
 * This is a critical piece of making Ferni feel truly human.
 *
 * @module @ferni/humanization-signal-emitter
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'HumanizationSignalEmitter' });

// ============================================================================
// TYPES
// ============================================================================

export type HumanizationSignalType =
  | 'breakthrough'
  | 'vulnerability'
  | 'disengagement'
  | 'high_engagement'
  | 'mind_change'
  | 'memory_callback'
  | 'running_joke'
  | 'physical_presence'
  | 'spontaneous_thought'
  | 'mood_drift'
  | 'silence_moment'
  | 'anticipation'
  | 'evidence_presented'
  | 'topic_weight_shift'
  | 'relationship_milestone'
  | 'emotional_arc_peak'
  | 'emotional_arc_release';

export interface HumanizationSignalPayload {
  signalType: HumanizationSignalType;
  content?: string;
  memoryAge?: string;
  topic?: string;
  intensity?: number;
  mood?: {
    energy: number;
    engagement: number;
    emotionalLoad: number;
  };
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  silenceDuration?: number;
  silenceReason?: 'processing' | 'emotional' | 'invitation' | 'presence';
}

export interface MemoryCallbackPayload {
  quotedPhrase: string;
  context: string;
  whenMentioned: string;
  emotionalWeight: 'light' | 'medium' | 'heavy';
}

export interface ConversationRhythmPayload {
  userPacing: 'rapid' | 'moderate' | 'slow' | 'contemplative';
  avgTurnLength: number;
  pausePattern: 'frequent_short' | 'occasional_long' | 'flowing' | 'hesitant';
  energyTrend: 'rising' | 'stable' | 'falling' | 'oscillating';
}

export interface EmotionalArcPayload {
  phase: 'opening' | 'building' | 'peak' | 'release' | 'closing';
  intensity: number;
  dominantEmotion: string;
  turnsSincePeak?: number;
}

// Callback type for sending data to frontend
type SendDataCallback = (type: string, payload: Record<string, unknown>) => Promise<void>;

// ============================================================================
// STATE
// ============================================================================

let sendDataCallback: SendDataCallback | null = null;
let isEnabled = true;

// Throttling to prevent overwhelming the frontend
const lastSignalTimes = new Map<HumanizationSignalType, number>();
const SIGNAL_THROTTLE_MS = 2000;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the signal emitter with a callback to send data to frontend
 */
export function initHumanizationSignalEmitter(sendData: SendDataCallback): void {
  sendDataCallback = sendData;
  logger.info('Humanization signal emitter initialized');
}

/**
 * Enable/disable signal emission
 */
export function setSignalEmitterEnabled(enabled: boolean): void {
  isEnabled = enabled;
  logger.debug({ enabled }, 'Signal emitter enabled state changed');
}

// ============================================================================
// SIGNAL EMISSION
// ============================================================================

/**
 * Check if a signal should be throttled
 */
function shouldThrottle(signalType: HumanizationSignalType): boolean {
  const lastTime = lastSignalTimes.get(signalType) || 0;
  const elapsed = Date.now() - lastTime;

  if (elapsed < SIGNAL_THROTTLE_MS) {
    logger.debug({ signalType, elapsed }, 'Signal throttled');
    return true;
  }

  lastSignalTimes.set(signalType, Date.now());
  return false;
}

/**
 * Emit a humanization signal to the frontend
 */
export async function emitHumanizationSignal(payload: HumanizationSignalPayload): Promise<void> {
  if (!isEnabled || !sendDataCallback) {
    logger.debug(
      { signalType: payload.signalType },
      'Signal emission skipped (disabled or no callback)'
    );
    return;
  }

  if (shouldThrottle(payload.signalType)) {
    return;
  }

  try {
    await sendDataCallback('humanization_signal', {
      ...payload,
      type: 'humanization_signal',
    });

    logger.debug(
      { signalType: payload.signalType, intensity: payload.intensity },
      'Humanization signal emitted'
    );
  } catch (error) {
    logger.warn({ error, signalType: payload.signalType }, 'Failed to emit humanization signal');
  }
}

/**
 * Emit a memory callback signal with specific quoted content
 */
export async function emitMemoryCallback(payload: MemoryCallbackPayload): Promise<void> {
  if (!isEnabled || !sendDataCallback) return;

  try {
    await sendDataCallback('memory_callback', {
      ...payload,
      type: 'memory_callback',
    });

    logger.debug({ phrase: payload.quotedPhrase.slice(0, 30) }, 'Memory callback emitted');
  } catch (error) {
    logger.warn({ error }, 'Failed to emit memory callback');
  }
}

/**
 * Emit conversation rhythm update
 */
export async function emitConversationRhythm(payload: ConversationRhythmPayload): Promise<void> {
  if (!isEnabled || !sendDataCallback) return;

  try {
    await sendDataCallback('conversation_rhythm', {
      ...payload,
      type: 'conversation_rhythm',
    });

    logger.debug({ pacing: payload.userPacing }, 'Conversation rhythm emitted');
  } catch (error) {
    logger.warn({ error }, 'Failed to emit conversation rhythm');
  }
}

/**
 * Emit emotional arc update
 */
export async function emitEmotionalArc(payload: EmotionalArcPayload): Promise<void> {
  if (!isEnabled || !sendDataCallback) return;

  try {
    await sendDataCallback('emotional_arc', {
      ...payload,
      type: 'emotional_arc',
    });

    logger.debug({ phase: payload.phase, intensity: payload.intensity }, 'Emotional arc emitted');
  } catch (error) {
    logger.warn({ error }, 'Failed to emit emotional arc');
  }
}

// ============================================================================
// CONVENIENCE METHODS - High-level signal emitters
// ============================================================================

/**
 * Signal that a breakthrough moment was detected
 */
export async function signalBreakthrough(intensity = 0.8): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'breakthrough',
    intensity,
  });
}

/**
 * Signal that vulnerability was detected
 */
export async function signalVulnerability(intensity = 0.7): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'vulnerability',
    intensity,
  });
}

/**
 * Signal that user seems disengaged
 */
export async function signalDisengagement(): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'disengagement',
    intensity: 0.6,
  });
}

/**
 * Signal high engagement
 */
export async function signalHighEngagement(intensity = 0.8): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'high_engagement',
    intensity,
  });
}

/**
 * Signal that Ferni is changing their mind
 */
export async function signalMindChange(): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'mind_change',
    intensity: 0.7,
  });
}

/**
 * Signal a memory callback with specific content
 */
export async function signalMemoryCallback(
  quotedPhrase: string,
  context: string,
  whenMentioned: string,
  emotionalWeight: 'light' | 'medium' | 'heavy' = 'medium'
): Promise<void> {
  await emitMemoryCallback({
    quotedPhrase,
    context,
    whenMentioned,
    emotionalWeight,
  });
}

/**
 * Signal a running joke/inside reference
 */
export async function signalRunningJoke(content?: string): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'running_joke',
    content,
    intensity: 0.6,
  });
}

/**
 * Signal physical presence awareness
 */
export async function signalPhysicalPresence(): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'physical_presence',
    intensity: 0.5,
  });
}

/**
 * Signal spontaneous thought
 */
export async function signalSpontaneousThought(): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'spontaneous_thought',
    intensity: 0.6,
  });
}

/**
 * Signal mood drift with current mood state
 */
export async function signalMoodDrift(mood: HumanizationSignalPayload['mood']): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'mood_drift',
    mood,
    intensity: 0.5,
  });
}

/**
 * Signal an intentional silence moment
 */
export async function signalSilenceMoment(
  duration: number,
  reason: 'processing' | 'emotional' | 'invitation' | 'presence' | 'resonance' | 'respect'
): Promise<void> {
  // Map additional reasons to the core types for frontend
  const reasonMap: Record<string, 'processing' | 'emotional' | 'invitation' | 'presence'> = {
    processing: 'processing',
    emotional: 'emotional',
    invitation: 'invitation',
    presence: 'presence',
    resonance: 'emotional', // Resonance is similar to emotional
    respect: 'emotional', // Respect is similar to emotional
  };

  await emitHumanizationSignal({
    signalType: 'silence_moment',
    silenceDuration: duration,
    silenceReason: reasonMap[reason] || 'presence',
    intensity: reason === 'emotional' || reason === 'respect' ? 0.8 : 0.5,
  });
}

/**
 * Signal anticipation of user's direction
 */
export async function signalAnticipation(): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'anticipation',
    intensity: 0.6,
  });
}

/**
 * Signal that user presented evidence
 */
export async function signalEvidencePresented(): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'evidence_presented',
    intensity: 0.7,
  });
}

/**
 * Signal topic weight shift
 */
export async function signalTopicWeightShift(weight: 'light' | 'medium' | 'heavy'): Promise<void> {
  const intensityMap = { light: 0.3, medium: 0.5, heavy: 0.8 };
  await emitHumanizationSignal({
    signalType: 'topic_weight_shift',
    intensity: intensityMap[weight],
  });
}

/**
 * Signal relationship milestone
 */
export async function signalRelationshipMilestone(
  stage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'
): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'relationship_milestone',
    relationshipStage: stage,
    intensity: 0.9,
  });
}

/**
 * Signal emotional arc peak
 */
export async function signalEmotionalArcPeak(intensity: number): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'emotional_arc_peak',
    intensity,
  });
}

/**
 * Signal emotional arc release
 */
export async function signalEmotionalArcRelease(): Promise<void> {
  await emitHumanizationSignal({
    signalType: 'emotional_arc_release',
    intensity: 0.6,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const humanizationSignalEmitter = {
  init: initHumanizationSignalEmitter,
  setEnabled: setSignalEmitterEnabled,

  // Raw emitters
  emit: emitHumanizationSignal,
  emitMemory: emitMemoryCallback,
  emitRhythm: emitConversationRhythm,
  emitArc: emitEmotionalArc,

  // Convenience methods
  breakthrough: signalBreakthrough,
  vulnerability: signalVulnerability,
  disengagement: signalDisengagement,
  highEngagement: signalHighEngagement,
  mindChange: signalMindChange,
  memoryCallback: signalMemoryCallback,
  runningJoke: signalRunningJoke,
  physicalPresence: signalPhysicalPresence,
  spontaneousThought: signalSpontaneousThought,
  moodDrift: signalMoodDrift,
  silenceMoment: signalSilenceMoment,
  anticipation: signalAnticipation,
  evidencePresented: signalEvidencePresented,
  topicWeightShift: signalTopicWeightShift,
  relationshipMilestone: signalRelationshipMilestone,
  emotionalArcPeak: signalEmotionalArcPeak,
  emotionalArcRelease: signalEmotionalArcRelease,
};
