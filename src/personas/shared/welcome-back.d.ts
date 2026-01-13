/**
 * Welcome Back - Time-Based Greetings
 *
 * Different greetings based on how long since last conversation
 * and what we remember about the user. Makes returning users
 * feel recognized and valued.
 */
import type { UserProfile } from '../../types/user-profile.js';
export declare const WELCOME_BACK_BY_TIME: {
    sameDay: {
        generic: string[];
        withName: string[];
    };
    nextDay: {
        generic: string[];
        withName: string[];
    };
    fewDays: {
        generic: string[];
        withName: string[];
    };
    aboutAWeek: {
        generic: string[];
        withName: string[];
    };
    coupleWeeks: {
        generic: string[];
        withName: string[];
    };
    aboutAMonth: {
        generic: string[];
        withName: string[];
    };
    longTime: {
        generic: string[];
        withName: string[];
    };
};
export declare const WELCOME_BACK_WITH_CONTEXT: {
    lastConversation: string[];
    goalReference: string[];
    emotionalCheck: string[];
    followUp: string[];
};
export declare const RETURNING_USER_RECOGNITION: {
    secondConversation: string[];
    regularUser: string[];
    milestones: {
        5: string;
        10: string;
        25: string;
        50: string;
    };
};
/**
 * Generate a welcome back message based on user profile
 */
export declare function generateWelcomeBack(profile: UserProfile): string;
/**
 * Generate a simple time-based greeting (without profile)
 */
export declare function getTimeBasedGreeting(daysSinceContact: number, name?: string): string;
/**
 * Check if this is a milestone conversation
 */
export declare function isMilestoneConversation(conversationCount: number): boolean;
/**
 * Get milestone message if applicable
 */
export declare function getMilestoneMessage(conversationCount: number): string | null;
//# sourceMappingURL=welcome-back.d.ts.map