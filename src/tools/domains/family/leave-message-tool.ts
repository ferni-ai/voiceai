/**
 * Leave Message Tool
 *
 * Enables family phone callers to leave voice messages for their sponsor
 * that Ferni will deliver during the sponsor's next conversation.
 *
 * Example conversation:
 * - Mom: "Tell Seth I'm thinking of him"
 * - Ferni: "I'll make sure Seth knows you're thinking of him."
 *
 * Later:
 * - Seth talks to Ferni
 * - Ferni: "Your mom left you a message earlier. She said: 'I'm thinking of you.'"
 *
 * @module tools/domains/family/leave-message-tool
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';

const log = getLogger().child({ module: 'leave-message-tool' });

// ============================================================================
// TOOL RESULTS
// ============================================================================

interface LeaveMessageResult {
  success: boolean;
  message: string;
  messageId?: string;
}

// ============================================================================
// TOOL CREATORS
// ============================================================================

/**
 * Create the leave message tool for family callers.
 */
function createLeaveMessageTool(ctx: ToolContext): Tool {
  return {
    description: `Leave a message for the sponsor (the family member who set up this account).
Use this when a family caller wants to send a message to their sponsor. For example:
- "Tell Seth I'm thinking of him"
- "Let Seth know I called"
- "Pass along that Sunday dinner is at 5"

Parameters:
- messageContent (string): The message to leave
- recipientName (string, optional): Who the message is for (default: the sponsor)
- emotionalContext (string, optional): Brief note about the caller's emotional state (e.g., "sounded happy", "seemed worried")`,
    parameters: {
      type: 'object',
      properties: {
        messageContent: {
          type: 'string',
          description: 'The message content to leave for the sponsor',
        },
        recipientName: {
          type: 'string',
          description: 'Who the message is for (usually the sponsor)',
        },
        emotionalContext: {
          type: 'string',
          description: "Brief note about the caller's emotional state",
        },
      },
      required: ['messageContent'],
    },
    execute: async (args: {
      messageContent: string;
      recipientName?: string;
      emotionalContext?: string;
    }): Promise<LeaveMessageResult> => {
      const { messageContent, emotionalContext } = args;

      // Get caller context from the session
      const sessionId = ctx.sessionId;
      if (!sessionId) {
        return {
          success: false,
          message: "I'm having trouble identifying this call. Could you try again?",
        };
      }

      try {
        // Get inbound call context to identify the caller
        const { getInboundCallContext } = await import(
          '../../../intelligence/context-builders/external/inbound-call-context.js'
        );
        const callContext = getInboundCallContext(sessionId);

        if (!callContext?.sponsoredIdentityId || !callContext?.sponsorUserId) {
          return {
            success: false,
            message:
              "I can only pass along messages from family members I know. Once you're set up, you'll be able to leave messages.",
          };
        }

        // Get the sponsored identity for caller info
        const { getSponsoredIdentity } = await import(
          '../../../services/identity/sponsored-identity.js'
        );
        const identity = await getSponsoredIdentity(callContext.sponsoredIdentityId);

        if (!identity) {
          return {
            success: false,
            message: "I'm having trouble finding your profile. Let me make a note to fix this.",
          };
        }

        // Create the message
        const { createFamilyMessage } = await import('../../../services/family/family-messages.js');

        const message = await createFamilyMessage({
          fromIdentityId: callContext.sponsoredIdentityId,
          fromName: identity.displayName,
          fromRelationship: identity.relationship,
          toUserId: callContext.sponsorUserId,
          messageType: 'text', // Transcribed from voice
          content: messageContent,
          sourceSessionId: sessionId,
          emotionalContext,
        });

        log.info(
          {
            messageId: message.id,
            fromName: identity.displayName,
            toUserId: callContext.sponsorUserId,
            contentLength: messageContent.length,
          },
          '✉️ Family message created'
        );

        // Get the sponsor's name for the confirmation
        const sponsorName = args.recipientName || 'them';

        return {
          success: true,
          message: `I'll make sure ${sponsorName} gets your message. They'll hear it next time we talk.`,
          messageId: message.id,
        };
      } catch (error) {
        log.error({ error, sessionId }, 'Failed to create family message');
        return {
          success: false,
          message:
            "I'm having trouble saving your message right now. Would you like to try again?",
        };
      }
    },
  };
}

