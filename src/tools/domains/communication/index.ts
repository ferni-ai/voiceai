/**
 * Communication Domain Tools
 *
 * Consolidated communication tools with proper routing:
 * - communication.ts: Base email, SMS, calendar integration
 * - communication-coaching.ts: Communication coaching and frameworks
 * - proactive-outreach.ts: Agent-initiated contact (texts, emails, calls)
 * - personalized-outreach-tools.ts: Batch personalized messaging, contact groups
 *
 * DOMAIN: communication
 * TOOLS:
 *   Core: sendMessage (email or SMS), scheduleReminder, scheduleEvent
 *   Coaching: draftMessage, rolePlayConversation, analyzeMessage, communicationStrategy
 *   Proactive: proactiveOutreach (save contact, send text/email, schedule reminder, call)
 *   Personalized: sendPersonalizedMessage, sendGroupMessage, getOutreachSuggestions, manageContactGroup
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ExternalService, ToolContext, ToolDefinition } from '../../registry/types.js';

// Stub options for internal tool routing (these calls don't use the actual context)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STUB_CONTEXT = { ctx: {}, toolCallId: 'internal-routing' } as any;

// Import legacy tool creators
import { createCommunicationCoachingTools } from './communication-coaching.js';
import { createCommunicationTools } from '../../communication.js';
import { proactiveOutreachTools } from '../../proactive-outreach.js';
// Gmail tools
import { getGmailToolDefinitions } from './gmail-tools.js';
// Contact relationship tools
import { getContactRelationshipToolDefinitions } from './contact-relationship-tools.js';
// Message validation tools ("Sleep on it")
import { getMessageValidationToolDefinitions } from './message-validation-tools.js';
// Personalized outreach tools (batch messaging, groups, seasonal)
import { getPersonalizedOutreachToolDefinitions } from './personalized-outreach-tools.js';
// Enhanced outreach tools (voice messages, rich email, gifts, optimal timing)
import { getEnhancedOutreachToolDefinitions } from './enhanced-outreach-tools.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// LEGACY TOOL WRAPPER (for tools that don't need routing)
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  options?: {
    tags?: string[];
    requiredServices?: ExternalService[];
  }
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'communication',
    tags: ['communication', ...(options?.tags || [])],
    requiredServices: options?.requiredServices,
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// COMMUNICATION TOOLS (Properly routed)
// ============================================================================

function getCommunicationToolDefinitions(): ToolDefinition[] {
  const log = getLogger();
  const legacyTools = createCommunicationTools();

  return [
    {
      id: 'sendMessage',
      name: 'Send Message',
      description:
        'Send a message via email or SMS. Use email for formal/longer communications, SMS for quick texts and reminders.',
      domain: 'communication',
      tags: ['communication', 'email', 'sms', 'send', 'message'],
      requiredServices: ['sendgrid', 'twilio'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('sendMessage'),
          parameters: z.object({
            channel: z.enum(['email', 'sms']).describe('Communication channel'),
            to: z.string().describe('Recipient email address or phone number'),
            subject: z.string().optional().describe('Email subject (required for email)'),
            message: z.string().describe('Message content'),
          }),
          execute: async (params) => {
            log.info({ channel: params.channel, to: params.to }, '📧 Send message tool called');

            try {
              if (params.channel === 'email') {
                return await legacyTools.sendEmail.execute(
                  {
                    to: params.to,
                    subject: params.subject || 'Message from Ferni',
                    body: params.message,
                  },
                  STUB_CONTEXT
                );
              } else {
                return await legacyTools.sendSMS.execute(
                  { to: params.to, message: params.message },
                  STUB_CONTEXT
                );
              }
            } catch (error) {
              log.error({ channel: params.channel, error: String(error) }, '📧 Send message error');
              return `I had trouble sending that ${params.channel}. ${String(error)}`;
            }
          },
        }),
    },
    {
      id: 'scheduleReminder',
      name: 'Schedule Reminder',
      description:
        'Set a reminder or schedule a calendar event. Supports reminders, events with attendees, and follow-ups.',
      domain: 'communication',
      tags: ['communication', 'reminder', 'calendar', 'event', 'schedule', 'follow-up'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('scheduleReminder'),
          parameters: z.object({
            type: z.enum(['reminder', 'event', 'follow-up']).describe('What to schedule'),
            title: z.string().describe('What to be reminded about or event title'),
            when: z.string().describe('When (e.g., "tomorrow at 3pm", "next Tuesday")'),
            description: z.string().optional().describe('Additional details'),
            duration: z.number().optional().describe('Event duration in minutes'),
            contactMethod: z.enum(['sms', 'email']).optional().describe('How to deliver reminder'),
            contact: z.string().optional().describe('Phone/email for reminder'),
          }),
          execute: async (params) => {
            log.info({ type: params.type, title: params.title }, '⏰ Schedule tool called');

            try {
              if (params.type === 'event') {
                return await legacyTools.scheduleEvent.execute(
                  {
                    title: params.title,
                    description: params.description,
                    when: params.when,
                    durationMinutes: params.duration,
                  },
                  STUB_CONTEXT
                );
              } else {
                // reminder or follow-up
                return await legacyTools.scheduleReminder.execute(
                  {
                    reminderText: params.title,
                    when: params.when,
                    contactMethod: params.contactMethod,
                    contact: params.contact,
                  },
                  STUB_CONTEXT
                );
              }
            } catch (error) {
              log.error({ type: params.type, error: String(error) }, '⏰ Schedule error');
              return `I had trouble scheduling that. ${String(error)}`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// COACHING TOOLS (Properly routed)
// ============================================================================

function getCoachingToolDefinitions(): ToolDefinition[] {
  const log = getLogger();
  const legacyTools = createCommunicationCoachingTools();

  return [
    wrapLegacyTool(
      'draftMessage',
      'Draft Message',
      'Help draft any difficult message: asking for a raise, setting boundaries, giving feedback, declining requests, or resolving conflicts. Uses proven frameworks (SBI, assertion techniques).',
      legacyTools.draftDifficultMessage,
      { tags: ['coaching', 'draft', 'difficult', 'assertive', 'boundaries'] }
    ),
    wrapLegacyTool(
      'rolePlayConversation',
      'Role-Play Conversation',
      "Role-play a conversation before having it. Build confidence by practicing: salary negotiations, difficult feedback, boundary setting, conflict resolution. I'll play the other person.",
      legacyTools.practiceConversation,
      { tags: ['coaching', 'practice', 'roleplay', 'confidence'] }
    ),
    {
      id: 'analyzeMessage',
      name: 'Analyze Message',
      description:
        'Analyze messages for tone, clarity, and effectiveness. Review your drafts, understand incoming messages, or transform tone.',
      domain: 'communication',
      tags: ['communication', 'coaching', 'analysis', 'tone', 'review', 'transform'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('analyzeMessage'),
          parameters: z.object({
            mode: z
              .enum(['review', 'incoming', 'transform', 'tone_check'])
              .describe('Analysis mode'),
            message: z.string().describe('The message to analyze'),
            context: z.string().optional().describe('Context: who sent/receives it, situation'),
            // For incoming analysis
            sender: z.string().optional().describe('Who sent this message (for incoming mode)'),
            userGoal: z
              .string()
              .optional()
              .describe('What outcome do you want from your response?'),
            // For transform
            targetTone: z
              .enum([
                'more_direct',
                'softer',
                'more_formal',
                'more_casual',
                'warmer',
                'more_assertive',
              ])
              .optional()
              .describe('Target tone for transformation'),
            currentTone: z.string().optional().describe('Current tone description'),
            // For tone check
            intendedTone: z.string().optional().describe('What tone are you going for?'),
            // For review
            concern: z.string().optional().describe('Specific concern about the message'),
          }),
          execute: async (params) => {
            log.info({ mode: params.mode }, '💬 Analyze message tool called');

            try {
              switch (params.mode) {
                case 'review':
                  return await legacyTools.reviewMessage.execute(
                    {
                      message: params.message,
                      context: params.context || 'general review',
                      concern: params.concern,
                    },
                    STUB_CONTEXT
                  );

                case 'incoming':
                  return await legacyTools.analyzeIncomingMessage.execute(
                    {
                      incomingMessage: params.message,
                      sender: params.sender || 'Unknown sender',
                      userContext: params.context,
                      userGoal: params.userGoal,
                    },
                    STUB_CONTEXT
                  );

                case 'transform':
                  if (!params.targetTone) {
                    return 'I need to know what tone to transform to (more_direct, softer, more_formal, more_casual, warmer, more_assertive).';
                  }
                  return await legacyTools.transformTone.execute(
                    {
                      message: params.message,
                      currentTone: params.currentTone || 'neutral',
                      targetTone: params.targetTone,
                    },
                    STUB_CONTEXT
                  );

                case 'tone_check':
                  if (!params.intendedTone) {
                    return 'What tone are you going for? (e.g., professional, friendly, assertive)';
                  }
                  return await legacyTools.checkTone.execute(
                    {
                      message: params.message,
                      intendedTone: params.intendedTone,
                    },
                    STUB_CONTEXT
                  );

                default:
                  return 'Please specify a mode: review, incoming, transform, or tone_check.';
              }
            } catch (error) {
              log.error({ mode: params.mode, error: String(error) }, '💬 Analyze message error');
              return `I had trouble analyzing that message. ${String(error)}`;
            }
          },
        }),
    },
    wrapLegacyTool(
      'communicationStrategy',
      'Communication Strategy',
      'Plan a comprehensive communication strategy for complex situations: difficult conversations, ongoing negotiations, relationship repair. Includes timing, channel selection, and follow-up planning.',
      legacyTools.planCommunicationStrategy,
      { tags: ['coaching', 'strategy', 'planning', 'follow-up'] }
    ),
    wrapLegacyTool(
      'buildAssertiveness',
      'Build Assertive Response',
      'Help respond more assertively to situations where you feel pushed around, need to say no, or are avoiding a necessary conversation.',
      legacyTools.buildAssertiveResponse,
      { tags: ['coaching', 'assertiveness', 'boundaries', 'confidence'] }
    ),
    wrapLegacyTool(
      'planFollowUp',
      'Plan Follow-Up',
      "Plan a follow-up strategy when you've sent something and gotten no response. Helps you persist without being annoying.",
      legacyTools.planFollowUp,
      { tags: ['coaching', 'follow-up', 'persistence', 'strategy'] }
    ),
  ];
}

// ============================================================================
// PROACTIVE OUTREACH TOOLS
// ============================================================================

function getProactiveOutreachToolDefinitions(): ToolDefinition[] {
  return proactiveOutreachTools.map((tool) => ({
    id: tool.name,
    name: tool.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    description: tool.description,
    domain: 'communication' as const,
    tags: ['proactive', 'outreach', 'contact', 'reminder'],
    requiredServices: ['twilio', 'sendgrid'] as ExternalService[],
    create: (ctx: ToolContext) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (params: Record<string, unknown>) => tool.handler(params, ctx),
    }),
  }));
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const communicationTools: ToolDefinition[] = [
  ...getCommunicationToolDefinitions(),
  ...getProactiveOutreachToolDefinitions(),
  ...getCoachingToolDefinitions(),
  ...getGmailToolDefinitions(),
  ...getContactRelationshipToolDefinitions(),
  ...getMessageValidationToolDefinitions(),
  ...getPersonalizedOutreachToolDefinitions(),
  ...getEnhancedOutreachToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'communication',
  communicationTools
);

export {
  getCoachingToolDefinitions,
  getCommunicationToolDefinitions,
  getProactiveOutreachToolDefinitions,
  getGmailToolDefinitions,
  getContactRelationshipToolDefinitions,
  getMessageValidationToolDefinitions,
  getPersonalizedOutreachToolDefinitions,
  getEnhancedOutreachToolDefinitions,
};

// Re-export legacy tool creators for direct use by persona agents
// NOTE: communication-tools.js is the feature-rich version with real SendGrid/Twilio
export { createCommunicationTools as createCommunicationSpecialistTools } from './communication-tools.js';
export { createCommunicationCoachingTools } from './communication-coaching.js';

export default getToolDefinitions;
