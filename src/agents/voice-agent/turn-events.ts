/**
 * Turn Event Dispatch
 *
 * Handles dispatching events to the frontend during turn processing.
 * Extracted from turn-handler.ts for maintainability.
 *
 * Responsibilities:
 * - Emotion event dispatch (Ferni EQ)
 * - Behavior event dispatch (bidirectional behavior system)
 * - Celebration event dispatch
 * - Mood update dispatch
 *
 * @module voice-agent/turn-events
 */

import { log, type llm } from '@livekit/agents';
import {
  dispatchEmotionEvents,
  dispatchExpressionUpdate,
} from '../realtime/emotion-event-dispatcher.js';
import {
  dispatchBehaviorEvents,
  type BehaviorDetectionContext,
} from '../realtime/behavior-event-dispatcher.js';
import { diag } from '../../services/observability/diagnostic-logger.js';
import type { SessionStateManager } from '../session/session-state.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EventDispatchContext {
  /** User ID (required for emotion events) */
  userId: string | null;
  /** Persona ID */
  personaId: string;
  /** Session ID */
  sessionId: string;
  /** Turn count */
  turnCount: number;
  /** Emotional analysis result */
  emotionalResult: {
    primary: string;
    intensity: number;
    distressLevel: number;
    trajectory?: string;
  };
  /** Humanizing result from turn processing */
  humanizingResult?: {
    mood?: { state?: string; energyLevel?: number };
    relationship?: { stage?: string };
    relationshipTransition?: unknown;
  };
  /** Context injections from turn processing */
  injections: Array<{ category: string; content: string }>;
  /** Session state manager */
  sessionStateManager?: SessionStateManager;
  /** Send data message callback */
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
  /** LLM chat context for injecting behavior events */
  turnCtx: llm.ChatContext;
}

export interface EventDispatchResult {
  /** Number of emotion events dispatched */
  emotionEventsDispatched: number;
  /** Number of behavior events dispatched */
  behaviorEventsDispatched: number;
  /** Whether mood update was sent */
  moodUpdateSent: boolean;
}

// ============================================================================
// EMOTION EVENT DISPATCH
// ============================================================================

/**
 * Dispatch emotion events to the frontend EQ system.
 *
 * This sends humanization signals to the frontend:
 * - Concern detection (distress awareness)
 * - Voice-text mismatch (protective instinct)
 * - Emotional trajectory (improving/declining arc)
 *
 * The frontend better-than-human.ui.ts responds with avatar expressions.
 */
export async function dispatchTurnEmotionEvents(ctx: EventDispatchContext): Promise<number> {
  const logger = log();

  if (!ctx.userId) {
    return 0;
  }

  try {
    // Map trajectory to valid values for emotion events
    const trajectoryMap: Record<
      string,
      'unknown' | 'improving' | 'stable' | 'declining' | 'volatile'
    > = {
      improving: 'improving',
      stable: 'stable',
      declining: 'declining',
      volatile: 'volatile',
      rising: 'improving',
      falling: 'declining',
    };
    const mappedTrajectory = ctx.emotionalResult.trajectory
      ? (trajectoryMap[ctx.emotionalResult.trajectory] ?? 'unknown')
      : 'unknown';

    await dispatchEmotionEvents(
      {
        emotionalState: {
          ...ctx.emotionalResult,
          trajectory: mappedTrajectory,
        },
        userId: ctx.userId,
        personaId: ctx.personaId,
        sessionId: ctx.sessionId,
      },
      ctx.sendDataMessage
    );

    // Also dispatch Luxo expression update for richer avatar reactions
    await dispatchExpressionUpdate(
      {
        emotion: ctx.emotionalResult.primary || 'neutral',
        intensity: ctx.emotionalResult.intensity ?? 0.5,
      },
      ctx.sendDataMessage
    );

    return 1;
  } catch (eqError) {
    logger.debug({ error: String(eqError) }, 'Emotion event dispatch (non-critical)');
    return 0;
  }
}

// ============================================================================
// BEHAVIOR EVENT DISPATCH
// ============================================================================

/**
 * Build behavior detection context from turn context.
 */
