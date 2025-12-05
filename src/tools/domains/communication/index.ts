/**
 * Communication Domain Tools
 *
 * Consolidated communication tools from multiple sources:
 * - communication.ts: Base email, SMS, calendar integration
 * - communication-tools.ts: Alex-specific advanced communication
 * - communication-coaching.ts: Communication coaching and frameworks
 *
 * DOMAIN: communication
 * TOOLS:
 *   Core: sendEmail, sendSMS, scheduleReminder, scheduleEvent
 *   Advanced: makePhoneCall, sendVoiceMessage, createReminderSchedule
 *   Coaching: draftDifficultMessage, practiceConversation, reviewCommunication
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';

// Import legacy tool creators
import { createCommunicationTools } from '../../communication.js';
import { createCommunicationCoachingTools } from '../../communication-coaching.js';

// ============================================================================
// LEGACY TOOL WRAPPER
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
// COMMUNICATION TOOLS (Consolidated: 4 → 2 tools)
// ============================================================================

function getCommunicationToolDefinitions(): ToolDefinition[] {
  const legacyTools = createCommunicationTools();

  return [
    wrapLegacyTool(
      'sendMessage',
      'Send Message',
      'Send a message via email or SMS. Channels: "email" (formal communication, longer messages) or "sms" (quick texts, reminders). Requires recipient contact info. Can also schedule messages for later delivery.',
      legacyTools.sendEmail,
      { tags: ['email', 'sms', 'send', 'message'], requiredServices: ['sendgrid', 'twilio'] }
    ),
    wrapLegacyTool(
      'scheduleReminder',
      'Schedule Reminder',
      'Set a reminder for yourself or schedule a calendar event. Types: "reminder" (personal notification at specific time), "event" (calendar block with optional attendees), or "follow-up" (reminder to follow up on something). Supports recurring reminders.',
      legacyTools.scheduleReminder,
      { tags: ['reminder', 'calendar', 'event', 'schedule', 'follow-up'] }
    ),
  ];
}

// ============================================================================
// COACHING TOOLS (Consolidated: 10 → 4 tools)
// ============================================================================

function getCoachingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createCommunicationCoachingTools();

  return [
    wrapLegacyTool(
      'draftMessage',
      'Draft Message',
      'Help draft any difficult message: asking for a raise, setting boundaries, giving feedback, declining requests, or resolving conflicts. Uses proven frameworks (SBI, assertion techniques). Includes tone analysis and revision suggestions. Just describe the situation and desired outcome.',
      legacyTools.draftDifficultMessage,
      { tags: ['coaching', 'draft', 'difficult', 'assertive', 'boundaries'] }
    ),
    wrapLegacyTool(
      'practiceConversation',
      'Practice Conversation',
      'Role-play a difficult conversation before having it. Build confidence by practicing: salary negotiations, difficult feedback, boundary setting, conflict resolution. I\'ll play the other person and give you feedback on your approach.',
      legacyTools.practiceConversation,
      { tags: ['coaching', 'practice', 'roleplay', 'confidence'] }
    ),
    wrapLegacyTool(
      'analyzeMessage',
      'Analyze Message',
      'Analyze any message for tone, clarity, and effectiveness. Modes: "review" (get feedback on your draft), "incoming" (understand a message you received), or "transform" (rewrite in a different tone - formal, casual, assertive, diplomatic).',
      legacyTools.reviewMessage,
      { tags: ['coaching', 'analysis', 'tone', 'review', 'transform'] }
    ),
    wrapLegacyTool(
      'communicationStrategy',
      'Communication Strategy',
      'Plan a comprehensive communication strategy for complex situations: difficult conversations, ongoing negotiations, relationship repair, professional transitions. Includes timing, channel selection, and follow-up planning.',
      legacyTools.planCommunicationStrategy,
      { tags: ['coaching', 'strategy', 'planning', 'follow-up'] }
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const communicationTools: ToolDefinition[] = [
  ...getCommunicationToolDefinitions(),
  ...getCoachingToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'communication',
  communicationTools
);

export {
  getCommunicationToolDefinitions,
  getCoachingToolDefinitions,
};

export default getToolDefinitions;

