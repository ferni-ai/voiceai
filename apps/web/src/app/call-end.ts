/**
 * Call End
 *
 * What the screen does once a call is over, however it ended: the goodbye
 * ceremony, the Disconnect button or a dropped call. The avatar's face goes
 * back to neutral, the quick actions come back, and the after-call card (the
 * cost card when its flag is off) appears once for the call that just ended.
 * With call wrap-up on, every end also tells the ritual engine, speaker cues
 * and game board (`ferni:disconnected`) and holds toasts past the card.
 */

import { DURATION } from '../config/animation-constants.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { engagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { createLogger } from '../utils/logger.js';
import { forgetGameStarts } from './agent-ack-handlers.js';
import { holdToastsPastCard } from './call-end-paths.js';
import { isCallWrapUpEnabled } from '../config/call-wrap-up-flag.js';

const log = createLogger('CallEnd');

/** Lets the hang-up settle before the card slides in. */
export const POST_CALL_CARD_DELAY_MS = 800;
/** How long the goodbye smile lingers before the face settles by itself. */
export const WRAP_UP_EXPRESSION_HOLD_MS = 6000;
/** Quick actions wait for the "joined" moment to pass. */
const QUICK_ACTIONS_DELAY_MS = 500;

/** A call reached the agent and has not had its after-call card yet. */
let callLive = false;
let cardTimer: ReturnType<typeof setTimeout> | null = null;

/** The agent is in the room: quick actions for returning users, and the card is owed at the end. */
export function onCallStarted(): void {
  callLive = true;
  // A card still waiting from the last call must not land on this one.
  if (cardTimer) clearTimeout(cardTimer);
  cardTimer = null;
  // A first call is just Ferni; quick actions join from the second one.
  if (modalCoordinator.hasMinimumConversations(1)) {
    setTimeout(() => engagementTriggerUI.show(), QUICK_ACTIONS_DELAY_MS);
  }
}

async function showPostCall(): Promise<void> {
  try {
    const { showPostCallCard } = await import('../ui/after-call/post-call.js');
    await showPostCallCard();
  } catch (error) {
    log.warn('After-call card not shown', { error: String(error) });
  }
}

/** The call is over, by goodbye, hang-up or drop. Safe to call more than once. */
export function onCallEnded(): void {
  // A game start still waiting for the agent must not say "didn't start" after the call
  forgetGameStarts();
  // Any held expression (the goodbye smile, a greeting pose) would leave lid "bites" on the avatar.
  ferniExpressions.setExpression('neutral', DURATION.SLOW);
  engagementTriggerUI.show();

  if (!callLive) return;
  callLive = false;
  if (isCallWrapUpEnabled()) {
    // Once per call, like `ferni:connected`, which a hang-up never answered before.
    document.dispatchEvent(new CustomEvent('ferni:disconnected'));
    holdToastsPastCard();
  }
  cardTimer = setTimeout(() => {
    cardTimer = null;
    void showPostCall();
  }, POST_CALL_CARD_DELAY_MS);
}
