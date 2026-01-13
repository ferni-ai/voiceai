/**
 * Natural Voice Authentication
 *
 * The most HUMAN way to remember users - combining multiple signals
 * for a seamless, natural experience:
 *
 * 1. Voice Signature (Primary) - Silent, automatic, like recognizing a friend's voice
 * 2. Device Recognition - Same phone/computer
 * 3. Phone Number - Caller ID from calls
 * 4. Conversational Context - "We talked about your trip to Hawaii"
 * 5. Gentle Confirmation - "Is this Sarah?" (only when uncertain)
 *
 * Philosophy: Recognition should feel like running into a friend,
 * not like logging into a bank.
 */
import type { VoiceSketch } from '../../types/user-profile.js';
/**
 * How confident are we about who this is?
 */
export type ConfidenceLevel = 'certain' | 'likely' | 'possible' | 'unknown';
/**
 * What should the agent do?
 */
export type AuthAction = 'greet_warmly' | 'greet_casually' | 'confirm_gently' | 'ask_naturally' | 'verify_security' | 'enroll_voice';
/**
 * Complete auth context for the agent
 */
export interface AuthContext {
    userId: string;
    userName?: string;
    confidence: ConfidenceLevel;
    action: AuthAction;
    greeting?: string;
    isNewUser: boolean;
    isReturningUser: boolean;
    lastConversation?: Date;
    conversationCount: number;
    rememberedTopics?: string[];
    lastMilestone?: string;
    relationshipStage: 'stranger' | 'acquaintance' | 'familiar' | 'friend';
    voiceConfidence: number;
    voiceEnrolled: boolean;
    shouldEnrollVoice: boolean;
    requiresVerification: boolean;
    verificationQuestion?: string;
}
/**
 * Natural authentication - identify user from all available signals
 */
export declare function authenticateNaturally(params: {
    metadata: Record<string, unknown>;
    voiceSketch?: VoiceSketch | null;
    requireVerification?: boolean;
}): Promise<AuthContext>;
/**
 * Verify user identity conversationally
 * Use for sensitive operations (financial, health data)
 */
export declare function verifyIdentity(userId: string, userResponse: string): Promise<{
    verified: boolean;
    confidence: number;
    reason: string;
}>;
/**
 * Enroll user's voice signature
 * Called after confirming identity
 */
export declare function enrollVoice(userId: string, voiceSketch: VoiceSketch): Promise<void>;
/**
 * Update voice signature during conversation
 * Called periodically to improve recognition
 */
export declare function updateVoiceSignature(userId: string, voiceSketch: VoiceSketch): Promise<void>;
/**
 * Link a new identifier to an existing user
 * (e.g., user calls from new phone, logs in on new device)
 */
export declare function linkIdentifier(userId: string, identifier: {
    type: 'phone' | 'device' | 'email';
    value: string;
}): Promise<void>;
/**
 * Generate natural greeting based on time and relationship
 */
export declare function getNaturalGreeting(authContext: AuthContext): string;
/**
 * Generate context message for the LLM
 */
export declare function generateContextForLLM(authContext: AuthContext): string;
declare const _default: {
    authenticateNaturally: typeof authenticateNaturally;
    verifyIdentity: typeof verifyIdentity;
    enrollVoice: typeof enrollVoice;
    updateVoiceSignature: typeof updateVoiceSignature;
    linkIdentifier: typeof linkIdentifier;
    getNaturalGreeting: typeof getNaturalGreeting;
    generateContextForLLM: typeof generateContextForLLM;
};
export default _default;
//# sourceMappingURL=natural-auth.d.ts.map