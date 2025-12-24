/**
 * SMS Reading Tools
 *
 * Read and manage incoming SMS messages via Twilio.
 * Complements the existing SMS sending capability.
 *
 * @module simple-utilities/sms-reading-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';

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

export interface SMSConversation {
  phoneNumber: string;
  contactName?: string;
  messages: SMSMessage[];
  lastMessageAt: string;
  unreadCount: number;
}

// Cache for SMS messages (short TTL since they change)
const smsCache = new Map<string, { messages: SMSMessage[]; fetchedAt: number }>();
const SMS_CACHE_TTL = 60_000; // 1 minute

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
// SMS READING FUNCTIONS
// ============================================================================

/**
 * Fetch recent SMS messages from Twilio
 */
async function fetchRecentMessages(
  userId: string,
  options: { limit?: number; fromNumber?: string; daysBack?: number } = {}
): Promise<SMSMessage[]> {
  const { limit = 20, fromNumber, daysBack = 7 } = options;

  // Check cache first
  const cacheKey = `${userId}:${fromNumber || 'all'}`;
  const cached = smsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SMS_CACHE_TTL) {
    return cached.messages.slice(0, limit);
  }

  const client = await getTwilioClient();
  if (!client) {
    return [];
  }

  try {
    const dateSentAfter = new Date();
    dateSentAfter.setDate(dateSentAfter.getDate() - daysBack);

    // Build filter options
    const filterOptions: {
      limit: number;
      dateSentAfter: Date;
      from?: string;
    } = {
      limit: Math.min(limit, 100), // Twilio max is 1000, but we cap at 100
      dateSentAfter,
    };

    if (fromNumber) {
      filterOptions.from = fromNumber;
    }

    const messages = await client.messages.list(filterOptions);

    const formattedMessages: SMSMessage[] = messages.map((msg) => ({
      id: msg.sid,
      from: msg.from || '',
      to: msg.to || '',
      body: msg.body || '',
      direction: msg.direction?.includes('inbound') ? 'inbound' : 'outbound',
      status: msg.status || 'unknown',
      dateSent: msg.dateSent?.toISOString() || '',
      dateCreated: msg.dateCreated?.toISOString() || '',
    }));

    // Update cache
    smsCache.set(cacheKey, { messages: formattedMessages, fetchedAt: Date.now() });

    log.info({ userId, count: formattedMessages.length }, '📱 Fetched SMS messages');
    return formattedMessages;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to fetch SMS messages');
    return [];
  }
}

/**
 * Get conversations grouped by phone number
 */
async function getConversations(
  userId: string,
  options: { limit?: number } = {}
): Promise<SMSConversation[]> {
  const messages = await fetchRecentMessages(userId, { limit: 100 });

  // Group messages by phone number (the other party, not Ferni's number)
  const ferniNumber = process.env.TWILIO_PHONE_NUMBER || '';
  const conversationMap = new Map<string, SMSMessage[]>();

  for (const msg of messages) {
    const otherParty = msg.direction === 'inbound' ? msg.from : msg.to;
    if (otherParty && otherParty !== ferniNumber) {
      const existing = conversationMap.get(otherParty) || [];
      existing.push(msg);
      conversationMap.set(otherParty, existing);
    }
  }

  // Convert to conversations
  const conversations: SMSConversation[] = [];
  for (const [phoneNumber, msgs] of conversationMap) {
    const sortedMsgs = msgs.sort(
      (a, b) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime()
    );

    // Try to get contact name from Firestore
    let contactName: string | undefined;
    try {
      const db = getFirestoreDb();
      if (db) {
        const contactSnapshot = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('contacts')
          .where('phone', '==', phoneNumber)
          .limit(1)
          .get();

        if (!contactSnapshot.empty) {
          const contactData = contactSnapshot.docs[0].data();
          contactName = contactData.name || contactData.firstName;
        }
      }
    } catch {
      // Ignore contact lookup errors
    }

    conversations.push({
      phoneNumber,
      contactName,
      messages: sortedMsgs,
      lastMessageAt: sortedMsgs[0]?.dateSent || '',
      unreadCount: sortedMsgs.filter((m) => m.direction === 'inbound').length, // Simplified
    });
  }

  // Sort by most recent
  conversations.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

  return conversations.slice(0, options.limit || 10);
}

/**
 * Format phone number for display
 */
