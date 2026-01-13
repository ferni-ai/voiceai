/**
 * Relationship Building - Deepening User Connections
 *
 * Questions and behaviors that help personas build genuine relationships
 * with users over time. This makes conversations feel like continuing
 * relationships, not isolated transactions.
 */
import type { RelationshipStage, UserProfile } from '../../types/user-profile.js';
/**
 * Different behaviors based on relationship depth
 */
export declare const STAGE_BEHAVIORS: {
    new_acquaintance: {
        greeting: string[];
        closingCheck: string[];
        personalQuestions: string[];
        sharingLevel: string;
    };
    getting_to_know: {
        greeting: string[];
        closingCheck: string[];
        personalQuestions: string[];
        sharingLevel: string;
    };
    trusted_advisor: {
        greeting: string[];
        closingCheck: string[];
        personalQuestions: string[];
        sharingLevel: string;
    };
    old_friend: {
        greeting: string[];
        closingCheck: string[];
        personalQuestions: string[];
        sharingLevel: string;
    };
};
export declare const CALLBACK_TEMPLATES: {
    followUp: string[];
    goalReference: string[];
    familyReference: string[];
    emotionalFollowUp: string[];
};
/**
 * Generate a conversation callback based on user profile
 */
export declare function generateCallback(profile: UserProfile): string | null;
export declare const DEEPENING_QUESTIONS: {
    light: string[];
    medium: string[];
    deep: string[];
    values: string[];
};
/**
 * Get an appropriate deepening question based on relationship stage
 */
export declare function getDeepeningQuestion(stage: RelationshipStage): string;
export declare const ACKNOWLEDGMENTS: {
    personalSharing: string[];
    emotionalValidation: string[];
    progressAcknowledgment: string[];
    struggleSupport: string[];
};
/**
 * Get an appropriate acknowledgment
 */
export declare function getAcknowledgment(type: 'personal' | 'emotional' | 'progress' | 'struggle'): string;
/**
 * Get natural name usage based on context
 */
export declare function getNameUsage(name: string, context: 'greeting' | 'emphasis' | 'comfort' | 'celebration'): string;
/**
 * Get stage-appropriate greeting
 */
export declare function getStageGreeting(stage: RelationshipStage): string;
/**
 * Get stage-appropriate closing check
 */
export declare function getStageClosing(stage: RelationshipStage): string;
/**
 * Get stage-appropriate personal question
 */
export declare function getStagePersonalQuestion(stage: RelationshipStage): string;
/**
 * Should we share a personal story at this stage?
 */
export declare function shouldSharePersonalStory(stage: RelationshipStage, storyWeight: 'light' | 'medium' | 'heavy'): boolean;
//# sourceMappingURL=relationship-building.d.ts.map