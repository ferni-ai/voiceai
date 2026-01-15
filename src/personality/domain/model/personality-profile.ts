/**
 * PersonalityProfile Aggregate Root
 *
 * The central domain entity that represents Ferni's understanding of a user.
 * This is the AGGREGATE ROOT - all personality operations go through here.
 *
 * SUPERHUMAN capabilities are embedded in behavior methods:
 * - Anticipating emotions before expressed
 * - Knowing when to share vs. listen
 * - Tracking vulnerability with nuance
 * - Celebrating growth they don't notice
 *
 * @module personality/domain/model/personality-profile
 */

import { EmotionalPattern, type PatternType, type PatternEvidence } from './emotional-pattern.js';
import { GrowthMilestone, type GrowthArea, type GrowthEvidence } from './growth-milestone.js';
import {
  VulnerabilityDeposit,
  type VulnerabilityLevel,
  type VulnerabilityCategory,
  type FirstTimeMarker,
} from './vulnerability-deposit.js';
import {
  RelationshipDepth,
  type ShareDepth,
  type RelationshipStage,
} from './value-objects/relationship-depth.js';
import {
  EmotionalState,
  type PrimaryEmotion,
  type GranularEmotion,
  type EmotionalTrajectory,
} from './value-objects/emotional-state.js';
import {
  AnticipatedEmotion,
  type AnticipationSignal,
} from './value-objects/anticipated-emotion.js';

/**
 * Personal moment that can be shared
 */
export interface PersonalMoment {
  id: string;
  personaId: string;
  topic: string;
  content: string;
  transitions: string[];
  depth: ShareDepth;
  triggers: {
    keywords: string[];
    emotions?: string[];
    topics?: string[];
  };
}

/**
 * Context for decision-making
 */
export interface ConversationContext {
  /** Current user message */
  message?: string;
  /** Partial transcript (for anticipation) */
  partialTranscript?: string;
  /** Detected topics */
  topics?: string[];
  /** Current time */
  currentTime?: Date;
  /** Mentioned people */
  mentionedPeople?: string[];
  /** Voice tone (if available) */
  voiceTone?: 'rising' | 'falling' | 'flat' | 'breaking';
  /** Silence duration (if applicable) */
  silenceDurationMs?: number;
  /** Session turn count */
  turnCount?: number;
  /** Time since last interaction */
  timeSinceLastInteraction?: number;
}

/**
 * Sharing decision result
 */
export interface SharingDecision {
  shouldShare: boolean;
  reason: string;
  moment?: PersonalMoment;
  suggestedTransition?: string;
  cautionLevel: number;
}

/**
 * Domain events emitted by the profile
 */
export type PersonalityDomainEvent =
  | { type: 'vulnerability_recorded'; deposit: VulnerabilityDeposit }
  | { type: 'pattern_detected'; pattern: EmotionalPattern }
  | { type: 'growth_milestone_ready'; milestone: GrowthMilestone }
  | { type: 'trust_declined'; previousStage: RelationshipStage; newStage: RelationshipStage }
  | { type: 'first_time_vulnerability'; deposit: VulnerabilityDeposit }
  | { type: 'emotional_trajectory_changed'; from: EmotionalTrajectory; to: EmotionalTrajectory };

/**
 * PersonalityProfile - The Aggregate Root
 *
 * Encapsulates all personality intelligence for a user.
 * All modifications go through this entity to maintain invariants.
 *
 * @example
 * ```typescript
 * const profile = PersonalityProfile.create('user_123', 'ferni');
 *
 * // Record vulnerability
 * profile.recordVulnerability({
 *   level: 'vulnerable',
 *   category: 'personal_struggle',
 *   summary: 'Shared about anxiety',
 *   content: 'I have panic attacks...',
 *   isFirstTime: true,
 * });
 *
 * // Check if we can share deep content
 * if (profile.canShareAtDepth('deep')) {
 *   const decision = profile.decideSharingMoment(moment, context);
 * }
 *
 * // Get anticipated emotion
 * const anticipated = profile.anticipateEmotion(context);
 * ```
 */
