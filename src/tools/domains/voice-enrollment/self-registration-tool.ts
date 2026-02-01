/**
 * Self-Registration Tool
 *
 * Enables unknown callers to self-register with Ferni during phone calls.
 * Creates a pending identity that can be approved by an existing sponsor.
 *
 * @module tools/domains/voice-enrollment/self-registration-tool
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';

const log = getLogger().child({ module: 'self-registration-tool' });

// ============================================================================
// TOOL CREATOR
// ============================================================================

/**
 * Create the self-registration tool.
 */
function createSelfRegisterTool(_ctx: ToolContext): Tool {
  return {
    description: `Register an unknown caller so they can be remembered for future calls. Use this when:
- An unknown caller wants to be remembered
- They mention knowing an existing Ferni user (potential sponsor)
- They want to set up their own identity

After registration, they'll be remembered by phone number. If they mention knowing someone, 
that person can approve them to become a full sponsored identity.

Parameters:
- callerPhone (string): The caller's phone number (from caller ID)
- callerName (string): The name they provided
- claimedRelationship (string, optional): e.g., "Seth's mom", "friend of Sarah"
- claimedSponsorName (string, optional): Name of person they claim to know`,
    parameters: {
      type: 'object',
      properties: {
        callerPhone: { type: 'string', description: "The caller's phone number" },
        callerName: { type: 'string', description: 'The name they provided' },
        claimedRelationship: {
          type: 'string',
          description: "e.g., 'Seth\\'s mom', 'friend of Sarah'",
        },
        claimedSponsorName: {
          type: 'string',
          description: 'Name of person they claim to know',
        },
      },
      required: ['callerPhone', 'callerName'],
    },
    execute: async (args: {
      callerPhone: string;
      callerName: string;
      claimedRelationship?: string;
      claimedSponsorName?: string;
    }): Promise<unknown> => {
      const { callerPhone, callerName, claimedRelationship, claimedSponsorName } = args;

      if (!callerPhone || !callerName) {
        return {
          success: false,
          message: "I need your name and phone number to remember you. What's your name?",
        };
      }

      try {
        const { createSelfRegisteredIdentity, lookupByPhone } =
          await import('../../../services/identity/sponsored-identity.js');

        // Check if already registered
        const existing = await lookupByPhone(callerPhone);
        if (existing.found) {
          return {
            success: true,
            message: `I already know you, ${callerName}! Great to hear from you again.`,
            data: { alreadyRegistered: true },
          };
        }

        // Create the self-registered identity
        const identity = await createSelfRegisteredIdentity(
          callerPhone,
          callerName,
          claimedRelationship,
          claimedSponsorName
        );

        log.info(
          {
            identityId: identity.id,
            callerName,
            claimedRelationship,
            claimedSponsorName,
          },
          '📝 Created self-registered identity'
        );

        // Build appropriate response
        let message = `Nice to meet you, ${callerName}! I'll remember you when you call from this number.`;

        if (claimedSponsorName) {
          message += ` I'll let ${claimedSponsorName} know you called - they can add you to my contacts if they'd like.`;
        }

        return {
          success: true,
          message,
          data: {
            identityId: identity.id,
            status: 'pending',
            needsSponsorApproval: true,
          },
        };
      } catch (error) {
        const errorMessage = String(error);
        log.error({ error: errorMessage, callerPhone, callerName }, 'Self-registration failed');

        if (errorMessage.includes('already registered')) {
          return {
            success: true,
            message: `I already have this number in my contacts! Let me look you up...`,
          };
        }

        return {
          success: false,
          message:
            "I had some trouble remembering you this time. Let's try again another time, okay?",
        };
      }
    },
  };
}

/**
 * Tool for agents to check if there are pending identities to notify sponsors about.
 */
function createCheckPendingIdentifiesTool(_ctx: ToolContext): Tool {
  return {
    description: `Check for pending self-registered identities that need sponsor approval.
Use this to see if any callers have claimed to know a specific user.

Parameters:
- sponsorUserId (string, optional): Check for identities claiming to know this user`,
    parameters: {
      type: 'object',
      properties: {
        sponsorUserId: {
          type: 'string',
          description: 'User ID to check for pending connections',
        },
      },
      required: [],
    },
    execute: async (args: { sponsorUserId?: string }): Promise<unknown> => {
      try {
        const { getPendingIdentities } =
          await import('../../../services/identity/sponsored-identity.js');

        const pending = await getPendingIdentities();

        if (pending.length === 0) {
          return {
            success: true,
            message: 'No pending registrations.',
            data: { count: 0, identities: [] },
          };
        }

        // Filter by sponsor if specified (by checking notes)
        let filtered = pending;
        if (args.sponsorUserId) {
          // In practice, we'd need to match the claimed sponsor name to user ID
          // For now, return all pending and let the sponsor's UI filter
        }

        return {
          success: true,
          message: `Found ${filtered.length} pending registration(s).`,
          data: {
            count: filtered.length,
            identities: filtered.map((p) => ({
              id: p.id,
              name: p.displayName,
              phone: `${p.phoneNumber.slice(0, 4)}****`,
              notes: p.notes,
              createdAt: p.createdAt,
            })),
          },
        };
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to check pending identities');
        return {
          success: false,
          message: 'Could not check pending registrations.',
        };
      }
    },
  };
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const selfRegisterDef: ToolDefinition = {
  id: 'selfRegisterCaller',
  name: 'Self-Register Caller',
  description: 'Register an unknown caller so they can be remembered for future calls',
  domain: 'voice-enrollment',
  category: 'core',
  tags: ['registration', 'identity', 'phone', 'onboarding'],
  create: createSelfRegisterTool,
};

const checkPendingDef: ToolDefinition = {
  id: 'checkPendingRegistrations',
  name: 'Check Pending Registrations',
  description: 'Check for pending self-registered identities that need sponsor approval',
  domain: 'voice-enrollment',
  category: 'core',
  tags: ['registration', 'identity', 'admin'],
  create: createCheckPendingIdentifiesTool,
};

// ============================================================================
// EXPORTS
// ============================================================================

export function getToolDefinitions(): ToolDefinition[] {
  return [selfRegisterDef, checkPendingDef];
}

export const definitions = getToolDefinitions();
