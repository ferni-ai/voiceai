/**
 * Reminder delivery job handler (Cloud Scheduler, every minute).
 *
 * POST /api/jobs/deliver-reminders            — deliver due reminders
 * POST /api/jobs/deliver-reminders?dryRun=true — report what would happen
 * POST /api/jobs/deliver-date-reminders       — important-date reminders
 *                                               (every 15 minutes; ?dryRun=true)
 *
 * @module api/scheduled-jobs/reminder-jobs
 */

import type { IncomingMessage, ServerResponse } from 'http';
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
    const result = await deliverDueReminders({ dryRun });
    sendJson(res, 200, { success: true, job: 'deliver-reminders', ...result });
  } catch (error) {
    log.error({ error: String(error) }, 'Reminder delivery job failed');
    sendJson(res, 500, { success: false, job: 'deliver-reminders', error: String(error) });
  }
}

export async function handleDeliverDateReminders(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const dryRun = new URL(req.url ?? '/', 'http://localhost').searchParams.get('dryRun') === 'true';
  try {
    const { deliverDueDateReminders } =
      await import('../../services/important-dates/reminder-job.js');
    const result = await deliverDueDateReminders({ dryRun });
    sendJson(res, 200, { success: true, job: 'deliver-date-reminders', ...result });
  } catch (error) {
    log.error({ error: String(error) }, 'Date reminder job failed');
    sendJson(res, 500, { success: false, job: 'deliver-date-reminders', error: String(error) });
  }
}
