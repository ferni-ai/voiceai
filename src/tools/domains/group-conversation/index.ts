/**
 * Group Conversation Domain Tools
 *
 * Tools for multi-participant voice conversations:
 * - Team Roundtables (multiple AI personas)
 * - Conference Calls (user + agent + external person via SIP)
 *
 * DOMAIN: group-conversation
 *
 * Example voice commands:
 * - "Start a roundtable with Peter and Maya about my career"
 * - "Call my friend Sarah and let's all chat together"
 * - "End this group conversation"
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// START TEAM ROUNDTABLE
// ============================================================================

const startRoundtableDef: ToolDefinition = {
  id: 'startRoundtable',
  name: 'Start Team Roundtable',
  description: 'Start a conversation with multiple AI personas for a focused discussion',
  domain: 'group-conversation',
  tags: ['roundtable', 'team', 'multi-agent', 'collaboration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Start a team roundtable discussion with multiple Ferni team members. 
Use this when the user wants to:
- Discuss something with multiple perspectives
- Get advice from different team members together
- Have a group brainstorming session
- Talk through a decision with multiple viewpoints

Available personas: Peter (research/finance), Maya (habits/productivity), 
Alex (communication/organization), Jordan (milestones/planning), Nayan (wisdom/philosophy)`,

      parameters: z.object({
        personas: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe(
            'Array of persona IDs to invite. Options: peter-john, maya-santos, alex-chen, jordan-taylor, nayan-patel'
          ),
        topic: z.string().optional().describe('The topic or question to discuss'),
        collaborationMode: z
          .enum(['discussion', 'debate', 'brainstorm', 'interview'])
          .optional()
          .default('discussion')
          .describe('How the personas should interact'),
      }),

      execute: async (params) => {
        try {
          log.info({ agentId: ctx.agentId, personas: params.personas }, 'Starting team roundtable');

          // Validate personas
          const validPersonas = [
            'peter-john',
            'maya-santos',
            'alex-chen',
            'jordan-taylor',
            'nayan-patel',
          ];
          const invalidPersonas = params.personas.filter((p) => !validPersonas.includes(p));

          if (invalidPersonas.length > 0) {
            return `I don't recognize these team members: ${invalidPersonas.join(', ')}. Available team members are: Peter, Maya, Alex, Jordan, and Nayan.`;
          }

          // Send message to voice agent to start roundtable
          // This will be handled by the GroupVoiceIntegration in voice-agent-entry.ts
          const result = {
            action: 'START_ROUNDTABLE',
            personas: params.personas,
            topic: params.topic,
            collaborationMode: params.collaborationMode || 'discussion',
          };

          // Format response for voice
          const personaNames = params.personas
            .map((p) => {
              const nameMap: Record<string, string> = {
                'peter-john': 'Peter',
                'maya-santos': 'Maya',
                'alex-chen': 'Alex',
                'jordan-taylor': 'Jordan',
                'nayan-patel': 'Nayan',
              };
              return nameMap[p] || p;
            })
            .join(' and ');

          const topicIntro = params.topic ? ` to discuss ${params.topic}` : '';
          const modeIntro =
            params.collaborationMode === 'debate'
              ? "We'll share different perspectives"
              : params.collaborationMode === 'brainstorm'
                ? "We'll brainstorm ideas together"
                : params.collaborationMode === 'interview'
                  ? "We'll take turns asking questions"
                  : "We'll discuss together";

          return JSON.stringify({
            ...result,
            voiceResponse: `Perfect! Let me bring ${personaNames} into our conversation${topicIntro}. ${modeIntro}. Just a moment...`,
          });
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to start roundtable');
          return "I had trouble starting the team roundtable. Let's try again - which team members would you like to invite?";
        }
      },
    });
  },
};

// ============================================================================
// INVITE EXTERNAL PARTICIPANT (SIP CALL)
// ============================================================================

const inviteParticipantDef: ToolDefinition = {
  id: 'inviteParticipant',
  name: 'Invite External Participant',
  description: 'Call someone on their phone and add them to our conversation',
  domain: 'group-conversation',
  tags: ['conference', 'call', 'sip', 'phone', 'external'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Call someone on their phone and add them to the current conversation.
Use this when the user wants to:
- Include a friend or family member in the discussion
- Have a three-way conversation with someone
- Get someone's input on a topic in real-time

The person will receive a phone call and be connected to our conversation.`,

      parameters: z.object({
        phoneNumber: z
          .string()
          .describe("The person's phone number (e.g., +15551234567 or 555-123-4567)"),
        name: z.string().describe('The name of the person being called'),
        relationship: z
          .string()
          .optional()
          .describe('How the user knows this person (friend, family, colleague)'),
        introduction: z
          .string()
          .optional()
          .describe('Brief context about why they are being called'),
      }),

      execute: async (params) => {
        try {
          log.info(
            { agentId: ctx.agentId, name: params.name, relationship: params.relationship },
            'Inviting external participant'
          );

          // Validate phone number format (basic validation)
          const cleanPhone = params.phoneNumber.replace(/[\s\-\(\)\.]/g, '');
          if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
            return "That phone number doesn't look right. Could you give me the number again? For example: 555-123-4567 or +1 555 123 4567";
          }

          // Send message to voice agent to initiate call
          const result = {
            action: 'INVITE_PARTICIPANT',
            phoneNumber: cleanPhone.startsWith('+') ? cleanPhone : `+1${cleanPhone}`,
            name: params.name,
            relationship: params.relationship,
            introduction: params.introduction,
          };

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const intro = params.introduction || `${ctx.userId} wants to talk`;

          return JSON.stringify({
            ...result,
            voiceResponse: `Got it! I'm calling ${params.name} now. When they answer, I'll let them know you wanted to chat${params.relationship ? ` - I'll mention you're ${params.relationship === 'friend' ? 'friends' : params.relationship}` : ''}. One moment...`,
          });
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to invite participant');
          return "I couldn't place that call. Would you like me to try again?";
        }
      },
    });
  },
};

// ============================================================================
// END GROUP CONVERSATION
// ============================================================================

const endGroupConversationDef: ToolDefinition = {
  id: 'endGroupConversation',
  name: 'End Group Conversation',
  description: 'End the current group conversation and return to one-on-one mode',
  domain: 'group-conversation',
  tags: ['end', 'close', 'finish', 'roundtable', 'conference'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `End the current group conversation, whether it's a team roundtable or a conference call with an external person.
Use this when the user wants to:
- End the group discussion
- Return to just talking with Ferni
- Say goodbye to other participants
- Wrap up the roundtable`,

      parameters: z.object({
        reason: z.string().optional().describe('Why the conversation is ending'),
        summarize: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to provide a summary of the discussion'),
      }),

      execute: async (params) => {
        try {
          log.info({ agentId: ctx.agentId }, 'Ending group conversation');

          const result = {
            action: 'END_GROUP_CONVERSATION',
            summarize: params.summarize ?? true,
            reason: params.reason,
          };

          return JSON.stringify({
            ...result,
            voiceResponse: params.summarize
              ? "Alright, let me wrap up this conversation. I'll give everyone a quick goodbye and then it'll be just us again."
              : "No problem, ending the group conversation now. It's just you and me again.",
          });
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to end group conversation');
          return 'I had trouble ending the group conversation. Let me try again...';
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'group-conversation',
  [startRoundtableDef, inviteParticipantDef, endGroupConversationDef]
);

export default getToolDefinitions;
