/**
 * Session Dynamics Integration
 *
 * Integrates the SessionDynamicsEngine into the voice agent pipeline.
 * Provides phase-aware context for natural conversation flow.
 *
 * @module agents/integrations/session-dynamics-integration
 */

import {
  getSessionDynamicsEngine,
  resetSessionDynamicsEngine,
  type ConversationPhase,
  type PhaseBehavior,
  type SessionDynamicsState,
} from '../../conversation/humanization/session-dynamics.js';
import { diag } from '../../services/observability/diagnostic-logger.js';
import type { ContextInjection } from '../processors/types.js';

// Re-export types for convenience
export type { ConversationPhase, PhaseBehavior, SessionDynamicsState };

// ============================================================================
// PHASE UPDATE
// ============================================================================

/**
 * Context for updating session dynamics
 */
export interface SessionDynamicsUpdateContext {
  sessionId: string;
  turnCount: number;
  userEnergy?: 'high' | 'medium' | 'low';
  topicWeight?: 'light' | 'medium' | 'heavy';
  wasDeepMoment?: boolean;
  userInitiatedWindDown?: boolean;
}

/**
 * Update session dynamics based on turn context.
 * Call this at the start of each turn processing.
 */
export function updateSessionDynamics(ctx: SessionDynamicsUpdateContext): {
  phase: ConversationPhase;
  phaseChanged: boolean;
  behavior: PhaseBehavior;
} {
  const engine = getSessionDynamicsEngine(ctx.sessionId);
  const previousPhase = engine.getState().phase;

  engine.update({
    turnCount: ctx.turnCount,
    userEnergy: ctx.userEnergy,
    topicWeight: ctx.topicWeight,
    wasDeepMoment: ctx.wasDeepMoment,
    userInitiatedWindDown: ctx.userInitiatedWindDown,
  });

  const newPhase = engine.getState().phase;
  const phaseChanged = previousPhase !== newPhase;

  if (phaseChanged) {
    diag.info('📈 Session phase transition', {
      sessionId: ctx.sessionId,
      fromPhase: previousPhase,
      toPhase: newPhase,
      turnCount: ctx.turnCount,
    });
  }

  return {
    phase: newPhase,
    phaseChanged,
    behavior: engine.getPhaseBehavior(),
  };
}

// ============================================================================
// CONTEXT INJECTION
// ============================================================================

/**
 * Build session dynamics context injection for LLM.
 * Priority: 55-60 (moderately high - guides response behavior)
 */
export function buildSessionDynamicsInjection(sessionId: string): ContextInjection | null {
  const engine = getSessionDynamicsEngine(sessionId);
  const state = engine.getState();
  const behavior = engine.getPhaseBehavior();

  // Only inject if we're past opening (opening is implicit)
  if (state.phase === 'opening' && state.turnCount < 2) {
    return null;
  }

  const phaseDescriptions: Record<ConversationPhase, string> = {
    opening: "We're just getting started. Keep things warm and accessible.",
    warming: "We're building rapport. Start building on what they share.",
    engaged: 'Full engagement mode. Peak responsiveness and depth available.',
    deepening: 'Deep territory. Longer pauses are okay. Pattern naming available.',
    winding: 'Conversation is naturally winding down. Consolidate and appreciate.',
    extended: 'Extended session. Check in on energy. Ultra-deep territory available.',
  };

  const specialBehaviorsText =
    behavior.specialBehaviors.length > 0
      ? `\nAvailable behaviors:\n- ${behavior.specialBehaviors.slice(0, 3).join('\n- ')}`
      : '';

  const responseGuidance = engine.getResponseLengthGuidance();
  const questionStyle = engine.getQuestionStyleDescription();
  const windDownPhrase = engine.getWindDownPhrase();

  let content = `[SESSION PHASE: ${state.phase.toUpperCase()}]
${phaseDescriptions[state.phase]}

Response length: ${responseGuidance.ideal} words ideal (${responseGuidance.min}-${responseGuidance.max} range)
Question style: ${questionStyle}
Personal sharing: ${behavior.personalSharing}
Vulnerability: ${behavior.vulnerability}
${specialBehaviorsText}`;

  if (windDownPhrase) {
    content += `\n\nConsider naturally winding down: "${windDownPhrase}"`;
  }

  return {
    category: 'session_dynamics',
    content,
    priority: state.phase === 'deepening' || state.phase === 'extended' ? 60 : 55,
  };
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get current session phase
 */
export function getSessionPhase(sessionId: string): ConversationPhase {
  return getSessionDynamicsEngine(sessionId).getState().phase;
}

/**
 * Get current session dynamics state
 */
export function getSessionDynamicsState(sessionId: string): SessionDynamicsState {
  return getSessionDynamicsEngine(sessionId).getState();
}

/**
 * Get phase behavior for current session
 */
export function getSessionPhaseBehavior(sessionId: string): PhaseBehavior {
  return getSessionDynamicsEngine(sessionId).getPhaseBehavior();
}

/**
 * Map SessionDynamics phase to legacy phase names used by other systems.
 * (opening, exploring, supporting, closing)
 */
export function mapToLegacyPhase(
  phase: ConversationPhase
): 'opening' | 'exploring' | 'supporting' | 'closing' {
  switch (phase) {
    case 'opening':
      return 'opening';
    case 'warming':
    case 'engaged':
      return 'exploring';
    case 'deepening':
      return 'supporting';
    case 'winding':
    case 'extended':
      return 'closing';
    default:
      return 'exploring';
  }
}

/**
 * Get energy recommendation for current phase
 */
export function getRecommendedEnergy(sessionId: string): number {
  return getSessionDynamicsEngine(sessionId).getRecommendedEnergy();
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up session dynamics for a session.
 * Call this when session ends.
 */
export function cleanupSessionDynamics(sessionId: string): void {
  resetSessionDynamicsEngine(sessionId);
  diag.session('📈 Session dynamics cleaned up', { sessionId });
}
