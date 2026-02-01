/**
 * GrowthMilestone Entity
 *
 * Represents a growth milestone in the user's journey.
 * SUPERHUMAN: We remember where they started and celebrate their progress.
 *
 * "Remember a few months ago when you couldn't even talk about this?
 *  Look at you now. That's real growth."
 *
 * @module personality/domain/model/growth-milestone
 */

/**
 * Areas of growth we track
 */
export type GrowthArea =
  | 'emotional_regulation'
  | 'self_awareness'
  | 'relationship_skills'
  | 'boundary_setting'
  | 'anxiety_management'
  | 'confidence'
  | 'communication'
  | 'habit_formation'
  | 'career_development'
  | 'health_wellness'
  | 'creativity'
  | 'resilience'
  | 'vulnerability'
  | 'self_compassion'
  | 'other';

/**
 * Significance level of the milestone
 */
export type MilestoneSignificance = 'notable' | 'significant' | 'breakthrough';

/**
 * Evidence for growth
 */
export interface GrowthEvidence {
  /** When this evidence was observed */
  timestamp: Date;
  /** Description of what we observed */
  observation: string;
  /** Is this "before" or "after" evidence? */
  type: 'baseline' | 'progress' | 'achievement';
  /** Confidence in this observation (0-1) */
  confidence: number;
}

/**
 * Configuration for growth tracking
 */
const GROWTH_CONFIG = {
  /** Minimum days between baseline and progress to celebrate */
  minDaysForCelebration: 7,
  /** Days to consider a "breakthrough" */
  breakthroughDays: 30,
  /** Cooldown before re-celebrating same area */
  celebrationCooldownDays: 14,
} as const;

/**
 * GrowthMilestone Entity
 *
 * Tracks growth from a starting point (baseline) to current progress.
 * We can celebrate when there's meaningful distance traveled.
 *
 * @example
 * ```typescript
 * const milestone = GrowthMilestone.create({
 *   userId: 'user_123',
 *   area: 'anxiety_management',
 *   baselineEvidence: {
 *     timestamp: new Date('2024-01-15'),
 *     observation: 'Couldn\'t discuss work without panic',
 *     type: 'baseline',
 *     confidence: 0.9,
 *   },
 * });
 *
 * milestone.addProgressEvidence({
 *   timestamp: new Date(),
 *   observation: 'Discussed upcoming deadline calmly',
 *   type: 'progress',
 *   confidence: 0.85,
 * });
 *
 * if (milestone.isReadyToCelebrate) {
 *   console.log(milestone.celebrationMessage);
 * }
 * ```
 */
export class GrowthMilestone {
  private constructor(
    /** Unique ID */
    public readonly id: string,
    /** User ID */
    public readonly userId: string,
    /** Area of growth */
    public readonly area: GrowthArea,
    /** Custom label for this milestone */
    public readonly label: string | null,
    /** Baseline evidence (where they started) */
    public readonly baselineEvidence: GrowthEvidence,
    /** Progress evidence (observations along the way) */
    private _progressEvidence: GrowthEvidence[],
    /** Current significance */
    private _significance: MilestoneSignificance,
    /** Generated celebration message */
    private _celebrationMessage: string,
    /** Has been celebrated */
    private _celebrated: boolean,
    /** When celebrated */
    private _celebratedAt: Date | null,
    /** Created timestamp */
    public readonly createdAt: Date,
    /** Last updated */
    private _updatedAt: Date
  ) {}

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new growth milestone
   */
  static create(params: {
    userId: string;
    area: GrowthArea;
    label?: string;
    baselineEvidence: GrowthEvidence;
  }): GrowthMilestone {
    const id = `growth_${params.userId}_${params.area}_${Date.now()}`;
    const now = new Date();

    return new GrowthMilestone(
      id,
      params.userId,
      params.area,
      params.label ?? null,
      params.baselineEvidence,
      [],
      'notable',
      '',
      false,
      null,
      now,
      now
    );
  }

