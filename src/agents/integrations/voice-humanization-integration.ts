/**
 * Voice Humanization Integration
 *
 * Hooks the voice humanization service into the voice agent.
 * This module provides:
 * 1. Initialization for session start
 * 2. Event handlers for speech events
 * 3. SSML enhancement before TTS
 * 4. Micro-interruption handling for streaming transcription
 *
 * @module VoiceHumanizationIntegration
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getVoiceHumanizationService,
  resetVoiceHumanization,
  type MicroInterruptionResult,
  type EmotionalTtsAdjustments,
  type LaughterDetectionResult,
} from '../../speech/voice-humanization.js';
import type { VoiceEmotionResult, ProsodyFeatures } from '../../speech/audio-prosody.js';
import type { EmotionalArcTracker, EmotionalArc } from '../../conversation/emotional-arc.js';
import type { EnhancedTurnPrediction } from '../../speech/prosody-turn-bridge.js';

const log = getLogger().child({ module: 'VoiceHumanizationIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceHumanizationConfig {
  /** Enable micro-interruption detection */
  enableMicroInterruptions: boolean;
  /** Enable emotional arc adjustments */
  enableEmotionalAdjustments: boolean;
  /** Enable laughter detection */
  enableLaughterDetection: boolean;
  /** Enable rhythm mirroring */
  enableRhythmMirroring: boolean;
  /** Enable prosody-enhanced turn prediction */
  enableProsodyTurnPrediction: boolean;
}

export interface VoiceHumanizationHandlers {
  /** Called when micro-interruption detected - return true to stop agent */
  onMicroInterruption?: (result: MicroInterruptionResult) => boolean;
  /** Called when laughter detected */
  onLaughterDetected?: (result: LaughterDetectionResult) => void;
  /** Called before TTS to enhance SSML */
  beforeTts?: (text: string, adjustments: EmotionalTtsAdjustments) => string;
}

export interface IntegrationContext {
  sessionId: string;
  personaId: string;
  config: VoiceHumanizationConfig;
  handlers: VoiceHumanizationHandlers;
  emotionalArcTracker: EmotionalArcTracker | null;
}

export interface IntegrationResult {
  /** Process streaming transcription word-by-word */
  processStreamingWord: (
    word: string,
    isAgentSpeaking: boolean
  ) => MicroInterruptionResult;
  
  /** Process completed user utterance */
  processUtterance: (
    text: string,
    voiceEmotion: VoiceEmotionResult | null,
    options?: {
      speakingDurationMs?: number;
      silenceDurationMs?: number;
      topicWeight?: 'light' | 'medium' | 'heavy';
    }
  ) => EnhancedTurnPrediction;
  
  /** Enhance SSML before TTS */
  enhanceSsml: (text: string) => string;
  
  /** Record turn completion */
  recordTurn: () => void;
  
  /** Process audio frame for laughter/prosody */
  processAudioFrame: (
    prosody: ProsodyFeatures,
    durationMs: number
  ) => LaughterDetectionResult | null;
  
  /** Get current TTS adjustments */
  getTtsAdjustments: () => EmotionalTtsAdjustments;
  
