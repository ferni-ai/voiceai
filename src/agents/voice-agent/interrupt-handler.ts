/**
 * Interrupt Handler
 *
 * Handles micro-interruption detection and graceful interrupt sensing.
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * Responsibilities:
 * - Micro-interruption detection (stops agent when user says "wait", "hold on")
 * - Graceful interrupt sensing (pre-emptive trailing before hard cut)
 *
 * @module voice-agent/interrupt-handler
 */

import { diag } from '../../services/diagnostic-logger.js';
import { senseInterrupt, getTrailingSsml } from '../../speech/graceful-interrupt/index.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import type { IntegrationResult as VoiceHumanizationIntegration } from '../integrations/voice-humanization-integration.js';
import type { UserData } from '../shared/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface InterruptContext {
  /** The transcript text to check for interruption signals */
  transcript: string;
  /** Voice humanization integration for micro-interruption detection */
  voiceHumanization: VoiceHumanizationIntegration | null;
  /** Conversation manager for checking agent speaking state */
  conversationManager: ConversationManager;
  /** User data for storing interrupt type and pending SSML */
  userData: UserData;
  /** Session ID for logging */
  sessionId: string;
}

export interface InterruptResult {
  /** Whether the agent should stop speaking */
  shouldStopAgent: boolean;
  /** The trigger word/phrase that caused the interrupt */
  trigger?: string;
  /** Whether pre-emptive trailing SSML should be injected */
  shouldInjectTrailing: boolean;
  /** The trailing SSML to inject, if any */
  trailingSsml?: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Process transcript for interruption signals
 *
 * Checks both micro-interruptions (stop words like "wait", "hold on")
 * and graceful interrupts (pre-emptive trailing before hard cut).
 *
 * @param ctx - The interrupt context
 * @returns Interrupt result with flags and optional SSML
 */
export function processInterruptSignals(ctx: InterruptContext): InterruptResult {
  const { transcript, voiceHumanization, conversationManager, userData, sessionId } = ctx;

  const result: InterruptResult = {
    shouldStopAgent: false,
    shouldInjectTrailing: false,
  };

  if (!transcript || !voiceHumanization) {
    return result;
  }

  const isAgentSpeaking = conversationManager.isAgentSpeaking();

  // ===============================================
  // MICRO-INTERRUPTION DETECTION
  // Check for stop words like "wait", "hold on", "actually"
  // These should stop agent immediately
  // ===============================================
  const microInterrupt = voiceHumanization.processStreamingWord(transcript, isAgentSpeaking);

  if (microInterrupt.shouldStopAgent) {
    diag.state('Micro-interrupt triggered', {
      trigger: microInterrupt.trigger,
      transcript: transcript.slice(0, 30),
    });

    // Set hard interrupt type for more deliberate recovery
    userData.interruptType = 'hard';
    result.shouldStopAgent = true;
    result.trigger = microInterrupt.trigger ?? undefined;
  }

  // ===============================================
  // GRACEFUL INTERRUPT: Pre-emptive trailing
  // Sense when user is about to interrupt and inject
  // trailing-off SSML before the hard cut happens
  // ===============================================
  const interruptSense = senseInterrupt(sessionId, transcript, isAgentSpeaking);

  if (interruptSense.shouldTrail) {
    const trailingSsml = getTrailingSsml(sessionId);

    if (trailingSsml) {
      diag.state('Injecting pre-emptive trailing', {
        trigger: interruptSense.trigger,
        trailing: trailingSsml.slice(0, 30),
      });

      // Store the trailing SSML for the TTS stream to pick up
      userData.pendingTrailingSsml = trailingSsml;
      result.shouldInjectTrailing = true;
      result.trailingSsml = trailingSsml;
    }
  }

  return result;
}

/**
 * Check if a transcript contains micro-interruption signals
 * without modifying any state.
 *
 * @param transcript - The transcript to check
 * @param voiceHumanization - Voice humanization integration
 * @param isAgentSpeaking - Whether agent is currently speaking
 * @returns Whether transcript contains interrupt signals
 */
export function hasMicroInterruptSignal(
  transcript: string,
  voiceHumanization: VoiceHumanizationIntegration | null,
  isAgentSpeaking: boolean
): boolean {
  if (!transcript || !voiceHumanization) {
    return false;
  }

  const result = voiceHumanization.processStreamingWord(transcript, isAgentSpeaking);
  return result.shouldStopAgent;
}

export default {
  processInterruptSignals,
  hasMicroInterruptSignal,
};
