/**
 * Action Event Dispatcher
 *
 * Bridges the trust level system to both UI and voice, enabling users to
 * approve/reject autonomous actions through visual cards or spoken commands.
 *
 * This is part of the AGI-like experience - Ferni asks permission before
 * taking actions on behalf of the user, using warm, conversational language.
 *
 * Architecture:
 * 1. Trust system creates a pending action → emits 'action_created' event
 * 2. This dispatcher listens to events and sends to frontend via FrontendPublisher
 * 3. This dispatcher injects a voice confirmation prompt via generateReply
 * 4. User can approve via voice ("yes", "do it") or UI click
 *
 * Session Management:
 * - Uses session-scoped registry (not singleton) to support concurrent sessions
 * - Auto-subscribes to trust system events on init
 * - Cleans up subscriptions on session end
 *
 * @module ActionEventDispatcher
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFrontendPublisher } from './frontend-publisher.js';
import { generateReply } from '../shared/generate-reply-gateway.js';
import type { voice } from '@livekit/agents';
import {
  actionEvents,
  type PendingAction,
  type ActionCategory,
  type ActionCreatedEvent,
} from '../../services/automation/trust-level-system.js';

const log = createLogger({ module: 'ActionEventDispatcher' });

// ============================================================================
// TYPES
// ============================================================================

export interface ActionDispatchContext {
  session: voice.AgentSession;
  sessionId: string;
  userId: string;
}

export interface ActionDispatchResult {
  sentToUI: boolean;
  voicePrompted: boolean;
  error?: string;
}

// ============================================================================
// SESSION-SCOPED REGISTRY
// ============================================================================

/**
 * Session-scoped contexts (supports multiple concurrent sessions)
 */
const sessionContexts = new Map<string, ActionDispatchContext>();

/**
 * Event listeners per session (for cleanup)
 */
const sessionEventListeners = new Map<string, (event: ActionCreatedEvent) => void>();

/**
 * Get context for a specific session
 */
export function getSessionContext(sessionId: string): ActionDispatchContext | undefined {
  return sessionContexts.get(sessionId);
}

/**
 * Get context for a specific user (finds first matching session)
 */
export function getContextByUserId(userId: string): ActionDispatchContext | undefined {
  for (const ctx of sessionContexts.values()) {
    if (ctx.userId === userId) {
      return ctx;
    }
  }
  return undefined;
}

// ============================================================================
// BRAND VOICE: Confirmation Prompts
// ============================================================================

/**
 * Generate a warm, conversational confirmation prompt
 *
 * Brand voice guidelines:
 * - Use contractions ("I'd like to" not "I would like to")
 * - Keep it conversational, not transactional
 * - Include key details so user knows what they're approving
 * - Never say "Action pending approval"
 */
export function generateConfirmationPrompt(action: PendingAction): string {
  const { preview, category } = action;

  // Category-specific prompts with warm, human voice
  const categoryPrompts: Record<ActionCategory, (a: PendingAction) => string> = {
    messaging: (a) => {
      const recipient = a.preview.affectedParties?.[0] || 'them';
      const message = a.preview.summary || 'the message';
      if (a.actionType === 'send_sms') {
        return `I'd like to text ${recipient}: "${message}" - should I send it?`;
      }
      return `I can send ${recipient} an email about ${a.preview.title}. Go ahead?`;
    },
    calendar: (a) => {
      return `Want me to add "${a.preview.title}" to your calendar? ${a.preview.summary}`;
    },
    booking: (a) => {
      if (a.actionType === 'book_restaurant') {
        return `I can book ${a.preview.title}. ${a.preview.summary}. Sound good?`;
      }
      return `Should I book ${a.preview.title}? ${a.preview.summary}`;
    },
    ordering: (a) => {
      const cost = a.preview.estimatedCost ? ` That'll be about $${a.preview.estimatedCost}.` : '';
      return `I can order ${a.preview.title}.${cost} Should I go ahead?`;
    },
    payment: (a) => {
      const cost = a.preview.estimatedCost ? `$${a.preview.estimatedCost}` : 'the amount';
      return `This will send ${cost} to ${a.preview.affectedParties?.[0] || 'them'}. Are you sure?`;
    },
    notification: (a) => {
      return `Should I send a reminder about ${a.preview.title}?`;
    },
    smart_home: (a) => {
      return `I can ${a.preview.summary.toLowerCase()}. Go ahead?`;
    },
    music: (a) => {
      return `Should I ${a.preview.summary.toLowerCase()}?`;
    },
    reminder: (a) => {
      return `I'll set a reminder for ${a.preview.title}. Sound good?`;
    },
    task: (a) => {
      return `Should I add "${a.preview.title}" to your tasks?`;
    },
  };

  // Get category-specific prompt or use generic
  const promptFn = categoryPrompts[category];
  if (promptFn) {
    return promptFn(action);
  }

  // Generic fallback
  return `I'd like to ${preview.summary.toLowerCase()}. Should I?`;
}

