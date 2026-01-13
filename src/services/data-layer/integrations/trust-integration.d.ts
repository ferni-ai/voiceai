/**
 * Trust Systems Integration for Semantic Data Layer
 *
 * CONSOLIDATED: This file now wraps domain hooks for backward compatibility.
 * New code should use hooks directly from `../hooks/trust-hooks.js`.
 *
 * @module data-layer/integrations/trust-integration
 * @deprecated Import from `../hooks/trust-hooks.js` instead
 */
import type { ChangeType } from '../types.js';
interface CommitmentForIndex {
    id: string;
    userId: string;
    content: string;
    type: string;
    status: string;
    originalQuote?: string;
    motivation?: string;
    obstacles?: string[];
    createdAt?: string | Date;
    followUpDate?: string | Date | null;
}
/**
 * Index a commitment to semantic memory
 * @deprecated Use `onCommitmentChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexCommitment(commitment: CommitmentForIndex, changeType?: ChangeType): void;
/**
 * Remove a commitment from semantic index (when completed/abandoned)
 */
export declare function deindexCommitment(userId: string, commitmentId: string): void;
/**
 * Remove a boundary from semantic index (when lifted/reopened)
 */
export declare function deindexBoundary(userId: string, boundaryId: string): void;
interface BoundaryForIndex {
    id: string;
    topic: string;
    type: string;
    strength: string;
    relatedTerms?: string[];
    context?: string;
}
/**
 * Index a boundary to semantic memory (critical - always indexed)
 * @deprecated Use `onBoundaryChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexBoundary(userId: string, boundary: BoundaryForIndex, changeType?: ChangeType): void;
interface InsideJokeForIndex {
    id: string;
    joke: string;
    context: string;
    sharedMoment?: string;
}
/**
 * Index an inside joke (always indexed - relationship building)
 * @deprecated Use `onInsideJokeChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexInsideJoke(userId: string, joke: InsideJokeForIndex, changeType?: ChangeType): void;
/**
 * Remove an inside joke from semantic index
 */
export declare function deindexInsideJoke(userId: string, jokeId: string): void;
interface GrowthReflectionForIndex {
    id: string;
    observation: string;
    area: string;
    evidence?: string;
}
/**
 * Index a growth reflection
 * @deprecated Use `onGrowthReflectionChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexGrowthReflection(userId: string, reflection: GrowthReflectionForIndex, changeType?: ChangeType): void;
/**
 * Remove a growth reflection from semantic index
 */
export declare function deindexGrowthReflection(userId: string, reflectionId: string): void;
interface SmallWinForIndex {
    id: string;
    win: string;
    effort?: string;
    celebration?: string;
}
/**
 * Index a small win celebration
 * @deprecated Use `onSmallWinChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexSmallWin(userId: string, win: SmallWinForIndex, changeType?: ChangeType): void;
/**
 * Remove a small win from semantic index
 */
export declare function deindexSmallWin(userId: string, winId: string): void;
interface TrustMomentForIndex {
    id: string;
    type: 'small_win' | 'boundary' | 'intention' | 'breakthrough' | 'vulnerability' | 'callback';
    content: string;
    context?: string;
    emotion?: string;
    personaId?: string;
}
/**
 * Index any trust moment for unified recording
 */
export declare function indexTrustMoment(userId: string, moment: TrustMomentForIndex, changeType?: ChangeType): void;
interface ThinkingOfYouForIndex {
    id: string;
    reason: string;
    theyShared?: string;
    outreachType?: string;
}
/**
 * Index a "thinking of you" moment
 * @deprecated Use `onThinkingOfYouChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexThinkingOfYou(userId: string, moment: ThinkingOfYouForIndex, changeType?: ChangeType): void;
/**
 * Remove a "thinking of you" moment from semantic index
 */
export declare function deindexThinkingOfYou(userId: string, momentId: string): void;
interface ReadingBetweenLinesForIndex {
    id: string;
    observation: string;
    whatTheySaid?: string;
    whatTheyMeant?: string;
}
/**
 * Index a "reading between lines" observation
 * @deprecated Use `onReadingBetweenLinesChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexReadingBetweenLines(userId: string, observation: ReadingBetweenLinesForIndex, changeType?: ChangeType): void;
/**
 * Remove a "reading between lines" observation from semantic index
 */
