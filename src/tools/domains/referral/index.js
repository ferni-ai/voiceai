/**
 * Referral Domain Tools
 *
 * Tools for viral growth through voice referrals.
 *
 * DOMAIN: referral
 * TOOLS:
 *   - inviteFriendByCall: Have Ferni call and introduce herself to a friend
 *   - sendSupportCall: Send a supportive intro to someone going through hard times
 */
import { createDomainExport } from '../../registry/loader.js';
import { createVoiceReferralTools } from './voice-referral.js';
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
const inviteFriendByCallDef = {
    id: 'inviteFriendByCall',
    name: 'Invite Friend by Call',
    description: 'Have Ferni personally call a friend to introduce herself. Creates a warm, memorable first impression.',
    domain: 'referral',
    tags: ['referral', 'viral', 'call', 'invite', 'growth'],
    requiredServices: ['twilio'],
    create: (ctx) => {
        const tools = createVoiceReferralTools(ctx.userId || 'unknown', ctx.agentDisplayName || 'friend');
        return tools.inviteFriendByCall;
    },
};
const sendSupportCallDef = {
    id: 'sendSupportCall',
    name: 'Send Support Call',
    description: 'Send a gentle, supportive introduction call to someone going through a difficult time.',
    domain: 'referral',
    tags: ['referral', 'support', 'call', 'caring'],
    requiredServices: ['twilio'],
    create: (ctx) => {
        const tools = createVoiceReferralTools(ctx.userId || 'unknown', ctx.agentDisplayName || 'friend');
        return tools.sendSupportCall;
    },
};
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
const referralTools = [inviteFriendByCallDef, sendSupportCallDef];
export const { getToolDefinitions, domain, definitions } = createDomainExport('referral', referralTools);
export { createVoiceReferralTools, makeVoiceReferralCall } from './voice-referral.js';
export default getToolDefinitions;
//# sourceMappingURL=index.js.map