/**
 * Create the check messages tool for sponsors.
 * This allows sponsors to ask if they have any messages.
 */
function createCheckMessagesForMeTool(ctx: ToolContext): Tool {
  return {
    description: `Check for pending messages from family members.
Use this when the user asks about messages or if family has tried to reach them.
For example:
- "Do I have any messages?"
- "Did anyone call for me?"
- "Any messages from mom?"`,
    parameters: {
      type: 'object',
      properties: {
        fromName: {
          type: 'string',
          description: 'Optional filter - only show messages from this person',
        },
      },
      required: [],
    },
    execute: async (args: { fromName?: string }): Promise<unknown> => {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          hasMessages: false,
          message: "I'm not sure who I'm talking to. Could you help me identify you?",
        };
      }

      try {
        const { getPendingMessages, formatMessagesForDelivery, markMessagesDelivered } =
          await import('../../../services/family/family-messages.js');

        let messages = await getPendingMessages(userId);

        // Filter by name if specified
        if (args.fromName && messages.length > 0) {
          const nameLower = args.fromName.toLowerCase();
          messages = messages.filter(
            (m) =>
              m.fromName.toLowerCase().includes(nameLower) ||
              m.fromRelationship.toLowerCase().includes(nameLower)
          );
        }

        if (messages.length === 0) {
          return {
            success: true,
            hasMessages: false,
            message: args.fromName
              ? `No messages from ${args.fromName} right now.`
              : "No messages waiting for you right now.",
          };
        }

        // Format messages for delivery
        const formattedMessages = formatMessagesForDelivery(messages);

        // Mark messages as delivered
        await markMessagesDelivered(messages.map((m) => m.id));

        log.info(
          {
            userId,
            messageCount: messages.length,
            fromNames: messages.map((m) => m.fromName),
          },
          '📬 Delivered family messages'
        );

        return {
          success: true,
          hasMessages: true,
          messageCount: messages.length,
          message: formattedMessages,
        };
      } catch (error) {
        log.error({ error, userId }, 'Failed to check messages');
        return {
          success: false,
          hasMessages: false,
          message: "I'm having trouble checking your messages right now.",
        };
      }
    },
  };
}

/**
 * Create the coordinated reminder tool for family callers.
 * Allows family members to create reminders for the sponsor that are attributed to them.
 */