/**
 * Generate a warm confirmation response after approval
 */
export function generateConfirmationResponse(
  actionType: string,
  _category: ActionCategory
): string {
  const responses: Record<string, string> = {
    send_sms: 'Sent!',
    send_email: "Email's on its way.",
    create_event: "It's on your calendar.",
    modify_event: 'Updated!',
    book_restaurant: "You're all set!",
    book_ride: 'Your ride is on the way.',
    order_groceries: 'Order placed!',
    order_food: "It's on its way!",
    send_payment: 'Payment sent.',
    control_lights: 'Done!',
    control_thermostat: 'Adjusted.',
    play_music: 'Here you go.',
    create_playlist: 'Playlist created!',
    set_reminder: "I'll remind you.",
    create_task: 'Added to your list.',
  };

  return responses[actionType] || 'Done!';
}

/**
 * Generate a warm rejection acknowledgment
 */
export function generateRejectionResponse(): string {
  const responses = ["Got it, I won't do that.", 'No problem.', 'Okay, never mind.', 'Understood.'];
  return responses[Math.floor(Math.random() * responses.length)];
}

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initialize the action dispatcher for a session
 *
 * Call this when the voice agent session starts to enable voice prompts.
 * Automatically subscribes to trust system events for this user.
 */
export function initActionDispatcher(ctx: ActionDispatchContext): void {
  const { sessionId, userId } = ctx;

  // Store context
  sessionContexts.set(sessionId, ctx);

  // Create event listener for this session's user
  const listener = (event: ActionCreatedEvent) => {
    // Only handle events for this user
    if (event.action.userId === userId) {
      log.info(
        { actionId: event.action.id, actionType: event.action.actionType, userId },
        'Auto-dispatching action from trust system event'
      );
      // Fire and forget - don't block the event emitter
      void dispatchPendingAction(event.action, sessionId);
    }
  };

  // Subscribe to action_created events
  actionEvents.on('action_created', listener);
  sessionEventListeners.set(sessionId, listener);

  log.info({ sessionId, userId }, 'Action dispatcher initialized with event subscription');
}

/**
 * Clear the action dispatcher for a session
 *
 * Call this when the voice agent session ends.
 * Automatically unsubscribes from trust system events.
 */
export function clearActionDispatcher(sessionId: string): void {
  // Remove event listener
  const listener = sessionEventListeners.get(sessionId);
  if (listener) {
    actionEvents.off('action_created', listener);
    sessionEventListeners.delete(sessionId);
  }

  // Remove context
  sessionContexts.delete(sessionId);

  log.debug({ sessionId }, 'Action dispatcher cleared');
}

/**
 * Clear all action dispatchers (for testing/shutdown)
 */
export function clearAllActionDispatchers(): void {
  for (const [sessionId, listener] of sessionEventListeners.entries()) {
    actionEvents.off('action_created', listener);
    sessionEventListeners.delete(sessionId);
    sessionContexts.delete(sessionId);
  }
  log.debug('All action dispatchers cleared');
}

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

/**
 * Dispatch a pending action to both UI and voice
 *
 * This is the main entry point - called automatically when trust system creates
 * a pending action (via event subscription), or can be called manually.
 *
 * @param action - The pending action to dispatch
 * @param sessionIdOrOptions - Either sessionId string or options object
 * @param options - Optional configuration
 */
