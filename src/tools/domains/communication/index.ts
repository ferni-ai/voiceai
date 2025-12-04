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
// COMMUNICATION TOOLS
// ============================================================================

function getCommunicationToolDefinitions(): ToolDefinition[] {
  const legacyTools = createCommunicationTools();

  return [
    wrapLegacyTool(
      'sendEmail',
      'Send Email',
      'Send an email to a recipient',
      legacyTools.sendEmail,
      { tags: ['email', 'send'], requiredServices: ['sendgrid'] }
    ),
    wrapLegacyTool(
      'sendSMS',
      'Send SMS',
      'Send a text message to a phone number',
      legacyTools.sendSMS,
      { tags: ['sms', 'text', 'send'], requiredServices: ['twilio'] }
    ),
    wrapLegacyTool(
      'scheduleReminder',
      'Schedule Reminder',
      'Schedule a reminder for a future date and time',
      legacyTools.scheduleReminder,
      { tags: ['reminder', 'schedule'] }
    ),
    wrapLegacyTool(
      'scheduleEvent',
      'Schedule Event',
      'Schedule a calendar event',
      legacyTools.scheduleEvent,
      { tags: ['calendar', 'event', 'schedule'], requiredServices: ['google-calendar'] }
    ),
  ];
}

// ============================================================================
// COACHING TOOLS (from communication-coaching.ts)
// ============================================================================

function getCoachingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createCommunicationCoachingTools();

  return [
    wrapLegacyTool(
      'draftDifficultMessage',
      'Draft Difficult Message',
      'Help draft a difficult message using communication frameworks (SBI, Three-Part Assertion)',
      legacyTools.draftDifficultMessage,
      { tags: ['coaching', 'draft', 'difficult'] }
    ),
    wrapLegacyTool(
      'practiceConversation',
      'Practice Conversation',
      'Role-play a difficult conversation to build confidence',
      legacyTools.practiceConversation,
      { tags: ['coaching', 'practice', 'roleplay'] }
    ),
    wrapLegacyTool(
      'reviewMessage',
      'Review Message',
      'Get feedback on a draft message',
      legacyTools.reviewMessage,
      { tags: ['coaching', 'feedback', 'review'] }
    ),
    wrapLegacyTool(
      'planCommunicationStrategy',
      'Plan Communication Strategy',
      'Plan a communication strategy for complex situations',
      legacyTools.planCommunicationStrategy,
      { tags: ['coaching', 'strategy', 'planning'] }
    ),
    wrapLegacyTool(
      'checkTone',
      'Check Tone',
      'Analyze the tone of a message',
      legacyTools.checkTone,
      { tags: ['coaching', 'tone', 'analysis'] }
    ),
    wrapLegacyTool(
      'transformTone',
      'Transform Tone',
      'Transform the tone of a message to a different style',
      legacyTools.transformTone,
      { tags: ['coaching', 'tone', 'transform'] }
    ),
    wrapLegacyTool(
      'buildAssertiveResponse',
      'Build Assertive Response',
      'Help craft an assertive but respectful response',
      legacyTools.buildAssertiveResponse,
      { tags: ['coaching', 'assertive'] }
    ),
    wrapLegacyTool(
      'planFollowUp',
      'Plan Follow-Up',
      'Plan follow-up communication after a conversation',
      legacyTools.planFollowUp,
      { tags: ['coaching', 'follow-up'] }
    ),
    wrapLegacyTool(
      'analyzeIncomingMessage',
      'Analyze Incoming Message',
      'Analyze an incoming message to help craft a response',
      legacyTools.analyzeIncomingMessage,
      { tags: ['coaching', 'analysis'] }
    ),
    wrapLegacyTool(
      'analyzeCommPattern',
      'Analyze Communication Pattern',
      'Analyze communication patterns and suggest improvements',
      legacyTools.analyzeCommPattern,
      { tags: ['coaching', 'pattern', 'analysis'] }
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

