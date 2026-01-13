/**
 * Relationship Events Engine
 *
 * > "We've been talking for six months now. Look how far you've come."
 *
 * Track and celebrate relationship milestones:
 *
 * - **First Moments**: First vulnerability, first breakthrough
 * - **Session Milestones**: 10th conversation, 50th, 100th
 * - **Time Milestones**: One month, six months, one year
 * - **Growth Moments**: Recognizing patterns of growth
 * - **Inside References**: Shared history we can reference
 * - **Anniversary Awareness**: Remember significant dates
 *
 * This creates the feeling of a relationship with history and depth.
 *
 * @module @ferni/relationship-events
 */
export type MilestoneType = 'first_session' | 'first_vulnerability' | 'first_breakthrough' | 'first_inside_joke' | 'session_milestone' | 'time_milestone' | 'growth_recognition' | 'callback_moment' | 'relationship_acknowledgment';
export interface RelationshipMilestone {
    /** Unique ID */
    id: string;
    /** Type of milestone */
    type: MilestoneType;
    /** When it happened */
    date: Date;
    /** Session number when it occurred */
    sessionNumber: number;
    /** Description */
    description: string;
    /** Has it been acknowledged to user? */
    acknowledged: boolean;
    /** Emotional significance (0-1) */
    significance: number;
    /** Related content/context */
    context?: string;
}
export interface SharedMemory {
    /** What the memory is */
    content: string;
    /** When it was created */
    date: Date;
    /** Category */
    category: 'joke' | 'phrase' | 'story' | 'reference' | 'nickname';
    /** Times referenced */
    referenceCount: number;
    /** Last referenced */
    lastReferenced?: Date;
}
export interface RelationshipState {
    /** First session date */
    firstSessionDate: Date | null;
    /** Total session count */
    totalSessions: number;
    /** Current session number */
    currentSession: number;
    /** All milestones */
    milestones: RelationshipMilestone[];
    /** Shared memories (inside jokes, etc.) */
    sharedMemories: SharedMemory[];
    /** Relationship depth score (0-1) */
    depthScore: number;
    /** Topics that define the relationship */
    definingTopics: string[];
    /** Significant dates to remember */
    significantDates: Array<{
        date: Date;
        description: string;
    }>;
}
export interface MilestoneOpportunity {
    /** Type of milestone */
    type: MilestoneType;
    /** Acknowledgment phrase */
    phrase: string;
    /** Significance */
    significance: number;
    /** Should we acknowledge this turn? */
    shouldAcknowledge: boolean;
}
export declare class RelationshipEventsEngine {
    private state;
    private lastMilestoneAcknowledgmentTurn;
    private turnCount;
    constructor();
    /**
     * Start a new session
     */
    startSession(): void;
    /**
     * Record a first-time event
     */
    recordFirstEvent(type: 'vulnerability' | 'breakthrough' | 'inside_joke', context?: string): void;
    /**
     * Add a shared memory (inside joke, phrase, etc.)
     */
    addSharedMemory(content: string, category: SharedMemory['category']): void;
    /**
     * Record a significant date
     */
    addSignificantDate(date: Date, description: string): void;
    /**
     * Add a defining topic
     */
    addDefiningTopic(topic: string): void;
    /**
     * Update depth score
     */
    updateDepthScore(delta: number): void;
    /**
     * Check for milestone opportunities this turn
     */
    checkMilestoneOpportunity(turnCount: number): MilestoneOpportunity | null;
    /**
     * Get a callback to early conversations
     */
    getCallbackOpportunity(currentTopics: string[]): string | null;
    /**
     * Get a shared memory reference
     */
    getSharedMemoryReference(): SharedMemory | null;
    /**
     * Check for significant date proximity
     */
    checkSignificantDateProximity(now?: Date): string | null;
    /**
     * Get full relationship state
     */
    getState(): RelationshipState;
    /**
     * Load state from persistence
     */
    loadState(state: Partial<RelationshipState>): void;
    /**
     * Reset for new user
     */
    reset(): void;
    private recordMilestone;
}
export declare function getRelationshipEventsEngine(userId: string): RelationshipEventsEngine;
export declare function resetRelationshipEventsEngine(userId: string): void;
export declare function clearRelationshipEventsEngine(userId: string): void;
export declare function getActiveRelationshipEventsCount(): number;
export default RelationshipEventsEngine;
//# sourceMappingURL=relationship-events.d.ts.map