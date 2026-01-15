/**
 * Feedback Trigger Engine
 *
 * Central logic for deciding WHEN to prompt for feedback during conversation.
 * Uses natural pauses, topic transitions, and insight moments to find
 * non-intrusive times to collect feedback.
 *
 * Philosophy: Ask for feedback when the moment feels natural, like a friend
 * asking "Does that resonate?" after sharing something meaningful.
 *
 * Trigger Criteria:
 * 1. Natural pause > 800ms after Ferni finishes speaking
 * 2. At least 3 turns into conversation (not too early)
 * 3. Not prompted in last 2 minutes
 * 4. Ferni just shared an observation or insight
 *
 * @module agents/feedback/feedback-trigger-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  createFeedbackPrompt,
  type FeedbackContext,
  type FeedbackPromptEvent,
  type FeedbackReaction,
  type FeedbackTrigger,
  type FeedbackTriggerConfig,
  type FeedbackTriggerResult,
  type FeedbackTriggerState,
} from '../../services/feedback/index.js';

const log = createLogger({ module: 'FeedbackTriggerEngine' });

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: FeedbackTriggerConfig = {
  minPauseDurationMs: 800, // Wait 800ms after agent stops
  minTurnsBeforePrompt: 3, // At least 3 conversational turns
  promptCooldownMs: 2 * 60 * 1000, // 2 minutes between prompts
  maxPromptsPerSession: 5, // Max 5 feedback prompts per session
  promptProbability: 0.4, // 40% chance when conditions met (prevents over-prompting)
};

// Reactions to show in the UI
const DEFAULT_REACTIONS: FeedbackReaction[] = ['resonated', 'helpful', 'too_much', 'off_track'];

// Auto-hide timeout
const AUTO_HIDE_MS = 5000;

// ============================================================================
// INSIGHT DETECTION PATTERNS
// ============================================================================

/**
 * Patterns that suggest Ferni shared an insight or observation.
 * These are good moments to ask "Did that land?"
 */
const INSIGHT_PATTERNS = [
  /\bi notice(d)?\b/i,
  /\bit (seems|sounds|looks) like\b/i,
  /\bi'm wondering if\b/i,
  /\bwhat i'm hearing is\b/i,
  /\bthat reminds me\b/i,
  /\bhere's (what|something) i('m| am) thinking\b/i,
  /\blet me reflect (that |this )?back\b/i,
  /\bi sense\b/i,
  /\bhow does that (land|feel|sit)\b/i,
  /\bdoes that resonate\b/i,
  /\byou've (been|really)\b.*\b(through|working)\b/i,
  /\bthat's (big|huge|meaningful|important)\b/i,
];

// ============================================================================
// TOPIC TRANSITION DETECTION
// ============================================================================

/**
 * Track previous topics per session to detect transitions.
 * A topic transition is a good moment to ask for feedback on the previous topic.
 */
const sessionTopicHistory = new Map<string, string[]>();

/**
 * Check if this represents a meaningful topic transition.
 * Returns true if the topic changed significantly.
 */
function isTopicTransition(sessionId: string, newTopic: string | undefined): boolean {
  if (!newTopic) return false;

  const history = sessionTopicHistory.get(sessionId) || [];
  const lastTopic = history[history.length - 1];

  // No previous topic = not a transition
  if (!lastTopic) {
    // Record this as first topic
    sessionTopicHistory.set(sessionId, [newTopic]);
    return false;
  }

  // Same topic = not a transition
  if (lastTopic.toLowerCase() === newTopic.toLowerCase()) {
    return false;
  }

  // Different topic = transition! Record it
  const updated = [...history, newTopic].slice(-5); // Keep last 5 topics
  sessionTopicHistory.set(sessionId, updated);

  return true;
}

/**
 * Clear topic history for a session.
 */
function clearTopicHistory(sessionId: string): void {
  sessionTopicHistory.delete(sessionId);
}

// ============================================================================
// ENGINE STATE PER SESSION
// ============================================================================

const sessionStates = new Map<string, FeedbackTriggerState>();

/**
 * Get or create state for a session.
 */
function getState(sessionId: string): FeedbackTriggerState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      lastPromptAt: 0,
      promptsThisSession: 0,
      turnCount: 0,
      agentSpeaking: false,
      agentStoppedAt: 0,
      lastAgentMessage: '',
      lastUserMessage: '',
      currentTopic: undefined,
      emotionalTone: undefined,
    });
  }
  return sessionStates.get(sessionId)!;
}

/**
 * Clear state for a session (call on disconnect).
 */