export class PersonalityProfile {
  /** Pending domain events to be published */
  private _domainEvents: PersonalityDomainEvent[] = [];

  private constructor(
    /** User ID */
    public readonly userId: string,
    /** Primary persona ID */
    public readonly personaId: string,
    /** Relationship depth tracking */
    private _relationshipDepth: RelationshipDepth,
    /** Current emotional state */
    private _currentEmotionalState: EmotionalState,
    /** Emotional history (recent) */
    private _emotionalHistory: EmotionalState[],
    /** Detected emotional patterns */
    private _emotionalPatterns: EmotionalPattern[],
    /** Vulnerability deposits */
    private _vulnerabilityDeposits: VulnerabilityDeposit[],
    /** Growth milestones */
    private _growthMilestones: GrowthMilestone[],
    /** Shared moments (what we've shared with them) */
    private _sharedMomentIds: Set<string>,
    /** Created timestamp */
    public readonly createdAt: Date,
    /** Last updated */
    private _updatedAt: Date,
    /** Last interaction */
    private _lastInteractionAt: Date
  ) {}

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new personality profile
   */
  static create(userId: string, personaId: string): PersonalityProfile {
    const now = new Date();
    return new PersonalityProfile(
      userId,
      personaId,
      RelationshipDepth.stranger(),
      EmotionalState.neutral(),
      [],
      [],
      [],
      [],
      new Set(),
      now,
      now,
      now
    );
  }

  /**
   * Reconstitute from persistence
   */
  static fromPersistence(data: {
    userId: string;
    personaId: string;
    relationshipDepth: ReturnType<RelationshipDepth['toPersistence']>;
    currentEmotionalState: ReturnType<EmotionalState['toPersistence']>;
    emotionalHistory: Array<ReturnType<EmotionalState['toPersistence']>>;
    emotionalPatterns: Array<ReturnType<EmotionalPattern['toPersistence']>>;
    vulnerabilityDeposits: Array<ReturnType<VulnerabilityDeposit['toPersistence']>>;
    growthMilestones: Array<ReturnType<GrowthMilestone['toPersistence']>>;
    sharedMomentIds: string[];
    createdAt: string;
    updatedAt: string;
    lastInteractionAt: string;
  }): PersonalityProfile {
    return new PersonalityProfile(
      data.userId,
      data.personaId,
      RelationshipDepth.fromPersistence(data.relationshipDepth),
      EmotionalState.fromPersistence(data.currentEmotionalState),
      data.emotionalHistory.map((e) => EmotionalState.fromPersistence(e)),
      data.emotionalPatterns.map((p) => EmotionalPattern.fromPersistence(p)),
      data.vulnerabilityDeposits.map((v) => VulnerabilityDeposit.fromPersistence(v)),
      data.growthMilestones.map((g) => GrowthMilestone.fromPersistence(g)),
      new Set(data.sharedMomentIds),
      new Date(data.createdAt),
      new Date(data.updatedAt),
      new Date(data.lastInteractionAt)
    );
  }

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /** Current relationship depth */
  get relationshipDepth(): RelationshipDepth {
    return this._relationshipDepth;
  }

  /** Current emotional state */
  get currentEmotionalState(): EmotionalState {
    return this._currentEmotionalState;
  }

  /** Recent emotional history */
  get emotionalHistory(): readonly EmotionalState[] {
    return [...this._emotionalHistory];
  }

  /** All patterns */
  get emotionalPatterns(): readonly EmotionalPattern[] {
    return [...this._emotionalPatterns];
  }

  /** All vulnerability deposits */
  get vulnerabilityDeposits(): readonly VulnerabilityDeposit[] {
    return [...this._vulnerabilityDeposits];
  }

  /** All growth milestones */
  get growthMilestones(): readonly GrowthMilestone[] {
    return [...this._growthMilestones];
  }

