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
    // SMS_OPT_IN_CONFIRM: texts a guard held (quiet hours) go out once due, on this every-minute run.
    let heldTexts;
    if (!dryRun && flagOn('SMS_OPT_IN_CONFIRM')) {
      const { releaseHeldTexts } = await import('../../services/outreach/held-texts.js');
      heldTexts = await releaseHeldTexts();
    }
    sendJson(res, 200, { success: true, job: 'deliver-reminders', ...result, heldTexts });
  } catch (error) {
    log.error({ error: String(error) }, 'Reminder delivery job failed');
    sendJson(res, 500, { success: false, job: 'deliver-reminders', error: String(error) });
  }
}