function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
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
  description: 'Read recent text messages. Can filter by contact or show all conversations.',
  domain: 'simple-utilities',
  tags: ['sms', 'text', 'messages', 'read', 'inbox'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Read text messages. Returns recent SMS conversations. Can filter by contact name or phone number.`,
      parameters: z.object({
        contact: z.string().optional().describe('Contact name or phone number to filter by'),
        limit: z.number().optional().describe('Max messages to show (default 10)'),
      }),
      execute: async ({ contact, limit = 10 }) => {
        const userId = ctx.userId;
        log.info({ userId, contact, limit }, '📱 Reading SMS messages');

        try {
          if (contact) {
            // Filter by specific contact
            const messages = await fetchRecentMessages(userId, {
              fromNumber: contact,
              limit,
            });

            if (messages.length === 0) {
              return `No messages found from ${contact}.`;
            }

            const formatted = messages
              .slice(0, limit)
              .map((msg) => {
                const arrow = msg.direction === 'inbound' ? '←' : '→';
                const time = formatRelativeTime(msg.dateSent);
                return `${arrow} ${time}: "${msg.body}"`;
              })
              .join('\n');

            return `Messages with ${contact}:\n${formatted}`;
          } else {
            // Show all conversations
            const conversations = await getConversations(userId, { limit });

            if (conversations.length === 0) {
              return 'No text messages in the last week.';
            }

            const formatted = conversations
              .map((conv) => {
                const name = conv.contactName || formatPhoneForDisplay(conv.phoneNumber);
                const lastMsg = conv.messages[0];
                const preview =
                  lastMsg.body.length > 50 ? lastMsg.body.slice(0, 47) + '...' : lastMsg.body;
                const time = formatRelativeTime(lastMsg.dateSent);
                const arrow = lastMsg.direction === 'inbound' ? '←' : '→';
                return `${name} (${time}):\n  ${arrow} "${preview}"`;
              })
              .join('\n\n');

            return `Recent text conversations:\n\n${formatted}`;
          }
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to read SMS');
          return "I couldn't read your messages right now. Make sure Twilio is configured.";
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
  description: 'Check if there are any new text messages.',
  domain: 'simple-utilities',
  tags: ['sms', 'text', 'messages', 'new', 'unread'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check for new text messages received today.`,
      parameters: z.object({}),
      execute: async () => {
        const userId = ctx.userId;
        log.info({ userId }, '📱 Checking for new messages');

        try {
          const messages = await fetchRecentMessages(userId, { daysBack: 1, limit: 50 });
          const inbound = messages.filter((m) => m.direction === 'inbound');

          if (inbound.length === 0) {
            return 'No new text messages today.';
          }

          // Group by sender
          const bySender = new Map<string, number>();
          for (const msg of inbound) {
            bySender.set(msg.from, (bySender.get(msg.from) || 0) + 1);
          }

          if (bySender.size === 1) {
            const [sender, count] = [...bySender.entries()][0];
            return `You have ${count} new message${count > 1 ? 's' : ''} from ${formatPhoneForDisplay(sender)}.`;
          }

          const summary = [...bySender.entries()]
            .map(([sender, count]) => `${count} from ${formatPhoneForDisplay(sender)}`)
            .join(', ');

          return `You have ${inbound.length} new messages: ${summary}.`;
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
  description: 'Search through text messages for specific content.',
  domain: 'simple-utilities',
  tags: ['sms', 'text', 'messages', 'search', 'find'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Search text messages for specific words or phrases.`,
      parameters: z.object({
        query: z.string().describe('Text to search for in messages'),
        limit: z.number().optional().describe('Max results (default 10)'),
      }),
      execute: async ({ query, limit = 10 }) => {
        const userId = ctx.userId;
        log.info({ userId, query }, '📱 Searching messages');

        try {
          const messages = await fetchRecentMessages(userId, { limit: 100, daysBack: 30 });

          const matches = messages.filter((m) =>
            m.body.toLowerCase().includes(query.toLowerCase())
          );

          if (matches.length === 0) {
            return `No messages found containing "${query}".`;
          }

          const formatted = matches
            .slice(0, limit)
            .map((msg) => {
              const arrow = msg.direction === 'inbound' ? 'From' : 'To';
              const other = msg.direction === 'inbound' ? msg.from : msg.to;
              const time = formatRelativeTime(msg.dateSent);
              return `${arrow} ${formatPhoneForDisplay(other)} (${time}):\n  "${msg.body}"`;
            })
            .join('\n\n');

          return `Found ${matches.length} message${matches.length > 1 ? 's' : ''} with "${query}":\n\n${formatted}`;
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
