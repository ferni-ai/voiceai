/**
 * Action Approval Handler
 *
 * Detects when a user's spoken response is approving or rejecting a pending action.
 * This enables the voice-first AGI experience where users can say "yes", "do it",
 * "go ahead" to approve actions Ferni wants to take on their behalf.
 *
 * Called during turn processing to intercept confirmation intents when there
 * are pending actions waiting for approval.
 *
 * @module agents/shared/action-approval-handler
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getPendingActions,
  resolvePendingAction,
  type PendingAction,
} from '../../services/automation/trust-level-system.js';
import {
  dispatchActionApproved,
  dispatchActionRejected,
} from '../realtime/action-event-dispatcher.js';

const log = createLogger({ module: 'ActionApprovalHandler' });

// ============================================================================
// CONFIRMATION DETECTION
// ============================================================================

/**
 * Confirmation phrases that indicate user approval
 */
const CONFIRMATION_PHRASES = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'ok',
  'okay',
  'go ahead',
  'do it',
  'send it',
  'book it',
  'please',
  'confirm',
  'approved',
  'sounds good',
  "that's good",
  'that works',
  'perfect',
  'absolutely',
  'definitely',
  'of course',
  'why not',
];

/**
 * Denial phrases that indicate user rejection
 */
const DENIAL_PHRASES = [
  'no',
  'nope',
  'nah',
  'cancel',
  'stop',
  'wait',
  'hold on',
  'never mind',
  'forget it',
  "don't",
  'not now',
  'skip',
  'not yet',
  'maybe later',
  "i'll pass",
  'no thanks',
];

/**
 * Detect if user input is confirming or denying a pending action
 */
export function detectConfirmationIntent(userInput: string): 'confirm' | 'deny' | 'unclear' {
  const lower = userInput.toLowerCase().trim();

  // Very short responses are more likely to be confirmations
  const isShort = lower.split(' ').length <= 3;

  // Check for confirmation
  for (const phrase of CONFIRMATION_PHRASES) {
    // Exact match or starts with phrase
    if (lower === phrase) {
      return 'confirm';
    }
    // Short responses that contain the phrase
    if (isShort && (lower.startsWith(phrase + ' ') || lower.includes(' ' + phrase))) {
      return 'confirm';
    }
  }

  // Check for denial
  for (const phrase of DENIAL_PHRASES) {
    if (lower === phrase) {
      return 'deny';
    }
    if (isShort && (lower.startsWith(phrase + ' ') || lower.includes(' ' + phrase))) {
      return 'deny';
    }
  }

  return 'unclear';
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export interface ActionApprovalResult {
  /** Whether an action was processed */
  handled: boolean;
  /** The action that was approved/rejected */
  action?: PendingAction;
  /** Whether it was approved (true) or rejected (false) */
  approved?: boolean;
  /** Error message if something went wrong */
  error?: string;
}

/**
 * Check if user is responding to a pending action and handle it
 *
 * Call this during turn processing when you detect a short confirmation response.
 * It checks if there are pending actions and if so, approves/rejects the most recent one.
 *
 * @param userId - User's ID
 * @param userInput - User's spoken text
 * @param options - Optional configuration
 * @returns Result indicating if an action was handled
 *
 * @example
 * ```typescript
 * // In turn handler
 * const result = await handleActionApprovalIntent(userId, transcript);
 * if (result.handled) {
 *   // Action was approved/rejected, skip normal turn processing
 *   return;
 * }
 * // Continue with normal turn processing
 * ```
 */
export async function handleActionApprovalIntent(
  userId: string,
  userInput: string,
  options: {
    /** Skip the voice confirmation (useful if you'll handle it separately) */
    skipVoice?: boolean;
  } = {}
): Promise<ActionApprovalResult> {
  // Only check very short responses (likely confirmations)
  const wordCount = userInput.trim().split(/\s+/).length;
  if (wordCount > 5) {
    return { handled: false };
  }

  // Detect intent
  const intent = detectConfirmationIntent(userInput);
  if (intent === 'unclear') {
    return { handled: false };
  }

  // Check for pending actions
  let pendingActions: PendingAction[];
  try {
    pendingActions = await getPendingActions(userId);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get pending actions');
    return { handled: false, error: String(error) };
  }

  if (pendingActions.length === 0) {
    // No pending actions - this isn't a confirmation response
    return { handled: false };
  }

  // Get the most recent pending action
  const action = pendingActions[0];
  const approved = intent === 'confirm';

  log.info(
    { actionId: action.id, actionType: action.actionType, approved, userId },
    `User ${approved ? 'approved' : 'rejected'} action via voice`
  );

  try {
    // Resolve the action
    const resolvedAction = await resolvePendingAction(userId, action.id, approved);

    if (!resolvedAction) {
      log.warn({ actionId: action.id }, 'Action was already resolved');
      return { handled: false, error: 'Action already resolved' };
    }

    // Dispatch voice confirmation
    if (!options.skipVoice) {
      if (approved) {
        await dispatchActionApproved(resolvedAction);
      } else {
        await dispatchActionRejected(resolvedAction);
      }
    }

    return {
      handled: true,
      action: resolvedAction,
      approved,
    };
  } catch (error) {
    log.error({ error: String(error), actionId: action.id }, 'Failed to resolve action');
    return { handled: false, error: String(error) };
  }
}

/**
 * Quick check if there are pending actions for a user
 *
 * Use this to quickly determine if you should call handleActionApprovalIntent.
 */
export async function hasPendingActions(userId: string): Promise<boolean> {
  try {
    const actions = await getPendingActions(userId);
    return actions.length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const actionApprovalHandler = {
  detectConfirmationIntent,
  handleActionApprovalIntent,
  hasPendingActions,
};

export default actionApprovalHandler;