export function buildBehaviorContext(ctx: EventDispatchContext): BehaviorDetectionContext {
  return {
    emotionalState: {
      primary: ctx.emotionalResult.primary,
      intensity: ctx.emotionalResult.intensity,
      distressLevel: ctx.emotionalResult.distressLevel,
      trajectory: ctx.emotionalResult.trajectory,
    },
    // Previous emotional state from session state manager
    previousEmotionalState: ctx.sessionStateManager?.getState().emotional.lastEmotionAnalysis
      ? {
          primary:
            ctx.sessionStateManager.getState().emotional.lastEmotionAnalysis?.primary || 'neutral',
          intensity:
            ctx.sessionStateManager.getState().emotional.lastEmotionAnalysis?.intensity || 0,
        }
      : undefined,
    // Time of day
    hourOfDay: new Date().getHours(),
    // Topic weight detection
    topicWeight:
      ctx.emotionalResult.distressLevel > 0.6 ||
      ctx.injections.some(
        (i) =>
          i.content.toLowerCase().includes('grief') ||
          i.content.toLowerCase().includes('loss') ||
          i.content.toLowerCase().includes('death')
      )
        ? 'heavy'
        : ctx.emotionalResult.intensity > 0.5
          ? 'medium'
          : 'light',
    // Relationship stage
    relationshipStage: ctx.humanizingResult?.relationship?.stage || 'developing',
    // Turn count
    turnCount: ctx.turnCount,
  };
}

/**
 * Dispatch behavior events to both LLM context and frontend.
 *
 * This enables the bidirectional behavior system:
 * - System detects → dispatches event → LLM responds → calls behavior → loop
 */
export async function dispatchTurnBehaviorEvents(ctx: EventDispatchContext): Promise<number> {
  const logger = log();

  try {
    const behaviorContext = buildBehaviorContext(ctx);

    // Inject behavior events into LLM context
    const behaviorEvents = dispatchBehaviorEvents(behaviorContext, (role, content) => {
      ctx.turnCtx.addMessage({ role, content });
    });

    if (behaviorEvents.length > 0) {
      diag.info('🔄 Behavior events dispatched', {
        events: behaviorEvents.map((e) => e.event).join(', '),
        count: behaviorEvents.length,
      });

      // Also emit to frontend for immediate visual feedback
      for (const event of behaviorEvents) {
        if (event.suggestedResponse) {
          try {
            // Emit mode shift signal if suggested
            if (event.suggestedResponse.mode) {
              await ctx.sendDataMessage('behavior_signal', {
                type: 'mode_shift',
                mode: event.suggestedResponse.mode,
                reason: event.event,
                timestamp: Date.now(),
              });
            }
            // Emit pacing change signal if suggested
            if (event.suggestedResponse.pacing) {
              await ctx.sendDataMessage('behavior_signal', {
                type: 'pacing_change',
                pacing: event.suggestedResponse.pacing,
                reason: event.event,
                timestamp: Date.now(),
              });
            }
          } catch (emitError) {
            logger.debug(
              { error: String(emitError) },
              'Failed to emit behavior signal (non-critical)'
            );
          }
        }
      }
    }

    return behaviorEvents.length;
  } catch (behaviorError) {
    logger.debug({ error: String(behaviorError) }, 'Behavior event dispatch (non-critical)');
    return 0;
  }
}

// ============================================================================
// MOOD UPDATE DISPATCH
// ============================================================================

/**
 * Send mood update to the frontend.
 */
export async function sendMoodUpdate(ctx: EventDispatchContext): Promise<boolean> {
  if (!ctx.humanizingResult) {
    return false;
  }

  try {
    const hr = ctx.humanizingResult;
    await ctx.sendDataMessage('mood', {
      state: hr.mood?.state,
      energyLevel: hr.mood?.energyLevel,
      relationshipStage: hr.relationship?.stage,
      hasTransition: !!hr.relationshipTransition,
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// COMBINED EVENT DISPATCH
// ============================================================================

/**
 * Dispatch all turn events (emotion, behavior, mood).
 *
 * This is the main entry point for event dispatch during turn processing.
 */
export async function dispatchAllTurnEvents(
  ctx: EventDispatchContext
): Promise<EventDispatchResult> {
  const [emotionCount, behaviorCount, moodSent] = await Promise.all([
    dispatchTurnEmotionEvents(ctx),
    dispatchTurnBehaviorEvents(ctx),
    sendMoodUpdate(ctx),
  ]);

  return {
    emotionEventsDispatched: emotionCount,
    behaviorEventsDispatched: behaviorCount,
    moodUpdateSent: moodSent,
  };
}
