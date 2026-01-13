/**
 * Family Sharing Tools
 *
 * Tools for sponsors to share context with family members:
 * - Share updates: "Tell my mom I'm doing great"
 * - Request check-ins: "Can you check on my mom tomorrow?"
 *
 * These tools create shareable contexts that Ferni will surface
 * to family members during their next conversation.
 *
 * @module tools/domains/family/family-sharing-tool
 */
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger().child({ module: 'family-sharing-tool' });
// ============================================================================
// SHARE WITH FAMILY TOOL
// ============================================================================
/**
 * Create the share with family tool.
 * Allows sponsors to share updates with their family members.
 */
function createShareWithFamilyTool(ctx) {
    return {
        description: `Share an update or message with a family member that Ferni will deliver.
Use this when the sponsor wants to share something with family. For example:
- "Tell my mom I'm doing great"
- "Let my dad know I got the promotion"
- "Share with mom that I'm feeling better"

This creates a shareable context that Ferni will naturally mention to the family member
during their next conversation.

Parameters:
- message (string): What to share
- familyMember (string): Who to share with (e.g., "mom", "dad", "parents")`,
        parameters: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'The message or update to share',
                },
                familyMember: {
                    type: 'string',
                    description: 'Who to share with (e.g., "mom", "dad")',
                },
            },
            required: ['message', 'familyMember'],
        },
        execute: async (args) => {
            const { message, familyMember } = args;
            const userId = ctx.userId;
            if (!userId) {
                return {
                    success: false,
                    message: "I'm not sure who I'm talking to. Can you help me identify you?",
                };
            }
            try {
                // Look up the family member's sponsored identity
                const { getSponsoredIdentities } = await import('../../../services/identity/sponsored-identity.js');
                const identities = await getSponsoredIdentities(userId);
                if (identities.length === 0) {
                    return {
                        success: false,
                        message: "I don't have any family members set up yet. Would you like to add someone?",
                    };
                }
                // Try to find the matching family member
                const normalizedSearch = familyMember.toLowerCase();
                const matchingIdentity = identities.find((id) => id.displayName.toLowerCase().includes(normalizedSearch) ||
                    id.relationship.toLowerCase().includes(normalizedSearch) ||
                    (id.preferredName &&
                        id.preferredName.toLowerCase().includes(normalizedSearch)));
                if (!matchingIdentity) {
                    const availableNames = identities
                        .map((id) => id.displayName)
                        .join(', ');
                    return {
                        success: false,
                        message: `I couldn't find ${familyMember}. I have: ${availableNames}. Who would you like me to share this with?`,
                    };
                }
                // Create the shareable context
                const { createExplicitShare } = await import('../../../services/family/family-context-sharing.js');
                const context = await createExplicitShare({
                    fromUserId: userId,
                    fromName: 'You', // Will be replaced with sponsor's name
                    fromRelationship: 'sponsor',
                    toUserId: matchingIdentity.familyUserId,
                    message,
                    sourceSessionId: ctx.sessionId,
                });
                if (!context) {
                    return {
                        success: false,
                        message: "I couldn't share that message - it might contain something too personal to pass along. Want to try rephrasing it?",
                    };
                }
                log.info({
                    userId,
                    familyMember: matchingIdentity.displayName,
                    contextId: context.id,
                }, '💬 Created explicit share context');
                return {
                    success: true,
                    message: `I'll let ${matchingIdentity.displayName} know. They'll hear about it next time we talk.`,
                    contextId: context.id,
                };
            }
            catch (error) {
                log.error({ error, userId }, 'Failed to create share context');
                return {
                    success: false,
                    message: "I'm having trouble right now. Can we try again?",
                };
            }
        },
    };
}
// ============================================================================
// REQUEST CHECK-IN TOOL
// ============================================================================
/**
 * Create the request check-in tool.
 * Allows sponsors to ask Ferni to check on a family member.
 */
