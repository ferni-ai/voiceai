/**
 * What appears after the goodbye ceremony.
 *
 * Default: the after-call recap (what Ferni will remember and one next step,
 * or a short warm close when there is nothing to recap), with a quiet
 * "Support Ferni" text link on it. The support ask never replaces the recap.
 * Flag off (VITE_AFTER_CALL_CARD=false): the conversation cost card, as before.
 *
 * @module ui/after-call/post-call
 */

import { conversationTracker } from '../../services/conversation-tracker.service.js';
import { createLogger } from '../../utils/logger.js';
import { showConversationCost } from '../conversation-cost.ui.js';
import { hideAfterCallCard, showAfterCallCard } from './after-call-card.ui.js';
import { loadAfterCallData } from './after-call-data.js';
import { isAfterCallCardEnabled } from './after-call-flag.js';

const log = createLogger('PostCall');

function callStartedAt(startTime: string | undefined): number | null {
  if (!startTime) return null;
  const ms = Date.parse(startTime);
  return Number.isFinite(ms) ? ms : null;
}

/** Opens Support Ferni only when the person taps the link. */
function openSupport(): void {
  import('../support-ferni.ui.js')
    .then(({ supportFerniUI }) => supportFerniUI.open())
    .catch((error: unknown) =>
      log.warn('Support Ferni failed to open from after-call card', { error: String(error) })
    );
}

export async function showPostCallCard(): Promise<void> {
  if (!isAfterCallCardEnabled()) {
    await showConversationCost();
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
  const data = await loadAfterCallData(
    callStartedAt(session?.startTime),
    session?.insights ?? []
  );
  if (newCallStarted) return;
  showAfterCallCard(data, {
    personaName: session?.personaName || 'Ferni',
    onSupport: openSupport,
  });
}
