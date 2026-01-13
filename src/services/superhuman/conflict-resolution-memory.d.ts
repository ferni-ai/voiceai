/**
 * Conflict Resolution Memory - Better Than Human Conflict Support
 *
 * Remembers what works (and doesn't) for resolving conflicts:
 * - Per-relationship conflict patterns and triggers
 * - Effective resolution approaches for this person
 * - Cooldown times they need
 * - Historical outcomes
 *
 * WHY IT'S SUPERHUMAN: Friends forget what worked last time.
 * Ferni remembers every conflict and its resolution forever.
 *
 * @module services/superhuman/conflict-resolution-memory
 */
export type ConflictType = 'disagreement' | 'miscommunication' | 'boundary_violation' | 'unmet_expectations' | 'values_clash' | 'recurring_issue' | 'external_stress' | 'emotional_flooding';
export type ResolutionApproach = 'take_a_break' | 'write_it_out' | 'sleep_on_it' | 'seek_to_understand' | 'use_i_statements' | 'find_common_ground' | 'apologize_first' | 'set_boundary' | 'third_party' | 'agree_to_disagree' | 'problem_solve' | 'validate_first';
export type ConflictOutcome = 'resolved' | 'improved' | 'unchanged' | 'escalated' | 'ongoing';
export interface ConflictRecord {
    id?: string;
    userId: string;
    /** Who the conflict was with (relationship or name) */
    withPerson: string;
    /** Relationship type */
    relationship: string;
    /** Type of conflict */
    conflictType: ConflictType;
    /** What triggered it */
    triggers: string[];
    /** Approaches tried */
    approachesTried: ResolutionApproach[];
    /** What worked */
    effectiveApproaches: ResolutionApproach[];
    /** What didn't work */
    ineffectiveApproaches: ResolutionApproach[];
    /** How it turned out */
    outcome: ConflictOutcome;
    /** How long resolution took (hours) */
    resolutionTimeHours?: number;
    /** Cooldown time needed before re-engaging */
    cooldownNeeded: number;
    /** User's reflection on what they learned */
    reflection?: string;
    /** When this happened */
    timestamp: number;
}
export interface ConflictPattern {
    person: string;
    relationship: string;
    /** Topics that commonly trigger conflict */
    triggerTopics: string[];
    /** Approaches that work with this person */
    effectiveApproaches: ResolutionApproach[];
    /** Approaches to avoid with this person */
    ineffectiveApproaches: ResolutionApproach[];
    /** Average cooldown time needed */
    averageCooldown: number;
    /** Common conflict types */
    commonTypes: ConflictType[];
    /** Success rate */
    resolutionRate: number;
    /** Total conflicts tracked */
    conflictCount: number;
}
/**
 * Record a conflict for pattern analysis.
 */
export declare function recordConflict(userId: string, conflict: Omit<ConflictRecord, 'id' | 'userId' | 'timestamp'>): Promise<string | null>;
/**
 * Update a conflict record with resolution info.
 */
export declare function updateConflictResolution(userId: string, conflictId: string, updates: Partial<Pick<ConflictRecord, 'outcome' | 'effectiveApproaches' | 'reflection' | 'resolutionTimeHours'>>): Promise<void>;
/**
 * Load conflict history.
 */
export declare function loadConflictHistory(userId: string, withPerson?: string): Promise<ConflictRecord[]>;
/**
 * Analyze conflict patterns for a specific relationship.
 */
export declare function analyzeConflictPattern(conflicts: ConflictRecord[]): ConflictPattern | null;
/**
 * Get all conflict patterns for a user.
 */
export declare function getAllConflictPatterns(userId: string): Promise<ConflictPattern[]>;
/**
 * Get conflict resolution recommendations for a specific person.
 */
export declare function getConflictRecommendations(userId: string, withPerson: string): Promise<{
    effective: string[];
    avoid: string[];
    cooldownAdvice: string;
    triggers: string[];
}>;
/**
 * Build context for LLM injection when conflict is detected.
 */
export declare function buildConflictResolutionContext(userId: string, mentionedPerson?: string): Promise<string>;
export declare const conflictResolution: {
    record: typeof recordConflict;
    update: typeof updateConflictResolution;
    loadHistory: typeof loadConflictHistory;
    analyzePattern: typeof analyzeConflictPattern;
    getAllPatterns: typeof getAllConflictPatterns;
    getRecommendations: typeof getConflictRecommendations;
    buildContext: typeof buildConflictResolutionContext;
};
//# sourceMappingURL=conflict-resolution-memory.d.ts.map