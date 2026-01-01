/**
 * Behavior Event Dispatcher
 *
 * The bidirectional bridge that enables:
 * 1. System → LLM: Dispatch behavior events based on detected signals
 * 2. LLM → Frontend: Forward behavior signals to update avatar/waveform
 *
 * This creates the "dynamic loop" where code triggers speech patterns
 * and speech triggers code behaviors.
 *
 * @module BehaviorEventDispatcher
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  BehaviorDetectionContext,
  BehaviorEvent,
  BehaviorEventType,
  BehaviorSignal,
  BehaviorSignalType,
  BehaviorState,
  DEFAULT_BEHAVIOR_STATE,
  SuggestedBehaviorResponse,
} from '../../types/behavior-types.js';

// Import signal factories from services layer (shared with tools)
import {
  createModeShiftSignal,
  createPacingChangeSignal,
  createHoldSpaceSignal,
  createProcessingSignal,
} from '../../services/behavior/index.js';

// Re-export for backward compatibility
export {
  createModeShiftSignal,
  createPacingChangeSignal,
  createHoldSpaceSignal,
  createProcessingSignal,
};

const log = createLogger({ module: 'BehaviorEventDispatcher' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Function to send data message (passed from voice-agent context)
 */
export type SendDataMessageFn = (type: string, payload: Record<string, unknown>) => Promise<void>;

/**
 * Function to inject message into LLM context
 */
export type InjectLLMMessageFn = (role: 'system' | 'user', content: string) => void;

// ============================================================================
// EVENT DETECTION
// ============================================================================

/**
 * Detection thresholds for behavior events
 */
const DETECTION_THRESHOLDS = {
  voiceTremor: {
    minIntensity: 0.4,
  },
  extendedSilence: {
    minDuration: 10000, // 10 seconds
    longDuration: 20000, // 20 seconds
  },
  emotionalShift: {
    minIntensityChange: 0.3,
    significantEmotions: ['sad', 'anxious', 'stressed', 'overwhelmed', 'excited', 'joyful'],
  },
  energyDrop: {
    threshold: 0.3,
  },
  lateNight: {
    startHour: 23, // 11 PM
    endHour: 5, // 5 AM
  },
  topicWeight: {
    heavyTopics: ['loss', 'death', 'grief', 'trauma', 'abuse', 'divorce', 'illness'],
  },
};

/**
 * Detect behavior events from context
 */
function detectBehaviorEvents(ctx: BehaviorDetectionContext): BehaviorEvent[] {
  const events: BehaviorEvent[] = [];
  const timestamp = Date.now();

  // 1. Voice tremor detection
  if (
    ctx.voiceAnalysis?.tremorDetected &&
    (ctx.voiceAnalysis.tremorIntensity ?? 0) >= DETECTION_THRESHOLDS.voiceTremor.minIntensity
  ) {
    events.push({
      event: 'voice_tremor_detected',
      data: {
        intensity: ctx.voiceAnalysis.tremorIntensity,
      },
      timestamp,
      suggestedResponse: {
        mode: 'presence',
        pacing: 'slower',
      },
    });
  }

  // 2. Extended silence detection
  if (ctx.silenceDuration) {
    if (ctx.silenceDuration >= DETECTION_THRESHOLDS.extendedSilence.longDuration) {
      events.push({
        event: 'extended_silence',
        data: {
          duration: ctx.silenceDuration,
          context: ctx.emotionalState?.primary === 'sad' ? 'processing' : 'disengaged',
          isLongSilence: true,
        },
        timestamp,
        suggestedResponse: {
          expression: 'warm_checkin',
        },
      });
    } else if (ctx.silenceDuration >= DETECTION_THRESHOLDS.extendedSilence.minDuration) {
      events.push({
        event: 'extended_silence',
        data: {
          duration: ctx.silenceDuration,
          context: 'brief_pause',
        },
        timestamp,
        suggestedResponse: {
          mode: 'holding_space',
        },
      });
    }
  }

  // 3. Emotional shift detection
  if (ctx.emotionalState && ctx.previousEmotionalState) {
    const intensityChange = Math.abs(
      ctx.emotionalState.intensity - ctx.previousEmotionalState.intensity
    );
    const emotionChanged = ctx.emotionalState.primary !== ctx.previousEmotionalState.primary;

    if (
      emotionChanged ||
      intensityChange >= DETECTION_THRESHOLDS.emotionalShift.minIntensityChange
    ) {
      const isSignificant = DETECTION_THRESHOLDS.emotionalShift.significantEmotions.includes(
        ctx.emotionalState.primary
      );

      if (isSignificant) {
        events.push({
          event: 'emotional_shift',
          data: {
            from: ctx.previousEmotionalState.primary,
            to: ctx.emotionalState.primary,
            intensityChange,
            newIntensity: ctx.emotionalState.intensity,
          },
          timestamp,
          suggestedResponse: {
            mode: ctx.emotionalState.distressLevel > 0.5 ? 'presence' : 'energy_match',
            pacing: ctx.emotionalState.intensity > 0.7 ? 'slower' : 'normal',
          },
        });
      }
    }
  }

  // 4. Late night detection
  if (ctx.hourOfDay !== undefined) {
    const isLateNight =
      ctx.hourOfDay >= DETECTION_THRESHOLDS.lateNight.startHour ||
      ctx.hourOfDay < DETECTION_THRESHOLDS.lateNight.endHour;

    if (isLateNight) {
      events.push({
        event: 'late_night_detected',
        data: {
          hour: ctx.hourOfDay,
        },
        timestamp,
        suggestedResponse: {
          pacing: 'slower',
          mode: 'presence',
        },
      });
    }
  }

  // 5. Energy drop detection
  if (
    ctx.voiceAnalysis?.energyLevel !== undefined &&
    ctx.voiceAnalysis.energyLevel < DETECTION_THRESHOLDS.energyDrop.threshold
  ) {
    events.push({
      event: 'energy_drop',
      data: {
        energyLevel: ctx.voiceAnalysis.energyLevel,
      },
      timestamp,
      suggestedResponse: {
        mode: 'grounding',
        pacing: 'slower',
      },
    });
  }

  // 6. Topic weight detection
  if (ctx.topicWeight === 'heavy') {
    events.push({
      event: 'topic_weight_heavy',
      data: {
        weight: 'heavy',
      },
      timestamp,
      suggestedResponse: {
        mode: 'holding_space',
        pacing: 'slower',
      },
    });
  }

  // 7. Vulnerability shared (high distress + personal topic)
  if (ctx.emotionalState && ctx.emotionalState.distressLevel > 0.6 && ctx.topicWeight === 'heavy') {
    events.push({
      event: 'vulnerability_shared',
      data: {
        distressLevel: ctx.emotionalState.distressLevel,
        emotion: ctx.emotionalState.primary,
      },
      timestamp,
      suggestedResponse: {
        mode: 'presence',
        holdSpace: true,
      },
    });
  }

  // 8. User interrupted
  if (ctx.userInterrupted) {
    events.push({
      event: 'user_interrupted',
      data: {},
      timestamp,
      suggestedResponse: {
        expression: 'yield',
      },
    });
  }

  // 9. Tool status events
  if (ctx.toolStatus?.inProgress) {
    events.push({
      event: 'tool_started',
      data: {
        toolName: ctx.toolStatus.toolName,
        startTime: ctx.toolStatus.startTime,
      },
      timestamp,
    });
  }

  return events;
}

