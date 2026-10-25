/**
 * Send one orchestrator outreach and write it to outreach_attempts, with what
 * it said.
 *
 * The orchestrator used to write each attempt without its message, so the
 * history panel could only show a trigger code. It also recorded every send
 * that didn't throw as "delivered", but deliverOutreach reports a failed send
 * (no push token, no phone, channel down) as `success: false` rather than
 * throwing, so all 5,612 attempts in production said "delivered".
 *
 * @module services/outreach/deliver-and-record
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { OutreachAttemptEntity } from '../data-layer/types.js';
import { deliverOutreach, type DeliverOutreachOptions } from './delivery/index.js';
import { outreachHistory } from './outreach-history.js';
import { isSavedQuietNow } from './quiet-hours.js';

const log = createLogger({ module: 'deliver-and-record' });

export interface OrchestratedSend {
  userId: string;
  channel: Extract<DeliverOutreachOptions['channel'], 'call' | 'push' | 'sms'>;
  message: string;
  personaId: string;
  outreachId: string;
  /** What prompted it (a trigger code), kept on the attempt. */
  reason: string;
}

/** Sends that are alerts, not outreach: quiet hours never hold them. */
export const URGENT_REASONS: ReadonlySet<string> = new Set(['family_checkin_urgent']);

/** The attempt's channel: calls are stored as 'voice'. */
function attemptChannel(channel: OrchestratedSend['channel']): OutreachAttemptEntity['channel'] {
  return channel === 'call' ? 'voice' : channel;
}

/** Delivers `send`, records the attempt (delivered or failed), and says whether it went out. */
export async function deliverAndRecord(send: OrchestratedSend): Promise<boolean> {
  // Inside the quiet hours they saved in the menu (QUIET_HOURS_FROM_PREFS) nothing Ferni
  // starts goes out. An urgent alert (a family check-in that went wrong) still does, as before.
  const urgent = URGENT_REASONS.has(send.reason);
  if (!urgent && (await isSavedQuietNow(send.userId))) {
    log.info({ userId: send.userId, channel: send.channel }, 'Outreach skipped: quiet hours');
    return false;
  }
  let delivered = false;
  try {
    const result = await deliverOutreach({
      userId: send.userId,
      channel: send.channel,
      message: send.message,
      personaId: send.personaId,
      outreachId: send.outreachId,
    });
    delivered = result.success;
    if (result.unreachable) return false; // nothing was sent, so nothing to record
    if (!delivered) {
      log.warn(
        { userId: send.userId, channel: send.channel, error: result.error },
        'Outreach not delivered'
      );
    }
  } catch (error) {
    log.error(
      { error: String(error), userId: send.userId, channel: send.channel },
      'Outreach delivery threw'
    );
  }

  await outreachHistory.recordAttempt(send.userId, {
    type: 'thinking_of_you',
    reason: send.reason,
    channel: attemptChannel(send.channel),
    personaId: send.personaId,
    message: send.message,
    status: delivered ? 'delivered' : 'failed',
  });
  return delivered;
}
