/**
 * Semantic Message System
 *
 * A "Better Than Human" approach to message generation that combines:
 * - Semantic intent classification (understanding what they MEAN)
 * - Rich component library (human-feeling phrases)
 * - Relationship memory (how YOU talk to THIS person)
 * - Contextual awareness (time, season, recent events)
 * - User style learning (your unique voice)
 *
 * Philosophy: Every message should sound like it came from the actual person,
 * not from an AI. We learn how you communicate with each relationship and
 * mirror that warmth.
 *
 * @module services/outreach/semantic-message-system
 */
import type { RelationshipStage } from './persona-voice-generator.js';
/**
 * Semantic intent - what the user actually wants to communicate
 */
export type MessageIntent = 'morning_greeting' | 'evening_greeting' | 'general_greeting' | 'express_love' | 'express_missing' | 'thinking_of_you' | 'check_in' | 'birthday_wish' | 'congratulations' | 'sympathy' | 'encouragement' | 'gratitude' | 'apology' | 'good_news' | 'just_because' | 'custom';
/**
 * Time context for messages
 */
export interface TimeContext {
    timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
    dayOfWeek: string;
    isWeekend: boolean;
    season: 'spring' | 'summer' | 'fall' | 'winter';
    isHolidaySeason: boolean;
    specialDay?: string;
}
/**
 * Relationship context - who is this person to the user?
 */
export interface RelationshipContext {
    contactName: string;
    relationship: string;
    stage: RelationshipStage;
    nickname?: string;
    preferredGreeting?: string;
    preferredClosing?: string;
    typicalTone?: 'casual' | 'warm' | 'playful' | 'formal';
    usesTermsOfEndearment?: boolean;
    typicalMessageLength?: 'brief' | 'medium' | 'long';
}
/**
 * User's communication style with this person
 * (learned over time)
 */
export interface CommunicationStyle {
    userId: string;
    contactId?: string;
    greetingPatterns: string[];
    closingPatterns: string[];
    fillerWords: string[];
    expressionStyle: 'direct' | 'storytelling' | 'emotional' | 'casual';
    usesEmoji: boolean;
    endearments: string[];
    petNames: string[];
    typicalCallTimes: string[];
    preferredDuration: 'quick' | 'medium' | 'long';
}
/**
 * Memory context - what do we know about recent life?
 */
export interface MemoryContext {
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: string[];
    lastContactDate?: Date;
    lastConversationSummary?: string;
    unfinishedThreads?: string[];
    promisesMade?: string[];
    promisesReceived?: string[];
}
/**
 * Full context for message generation
 */
export interface SemanticMessageContext {
    originalRequest: string;
    intent: MessageIntent;
    sender: {
        userId: string;
        userName: string;
        preferredName?: string;
    };
    recipient: RelationshipContext;
    time: TimeContext;
    memory?: MemoryContext;
    communicationStyle?: CommunicationStyle;
    isVoicemail: boolean;
    targetLength?: 'brief' | 'medium' | 'long';
}
/**
 * Generated message with components
 */
export interface SemanticMessage {
    message: string;
    ssmlMessage: string;
    components: {
        opening: string;
        transition?: string;
        mainMessage: string;
        personalTouch?: string;
        close: string;
    };
    metadata: {
        intent: MessageIntent;
        relationshipStage: RelationshipStage;
        generationType: 'semantic' | 'llm' | 'hybrid';
        componentsUsed: string[];
    };
}
/**
 * Classify the intent of a message request
 */
export declare function classifyIntent(request: string): MessageIntent;
/**
 * Get current time context for message personalization
 */
export declare function getTimeContext(): TimeContext;
/**
 * Generate a semantically-aware message
 *
 * This is the main entry point that assembles all components
 * into a natural, human-feeling message.
 */
export declare function generateSemanticMessage(context: SemanticMessageContext): SemanticMessage;
/**
 * Infer relationship stage from relationship type
 */
export declare function inferRelationshipStage(relationship: string): RelationshipStage;
/**
 * Quick message generation from minimal input
 *
 * This is a convenience function for common use cases.
 */
export declare function quickGenerate(request: string, contactName: string, relationship: string, senderName: string, isVoicemail?: boolean): SemanticMessage;
declare const _default: {
    classifyIntent: typeof classifyIntent;
    generateSemanticMessage: typeof generateSemanticMessage;
    quickGenerate: typeof quickGenerate;
    getTimeContext: typeof getTimeContext;
    inferRelationshipStage: typeof inferRelationshipStage;
};
export default _default;
//# sourceMappingURL=semantic-message-system.d.ts.map