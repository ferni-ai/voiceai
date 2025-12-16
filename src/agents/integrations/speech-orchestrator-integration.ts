/**
 * Speech Orchestrator Integration
 *
 * Integrates the new SpeechOrchestrator with the voice agent.
 * Uses feature flags for safe rollout alongside existing humanization.
 *
 * @module agents/integrations/speech-orchestrator-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getOrchestrator,
  resetOrchestrator,
  type HumanizedResponse,
  type SpeechOrchestratorContext,
} from '../../speech/orchestrator/index.js';
import {
  getAnticipationPipeline,
  resetAnticipationPipeline,
} from '../../speech/anticipation/index.js';
import type { EmotionResult } from '../../intelligence/emotion-detector.js';

const log = createLogger({ module: 'SpeechOrchestratorIntegration' });

// ============================================================================
// FEATURE FLAG
// ============================================================================

/**
 * Feature flag for using the new orchestrator
 * Set to true to enable the orchestrator for humanization
 */
let USE_ORCHESTRATOR = false;

/**
 * Enable the speech orchestrator
 */
export function enableSpeechOrchestrator(): void {
  USE_ORCHESTRATOR = true;
  log.info('🎭 Speech orchestrator ENABLED');
}

/**
 * Disable the speech orchestrator
 */
export function disableSpeechOrchestrator(): void {
  USE_ORCHESTRATOR = false;
  log.info('🎭 Speech orchestrator DISABLED');
}

/**
 * Check if orchestrator is enabled
 */
export function isOrchestratorEnabled(): boolean {
  return USE_ORCHESTRATOR;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the speech orchestrator for a session
 */
export async function initializeSpeechOrchestrator(
  sessionId: string,
  personaId: string
): Promise<void> {
  if (!USE_ORCHESTRATOR) return;

  const orchestrator = getOrchestrator(sessionId, personaId);
  await orchestrator.initialize();

  log.debug({ sessionId, personaId }, '🎭 Speech orchestrator initialized for session');
}

/**
 * Clean up speech orchestrator for a session
 */
export function cleanupSpeechOrchestrator(sessionId: string): void {
  resetOrchestrator(sessionId);
  resetAnticipationPipeline(sessionId);
  log.debug({ sessionId }, '🎭 Speech orchestrator cleaned up');
}

// ============================================================================
// HUMANIZATION API
// ============================================================================

export interface OrchestratorHumanizeContext {
  /** Session ID */
  sessionId: string;
  /** Persona ID */
  personaId: string;
  /** Raw LLM response text */
  rawText: string;
  /** Current turn number */
  turnNumber?: number;
  /** Topic weight for pacing */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** User's detected emotion */
  userEmotion?: EmotionResult;
  /** Is this an emotional moment */
  isEmotionalMoment?: boolean;
  /** Recent user content */
  recentUserContent?: string;
}

export interface OrchestratorResult {
  /** Processed text with SSML */
  text: string;
  /** Was orchestrator used */
  wasUsed: boolean;
  /** Applied features */
  appliedFeatures: string[];
  /** Metadata */
  metadata?: HumanizedResponse['metadata'];
}

/**
 * Humanize response using the speech orchestrator
 *
 * If orchestrator is disabled, returns original text unchanged.
 */
export async function humanizeWithOrchestrator(
  ctx: OrchestratorHumanizeContext
): Promise<OrchestratorResult> {
  if (!USE_ORCHESTRATOR) {
    return {
      text: ctx.rawText,
      wasUsed: false,
      appliedFeatures: [],
    };
  }

  const orchestrator = getOrchestrator(ctx.sessionId, ctx.personaId);

  const context: Partial<SpeechOrchestratorContext> = {
    turnNumber: ctx.turnNumber,
    topicWeight: ctx.topicWeight,
    userEmotion: ctx.userEmotion,
    isEmotionalMoment: ctx.isEmotionalMoment,
    recentUserContent: ctx.recentUserContent,
  };

  const result = await orchestrator.humanize(ctx.rawText, context);

  return {
    text: result.ssml,
    wasUsed: true,
    appliedFeatures: result.appliedFeatures,
    metadata: result.metadata,
  };
}

// ============================================================================
// ANTICIPATION API
// ============================================================================

export interface AnticipationInput {
  /** Session ID */
  sessionId: string;
  /** Partial transcript text */
  partialTranscript: string;
  /** Is user still speaking */
  isSpeaking: boolean;
  /** Detected tone */
  tone?: 'neutral' | 'excited' | 'sad' | 'frustrated' | 'curious';
}

/**
 * Process partial transcript for anticipation
 *
 * Call this during user speech to prepare prosody.
 */
export function processAnticipation(input: AnticipationInput): void {
  if (!USE_ORCHESTRATOR) return;

  const pipeline = getAnticipationPipeline(input.sessionId);

  pipeline.process({
    sessionId: input.sessionId,
    partialTranscript: input.partialTranscript,
    isSpeaking: input.isSpeaking,
    tone: input.tone,
  });
}

/**
 * Get micro-reaction for response start (if available)
 */
export function getMicroReaction(sessionId: string): string | null {
  if (!USE_ORCHESTRATOR) return null;

  const pipeline = getAnticipationPipeline(sessionId);

  if (pipeline.shouldUseMicroReaction()) {
    return pipeline.getLatest()?.prosody.microReactionSsml ?? null;
  }

  return null;
}

// ============================================================================
// BACKCHANNELING API
// ============================================================================

/**
 * Get backchannel decision using orchestrator
 */
export function getBackchannelDecision(
  sessionId: string,
  personaId: string,
  context: {
    userSpeechDuration: number;
    currentPauseDuration: number;
    userEmotion: EmotionResult;
    topicWeight: 'light' | 'medium' | 'heavy';
    turnNumber: number;
    isBreathPause?: boolean;
    isEmotionalMoment?: boolean;
  }
): { shouldEmit: boolean; phrase: string | null; ssml: string | null } | null {
  if (!USE_ORCHESTRATOR) return null;

  const orchestrator = getOrchestrator(sessionId, personaId);

  return orchestrator.getBackchannel({
    sessionId,
    personaId,
    ...context,
  });
}

// ============================================================================
// TURN LIFECYCLE
// ============================================================================

/**
 * Signal start of a new turn
 */
export function signalNewTurn(sessionId: string): void {
  if (!USE_ORCHESTRATOR) return;

  const orchestrator = getOrchestrator(sessionId);
  orchestrator.newTurn();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  enableSpeechOrchestrator,
  disableSpeechOrchestrator,
  isOrchestratorEnabled,
  initializeSpeechOrchestrator,
  cleanupSpeechOrchestrator,
  humanizeWithOrchestrator,
  processAnticipation,
  getMicroReaction,
  getBackchannelDecision,
  signalNewTurn,
};

