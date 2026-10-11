/**
 * What appears after the goodbye ceremony.
 *
 * Flag off (default): the conversation cost card, exactly as before.
 * Flag on: the after-call card (what Ferni will remember and one next step),
 * with the cost card one tap away from it.
 *
 * @module ui/after-call/post-call
 */

import { conversationTracker } from '../../services/conversation-tracker.service.js';
import { apiGet } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';
import { showConversationCost } from '../conversation-cost.ui.js';
import { showAfterCallCard } from './after-call-card.ui.js';
import { loadAfterCallData } from './after-call-data.js';
import { isAfterCallCardEnabled } from './after-call-flag.js';

const log = createLogger('PostCall');

function callStartedAt(startTime: string | undefined): number | null {
  if (!startTime) return null;
  const ms = Date.parse(startTime);
  return Number.isFinite(ms) ? ms : null;
}

/** Same test the cost card uses before it shows itself, so the link is never a dead tap. */
async function hasCallCost(): Promise<boolean> {
  try {
    const res = await apiGet<{ sessionId?: string | null; totalCost?: number }>('/api/conversation/cost');
    return Boolean(res.ok && res.data?.sessionId && (res.data.totalCost ?? 0) >= 0.0001);
  } catch (error) {
    log.debug('Cost check failed', { error: String(error) });
    return false;
  }
}

export async function showPostCallCard(): Promise<void> {
  if (!isAfterCallCardEnabled()) {
    await showConversationCost();
    return;
  }

  // The tracker keeps the last call's session until the next call starts.
  const session = conversationTracker.getCurrentSession();
  const [data, costAvailable] = await Promise.all([
    loadAfterCallData(callStartedAt(session?.startTime), session?.insights ?? []),
    hasCallCost(),
  ]);
  const onShowCost = (): void => {
    showConversationCost().catch((error: unknown) =>
      log.warn('Cost card failed to open from after-call card', { error: String(error) })
    );
  };
  showAfterCallCard(data, {
    personaName: session?.personaName || 'Ferni',
    onShowCost: costAvailable ? onShowCost : undefined,
  });
}
