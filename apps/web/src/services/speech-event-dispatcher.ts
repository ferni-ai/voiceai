/**
 * Speech Event Dispatcher
 * 
 * Central hub for speech state changes. Dispatches ferni:* events
 * that the Ferni EQ system and narrative bridge listen for.
 * 
 * This is the CRITICAL integration point that connects:
 * - LiveKit audio callbacks (connection.service.ts)
 * - Voice analysis (voice-analyzer.service.ts)
 * - Ferni EQ system (better-than-human.ui.ts)
 * - Narrative bridge (narrative-bridge.ts)
 * 
 * Events dispatched:
 * - ferni:user-speech-start - User started speaking
 * - ferni:user-speech-end - User stopped speaking
 * - ferni:user-speech-pause - User paused during speech (with duration)
 * - ferni:agent-speech-start - Agent started speaking
 * - ferni:agent-speech-end - Agent stopped speaking
 * 
 * @module @ferni/speech-event-dispatcher
 */

import { createLogger } from '../utils/logger.js';
import { latencyLogger } from './latency-logger.service.js';

const log = createLogger('SpeechEventDispatcher');

// ============================================================================
// STATE
// ============================================================================

interface SpeechState {
  userSpeaking: boolean;
  agentSpeaking: boolean;
  lastUserSpeechTime: number;
  lastAgentSpeechTime: number;
  pausePatterns: number[]; // Recent pause durations for breath sync
  pauseStartTime: number;
}

const state: SpeechState = {
  userSpeaking: false,
  agentSpeaking: false,
  lastUserSpeechTime: 0,
  lastAgentSpeechTime: 0,
  pausePatterns: [],
  pauseStartTime: 0,
};

let isInitialized = false;

// ============================================================================
// EVENT DISPATCHERS
// ============================================================================

/**
 * Dispatch user speech start event
 */
export function dispatchUserSpeechStart(): void {
  if (state.userSpeaking) return; // Already speaking
  
  state.userSpeaking = true;
  state.lastUserSpeechTime = Date.now();
  
  // If we were tracking a pause, end it
  if (state.pauseStartTime > 0) {
    const pauseDuration = Date.now() - state.pauseStartTime;
    if (pauseDuration > 200 && pauseDuration < 5000) {
      // Track for breath sync
      state.pausePatterns.push(pauseDuration);
      if (state.pausePatterns.length > 10) {
        state.pausePatterns.shift();
      }
    }
    state.pauseStartTime = 0;
  }
  
  document.dispatchEvent(new CustomEvent('ferni:user-speech-start'));
  log.debug('🎤 User speech started');
}

/**
 * Dispatch user speech end event
 */
export function dispatchUserSpeechEnd(): void {
  if (!state.userSpeaking) return; // Not speaking
  
  state.userSpeaking = false;
  state.lastUserSpeechTime = Date.now();
  
  // Start tracking potential pause
  state.pauseStartTime = Date.now();
  
  // ⏱️ Latency tracking: Mark user speech end for response timing
  latencyLogger.markUserSpeechEnd();
  
  document.dispatchEvent(new CustomEvent('ferni:user-speech-end'));
  log.debug('🎤 User speech ended');
}

/**
 * Dispatch user speech pause event
 * Called when a pause is detected during speech
 *
 * BETTER THAN HUMAN: Lowered threshold from 200ms to 150ms to catch
 * more natural breath pauses and enable more frequent micro-feedback.
 */
export function dispatchUserSpeechPause(duration: number): void {
  // Only dispatch meaningful pauses (150ms - 5000ms)
  // Lowered from 200ms to catch more natural pauses
  if (duration < 150 || duration > 5000) return;
  
  // Track for breath sync
  state.pausePatterns.push(duration);
  if (state.pausePatterns.length > 10) {
    state.pausePatterns.shift();
  }
  
  document.dispatchEvent(new CustomEvent('ferni:user-speech-pause', {
    detail: { duration }
  }));
  log.debug('🎤 User speech pause:', duration + 'ms');
}

/**
 * Dispatch agent speech start event
 */
export function dispatchAgentSpeechStart(): void {
  if (state.agentSpeaking) return; // Already speaking
  
  state.agentSpeaking = true;
  state.lastAgentSpeechTime = Date.now();
  
  // ⏱️ Latency tracking: Mark agent speech start for response timing
  latencyLogger.markAgentSpeechStart();
  
  document.dispatchEvent(new CustomEvent('ferni:agent-speech-start'));
  log.debug('🔊 Agent speech started');
}

/**
 * Dispatch agent speech end event
 */
export function dispatchAgentSpeechEnd(): void {
  if (!state.agentSpeaking) return; // Not speaking
  
  state.agentSpeaking = false;
  state.lastAgentSpeechTime = Date.now();
  
  document.dispatchEvent(new CustomEvent('ferni:agent-speech-end'));
  log.debug('🔊 Agent speech ended');
}

/**
 * Dispatch thinking event
 */
export function dispatchThinking(isThinking: boolean): void {
  document.dispatchEvent(new CustomEvent('ferni:thinking', {
    detail: { thinking: isThinking }
  }));
  log.debug('💭 Thinking:', isThinking);
}

