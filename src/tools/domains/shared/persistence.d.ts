/**
 * Shared Persistence Utilities for Domain Tools
 *
 * Provides consistent patterns for storing user data across all domain tools.
 * Uses the learning engine when available, with graceful fallback.
 *
 * USAGE:
 *   import { persistInsight, persistKeyMoment, persistTrackedItem } from '../shared/persistence.js';
 *
 *   execute: async ({ param }, { ctx: toolCtx }) => {
 *     await persistInsight(toolCtx, {
 *       domain: 'health',
 *       type: 'exercise_log',
 *       data: { activity: 'running', duration: 30 },
 *       confidence: 0.9,
 *     });
 *   }
 */
/**
 * Tool context with userData - matches the LiveKit agents pattern
 */
export interface ToolCtxWithUserData {
    userData?: {
        name?: string;
        keyMoments?: string[];
        topics?: string[];
        services?: {
            captureInsight?: (type: string, source: string, insight: string, confidence: number) => void;
            learningEngine?: {
                captureExternalKeyMoment: (moment: {
                    id: string;
                    timestamp: Date;
                    type: 'breakthrough' | 'milestone' | 'concern' | 'celebration' | 'decision' | 'shared_vulnerability';
                    summary: string;
                    emotionalWeight: 'light' | 'medium' | 'heavy';
                    topics: string[];
                }) => void;
            };
            searchKnowledge?: (query: string) => Promise<string | null>;
        };
    };
}
export interface InsightData {
    domain: string;
    type: string;
    data: Record<string, unknown>;
    confidence?: number;
}
export type CoreMomentType = 'breakthrough' | 'milestone' | 'concern' | 'celebration' | 'decision' | 'shared_vulnerability';
export interface KeyMomentData {
    domain: string;
    /** Extended type - will be mapped to core type for learning engine */
    type: CoreMomentType | string;
    summary: string;
    emotionalWeight?: 'light' | 'medium' | 'heavy';
    topics?: string[];
}
export interface TrackedItemData {
    domain: string;
    itemType: string;
    item: Record<string, unknown>;
    importance?: 'low' | 'medium' | 'high';
}
/**
 * Persist an insight to the learning engine
 * Use for facts, preferences, and learnings about the user
 */
export declare function persistInsight(toolCtx: ToolCtxWithUserData, insight: InsightData): boolean;
/**
 * Persist a key moment to the learning engine
 * Use for significant events, milestones, decisions, breakthroughs
 */
export declare function persistKeyMoment(toolCtx: ToolCtxWithUserData, moment: KeyMomentData): boolean;
/**
 * Persist a tracked item (exercise, job application, etc.)
 * Wraps as insight with structured data
 */
export declare function persistTrackedItem(toolCtx: ToolCtxWithUserData, item: TrackedItemData): boolean;
/**
 * Add to session context (for awareness tools within same conversation)
 */
export declare function addToSessionContext(toolCtx: ToolCtxWithUserData, domain: string, key: string, value: unknown): void;
/**
 * Query past knowledge (if available)
 */
export declare function queryPastKnowledge(toolCtx: ToolCtxWithUserData, query: string): Promise<string | null>;
declare const _default: {
    persistInsight: typeof persistInsight;
    persistKeyMoment: typeof persistKeyMoment;
    persistTrackedItem: typeof persistTrackedItem;
    addToSessionContext: typeof addToSessionContext;
    queryPastKnowledge: typeof queryPastKnowledge;
};
export default _default;
//# sourceMappingURL=persistence.d.ts.map