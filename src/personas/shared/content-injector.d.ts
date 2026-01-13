/**
 * Shared Content Injector
 *
 * Provides runtime access to shared persona content for injection into
 * prompts and responses. This makes the team dynamics, relationship building,
 * and life event content actually get used.
 */
import { type LifeEvent } from './life-events.js';
export interface SharedContentContext {
    currentPersona: string;
    userName?: string;
    relationshipStage?: string;
    conversationCount?: number;
    daysSinceLastContact?: number;
    lastConversationSummary?: string;
    lifeEvents?: LifeEvent[];
    previousPersona?: string;
    activeLifeEvents?: Array<{
        type: string;
        title: string;
        status: string;
        date?: Date;
        emotionalSignificance: string;
    }>;
    recentLifeMilestones?: string[];
}
export interface InjectedContent {
    greeting?: string;
    teamContext?: string;
    relationshipContext?: string;
    lifeEventAcknowledgment?: string;
    callbackContent?: string;
    closingContent?: string;
}
/**
 * Generate all applicable shared content for a conversation turn
 */
export declare function injectSharedContent(context: SharedContentContext, options?: {
    isGreeting?: boolean;
    isClosing?: boolean;
    mentionTeammate?: string;
    isHandoff?: boolean;
    lastUserMessage?: string;
}): InjectedContent;
/**
 * Get what a persona should say about a teammate
 */
export declare function getTeammateOpinion(fromPersona: string, aboutPersona: string): string | null;
/**
 * Get a suggestion to bring in a teammate
 */
export declare function suggestTeammate(persona: string): string | null;
/**
 * Generate handoff context for passing to next persona
 */
export declare function createHandoffContext(fromPersona: string, toPersona: string, topicsDiscussed: string[], currentGoal?: string, emotionalState?: string, keyPoints?: string[]): string;
/**
 * Get appropriate acknowledgment for user's situation
 */
export declare function acknowledgeUser(situation: 'personal' | 'emotional' | 'progress' | 'struggle'): string;
/**
 * Get name usage for personalization
 */
export declare function getPersonalizedNameUsage(name: string, context: 'greeting' | 'emphasis' | 'comfort' | 'celebration'): string;
/**
 * Check if a personal story should be shared
 */
export declare function shouldTellStory(stage: string, storyWeight: 'light' | 'medium' | 'heavy'): boolean;
/**
 * Get time-appropriate greeting
 * @param daysSince - Days since last contact (0 = same day)
 * @param name - Optional user name
 */
export declare function getTimeGreeting(daysSince?: number, name?: string): string;
/**
 * Format injected content for prompt
 */
export declare function formatForPrompt(content: InjectedContent): string;
export default injectSharedContent;
//# sourceMappingURL=content-injector.d.ts.map