  /** Last updated */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /** Last interaction */
  get lastInteractionAt(): Date {
    return this._lastInteractionAt;
  }

  /** Current relationship stage */
  get relationshipStage(): RelationshipStage {
    return this._relationshipDepth.stage;
  }

  /** Pending domain events */
  get domainEvents(): readonly PersonalityDomainEvent[] {
    return [...this._domainEvents];
  }

  /**
   * Get open vulnerabilities needing follow-up
   */
  get openVulnerabilities(): readonly VulnerabilityDeposit[] {
    return this._vulnerabilityDeposits.filter((v) => v.needsFollowUp);
  }

  /**
   * Get urgent vulnerabilities
   */
  get urgentVulnerabilities(): readonly VulnerabilityDeposit[] {
    return this._vulnerabilityDeposits.filter((v) => v.isUrgentForFollowUp);
  }

  /**
   * Get patterns ready to surface
   */
  get surfaceablePatterns(): readonly EmotionalPattern[] {
    return this._emotionalPatterns.filter((p) => p.isReadyToSurface);
  }

  /**
   * Get milestones ready to celebrate
   */
  get celebratableMilestones(): readonly GrowthMilestone[] {
    return this._growthMilestones.filter((m) => m.isReadyToCelebrate);
  }

  /**
   * Is user currently in a crisis state?
   */
  get isInCrisis(): boolean {
    return this._currentEmotionalState.isCrisisLevel;
  }

  /**
   * Should we hold space (be silent)?
   */
  get shouldHoldSpace(): boolean {
    return this._currentEmotionalState.shouldHoldSpace;
  }

  // ============================================================================
  // SUPERHUMAN CAPABILITIES
  // ============================================================================

