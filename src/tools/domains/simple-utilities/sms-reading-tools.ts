/**
 * SMS Reading Tools
 *
 * Every member's texts with Ferni sit on one Twilio account, so a read covers
 * one number: the Firebase Auth phone (set only by SMS verification) of the
 * owner on a signed-in app call. Everyone else is refused before Twilio is asked.
 *
 * @module simple-utilities/sms-reading-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getFirebaseUser } from '../../../services/identity/firebase-auth.js';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface SMSMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  direction: 'inbound' | 'outbound';
  status: string;
  dateSent: string;
  dateCreated: string;
}

// ============================================================================
// WHO MAY READ
// ============================================================================

/** What a refused read says. */
export const SMS_OWNER_ONLY =
  "I can only read your texts with me when you're signed in to the app with a phone number you've verified, so I can't open them on this call.";

/** Is this session the account's owner on a signed-in app call? */
export type SignedInOwnerCheck = (sessionId: string) => boolean;

/** Refuses every session until the call layer registers its answer (agents/voice-agent-entry/sms-owner-register.ts). */
let signedInOwner: SignedInOwnerCheck = () => false;

export function registerSmsOwnerSessionCheck(check: SignedInOwnerCheck): void {
  signedInOwner = check;
}

const E164 = /^\+[1-9]\d{7,14}$/;

/** Ids that can't be a Firebase account (anonymous, `phone:`, `sponsored_`, ...) are never looked up. */
function isAccountUid(userId: string | undefined): userId is string {
  if (!isMemberIdentity(userId)) return false;
  const id = userId.trim();
  return !id.includes(':') && !id.startsWith('sponsored_');
}

/** The only number whose texts this call may read, or undefined to refuse. */
async function ownerSmsPhone(ctx: ToolContext): Promise<string | undefined> {
  if (!isAccountUid(ctx.userId) || !ctx.sessionId || !signedInOwner(ctx.sessionId)) {
    return undefined;
  }
  const phone = (await getFirebaseUser(ctx.userId.trim()).catch(() => null))?.phoneNumber;
  return phone && E164.test(phone) ? phone : undefined;
}

// ============================================================================
// TWILIO CLIENT HELPER
// ============================================================================

let twilioClient: ReturnType<typeof import('twilio')> | null = null;

async function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    log.warn('Twilio not configured - SMS reading disabled');
    return null;
  }

  try {
    const twilio = await import('twilio');
    twilioClient = twilio.default(accountSid, authToken);
    log.info('Twilio client initialized for SMS reading');
    return twilioClient;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Twilio client');
    return null;
  }
}

// ============================================================================
// SMS READING
// ============================================================================

const NOT_SET_UP = "Reading texts isn't set up right now.";

function toSmsMessage(msg: MessageInstance): SMSMessage {
  return {
    id: msg.sid,
    from: msg.from || '',
    to: msg.to || '',
    body: msg.body || '',
    direction: msg.direction?.includes('inbound') ? 'inbound' : 'outbound',
    status: msg.status || 'unknown',
    dateSent: msg.dateSent?.toISOString() || '',
    dateCreated: msg.dateCreated?.toISOString() || '',
  };
}

/**
 * Texts to or from `ownerPhone` only, newest first; null when Twilio isn't
 * configured. Throws when Twilio fails, so a failure never reads as "no texts".
 */
