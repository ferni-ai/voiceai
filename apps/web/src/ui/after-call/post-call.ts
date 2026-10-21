/**
 * What appears after the goodbye ceremony.
 *
 * Default: the after-call recap (what Ferni will remember and one next step,
 * or a short warm close when there is nothing to recap), with a quiet
 * "Support Ferni" text link on it. The support ask never replaces the recap.
 * Flag off (VITE_AFTER_CALL_CARD=false): the conversation cost card, as before.
 * Either card carries the one-tap "how did that feel?" row when the agent
 * asked for feedback during the call (it is never asked mid-call).
 *
 * @module ui/after-call/post-call
 */

import { conversationTracker } from '../../services/conversation-tracker.service.js';
import { createLogger } from '../../utils/logger.js';
import { REACTIONS } from '../contextual-feedback.ui.js';
import { canOpenSupport, openSupport as openSupportFlow } from '../support/open-support.js';
import { showConversationCost } from '../conversation-cost.ui.js';
import { hideAfterCallCard, showAfterCallCard } from './after-call-card.ui.js';
import { loadAfterCallData } from './after-call-data.js';
import { buildCallFeedbackRow } from './call-feedback.js';
import { isAfterCallCardEnabled } from './after-call-flag.js';
import { addPushAsk } from './push-ask.js';
import { buildReportLink } from '../report-reply/report-reply-entry.js';

const log = createLogger('PostCall');

function callStartedAt(startTime: string | undefined): number | null {
  if (!startTime) return null;
  const ms = Date.parse(startTime);
  return Number.isFinite(ms) ? ms : null;
}

/** Opens Support Ferni only when the person taps the link. */
function openSupport(): void {
  openSupportFlow().catch((error: unknown) =>
    log.warn('Support Ferni failed to open from after-call card', { error: String(error) })
  );
}

export async function showPostCallCard(): Promise<void> {
  if (!isAfterCallCardEnabled()) {
    const costCard = await showConversationCost();
    addFeedbackRow(costCard);
    addReportLink(costCard, 'Ferni');
    return;
  }

  // A new call can start while the data loads, or while the card is up.
  // Either way the card belongs to the old call, so it must not cover the new one.
  let newCallStarted = false;
  const onConnected = (): void => {
    newCallStarted = true;
    hideAfterCallCard(true);
  };
  document.addEventListener('ferni:connected', onConnected, { once: true });

  // The tracker keeps the last call's session until the next call starts.
  const session = conversationTracker.getCurrentSession();
  const data = await loadAfterCallData(callStartedAt(session?.startTime), session?.insights ?? []);
  if (newCallStarted) return;
  const card = showAfterCallCard(data, {
    personaName: session?.personaName || 'Ferni',
    // No support link when there is nothing to open (paywall off and Venmo off)
    onSupport: canOpenSupport() ? openSupport : undefined,
  });
  addFeedbackRow(card);
  addReportLink(card, session?.personaName || 'Ferni');
  // One optional "check in about this?" when it applies (push-ask.ts); never blocks the card.
  void addPushAsk(card);
}

/** Store policy: a way to report what was said, right where the call ends. */
function addReportLink(card: HTMLElement | null, personaName: string): void {
  const link = card ? buildReportLink(personaName) : null;
  if (link) card?.appendChild(link);
}

function addFeedbackRow(card: HTMLElement | null): void {
  if (!card) return;
  const row = buildCallFeedbackRow(REACTIONS);
  if (row) card.appendChild(row);
}
