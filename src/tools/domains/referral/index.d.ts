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
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { createVoiceReferralTools, makeVoiceReferralCall } from './voice-referral.js';
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map