export function clearFeedbackState(sessionId: string): void {
  sessionStates.delete(sessionId);
  clearTopicHistory(sessionId);
  log.debug({ sessionId }, 'Cleared feedback trigger state');
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Update state when agent starts speaking.
 */
export function onAgentStartSpeaking(sessionId: string): void {
  const state = getState(sessionId);
  state.agentSpeaking = true;
}

/**
 * Update state when agent finishes speaking.
 */
export function onAgentFinishedSpeaking(sessionId: string, message: string): void {
  const state = getState(sessionId);
  state.agentSpeaking = false;
  state.agentStoppedAt = Date.now();
  state.lastAgentMessage = message;
  state.turnCount++;
}

/**
 * Update state when user speaks.
 */
export function onUserMessage(sessionId: string, message: string): void {
  const state = getState(sessionId);
  state.lastUserMessage = message;
}

/**
 * Update current topic and detect transitions.
 * Returns true if this was a topic transition (good moment for feedback).
 */
export function onTopicChange(sessionId: string, topic: string): boolean {
  const state = getState(sessionId);
  const wasTransition = isTopicTransition(sessionId, topic);
  state.currentTopic = topic;
  return wasTransition;
}

/**
 * Update emotional tone.
 */
export function onEmotionalToneChange(
  sessionId: string,
  tone: FeedbackContext['emotionalTone']
): void {
  const state = getState(sessionId);
  state.emotionalTone = tone;
}

// ============================================================================
// TRIGGER DECISION
// ============================================================================

/**
 * Check if we should trigger a feedback prompt.
 * Called during natural pauses after agent speech.
 */
export function shouldTriggerFeedback(
  sessionId: string,
  pauseDurationMs: number,
  config: Partial<FeedbackTriggerConfig> = {}
): FeedbackTriggerResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getState(sessionId);

  // Check: Minimum pause duration
  if (pauseDurationMs < cfg.minPauseDurationMs) {
    return {
      shouldPrompt: false,
      reason: `Pause too short (${pauseDurationMs}ms < ${cfg.minPauseDurationMs}ms)`,
    };
  }

  // Check: Minimum turns
  if (state.turnCount < cfg.minTurnsBeforePrompt) {
    return {
      shouldPrompt: false,
      reason: `Too early (turn ${state.turnCount} < ${cfg.minTurnsBeforePrompt})`,
    };
  }

  // Check: Cooldown
  const timeSinceLastPrompt = Date.now() - state.lastPromptAt;
  if (timeSinceLastPrompt < cfg.promptCooldownMs) {
    return {
      shouldPrompt: false,
      reason: `Cooldown active (${Math.round(timeSinceLastPrompt / 1000)}s < ${Math.round(cfg.promptCooldownMs / 1000)}s)`,
    };
  }

  // Check: Max prompts per session
  if (state.promptsThisSession >= cfg.maxPromptsPerSession) {
    return {
      shouldPrompt: false,
      reason: `Max prompts reached (${state.promptsThisSession} >= ${cfg.maxPromptsPerSession})`,
    };
  }

  // Check: Agent not currently speaking
  if (state.agentSpeaking) {
    return {
      shouldPrompt: false,
      reason: 'Agent is speaking',
    };
  }

  // Determine trigger type
  let trigger: FeedbackTrigger = 'natural_pause';
  let reason = 'Natural pause after speech';

  // Check for insight moment (higher priority trigger)
  if (state.lastAgentMessage && isInsightMoment(state.lastAgentMessage)) {
    trigger = 'insight_moment';
    reason = 'Insight/observation detected in agent message';
  }

  // Probability check (adds variety, prevents feeling robotic)
  if (Math.random() > cfg.promptProbability) {
    return {
      shouldPrompt: false,
      reason: `Random skip (probability ${cfg.promptProbability})`,
    };
  }

  return {
    shouldPrompt: true,
    trigger,
    reason,
  };
}

/**
 * Check if the agent's message contained an insight or observation.
 */
