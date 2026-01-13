/**
 * Trust System Hooks
 *
 * Auto-indexing hooks for trust-building data.
 * These are the core "Better than Human" relationship signals.
 *
 * @module services/data-layer/hooks/trust-hooks
 */
import type { CommitmentEntity, BoundaryEntity, InsideJokeEntity, GrowthReflectionEntity, SmallWinEntity } from '../types.js';
/**
 * Track commitments made by or to the user
 */
export declare const onCommitmentChange: import("../hook-generator.js").DomainHook<CommitmentEntity>;
/**
 * Track topics the user doesn't want to discuss
 */
export declare const onBoundaryChange: import("../hook-generator.js").DomainHook<BoundaryEntity>;
/**
 * Track shared humor and connection moments
 */
export declare const onInsideJokeChange: import("../hook-generator.js").DomainHook<InsideJokeEntity>;
/**
 * Track observations about user's growth and evolution
 */
export declare const onGrowthReflectionChange: import("../hook-generator.js").DomainHook<GrowthReflectionEntity>;
/**
 * Track and celebrate user's small wins
 */
export declare const onSmallWinChange: import("../hook-generator.js").DomainHook<SmallWinEntity>;
interface ThinkingOfYouEntity {
    reason: string;
    trigger: string;
    message?: string;
    sent?: boolean;
    date?: string;
}
/**
 * Track "thinking of you" proactive moments
 */
export declare const onThinkingOfYouChange: import("../hook-generator.js").DomainHook<ThinkingOfYouEntity>;
interface ReadingBetweenLinesEntity {
    observation: string;
    whatWasSaid: string;
    whatWasNotSaid: string;
    confidence: 'low' | 'medium' | 'high';
}
/**
 * Track what user is NOT saying
 */
export declare const onReadingBetweenLinesChange: import("../hook-generator.js").DomainHook<ReadingBetweenLinesEntity>;
interface TonalMemoryEntity {
    pattern: string;
    context: string;
    emotionalState?: string;
    frequency?: string;
}
/**
 * Track voice/tonal patterns
 */
export declare const onTonalMemoryChange: import("../hook-generator.js").DomainHook<TonalMemoryEntity>;
interface VulnerabilityMomentEntity {
    topic: string;
    context: string;
    depth: 'surface' | 'moderate' | 'deep';
    response?: string;
    date?: string;
}
/**
 * Track moments when user opened up
 */
export declare const onVulnerabilityMomentChange: import("../hook-generator.js").DomainHook<VulnerabilityMomentEntity>;
interface TrustMilestoneEntity {
    milestone: string;
    significance: string;
    stage: 'initial' | 'growing' | 'established' | 'deep';
    date?: string;
}
/**
 * Track trust milestones in the relationship
 */
export declare const onTrustMilestoneChange: import("../hook-generator.js").DomainHook<TrustMilestoneEntity>;
interface CuriosityMentionEntity {
    entity: string;
    entityType: 'person' | 'place' | 'event' | 'activity' | 'goal';
    originalContext: string;
    priority: 'low' | 'medium' | 'high';
    followUpEligible: boolean;
    mentionedAt: string;
}
/**
 * Track passing mentions for follow-up (Curiosity Memory)
 * "You mentioned Sam a few weeks ago. How are they?"
 */
export declare const onCuriosityMentionChange: import("../hook-generator.js").DomainHook<CuriosityMentionEntity>;
interface BetweenSessionThinkingEntity {
    topic: string;
    reflection: string;
    sessionNumber?: number;
    depth: 'surface' | 'moderate' | 'deep' | 'profound';
    emotionalTone?: string;
    createdAt: string;
}
/**
 * Track between-session thinking moments (Continuous Presence)
 * "I've been thinking about what you said..."
 */
export declare const onBetweenSessionThinkingChange: import("../hook-generator.js").DomainHook<BetweenSessionThinkingEntity>;
interface PersonaGrowthEntity {
    personaId: string;
    growthType: 'perspective' | 'empathy' | 'knowledge' | 'curiosity' | 'values';
    description: string;
    userInfluence: string;
    date: string;
}
/**
 * Track how personas grow and change over time (Mutual Growth)
 * "You've changed how I think about this"
 */
export declare const onPersonaGrowthChange: import("../hook-generator.js").DomainHook<PersonaGrowthEntity>;
interface ConversationTextureEntity {
    personaId: string;
    sessionId: string;
    tone: 'playful' | 'serious' | 'vulnerable' | 'analytical' | 'exploratory' | 'supportive' | 'celebratory' | 'reflective' | 'mixed';
    depth: 'surface' | 'moderate' | 'deep' | 'profound';
    rhythm: 'rapid' | 'flowing' | 'contemplative' | 'variable';
    topics: string[];
    energyPattern: 'building' | 'steady' | 'winding_down' | 'peaks_and_valleys';
    date: string;
}
/**
 * Track the "feel" or "vibe" of conversations over time
 * "Our talks tend to go deep with a flowing rhythm"
 */
export declare const onConversationTextureChange: import("../hook-generator.js").DomainHook<ConversationTextureEntity>;
export declare const trustHooks: {
    onCommitmentChange: import("../hook-generator.js").DomainHook<CommitmentEntity>;
    onBoundaryChange: import("../hook-generator.js").DomainHook<BoundaryEntity>;
    onInsideJokeChange: import("../hook-generator.js").DomainHook<InsideJokeEntity>;
    onGrowthReflectionChange: import("../hook-generator.js").DomainHook<GrowthReflectionEntity>;
    onSmallWinChange: import("../hook-generator.js").DomainHook<SmallWinEntity>;
    onThinkingOfYouChange: import("../hook-generator.js").DomainHook<ThinkingOfYouEntity>;
    onReadingBetweenLinesChange: import("../hook-generator.js").DomainHook<ReadingBetweenLinesEntity>;
    onTonalMemoryChange: import("../hook-generator.js").DomainHook<TonalMemoryEntity>;
    onVulnerabilityMomentChange: import("../hook-generator.js").DomainHook<VulnerabilityMomentEntity>;
    onTrustMilestoneChange: import("../hook-generator.js").DomainHook<TrustMilestoneEntity>;
    onCuriosityMentionChange: import("../hook-generator.js").DomainHook<CuriosityMentionEntity>;
    onBetweenSessionThinkingChange: import("../hook-generator.js").DomainHook<BetweenSessionThinkingEntity>;
    onPersonaGrowthChange: import("../hook-generator.js").DomainHook<PersonaGrowthEntity>;
    onConversationTextureChange: import("../hook-generator.js").DomainHook<ConversationTextureEntity>;
};
export default trustHooks;
//# sourceMappingURL=trust-hooks.d.ts.map