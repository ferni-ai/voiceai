/**
 * Message Validation Tools ("Sleep on It")
 *
 * LLM-callable tools for message validation and review.
 * Helps users avoid sending messages they might regret.
 *
 * DOMAIN: communication
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import {
  analyzeMessage,
  saveDraft,
  getPendingDrafts,
  getDraft,
  getDraftsReadyForReview,
  approveDraft,
  discardDraft,
  getTimeUntilReview,
  formatAnalysisForSpeech,
} from '../../../services/message-validation/message-validation-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';

const log = getLogger();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Get Message Validation tool definitions
 */
export function getMessageValidationToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // analyzeMessageTone - Real-time message analysis
    // =========================================================================
    {
      id: 'analyzeMessageTone',
      name: 'Analyze Message Tone',
      description:
        'Analyze a message for tone, emotional content, and potential issues before sending.',
      domain: 'communication',
      tags: ['message', 'tone', 'analysis', 'validation'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Analyze a message for tone and emotional content. Use this to help users understand how their message might be received.',
          parameters: z.object({
            message: z.string().describe('The message content to analyze'),
            recipient: z.string().optional().describe('Who the message is for (for context)'),
          }),
          execute: async (params: { message: string; recipient?: string }) => {
            const analysis = analyzeMessage(params.message, { recipient: params.recipient });
            return formatAnalysisForSpeech(analysis);
          },
        });
      },
    },

    // =========================================================================
    // saveMessageForReview - "Sleep on it"
    // =========================================================================
    {
      id: 'saveMessageForReview',
      name: 'Save Message for Review',
      description:
        'Save a message to review later ("sleep on it"). The message will be held for the suggested wait time.',
      domain: 'communication',
      tags: ['message', 'draft', 'review', 'sleep-on-it'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Save a message for later review. Use when user wants to "sleep on it" or when you recommend waiting before sending.',
          parameters: z.object({
            recipient: z.string().describe('Who the message is for'),
            content: z.string().describe('The message content'),
            subject: z.string().optional().describe('Subject line (for emails)'),
            recipientType: z.enum(['email', 'text', 'social', 'other']).optional(),
            notes: z.string().optional().describe("Any notes about why they're saving it"),
          }),
          execute: async (params: {
            recipient: string;
            content: string;
            subject?: string;
            recipientType?: 'email' | 'text' | 'social' | 'other';
            notes?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to save this draft.';
            }

            const draft = await saveDraft(userId, {
              recipient: params.recipient,
              content: params.content,
              subject: params.subject,
              recipientType: params.recipientType,
              userNotes: params.notes,
            });

            const waitHours = draft.suggestedWaitHours;
            let response = `Got it. I've saved your message to ${draft.recipient}. `;

            if (waitHours >= 24) {
              response += `Based on what I see, I'd suggest sleeping on this one. I'll check back with you tomorrow.`;
            } else if (waitHours >= 4) {
              response += `I'd suggest waiting a few hours before sending. I'll remind you when it's ready for review.`;
            } else if (waitHours > 0) {
              response += `Take some time with this one. I'll let you know when it's ready for another look.`;
            } else {
              response += `It looks good to go, but it's saved if you want to review it later.`;
            }

            if (draft.analysis.suggestions.length > 0) {
              response += `\n\nA thought: ${draft.analysis.suggestions[0]}`;
            }

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getPendingMessages - Check saved drafts
    // =========================================================================
    {
      id: 'getPendingMessages',
      name: 'Get Pending Messages',
      description: 'Get messages that are saved and pending review.',
      domain: 'communication',
      tags: ['message', 'draft', 'pending'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            "Get all pending message drafts. Use when user asks about saved messages or what's waiting for review.",
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const pending = await getPendingDrafts(userId);

            if (pending.length === 0) {
              return "You don't have any messages saved for review right now.";
            }

            const now = new Date();
            let response = `You have ${pending.length} message${pending.length > 1 ? 's' : ''} saved:\n\n`;

            for (const draft of pending) {
              const isReady = draft.waitUntil <= now;
              const minutesLeft = Math.ceil(
                (draft.waitUntil.getTime() - now.getTime()) / (1000 * 60)
              );
              const hoursLeft = Math.ceil(minutesLeft / 60);

              response += `To ${draft.recipient}`;
              if (draft.subject) {
                response += ` (${draft.subject})`;
              }
              response += ': ';

              if (isReady) {
                response += 'Ready for review\n';
              } else if (hoursLeft > 1) {
                response += `${hoursLeft} hours until review\n`;
              } else {
                response += `${minutesLeft} minutes until review\n`;
              }

              // Show snippet
              const snippet = draft.content.slice(0, 50) + (draft.content.length > 50 ? '...' : '');
              response += `   "${snippet}"\n\n`;
            }

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getMessagesReadyForReview - Ready to send
    // =========================================================================
    {
      id: 'getMessagesReadyForReview',
      name: 'Get Messages Ready for Review',
      description:
        "Get messages where the wait time has elapsed and they're ready for final review.",
      domain: 'communication',
      tags: ['message', 'draft', 'ready', 'review'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get messages that have completed their wait time and are ready for review.',
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const ready = await getDraftsReadyForReview(userId);

            if (ready.length === 0) {
              return "No messages are ready for review yet. I'll let you know when they are.";
            }

            let response = `${ready.length} message${ready.length > 1 ? 's are' : ' is'} ready for your review:\n\n`;

            for (const draft of ready) {
              response += `To ${draft.recipient}`;
              if (draft.subject) {
                response += ` - ${draft.subject}`;
              }
              response += `:\n"${draft.content.slice(0, 100)}${draft.content.length > 100 ? '...' : ''}"\n\n`;
              response += `Original tone: ${draft.analysis.dominantTone}`;
              if (draft.analysis.riskScore >= 50) {
                response += ` (worth a careful read)`;
              }
              response += '\n\n';
            }

            response +=
              'Would you like to review any of these? You can approve, modify, or discard them.';

            return response;
          },
        });
      },
    },

    // =========================================================================
    // reviewMessage - Get full draft details
    // =========================================================================
    {
      id: 'reviewMessage',
      name: 'Review Message',
      description: 'Review a specific saved message in detail.',
      domain: 'communication',
      tags: ['message', 'review', 'detail'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get full details of a saved message for review.',
          parameters: z.object({
            recipient: z.string().describe('The recipient name to find the draft'),
          }),
          execute: async (params: { recipient: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const pending = await getPendingDrafts(userId);
            const draft = pending.find((d) =>
              d.recipient.toLowerCase().includes(params.recipient.toLowerCase())
            );

            if (!draft) {
              return `I don't see a saved message for "${params.recipient}".`;
            }

            const now = new Date();
            const isReady = draft.waitUntil <= now;
            const minutesLeft = await getTimeUntilReview(userId, draft.id);

            let response = `Message to ${draft.recipient}`;
            if (draft.subject) {
              response += `\nSubject: ${draft.subject}`;
            }
            response += `\n\n"${draft.content}"\n\n`;

            response += `--- Analysis ---\n`;
            response += `Tone: ${draft.analysis.dominantTone}\n`;
            response += `Risk level: ${draft.analysis.riskScore >= 70 ? 'High' : draft.analysis.riskScore >= 40 ? 'Medium' : 'Low'}\n`;

            if (draft.analysis.signals.length > 0) {
              response += `\nThings I noticed:\n`;
              draft.analysis.signals.slice(0, 3).forEach((s) => {
                response += `- ${s.description}\n`;
              });
            }

            if (draft.analysis.suggestions.length > 0) {
              response += `\nSuggestions:\n`;
              draft.analysis.suggestions.forEach((s) => {
                response += `- ${s}\n`;
              });
            }

            response += '\n';
            if (isReady) {
              response +=
                'This message is ready for review. Would you like to send it, modify it, or discard it?';
            } else if (minutesLeft !== null) {
              if (minutesLeft > 60) {
                response += `Wait time: ${Math.ceil(minutesLeft / 60)} more hours before review.`;
              } else {
                response += `Wait time: ${minutesLeft} more minutes before review.`;
              }
            }

            return response;
          },
        });
      },
    },

    // =========================================================================
    // approveMessage - Send it
    // =========================================================================
    {
      id: 'approveMessage',
      name: 'Approve Message',
      description: 'Approve a saved message for sending.',
      domain: 'communication',
      tags: ['message', 'approve', 'send'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Approve a message for sending after review.',
          parameters: z.object({
            recipient: z.string().describe('The recipient name to find the draft'),
            modifiedContent: z
              .string()
              .optional()
              .describe('Modified content if user wants to change it'),
          }),
          execute: async (params: { recipient: string; modifiedContent?: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const pending = await getPendingDrafts(userId);
            const draft = pending.find((d) =>
              d.recipient.toLowerCase().includes(params.recipient.toLowerCase())
            );

            if (!draft) {
              return `I don't see a saved message for "${params.recipient}".`;
            }

            const approved = await approveDraft(userId, draft.id, params.modifiedContent);

            if (!approved) {
              return 'Something went wrong approving that message.';
            }

            const content = approved.modifiedContent || approved.content;
            let response = `Your message to ${approved.recipient} is approved`;

            if (approved.modifiedContent) {
              response += ' with your changes';
            }
            response += '.\n\n';

            // Note: In a real system, this would trigger actual sending
            response += `Ready to send:\n"${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"`;

            return response;
          },
        });
      },
    },

    // =========================================================================
    // discardMessage - Don't send
    // =========================================================================
    {
      id: 'discardMessage',
      name: 'Discard Message',
      description: 'Discard a saved message without sending.',
      domain: 'communication',
      tags: ['message', 'discard', 'delete'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Discard a saved message without sending. The right choice sometimes.',
          parameters: z.object({
            recipient: z.string().describe('The recipient name to find the draft'),
          }),
          execute: async (params: { recipient: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const pending = await getPendingDrafts(userId);
            const draft = pending.find((d) =>
              d.recipient.toLowerCase().includes(params.recipient.toLowerCase())
            );

            if (!draft) {
              return `I don't see a saved message for "${params.recipient}".`;
            }

            const discarded = await discardDraft(userId, draft.id);

            if (!discarded) {
              return 'Something went wrong discarding that message.';
            }

            // Celebrate the decision to not send
            const responses = [
              'That took courage. The unwritten message is often the wisest one.',
              'Good call. Not everything needs to be said.',
              "Done. Sometimes the best message is the one we don't send.",
              'Discarded. You can always come back to it if things change.',
              'I think that was the right choice. Moving on.',
            ];

            return responses[Math.floor(Math.random() * responses.length)];
          },
        });
      },
    },
  ];
}

export default {
  getMessageValidationToolDefinitions,
};