  /** Cleanup */
  cleanup: () => void;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_CONFIG: VoiceHumanizationConfig = {
  enableMicroInterruptions: true,
  enableEmotionalAdjustments: true,
  enableLaughterDetection: true,
  enableRhythmMirroring: true,
  enableProsodyTurnPrediction: true,
};

// ============================================================================
// INTEGRATION FACTORY
// ============================================================================

/**
 * Initialize voice humanization integration for a session
 * Returns handlers to hook into voice agent events
 */
export function initializeVoiceHumanization(
  context: IntegrationContext
): IntegrationResult {
  const { sessionId, personaId, config, handlers, emotionalArcTracker } = context;
  
  // Get or create service instance
  const service = getVoiceHumanizationService(sessionId);
  
  log.info(
    {
      sessionId,
      personaId,
      config,
    },
    '🎤 Voice humanization integration initialized'
  );

  // Track last emotional arc for TTS adjustments
  let lastEmotionalArc: EmotionalArc | null = null;
  let lastTtsAdjustments: EmotionalTtsAdjustments = {
    openingPauseMs: 100,
    speedAdjust: 0,
    volumeAdjust: 1.0,
    ssmlEmotion: 'neutral',
    addBreaths: false,
    warmth: 'medium',
    reason: 'Default',
  };

  // ==========================================================================
  // STREAMING WORD PROCESSOR (for micro-interruptions)
  // ==========================================================================
  
  const processStreamingWord = (
    word: string,
    isAgentSpeaking: boolean
  ): MicroInterruptionResult => {
    if (!config.enableMicroInterruptions) {
      return {
        detected: false,
        trigger: null,
        urgency: 'none',
        shouldStopAgent: false,
        reason: 'Micro-interruptions disabled',
      };
    }

    const result = service.detectMicroInterruption(word, isAgentSpeaking);
    
    // Call handler if interruption detected
    if (result.detected && result.shouldStopAgent && handlers.onMicroInterruption) {
      handlers.onMicroInterruption(result);
    }
    
    return result;
  };

  // ==========================================================================
  // UTTERANCE PROCESSOR (for turn prediction with prosody)
  // ==========================================================================
  
  const processUtterance = (
    text: string,
    voiceEmotion: VoiceEmotionResult | null,
    options?: {
      speakingDurationMs?: number;
      silenceDurationMs?: number;
      topicWeight?: 'light' | 'medium' | 'heavy';
    }
  ): EnhancedTurnPrediction => {
    // Update rhythm profile if we have duration
    if (options?.speakingDurationMs) {
      service.updateRhythmProfile(text, options.speakingDurationMs);
    }

    if (!config.enableProsodyTurnPrediction) {
      // Return a basic prediction without prosody
      return {
        isComplete: true,
        confidence: 0.6,
        estimatedRemainingWords: 0,
        readyToRespond: true,
        reason: 'Prosody turn prediction disabled',
        suggestedWaitMs: 300,
        voiceSignals: {
          intonation: 'neutral',
          stressLevel: 0,
          speechRate: 0,
          confidenceFromVoice: 0,
        },
      };
    }

    return service.predictTurnWithVoice(text, voiceEmotion, options);
  };

  // ==========================================================================
  // SSML ENHANCER (applies emotional adjustments)
  // ==========================================================================
  
  const enhanceSsml = (text: string): string => {
    if (!config.enableEmotionalAdjustments) {
      return text;
    }

    // Get current emotional arc from tracker
    if (emotionalArcTracker) {
      lastEmotionalArc = emotionalArcTracker.getArc();
    }

    // Calculate TTS adjustments
    lastTtsAdjustments = service.getEmotionalTtsAdjustments(lastEmotionalArc);

    // Apply rhythm mirroring if enabled
    if (config.enableRhythmMirroring) {
      const rhythmAdj = service.getRhythmMirroringAdjustments();
      // Blend rhythm adjustments into TTS adjustments
      lastTtsAdjustments.openingPauseMs = Math.round(
        lastTtsAdjustments.openingPauseMs * rhythmAdj.pauseMultiplier
      );
    }

    // Apply adjustments to SSML
    let enhanced = service.applyEmotionalSsml(text, lastTtsAdjustments);
    
    // Call custom handler if provided
    if (handlers.beforeTts) {
      enhanced = handlers.beforeTts(enhanced, lastTtsAdjustments);
    }

    return enhanced;
  };

  // ==========================================================================
  // AUDIO FRAME PROCESSOR (for laughter detection)
  // ==========================================================================
  
  const processAudioFrame = (
    prosody: ProsodyFeatures,
    durationMs: number
  ): LaughterDetectionResult | null => {
    if (!config.enableLaughterDetection) {
      return null;
    }

    const result = service.detectLaughter(prosody, durationMs);
    
    if (result.isLaughing && handlers.onLaughterDetected) {
      handlers.onLaughterDetected(result);
    }
    
    return result;
  };

  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================
  
  const recordTurn = () => {
    service.recordTurn();
  };

  const getTtsAdjustments = (): EmotionalTtsAdjustments => {
    return lastTtsAdjustments;
  };

  const cleanup = () => {
    resetVoiceHumanization(sessionId);
    log.info({ sessionId }, '🧹 Voice humanization integration cleaned up');
  };

  // ==========================================================================
  // RETURN INTEGRATION HANDLERS
  // ==========================================================================
  
  return {
    processStreamingWord,
    processUtterance,
    enhanceSsml,
    recordTurn,
    processAudioFrame,
    getTtsAdjustments,
    cleanup,
  };
}

// ============================================================================
// QUICK INTEGRATION HELPER
// ============================================================================

/**
 * Quick setup for voice humanization with default config
 * Use this for simple integration into existing voice agents
 */
export function quickSetupVoiceHumanization(
  sessionId: string,
  personaId: string,
  emotionalArcTracker: EmotionalArcTracker | null,
  options?: {
    onInterrupt?: () => void;
    onLaughter?: (type: string) => void;
  }
): IntegrationResult {
  return initializeVoiceHumanization({
    sessionId,
    personaId,
    config: DEFAULT_CONFIG,
    emotionalArcTracker,
    handlers: {
      onMicroInterruption: (result) => {
        if (result.shouldStopAgent && options?.onInterrupt) {
          options.onInterrupt();
        }
        return result.shouldStopAgent;
      },
      onLaughterDetected: (result) => {
        if (options?.onLaughter) {
          options.onLaughter(result.laughType);
        }
      },
    },
  });
}

// ============================================================================
// SSML HELPERS
// ============================================================================

/**
 * Generate SSML for laughter response
 */
export function getLaughterResponseSsml(
  result: LaughterDetectionResult,
  personaId: string
): string {
  const service = getVoiceHumanizationService('temp');
  return service.getLaughterResponse(result, personaId) || '';
}

/**
 * Generate opening SSML based on emotional state
 */
export function getEmotionalOpeningSsml(
  arc: EmotionalArc | null,
  sessionId: string
): string {
  const service = getVoiceHumanizationService(sessionId);
  const adjustments = service.getEmotionalTtsAdjustments(arc);
  
  if (adjustments.openingPauseMs >= 150) {
    return `<break time="${adjustments.openingPauseMs}ms"/>`;
  }
  return '';
}

