/**
 * An urgent alert to a member (today: a family check-in call that raised a
 * concern, sent to the sponsor). Push first; when the push isn't delivered, a
 * text to their verified phone.
 *
 * It used to treat any push as delivered, because sendPushNotification returned
 * the event even when nothing went out, so the text never went. It also looked
 * for the phone in bogle_users.phoneNumber, which nothing writes.
 *
 * Quiet hours never hold it (it's an alert, not outreach). The text keeps
 * sendSMS's rules: STOP and the MINOR_CARE hold still refuse it, and the body
 * gets the same brand check and length limit. Logs carry ids, never the message.
 *
 * @module services/outreach/urgent-alert
 */

import { createLogger } from '../../utils/safe-logger.js';
import { sendSMS } from './delivery/sms-delivery.js';
import { getOutreachOrchestrator } from './outreach-orchestrator.js';
import { userReach } from './user-reach.js';

const log = createLogger({ module: 'urgent-alert' });

/** Sends `message` to `userId` by push, else by text. Never throws; a total failure is an error log. */
export async function sendUrgentAlert(
  userId: string,
  message: string,
  ids: { trigger: string; alertId: string }
): Promise<'push' | 'sms' | 'none'> {
  const at = { userId, trigger: ids.trigger, alertId: ids.alertId };
  try {
    const pushed = await getOutreachOrchestrator().sendPushNotification(userId, message, {
      trigger: ids.trigger,
      personaId: 'ferni',
      metadata: { alertId: ids.alertId },
    });
    if (pushed) {
      log.info(at, 'Urgent alert sent by push');
      return 'push';
    }
  } catch (error) {
    log.warn({ ...at, error: String(error) }, 'Urgent push threw; texting instead');
  }

  try {
    // No standing opt-in needed: they set this alert up. STOP still refuses it (sendSMS).
    const reach = await userReach(userId, 'sms', { standingOptIn: false });
    if (reach.phone === undefined) {
      log.error({ ...at, reason: reach.reason }, 'Urgent alert not delivered: no push, no phone');
      return 'none';
    }
    const sms = await sendSMS({
      to: reach.phone,
      body: message,
      userId,
      personaId: 'ferni',
      outreachId: `${ids.trigger}_${ids.alertId}`,
    });
    if (sms.success) {
      log.info(at, 'Urgent alert sent by text');
      return 'sms';
    }
    log.error(at, 'Urgent alert not delivered: push and text both failed');
  } catch (error) {
    log.error({ ...at, error: String(error) }, 'Urgent alert not delivered: text threw');
  }
  return 'none';
}