async function fetchOwnerMessages(
  ownerPhone: string,
  options: { limit?: number; daysBack?: number } = {}
): Promise<SMSMessage[] | null> {
  const { limit = 20, daysBack = 7 } = options;
  const client = await getTwilioClient();
  if (!client) return null;

  const dateSentAfter = new Date();
  dateSentAfter.setDate(dateSentAfter.getDate() - daysBack);
  const pageSize = Math.min(limit, 100);

  const [toOwner, fromOwner] = await Promise.all([
    client.messages.list({ to: ownerPhone, dateSentAfter, limit: pageSize }),
    client.messages.list({ from: ownerPhone, dateSentAfter, limit: pageSize }),
  ]);

  const seen = new Set<string>();
  const messages: SMSMessage[] = [];
  for (const msg of [...toOwner, ...fromOwner]) {
    // Twilio was asked for this number only; anything else is dropped, not shown.
    if (msg.to !== ownerPhone && msg.from !== ownerPhone) continue;
    if (seen.has(msg.sid)) continue;
    seen.add(msg.sid);
    messages.push(toSmsMessage(msg));
  }
  messages.sort((a, b) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
  return messages.slice(0, limit);
}

/** One text, from the member's side: they text in (inbound), Ferni texts out. */
function formatText(msg: SMSMessage): string {
  const who = msg.direction === 'inbound' ? 'You' : 'Me';
  return `${who} (${formatRelativeTime(msg.dateSent)}): "${msg.body}"`;
}

/**
 * Format relative time
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Read recent SMS messages
 */
export const readSMSDef: ToolDefinition = {
  id: 'readSMS',
  name: 'Read SMS',
  description:
    "Read the recent texts between the user and Ferni. Only their own verified number; it can't see other texts on their phone.",
  domain: 'simple-utilities',
  tags: ['sms', 'text', 'messages', 'read', 'inbox'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Read the recent texts between the user and you (Ferni), on their own verified number only. It can't see other texts on their phone.`,
      parameters: z.object({
        limit: z.number().optional().describe('Max messages to show (default 10)'),
      }),
      execute: async ({ limit = 10 }) => {
        const userId = ctx.userId;
        log.info({ userId, limit }, '📱 Reading SMS messages');

        try {
          const ownerPhone = await ownerSmsPhone(ctx);
          if (!ownerPhone) return SMS_OWNER_ONLY;

          const messages = await fetchOwnerMessages(ownerPhone, { limit });
          if (!messages) return NOT_SET_UP;
          if (messages.length === 0) return 'No texts between us in the last week.';

          const formatted = messages.map(formatText).join('\n');
          return `Our recent texts:\n${formatted}`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to read SMS');
          return "I couldn't read your messages right now.";
        }
      },
    });
  },
};

/**
 * Check for new/unread messages
 */
export const checkNewMessagesDef: ToolDefinition = {
  id: 'checkNewMessages',
  name: 'Check New Messages',
  description: 'Check for texts between the user and Ferni today (their own verified number only).',
  domain: 'simple-utilities',
  tags: ['sms', 'text', 'messages', 'new', 'unread'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check for texts between the user and you (Ferni) today, on their own verified number only.`,
      parameters: z.object({}),
      execute: async () => {
        const userId = ctx.userId;
        log.info({ userId }, '📱 Checking for new messages');

        try {
          const ownerPhone = await ownerSmsPhone(ctx);
          if (!ownerPhone) return SMS_OWNER_ONLY;

          const messages = await fetchOwnerMessages(ownerPhone, { daysBack: 1, limit: 50 });
          if (!messages) return NOT_SET_UP;

          const fromMe = messages.filter((m) => m.direction === 'outbound').length;
          const fromYou = messages.length - fromMe;
          if (messages.length === 0) return 'No texts between us today.';
          return `Today: ${fromMe} text${fromMe === 1 ? '' : 's'} from me, ${fromYou} from you.`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to check messages');
          return "I couldn't check your messages right now.";
        }
      },
    });
  },
};

/**
 * Search messages
 */
export const searchMessagesDef: ToolDefinition = {
  id: 'searchMessages',
  name: 'Search Messages',
  description:
    'Search the texts between the user and Ferni for words (their own verified number only).',
  domain: 'simple-utilities',
  tags: ['sms', 'text', 'messages', 'search', 'find'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Search the texts between the user and you (Ferni) for words or phrases, on their own verified number only.`,
      parameters: z.object({
        query: z.string().describe('Text to search for in messages'),
        limit: z.number().optional().describe('Max results (default 10)'),
      }),
      execute: async ({ query, limit = 10 }) => {
        const userId = ctx.userId;
        log.info({ userId }, '📱 Searching messages');

        try {
          const ownerPhone = await ownerSmsPhone(ctx);
          if (!ownerPhone) return SMS_OWNER_ONLY;

          const messages = await fetchOwnerMessages(ownerPhone, { limit: 100, daysBack: 30 });
          if (!messages) return NOT_SET_UP;

          const needle = query.toLowerCase();
          const matches = messages.filter((m) => m.body.toLowerCase().includes(needle));
          if (matches.length === 0) return `No texts between us mention "${query}".`;

          const formatted = matches.slice(0, limit).map(formatText).join('\n');
          return `Found ${matches.length} text${matches.length > 1 ? 's' : ''} with "${query}":\n${formatted}`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to search messages');
          return "I couldn't search your messages right now.";
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const smsReadingToolDefinitions: ToolDefinition[] = [
  readSMSDef,
  checkNewMessagesDef,
  searchMessagesDef,
];

export default smsReadingToolDefinitions;
