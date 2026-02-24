/**
 * Shared helpers for scheduled job handlers.
 *
 * @module api/scheduled-jobs/helpers
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ScheduledJobsHelpers' });

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function sendSlackMessage(message: string, emoji = ':seedling:'): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    log.debug('SLACK_WEBHOOK_URL not configured, skipping notification');
    return false;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        username: 'Ferni Brand Bot',
        icon_emoji: emoji,
      }),
    });
    return true;
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to send Slack message');
    return false;
  }
}
