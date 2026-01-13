/**
 * RelationshipDepth Value Object
 *
 * Encapsulates the nuanced depth of a relationship, going beyond simple stages.
 * This is SUPERHUMAN: we track trust velocity, emotional safety, and shared history
 * density - things humans can't objectively measure.
 *
 * @module personality/domain/model/value-objects/relationship-depth
 */
/**
 * Traditional relationship stages (for backward compatibility)
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted' | 'intimate';
/**
 * Depth level for sharing content
 */
export type ShareDepth = 'surface' | 'medium' | 'deep' | 'sacred';
/**
 * RelationshipDepth - A value object representing the depth of relationship
 *
 * Immutable. Create new instances with `with*` methods.
 *
 * @example
 * ```typescript
 * const depth = RelationshipDepth.create({
 *   vulnerabilityScore: 45,
 *   trustVelocity: 2.5,
 *   sharedHistoryDensity: 30,
 *   emotionalSafetyIndex: 65,
 * });
 *
 * if (depth.canHandle('deep')) {
 *   // Safe to share deep content
 * }
 * ```
 */
export declare class RelationshipDepth {
    /** How much vulnerability they've shared (0-100) */
    readonly vulnerabilityScore: number;
    /** How fast trust is building (-10 to +10, negative = declining) */
    readonly trustVelocity: number;
    /** Density of shared moments, inside jokes, callbacks (0-100) */
    readonly sharedHistoryDensity: number;
    /** Do they feel emotionally safe? (0-100) */
    readonly emotionalSafetyIndex: number;
    /** First vulnerable share timestamp */
    readonly firstVulnerableShareAt?: Date | undefined;
    /** Most recent vulnerable share timestamp */
    readonly lastVulnerableShareAt?: Date | undefined;
    /** Count of "first time" vulnerability moments */
    readonly firstTimeVulnerabilityCount: number;
    private constructor();
    /**
     * Create a new RelationshipDepth from raw values
     */
    static create(params: {
        vulnerabilityScore: number;
        trustVelocity: number;
        sharedHistoryDensity: number;
        emotionalSafetyIndex: number;
        firstVulnerableShareAt?: Date;
        lastVulnerableShareAt?: Date;
        firstTimeVulnerabilityCount?: number;
    }): RelationshipDepth;
    /**
     * Create a new stranger relationship
     */
    static stranger(): RelationshipDepth;
    /**
     * Reconstitute from persistence
     */
    static fromPersistence(data: {
        vulnerabilityScore: number;
        trustVelocity: number;
        sharedHistoryDensity: number;
        emotionalSafetyIndex: number;
        firstVulnerableShareAt?: string;
        lastVulnerableShareAt?: string;
        firstTimeVulnerabilityCount?: number;
    }): RelationshipDepth;
    /**
     * Get the current relationship stage
     * SUPERHUMAN: This is a nuanced calculation, not just a threshold
     */
    get stage(): RelationshipStage;
    /**
     * Is trust currently growing?
     */
    get isTrustGrowing(): boolean;
    /**
     * Is trust declining? (red flag)
     */
    get isTrustDeclining(): boolean;
    /**
     * Do they feel emotionally safe with us?
     */
    get feelsSafe(): boolean;
    /**
     * Have we built meaningful shared history?
     */
    get hasSharedHistory(): boolean;
    /**
     * Composite score for overall relationship health (0-100)
     */
    get overallHealthScore(): number;
    /**
     * Can we share content of this depth?
     *
     * SUPERHUMAN: We consider trust velocity and emotional safety,
     * not just the raw stage.
     */
    canHandle(depth: ShareDepth): boolean;
    /**
     * Should we proactively share insights?
     *
     * SUPERHUMAN: Proactive sharing requires growing trust and safety
     */
    shouldProactivelyShare(): boolean;
    /**
     * How cautious should we be? (0-1, higher = more cautious)
     *
     * SUPERHUMAN: Calibrate caution based on multiple factors
     */
    getCautionLevel(): number;
    /**
     * Get minimum required stage for a share depth
     */
    static getRequiredStage(depth: ShareDepth): RelationshipStage;
    /**
     * Record a vulnerability deposit (they shared something vulnerable)
     */
    withVulnerabilityDeposit(amount: number, isFirstTime?: boolean): RelationshipDepth;
    /**
     * Record a shared moment (inside joke, callback, shared experience)
     */
    withSharedMoment(value: number): RelationshipDepth;
    /**
     * Record a trust signal (positive or negative interaction)
     */
    withTrustSignal(delta: number): RelationshipDepth;
    /**
     * Apply time decay (trust naturally decays without interaction)
     */
    withTimeDecay(daysSinceLastInteraction: number): RelationshipDepth;
    /**
     * Convert to plain object for persistence
     */
    toPersistence(): {
        vulnerabilityScore: number;
        trustVelocity: number;
        sharedHistoryDensity: number;
        emotionalSafetyIndex: number;
        firstVulnerableShareAt?: string;
        lastVulnerableShareAt?: string;
        firstTimeVulnerabilityCount: number;
        stage: RelationshipStage;
        overallHealthScore: number;
    };
    /**
     * Equality check
     */
    equals(other: RelationshipDepth): boolean;
}
//# sourceMappingURL=relationship-depth.d.ts.map