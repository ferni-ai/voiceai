/**
 * Personalized Outreach Tools
 *
 * LLM-callable tools for sending deeply personalized messages to contacts.
 * Enables "better than human" batch messaging with full context awareness.
 *
 * DOMAIN: communication
 * PERSONA: alex-chen, ferni
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import {
  previewBatchMessages,
  sendBatchMessages,
  getOutreachSuggestions,
  buildOutreachContext,
  generatePersonalizedMessage,
} from '../../../services/contacts/personalized-outreach.js';
import {
  getGroups,
  getGroup,
  createGroup,
  addToGroup,
  removeFromGroup,
  getGroupsForOccasion,
} from '../../../services/contacts/contact-groups.js';
import { searchContacts, getContacts } from '../../../services/contacts/contact-relationship-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';
import type { OutreachOccasion, OutreachTone, PersonalizedMessage } from '../../../services/contacts/types.js';

const log = getLogger();

// Store previewed messages for approval
const pendingMessages = new Map<string, PersonalizedMessage[]>();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Get Personalized Outreach tool definitions
 */
export function getPersonalizedOutreachToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // sendPersonalizedMessage - Send to one contact
    // =========================================================================
    {
      id: 'sendPersonalizedMessage',
      name: 'Send Personalized Message',
      description: `Send a deeply personalized message to a single contact. Uses relationship context, 
recent conversations, and seasonal awareness to craft a message that feels genuinely personal.`,
      domain: 'communication',
      tags: ['outreach', 'personalization', 'message'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: `Send a personalized message to a contact. The message will be automatically 
personalized based on your relationship history, recent topics, and the occasion.`,
          parameters: z.object({
            contactName: z.string().describe('Name of the contact to message'),
            occasion: z.enum([
              'christmas', 'new_year', 'thanksgiving', 'birthday', 'anniversary',
              'memorial', 'check_in', 'thinking_of_you', 'congratulations', 'sympathy', 'custom'
            ]).describe('The occasion for this message'),
            customOccasion: z.string().optional().describe('Custom occasion name if occasion is "custom"'),
            tone: z.enum(['casual', 'warm', 'formal', 'celebratory', 'supportive', 'reflective'])
              .optional()
              .describe('Tone for the message (default: warm)'),
            customMessage: z.string().optional()
              .describe('Optional custom base message to personalize (use {name} for their name)'),
          }),
          execute: async (params: {
            contactName: string;
            occasion: OutreachOccasion;
            customOccasion?: string;
            tone?: OutreachTone;
            customMessage?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to send messages.';
            }

            // Find the contact
            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have "${params.contactName}" in your contacts. Would you like me to add them first?`;
            }

            const contact = matches[0];

            // Preview the message
            const result = await previewBatchMessages({
              userId,
              recipients: [contact.id],
              occasion: params.occasion,
              customOccasion: params.customOccasion,
              tone: params.tone || 'warm',
              baseMessage: params.customMessage,
              requireApproval: true,
            });

            if (result.messages.length === 0) {
              const skipReason = result.skipped[0]?.reason || 'Unknown error';
              return `Couldn't create a message for ${contact.name}: ${skipReason}`;
            }

            const msg = result.messages[0];

            // Store for approval
            pendingMessages.set(userId, result.messages);

            let response = `**Here's the message for ${msg.contactName}:**\n\n`;
            response += `"${msg.message}"\n\n`;
            response += `**Sending via:** ${msg.channel} (${msg.channelValue})\n`;
            
            if (msg.personalizationNotes.length > 0) {
              response += `**Personal touches:** ${msg.personalizationNotes.join(', ')}\n`;
            }

            response += `\nWant me to send it? Just say "yes" or "send it".`;

            return response;
          },
        });
      },
    },

    // =========================================================================
    // sendGroupMessage - Send to a group
    // =========================================================================
    {
      id: 'sendGroupMessage',
      name: 'Send Group Message',
      description: `Send personalized messages to an entire group (like "family" or "close friends"). 
Each person receives a unique, personalized version based on your relationship with them.`,
      domain: 'communication',
      tags: ['outreach', 'batch', 'group'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: `Send personalized messages to all members of a contact group. 
Each message is uniquely crafted based on your relationship with that person.`,
          parameters: z.object({
            groupName: z.string().describe('Name of the group (e.g., "family", "close friends")'),
            occasion: z.enum([
              'christmas', 'new_year', 'thanksgiving', 'birthday', 'anniversary',
              'check_in', 'thinking_of_you', 'congratulations', 'custom'
            ]).describe('The occasion for these messages'),
            customOccasion: z.string().optional().describe('Custom occasion name'),
            tone: z.enum(['casual', 'warm', 'formal', 'celebratory', 'supportive', 'reflective'])
              .optional()
              .describe('Overall tone (default: warm)'),
            baseMessage: z.string().optional()
              .describe('Optional base message to personalize for each person'),
          }),
          execute: async (params: {
            groupName: string;
            occasion: OutreachOccasion;
            customOccasion?: string;
            tone?: OutreachTone;
            baseMessage?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Find the group
            const group = await getGroup(userId, params.groupName);
            if (!group) {
              const groups = await getGroups(userId);
              const groupNames = groups.map((g) => g.name).join(', ');
              return `I don't have a group called "${params.groupName}". Your groups are: ${groupNames || 'none yet'}`;
            }

            if (group.members.length === 0) {
              return `The "${group.name}" group is empty. Add some contacts first!`;
            }

            // Generate all messages
            const result = await previewBatchMessages({
              userId,
              recipients: group.id,
              occasion: params.occasion,
              customOccasion: params.customOccasion,
              tone: params.tone || 'warm',
              baseMessage: params.baseMessage,
              requireApproval: true,
            });

            // Store for approval
            pendingMessages.set(userId, result.messages);

            let response = `**${params.occasion === 'christmas' ? '🎄' : params.occasion === 'new_year' ? '🎉' : '📨'} Messages ready for ${group.name}:**\n\n`;

            // Show preview of first 5
            const previews = result.messages.slice(0, 5);
            for (const msg of previews) {
              response += `**${msg.contactName}** (${msg.channel}):\n`;
              response += `"${msg.message.length > 100 ? msg.message.slice(0, 100) + '...' : msg.message}"\n\n`;
            }

            if (result.messages.length > 5) {
              response += `...and ${result.messages.length - 5} more messages\n\n`;
            }

            // Stats
            response += `**Summary:** ${result.stats.generated} messages ready`;
            if (result.stats.skipped > 0) {
              response += `, ${result.stats.skipped} skipped (no contact info)`;
            }

            response += `\n\nWant me to send them all? Say "yes" or "send them".`;

            return response;
          },
        });
      },
    },

    // =========================================================================
    // approveAndSendMessages - Confirm and send
    // =========================================================================
    {
      id: 'approveAndSendMessages',
      name: 'Approve and Send Messages',
      description: 'Approve and send the previously previewed messages.',
      domain: 'communication',
      tags: ['outreach', 'send', 'approve'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Send the previously previewed messages after user approval.',
          parameters: z.object({
            confirm: z.boolean().describe('Set to true to confirm sending'),
          }),
          execute: async (params: { confirm: boolean }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const messages = pendingMessages.get(userId);
            if (!messages || messages.length === 0) {
              return 'No messages pending. Create some messages first!';
            }

            if (!params.confirm) {
              return 'No problem, I won\'t send them. Let me know if you want to make changes.';
            }

            // Approve all messages
            for (const msg of messages) {
              msg.approved = true;
            }

            // Send them
            const result = await sendBatchMessages(userId, messages);

            // Clear pending
            pendingMessages.delete(userId);

            let response = '✅ **Messages sent!**\n\n';
            response += `- ${result.stats.sent} messages delivered\n`;

            if (result.stats.skipped > 0) {
              response += `- ${result.stats.skipped} couldn't be sent:\n`;
              for (const skip of result.skipped.slice(0, 3)) {
                response += `  - ${skip.contactName}: ${skip.reason}\n`;
              }
            }

            // Log the sent messages
            log.info({ userId, sent: result.stats.sent }, 'Batch messages sent');

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getOutreachSuggestions - Proactive suggestions
    // =========================================================================
    {
      id: 'getOutreachSuggestions',
      name: 'Get Outreach Suggestions',
      description: `Get proactive suggestions for who you should reach out to based on:
- Contacts you haven't talked to in a while
- Upcoming birthdays and anniversaries  
- Seasonal holidays coming up`,
      domain: 'communication',
      tags: ['outreach', 'suggestions', 'proactive'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get suggestions for contacts to reach out to.',
          parameters: z.object({
            limit: z.number().optional().describe('Max suggestions to return (default: 5)'),
          }),
          execute: async (params: { limit?: number }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const suggestions = await getOutreachSuggestions(userId, params.limit || 5);

            if (suggestions.length === 0) {
              return 'No urgent outreach suggestions right now. Your relationships look well-maintained!';
            }

            let response = '**Here\'s who might appreciate hearing from you:**\n\n';

            for (const suggestion of suggestions) {
              const urgencyIcon = suggestion.urgency === 'high' ? '🔴' : suggestion.urgency === 'medium' ? '🟡' : '🟢';
              response += `${urgencyIcon} **${suggestion.contact.name}**: ${suggestion.reason}\n`;
            }

            response += '\nWant me to help draft a message for any of them?';

            return response;
          },
        });
      },
    },

    // =========================================================================
    // manageContactGroup - Create/manage groups
    // =========================================================================
    {
      id: 'manageContactGroup',
      name: 'Manage Contact Group',
      description: 'Create a new contact group or add/remove members from an existing group.',
      domain: 'communication',
      tags: ['contacts', 'groups', 'organize'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Create a group or add/remove contacts from a group.',
          parameters: z.object({
            action: z.enum(['create', 'add', 'remove', 'list']).describe('Action to perform'),
            groupName: z.string().describe('Name of the group'),
            contactNames: z.array(z.string()).optional().describe('Contact names to add/remove'),
            description: z.string().optional().describe('Group description (for create)'),
          }),
          execute: async (params: {
            action: 'create' | 'add' | 'remove' | 'list';
            groupName: string;
            contactNames?: string[];
            description?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            switch (params.action) {
              case 'list': {
                const groups = await getGroups(userId);
                if (groups.length === 0) {
                  return 'No contact groups yet. Want me to create one?';
                }

                let response = '**Your contact groups:**\n\n';
                for (const g of groups) {
                  response += `- **${g.name}**: ${g.members.length} members`;
                  if (g.description) response += ` - ${g.description}`;
                  response += '\n';
                }
                return response;
              }

              case 'create': {
                try {
                  const group = await createGroup(userId, {
                    name: params.groupName,
                    description: params.description,
                  });
                  return `Created group "${group.name}"! Now add contacts with: "add [name] to ${group.name}"`;
                } catch (error) {
                  return `Couldn't create group: ${String(error)}`;
                }
              }

              case 'add': {
                const group = await getGroup(userId, params.groupName);
                if (!group) {
                  return `Group "${params.groupName}" doesn't exist. Create it first?`;
                }

                if (!params.contactNames || params.contactNames.length === 0) {
                  return 'Which contacts should I add?';
                }

                const addedNames: string[] = [];
                const notFound: string[] = [];

                for (const name of params.contactNames) {
                  const matches = await searchContacts(userId, name);
                  if (matches.length > 0) {
                    await addToGroup(userId, group.id, matches[0].id);
                    addedNames.push(matches[0].name);
                  } else {
                    notFound.push(name);
                  }
                }

                let response = '';
                if (addedNames.length > 0) {
                  response += `Added to ${group.name}: ${addedNames.join(', ')}\n`;
                }
                if (notFound.length > 0) {
                  response += `Couldn't find: ${notFound.join(', ')}`;
                }
                return response || 'No changes made.';
              }

              case 'remove': {
                const group = await getGroup(userId, params.groupName);
                if (!group) {
                  return `Group "${params.groupName}" doesn't exist.`;
                }

                if (!params.contactNames || params.contactNames.length === 0) {
                  return 'Which contacts should I remove?';
                }

                const removedNames: string[] = [];

                for (const name of params.contactNames) {
                  const matches = await searchContacts(userId, name);
                  if (matches.length > 0) {
                    await removeFromGroup(userId, group.id, matches[0].id);
                    removedNames.push(matches[0].name);
                  }
                }

                return removedNames.length > 0
                  ? `Removed from ${group.name}: ${removedNames.join(', ')}`
                  : 'No contacts found to remove.';
              }
            }
          },
        });
      },
    },

    // =========================================================================
    // getSeasonalOutreachGroups - Who to message for holidays
    // =========================================================================
    {
      id: 'getSeasonalOutreachGroups',
      name: 'Get Seasonal Outreach Groups',
      description: 'See which groups want to receive greetings for different occasions.',
      domain: 'communication',
      tags: ['outreach', 'seasonal', 'holidays'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Check which contact groups should receive holiday/seasonal greetings.',
          parameters: z.object({
            occasion: z.enum(['christmas', 'newYear', 'thanksgiving', 'birthdays', 'anniversaries'])
              .describe('The occasion to check'),
          }),
          execute: async (params: {
            occasion: 'christmas' | 'newYear' | 'thanksgiving' | 'birthdays' | 'anniversaries';
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const groups = await getGroupsForOccasion(userId, params.occasion);

            if (groups.length === 0) {
              return `No groups are set up for ${params.occasion} greetings yet.`;
            }

            let totalContacts = 0;
            let response = `**Groups for ${params.occasion} greetings:**\n\n`;

            for (const g of groups) {
              response += `- ${g.name}: ${g.members.length} contacts\n`;
              totalContacts += g.members.length;
            }

            response += `\n**Total:** ${totalContacts} people to message\n`;
            response += `\nWant me to draft ${params.occasion} messages for everyone?`;

            return response;
          },
        });
      },
    },
  ];
}

export default {
  getPersonalizedOutreachToolDefinitions,
};

