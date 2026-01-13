/**
 * Topic Management
 *
 * Topic threading verification and proactive goal references.
 *
 * @module intelligence/human-behaviors/topic-management
 */
import type { UserProfile } from '../../types/user-profile.js';
/**
 * Check if topic threading is working
 */
export declare function verifyTopicThreading(conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, topicsToCircleBack: string[]): {
    working: boolean;
    circledBackTopics: string[];
    missedTopics: string[];
    suggestion: string | null;
};
/**
 * Generate proactive goal references
 */
export declare function getProactiveGoalReference(profile: UserProfile | null, currentTopic: string): string | null;
declare const _default: {
    verifyTopicThreading: typeof verifyTopicThreading;
    getProactiveGoalReference: typeof getProactiveGoalReference;
};
export default _default;
//# sourceMappingURL=topic-management.d.ts.map