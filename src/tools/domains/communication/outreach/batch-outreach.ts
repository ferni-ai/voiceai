/**
 * Batch Outreach Tools - Group & Seasonal Messaging
 *
 * For when you need to reach multiple people at once, but still
 * want each message to feel personal. Think:
 * - Holiday greetings to your whole family
 * - Birthday wishes to a friend group
 * - Thank you notes after an event
 * - Seasonal check-ins with important contacts
 *
 * "Better than Human" because:
 * - Each message is personalized to the recipient
 * - No one gets a generic mass message
 * - We track who's already been contacted
 * - Suggests who might need to hear from you
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';

// Contact & relationship services
import {
  searchContacts,
  getContacts,
  type ContactRelationship,
} from '../../../../services/contacts/contact-relationship-service.js';
import {
  getGroups,
  getGroup,
  createGroup,
  addToGroup,
  getGroupsForOccasion,
} from '../../../../services/contacts/contact-groups.js';
import type { ContactGroup } from '../../../../types/contacts.js';

// Message crafting
import { craftPersonalizedMessage, type MessageCraftingContext } from './message-crafting.js';
import type { OutreachIntent } from './unified-outreach.js';

// Delivery services
import { sendSMS } from '../../../../services/outreach/delivery/sms-delivery.js';
import { sendEmail } from '../../../../services/outreach/delivery/email-delivery.js';

const log = createLogger({ module: 'batch-outreach' });

// ============================================================================
// TYPES
// ============================================================================

export type BatchOccasion =
  | 'christmas'
  | 'new_year'
  | 'thanksgiving'
  | 'birthday_wishes'
  | 'thank_you'
  | 'check_in'
  | 'announcement'
  | 'custom';

interface BatchMessagePreview {
  contactId: string;
  contactName: string;
  channel: 'text' | 'email';
  message: string;
  channelValue: string; // phone or email
}

interface BatchResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  results: {
    contactName: string;
    success: boolean;
    error?: string;
  }[];
}

// Store pending batch previews for approval
const pendingBatches = new Map<
  string,
  {
    userId: string;
    previews: BatchMessagePreview[];
    occasion: BatchOccasion;
    createdAt: Date;
  }
>();

// Clean up old pending batches (15 min expiry)
setInterval(
  () => {
    const now = Date.now();
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    for (const [key, batch] of pendingBatches.entries()) {
      if (now - batch.createdAt.getTime() > FIFTEEN_MINUTES) {
        pendingBatches.delete(key);
      }
    }
  },
  5 * 60 * 1000
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function occasionToIntent(occasion: BatchOccasion): OutreachIntent {
  switch (occasion) {
    case 'christmas':
    case 'new_year':
    case 'thanksgiving':
    case 'birthday_wishes':
      return 'wish_well';
    case 'thank_you':
      return 'thank_you';
    case 'check_in':
      return 'check_in';
    case 'announcement':
      return 'share_news';
    default:
      return 'just_because';
  }
}

function occasionToPurpose(occasion: BatchOccasion): string {
  switch (occasion) {
    case 'christmas':
      return 'Merry Christmas';
    case 'new_year':
      return 'Happy New Year';
    case 'thanksgiving':
      return 'Happy Thanksgiving';
    case 'birthday_wishes':
      return 'Happy Birthday';
    case 'thank_you':
      return 'Thank you';
    case 'check_in':
      return 'Just checking in';
    case 'announcement':
      return 'Share some news';
    default:
      return 'Thinking of you';
  }
}

async function craftBatchMessage(
  contact: ContactRelationship,
  occasion: BatchOccasion,
  customMessage: string | undefined,
  personaId: string,
  channel: 'text' | 'email'
): Promise<string> {
  if (customMessage) {
    // Still personalize the custom message with their name
    return customMessage.replace(/{name}/g, contact.name.split(' ')[0]);
  }

  const ctx: MessageCraftingContext = {
    contactName: contact.name,
    purpose: occasionToPurpose(occasion),
    intent: occasionToIntent(occasion),
    recentTopics: contact.topics?.slice(0, 3).map((t) => t.topic) || [],
    daysSinceLastContact: Math.floor(
      (Date.now() - (contact.lastInteraction?.getTime() || Date.now())) / (1000 * 60 * 60 * 24)
    ),
    relationshipStrength: contact.strengthScore || 50,
    personaId,
    channel,
  };

  return craftPersonalizedMessage(ctx);
}

// ============================================================================
// PREVIEW BATCH MESSAGES
// ============================================================================

export function createPreviewBatchTool(ctx: ToolContext): Tool {
  return llm.tool({
    description: `Preview personalized messages for a group before sending. Each message
will be uniquely crafted based on your relationship with that person. Review them
before I send, and you can edit any message.`,

    parameters: z.object({
      groupOrContacts: z
        .string()
        .describe('Group name (e.g., "family", "work friends") or comma-separated contact names'),
      occasion: z
        .enum([
          'christmas',
          'new_year',
          'thanksgiving',
          'birthday_wishes',
          'thank_you',
          'check_in',
          'announcement',
          'custom',
        ])
        .describe('What kind of message is this?'),
      customMessage: z
        .string()
        .optional()
        .describe('Optional: Base message to personalize. Use {name} for their first name.'),
      channel: z
        .enum(['text', 'email', 'auto'])
        .optional()
        .describe("Delivery channel. 'auto' picks based on what we have for each contact."),
    }),

    execute: async (params) => {
      const userId = ctx.userId;
      if (!userId) return 'I need to know who you are to send messages.';

      const { groupOrContacts, occasion, customMessage, channel = 'auto' } = params;
      const personaId = ctx.agentId || 'ferni';

      log.info({ userId, groupOrContacts, occasion, channel }, '📋 Previewing batch messages');

      // Resolve contacts from group or names
      let contacts: ContactRelationship[] = [];

      // Try as a group first
      try {
        const groups = await getGroups(userId);
        const group = groups.find(
          (g) =>
            g.name.toLowerCase() === groupOrContacts.toLowerCase() ||
            g.id === groupOrContacts.toLowerCase()
        );

        if (group) {
          const allContacts = await getContacts(userId);
          contacts = allContacts.filter((c) => group.members.includes(c.id));
        }
      } catch (err) {
        log.debug({ error: String(err) }, 'Group lookup failed, trying as contact names');
      }

      // If no group, try as comma-separated names
      if (contacts.length === 0) {
        const names = groupOrContacts.split(',').map((n) => n.trim());
        for (const name of names) {
          const matches = await searchContacts(userId, name);
          if (matches.length > 0) {
            contacts.push(matches[0]);
          }
        }
      }

      if (contacts.length === 0) {
        return (
          `I couldn't find any contacts matching "${groupOrContacts}". ` +
          `You can create a group with: "Create a group called family with Mom, Dad, Sarah"`
        );
      }

      // Generate previews
      const previews: BatchMessagePreview[] = [];
      const skipped: string[] = [];

      for (const contact of contacts) {
        // Determine channel
        let useChannel: 'text' | 'email' = 'text';
        let channelValue: string | undefined;

        if (channel === 'auto') {
          if (contact.phone) {
            useChannel = 'text';
            channelValue = contact.phone;
          } else if (contact.email) {
            useChannel = 'email';
            channelValue = contact.email;
          }
        } else {
          useChannel = channel;
          channelValue = channel === 'text' ? contact.phone : contact.email;
        }

        if (!channelValue) {
          skipped.push(contact.name);
          continue;
        }

        const message = await craftBatchMessage(
          contact,
          occasion,
          customMessage,
          personaId,
          useChannel
        );

        previews.push({
          contactId: contact.id,
          contactName: contact.name,
          channel: useChannel,
          message,
          channelValue,
        });
      }

      // Store for sending
      const batchId = `batch_${Date.now()}`;
      pendingBatches.set(batchId, {
        userId,
        previews,
        occasion,
        createdAt: new Date(),
      });

      // Format preview response
      let response = `📋 **Preview: ${previews.length} messages for ${occasionToPurpose(occasion)}**\n\n`;

      for (const preview of previews) {
        const icon = preview.channel === 'text' ? '📱' : '📧';
        response += `${icon} **${preview.contactName}**: "${preview.message}"\n`;
      }

      if (skipped.length > 0) {
        response += `\n⚠️ Skipped (no ${channel === 'email' ? 'email' : 'phone'}): ${skipped.join(', ')}\n`;
      }

      response += `\n**Ready to send?** Say "send them" or "send the batch" to send all.`;
      response += `\nOr tell me which ones to edit.`;

      return response;
    },
  });
}

// ============================================================================
// SEND BATCH MESSAGES
// ============================================================================

export function createSendBatchTool(ctx: ToolContext): Tool {
  return llm.tool({
    description: `Send the previewed batch messages. Call this after preview to actually send the messages.`,

    parameters: z.object({
      confirm: z
        .boolean()
        .describe('Set to true to confirm sending all previewed messages'),
    }),

    execute: async (params) => {
      const userId = ctx.userId;
      if (!userId) return 'I need to know who you are.';

      if (!params.confirm) {
        return "I'll need you to confirm before I send these. Say 'yes, send them' to confirm.";
      }

      // Find the most recent pending batch for this user
      let latestBatch: { id: string; data: (typeof pendingBatches extends Map<string, infer V> ? V : never) } | null = null;
      for (const [id, batch] of pendingBatches.entries()) {
        if (batch.userId === userId) {
          if (!latestBatch || batch.createdAt > latestBatch.data.createdAt) {
            latestBatch = { id, data: batch };
          }
        }
      }

      if (!latestBatch) {
        return "I don't have any messages queued up. Preview messages first with 'send holiday wishes to family'.";
      }

      const { previews, occasion } = latestBatch.data;
      const personaId = ctx.agentId || 'ferni';
      const results: BatchResult = {
        total: previews.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };

      for (const preview of previews) {
        try {
          const outreachId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

          if (preview.channel === 'text') {
            const result = await sendSMS({
              to: preview.channelValue,
              body: preview.message,
              personaId,
              userId,
              outreachId,
            });

            if (result.success) {
              results.sent++;
              results.results.push({ contactName: preview.contactName, success: true });
            } else {
              results.failed++;
              results.results.push({
                contactName: preview.contactName,
                success: false,
                error: result.error,
              });
            }
          } else {
            // Email
            const subject = `${occasionToPurpose(occasion)} from ${ctx.agentId || 'a friend'}`;
            const result = await sendEmail({
              to: preview.channelValue,
              subject,
              body: preview.message,
              personaId,
              userId,
              outreachId,
            });

            if (result.success) {
              results.sent++;
              results.results.push({ contactName: preview.contactName, success: true });
            } else {
              results.failed++;
              results.results.push({
                contactName: preview.contactName,
                success: false,
                error: result.error,
              });
            }
          }
        } catch (error) {
          results.failed++;
          results.results.push({
            contactName: preview.contactName,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Clean up
      pendingBatches.delete(latestBatch.id);

      // Format response
      let response = `✅ **Batch complete!**\n`;
      response += `- Sent: ${results.sent}/${results.total}\n`;

      if (results.failed > 0) {
        response += `- Failed: ${results.failed}\n`;
        const failures = results.results.filter((r) => !r.success);
        for (const f of failures) {
          response += `  - ${f.contactName}: ${f.error}\n`;
        }
      }

      return response;
    },
  });
}

// ============================================================================
// GET OUTREACH SUGGESTIONS
// ============================================================================

export function createOutreachSuggestionsTool(ctx: ToolContext): Tool {
  return llm.tool({
    description: `Get suggestions for who might appreciate hearing from you. I look at:
- People you haven't talked to in a while
- Upcoming occasions (birthdays, anniversaries)
- Pending follow-ups you mentioned
- Seasonal opportunities (holidays, seasons)`,

    parameters: z.object({
      limit: z.number().optional().describe('Max suggestions to return (default 5)'),
    }),

    execute: async (params) => {
      const userId = ctx.userId;
      if (!userId) return 'I need to know who you are.';

      const limit = params.limit || 5;

      try {
        const contacts = await getContacts(userId);
        if (contacts.length === 0) {
          return "You don't have any contacts saved yet. I'll learn about the people in your life as we chat!";
        }

        const now = new Date();
        const suggestions: {
          contact: ContactRelationship;
          reason: string;
          priority: number;
        }[] = [];

        for (const contact of contacts) {
          // Check last contact time
          const daysSince = contact.lastInteraction
            ? Math.floor(
                (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
              )
            : 999;

          // Pending follow-up
          if (contact.pendingFollowUp && !contact.pendingFollowUp.completed) {
            suggestions.push({
              contact,
              reason: `You wanted to follow up: ${contact.pendingFollowUp.reason}`,
              priority: 90,
            });
            continue;
          }

          // Haven't talked in a while
          if (daysSince > 30 && contact.strengthScore && contact.strengthScore >= 50) {
            suggestions.push({
              contact,
              reason:
                daysSince > 90
                  ? `It's been ${Math.floor(daysSince / 30)} months since you connected`
                  : `It's been a few weeks since you connected`,
              priority: Math.min(80, daysSince / 2),
            });
          }
        }

        // Sort by priority and limit
        suggestions.sort((a, b) => b.priority - a.priority);
        const topSuggestions = suggestions.slice(0, limit);

        if (topSuggestions.length === 0) {
          return "You're pretty caught up! No one seems overdue for a check-in right now.";
        }

        let response = "**💡 People who might appreciate hearing from you:**\n\n";
        for (const s of topSuggestions) {
          response += `• **${s.contact.name}** - ${s.reason}\n`;
        }

        response += "\nWant me to reach out to any of them?";
        return response;
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to get suggestions');
        return 'I had trouble checking your contacts. Try again in a moment?';
      }
    },
  });
}

// ============================================================================
// TOOL DEFINITIONS EXPORT
// ============================================================================

export function getBatchOutreachDefinitions(): ToolDefinition[] {
  return [
    {
      id: 'previewBatchMessages',
      name: 'Preview Batch Messages',
      description: 'Preview personalized messages for a group before sending',
      domain: 'communication',
      tags: ['batch', 'outreach', 'group', 'preview'],
      create: createPreviewBatchTool,
    },
    {
      id: 'sendBatchMessages',
      name: 'Send Batch Messages',
      description: 'Send all previewed batch messages',
      domain: 'communication',
      tags: ['batch', 'outreach', 'group', 'send'],
      create: createSendBatchTool,
    },
    {
      id: 'getOutreachSuggestions',
      name: 'Get Outreach Suggestions',
      description: 'Get suggestions for who to reach out to',
      domain: 'communication',
      tags: ['suggestions', 'outreach', 'contacts'],
      create: createOutreachSuggestionsTool,
    },
  ];
}

export default getBatchOutreachDefinitions;

