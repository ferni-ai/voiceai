/**
 * Whether a Slack notification reached anyone.
 *
 * `SlackNotificationService.notify` resolves `false` for three different things: no
 * webhook (after a critical alert may already have gone out through opsAlert), a
 * non-2xx such as 429/5xx, and a fetch error or timeout. A caller that sends once per
 * incident can't tell "delivered elsewhere" from "lost", so it either goes silent or
 * re-pages. `notifyWithResult` returns this instead.
 *
 * @module services/integrations/slack-delivery
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SlackNotifications' });

export type SlackDelivery =
  /** Slack accepted it, or (no webhook) opsAlert raised it for a critical alert. */
  | { status: 'delivered'; via: 'slack' | 'ops' }
  /** Retryable: a non-2xx (429, 5xx, ...), a fetch error or a timeout. */
  | { status: 'failed'; reason: string }
  /** No webhook, and nothing raised it some other way. Nobody was told. */
  | { status: 'not_configured' };

/** POST `message` to a Slack incoming webhook. Never throws. */
export async function postToSlackWebhook(
  webhookUrl: string,
  message: unknown,
  timeoutMs: number
): Promise<SlackDelivery> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      log.error({ status: response.status }, 'Slack webhook failed');
      return { status: 'failed', reason: `http ${response.status}` };
    }
    return { status: 'delivered', via: 'slack' };
  } catch (error) {
    log.error({ error }, 'Failed to send Slack notification');
    return { status: 'failed', reason: error instanceof Error ? error.name : 'fetch error' };
  }
}