export async function dispatchPendingAction(
  action: PendingAction,
  sessionIdOrOptions?: string | { skipVoice?: boolean; skipUI?: boolean },
  options: { skipVoice?: boolean; skipUI?: boolean } = {}
): Promise<ActionDispatchResult> {
  // Handle overloaded params
  let sessionId: string | undefined;
  let opts = options;

  if (typeof sessionIdOrOptions === 'string') {
    sessionId = sessionIdOrOptions;
  } else if (sessionIdOrOptions) {
    opts = sessionIdOrOptions;
  }

  const result: ActionDispatchResult = {
    sentToUI: false,
    voicePrompted: false,
  };

  // Get context - by sessionId or by userId
  const ctx = sessionId ? sessionContexts.get(sessionId) : getContextByUserId(action.userId);

  // Send to UI via FrontendPublisher
  if (!opts.skipUI) {
    try {
      const publisher = getFrontendPublisher();
      if (publisher.isConnected()) {
        const sent = await publisher.sendPendingAction(action);
        result.sentToUI = sent;
        if (sent) {
          log.info(
            { actionId: action.id, actionType: action.actionType },
            'Sent pending action to UI'
          );
        }
      } else {
        log.debug({ actionId: action.id }, 'Publisher not connected, skipping UI notification');
      }
    } catch (error) {
      log.warn({ error: String(error), actionId: action.id }, 'Failed to send action to UI');
      result.error = String(error);
    }
  }

  // Send voice prompt
  if (!opts.skipVoice && ctx) {
    try {
      const prompt = generateConfirmationPrompt(action);

      await generateReply(ctx.session, ctx.sessionId, {
        instructions: `[CONFIRMATION REQUEST]
Ask the user for permission using this exact phrasing (or very close to it):
"${prompt}"

Wait for their response. If they say yes, do it, go ahead, sure, etc - approve the action.
If they say no, not now, never mind, etc - reject the action.`,
        context: `action-confirmation-${action.id}`,
        fallbackMessage: prompt,
      });

      result.voicePrompted = true;
      log.info({ actionId: action.id, prompt }, 'Sent voice confirmation prompt');
    } catch (error) {
      log.warn({ error: String(error), actionId: action.id }, 'Failed to send voice prompt');
      if (!result.error) {
        result.error = String(error);
      }
    }
  } else if (!opts.skipVoice && !ctx) {
    log.debug(
      { actionId: action.id, userId: action.userId },
      'No active session for user, skipping voice prompt'
    );
  }

  return result;
}

/**
 * Dispatch an action approval confirmation (after user approves)
 */
export async function dispatchActionApproved(
  action: PendingAction,
  options: { skipVoice?: boolean; sessionId?: string } = {}
): Promise<void> {
  // Send UI update
  try {
    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      await publisher.sendActionResolved(action.id, 'approved');
    }
  } catch (error) {
    log.warn({ error: String(error), actionId: action.id }, 'Failed to send approval to UI');
  }

  // Voice confirmation
  const ctx = options.sessionId
    ? sessionContexts.get(options.sessionId)
    : getContextByUserId(action.userId);

  if (!options.skipVoice && ctx) {
    try {
      const response = generateConfirmationResponse(action.actionType, action.category);

      await generateReply(ctx.session, ctx.sessionId, {
        instructions: `[ACTION CONFIRMED]
The user approved the action. Briefly confirm with something like: "${response}"
Then continue the conversation naturally.`,
        context: `action-confirmed-${action.id}`,
        fallbackMessage: response,
      });
    } catch (error) {
      log.warn(
        { error: String(error), actionId: action.id },
        'Failed to send approval voice confirmation'
      );
    }
  }
}

/**
 * Dispatch an action rejection (after user rejects)
 */
export async function dispatchActionRejected(
  action: PendingAction,
  options: { skipVoice?: boolean; sessionId?: string } = {}
): Promise<void> {
  // Send UI update
  try {
    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      await publisher.sendActionResolved(action.id, 'rejected');
    }
  } catch (error) {
    log.warn({ error: String(error), actionId: action.id }, 'Failed to send rejection to UI');
  }

  // Voice acknowledgment
  const ctx = options.sessionId
    ? sessionContexts.get(options.sessionId)
    : getContextByUserId(action.userId);

  if (!options.skipVoice && ctx) {
    try {
      const response = generateRejectionResponse();

      await generateReply(ctx.session, ctx.sessionId, {
        instructions: `[ACTION REJECTED]
The user declined the action. Acknowledge briefly with something like: "${response}"
Don't dwell on it - move on naturally.`,
        context: `action-rejected-${action.id}`,
        fallbackMessage: response,
      });
    } catch (error) {
      log.warn(
        { error: String(error), actionId: action.id },
        'Failed to send rejection voice confirmation'
      );
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const actionEventDispatcher = {
  init: initActionDispatcher,
  clear: clearActionDispatcher,
  clearAll: clearAllActionDispatchers,
  getSessionContext,
  getContextByUserId,
  dispatchPendingAction,
  dispatchActionApproved,
  dispatchActionRejected,
  generateConfirmationPrompt,
  generateConfirmationResponse,
  generateRejectionResponse,
};

export default actionEventDispatcher;
