/**
 * Anticipation Handler
 *
 * Handles all anticipation logic for "Better Than Human" experience:
 * - Sesame-inspired anticipatory prosody
 * - Unified anticipation pipeline
 * - Anticipatory triggers (Phase 5)
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/anticipation-handler
 */

import { diag } from '../../services/diagnostic-logger.js';
import {
  processPartialTranscript as processSesamePartial,
  startNewTurn as startSesameTurn,
} from '../../speech/sesame-inspired/index.js';
import { getAnticipationPipeline } from '../../speech/anticipation/index.js';
import {
  learnFromUtterance,
  processPartialInput as processAnticipatoryInput,
  recordAnticipatoryOutcome,
  type VoiceProsodyCue,
} from '../../intelligence/triggers/index.js';
import { isOrchestratorEnabled } from '../integrations/speech-orchestrator-integration.js';
import { coordinatedSay } from '../../speech/coordination/index.js';
import type { UserData } from '../shared/types.js';
import type { ConversationManager } from '../../services/conversation-manager.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AnticipationContext {
  /** Session ID */
  sessionId: string;
  /** The partial transcript text */
  transcript: string;
  /** User data for voice emotion and anticipatory intelligence */
  userData: UserData;
  /** Conversation manager for checking agent speaking state */
  conversationManager: ConversationManager;
  /** Function to send data messages to frontend */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

export interface AnticipationResult {
  /** Whether any anticipation was triggered */
  triggered: boolean;
  /** Intent prediction if available */
  intent?: string;
  /** Intent confidence */
  intentConfidence?: number;
  /** Emotional trajectory prediction */
  emotionTrajectory?: string;
  /** Prosody adjustments for response */
  prosody?: {
    speedMultiplier: number;
    microReactionSsml?: string;
  };
}

