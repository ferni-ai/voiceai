/**
 * Reminder delivery job handler (Cloud Scheduler, every minute).
 *
 * POST /api/jobs/deliver-reminders            — deliver due reminders
 * POST /api/jobs/deliver-reminders?dryRun=true — report what would happen
 *
 * @module api/scheduled-jobs/reminder-jobs
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'ReminderJobs' });

/**
 * Whether a guard that holds texts is on: SMS_OPT_IN_CONFIRM, or FOCUS_HOLD in
 * the env or for anyone's cohort or override (a percent sample can't be
 * listed). With both off, nothing is read, as before.
 */
async function releasesHeldTexts(): Promise<boolean> {
  if (flagOn('SMS_OPT_IN_CONFIRM') || flagOn('FOCUS_HOLD')) return true;
  const { usersWithFlag } = await import('../../services/platform/cohort-flags.js');
  return (await usersWithFlag('FOCUS_HOLD')).length > 0;
}

export async function handleDeliverReminders(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const dryRun = new URL(req.url ?? '/', 'http://localhost').searchParams.get('dryRun') === 'true';
  try {
    const { deliverDueReminders } =
      await import('../../services/scheduling/reminder-delivery-job.js');
    // With REMINDER_SMS_DEFAULT on, reminder texts go only through the guarded sender.
    const { installReminderTexts } = await import('../../services/outreach/reminder-texts.js');
    installReminderTexts();
    // Texts and in-app pushes are decided per person: this server delivers for everyone.
    const { reminderReach } = await import('../../services/outreach/reminder-reach.js');
    const result = await deliverDueReminders({ dryRun, reach: reminderReach() });
    // Texts a guard held (SMS_OPT_IN_CONFIRM: quiet hours; FOCUS_HOLD: a Focus) go out once due.
    let heldTexts;
    if (!dryRun && (await releasesHeldTexts())) {
      const { releaseHeldTexts } = await import('../../services/outreach/held-texts.js');
      heldTexts = await releaseHeldTexts();
    }
    sendJson(res, 200, { success: true, job: 'deliver-reminders', ...result, heldTexts });
  } catch (error) {
    log.error({ error: String(error) }, 'Reminder delivery job failed');
    sendJson(res, 500, { success: false, job: 'deliver-reminders', error: String(error) });
  }
}
