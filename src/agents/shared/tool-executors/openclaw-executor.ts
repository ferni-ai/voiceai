/**
 * OpenClaw Domain Tool Executor
 *
 * Handles outbound messaging through OpenClaw's multi-channel gateway.
 * Enables Ferni to send messages via WhatsApp, Telegram, Discord, Slack,
 * or auto-selected best channel during voice or chat sessions.
 *
 * OpenClaw gateway must be running at the configured URL (default: ws://127.0.0.1:18789).
 *
 * @module agents/shared/tool-executors/openclaw-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'OpenClawExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  'sendwhatsapp',
  'sendtelegram',
  'senddiscord',
  'sendslack',
  'sendmessagechannel',
] as const;

/** Map tool name to OpenClaw channel identifier */
const TOOL_TO_CHANNEL: Record<string, string | undefined> = {
  sendwhatsapp: 'whatsapp',
  sendtelegram: 'telegram',
  senddiscord: 'discord',
  sendslack: 'slack',
  sendmessagechannel: undefined, // auto-select
};

/** Human-readable channel names */
const CHANNEL_DISPLAY: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
};

/**
 * Get the OpenClaw gateway URL from environment.
 */
function getGatewayUrl(): string {
  return process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
}

/**
 * Get the OpenClaw gateway auth token from environment.
 */
function getGatewayToken(): string | undefined {
  return process.env.OPENCLAW_GATEWAY_TOKEN;
}

/**
 * Send a message through the OpenClaw gateway API.
 */
async function sendViaOpenClaw(params: {
  recipient: string;
  message: string;
  channel?: string;
  userId?: string;
}): Promise<{ success: boolean; channel?: string; error?: string }> {
  const gatewayUrl = getGatewayUrl();
  const token = getGatewayToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const body: Record<string, unknown> = {
    recipient: params.recipient,
    message: params.message,
  };
  if (params.channel) {
    body.channel = params.channel;
  }
  if (params.userId) {
    body.userId = params.userId;
  }

  const response = await fetch(`${gatewayUrl}/api/message/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    return { success: false, error: `Gateway returned ${response.status}: ${errorText}` };
  }

  const data = (await response.json()) as { success?: boolean; channel?: string; error?: string };
  return {
    success: data.success !== false,
    channel: data.channel,
    error: data.error,
  };
}

/**
 * Execute OpenClaw messaging tools.
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  const recipient = (args.recipient || args.contact || args.to || args.name || args.phone) as string;
  const message = (args.message || args.text || args.body || args.content) as string;
  const channel = TOOL_TO_CHANNEL[fnLower];

  if (!recipient) {
    return 'Who would you like me to send the message to?';
  }

  if (!message) {
    return `What would you like me to say to ${recipient}?`;
  }

  const channelDisplay = channel ? CHANNEL_DISPLAY[channel] || channel : 'the best available channel';

  log.info(
    { recipient, channel: channel || 'auto', messageLength: message.length, userId: ctx.userId },
    `📨 OpenClaw message requested via ${channelDisplay}`
  );

  try {
    const result = await sendViaOpenClaw({
      recipient,
      message,
      channel,
      userId: ctx.userId,
    });

    if (result.success) {
      const usedChannel = result.channel
        ? CHANNEL_DISPLAY[result.channel] || result.channel
        : channelDisplay;
      log.info({ recipient, channel: result.channel || channel }, '📨 Message sent via OpenClaw');
      return `Sent your message to ${recipient} on ${usedChannel}.`;
    }

    log.error({ error: result.error, recipient, channel }, '📨 OpenClaw send failed');

    if (result.error?.includes('not connected') || result.error?.includes('not found')) {
      return `${recipient} isn't available on ${channelDisplay} right now. Want me to try another way?`;
    }

    return `Couldn't send that message. Want me to try again?`;
  } catch (err) {
    const errMsg = String(err);
    log.error({ error: errMsg, recipient, channel }, '📨 OpenClaw executor error');

    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
      return `The messaging gateway isn't running right now. I can't send messages until it's started.`;
    }

    if (errMsg.includes('TimeoutError') || errMsg.includes('aborted')) {
      return `The message is taking too long to send. Want me to try again?`;
    }

    return `Something went wrong sending the message. Want me to try again?`;
  }
}

export const openclawExecutor: DomainExecutor = {
  domain: 'openclaw-messaging',
  handles: HANDLED_TOOLS,
  execute,
};

export default openclawExecutor;
