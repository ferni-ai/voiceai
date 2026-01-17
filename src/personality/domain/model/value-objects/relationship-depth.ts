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
 * Configuration for relationship depth thresholds
 */
const DEPTH_CONFIG = {
  /** Thresholds for relationship stages based on vulnerability score */
  stageThresholds: {
    intimate: { vulnerabilityScore: 80, emotionalSafetyIndex: 90 },
    trusted: { vulnerabilityScore: 60, emotionalSafetyIndex: 70 },
    friend: { vulnerabilityScore: 30, emotionalSafetyIndex: 50 },
    acquaintance: { vulnerabilityScore: 10, emotionalSafetyIndex: 30 },
  },
  /** Minimum emotional safety index to share deep content */
  minSafetyForDeep: 60,
  /** Trust velocity threshold for proactive sharing */
  proactiveShareTrustVelocity: 3,
} as const;

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
export class RelationshipDepth {
  private constructor(
    /** How much vulnerability they've shared (0-100) */
    public readonly vulnerabilityScore: number,
    /** How fast trust is building (-10 to +10, negative = declining) */
    public readonly trustVelocity: number,
    /** Density of shared moments, inside jokes, callbacks (0-100) */
    public readonly sharedHistoryDensity: number,
    /** Do they feel emotionally safe? (0-100) */
    public readonly emotionalSafetyIndex: number,
    /** First vulnerable share timestamp */
    public readonly firstVulnerableShareAt?: Date,
    /** Most recent vulnerable share timestamp */
    public readonly lastVulnerableShareAt?: Date,
    /** Count of "first time" vulnerability moments */
    public readonly firstTimeVulnerabilityCount: number = 0
  ) {}

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

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
  }): RelationshipDepth {
    return new RelationshipDepth(
      Math.max(0, Math.min(100, params.vulnerabilityScore)),
      Math.max(-10, Math.min(10, params.trustVelocity)),
      Math.max(0, Math.min(100, params.sharedHistoryDensity)),
      Math.max(0, Math.min(100, params.emotionalSafetyIndex)),
      params.firstVulnerableShareAt,
      params.lastVulnerableShareAt,
      params.firstTimeVulnerabilityCount ?? 0
    );
  }

  /**
   * Create a new stranger relationship
   */
  static stranger(): RelationshipDepth {
    return new RelationshipDepth(0, 0, 0, 50);
  }

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
  }): RelationshipDepth {
    return new RelationshipDepth(
      data.vulnerabilityScore,
      data.trustVelocity,
      data.sharedHistoryDensity,
      data.emotionalSafetyIndex,
      data.firstVulnerableShareAt ? new Date(data.firstVulnerableShareAt) : undefined,
      data.lastVulnerableShareAt ? new Date(data.lastVulnerableShareAt) : undefined,
      data.firstTimeVulnerabilityCount ?? 0
    );
  }

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /**
   * Get the current relationship stage
   * SUPERHUMAN: This is a nuanced calculation, not just a threshold
   */
  get stage(): RelationshipStage {
    const { stageThresholds } = DEPTH_CONFIG;

    if (
      this.vulnerabilityScore >= stageThresholds.intimate.vulnerabilityScore &&
      this.emotionalSafetyIndex >= stageThresholds.intimate.emotionalSafetyIndex
    ) {
      return 'intimate';
    }

    if (
      this.vulnerabilityScore >= stageThresholds.trusted.vulnerabilityScore &&
      this.emotionalSafetyIndex >= stageThresholds.trusted.emotionalSafetyIndex
    ) {
      return 'trusted';
    }

    if (
      this.vulnerabilityScore >= stageThresholds.friend.vulnerabilityScore ||
      this.sharedHistoryDensity >= 40
    ) {
      return 'friend';
    }

    if (this.vulnerabilityScore >= stageThresholds.acquaintance.vulnerabilityScore) {
      return 'acquaintance';
    }

    return 'stranger';
  }

  /**
   * Is trust currently growing?
   */
  get isTrustGrowing(): boolean {
    return this.trustVelocity > 0;
  }

  /**
   * Is trust declining? (red flag)
   */
  get isTrustDeclining(): boolean {
    return this.trustVelocity < -2;
  }

  /**
   * Do they feel emotionally safe with us?
   */
  get feelsSafe(): boolean {
    return this.emotionalSafetyIndex >= 60;
  }

  /**
   * Have we built meaningful shared history?
   */
  get hasSharedHistory(): boolean {
    return this.sharedHistoryDensity >= 20;
  }

  /**
   * Composite score for overall relationship health (0-100)
   */
  get overallHealthScore(): number {
    const weights = {
      vulnerability: 0.3,
      trustVelocity: 0.2,
      sharedHistory: 0.2,
      emotionalSafety: 0.3,
    };

    // Normalize trust velocity from [-10, 10] to [0, 100]
    const normalizedTrustVelocity = ((this.trustVelocity + 10) / 20) * 100;

    return Math.round(
      this.vulnerabilityScore * weights.vulnerability +
        normalizedTrustVelocity * weights.trustVelocity +
        this.sharedHistoryDensity * weights.sharedHistory +
        this.emotionalSafetyIndex * weights.emotionalSafety
    );
  }

  // ============================================================================
  // BEHAVIOR METHODS (SUPERHUMAN DECISION MAKING)
  // ============================================================================

  /**
   * Can we share content of this depth?
   *
   * SUPERHUMAN: We consider trust velocity and emotional safety,
   * not just the raw stage.
   */
  canHandle(depth: ShareDepth): boolean {
    const depthRequirements: Record<ShareDepth, RelationshipStage> = {
      surface: 'stranger',
      medium: 'acquaintance',
      deep: 'friend',
      sacred: 'trusted',
    };

    const requiredStage = depthRequirements[depth];
    const stageOrder: RelationshipStage[] = [
      'stranger',
      'acquaintance',
      'friend',
      'trusted',
      'intimate',
    ];
    const currentIndex = stageOrder.indexOf(this.stage);
    const requiredIndex = stageOrder.indexOf(requiredStage);

    // Basic stage check
    const meetsStageRequirement = currentIndex >= requiredIndex;

    // SUPERHUMAN: Additional nuance
    if (depth === 'deep' || depth === 'sacred') {
      // For deep content, also check emotional safety
      if (this.emotionalSafetyIndex < DEPTH_CONFIG.minSafetyForDeep) {
        return false;
      }

      // If trust is declining, be more cautious
      if (this.isTrustDeclining) {
        return false;
      }
    }

    return meetsStageRequirement;
  }

  /**
   * Should we proactively share insights?
   *
   * SUPERHUMAN: Proactive sharing requires growing trust and safety
   */
  shouldProactivelyShare(): boolean {
    return (
      this.trustVelocity >= DEPTH_CONFIG.proactiveShareTrustVelocity &&
      this.feelsSafe &&
      this.stage !== 'stranger'
    );
  }

  /**
   * How cautious should we be? (0-1, higher = more cautious)
   *
   * SUPERHUMAN: Calibrate caution based on multiple factors
   */
  getCautionLevel(): number {
    let caution = 0;

    // New relationships = more cautious
    if (this.stage === 'stranger') caution += 0.4;
    else if (this.stage === 'acquaintance') caution += 0.2;

    // Declining trust = much more cautious
    if (this.isTrustDeclining) caution += 0.3;

    // Low emotional safety = more cautious
    if (this.emotionalSafetyIndex < 40) caution += 0.2;
    else if (this.emotionalSafetyIndex < 60) caution += 0.1;

    // No shared history = more cautious about inside jokes
    if (!this.hasSharedHistory) caution += 0.1;

    return Math.min(1, caution);
  }

  /**
   * Get minimum required stage for a share depth
   */
  static getRequiredStage(depth: ShareDepth): RelationshipStage {
    const requirements: Record<ShareDepth, RelationshipStage> = {
      surface: 'stranger',
      medium: 'acquaintance',
      deep: 'friend',
      sacred: 'trusted',
    };
    return requirements[depth];
  }

  // ============================================================================
  // MUTATION METHODS (Return new instances)
  // ============================================================================

  /**
   * Record a vulnerability deposit (they shared something vulnerable)
   */
  withVulnerabilityDeposit(amount: number, isFirstTime: boolean = false): RelationshipDepth {
    const newVulnerabilityScore = Math.min(100, this.vulnerabilityScore + amount);
    const now = new Date();

    // Trust velocity increases when they share
    const newTrustVelocity = Math.min(10, this.trustVelocity + 0.5);

    // Emotional safety increases when they trust us
    const newSafetyIndex = Math.min(100, this.emotionalSafetyIndex + amount * 0.3);

    return new RelationshipDepth(
      newVulnerabilityScore,
      newTrustVelocity,
      this.sharedHistoryDensity,
      newSafetyIndex,
      this.firstVulnerableShareAt ?? now,
      now,
      isFirstTime ? this.firstTimeVulnerabilityCount + 1 : this.firstTimeVulnerabilityCount
    );
  }

  /**
   * Record a shared moment (inside joke, callback, shared experience)
   */
  withSharedMoment(value: number): RelationshipDepth {
    const newSharedHistoryDensity = Math.min(100, this.sharedHistoryDensity + value);
    return new RelationshipDepth(
      this.vulnerabilityScore,
      this.trustVelocity,
      newSharedHistoryDensity,
      this.emotionalSafetyIndex,
      this.firstVulnerableShareAt,
      this.lastVulnerableShareAt,
      this.firstTimeVulnerabilityCount
    );
  }

  /**
   * Record a trust signal (positive or negative interaction)
   */
  withTrustSignal(delta: number): RelationshipDepth {
    const newTrustVelocity = Math.max(-10, Math.min(10, this.trustVelocity + delta));

    // Safety index also affected by trust signals
    const safetyDelta = delta > 0 ? delta * 2 : delta * 3; // Negative hits harder
    const newSafetyIndex = Math.max(0, Math.min(100, this.emotionalSafetyIndex + safetyDelta));

    return new RelationshipDepth(
      this.vulnerabilityScore,
      newTrustVelocity,
      this.sharedHistoryDensity,
      newSafetyIndex,
      this.firstVulnerableShareAt,
      this.lastVulnerableShareAt,
      this.firstTimeVulnerabilityCount
    );
  }

  /**
   * Apply time decay (trust naturally decays without interaction)
   */
  withTimeDecay(daysSinceLastInteraction: number): RelationshipDepth {
    if (daysSinceLastInteraction <= 1) return this;

    // Trust velocity decays toward 0
    const velocityDecay = Math.sign(this.trustVelocity) * Math.min(Math.abs(this.trustVelocity), daysSinceLastInteraction * 0.1);
    const newTrustVelocity = this.trustVelocity - velocityDecay;

    // Shared history density doesn't decay (memories persist)
    // Emotional safety decays slightly
    const safetyDecay = Math.min(daysSinceLastInteraction * 0.5, this.emotionalSafetyIndex * 0.1);
    const newSafetyIndex = Math.max(30, this.emotionalSafetyIndex - safetyDecay);

    return new RelationshipDepth(
      this.vulnerabilityScore, // Doesn't decay - we remember their vulnerability
      newTrustVelocity,
      this.sharedHistoryDensity,
      newSafetyIndex,
      this.firstVulnerableShareAt,
      this.lastVulnerableShareAt,
      this.firstTimeVulnerabilityCount
    );
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

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
  } {
    return {
      vulnerabilityScore: this.vulnerabilityScore,
      trustVelocity: this.trustVelocity,
      sharedHistoryDensity: this.sharedHistoryDensity,
      emotionalSafetyIndex: this.emotionalSafetyIndex,
      firstVulnerableShareAt: this.firstVulnerableShareAt?.toISOString(),
      lastVulnerableShareAt: this.lastVulnerableShareAt?.toISOString(),
      firstTimeVulnerabilityCount: this.firstTimeVulnerabilityCount,
      // Computed fields for convenience in queries
      stage: this.stage,
      overallHealthScore: this.overallHealthScore,
    };
  }

  /**
   * Equality check
   */
  equals(other: RelationshipDepth): boolean {
    return (
      this.vulnerabilityScore === other.vulnerabilityScore &&
      this.trustVelocity === other.trustVelocity &&
      this.sharedHistoryDensity === other.sharedHistoryDensity &&
      this.emotionalSafetyIndex === other.emotionalSafetyIndex
    );
  }
}
