/**
 * Preference Learning
 *
 * Infers and tracks user communication preferences.
 *
 * @module intelligence/human-behaviors/preference-learning
 */
import type { UserProfile } from '../../types/user-profile.js';
export interface UserPreferences {
    communicationStyle: 'direct' | 'gentle' | 'unknown';
    responseLength: 'brief' | 'thorough' | 'unknown';
    storyAppetite: 'loves_stories' | 'prefers_facts' | 'unknown';
    humorReceptivity: 'high' | 'medium' | 'low' | 'unknown';
    adviceStyle: 'prescriptive' | 'collaborative' | 'unknown';
}
/**
 * Infer user preferences from conversation patterns
 */
export declare function inferUserPreferences(userMessages: string[], profile: UserProfile | null): UserPreferences;
/**
 * Get guidance based on preferences
 */
export declare function getPreferenceGuidance(preferences: UserPreferences): string;
declare const _default: {
    inferUserPreferences: typeof inferUserPreferences;
    getPreferenceGuidance: typeof getPreferenceGuidance;
};
export default _default;
//# sourceMappingURL=preference-learning.d.ts.map