// ============================================================================
// LLM INJECTION
// ============================================================================

/**
 * Format behavior events for injection into LLM context
 */
function formatEventsForLLM(events: BehaviorEvent[]): string {
  if (events.length === 0) return '';

  const eventLines = events.map((event) => {
    const eventJson = JSON.stringify({
      event: event.event,
      data: event.data,
      suggestedResponse: event.suggestedResponse,
    });
    return `[SYSTEM_EVENT]\n${eventJson}`;
  });

  return eventLines.join('\n\n');
}

/**
 * Inject behavior events into LLM context
 */
export function injectBehaviorEvents(
  events: BehaviorEvent[],
  injectMessage: InjectLLMMessageFn
): void {
  if (events.length === 0) return;

  const formattedEvents = formatEventsForLLM(events);

  injectMessage(
    'system',
    `[BEHAVIOR SYSTEM - Real-time Awareness]\n\n${formattedEvents}\n\n` +
      `You may call behavior functions (shiftMode, processing, holdSpace) ` +
      `in response to these events, or respond naturally - they inform but don't require action.`
  );

  log.debug({ eventCount: events.length }, 'Injected behavior events into LLM context');
}

// ============================================================================
// FRONTEND SIGNALING
// ============================================================================

/**
 * Emit behavior signal to frontend
 */
export async function emitBehaviorSignal(
  signal: BehaviorSignal,
  sendDataMessage: SendDataMessageFn
): Promise<void> {
  try {
    await sendDataMessage('behavior_signal', {
      ...signal,
    });

    log.debug(
      { signalType: signal.type, mode: signal.mode },
      '🚀 Emitted behavior signal to frontend'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to emit behavior signal');
  }
}

// ============================================================================
// MAIN DISPATCHER FUNCTION
// ============================================================================

/**
 * Main entry point: Detect and dispatch behavior events
 *
 * This function:
 * 1. Analyzes the context to detect relevant behavior events
 * 2. Injects events into the LLM context
 * 3. Logs for debugging
 *
 * @param ctx - Context for detecting behavior events
 * @param injectMessage - Function to inject message into LLM context
 * @returns The detected events (for further processing if needed)
 */
export function dispatchBehaviorEvents(
  ctx: BehaviorDetectionContext,
  injectMessage: InjectLLMMessageFn
): BehaviorEvent[] {
  // Detect events from context
  const events = detectBehaviorEvents(ctx);

  if (events.length === 0) {
    log.debug('No behavior events detected');
    return [];
  }

  // Inject into LLM context
  injectBehaviorEvents(events, injectMessage);

  // Log summary
  const eventTypes = events.map((e) => e.event).join(', ');
  log.info({ eventTypes, count: events.length }, '🔄 Behavior events dispatched');

  return events;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { BehaviorDetectionContext };

export { DETECTION_THRESHOLDS };
