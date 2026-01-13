/**
 * Community Learning Context Builder
 *
 * Injects insights learned from the entire user community:
 * - Best response strategies for this context
 * - Effective questions that lead to breakthroughs
 * - Story recommendations based on resonance data
 * - Persona adjustments from A/B tests and emergent patterns
 *
 * This makes every conversation smarter because of collective learning.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildCommunityLearningContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Record response effectiveness signal
 * Call this after each agent response to contribute to community learning
 */
export declare function recordResponseSignal(params: {
    personaId: string;
    context: {
        userEmotion: string;
        topic: string;
        relationshipStage: string;
        turnInConversation: number;
    };
    strategy: {
        type: 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'explanation';
        hadPersonalShare: boolean;
        hadQuirk: boolean;
        hadTeamReference: boolean;
        responseLength: 'brief' | 'moderate' | 'lengthy';
    };
    outcome: {
        engagementScore: number;
        userContinued: boolean;
        emotionalShift: 'positive' | 'neutral' | 'negative';
        topicDepthened: boolean;
        askFollowUp: boolean;
    };
}): void;
/**
 * Record story usage and reaction
 */
export declare function recordStoryUsage(params: {
    storyId: string;
    personaId: string;
    topic: string;
    relationshipStage: string;
    userEmotion: string;
    reaction: 'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent';
    engagementScore: number;
}): void;
/**
 * Record a question that led to a breakthrough
 */
export declare function recordBreakthroughQuestion(params: {
    questionPattern: string;
    personaId: string;
    topic: string;
    context: string;
    engagementLift: number;
}): void;
export { buildCommunityLearningContext };
//# sourceMappingURL=community-learning.d.ts.map