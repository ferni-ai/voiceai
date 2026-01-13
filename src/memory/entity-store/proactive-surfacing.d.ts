/**
 * Proactive Surfacing Engine
 *
 * A superhuman friend doesn't just remember when asked -
 * they bring things up at exactly the right moment.
 *
 * This engine analyzes every turn for opportunities to
 * proactively surface relevant memories.
 *
 * @module memory/entity-store/proactive-surfacing
 */
import type { SurfacingOpportunity } from './types.js';
export interface ConversationContext {
    /** Current user turn text */
    currentTurn: string;
    /** User ID */
    userId: string;
    /** Session ID */
    sessionId: string;
    /** Persona ID */
    personaId: string;
    /** Conversation turn number */
    turnNumber: number;
    /** Detected emotion */
    detectedEmotion?: string;
    /** Conversation mood (exploratory, venting, seeking_help, casual) */
    conversationMood?: 'exploratory' | 'venting' | 'seeking_help' | 'casual';
    /** Was last turn a question? */
    lastTurnWasQuestion?: boolean;
    /** Number of surfacings already done this session */
    surfacingCountThisSession: number;
    /** Topics discussed this session */
    sessionTopics: string[];
}
export interface SurfacingConfig {
    /** Maximum surfacings per session */
    maxSurfacingsPerSession: number;
    /** Minimum confidence to surface */
    minConfidence: number;
    /** Enable temporal triggers (birthdays, anniversaries) */
    enableTemporalTriggers: boolean;
    /** Enable pattern insights */
    enablePatternInsights: boolean;
    /** Enable commitment check-ins */
    enableCommitmentCheckins: boolean;
}
export declare class ProactiveSurfacingEngine {
    private config;
    constructor(config?: Partial<SurfacingConfig>);
    /**
     * Analyze current turn for proactive surfacing opportunities
     */
    analyze(context: ConversationContext): Promise<SurfacingOpportunity[]>;
    /**
     * Find entities mentioned in current turn
     */
    private findEntityMentions;
    /**
     * Get related entities worth surfacing
     */
    private getRelatedWorthSurfacing;
    /**
     * Determine if a related entity is worth surfacing
     */
    private shouldSurfaceRelated;
    /**
     * Check for temporal triggers (birthdays, anniversaries, etc.)
     */
    private checkTemporalTriggers;
    /**
     * Detect pattern-based surfacing opportunities
     */
    private detectPatternOpportunities;
    /**
     * Check if a pattern is relevant to current context
     */
    private isPatternRelevant;
    /**
     * Generate natural phrasing for pattern insight
     */
    private generatePatternPhrase;
    /**
     * Check for commitment check-in opportunities
     */
    private checkCommitmentOpportunities;
    /**
     * Assess user receptivity to surfacing
     */
    private assessReceptivity;
    /**
     * Generate natural phrasing for entity context
     */
    private generateEntityContextPhrase;
    /**
     * Prioritize and filter opportunities
     */
    private prioritizeOpportunities;
    private isTomorrow;
    private isThisWeek;
}
export declare function getProactiveSurfacingEngine(): ProactiveSurfacingEngine;
//# sourceMappingURL=proactive-surfacing.d.ts.map