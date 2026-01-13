/**
 * Communication Domain Tools - Rationalized Architecture
 *
 * STRUCTURE:
 * ├── outreach/                    # All reaching-out in ONE place
 * │   ├── unified-outreach.ts      # THE tool: reachOut (call, text, email, conversation)
 * │   ├── batch-outreach.ts        # Group & seasonal messaging
 * │   └── message-crafting.ts      # LLM-powered personalization
 * │
 * ├── communication-coaching.ts    # Draft difficult messages, role-play (DISTINCT)
 * ├── contact-relationship-tools.ts # Contact CRUD (DISTINCT)
 * ├── gmail-tools.ts               # Gmail integration (DISTINCT)
 * └── message-validation-tools.ts  # "Sleep on it" validation (DISTINCT)
 *
 * DEPRECATED (use outreach/ instead):
 * - enhanced-outreach-tools.ts → outreach/unified-outreach.ts
 * - personalized-outreach-tools.ts → outreach/batch-outreach.ts
 * - communication-tools.ts → outreach/unified-outreach.ts
 * - unified-outreach-tool.ts → outreach/unified-outreach.ts (moved)
 *
 * PRIMARY TOOLS:
 *   reachOut         - THE way to reach any contact (auto-picks channel, timing, message)
 *   previewBatch     - Preview personalized messages for groups
 *   sendBatch        - Send batch messages after preview
 *   getOutreachSuggestions - Who should you reach out to?
 *
 * DISTINCT TOOLS (kept separate):
 *   Coaching: draftMessage, rolePlayConversation, analyzeMessage, communicationStrategy
 *   Gmail: readGmail, searchGmail, sendGmail
 *   Contacts: addContact, updateContact, searchContacts
 *   Validation: sleepOnIt, reviewAndSend
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
// New rationalized outreach module
import { getOutreachToolDefinitions } from './outreach/index.js';
// Import distinct tool modules (kept separate)
import { createCommunicationCoachingTools } from './communication-coaching.js';
import { getGmailToolDefinitions } from './gmail-tools.js';
import { getContactRelationshipToolDefinitions } from './contact-relationship-tools.js';
import { getMessageValidationToolDefinitions } from './message-validation-tools.js';
// Legacy tools - still used for scheduling (not part of outreach consolidation)
import { createCommunicationTools } from './communication-tools.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const log = createLogger({ module: 'communication-domain' });
// Stub context for internal routing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STUB_CONTEXT = { ctx: {}, toolCallId: 'internal-routing' };
// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================
function wrapLegacyTool(id, name, description, legacyTool, options) {
    return {
        id,
        name,
        description,
        domain: 'communication',
        tags: ['communication', ...(options?.tags || [])],
        requiredServices: options?.requiredServices,
        create: (_ctx) => legacyTool,
    };
}
// ============================================================================
// SCHEDULING TOOLS (Not part of outreach - keep separate)
// ============================================================================
function getSchedulingToolDefinitions() {
    const legacyTools = createCommunicationTools();
    return [
        {
            id: 'scheduleReminder',
            name: 'Schedule Reminder',
            description: 'Set a reminder or schedule a calendar event. Supports reminders, events with attendees, and follow-ups.',
            domain: 'communication',
            tags: ['communication', 'reminder', 'calendar', 'event', 'schedule', 'follow-up'],
            create: (_ctx) => llm.tool({
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
                            return await legacyTools.scheduleEvent.execute({
                                title: params.title,
                                description: params.description,
                                when: params.when,
                                durationMinutes: params.duration,
                            }, STUB_CONTEXT);
                        }
                        else {
                            return await legacyTools.scheduleReminder.execute({
                                reminderText: params.title,
                                when: params.when,
                                contactMethod: params.contactMethod,
                                contact: params.contact,
                            }, STUB_CONTEXT);
                        }
                    }
                    catch (error) {
                        log.error({ type: params.type, error: String(error) }, '⏰ Schedule error');
                        return `I had trouble scheduling that. ${String(error)}`;
                    }
                },
            }),
        },
    ];
}
// ============================================================================
// COACHING TOOLS
// ============================================================================
function getCoachingToolDefinitions() {
    const legacyTools = createCommunicationCoachingTools();
    return [
        wrapLegacyTool('draftMessage', 'Draft Message', 'Help draft any difficult message: asking for a raise, setting boundaries, giving feedback, declining requests, or resolving conflicts. Uses proven frameworks (SBI, assertion techniques).', legacyTools.draftDifficultMessage, { tags: ['coaching', 'draft', 'difficult', 'assertive', 'boundaries'] }),
        wrapLegacyTool('rolePlayConversation', 'Role-Play Conversation', "Role-play a conversation before having it. Build confidence by practicing: salary negotiations, difficult feedback, boundary setting, conflict resolution. I'll play the other person.", legacyTools.practiceConversation, { tags: ['coaching', 'practice', 'roleplay', 'confidence'] }),
        {
            id: 'analyzeMessage',
            name: 'Analyze Message',
            description: 'Analyze messages for tone, clarity, and effectiveness. Review your drafts, understand incoming messages, or transform tone.',
            domain: 'communication',
            tags: ['communication', 'coaching', 'analysis', 'tone', 'review', 'transform'],
            create: (_ctx) => llm.tool({
                description: getToolDescription('analyzeMessage'),
                parameters: z.object({
                    mode: z
                        .enum(['review', 'incoming', 'transform', 'tone_check'])
                        .describe('Analysis mode'),
                    message: z.string().describe('The message to analyze'),
                    context: z.string().optional().describe('Context: who sent/receives it, situation'),
                    sender: z.string().optional().describe('Who sent this message (for incoming mode)'),
                    userGoal: z
                        .string()
                        .optional()
                        .describe('What outcome do you want from your response?'),
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
                    intendedTone: z.string().optional().describe('What tone are you going for?'),
                    concern: z.string().optional().describe('Specific concern about the message'),
                }),
                execute: async (params) => {
                    log.info({ mode: params.mode }, '💬 Analyze message tool called');
                    try {
                        switch (params.mode) {
                            case 'review':
                                return await legacyTools.reviewMessage.execute({
                                    message: params.message,
                                    context: params.context || 'general review',
                                    concern: params.concern,
                                }, STUB_CONTEXT);
                            case 'incoming':
                                return await legacyTools.analyzeIncomingMessage.execute({
                                    incomingMessage: params.message,
                                    sender: params.sender || 'Unknown sender',
                                    userContext: params.context,
                                    userGoal: params.userGoal,
                                }, STUB_CONTEXT);
                            case 'transform':
                                if (!params.targetTone) {
                                    return 'I need to know what tone to transform to (more_direct, softer, more_formal, more_casual, warmer, more_assertive).';
                                }
                                return await legacyTools.transformTone.execute({
                                    message: params.message,
                                    currentTone: params.currentTone || 'neutral',
                                    targetTone: params.targetTone,
                                }, STUB_CONTEXT);
                            case 'tone_check':
                                if (!params.intendedTone) {
                                    return 'What tone are you going for? (e.g., professional, friendly, assertive)';
                                }
                                return await legacyTools.checkTone.execute({
                                    message: params.message,
                                    intendedTone: params.intendedTone,
                                }, STUB_CONTEXT);
                            default:
                                return 'Please specify a mode: review, incoming, transform, or tone_check.';
                        }
                    }
                    catch (error) {
                        log.error({ mode: params.mode, error: String(error) }, '💬 Analyze message error');
                        return `I had trouble analyzing that message. ${String(error)}`;
                    }
                },
            }),
        },
        wrapLegacyTool('communicationStrategy', 'Communication Strategy', 'Plan a comprehensive communication strategy for complex situations: difficult conversations, ongoing negotiations, relationship repair. Includes timing, channel selection, and follow-up planning.', legacyTools.planCommunicationStrategy, { tags: ['coaching', 'strategy', 'planning', 'follow-up'] }),
        wrapLegacyTool('buildAssertiveness', 'Build Assertive Response', 'Help respond more assertively to situations where you feel pushed around, need to say no, or are avoiding a necessary conversation.', legacyTools.buildAssertiveResponse, { tags: ['coaching', 'assertiveness', 'boundaries', 'confidence'] }),
        wrapLegacyTool('planFollowUp', 'Plan Follow-Up', "Plan a follow-up strategy when you've sent something and gotten no response. Helps you persist without being annoying.", legacyTools.planFollowUp, { tags: ['coaching', 'follow-up', 'persistence', 'strategy'] }),
    ];
}
// ============================================================================
// BACKGROUND FOLLOW-UP - "While You Were Away"
// ============================================================================
const backgroundFollowUpDef = {
    id: 'backgroundFollowUp',
    name: 'Background Follow-Up',
    description: 'Send a follow-up message in the background, even when the user disconnects. Perfect for: "Send a thank you note to Sarah", "Follow up with the recruiter", "Send that email while I\'m busy".',
    domain: 'communication',
    tags: ['background', 'async', 'email', 'follow-up', 'while-you-were-away', 'alex-specialty'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('backgroundFollowUp'),
            parameters: z.object({
                recipientName: z.string().describe('Name of the person to follow up with'),
                recipientEmail: z.string().optional().describe('Email address if known'),
                subject: z.string().describe('Subject line for the message'),
                message: z.string().describe('The follow-up message content'),
                context: z.string().optional().describe('Context about why this follow-up is needed'),
                channel: z.enum(['email', 'sms', 'both']).default('email').describe('How to send'),
            }),
            execute: async ({ recipientName, recipientEmail, subject, message, context, channel }) => {
                const userId = ctx.userId || 'anonymous';
                log.info({ userId, recipientName, channel }, 'Queueing background follow-up');
                try {
                    const { queueFollowup } = await import('../../../services/background-agents/executors/followup-executor.js');
                    const taskId = await queueFollowup({
                        userId,
                        sessionId: ctx.sessionId,
                        recipientName,
                        recipientEmail,
                        subject,
                        message,
                        channel,
                        context,
                        initiatedBy: 'alex',
                    });
                    return `**Follow-Up Scheduled** 📧\n\nI'll send this follow-up to ${recipientName} in the background.\n\n**Subject:** ${subject}\n**Channel:** ${channel}\n**Task ID:** ${taskId.slice(0, 8)}...\n\nI'll keep working on this even if you disconnect. I'll let you know once it's sent! ✉️`;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Failed to queue follow-up');
                    return `I couldn't schedule that follow-up right now. Want me to help you draft it and you can send it manually?`;
                }
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const communicationTools = [
    // PRIMARY: Unified outreach tools (reachOut, batch, suggestions)
    ...getOutreachToolDefinitions(),
    // Scheduling (distinct from outreach)
    ...getSchedulingToolDefinitions(),
    // Communication coaching (distinct)
    ...getCoachingToolDefinitions(),
    // Gmail integration (distinct)
    ...getGmailToolDefinitions(),
    // Contact management (distinct)
    ...getContactRelationshipToolDefinitions(),
    // "Sleep on it" validation (distinct)
    ...getMessageValidationToolDefinitions(),
    // Background follow-up (while you were away)
    backgroundFollowUpDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('communication', communicationTools);
// Export specific definition getters for testing/composition
export { getOutreachToolDefinitions, getSchedulingToolDefinitions, getCoachingToolDefinitions, getGmailToolDefinitions, getContactRelationshipToolDefinitions, getMessageValidationToolDefinitions, };
// Re-export outreach utilities for direct use
export { createUnifiedOutreachTool, getUnifiedOutreachDefinition, createMultiOutreachTool, getMultiOutreachDefinition, craftPersonalizedMessage, craftConversationOpener, getBatchOutreachDefinitions, } from './outreach/index.js';
// Re-export legacy tool creators for backward compatibility
export { createCommunicationCoachingTools } from './communication-coaching.js';
// Re-export from communication-tools.ts for legacy consumers
export { createCommunicationTools as createCommunicationSpecialistTools, parseScheduleTime, createCommunicationTools, } from './communication-tools.js';
export default getToolDefinitions;
//# sourceMappingURL=index.js.map