export interface AnticipatoryTriggerContext {
  /** Session ID */
  sessionId: string;
  /** The partial transcript text */
  transcript: string;
  /** User data with anticipatory intelligence config */
  userData: UserData;
  /** Conversation manager for checking agent speaking state */
  conversationManager: ConversationManager;
  /** Function to send data messages to frontend */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

// ============================================================================
// SESAME-INSPIRED ANTICIPATORY PROSODY
// ============================================================================

/**
 * Process partial transcript for Sesame-inspired anticipatory prosody.
 * Pre-computes response prosody while user is still speaking.
 *
 * @param sessionId - Session ID
 * @param transcript - Partial transcript
 * @param voiceEmotion - Optional voice emotion data
 */
export function processSesameAnticipation(
  sessionId: string,
  transcript: string,
  voiceEmotion?: UserData['voiceEmotion']
): void {
  try {
    processSesamePartial(sessionId, {
      text: transcript,
      isSpeaking: true,
      // Detect tone from voice emotion if available
      tone: voiceEmotion?.primary as
        | 'neutral'
        | 'excited'
        | 'sad'
        | 'frustrated'
        | 'curious'
        | undefined,
    });
  } catch {
    // Sesame processing is non-critical
  }
}

/**
 * Signal turn boundary to reset anticipatory prosody state.
 * Call at the start of a new turn.
 *
 * @param sessionId - Session ID
 */
export function signalNewTurn(sessionId: string): void {
  try {
    startSesameTurn(sessionId);
  } catch {
    // Sesame processing is non-critical
  }
}

// ============================================================================
// UNIFIED ANTICIPATION PIPELINE
// ============================================================================

/**
 * Process partial transcript through unified anticipation pipeline.
 * Predicts user intent, emotional trajectory, and prepares prosody adjustments.
 *
 * @param ctx - Anticipation context
 * @returns Anticipation result with predictions
 */
export function processUnifiedAnticipation(ctx: AnticipationContext): AnticipationResult {
  const { sessionId, transcript, userData, sendDataMessage } = ctx;

  const result: AnticipationResult = {
    triggered: false,
  };

  if (!isOrchestratorEnabled()) {
    return result;
  }

  try {
    // Get anticipation pipeline for this session
    const pipeline = getAnticipationPipeline(sessionId);

    // Process the partial transcript
    const anticipation = pipeline.process({
      sessionId,
      partialTranscript: transcript,
      isSpeaking: true,
      tone: userData.voiceEmotion?.primary as
        | 'neutral'
        | 'excited'
        | 'sad'
        | 'frustrated'
        | 'curious'
        | undefined,
    });

    // If actionable, populate result
    if (anticipation?.isActionable) {
      result.triggered = true;
      result.intent = anticipation.intent.intent;
      result.intentConfidence = anticipation.intent.confidence;
      result.emotionTrajectory = anticipation.emotion.trajectory;
      result.prosody = {
        speedMultiplier: anticipation.prosody.speedMultiplier,
        microReactionSsml: anticipation.prosody.microReactionSsml ?? undefined,
      };

      // Store on userData for turn handler to use
      (
        userData as UserData & { anticipatedProsody?: typeof anticipation.prosody }
      ).anticipatedProsody = anticipation.prosody;

      diag.state('Anticipation pipeline result', {
        intent: anticipation.intent.intent,
        intentConfidence: anticipation.intent.confidence.toFixed(2),
        emotionTrajectory: anticipation.emotion.trajectory,
        emotionConfidence: anticipation.emotion.confidence.toFixed(2),
        speedMultiplier: anticipation.prosody.speedMultiplier.toFixed(2),
        microReaction: !!anticipation.prosody.microReactionSsml,
      });

      // Send anticipation to frontend BEFORE turn completes
      // Enables avatar to show emotional response while user is still speaking
      if (sendDataMessage && anticipation.emotion.confidence > 0.5) {
        const urgency =
          anticipation.emotion.trajectory.includes('distress') ||
          anticipation.emotion.trajectory.includes('crisis')
            ? 'high'
            : anticipation.emotion.trajectory.includes('stable')
              ? 'low'
              : 'normal';

        void sendDataMessage('anticipation_signal', {
          intent: anticipation.intent.intent,
          intentConfidence: anticipation.intent.confidence,
          emotionTrajectory: anticipation.emotion.trajectory,
          predictedEmotion:
            anticipation.emotion.anticipatedEmotion || anticipation.emotion.trajectory,
          emotionConfidence: anticipation.emotion.confidence,
          urgency,
          timestamp: Date.now(),
        }).catch(() => {
          // Non-critical
        });

        diag.state('Anticipation signal sent to frontend', {
          intent: anticipation.intent.intent,
          trajectory: anticipation.emotion.trajectory,
        });
      }
    }
  } catch {
    // Anticipation pipeline processing is non-critical
  }

  return result;
}

// ============================================================================
// ANTICIPATORY TRIGGERS (PHASE 5)
// ============================================================================

/**
 * Build voice prosody cues from user data for anticipatory trigger detection.
 *
 * @param userData - User data with voice emotion
 * @returns Voice prosody cues in the expected format
 */
function buildVoiceProsodyCues(
  userData: UserData
): { cues: VoiceProsodyCue[]; overallScore: number } | undefined {
  if (!userData.voiceEmotion) {
    return undefined;
  }

  const cues: VoiceProsodyCue[] = [];
  const confidence = userData.voiceEmotion.confidence || 0.5;

  // Map emotion to prosody cues
  if (userData.voiceEmotion.primary === 'sad') {
    cues.push({
      type: 'tremor',
      intensity: confidence,
      typicalMeaning: 'vulnerability',
      reliability: 0.7,
      observations: 1,
    });
  }

  if (userData.voiceEmotion.primary === 'angry' || userData.voiceEmotion.primary === 'sad') {
    cues.push({
      type: 'pitch_change',
      direction: 'irregular',
      intensity: confidence,
      typicalMeaning: 'distress',
      reliability: 0.6,
      observations: 1,
    });
  }

  // Add pause detection if we have breath pause data
  if (userData.isInBreathPause) {
    cues.push({
      type: 'pause',
      intensity: 0.6,
      typicalMeaning: 'processing',
      reliability: 0.5,
      observations: 1,
    });
  }

  return {
    cues,
    overallScore: confidence,
  };
}

/**
 * Process anticipatory triggers for "Better Than Human" early signal detection.
 * Detects vulnerability, distress, celebration, etc. from partial input.
 *
 * @param ctx - Anticipatory trigger context
 * @returns Whether a trigger was fired
 */
export function processAnticipatoryTriggers(ctx: AnticipatoryTriggerContext): boolean {
  const { sessionId, transcript, userData, conversationManager, sendDataMessage } = ctx;

  if (!userData.anticipatoryIntelligence || conversationManager.isAgentSpeaking()) {
    return false;
  }

  try {
    const voiceProsody = buildVoiceProsodyCues(userData);

    // Check session-level safeguards
    const now = Date.now();
    const firingsThisSession = userData.anticipatoryFiringsThisSession ?? 0;
    const lastFiringAt = userData.lastAnticipatoryFiringAt ?? 0;
    const cooldownMs =
      (userData.anticipatoryIntelligence.safeguards?.minSecondsBetween ?? 120) * 1000;
    const maxPerSession = userData.anticipatoryIntelligence.safeguards?.maxPerSession ?? 3;

    // Skip if we've exceeded session limits
    if (firingsThisSession >= maxPerSession || now - lastFiringAt <= cooldownMs) {
      return false;
    }

    const result = processAnticipatoryInput(
      sessionId,
      transcript,
      userData.anticipatoryIntelligence,
      voiceProsody,
      userData.lastTopic
    );

    if (result.shouldFire && result.verbalResponse) {
      // Speak the anticipatory response via coordinated speech
      void coordinatedSay(sessionId, result.verbalResponse, { allowInterruptions: true });

      // Send avatar cue to frontend
      if (sendDataMessage && result.responseTemplate?.nonVerbal) {
        void sendDataMessage('avatar_cue', {
          type: 'anticipatory_response',
          ...result.responseTemplate.nonVerbal,
          anticipatedOutcome: result.anticipatedOutcome,
        });
      }

      // Update session-level tracking
      userData.anticipatoryFiringsThisSession = firingsThisSession + 1;
      userData.lastAnticipatoryFiringAt = now;

      // Store pending result for outcome recording when final transcript arrives
      if (result.detection) {
        userData.pendingAnticipatoryResult = {
          detection: result.detection,
          firedAt: now,
          verbalResponse: result.verbalResponse,
          anticipatedOutcome: result.anticipatedOutcome || 'unknown',
        };
      }

      diag.session('Anticipatory trigger fired', {
        anticipatedOutcome: result.anticipatedOutcome,
        confidence: result.confidence.toFixed(2),
        partialTranscript: transcript.slice(0, 50),
      });

      return true;
    }
  } catch {
    // Anticipatory trigger processing is non-critical
  }

  return false;
}

/**
 * Record outcome of an anticipatory trigger for learning.
 * Call when final transcript arrives after a trigger was fired.
 *
 * @param userData - User data with pending anticipatory result and trigger profile
 * @param cleanedTranscript - The final cleaned transcript
 */
export function recordAnticipatoryOutcomeFromTranscript(
  userData: UserData,
  cleanedTranscript: string
): void {
  if (!userData.pendingAnticipatoryResult || !userData.triggerProfile) {
    return;
  }

  try {
    // Determine user reaction based on how they continued
    let userReaction: 'appreciated' | 'continued' | 'ignored' | 'corrected' | 'annoyed' =
      'continued';

    const response = cleanedTranscript.toLowerCase();
    if (response.includes('thank') || response.includes('exactly') || response.includes('yes')) {
      userReaction = 'appreciated';
    } else if (
      response.includes('no') ||
      response.includes("that's not") ||
      response.includes("i wasn't")
    ) {
      userReaction = 'corrected';
    } else if (response.includes('anyway') || response.includes('moving on')) {
      userReaction = 'ignored';
    }

    // Record outcome for learning
    const updatedProfile = recordAnticipatoryOutcome(
      userData.triggerProfile,
      '',
      userData.pendingAnticipatoryResult.detection,
      userReaction,
      'space_creating',
      userData.voiceEmotion?.confidence ?? 0,
      userReaction === 'appreciated' || userReaction === 'continued'
    );

    // Also learn from the completed utterance
    const { anticipatedOutcome } = userData.pendingAnticipatoryResult;
    const profileWithLearning = learnFromUtterance(updatedProfile, {
      fullUtterance: cleanedTranscript,
      actualOutcome: (anticipatedOutcome || 'processing') as
        | 'vulnerability'
        | 'distress'
        | 'celebration'
        | 'processing'
        | 'avoidance'
        | 'request',
      voiceCues: userData.voiceEmotion
        ? [
            {
              type: 'pitch_change' as const,
              direction: 'irregular' as const,
              intensity: userData.voiceEmotion.confidence ?? 0.5,
              typicalMeaning: 'distress' as const,
              reliability: 0.6,
              observations: 1,
            },
          ]
        : [],
      sessionId: '',
      activatedTriggers: [],
    });

    // Update profile for session-end save
    userData.triggerProfile = profileWithLearning;
    userData.anticipatoryIntelligence = profileWithLearning.anticipatoryIntelligence;

    diag.session('Anticipatory outcome recorded', {
      anticipatedOutcome: userData.pendingAnticipatoryResult.anticipatedOutcome,
      userReaction,
      timeSinceFiring: Date.now() - userData.pendingAnticipatoryResult.firedAt,
    });
  } catch {
    // Outcome recording is non-critical
  } finally {
    // Clear pending result
    userData.pendingAnticipatoryResult = null;
  }
}

export default {
  processSesameAnticipation,
  signalNewTurn,
  processUnifiedAnticipation,
  processAnticipatoryTriggers,
  recordAnticipatoryOutcomeFromTranscript,
};