// ============================================================================
// STATE GETTERS
// ============================================================================

/**
 * Check if user is currently speaking
 */
export function isUserSpeaking(): boolean {
  return state.userSpeaking;
}

/**
 * Check if agent is currently speaking
 */
export function isAgentSpeaking(): boolean {
  return state.agentSpeaking;
}

/**
 * Get recent pause patterns for breath sync
 */
export function getPausePatterns(): number[] {
  return [...state.pausePatterns];
}

/**
 * Get time since last user speech (ms)
 */
export function getTimeSinceUserSpeech(): number {
  if (state.userSpeaking) return 0;
  return Date.now() - state.lastUserSpeechTime;
}

/**
 * Get time since last agent speech (ms)
 */
export function getTimeSinceAgentSpeech(): number {
  if (state.agentSpeaking) return 0;
  return Date.now() - state.lastAgentSpeechTime;
}

// ============================================================================
// VOICE ANALYZER INTEGRATION
// ============================================================================

/**
 * Update from voice analyzer metrics
 * This should be called by voice-analyzer.service.ts on each analysis frame
 */
export function updateFromVoiceMetrics(metrics: {
  isSpeaking: boolean;
  silenceDuration: number;
}): void {
  // Detect transitions
  const wasSpeaking = state.userSpeaking;
  
  if (metrics.isSpeaking && !wasSpeaking) {
    dispatchUserSpeechStart();
  } else if (!metrics.isSpeaking && wasSpeaking) {
    dispatchUserSpeechEnd();
  }
  
  // Detect pauses during speech (when silence duration indicates a pause)
  // This catches brief pauses where isSpeaking might still be true
  // but silence duration is increasing
  // BETTER THAN HUMAN: Lowered from 300ms to 200ms for more responsive nodding
  if (state.pauseStartTime > 0 && metrics.isSpeaking) {
    const pauseDuration = Date.now() - state.pauseStartTime;
    if (pauseDuration >= 200 && pauseDuration < 5000) {
      dispatchUserSpeechPause(pauseDuration);
      state.pauseStartTime = 0; // Reset after dispatching
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the speech event dispatcher
 */
export function initSpeechEventDispatcher(): void {
  if (isInitialized) {
    log.debug('Speech event dispatcher already initialized');
    return;
  }
  
  // Reset state
  state.userSpeaking = false;
  state.agentSpeaking = false;
  state.lastUserSpeechTime = 0;
  state.lastAgentSpeechTime = 0;
  state.pausePatterns = [];
  state.pauseStartTime = 0;
  
  isInitialized = true;
  log.info('✅ Speech event dispatcher initialized');
}

/**
 * Dispose the speech event dispatcher
 */
export function disposeSpeechEventDispatcher(): void {
  isInitialized = false;
  log.info('Speech event dispatcher disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const speechEvents = {
  // Dispatchers
  userSpeechStart: dispatchUserSpeechStart,
  userSpeechEnd: dispatchUserSpeechEnd,
  userSpeechPause: dispatchUserSpeechPause,
  agentSpeechStart: dispatchAgentSpeechStart,
  agentSpeechEnd: dispatchAgentSpeechEnd,
  thinking: dispatchThinking,
  
  // State
  isUserSpeaking,
  isAgentSpeaking,
  getPausePatterns,
  getTimeSinceUserSpeech,
  getTimeSinceAgentSpeech,
  
  // Voice analyzer integration
  updateFromVoiceMetrics,
  
  // Lifecycle
  init: initSpeechEventDispatcher,
  dispose: disposeSpeechEventDispatcher,
};

// ============================================================================
// DEV/TEST HELPERS
// ============================================================================

/**
 * Enable console logging for all speech events
 * Run in browser console: window.__ferniSpeechEvents.enableLogging()
 */
export function enableSpeechEventLogging(): () => void {
  const handlers: Array<() => void> = [];
  
  const events = [
    'ferni:user-speech-start',
    'ferni:user-speech-end',
    'ferni:user-speech-pause',
    'ferni:agent-speech-start',
    'ferni:agent-speech-end',
    'ferni:thinking',
  ];
  
  events.forEach(eventName => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // eslint-disable-next-line no-console
      console.log(`✅ ${eventName}`, detail || '');
    };
    document.addEventListener(eventName, handler);
    handlers.push(() => document.removeEventListener(eventName, handler));
  });
  
  // eslint-disable-next-line no-console
  console.log('🎤 Speech event logging enabled. Listening for:', events);
  
  // Return cleanup function
  return () => {
    handlers.forEach(h => h());
    // eslint-disable-next-line no-console
    console.log('🎤 Speech event logging disabled');
  };
}

// Expose to window for easy browser console access
if (typeof window !== 'undefined') {
  (window as unknown as { __ferniSpeechEvents: typeof speechEvents & { enableLogging: typeof enableSpeechEventLogging } }).__ferniSpeechEvents = {
    ...speechEvents,
    enableLogging: enableSpeechEventLogging,
  };
}