export declare function deindexReadingBetweenLines(userId: string, observationId: string): void;
interface TonalMemoryForIndex {
    id: string;
    pattern: string;
    voiceCharacteristics?: string;
    communicationStyle?: string;
}
/**
 * Index a tonal memory pattern
 * @deprecated Use `onTonalMemoryChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexTonalMemory(userId: string, memory: TonalMemoryForIndex, changeType?: ChangeType): void;
/**
 * Remove a tonal memory pattern from semantic index
 */
export declare function deindexTonalMemory(userId: string, memoryId: string): void;
interface VulnerabilityMomentForIndex {
    id: string;
    moment: string;
    topic?: string;
    responseGiven?: string;
}
/**
 * Index a vulnerability moment (very high trust value)
 * @deprecated Use `onVulnerabilityMomentChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexVulnerabilityMoment(userId: string, moment: VulnerabilityMomentForIndex, changeType?: ChangeType): void;
/**
 * Remove a vulnerability moment from semantic index
 */
export declare function deindexVulnerabilityMoment(userId: string, momentId: string): void;
interface TrustMilestoneForIndex {
    id: string;
    milestone: string;
    level?: string;
    evidence?: string;
}
/**
 * Index a trust milestone
 * @deprecated Use `onTrustMilestoneChange` from `../hooks/trust-hooks.js` instead
 */
export declare function indexTrustMilestone(userId: string, milestone: TrustMilestoneForIndex, changeType?: ChangeType): void;
/**
 * Remove a trust milestone from semantic index
 */
export declare function deindexTrustMilestone(userId: string, milestoneId: string): void;
interface LifeEventForIndex {
    id: string;
    event: string;
    date?: string;
    significance?: string;
}
/**
 * Index a life event/milestone
 */
export declare function indexLifeEvent(userId: string, event: LifeEventForIndex, changeType?: ChangeType): void;
/**
 * Remove a life event from semantic index
 */
export declare function deindexLifeEvent(userId: string, eventId: string): void;
interface LearningStyleForIndex {
    id: string;
    style: string;
    preferences?: string;
    whatWorks?: string;
}
/**
 * Index learning style insights
 */
export declare function indexLearningStyle(userId: string, style: LearningStyleForIndex, changeType?: ChangeType): void;
/**
 * Remove learning style insight from semantic index
 */
export declare function deindexLearningStyle(userId: string, styleId: string): void;
interface CuriosityMentionForIndex {
    id: string;
    entity: string;
    entityType: 'person' | 'place' | 'event' | 'activity' | 'goal';
    originalContext: string;
    priority: 'low' | 'medium' | 'high';
    followUpEligible: boolean;
    mentionedAt?: Date | string;
}
/**
 * Index a curiosity mention for semantic search
 * "You mentioned Sam a few weeks ago. How are they?"
 */
export declare function indexCuriosityMention(userId: string, mention: CuriosityMentionForIndex, changeType?: ChangeType): void;
/**
 * Remove curiosity mention from semantic index (e.g., after follow-up)
 */
export declare function deindexCuriosityMention(userId: string, mentionId: string): void;
interface BetweenSessionThinkingForIndex {
    id: string;
    topic: string;
    reflection: string;
    sessionNumber: number;
    depth: 'surface' | 'moderate' | 'deep';
    emotionalTone?: string;
    createdAt?: Date | string;
}
/**
 * Index a between-session thinking moment
 * "I've been thinking about what you said..."
 */
export declare function indexBetweenSessionThinking(userId: string, thinking: BetweenSessionThinkingForIndex, changeType?: ChangeType): void;
/**
 * Remove between-session thinking from semantic index
 */
export declare function deindexBetweenSessionThinking(userId: string, thinkingId: string): void;
interface PersonaGrowthForIndex {
    id: string;
    personaId: string;
    growthType: 'perspective' | 'empathy' | 'knowledge' | 'curiosity' | 'values';
    description: string;
    userInfluence: string;
    date?: Date | string;
}
/**
 * Index a persona growth moment
 * "You've changed how I think about this"
 */
export declare function indexPersonaGrowth(userId: string, growth: PersonaGrowthForIndex, changeType?: ChangeType): void;
/**
 * Remove persona growth from semantic index
 */
export declare function deindexPersonaGrowth(userId: string, growthId: string): void;
export {};
//# sourceMappingURL=trust-integration.d.ts.map