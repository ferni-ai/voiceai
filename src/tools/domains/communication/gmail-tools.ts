/**
 * Gmail Tools
 *
 * LLM-callable tools for Gmail inbox management.
 * Read-only access to triage and summarize emails.
 *
 * DOMAIN: communication
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import {
  getUnreadMessages,
  getImportantUnread,
  searchEmails,
  getInboxStats,
  getEmailThread,
  triageUnreadEmails,
  formatEmailForSpeech,
  formatInboxSummaryForSpeech,
  isGmailConfigured,
} from '../../../services/gmail/gmail-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';

const log = getLogger();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Get Gmail tool definitions
 */
export function getGmailToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // getInboxSummary - Quick inbox overview
    // =========================================================================
    {
      id: 'getInboxSummary',
      name: 'Get Inbox Summary',
      description:
        'Get a quick summary of the email inbox: unread count, important items, and what arrived today.',
      domain: 'communication',
      tags: ['email', 'inbox', 'summary'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Get a quick summary of the email inbox: unread count, important items, and what arrived today.',
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your inbox.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet. Would you like me to help you connect your Google account?';
            }

            const stats = await getInboxStats(userId);
            if (!stats) {
              return 'I had trouble accessing your inbox. Let me try again.';
            }

            const urgent = await getImportantUnread(userId, 3);
            return formatInboxSummaryForSpeech(stats, urgent);
          },
        });
      },
    },

    // =========================================================================
    // getUnreadEmails - List unread emails
    // =========================================================================
    {
      id: 'getUnreadEmails',
      name: 'Get Unread Emails',
      description: 'Get a list of unread emails from the inbox.',
      domain: 'communication',
      tags: ['email', 'inbox', 'unread'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get a list of unread emails from the inbox.',
          parameters: z.object({
            count: z
              .number()
              .optional()
              .describe('Maximum number of emails to retrieve (default: 5)'),
          }),
          execute: async (params: { count?: number }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your inbox.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet. Would you like me to help you connect your Google account?';
            }

            const count = params.count || 5;
            const emails = await getUnreadMessages(userId, count);

            if (emails.length === 0) {
              return 'Great news - you have no unread emails.';
            }

            let response = `You have ${emails.length} unread email${emails.length === 1 ? '' : 's'}:\n\n`;
            emails.forEach((email, i) => {
              response += `${i + 1}. ${formatEmailForSpeech(email)}\n\n`;
            });

            return response;
          },
        });
      },
    },

    // =========================================================================
    // searchInbox - Search inbox
    // =========================================================================
    {
      id: 'searchInbox',
      name: 'Search Inbox',
      description:
        'Search emails in the inbox. Supports queries like "from:john", "subject:meeting", "is:unread", etc.',
      domain: 'communication',
      tags: ['email', 'inbox', 'search'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Search emails in the inbox. Supports queries like "from:john", "subject:meeting", "is:unread", etc.',
          parameters: z.object({
            query: z
              .string()
              .describe(
                'Search query (e.g., "from:boss@company.com", "subject:urgent", "is:unread")'
              ),
            count: z.number().optional().describe('Maximum results (default: 5)'),
          }),
          execute: async (params: { query: string; count?: number }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to search your inbox.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet. Would you like me to help you connect your Google account?';
            }

            const count = params.count || 5;
            const emails = await searchEmails(userId, params.query, count);

            if (emails.length === 0) {
              return `No emails found matching "${params.query}".`;
            }

            let response = `Found ${emails.length} email${emails.length === 1 ? '' : 's'} matching "${params.query}":\n\n`;
            emails.forEach((email, i) => {
              response += `${i + 1}. ${formatEmailForSpeech(email)}\n\n`;
            });

            return response;
          },
        });
      },
    },

    // =========================================================================
    // triageInbox - Smart email triage
    // =========================================================================
    {
      id: 'triageInbox',
      name: 'Triage Inbox',
      description:
        'Automatically categorize unread emails into urgent, needs response, FYI, and promotional.',
      domain: 'communication',
      tags: ['email', 'inbox', 'triage', 'prioritize'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Automatically categorize unread emails into urgent, needs response, FYI, and promotional.',
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to triage your inbox.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet. Would you like me to help you connect your Google account?';
            }

            const triage = await triageUnreadEmails(userId);
            if (!triage) {
              return 'I had trouble triaging your inbox. Let me try again.';
            }

            const total =
              triage.urgent.length +
              triage.needsResponse.length +
              triage.fyi.length +
              triage.promotional.length;

            if (total === 0) {
              return 'Your inbox is clear. No unread emails to triage.';
            }

            let response = `I've triaged ${total} unread email${total === 1 ? '' : 's'}:\n\n`;

            if (triage.urgent.length > 0) {
              response += `Urgent (${triage.urgent.length}):\n`;
              triage.urgent.slice(0, 3).forEach((email) => {
                response += `- ${email.subject} from ${email.from}\n`;
              });
              response += '\n';
            }

            if (triage.needsResponse.length > 0) {
              response += `Needs Response (${triage.needsResponse.length}):\n`;
              triage.needsResponse.slice(0, 3).forEach((email) => {
                response += `- ${email.subject} from ${email.from}\n`;
              });
              response += '\n';
            }

            if (triage.fyi.length > 0) {
              response += `FYI (${triage.fyi.length}): `;
              response +=
                triage.fyi.length === 1
                  ? `1 informational email`
                  : `${triage.fyi.length} informational emails`;
              response += '\n\n';
            }

            if (triage.promotional.length > 0) {
              response += `Promotional (${triage.promotional.length}): `;
              response += `Can be reviewed later or archived`;
              response += '\n';
            }

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getEmailThread - Read conversation thread
    // =========================================================================
    {
      id: 'getEmailThread',
      name: 'Get Email Thread',
      description: 'Get the full conversation thread for an email.',
      domain: 'communication',
      tags: ['email', 'thread', 'conversation'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get the full conversation thread for an email.',
          parameters: z.object({
            threadId: z.string().describe('The thread ID to retrieve'),
          }),
          execute: async (params: { threadId: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to read this thread.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet.';
            }

            const thread = await getEmailThread(userId, params.threadId);
            if (!thread) {
              return 'I could not find that email thread.';
            }

            let response = `Thread: "${thread.subject}"\n`;
            response += `${thread.messageCount} message${thread.messageCount === 1 ? '' : 's'}, `;
            response += `participants: ${thread.participants.slice(0, 3).join(', ')}`;
            if (thread.participants.length > 3) {
              response += ` and ${thread.participants.length - 3} others`;
            }
            response += '\n\n';

            // Show last 3 messages
            const recentMessages = thread.messages.slice(-3);
            recentMessages.forEach((msg, i) => {
              response += `--- Message ${thread.messageCount - 2 + i} ---\n`;
              response += `From: ${msg.from}\n`;
              response += `${msg.snippet}\n\n`;
            });

            return response;
          },
        });
      },
    },

    // =========================================================================
    // checkEmailFrom - Check for emails from specific sender
    // =========================================================================
    {
      id: 'checkEmailFrom',
      name: 'Check Email From',
      description: 'Check if there are any emails from a specific sender.',
      domain: 'communication',
      tags: ['email', 'search', 'sender'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Check if there are any emails from a specific sender.',
          parameters: z.object({
            sender: z.string().describe('Name or email address of the sender to search for'),
            unreadOnly: z.boolean().optional().describe('Only show unread emails (default: true)'),
          }),
          execute: async (params: { sender: string; unreadOnly?: boolean }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your inbox.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet. Would you like me to help you connect your Google account?';
            }

            const unreadOnly = params.unreadOnly !== false;
            const query = `from:${params.sender}${unreadOnly ? ' is:unread' : ''}`;
            const emails = await searchEmails(userId, query, 5);

            if (emails.length === 0) {
              return unreadOnly
                ? `No unread emails from ${params.sender}.`
                : `No recent emails from ${params.sender}.`;
            }

            let response = `Found ${emails.length} email${emails.length === 1 ? '' : 's'} from ${params.sender}:\n\n`;
            emails.forEach((email, i) => {
              response += `${i + 1}. ${email.subject} - ${formatTimeAgo(email.date)}\n`;
              response += `   ${email.snippet.slice(0, 100)}...\n\n`;
            });

            return response;
          },
        });
      },
    },
  ];
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default {
  getGmailToolDefinitions,
};
