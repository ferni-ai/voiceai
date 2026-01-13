/**
 * Profile Personalizer - GAP 2.1: User Profile Underutilized
 *
 * Enhances prompts with user-specific context from their profile.
 * Makes Jack remember and personalize every interaction.
 */
import type { UserProfile } from '../types/user-profile.js';
export interface PersonalizationContext {
    hasGoals: boolean;
    hasAnxietyTriggers: boolean;
    hasPreferences: boolean;
    hasFinancialContext: boolean;
    hasLifeStage: boolean;
}
export declare class ProfilePersonalizer {
    /**
     * Enhance a base prompt with personalization from user profile
     */
    enhancePromptWithPersonalization(basePrompt: string, profile: UserProfile): string;
    /**
     * Get life stage specific guidance
     */
    private getLifeStageGuidance;
    /**
     * Tailor generic advice to user's specific financial situation
     */
    tailorAdviceToFinancialSituation(genericAdvice: string, profile: UserProfile): string;
    /**
     * Apply preference filters to response
     */
    applyPreferenceFilters(response: string, profile: UserProfile): string;
    /**
     * Get personalization context summary (for debugging/logging)
     */
    getPersonalizationContext(profile: UserProfile): PersonalizationContext;
    /**
     * Check if profile has enough data for personalization
     */
    hasMinimalPersonalizationData(profile: UserProfile): boolean;
    /**
     * Build a greeting personalized to the user
     */
    buildPersonalizedGreeting(profile: UserProfile, isReturning: boolean): string;
}
/**
 * Get the singleton personalizer
 */
export declare function getPersonalizer(): ProfilePersonalizer;
/**
 * Reset for testing
 */
export declare function resetPersonalizer(): void;
export default ProfilePersonalizer;
//# sourceMappingURL=profile-personalizer.d.ts.map