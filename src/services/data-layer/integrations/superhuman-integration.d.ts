/**
 * Superhuman Services Integration for Semantic Data Layer
 *
 * CONSOLIDATED: This file now wraps domain hooks for backward compatibility.
 * New code should use hooks directly from `../hooks/superhuman-hooks.js`.
 *
 * @module data-layer/integrations/superhuman-integration
 * @deprecated Import from `../hooks/superhuman-hooks.js` instead
 */
import type { ChangeType } from '../types.js';
interface DreamForIndex {
    id: string;
    dream: string;
    category: string;
    timeframe?: string;
    status: string;
    steps?: string[];
    obstacles?: string[];
}
/**
 * Index a dream to semantic memory
 * @deprecated Use `onDreamChange` from `../hooks/superhuman-hooks.js` instead
 */
export declare function indexDream(userId: string, dream: DreamForIndex, changeType?: ChangeType): void;
/**
 * Remove a dream from semantic index (when achieved/abandoned)
 */
export declare function deindexDream(userId: string, dreamId: string): void;
interface LifeChapterForIndex {
    id: string;
    title: string;
    summary: string;
    period?: {
        start: string;
        end?: string;
    };
    themes?: string[];
    significance?: number;
}
/**
 * Index a life chapter (always indexed - life narrative)
 * @deprecated Use `onLifeChapterChange` from `../hooks/superhuman-hooks.js` instead
 */
export declare function indexLifeChapter(userId: string, chapter: LifeChapterForIndex, changeType?: ChangeType): void;
interface ValuesAlignmentForIndex {
    id: string;
    value: string;
    alignment: string;
    evidence?: string;
    recentActions?: string[];
}
/**
 * Index a values alignment check (always indexed)
 * @deprecated Use `onValuesAlignmentChange` from `../hooks/superhuman-hooks.js` instead
 */
export declare function indexValuesAlignment(userId: string, alignment: ValuesAlignmentForIndex, changeType?: ChangeType): void;
interface CapacityStateForIndex {
    id: string;
    level: 'optimal' | 'good' | 'moderate' | 'low' | 'critical';
    factors?: string[];
    recommendation?: string;
}
/**
 * Index a capacity state (burnout prevention)
 * @deprecated Use `onCapacityStateChange` from `../hooks/superhuman-hooks.js` instead
 */
export declare function indexCapacityState(userId: string, state: CapacityStateForIndex, changeType?: ChangeType): void;
interface RelationshipMilestoneForIndex {
    id: string;
    contactName: string;
    milestone: string;
    date?: string;
    notes?: string;
}
/**
 * Index a relationship milestone (never forget anniversaries)
 * @deprecated Use `onRelationshipMilestoneChange` from `../hooks/superhuman-hooks.js` instead
 */
export declare function indexRelationshipMilestone(userId: string, milestone: RelationshipMilestoneForIndex, changeType?: ChangeType): void;
interface SeasonalPatternForIndex {
    id: string;
    pattern: string;
    season?: string;
    triggers?: string[];
    strategies?: string[];
}
/**
 * Index a seasonal pattern (anticipate struggles)
 * @deprecated Use `onSeasonalPatternChange` from `../hooks/superhuman-hooks.js` instead
 */
export declare function indexSeasonalPattern(userId: string, pattern: SeasonalPatternForIndex, changeType?: ChangeType): void;
interface PredictiveCoachingForIndex {
    id: string;
    prediction: string;
    confidence: number;
    basedOn?: string[];
    suggestedAction?: string;
}
/**
 * Index a predictive coaching insight
 * @deprecated Use `onPredictiveInsightChange` from `../hooks/superhuman-hooks.js` instead
 */
export declare function indexPredictiveCoaching(userId: string, prediction: PredictiveCoachingForIndex, changeType?: ChangeType): void;
interface EmotionalFirstAidForIndex {
    id: string;
    situation: string;
    emotionDetected: string;
    interventionUsed: string;
    outcome?: string;
}
/**
 * Index an emotional first aid intervention
 */
export declare function indexEmotionalFirstAid(userId: string, intervention: EmotionalFirstAidForIndex, changeType?: ChangeType): void;
/**
 * Remove a life chapter from semantic index
 */
export declare function deindexLifeChapter(userId: string, chapterId: string): void;
/**
 * Remove a values alignment from semantic index
 */
export declare function deindexValuesAlignment(userId: string, alignmentId: string): void;
/**
 * Remove a capacity state from semantic index
 */
export declare function deindexCapacityState(userId: string, stateId: string): void;
/**
 * Remove a relationship milestone from semantic index
 */
export declare function deindexRelationshipMilestone(userId: string, milestoneId: string): void;
/**
 * Remove a seasonal pattern from semantic index
 */
export declare function deindexSeasonalPattern(userId: string, patternId: string): void;
/**
 * Remove a predictive coaching insight from semantic index
 */
export declare function deindexPredictiveCoaching(userId: string, predictionId: string): void;
/**
 * Remove an emotional first aid intervention from semantic index
 */
export declare function deindexEmotionalFirstAid(userId: string, interventionId: string): void;
export {};
//# sourceMappingURL=superhuman-integration.d.ts.map