function createCoordinatedReminderTool(ctx: ToolContext): Tool {
  return {
    description: `Create a reminder for the sponsor that is attributed to you (the family caller).
Use this when a family caller wants to set a reminder for their sponsor. For example:
- "Remind Seth about Sunday dinner at 5"
- "Make sure Seth calls me back tonight"
- "Remind him to pick up the prescription"

Ferni will deliver the reminder and say "Your mom wanted me to remind you..."

Parameters:
- reminderMessage (string): What to remind them about
- reminderTime (string): When to deliver the reminder (e.g., "tomorrow at 9am", "Sunday at 5pm", "in 2 hours")
- recipientName (string, optional): Who to remind (default: the sponsor)`,
    parameters: {
      type: 'object',
      properties: {
        reminderMessage: {
          type: 'string',
          description: 'The reminder message content',
        },
        reminderTime: {
          type: 'string',
          description: 'When to deliver the reminder (natural language)',
        },
        recipientName: {
          type: 'string',
          description: 'Who to remind (usually the sponsor)',
        },
      },
      required: ['reminderMessage', 'reminderTime'],
    },
    execute: async (args: {
      reminderMessage: string;
      reminderTime: string;
      recipientName?: string;
    }): Promise<unknown> => {
      const { reminderMessage, reminderTime } = args;

      // Get caller context from the session
      const sessionId = ctx.sessionId;
      if (!sessionId) {
        return {
          success: false,
          message: "I'm having trouble identifying this call. Could you try again?",
        };
      }

      try {
        // Get inbound call context to identify the caller
        const { getInboundCallContext } = await import(
          '../../../intelligence/context-builders/external/inbound-call-context.js'
        );
        const callContext = getInboundCallContext(sessionId);

        if (!callContext?.sponsoredIdentityId || !callContext?.sponsorUserId) {
          return {
            success: false,
            message:
              "I can only set reminders from family members I know. Once you're set up, you'll be able to create reminders.",
          };
        }

        // Get the sponsored identity for caller info
        const { getSponsoredIdentity } = await import(
          '../../../services/identity/sponsored-identity.js'
        );
        const identity = await getSponsoredIdentity(callContext.sponsoredIdentityId);

        if (!identity) {
          return {
            success: false,
            message: "I'm having trouble finding your profile. Let me make a note to fix this.",
          };
        }

        // Parse the reminder time
        const { parseNaturalDateTime } = await import('../../../utils/date-parser.js');
        const parsedTime = parseNaturalDateTime(reminderTime);

        if (!parsedTime) {
          return {
            success: false,
            message: `I couldn't understand when to set the reminder. Could you say something like "tomorrow at 5pm" or "Sunday morning"?`,
          };
        }

        // Create the coordinated reminder
        const { createReminder } = await import('../../../services/scheduling/reminder-scheduler.js');

        // Get sponsor's timezone from their profile (fallback to UTC for international support)
        const { getUserContactInfo } = await import('../../../services/outreach/user-contact.js');
        const sponsorContact = await getUserContactInfo(callContext.sponsorUserId);
        const sponsorTimezone = sponsorContact?.timezone || 'Etc/UTC';

        const reminder = await createReminder({
          userId: callContext.sponsorUserId,
          message: reminderMessage,
          context: `Reminder from ${identity.displayName} (${identity.relationship})`,
          scheduledFor: parsedTime,
          timezone: sponsorTimezone,
          deliveryMethod: 'voice_message', // Ferni will deliver it verbally
          deliveryAddress: '', // Not needed for voice delivery
          createdBy: 'ferni',
          sourceIdentityId: callContext.sponsoredIdentityId,
          sourceIdentityName: identity.displayName,
          sourceRelationship: identity.relationship,
        });

        log.info(
          {
            reminderId: reminder.id,
            fromName: identity.displayName,
            toUserId: callContext.sponsorUserId,
            scheduledFor: parsedTime,
          },
          '⏰ Created coordinated reminder'
        );

        const sponsorName = args.recipientName || 'them';
        const formattedTime = formatReminderTime(parsedTime);

        return {
          success: true,
          message: `Got it! I'll remind ${sponsorName} ${formattedTime}. They'll know it's from you.`,
          reminderId: reminder.id,
        };
      } catch (error) {
        log.error({ error, sessionId }, 'Failed to create coordinated reminder');
        return {
          success: false,
          message: "I'm having trouble setting that reminder right now. Would you like to try again?",
        };
      }
    },
  };
}

/**
 * Format a reminder time for confirmation message.
 */
function formatReminderTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    return 'in about an hour';
  } else if (diffHours < 24) {
    return `in about ${diffHours} hours`;
  } else if (diffDays === 1) {
    return `tomorrow around ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `on ${dayName} at ${time}`;
  } else {
    return `on ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const leaveMessageToolDef: ToolDefinition = {
  id: 'leaveMessageForSponsor',
  name: 'Leave Message for Sponsor',
  description: `Leave a message for the sponsor that Ferni will deliver.
Used by family phone callers to send messages like "Tell Seth I love him".`,
  domain: 'family',
  tags: ['family', 'messages', 'phone', 'communication'],
  create: createLeaveMessageTool,
};

export const checkMessagesToolDef: ToolDefinition = {
  id: 'checkFamilyMessages',
  name: 'Check Family Messages',
  description: `Check for pending messages from family members.
Used when sponsor asks about messages from family.`,
  domain: 'family',
  tags: ['family', 'messages', 'phone', 'communication'],
  create: createCheckMessagesForMeTool,
};

export const coordinatedReminderToolDef: ToolDefinition = {
  id: 'createCoordinatedReminder',
  name: 'Create Coordinated Reminder',
  description: `Create a reminder for the sponsor that is attributed to the family caller.
Used when family members want to remind the sponsor about something.`,
  domain: 'family',
  tags: ['family', 'reminders', 'phone', 'coordination'],
  create: createCoordinatedReminderTool,
};

// ============================================================================
// EXPORTS
// ============================================================================

export function getToolDefinitions(): ToolDefinition[] {
  return [leaveMessageToolDef, checkMessagesToolDef, coordinatedReminderToolDef];
}
