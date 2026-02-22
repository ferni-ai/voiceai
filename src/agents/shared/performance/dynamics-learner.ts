/**
 * Reinforcement Learning Data Collection for Conversation Dynamics
 *
 * Collects (state, action, reward) tuples from sessions for offline training
 * of backchannel and turn prediction models.
 */

import { fireAndForget } from '../../../utils/safe-fire-and-forget.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'dynamics-learner' });

/** State observation at a conversation moment */
export interface DynamicsState {
  /** Audio features snapshot */
  audioFeatures: {
    energyMean: number;
    energySlope: number;
    pitchMean: number;
    pitchSlope: number;
    pauseDurationMs: number;
    speakingRate: number;
  };
  /** Partial transcript at this moment */
  partialTranscript: string;
  /** Conversation context features */
  context: {
    turnNumber: number;
    topicCategory: string;
    emotionPrimary: string;
    sessionDurationMs: number;
  };
}

/** Action taken by the agent */
export interface DynamicsAction {
  type: 'backchannel' | 'start_speaking' | 'continue_listening' | 'interrupt';
  /** Delay in ms from the state observation to the action */
  delayMs: number;
  /** Backchannel phrase if type is 'backchannel' */
  phrase?: string;
}

/** Reward signal from user feedback */
export interface DynamicsReward {
  /** User continued speaking (positive for backchannel, negative for interrupt) */
  userContinuedSpeaking: boolean;
  /** Positive voice biomarkers after action */
  positiveBiomarkers: boolean;
  /** User interrupted agent (negative signal) */
  userInterrupted: boolean;
  /** Engagement score (0-1) */
  engagementScore: number;
  /** Computed reward (-1 to 1) */
  reward: number;
}

/** A single experience tuple for training */
export interface ExperienceTuple {
  sessionId: string;
  timestamp: number;
  state: DynamicsState;
  action: DynamicsAction;
  reward: DynamicsReward;
  nextState: DynamicsState | null;
}

/** In-memory buffer of experience tuples before persistence */
const experienceBuffer: ExperienceTuple[] = [];
const MAX_BUFFER_SIZE = 500;

/** Record a dynamics experience tuple */
export function recordExperience(
  sessionId: string,
  state: DynamicsState,
  action: DynamicsAction,
  reward: DynamicsReward,
  nextState: DynamicsState | null = null
): void {
  const tuple: ExperienceTuple = {
    sessionId,
    timestamp: Date.now(),
    state,
    action,
    reward,
    nextState,
  };

  experienceBuffer.push(tuple);

  if (experienceBuffer.length >= MAX_BUFFER_SIZE) {
    fireAndForget(() => flushExperienceBuffer(), 'dynamics-learner-flush');
  }

  log.debug(
    { sessionId, actionType: action.type, reward: reward.reward },
    'Recorded dynamics experience'
  );
}

/** Compute reward from user feedback signals */
export function computeReward(signals: Omit<DynamicsReward, 'reward'>): DynamicsReward {
  let reward = 0;

  if (signals.userContinuedSpeaking) reward += 0.3;
  if (signals.positiveBiomarkers) reward += 0.3;
  if (signals.userInterrupted) reward -= 0.5;
  reward += signals.engagementScore * 0.4;

  // Clamp to [-1, 1]
  reward = Math.max(-1, Math.min(1, reward));

  return { ...signals, reward };
}

/** Flush experience buffer to persistent storage (Firestore) */
async function flushExperienceBuffer(): Promise<void> {
  if (experienceBuffer.length === 0) return;

  const batch = experienceBuffer.splice(0, MAX_BUFFER_SIZE);
  log.info({ count: batch.length }, 'Flushing dynamics experience buffer');

  try {
    // Store in Firestore for offline training
    // In production: await firestoreAdmin.collection('dynamics_experiences').add(batch)
    // For now, just log that we would persist
    log.debug(
      { count: batch.length },
      'Would persist experience tuples to Firestore'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to flush experience buffer');
    // Re-add to buffer on failure (best effort)
    experienceBuffer.unshift(
      ...batch.slice(0, MAX_BUFFER_SIZE - experienceBuffer.length)
    );
  }
}

/** Get buffer stats */
export function getDynamicsLearnerStats(): {
  bufferSize: number;
  maxBufferSize: number;
} {
  return {
    bufferSize: experienceBuffer.length,
    maxBufferSize: MAX_BUFFER_SIZE,
  };
}