function isInsightMoment(message: string): boolean {
  return INSIGHT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Check if we should trigger feedback due to a topic transition.
 * This is called separately from the pause-based trigger.
 */
export function shouldTriggerOnTopicTransition(
  sessionId: string,
  newTopic: string,
  config: Partial<FeedbackTriggerConfig> = {}
): FeedbackTriggerResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getState(sessionId);

  // Check: Minimum turns
  if (state.turnCount < cfg.minTurnsBeforePrompt) {
    return {
      shouldPrompt: false,
      reason: `Too early for topic transition trigger (turn ${state.turnCount})`,
    };
  }

  // Check: Cooldown
  const timeSinceLastPrompt = Date.now() - state.lastPromptAt;
  if (timeSinceLastPrompt < cfg.promptCooldownMs) {
    return {
      shouldPrompt: false,
      reason: `Cooldown active for topic transition`,
    };
  }

  // Check: Max prompts per session
  if (state.promptsThisSession >= cfg.maxPromptsPerSession) {
    return {
      shouldPrompt: false,
      reason: `Max prompts reached`,
    };
  }

  // Check if this is actually a topic transition
  const wasTransition = isTopicTransition(sessionId, newTopic);
  if (!wasTransition) {
    return {
      shouldPrompt: false,
      reason: 'Not a significant topic transition',
    };
  }

  // Lower probability for topic transitions (don't over-prompt)
  if (Math.random() > cfg.promptProbability * 0.5) {
    return {
      shouldPrompt: false,
      reason: 'Random skip for topic transition',
    };
  }

  return {
    shouldPrompt: true,
    trigger: 'topic_transition',
    reason: `Topic changed from previous to "${newTopic}"`,
  };
}

// ============================================================================
// TRIGGER EXECUTION
// ============================================================================

/**
 * Send data message function type
 */
export type SendDataMessageFn = (type: string, payload: Record<string, unknown>) => Promise<void>;

/**
 * Execute a feedback trigger - creates record and sends event to frontend.
 *
 * @returns The feedback ID if successful, null otherwise
 */
export async function triggerFeedback(
  sessionId: string,
  userId: string,
  personaId: string,
  trigger: FeedbackTrigger,
  sendDataMessage: SendDataMessageFn
): Promise<string | null> {
  const state = getState(sessionId);

  // Build context
  const context: FeedbackContext = {
    lastAgentMessage: state.lastAgentMessage,
    lastUserMessage: state.lastUserMessage,
    topic: state.currentTopic,
    emotionalTone: state.emotionalTone,
    turnCount: state.turnCount,
  };

  // Create feedback record in storage
  const result = await createFeedbackPrompt({
    userId,
    sessionId,
    personaId,
    trigger,
    context,
  });

  if (!result.ok) {
    log.warn({ sessionId, reason: result.reason }, 'Failed to create feedback prompt');
    return null;
  }

  const feedbackId = result.feedbackId;

  // Update state
  state.lastPromptAt = Date.now();
  state.promptsThisSession++;

  // Send event to frontend
  const event: FeedbackPromptEvent = {
    type: 'feedback_prompt',
    feedbackId,
    trigger,
    reactions: DEFAULT_REACTIONS,
    autoHideMs: AUTO_HIDE_MS,
    timestamp: Date.now(),
  };

  try {
    await sendDataMessage('feedback_prompt', event as unknown as Record<string, unknown>);
    log.info(
      { sessionId, feedbackId, trigger },
      '📊 Feedback prompt sent to frontend'
    );
    return feedbackId;
  } catch (error) {
    log.warn({ error, sessionId }, 'Failed to send feedback prompt event');
    return null;
  }
}

// ============================================================================
// CONVENIENCE: CHECK AND TRIGGER
// ============================================================================

/**
 * Check conditions and trigger feedback if appropriate.
 * Convenience function that combines check and execution.
 *
 * @returns The feedback ID if triggered, null otherwise
 */
export async function checkAndTriggerFeedback(
  sessionId: string,
  userId: string,
  personaId: string,
  pauseDurationMs: number,
  sendDataMessage: SendDataMessageFn,
  config?: Partial<FeedbackTriggerConfig>
): Promise<string | null> {
  const decision = shouldTriggerFeedback(sessionId, pauseDurationMs, config);

  if (!decision.shouldPrompt || !decision.trigger) {
    log.debug({ sessionId, reason: decision.reason }, 'Feedback trigger skipped');
    return null;
  }

  log.info({ sessionId, trigger: decision.trigger, reason: decision.reason }, 'Triggering feedback');

  return triggerFeedback(sessionId, userId, personaId, decision.trigger, sendDataMessage);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const feedbackTriggerEngine = {
  // State management
  clearState: clearFeedbackState,
  onAgentStartSpeaking,
  onAgentFinishedSpeaking,
  onUserMessage,
  onTopicChange,
  onEmotionalToneChange,

  // Trigger logic
  shouldTrigger: shouldTriggerFeedback,
  shouldTriggerOnTopicTransition,
  trigger: triggerFeedback,
  checkAndTrigger: checkAndTriggerFeedback,

  // Config
  DEFAULT_CONFIG,
};
