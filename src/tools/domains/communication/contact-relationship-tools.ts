/**
 * Contact Relationship Tools
 *
 * LLM-callable tools for tracking and managing contact relationships.
 * Provides intelligent relationship insights.
 *
 * DOMAIN: communication
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import {
  getContacts,
  getContact,
  upsertContact,
  recordInteraction,
  setFollowUp,
  completeFollowUp,
  getRelationshipInsights,
  getContactsNeedingAttention,
  searchContacts,
  getContactContext,
  getInteractionHistory,
  getInteractionStats,
} from '../../../services/contacts/contact-relationship-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';

const log = getLogger();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Get Contact Relationship tool definitions
 */
export function getContactRelationshipToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // getContactInsights - Relationship overview
    // =========================================================================
    {
      id: 'getContactInsights',
      name: 'Get Contact Insights',
      description:
        'Get relationship insights: who needs attention, overdue follow-ups, weakening connections.',
      domain: 'communication',
      tags: ['contacts', 'relationships', 'insights'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Get relationship insights: who needs attention, overdue follow-ups, weakening connections.',
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your contacts.';
            }

            const insights = await getRelationshipInsights(userId);

            if (insights.length === 0) {
              return 'All your relationships look healthy. No urgent follow-ups needed.';
            }

            let response = `Here's what I noticed about your relationships:\n\n`;

            insights.slice(0, 5).forEach((insight, i) => {
              const priorityIcon = insight.priority === 'high' ? 'Priority: ' : '';
              response += `${i + 1}. ${priorityIcon}${insight.message}\n`;
              if (insight.suggestedAction) {
                response += `   Suggestion: ${insight.suggestedAction}\n`;
              }
              response += '\n';
            });

            if (insights.length > 5) {
              response += `... and ${insights.length - 5} more insights.`;
            }

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getContactsNeedingAttention - Who to reach out to
    // =========================================================================
    {
      id: 'getContactsNeedingAttention',
      name: 'Get Contacts Needing Attention',
      description:
        'Get a list of contacts that could use some attention based on relationship strength and time since last contact.',
      domain: 'communication',
      tags: ['contacts', 'relationships', 'outreach'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Get contacts that need attention based on relationship strength and communication patterns.',
          parameters: z.object({
            count: z.number().optional().describe('Maximum contacts to return (default: 5)'),
          }),
          execute: async (params: { count?: number }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your contacts.';
            }

            const count = params.count || 5;
            const contacts = await getContactsNeedingAttention(userId, count);

            if (contacts.length === 0) {
              return 'No contacts are flagged as needing attention right now.';
            }

            const now = new Date();
            let response = `These contacts could use some attention:\n\n`;

            contacts.forEach((contact, i) => {
              const daysSince = Math.floor(
                (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
              );
              const timeStr =
                daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`;

              response += `${i + 1}. ${contact.name}`;
              if (contact.relationship) {
                response += ` (${contact.relationship})`;
              }
              response += ` - last contact: ${timeStr}\n`;

              if (contact.pendingFollowUp && !contact.pendingFollowUp.completed) {
                response += `   Pending: ${contact.pendingFollowUp.reason}\n`;
              }

              response += '\n';
            });

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getContactInfo - Get details about a specific contact
    // =========================================================================
    {
      id: 'getContactInfo',
      name: 'Get Contact Info',
      description:
        'Get detailed information about a specific contact including relationship history and topics.',
      domain: 'communication',
      tags: ['contacts', 'lookup', 'details'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get detailed information about a specific contact.',
          parameters: z.object({
            name: z.string().describe('Name or email of the contact to look up'),
          }),
          execute: async (params: { name: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Search for contact
            const matches = await searchContacts(userId, params.name);

            if (matches.length === 0) {
              return `I don't have any information about "${params.name}" in your contacts.`;
            }

            const contact = matches[0];
            const context = await getContactContext(userId, contact.contactId);

            return context || `Found ${contact.name} but no detailed context available.`;
          },
        });
      },
    },

    // =========================================================================
    // saveContact - Add or update a contact
    // =========================================================================
    {
      id: 'saveContact',
      name: 'Save Contact',
      description: 'Save a new contact or update existing contact information.',
      domain: 'communication',
      tags: ['contacts', 'save', 'create'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Save a new contact or update existing contact information.',
          parameters: z.object({
            name: z.string().describe('Contact name'),
            email: z.string().optional().describe('Email address'),
            phone: z.string().optional().describe('Phone number'),
            relationship: z
              .enum(['family', 'friend', 'colleague', 'acquaintance', 'professional', 'other'])
              .optional(),
            notes: z.string().optional().describe('Any notes about this contact'),
          }),
          execute: async (params: {
            name: string;
            email?: string;
            phone?: string;
            relationship?:
              | 'family'
              | 'friend'
              | 'colleague'
              | 'acquaintance'
              | 'professional'
              | 'other';
            notes?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Use email as contactId, or generate one
            const contactId =
              params.email || `${params.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

            const saved = await upsertContact(userId, {
              name: params.name,
              contactId,
              email: params.email,
              phone: params.phone,
              relationship: params.relationship,
              notes: params.notes,
            });

            return `Got it. I've saved ${saved.name} as a ${saved.relationship || 'contact'}.`;
          },
        });
      },
    },

    // =========================================================================
    // recordContactInteraction - Log an interaction (all 34 types!)
    // =========================================================================
    {
      id: 'recordContactInteraction',
      name: 'Record Contact Interaction',
      description:
        'Record ANY interaction with a contact - calls, messages, in-person meetings, social media, gifts, even money lent or borrowed.',
      domain: 'communication',
      tags: ['contacts', 'interaction', 'log', 'gift', 'social', 'meeting'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: `Record any interaction with a contact. Types include:
            - Communication: email, call, text, video_call, voice_message, instant_message
            - Social media: social_like, social_comment, social_dm, social_tag, social_share
            - In-person: meeting, hangout, dinner, party, activity, trip, visit
            - Gifts: gift_given, gift_received, card_sent, card_received, thank_you_sent, thank_you_received
            - Financial: money_lent, money_borrowed, money_repaid, split_bill
            - Life events: attended_event, milestone_shared
            - Other: photo_shared, recommendation, introduction, favor_done, favor_received, other`,
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            type: z
              .enum([
                // Digital Communication
                'email',
                'call',
                'text',
                'video_call',
                'voice_message',
                'instant_message',
                // Social Media
                'social_like',
                'social_comment',
                'social_dm',
                'social_tag',
                'social_share',
                // In-Person
                'meeting',
                'hangout',
                'dinner',
                'party',
                'activity',
                'trip',
                'visit',
                // Gifts & Cards
                'gift_given',
                'gift_received',
                'card_sent',
                'card_received',
                'thank_you_sent',
                'thank_you_received',
                // Financial
                'money_lent',
                'money_borrowed',
                'money_repaid',
                'split_bill',
                // Life Events
                'attended_event',
                'milestone_shared',
                // Other
                'photo_shared',
                'recommendation',
                'introduction',
                'favor_done',
                'favor_received',
                'other',
              ])
              .describe('Type of interaction'),
            direction: z
              .enum(['inbound', 'outbound'])
              .optional()
              .describe('Who initiated (default: outbound)'),
            summary: z.string().optional().describe('Brief summary or note about the interaction'),
            topics: z.array(z.string()).optional().describe('Topics discussed or relevant tags'),
            sentiment: z
              .enum(['positive', 'neutral', 'negative'])
              .optional()
              .describe('How the interaction felt'),
          }),
          execute: async (params: {
            contactName: string;
            type: string;
            direction?: 'inbound' | 'outbound';
            summary?: string;
            topics?: string[];
            sentiment?: 'positive' | 'neutral' | 'negative';
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Find contact
            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have "${params.contactName}" in your contacts. Would you like me to add them first?`;
            }

            const contact = matches[0];

            await recordInteraction(userId, {
              contactId: contact.contactId,
              userId,
              date: new Date(),
              type: params.type as import('../../../services/contacts/contact-relationship-service.js').InteractionType,
              direction: params.direction || 'outbound',
              summary: params.summary,
              topics: params.topics,
              sentiment: params.sentiment,
            });

            // Human-friendly confirmation based on type
            const typeMessages: Record<string, string> = {
              gift_given: `Noted! I've recorded that you gave a gift to ${contact.name}.`,
              gift_received: `Sweet! I've logged that you received a gift from ${contact.name}.`,
              money_lent: `Got it. I've recorded that you lent money to ${contact.name}.`,
              money_borrowed: `Noted. I've recorded that you borrowed from ${contact.name}.`,
              money_repaid: `Nice! I've marked the repayment with ${contact.name}.`,
              dinner: `Sounds lovely! I've logged your dinner with ${contact.name}.`,
              hangout: `Nice! I've recorded your hangout with ${contact.name}.`,
              trip: `How exciting! I've noted your trip with ${contact.name}.`,
              attended_event: `Wonderful! I've recorded that you attended ${contact.name}'s event.`,
              favor_done: `That's kind of you! I've noted the favor you did for ${contact.name}.`,
            };

            return (
              typeMessages[params.type] ||
              `Noted. I've recorded your ${params.type.replace(/_/g, ' ')} with ${contact.name}.`
            );
          },
        });
      },
    },

    // =========================================================================
    // setContactFollowUp - Set a follow-up reminder
    // =========================================================================
    {
      id: 'setContactFollowUp',
      name: 'Set Contact Follow-up',
      description: 'Set a follow-up reminder for a contact.',
      domain: 'communication',
      tags: ['contacts', 'follow-up', 'reminder'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Set a follow-up reminder for a contact.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            reason: z.string().describe('Reason for follow-up'),
            dueDate: z
              .string()
              .describe('When to follow up (e.g., "next Monday", "in 3 days", "2024-12-25")'),
            priority: z
              .enum(['high', 'medium', 'low'])
              .optional()
              .describe('Priority level (default: medium)'),
          }),
          execute: async (params: {
            contactName: string;
            reason: string;
            dueDate: string;
            priority?: 'high' | 'medium' | 'low';
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Find contact
            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have "${params.contactName}" in your contacts.`;
            }

            const contact = matches[0];

            // Parse date (simple parsing)
            let dueDate: Date;
            const now = new Date();

            if (params.dueDate.includes('tomorrow')) {
              dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            } else if (params.dueDate.includes('week')) {
              dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            } else if (params.dueDate.match(/\d+ day/)) {
              const days = parseInt(params.dueDate.match(/(\d+)/)?.[1] || '1', 10);
              dueDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            } else {
              // Try parsing as date
              dueDate = new Date(params.dueDate);
              if (isNaN(dueDate.getTime())) {
                dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              }
            }

            await setFollowUp(userId, contact.contactId, {
              reason: params.reason,
              dueDate,
              priority: params.priority || 'medium',
            });

            const dateStr = dueDate.toLocaleDateString();
            return `I'll remind you to follow up with ${contact.name} on ${dateStr}: "${params.reason}"`;
          },
        });
      },
    },

    // =========================================================================
    // completeContactFollowUp - Mark follow-up complete
    // =========================================================================
    {
      id: 'completeContactFollowUp',
      name: 'Complete Contact Follow-up',
      description: 'Mark a follow-up as completed.',
      domain: 'communication',
      tags: ['contacts', 'follow-up', 'complete'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Mark a follow-up as completed.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
          }),
          execute: async (params: { contactName: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have "${params.contactName}" in your contacts.`;
            }

            const contact = matches[0];
            await completeFollowUp(userId, contact.contactId);

            return `Great! I've marked your follow-up with ${contact.name} as complete.`;
          },
        });
      },
    },

    // =========================================================================
    // getContactInteractionHistory - View interaction timeline
    // =========================================================================
    {
      id: 'getContactInteractionHistory',
      name: 'Get Contact Interaction History',
      description:
        'See the history of all interactions with a contact - calls, messages, gifts, meetings, everything.',
      domain: 'communication',
      tags: ['contacts', 'history', 'interactions', 'timeline'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'View the full interaction history with a contact. Shows calls, messages, gifts, meetings, social media, and more.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            limit: z
              .number()
              .optional()
              .describe('How many recent interactions to show (default: 10)'),
            type: z
              .string()
              .optional()
              .describe('Filter by interaction type (e.g., "gift_given", "call", "meeting")'),
          }),
          execute: async (params: { contactName: string; limit?: number; type?: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have "${params.contactName}" in your contacts.`;
            }

            const contact = matches[0];
            const history = await getInteractionHistory(userId, contact.contactId, {
              limit: params.limit || 10,
              type: params.type as
                | import('../../../services/contacts/contact-relationship-service.js').InteractionType
                | undefined,
            });

            if (history.length === 0) {
              return `I don't have any recorded interactions with ${contact.name} yet. Would you like to record something?`;
            }

            let response = `Here's your recent history with ${contact.name}:\n\n`;

            history.forEach((interaction, i) => {
              const date = new Date(interaction.date);
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const typeIcon = getInteractionIcon(interaction.type);
              const direction = interaction.direction === 'inbound' ? '←' : '→';

              response += `${i + 1}. ${typeIcon} ${dateStr} ${direction} ${interaction.type.replace(/_/g, ' ')}`;
              if (interaction.summary) {
                response += `: ${interaction.summary}`;
              }
              if (interaction.sentiment) {
                const sentimentEmoji =
                  interaction.sentiment === 'positive'
                    ? '😊'
                    : interaction.sentiment === 'negative'
                      ? '😔'
                      : '';
                response += ` ${sentimentEmoji}`;
              }
              response += '\n';
            });

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getContactStats - Relationship statistics (Better Than Human!)
    // =========================================================================
    {
      id: 'getContactStats',
      name: 'Get Contact Statistics',
      description:
        'Get insights about your relationship - interaction patterns, streaks, sentiment trends, and suggestions.',
      domain: 'communication',
      tags: ['contacts', 'stats', 'insights', 'streaks', 'patterns'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Get deep insights about your relationship with someone. Shows interaction patterns, streaks, how the relationship is trending, and suggestions for staying connected.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
          }),
          execute: async (params: { contactName: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have "${params.contactName}" in your contacts.`;
            }

            const contact = matches[0];
            const stats = await getInteractionStats(userId, contact.contactId);

            if (stats.totalInteractions === 0) {
              return `I don't have enough data about ${contact.name} yet. Start logging some interactions and I'll track patterns for you!`;
            }

            let response = `Here's what I know about your relationship with ${contact.name}:\n\n`;

            // Total interactions
            response += `**Total interactions:** ${stats.totalInteractions}\n`;
            response += `**Average per month:** ${stats.avgPerMonth.toFixed(1)}\n\n`;

            // Top interaction types
            const sortedTypes = Object.entries(stats.byType)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3);

            if (sortedTypes.length > 0) {
              response += `**How you connect most:**\n`;
              sortedTypes.forEach(([type, count]) => {
                response += `- ${type.replace(/_/g, ' ')}: ${count} times\n`;
              });
              response += '\n';
            }

            // Streak info
            if (stats.longestStreak) {
              response += `**Best streak:** ${stats.longestStreak.count} consecutive ${stats.longestStreak.type.replace(/_/g, ' ')}s! 🔥\n\n`;
            }

            // Sentiment trend
            const trendEmoji =
              stats.sentimentTrend === 'improving'
                ? '📈'
                : stats.sentimentTrend === 'declining'
                  ? '📉'
                  : stats.sentimentTrend === 'stable'
                    ? '📊'
                    : '';
            response += `**Relationship trend:** ${stats.sentimentTrend} ${trendEmoji}\n\n`;

            // Suggestion
            response += `**Suggested next:** A ${stats.suggestedNextInteraction.replace(/_/g, ' ')} would be nice!`;

            return response;
          },
        });
      },
    },
  ];
}

// Helper function for interaction type icons
function getInteractionIcon(type: string): string {
  const icons: Record<string, string> = {
    call: '📞',
    video_call: '📹',
    text: '💬',
    email: '📧',
    voice_message: '🎤',
    instant_message: '💬',
    meeting: '🤝',
    hangout: '☕',
    dinner: '🍽️',
    party: '🎉',
    activity: '🎯',
    trip: '✈️',
    visit: '🏠',
    gift_given: '🎁→',
    gift_received: '←🎁',
    card_sent: '💌→',
    card_received: '←💌',
    thank_you_sent: '🙏→',
    thank_you_received: '←🙏',
    money_lent: '💵→',
    money_borrowed: '←💵',
    money_repaid: '💵✓',
    social_like: '❤️',
    social_comment: '💬',
    social_dm: '📩',
    social_tag: '🏷️',
    social_share: '🔄',
    attended_event: '🎊',
    milestone_shared: '🏆',
    photo_shared: '📷',
    recommendation: '👍',
    introduction: '🤝',
    favor_done: '🤲→',
    favor_received: '←🤲',
  };
  return icons[type] || '📌';
}

export default {
  getContactRelationshipToolDefinitions,
};
