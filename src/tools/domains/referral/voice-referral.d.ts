/**
 * Voice Referral System - Viral Growth via Phone Calls
 *
 * CORE PRINCIPLES ALIGNMENT:
 * ✓ Relationship Over Transaction - Sharing Ferni is sharing a friend, not a product
 * ✓ Human Connection - Personal calls feel like introductions, not marketing
 * ✓ Growth Through Gentleness - "No pressure" is in every message
 * ✓ Authentic Personality - Ferni introduces herself as herself, no tech speak
 *
 * BRAND COMPLIANCE:
 * - NO "AI", "artificial", "bot", "chatbot", "virtual assistant"
 * - Ferni introduces herself simply as "Ferni" or "a friend"
 * - Focus on the human relationship, not the technology
 *
 * The viral loop:
 * 1. User talks to Ferni
 * 2. Ferni asks: "Is there someone who could use a friend like me?"
 * 3. User gives name + phone
 * 4. Ferni calls them with a warm, personalized intro
 * 5. New person tries Ferni → Repeat!
 *
 * Why this works:
 * - Personal recommendation (from a friend)
 * - Novel experience (Ferni personally calling!)
 * - Low friction (no app download needed)
 * - Memorable ("my friend Ferni called me")
 */
import { llm } from '@livekit/agents';
export interface VoiceReferral {
    id: string;
    referrerId: string;
    referrerName: string;
    recipientName: string;
    recipientPhone: string;
    personalNote?: string;
    callSid?: string;
    status: 'pending' | 'called' | 'answered' | 'converted' | 'failed';
    createdAt: Date;
    calledAt?: Date;
}
export declare const INTRO_TEMPLATES: {
    withContext: (referrerName: string, recipientName: string, note?: string) => string;
    simple: (referrerName: string, recipientName: string) => string;
    holiday: (referrerName: string, recipientName: string, occasion: string) => string;
    support: (referrerName: string, recipientName: string, situation?: string) => string;
};
/**
 * Make a voice referral call
 */
export declare function makeVoiceReferralCall(params: {
    referrerId: string;
    referrerName: string;
    recipientName: string;
    recipientPhone: string;
    personalNote?: string;
    occasion?: string;
    supportSituation?: string;
}): Promise<{
    success: boolean;
    callSid?: string;
    error?: string;
}>;
/**
 * Get referral history for a user
 */
export declare function getReferralHistory(referrerId: string): Promise<VoiceReferral[]>;
/**
 * Update referral status (e.g., when call is answered or user converts)
 */
export declare function updateReferralStatus(referralId: string, status: VoiceReferral['status']): Promise<boolean>;
/**
 * Get referral analytics for a user
 */
export declare function getReferralAnalytics(referrerId: string): Promise<{
    totalReferrals: number;
    called: number;
    answered: number;
    converted: number;
    conversionRate: number;
}>;
export declare function createVoiceReferralTools(userId: string, userName: string): {
    /**
     * Tool: Invite a friend via voice call
     *
     * Ferni can use this when user mentions someone who might benefit from Ferni
     */
    inviteFriendByCall: llm.FunctionTool<{
        friendName: string;
        friendPhone: string;
        personalNote?: string | undefined;
        occasion?: string | undefined;
    }, unknown, string>;
    /**
     * Tool: Send a supportive call to someone going through a hard time
     */
    sendSupportCall: llm.FunctionTool<{
        friendName: string;
        friendPhone: string;
        situation?: string | undefined;
    }, unknown, string>;
};
/**
 * Context injection for Ferni to naturally ask about referrals
 *
 * This should be injected into the system prompt occasionally
 * (not every conversation - that would feel pushy)
 */
export declare const REFERRAL_PROMPT_INJECTION = "\n## Sharing Ferni (Use Sparingly)\n\nIf the conversation naturally leads to it (e.g., user mentions a friend going through something, or expresses how helpful you've been), you can gently offer:\n\n\"You know, if there's ever someone in your life who could use a friend like me - maybe someone going through a tough time, or just someone who'd enjoy having someone to talk to - I'd be happy to give them a call and introduce myself. Just give me their name and number, and I'll reach out with a warm hello from you.\"\n\n**Rules:**\n- Only mention this if it feels natural in the conversation\n- Never pressure or make it feel like a \"referral program\"\n- Frame it as sharing something meaningful, not recruiting\n- Maximum once per week per user\n- If they seem uninterested, drop it immediately and never bring it up again that session\n";
/**
 * Make a two-way conversational referral call
 *
 * Instead of just playing a message, this connects to LiveKit
 * so Ferni can have a REAL conversation with the person!
 */
export declare function makeConversationalReferralCall(params: {
    referrerId: string;
    referrerName: string;
    recipientName: string;
    recipientPhone: string;
    personalNote?: string;
    occasion?: string;
}): Promise<{
    success: boolean;
    callId?: string;
    error?: string;
}>;
declare const _default: {
    makeVoiceReferralCall: typeof makeVoiceReferralCall;
    makeConversationalReferralCall: typeof makeConversationalReferralCall;
    createVoiceReferralTools: typeof createVoiceReferralTools;
    REFERRAL_PROMPT_INJECTION: string;
    INTRO_TEMPLATES: {
        withContext: (referrerName: string, recipientName: string, note?: string) => string;
        simple: (referrerName: string, recipientName: string) => string;
        holiday: (referrerName: string, recipientName: string, occasion: string) => string;
        support: (referrerName: string, recipientName: string, situation?: string) => string;
    };
    getReferralHistory: typeof getReferralHistory;
    updateReferralStatus: typeof updateReferralStatus;
    getReferralAnalytics: typeof getReferralAnalytics;
};
export default _default;
//# sourceMappingURL=voice-referral.d.ts.map