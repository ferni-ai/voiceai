/**
 * Contact Onboarding Service
 *
 * Makes it seamless for users to share their contact info:
 * 1. Auto-detect phone/email in conversation
 * 2. Prompt for contact info at appropriate moments
 * 3. Confirm and save preferences
 *
 * Integrates with proactive outreach to enable follow-ups.
 */
import { type UserContactInfo } from './outreach/user-contact.js';
export interface ContactDetectionResult {
    phone?: string;
    email?: string;
    timezone?: string;
    preferredMethod?: 'sms' | 'email' | 'call';
    confidence: number;
    extractedFrom: string;
}
export interface OnboardingState {
    userId: string;
    hasContactInfo: boolean;
    hasAskedForContact: boolean;
    contactInfo?: UserContactInfo;
    onboardingComplete: boolean;
    lastPromptTime?: Date;
}
/**
 * Auto-detect phone numbers and emails in user messages
 *
 * IMPORTANT: This function only detects the USER's own contact info.
 * It will return null if the phone number appears to belong to a third party
 * (e.g., "call my mom at 555-123-4567" - that's mom's number, not the user's).
 */
export declare function detectContactInfo(text: string): ContactDetectionResult | null;
/**
 * Get or create onboarding state for user
 */
export declare function getOnboardingState(userId: string): Promise<OnboardingState>;
/**
 * Update onboarding state when contact info is provided
 */
export declare function completeOnboarding(userId: string, contactInfo: Partial<UserContactInfo>): Promise<OnboardingState>;
/**
 * Mark that we've asked for contact info (to avoid repeated prompts)
 */
export declare function markAskedForContact(userId: string): Promise<void>;
/**
 * Determine if we should prompt for contact info
 */
export declare function shouldPromptForContact(userId: string, turnCount: number): Promise<boolean>;
/**
 * Get contextual prompt for asking for contact info
 *
 * Philosophy: Ferni asks like a friend wanting to stay in touch, not like
 * a service requesting permissions. The ask should feel:
 * - Natural, like something a caring friend would say
 * - Connected to what they just shared
 * - Opt-in feeling, no pressure
 * - Warm, not transactional
 */
export declare function getContactPrompt(context: 'commitment' | 'goal' | 'reminder' | 'general' | 'emotional' | 'celebration'): string;
/**
 * Get a warm Ferni-style opener to the phone ask based on conversation flow
 * This makes the ask feel natural, not like a system prompt
 */
export declare function getPhoneAskOpener(relationshipStage: 'new' | 'building' | 'established' | 'deep'): string;
/**
 * Generate confirmation message when contact info is saved
 *
 * Ferni style: Warm, personal, makes them feel good about sharing
 * Not: "Your preferences have been saved to our database"
 * Yes: "I'm really glad we can stay connected"
 */
export declare function getConfirmationMessage(contactInfo: UserContactInfo): string;
/**
 * Process a user message for contact info and onboarding
 * Call this from the voice agent on each user turn
 */
export declare function processMessageForOnboarding(userId: string, message: string, turnCount: number): Promise<{
    detectedContact: ContactDetectionResult | null;
    shouldPrompt: boolean;
    prompt?: string;
    confirmation?: string;
}>;
declare const _default: {
    detectContactInfo: typeof detectContactInfo;
    getOnboardingState: typeof getOnboardingState;
    completeOnboarding: typeof completeOnboarding;
    markAskedForContact: typeof markAskedForContact;
    shouldPromptForContact: typeof shouldPromptForContact;
    getContactPrompt: typeof getContactPrompt;
    getConfirmationMessage: typeof getConfirmationMessage;
    processMessageForOnboarding: typeof processMessageForOnboarding;
};
export default _default;
//# sourceMappingURL=contact-onboarding.d.ts.map