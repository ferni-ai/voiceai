/**
 * Alex Contact Relationship Tools
 *
 * LLM-callable tools for tracking and managing contact relationships.
 * Helps Alex provide intelligent relationship insights.
 *
 * DOMAIN: communication
 * PERSONA: alex-chen
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
} from '../../../services/contacts/contact-relationship-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';

const log = getLogger();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Get Alex Contact tool definitions
 */
export function getAlexContactToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // getContactInsights - Relationship overview
    // =========================================================================
    {
      id: 'getContactInsights',
      name: 'Get Contact Insights',
      description: 'Get relationship insights: who needs attention, overdue follow-ups, weakening connections.',
      domain: 'communication',
      tags: ['contacts', 'relationships', 'insights'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get relationship insights: who needs attention, overdue follow-ups, weakening connections.',
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
      description: 'Get a list of contacts that could use some attention based on relationship strength and time since last contact.',
      domain: 'communication',
      tags: ['contacts', 'relationships', 'outreach'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get contacts that need attention based on relationship strength and communication patterns.',
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
              const timeStr = daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`;

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
      description: 'Get detailed information about a specific contact including relationship history and topics.',
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
            relationship: z.enum(['family', 'friend', 'colleague', 'acquaintance', 'professional', 'other']).optional(),
            notes: z.string().optional().describe('Any notes about this contact'),
          }),
          execute: async (params: {
            name: string;
            email?: string;
            phone?: string;
            relationship?: 'family' | 'friend' | 'colleague' | 'acquaintance' | 'professional' | 'other';
            notes?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Use email as contactId, or generate one
            const contactId = params.email || `${params.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

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
    // recordContactInteraction - Log an interaction
    // =========================================================================
    {
      id: 'recordContactInteraction',
      name: 'Record Contact Interaction',
      description: 'Record an interaction with a contact (call, email, meeting, etc.).',
      domain: 'communication',
      tags: ['contacts', 'interaction', 'log'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Record an interaction with a contact.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            type: z.enum(['email', 'call', 'text', 'meeting', 'other']).describe('Type of interaction'),
            direction: z.enum(['inbound', 'outbound']).optional().describe('Who initiated (default: outbound)'),
            summary: z.string().optional().describe('Brief summary of the interaction'),
            topics: z.array(z.string()).optional().describe('Topics discussed'),
          }),
          execute: async (params: {
            contactName: string;
            type: 'email' | 'call' | 'text' | 'meeting' | 'other';
            direction?: 'inbound' | 'outbound';
            summary?: string;
            topics?: string[];
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
              type: params.type,
              direction: params.direction || 'outbound',
              summary: params.summary,
              topics: params.topics,
            });

            return `Noted. I've recorded your ${params.type} with ${contact.name}.`;
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
            dueDate: z.string().describe('When to follow up (e.g., "next Monday", "in 3 days", "2024-12-25")'),
            priority: z.enum(['high', 'medium', 'low']).optional().describe('Priority level (default: medium)'),
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
  ];
}

export default {
  getAlexContactToolDefinitions,
};