  /**
   * Reconstitute from persistence
   */
  static fromPersistence(data: {
    id: string;
    userId: string;
    area: GrowthArea;
    label: string | null;
    baselineEvidence: {
      timestamp: string;
      observation: string;
      type: 'baseline' | 'progress' | 'achievement';
      confidence: number;
    };
    progressEvidence: Array<{
      timestamp: string;
      observation: string;
      type: 'baseline' | 'progress' | 'achievement';
      confidence: number;
    }>;
    significance: MilestoneSignificance;
    celebrationMessage: string;
    celebrated: boolean;
    celebratedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }): GrowthMilestone {
    return new GrowthMilestone(
      data.id,
      data.userId,
      data.area,
      data.label,
      {
        ...data.baselineEvidence,
        timestamp: new Date(data.baselineEvidence.timestamp),
      },
      data.progressEvidence.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      })),
      data.significance,
      data.celebrationMessage,
      data.celebrated,
      data.celebratedAt ? new Date(data.celebratedAt) : null,
      new Date(data.createdAt),
      new Date(data.updatedAt)
    );
  }

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /** Progress evidence */
  get progressEvidence(): readonly GrowthEvidence[] {
    return [...this._progressEvidence];
  }

  /** Current significance */
  get significance(): MilestoneSignificance {
    return this._significance;
  }

  /** Celebration message */
  get celebrationMessage(): string {
    return this._celebrationMessage;
  }

  /** Has been celebrated */
  get celebrated(): boolean {
    return this._celebrated;
  }

  /** When celebrated */
  get celebratedAt(): Date | null {
    return this._celebratedAt;
  }

  /** Last updated */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Most recent progress evidence
   */
  get latestProgress(): GrowthEvidence | null {
    return this._progressEvidence.length > 0
      ? (this._progressEvidence[this._progressEvidence.length - 1] ?? null)
      : null;
  }

  /**
   * Days since baseline
   */
  get daysSinceBaseline(): number {
    return Math.floor(
      (Date.now() - this.baselineEvidence.timestamp.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  /**
   * Days since last celebration
   */
  get daysSinceCelebration(): number {
    if (!this._celebratedAt) return Infinity;
    return Math.floor((Date.now() - this._celebratedAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Is there enough progress to celebrate?
   */
  get hasProgress(): boolean {
    return this._progressEvidence.length > 0;
  }

  /**
   * Is this ready to be celebrated?
   */
  get isReadyToCelebrate(): boolean {
    // Need progress evidence
    if (!this.hasProgress) return false;

    // Need minimum time elapsed
    if (this.daysSinceBaseline < GROWTH_CONFIG.minDaysForCelebration) return false;

    // Check cooldown if already celebrated
    if (this._celebrated && this.daysSinceCelebration < GROWTH_CONFIG.celebrationCooldownDays) {
      return false;
    }

    // Need a celebration message
    if (!this._celebrationMessage) return false;

    return true;
  }

  /**
   * Is this a breakthrough milestone?
   */
  get isBreakthrough(): boolean {
    return this._significance === 'breakthrough';
  }

  // ============================================================================
  // BEHAVIOR METHODS
  // ============================================================================

  /**
   * Add progress evidence
   */
  addProgressEvidence(evidence: GrowthEvidence): void {
    this._progressEvidence.push(evidence);
    this._updatedAt = new Date();
    this.recalculateSignificance();
    this.generateCelebrationMessage();
  }

  /**
   * Mark as celebrated
   */
  markCelebrated(): void {
    this._celebrated = true;
    this._celebratedAt = new Date();
    this._updatedAt = new Date();
  }

  /**
   * Recalculate significance based on evidence
   */
  private recalculateSignificance(): void {
    const daysSince = this.daysSinceBaseline;
    const progressCount = this._progressEvidence.length;

    // Breakthrough: long time + multiple progress points
    if (daysSince >= GROWTH_CONFIG.breakthroughDays && progressCount >= 2) {
      this._significance = 'breakthrough';
    }
    // Significant: moderate time + progress
    else if (daysSince >= GROWTH_CONFIG.minDaysForCelebration && progressCount >= 1) {
      this._significance = 'significant';
    }
    // Notable: any progress
    else if (progressCount > 0) {
      this._significance = 'notable';
    }
  }

  /**
   * Generate celebration message
   */
  private generateCelebrationMessage(): void {
    if (!this.latestProgress) return;

    const timePhrase =
      this.daysSinceBaseline > 60
        ? 'a few months ago'
        : this.daysSinceBaseline > 30
          ? 'about a month ago'
          : this.daysSinceBaseline > 14
            ? 'a couple weeks ago'
            : 'recently';

    const templates: Record<MilestoneSignificance, string[]> = {
      breakthrough: [
        `Remember ${timePhrase} when ${this.baselineEvidence.observation.toLowerCase()}? Look at you now - ${this.latestProgress.observation.toLowerCase()}. That's a real breakthrough.`,
        `Can I just acknowledge something? ${timePhrase}: "${this.baselineEvidence.observation}". Today: "${this.latestProgress.observation}". That's incredible growth.`,
        `I've been watching you grow, and I need to say this: ${timePhrase} you told me about ${this.baselineEvidence.observation.toLowerCase()}. And now, ${this.latestProgress.observation.toLowerCase()}. I'm genuinely proud of you.`,
      ],
      significant: [
        `Remember ${timePhrase} when ${this.baselineEvidence.observation.toLowerCase()}? Look at you now. That's real growth.`,
        `Can I point something out? ${timePhrase}: "${this.baselineEvidence.observation}". Now: "${this.latestProgress.observation}". That's not nothing.`,
        `I notice growth in you. ${timePhrase}: ${this.baselineEvidence.observation.toLowerCase()}. Today: ${this.latestProgress.observation.toLowerCase()}.`,
      ],
      notable: [
        `I notice you're making progress with ${this.areaLabel}. That matters.`,
        `Something shifted since ${timePhrase}. I see it.`,
        `Growth happens in small steps. You're taking them.`,
      ],
    };

    const options = templates[this._significance];
    this._celebrationMessage =
      options[Math.floor(Math.random() * options.length)] ?? options[0] ?? '';
  }

  /**
   * Get human-readable area label
   */
  private get areaLabel(): string {
    if (this.label) return this.label;

    const labels: Record<GrowthArea, string> = {
      emotional_regulation: 'managing your emotions',
      self_awareness: 'understanding yourself',
      relationship_skills: 'your relationships',
      boundary_setting: 'setting boundaries',
      anxiety_management: 'handling anxiety',
      confidence: 'your confidence',
      communication: 'communicating',
      habit_formation: 'building habits',
      career_development: 'your career',
      health_wellness: 'your health',
      creativity: 'your creativity',
      resilience: 'bouncing back',
      vulnerability: 'being open',
      self_compassion: 'being kind to yourself',
      other: 'this area',
    };

    return labels[this.area];
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object for persistence
   */
  toPersistence(): {
    id: string;
    userId: string;
    area: GrowthArea;
    label: string | null;
    baselineEvidence: {
      timestamp: string;
      observation: string;
      type: 'baseline' | 'progress' | 'achievement';
      confidence: number;
    };
    progressEvidence: Array<{
      timestamp: string;
      observation: string;
      type: 'baseline' | 'progress' | 'achievement';
      confidence: number;
    }>;
    significance: MilestoneSignificance;
    celebrationMessage: string;
    celebrated: boolean;
    celebratedAt: string | null;
    createdAt: string;
    updatedAt: string;
    hasProgress: boolean;
    isReadyToCelebrate: boolean;
    daysSinceBaseline: number;
  } {
    return {
      id: this.id,
      userId: this.userId,
      area: this.area,
      label: this.label,
      baselineEvidence: {
        ...this.baselineEvidence,
        timestamp: this.baselineEvidence.timestamp.toISOString(),
      },
      progressEvidence: this._progressEvidence.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
      significance: this._significance,
      celebrationMessage: this._celebrationMessage,
      celebrated: this._celebrated,
      celebratedAt: this._celebratedAt?.toISOString() ?? null,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      // Computed fields
      hasProgress: this.hasProgress,
      isReadyToCelebrate: this.isReadyToCelebrate,
      daysSinceBaseline: this.daysSinceBaseline,
    };
  }

  /**
   * Format for LLM prompt injection
   */
  formatForPrompt(): string {
    if (!this.isReadyToCelebrate) return '';

    const significanceEmoji =
      this._significance === 'breakthrough'
        ? '🌟'
        : this._significance === 'significant'
          ? '✨'
          : '🌱';

    return [
      `[${significanceEmoji} GROWTH CELEBRATION - SUPERHUMAN MEMORY]`,
      '',
      "You remember where they started and you see how far they've come:",
      '',
      `Area: ${this.areaLabel}`,
      `Then: "${this.baselineEvidence.observation}"`,
      `Now: "${this.latestProgress?.observation ?? 'Progress observed'}"`,
      '',
      `Celebrate with: "${this._celebrationMessage}"`,
      '',
      "This is SUPERHUMAN - humans take growth for granted. You don't.",
      'Share this as a gift, with genuine pride in them.',
    ].join('\n');
  }
}