function createRequestCheckInTool(ctx) {
    return {
        description: `Ask Ferni to check in on a family member during their next conversation.
Use this when the sponsor wants Ferni to check on someone. For example:
- "Can you check on my mom?"
- "Check in on my dad tomorrow"
- "See how my mom is doing"

Ferni will naturally check in during the family member's next call.

Parameters:
- familyMember (string): Who to check on (e.g., "mom", "dad")
- reason (string, optional): Why you want to check on them`,
        parameters: {
            type: 'object',
            properties: {
                familyMember: {
                    type: 'string',
                    description: 'Who to check on (e.g., "mom", "dad")',
                },
                reason: {
                    type: 'string',
                    description: 'Optional reason for the check-in',
                },
            },
            required: ['familyMember'],
        },
        execute: async (args) => {
            const { familyMember, reason } = args;
            const userId = ctx.userId;
            if (!userId) {
                return {
                    success: false,
                    message: "I'm not sure who I'm talking to. Can you help me identify you?",
                };
            }
            try {
                // Look up the family member's sponsored identity
                const { getSponsoredIdentities } = await import('../../../services/identity/sponsored-identity.js');
                const identities = await getSponsoredIdentities(userId);
                if (identities.length === 0) {
                    return {
                        success: false,
                        message: "I don't have any family members set up yet. Would you like to add someone?",
                    };
                }
                // Try to find the matching family member
                const normalizedSearch = familyMember.toLowerCase();
                const matchingIdentity = identities.find((id) => id.displayName.toLowerCase().includes(normalizedSearch) ||
                    id.relationship.toLowerCase().includes(normalizedSearch) ||
                    (id.preferredName &&
                        id.preferredName.toLowerCase().includes(normalizedSearch)));
                if (!matchingIdentity) {
                    const availableNames = identities
                        .map((id) => id.displayName)
                        .join(', ');
                    return {
                        success: false,
                        message: `I couldn't find ${familyMember}. I have: ${availableNames}. Who would you like me to check on?`,
                    };
                }
                // Create the check-in request context
                const { createCheckInRequest } = await import('../../../services/family/family-context-sharing.js');
                const context = await createCheckInRequest({
                    fromUserId: userId,
                    fromName: 'Your family',
                    fromRelationship: 'sponsor',
                    toUserId: matchingIdentity.familyUserId,
                    reason,
                    sourceSessionId: ctx.sessionId,
                });
                if (!context) {
                    return {
                        success: false,
                        message: "I couldn't set up that check-in. Let me make a note to do it manually.",
                    };
                }
                log.info({
                    userId,
                    familyMember: matchingIdentity.displayName,
                    contextId: context.id,
                    reason,
                }, '🩺 Created check-in request context');
                const responseMessage = reason
                    ? `I'll check in on ${matchingIdentity.displayName} about ${reason} next time they call.`
                    : `I'll check in on ${matchingIdentity.displayName} next time they call.`;
                return {
                    success: true,
                    message: responseMessage,
                    contextId: context.id,
                };
            }
            catch (error) {
                log.error({ error, userId }, 'Failed to create check-in request');
                return {
                    success: false,
                    message: "I'm having trouble right now. Can we try again?",
                };
            }
        },
    };
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export const shareWithFamilyToolDef = {
    id: 'shareWithFamily',
    name: 'Share with Family',
    description: `Share an update with a family member that Ferni will deliver.
Used when sponsor wants to share something with family members.`,
    domain: 'family',
    tags: ['family', 'sharing', 'communication'],
    create: createShareWithFamilyTool,
};
export const requestCheckInToolDef = {
    id: 'requestFamilyCheckIn',
    name: 'Request Family Check-In',
    description: `Ask Ferni to check in on a family member.
Used when sponsor wants Ferni to check on how family is doing.`,
    domain: 'family',
    tags: ['family', 'check-in', 'wellness'],
    create: createRequestCheckInTool,
};
// ============================================================================
// EXPORTS
// ============================================================================
export function getToolDefinitions() {
    return [shareWithFamilyToolDef, requestCheckInToolDef];
}
//# sourceMappingURL=family-sharing-tool.js.map