  /**
   * SUPERHUMAN: Anticipate emotion from partial input
   *
   * This is the core "Better Than Human" capability - understanding
   * what they're feeling BEFORE they finish expressing it.
   */
  anticipateEmotion(context: ConversationContext): AnticipatedEmotion | null {
    const signals: AnticipationSignal[] = [];
    let reasoning: string[] = [];

    // Check for partial speech signals
    if (context.partialTranscript) {
      const partial = context.partialTranscript.toLowerCase();

      // Reflective/sad signals
      if (/^(i've been thinking|i was wondering|remember when)/i.test(partial)) {
        signals.push('partial_speech');
        reasoning.push('Reflective phrase suggests processing something');
      }

      // Excitement signals
      if (/^(guess what|oh my god|you won't believe)/i.test(partial)) {
        signals.push('partial_speech');
        reasoning.push('Exclamatory opening suggests excitement');
      }

      // Vulnerability signals
      if (/^(i need to tell you|this is hard|i've never)/i.test(partial)) {
        signals.push('partial_speech');
        reasoning.push('Hesitant opening suggests vulnerability incoming');
      }
    }

    // Check voice tone
    if (context.voiceTone) {
      signals.push('tone_shift');
      const toneReasoningMap: Record<string, string> = {
        rising: 'Rising tone suggests anticipation or anxiety',
        falling: 'Falling tone suggests sadness or contemplation',
        flat: 'Flat tone suggests exhaustion or emotional numbness',
        breaking: 'Breaking voice indicates emotional overwhelm',
      };
      reasoning.push(toneReasoningMap[context.voiceTone] ?? '');
    }

    // Check historical patterns
    const matchingPatterns = this._emotionalPatterns.filter((p) => p.matchesTriggers(context));
    if (matchingPatterns.length > 0) {
      signals.push('historical_pattern');
      const bestPattern = matchingPatterns[0];
      if (bestPattern) {
        reasoning.push(`Historical pattern: ${bestPattern.description}`);

        return AnticipatedEmotion.fromPattern(
          bestPattern.id,
          bestPattern.resultingEmotion,
          bestPattern.resultingGranular,
          bestPattern.confidence,
          reasoning.join('; ')
        );
      }
    }

    // Need at least one signal to anticipate
    if (signals.length === 0) return null;

    // Determine anticipated emotion from signals
    let anticipatedEmotion: PrimaryEmotion = 'neutral';
    let anticipatedGranular: GranularEmotion | null = null;
    let confidence = 0.5;

    if (context.voiceTone === 'breaking') {
      anticipatedEmotion = 'sadness';
      anticipatedGranular = 'overwhelmed';
      confidence = 0.85;
    } else if (context.voiceTone === 'falling') {
      anticipatedEmotion = 'sadness';
      anticipatedGranular = 'melancholy';
      confidence = 0.7;
    } else if (context.voiceTone === 'rising') {
      anticipatedEmotion = 'anticipation';
      anticipatedGranular = 'nervous';
      confidence = 0.6;
    }

    return AnticipatedEmotion.create({
      emotion: anticipatedEmotion,
      granular: anticipatedGranular ?? undefined,
      confidence: confidence >= 0.7 ? 'likely' : 'possible',
      signals,
      reasoning: reasoning.join('; '),
      partialTranscript: context.partialTranscript,
    });
  }

  /**
   * Can we share content at this depth?
   */
  canShareAtDepth(depth: ShareDepth): boolean {
    return (
      this._relationshipDepth.canHandle(depth) &&
      this._currentEmotionalState.isAppropriateForSharing(depth)
    );
  }

  /**
   * Decide whether to share a personal moment
   */
  decideSharingMoment(moment: PersonalMoment, context: ConversationContext): SharingDecision {
    const cautionLevel = this._relationshipDepth.getCautionLevel();

    // Already shared this moment?
    if (this._sharedMomentIds.has(moment.id)) {
      return {
        shouldShare: false,
        reason: 'Already shared this moment with user',
        cautionLevel,
      };
    }

    // Crisis state = don't share
    if (this.isInCrisis) {
      return {
        shouldShare: false,
        reason: 'User is in crisis state - focus on them',
        cautionLevel,
      };
    }

    // Should hold space = don't share
    if (this.shouldHoldSpace) {
      return {
        shouldShare: false,
        reason: 'User needs space - not time for personal sharing',
        cautionLevel,
      };
    }

    // Check relationship depth
    if (!this.canShareAtDepth(moment.depth)) {
      return {
        shouldShare: false,
        reason: `Relationship not ready for ${moment.depth} content`,
        cautionLevel,
      };
    }

    // Check relevance to current context
    const isRelevant = this.checkMomentRelevance(moment, context);
    if (!isRelevant) {
      return {
        shouldShare: false,
        reason: 'Moment not relevant to current conversation',
        cautionLevel,
      };
    }

    // All checks passed!
    const transition =
      moment.transitions[Math.floor(Math.random() * moment.transitions.length)] ??
      moment.transitions[0] ??
      '';

    return {
      shouldShare: true,
      reason: 'Moment is relevant and relationship supports sharing',
      moment,
      suggestedTransition: transition,
      cautionLevel,
    };
  }

  /**
   * Check if a moment is relevant to context
   */
  private checkMomentRelevance(moment: PersonalMoment, context: ConversationContext): boolean {
    if (!context.topics && !context.message) return false;

    const contextTerms = [
      ...(context.topics ?? []),
      ...(context.message?.toLowerCase().split(/\s+/) ?? []),
    ];

    // Check keyword triggers
    const keywordMatch = moment.triggers.keywords.some((keyword) =>
      contextTerms.some((term) => term.includes(keyword.toLowerCase()))
    );

    // Check topic triggers
    const topicMatch =
      moment.triggers.topics?.some((topic) =>
        contextTerms.some((term) => term.includes(topic.toLowerCase()))
      ) ?? false;

    return keywordMatch || topicMatch;
  }

  // ============================================================================
  // MUTATION METHODS
  // ============================================================================

  /**
   * Record a vulnerability deposit
   */
  recordVulnerability(params: {
    level: VulnerabilityLevel;
    category: VulnerabilityCategory;
    summary: string;
    content: string;
    keywords?: string[];
    isFirstTime?: boolean;
    firstTimeMarkers?: FirstTimeMarker[];
    acknowledgment?: string;
  }): void {
    const deposit = VulnerabilityDeposit.create({
      userId: this.userId,
      personaId: this.personaId,
      ...params,
    });

    this._vulnerabilityDeposits.push(deposit);

    // Update relationship depth
    this._relationshipDepth = this._relationshipDepth.withVulnerabilityDeposit(
      deposit.trustImpact,
      params.isFirstTime
    );

    // Emit events
    this._domainEvents.push({ type: 'vulnerability_recorded', deposit });
    if (params.isFirstTime) {
      this._domainEvents.push({ type: 'first_time_vulnerability', deposit });
    }

    this.touch();
  }

  /**
   * Update current emotional state
   */
  updateEmotionalState(state: EmotionalState): void {
    const previousTrajectory = this._currentEmotionalState.trajectory;

    // Add to history
    this._emotionalHistory.push(this._currentEmotionalState);

    // Keep history bounded
    if (this._emotionalHistory.length > 50) {
      this._emotionalHistory = this._emotionalHistory.slice(-50);
    }

    // Update current state
    this._currentEmotionalState = state;

    // Check for trajectory change
    if (state.trajectory !== previousTrajectory) {
      this._domainEvents.push({
        type: 'emotional_trajectory_changed',
        from: previousTrajectory,
        to: state.trajectory,
      });
    }

    this.touch();
  }

  /**
   * Record pattern evidence
   */
  recordPatternEvidence(
    patternType: PatternType,
    description: string,
    triggers: string[],
    evidence: PatternEvidence
  ): void {
    // Find existing pattern
    let pattern = this._emotionalPatterns.find(
      (p) => p.patternType === patternType && p.triggers.some((t) => triggers.includes(t))
    );

    if (pattern) {
      pattern.addEvidence(evidence);
    } else {
      // Create new pattern
      pattern = EmotionalPattern.create({
        userId: this.userId,
        patternType,
        description,
        triggers,
        resultingEmotion: evidence.emotion,
        resultingGranular: evidence.granular,
      });
      pattern.addEvidence(evidence);
      this._emotionalPatterns.push(pattern);
    }

    // Emit event if pattern is now ready to surface
    if (pattern.isReadyToSurface && !pattern.surfaced) {
      this._domainEvents.push({ type: 'pattern_detected', pattern });
    }

    this.touch();
  }

  /**
   * Record growth evidence
   */
  recordGrowthEvidence(area: GrowthArea, evidence: GrowthEvidence): void {
    // Find existing milestone for this area
    let milestone = this._growthMilestones.find(
      (m) => m.area === area && !m.celebrated
    );

    if (milestone) {
      if (evidence.type === 'progress' || evidence.type === 'achievement') {
        milestone.addProgressEvidence(evidence);
      }
    } else if (evidence.type === 'baseline') {
      // Create new milestone
      milestone = GrowthMilestone.create({
        userId: this.userId,
        area,
        baselineEvidence: evidence,
      });
      this._growthMilestones.push(milestone);
    }

    // Emit event if milestone is ready to celebrate
    if (milestone?.isReadyToCelebrate) {
      this._domainEvents.push({ type: 'growth_milestone_ready', milestone });
    }

    this.touch();
  }

  /**
   * Mark a vulnerability as followed up
   */
  markVulnerabilityFollowedUp(
    depositId: string,
    response: 'positive' | 'neutral' | 'negative'
  ): void {
    const deposit = this._vulnerabilityDeposits.find((v) => v.id === depositId);
    if (deposit) {
      deposit.markFollowedUp(response);

      // Update trust based on response
      const trustDelta = response === 'positive' ? 1 : response === 'negative' ? -2 : 0;
      this._relationshipDepth = this._relationshipDepth.withTrustSignal(trustDelta);

      this.touch();
    }
  }

  /**
   * Mark a pattern as surfaced
   */
  markPatternSurfaced(patternId: string): void {
    const pattern = this._emotionalPatterns.find((p) => p.id === patternId);
    if (pattern) {
      pattern.markSurfaced();
      this.touch();
    }
  }

  /**
   * Mark a milestone as celebrated
   */
  markMilestoneCelebrated(milestoneId: string): void {
    const milestone = this._growthMilestones.find((m) => m.id === milestoneId);
    if (milestone) {
      milestone.markCelebrated();
      this.touch();
    }
  }

  /**
   * Record that we shared a moment
   */
  recordSharedMoment(momentId: string): void {
    this._sharedMomentIds.add(momentId);
    this._relationshipDepth = this._relationshipDepth.withSharedMoment(5);
    this.touch();
  }

  /**
   * Record a trust signal
   */
  recordTrustSignal(delta: number): void {
    const previousStage = this._relationshipDepth.stage;
    this._relationshipDepth = this._relationshipDepth.withTrustSignal(delta);

    // Check for stage decline
    if (
      delta < 0 &&
      this._relationshipDepth.stage !== previousStage &&
      ['stranger', 'acquaintance'].includes(this._relationshipDepth.stage) &&
      ['friend', 'trusted', 'intimate'].includes(previousStage)
    ) {
      this._domainEvents.push({
        type: 'trust_declined',
        previousStage,
        newStage: this._relationshipDepth.stage,
      });
    }

    this.touch();
  }

  /**
   * Apply time decay
   */
  applyTimeDecay(): void {
    const daysSinceInteraction = Math.floor(
      (Date.now() - this._lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceInteraction > 0) {
      this._relationshipDepth = this._relationshipDepth.withTimeDecay(daysSinceInteraction);
      this.touch();
    }
  }

  /**
   * Mark interaction
   */
  markInteraction(): void {
    this._lastInteractionAt = new Date();
    this.touch();
  }

  /**
   * Clear domain events (after publishing)
   */
  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  /**
   * Touch updated timestamp
   */
  private touch(): void {
    this._updatedAt = new Date();
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object for persistence
   */
  toPersistence(): {
    userId: string;
    personaId: string;
    relationshipDepth: ReturnType<RelationshipDepth['toPersistence']>;
    currentEmotionalState: ReturnType<EmotionalState['toPersistence']>;
    emotionalHistory: Array<ReturnType<EmotionalState['toPersistence']>>;
    emotionalPatterns: Array<ReturnType<EmotionalPattern['toPersistence']>>;
    vulnerabilityDeposits: Array<ReturnType<VulnerabilityDeposit['toPersistence']>>;
    growthMilestones: Array<ReturnType<GrowthMilestone['toPersistence']>>;
    sharedMomentIds: string[];
    createdAt: string;
    updatedAt: string;
    lastInteractionAt: string;
    // Computed fields for convenience
    relationshipStage: RelationshipStage;
    isInCrisis: boolean;
    openVulnerabilityCount: number;
    surfaceablePatternCount: number;
    celebratableMilestoneCount: number;
  } {
    return {
      userId: this.userId,
      personaId: this.personaId,
      relationshipDepth: this._relationshipDepth.toPersistence(),
      currentEmotionalState: this._currentEmotionalState.toPersistence(),
      emotionalHistory: this._emotionalHistory.map((e) => e.toPersistence()),
      emotionalPatterns: this._emotionalPatterns.map((p) => p.toPersistence()),
      vulnerabilityDeposits: this._vulnerabilityDeposits.map((v) => v.toPersistence()),
      growthMilestones: this._growthMilestones.map((g) => g.toPersistence()),
      sharedMomentIds: [...this._sharedMomentIds],
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      lastInteractionAt: this._lastInteractionAt.toISOString(),
      // Computed fields
      relationshipStage: this.relationshipStage,
      isInCrisis: this.isInCrisis,
      openVulnerabilityCount: this.openVulnerabilities.length,
      surfaceablePatternCount: this.surfaceablePatterns.length,
      celebratableMilestoneCount: this.celebratableMilestones.length,
    };
  }
}
