/**
 * Relationship Memory Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This engine tracks, learns from, and intelligently leverages relationship history.
 * Not just "I remember you mentioned X" but "We've been through a lot together."
 *
 * The goal: Make every returning user feel genuinely KNOWN.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  CallbackAttempt,
  CallbackEffectiveness,
  InsideJoke,
  InsideJokeSeed,
  RelationshipContext,
  RelationshipMemory,
  RelationshipMilestone,
  RelationshipMilestoneType,
  RelationshipPromptInjection,
  RelationshipStage,
  RelationshipStageConfig,
  SharedMoment,
  SharedMomentType,
  TemporalPattern,
} from './types.js';

const log = getLogger();

// ============================================================================
// RELATIONSHIP STAGE CONFIGURATIONS
// ============================================================================

export const RELATIONSHIP_STAGE_CONFIGS: Record<RelationshipStage, RelationshipStageConfig> = {
  stranger: {
    stage: 'stranger',
    minSessions: 0,
    minTrustScore: 0,
    accelerators: [],
    unlockedContent: {
      storyDepth: 'surface',
      directnessAllowed: 0.3,
      vulnerabilitySharing: false,
      insideJokesEnabled: false,
      protectiveResponses: false,
      metaRelationshipComments: false,
    },
  },
  acquaintance: {
    stage: 'acquaintance',
    minSessions: 3,
    minTrustScore: 0.2,
    accelerators: ['first_vulnerability_shared', 'first_real_laugh'],
    unlockedContent: {
      storyDepth: 'surface',
      directnessAllowed: 0.4,
      vulnerabilitySharing: false,
      insideJokesEnabled: false,
      protectiveResponses: false,
      metaRelationshipComments: false,
    },
  },
  friend: {
    stage: 'friend',
    minSessions: 10,
    minTrustScore: 0.5,
    accelerators: ['first_breakthrough', 'first_crisis_together', 'trust_level_friend'],
    unlockedContent: {
      storyDepth: 'personal',
      directnessAllowed: 0.6,
      vulnerabilitySharing: true,
      insideJokesEnabled: true,
      protectiveResponses: true,
      metaRelationshipComments: false,
    },
  },
  trusted_advisor: {
    stage: 'trusted_advisor',
    minSessions: 25,
    minTrustScore: 0.75,
    accelerators: ['first_inside_joke', 'trust_level_advisor', 'unlocked_vulnerable_stories'],
    unlockedContent: {
      storyDepth: 'vulnerable',
      directnessAllowed: 0.8,
      vulnerabilitySharing: true,
      insideJokesEnabled: true,
      protectiveResponses: true,
      metaRelationshipComments: true,
    },
  },
  inner_circle: {
    stage: 'inner_circle',
    minSessions: 50,
    minTrustScore: 0.9,
    accelerators: ['trust_level_inner_circle', 'one_year_anniversary'],
    unlockedContent: {
      storyDepth: 'deep_secrets',
      directnessAllowed: 0.95,
      vulnerabilitySharing: true,
      insideJokesEnabled: true,
      protectiveResponses: true,
      metaRelationshipComments: true,
    },
  },
};

// ============================================================================
// RELATIONSHIP MEMORY ENGINE CLASS
// ============================================================================

export class RelationshipMemoryEngine {
  private memory: RelationshipMemory;
  private userId: string;
  private personaId: string;

  constructor(userId: string, personaId: string, existingMemory?: RelationshipMemory) {
    this.userId = userId;
    this.personaId = personaId;
    this.memory = existingMemory || this.createNewMemory();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private createNewMemory(): RelationshipMemory {
    const now = new Date();
    return {
      userId: this.userId,
      personaId: this.personaId,
      stage: 'stranger',
      trustScore: 0,
      trustFactors: {
        sessionCount: 0,
        vulnerabilityShared: 0,
        callbacksLanded: 0,
        crisesTogether: 0,
        consistencyScore: 0,
      },
      sharedMoments: [],
      insideJokes: [],
      insideJokeSeeds: [],
      milestones: this.initializeMilestones(),
      callbackAttempts: [],
      callbackEffectiveness: [],
      temporalPatterns: this.initializeTemporalPatterns(),
      emotionalTrajectory: {
        recentSessions: [],
        trendDirection: 'stable',
        trendConfidence: 0,
        concerns: [],
        growthAreas: [],
      },
      firstConversation: now,
      lastConversation: now,
      totalSessions: 0,
      totalTurns: 0,
      updatedAt: now,
    };
  }

  private initializeMilestones(): RelationshipMilestone[] {
    const milestoneTypes: RelationshipMilestoneType[] = [
      'session_10',
      'session_25',
      'session_50',
      'session_100',
      'session_365',
      'first_vulnerability_shared',
      'first_real_laugh',
      'first_disagreement',
      'first_breakthrough',
      'first_crisis_together',
      'first_callback_landed',
      'first_inside_joke',
      'trust_level_friend',
      'trust_level_advisor',
      'trust_level_inner_circle',
      'unlocked_personal_stories',
      'unlocked_vulnerable_stories',
      'unlocked_deep_secrets',
      'one_month_anniversary',
      'three_month_anniversary',
      'six_month_anniversary',
      'one_year_anniversary',
    ];

    return milestoneTypes.map((type) => ({
      type,
      reached: false,
      acknowledged: false,
    }));
  }

  private initializeTemporalPatterns(): TemporalPattern {
    return {
      dayOfWeekFrequency: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 0,
        sunday: 0,
      },
      timeOfDayFrequency: {
        early_morning: 0,
        morning: 0,
        afternoon: 0,
        evening: 0,
        late_night: 0,
      },
      topicsByTime: {},
      moodByDayOfWeek: {},
      averageSessionLength: 0,
      sessionsPerWeek: 0,
      typicalGapDays: 0,
      longestGap: 0,
    };
  }

  // ============================================================================
  // CONTEXT GENERATION (For LLM prompt injection)
  // ============================================================================

  /**
   * Get current relationship context for prompt injection
   */
  getRelationshipContext(): RelationshipContext {
    const now = new Date();
    const daysSince = this.daysBetween(this.memory.lastConversation, now);
    const stageConfig = RELATIONSHIP_STAGE_CONFIGS[this.memory.stage];

    return {
      stage: this.memory.stage,
      trustScore: this.memory.trustScore,
      recentMoments: this.getRecentMoments(5),
      activeInsideJokes: this.getActiveInsideJokes(),
      pendingMilestones: this.getPendingMilestones(),
      effectiveCallbacks: this.getEffectiveCallbacks(),
      trajectory: this.memory.emotionalTrajectory.trendDirection,
      timeContext: {
        dayOfWeek: this.getDayOfWeek(now),
        timeOfDay: this.getTimeOfDay(now),
        isTypicalTime: this.isTypicalTime(now),
        daysSinceLastConversation: daysSince,
      },
      unlockedContent: stageConfig.unlockedContent,
    };
  }

  /**
   * Generate prompt injection for relationship-aware responses
   */
  buildPromptInjection(): RelationshipPromptInjection {
    const context = this.getRelationshipContext();
    const stageConfig = RELATIONSHIP_STAGE_CONFIGS[context.stage];

    // Build relationship preamble
    let preamble = `[RELATIONSHIP CONTEXT]\n`;
    preamble += `Stage: ${context.stage} (Trust: ${Math.round(context.trustScore * 100)}%)\n`;
    preamble += `Sessions together: ${this.memory.totalSessions}\n`;

    if (context.timeContext.daysSinceLastConversation > 7) {
      preamble += `Note: Haven't talked in ${context.timeContext.daysSinceLastConversation} days - acknowledge this warmly.\n`;
    }

    if (context.trajectory === 'declining') {
      preamble += `IMPORTANT: User seems to be struggling lately. Lead with presence, not solutions.\n`;
    } else if (context.trajectory === 'improving') {
      preamble += `Note: User has been doing better lately - acknowledge their growth.\n`;
    }

    // Callback suggestions
    const callbackSuggestions: string[] = [];
    for (const moment of context.recentMoments.slice(0, 3)) {
      if (moment.callbackCount < 3 && moment.significance > 0.6) {
        callbackSuggestions.push(
          `Reference: "${moment.summary}" (from ${this.formatTimeAgo(moment.timestamp)})`
        );
      }
    }

    // Inside joke options
    const insideJokeOptions: string[] = [];
    for (const joke of context.activeInsideJokes) {
      if (joke.resonanceScore > 0.6) {
        insideJokeOptions.push(`"${joke.trigger}" → "${joke.reference}"`);
      }
    }

    // Trajectory notes
    let trajectoryNotes = '';
    if (this.memory.emotionalTrajectory.concerns.length > 0) {
      const unaddressed = this.memory.emotionalTrajectory.concerns.filter((c) => !c.addressed);
      if (unaddressed.length > 0) {
        trajectoryNotes = `Concerns noticed: ${unaddressed.map((c) => c.concern).join(', ')}`;
      }
    }
    if (this.memory.emotionalTrajectory.growthAreas.length > 0) {
      const recent = this.memory.emotionalTrajectory.growthAreas.slice(-2);
      trajectoryNotes += `\nGrowth areas: ${recent.map((g) => g.area).join(', ')}`;
    }

    // Stage-appropriate guidance
    const stageGuidance = this.getStageGuidance(context.stage, stageConfig);

    // Pending acknowledgments
    const pendingAcknowledgments: string[] = [];
    for (const milestone of context.pendingMilestones) {
      pendingAcknowledgments.push(this.getMilestoneAcknowledgment(milestone.type));
    }

    return {
      relationshipPreamble: preamble,
      callbackSuggestions,
      insideJokeOptions,
      trajectoryNotes,
      stageGuidance,
      pendingAcknowledgments,
    };
  }

  private getStageGuidance(stage: RelationshipStage, config: RelationshipStageConfig): string {
    const guidanceByStage: Record<RelationshipStage, string> = {
      stranger:
        'Building initial rapport. Be warm but not overly familiar. Focus on understanding who they are.',
      acquaintance:
        'Rapport growing. Can reference past conversations. Start noticing patterns in what they share.',
      friend:
        'Real connection established. Can be more direct. Share appropriate personal stories. Inside jokes can emerge.',
      trusted_advisor:
        'Deep trust earned. Can lovingly push back. Share vulnerable stories. Reference our history together.',
      inner_circle:
        'Like family. Full directness allowed. Can comment on our relationship itself. Share your own struggles.',
    };

    let guidance = guidanceByStage[stage];

    if (config.unlockedContent.protectiveResponses) {
      guidance += ' You can defend them to themselves when they are too harsh on themselves.';
    }

    if (config.unlockedContent.metaRelationshipComments) {
      guidance += ' You can comment on our relationship ("We have come a long way together").';
    }

    return guidance;
  }

  // ============================================================================
  // MOMENT RECORDING
  // ============================================================================

  /**
   * Record a new shared moment
   */
  recordMoment(
    type: SharedMomentType,
    summary: string,
    options: {
      topic?: string;
      userPhrase?: string;
      ourResponse?: string;
      significance?: number;
      tags?: string[];
    } = {}
  ): SharedMoment {
    const moment: SharedMoment = {
      id: `moment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date(),
      sessionNumber: this.memory.totalSessions,
      summary,
      topic: options.topic,
      userPhrase: options.userPhrase,
      ourResponse: options.ourResponse,
      significance: options.significance ?? 0.5,
      callbackCount: 0,
      tags: options.tags ?? [],
    };

    this.memory.sharedMoments.push(moment);

    // Check if this triggers a milestone
    this.checkMomentMilestones(type);

    // Update trust score
    this.updateTrustScore();

    log.debug({ momentType: type, userId: this.userId }, 'Recorded shared moment');

    return moment;
  }

  /**
   * Record a callback attempt and its outcome
   */
  recordCallbackAttempt(
    reference: string,
    type: CallbackAttempt['type'],
    userResponse: CallbackAttempt['userResponse'],
    threadContinued: boolean,
    context: string
  ): void {
    const attempt: CallbackAttempt = {
      reference,
      type,
      timestamp: new Date(),
      userResponse,
      threadContinued,
      context,
    };

    this.memory.callbackAttempts.push(attempt);

    // Update effectiveness
    this.updateCallbackEffectiveness(reference, attempt);

    // Update trust if callback landed well
    if (userResponse === 'positive' || userResponse === 'engaged') {
      this.memory.trustFactors.callbacksLanded++;
      this.checkMilestone('first_callback_landed');
    }

    // Update moment callback count if this was referencing a moment
    if (type === 'moment') {
      const moment = this.memory.sharedMoments.find(
        (m) => m.summary.includes(reference) || m.userPhrase?.includes(reference)
      );
      if (moment) {
        moment.callbackCount++;
        moment.lastCallback = new Date();
      }
    }
  }

  // ============================================================================
  // INSIDE JOKES
  // ============================================================================

  /**
   * Record a potential inside joke seed
   */
  recordInsideJokeSeed(
    phrase: string,
    context: string,
    userEngagement: InsideJokeSeed['userEngagement']
  ): void {
    // Don't record if relationship isn't deep enough
    if (
      !RELATIONSHIP_STAGE_CONFIGS[this.memory.stage].unlockedContent.insideJokesEnabled &&
      this.memory.stage !== 'friend'
    ) {
      return;
    }

    const seed: InsideJokeSeed = {
      phrase,
      context,
      sessionNumber: this.memory.totalSessions,
      timestamp: new Date(),
      potentialScore: userEngagement === 'high' ? 0.8 : userEngagement === 'medium' ? 0.5 : 0.2,
      userEngagement,
    };

    this.memory.insideJokeSeeds.push(seed);

    // Check if any seed should graduate to a real inside joke
    this.evaluateInsideJokeSeeds();
  }

  /**
   * Evaluate seeds and graduate promising ones
   */
  private evaluateInsideJokeSeeds(): InsideJoke[] {
    const graduated: InsideJoke[] = [];

    // Find seeds that have been referenced multiple times with high engagement
    const seedsByPhrase = new Map<string, InsideJokeSeed[]>();
    for (const seed of this.memory.insideJokeSeeds) {
      const existing = seedsByPhrase.get(seed.phrase) || [];
      existing.push(seed);
      seedsByPhrase.set(seed.phrase, existing);
    }

    for (const [phrase, seeds] of seedsByPhrase) {
      // Need at least 2 high-engagement mentions to become a joke
      const highEngagement = seeds.filter((s) => s.userEngagement === 'high');
      if (highEngagement.length >= 2) {
        const firstSeed = seeds[0];

        // Check if we already have this joke
        if (!this.memory.insideJokes.some((j) => j.trigger === phrase)) {
          const joke: InsideJoke = {
            id: `joke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            trigger: phrase,
            reference: this.generateJokeReference(phrase, firstSeed.context),
            origin: firstSeed.context,
            createdAt: new Date(),
            originSession: firstSeed.sessionNumber,
            usageCount: 0,
            resonanceScore: 0.7,
            status: 'emerging',
          };

          this.memory.insideJokes.push(joke);
          graduated.push(joke);

          // Check milestone
          this.checkMilestone('first_inside_joke');

          log.info({ phrase, userId: this.userId }, 'Inside joke graduated from seed');
        }
      }
    }

    return graduated;
  }

  private generateJokeReference(trigger: string, context: string): string {
    // Generate a natural callback reference
    return `Remember "${trigger}"? ${context.slice(0, 50)}...`;
  }

  /**
   * Record usage of an inside joke
   */
  recordInsideJokeUsage(jokeId: string, userResponse: InsideJoke['typicalResponse']): void {
    const joke = this.memory.insideJokes.find((j) => j.id === jokeId);
    if (!joke) return;

    joke.usageCount++;
    joke.lastUsed = new Date();
    joke.typicalResponse = userResponse;

    // Update resonance score based on response
    const resonanceChange =
      userResponse === 'laugh'
        ? 0.1
        : userResponse === 'engage'
          ? 0.05
          : userResponse === 'ignore'
            ? -0.1
            : 0;
    joke.resonanceScore = Math.max(0, Math.min(1, joke.resonanceScore + resonanceChange));

    // Update status based on usage
    if (joke.usageCount > 10 && joke.resonanceScore > 0.7) {
      joke.status = 'established';
    } else if (joke.usageCount > 30) {
      joke.status = 'legacy';
    }

    // Retire jokes that aren't landing
    if (joke.resonanceScore < 0.3 && joke.usageCount > 5) {
      joke.status = 'retired';
    }
  }

  // ============================================================================
  // SESSION PROCESSING
  // ============================================================================

  /**
   * Start a new session - updates temporal patterns
   */
  startSession(): void {
    const now = new Date();
    const dayOfWeek = this.getDayOfWeek(
      now
    ).toLowerCase() as keyof TemporalPattern['dayOfWeekFrequency'];
    const timeOfDay = this.getTimeOfDay(now) as keyof TemporalPattern['timeOfDayFrequency'];

    this.memory.temporalPatterns.dayOfWeekFrequency[dayOfWeek]++;
    this.memory.temporalPatterns.timeOfDayFrequency[timeOfDay]++;

    // Update gap tracking
    const gap = this.daysBetween(this.memory.lastConversation, now);
    if (gap > this.memory.temporalPatterns.longestGap) {
      this.memory.temporalPatterns.longestGap = gap;
    }

    this.memory.totalSessions++;
    this.memory.lastConversation = now;

    // Check session milestones
    this.checkSessionMilestones();

    // Check anniversary milestones
    this.checkAnniversaryMilestones();
  }

  /**
   * End session - finalize updates
   */
  endSession(
    sessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis',
    sessionEnergy: 'high' | 'medium' | 'low',
    topics: string[]
  ): void {
    // Add to emotional trajectory
    this.memory.emotionalTrajectory.recentSessions.push({
      sessionNumber: this.memory.totalSessions,
      date: new Date(),
      overallMood: sessionMood,
      energyLevel: sessionEnergy,
      topics,
    });

    // Keep only last 20 sessions
    if (this.memory.emotionalTrajectory.recentSessions.length > 20) {
      this.memory.emotionalTrajectory.recentSessions.shift();
    }

    // Update trajectory
    this.updateEmotionalTrajectory();

    // Update relationship stage
    this.evaluateStageProgression();

    this.memory.updatedAt = new Date();
  }

  // ============================================================================
  // TRUST & STAGE MANAGEMENT
  // ============================================================================

  private updateTrustScore(): void {
    const factors = this.memory.trustFactors;

    // Weighted trust calculation
    const sessionWeight = Math.min(factors.sessionCount / 50, 1) * 0.25;
    const vulnerabilityWeight = Math.min(factors.vulnerabilityShared / 10, 1) * 0.3;
    const callbackWeight = Math.min(factors.callbacksLanded / 20, 1) * 0.15;
    const crisisWeight = Math.min(factors.crisesTogether / 3, 1) * 0.2;
    const consistencyWeight = factors.consistencyScore * 0.1;

    this.memory.trustScore =
      sessionWeight + vulnerabilityWeight + callbackWeight + crisisWeight + consistencyWeight;
  }

  private evaluateStageProgression(): void {
    const currentStage = this.memory.stage;
    const stages: RelationshipStage[] = [
      'stranger',
      'acquaintance',
      'friend',
      'trusted_advisor',
      'inner_circle',
    ];
    const currentIndex = stages.indexOf(currentStage);

    if (currentIndex < stages.length - 1) {
      const nextStage = stages[currentIndex + 1];
      const nextConfig = RELATIONSHIP_STAGE_CONFIGS[nextStage];

      // Check if we meet requirements for next stage
      const meetsSessionReq = this.memory.totalSessions >= nextConfig.minSessions;
      const meetsTrustReq = this.memory.trustScore >= nextConfig.minTrustScore;
      const hasAccelerator = nextConfig.accelerators.some((acc) =>
        this.memory.milestones.find((m) => m.type === acc && m.reached)
      );

      if (meetsSessionReq && meetsTrustReq) {
        this.memory.stage = nextStage;
        log.info(
          { from: currentStage, to: nextStage, userId: this.userId },
          'Relationship stage progressed'
        );
      } else if (hasAccelerator && this.memory.trustScore >= nextConfig.minTrustScore * 0.8) {
        // Accelerators can allow stage progression with 80% of normal trust
        this.memory.stage = nextStage;
        log.info(
          { from: currentStage, to: nextStage, accelerated: true, userId: this.userId },
          'Relationship stage accelerated'
        );
      }
    }
  }

  // ============================================================================
  // MILESTONE TRACKING
  // ============================================================================

  private checkMilestone(type: RelationshipMilestoneType): boolean {
    const milestone = this.memory.milestones.find((m) => m.type === type);
    if (milestone && !milestone.reached) {
      milestone.reached = true;
      milestone.reachedAt = new Date();
      log.info({ milestone: type, userId: this.userId }, 'Relationship milestone reached');
      return true;
    }
    return false;
  }

  private checkMomentMilestones(momentType: SharedMomentType): void {
    const mappings: Partial<Record<SharedMomentType, RelationshipMilestoneType>> = {
      first_vulnerability: 'first_vulnerability_shared',
      laughter: 'first_real_laugh',
      disagreement_resolved: 'first_disagreement',
      breakthrough: 'first_breakthrough',
      crisis_support: 'first_crisis_together',
    };

    const milestoneType = mappings[momentType];
    if (milestoneType) {
      this.checkMilestone(milestoneType);
    }

    // Update trust factors for specific moments
    if (momentType === 'first_vulnerability' || momentType === 'trust_demonstration') {
      this.memory.trustFactors.vulnerabilityShared++;
    }
    if (momentType === 'crisis_support') {
      this.memory.trustFactors.crisesTogether++;
    }
  }

  private checkSessionMilestones(): void {
    const sessionMilestones: Record<number, RelationshipMilestoneType> = {
      10: 'session_10',
      25: 'session_25',
      50: 'session_50',
      100: 'session_100',
      365: 'session_365',
    };

    const milestone = sessionMilestones[this.memory.totalSessions];
    if (milestone) {
      this.checkMilestone(milestone);
    }
  }

  private checkAnniversaryMilestones(): void {
    const firstDate = this.memory.firstConversation;
    const now = new Date();
    const monthsElapsed =
      (now.getFullYear() - firstDate.getFullYear()) * 12 + (now.getMonth() - firstDate.getMonth());

    if (monthsElapsed >= 1) this.checkMilestone('one_month_anniversary');
    if (monthsElapsed >= 3) this.checkMilestone('three_month_anniversary');
    if (monthsElapsed >= 6) this.checkMilestone('six_month_anniversary');
    if (monthsElapsed >= 12) this.checkMilestone('one_year_anniversary');
  }

  // ============================================================================
  // EMOTIONAL TRAJECTORY
  // ============================================================================

  private updateEmotionalTrajectory(): void {
    const recent = this.memory.emotionalTrajectory.recentSessions;
    if (recent.length < 3) {
      this.memory.emotionalTrajectory.trendDirection = 'stable';
      this.memory.emotionalTrajectory.trendConfidence = 0.3;
      return;
    }

    // Score moods
    const moodScores: Record<string, number> = {
      positive: 3,
      neutral: 2,
      struggling: 1,
      crisis: 0,
    };

    const recentScores = recent.slice(-5).map((s) => moodScores[s.overallMood]);
    const oldScores = recent.slice(-10, -5).map((s) => moodScores[s.overallMood]);

    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const oldAvg =
      oldScores.length > 0 ? oldScores.reduce((a, b) => a + b, 0) / oldScores.length : recentAvg;

    const diff = recentAvg - oldAvg;

    if (diff > 0.5) {
      this.memory.emotionalTrajectory.trendDirection = 'improving';
    } else if (diff < -0.5) {
      this.memory.emotionalTrajectory.trendDirection = 'declining';
    } else if (Math.abs(diff) < 0.2) {
      this.memory.emotionalTrajectory.trendDirection = 'stable';
    } else {
      this.memory.emotionalTrajectory.trendDirection = 'variable';
    }

    this.memory.emotionalTrajectory.trendConfidence = Math.min(recent.length / 10, 1);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getRecentMoments(count: number): SharedMoment[] {
    return [...this.memory.sharedMoments]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, count);
  }

  private getActiveInsideJokes(): InsideJoke[] {
    return this.memory.insideJokes.filter((j) => j.status !== 'retired' && j.resonanceScore > 0.4);
  }

  private getPendingMilestones(): RelationshipMilestone[] {
    return this.memory.milestones.filter((m) => m.reached && !m.acknowledged);
  }

  private getEffectiveCallbacks(): CallbackEffectiveness[] {
    return this.memory.callbackEffectiveness.filter(
      (c) => c.recommendation === 'use_more' || c.recommendation === 'use_occasionally'
    );
  }

  private updateCallbackEffectiveness(reference: string, attempt: CallbackAttempt): void {
    let effectiveness = this.memory.callbackEffectiveness.find((e) => e.reference === reference);

    if (!effectiveness) {
      effectiveness = {
        reference,
        totalAttempts: 0,
        positiveResponses: 0,
        successRate: 0,
        lastAttempt: new Date(),
        recommendation: 'use_occasionally',
      };
      this.memory.callbackEffectiveness.push(effectiveness);
    }

    effectiveness.totalAttempts++;
    if (attempt.userResponse === 'positive' || attempt.userResponse === 'engaged') {
      effectiveness.positiveResponses++;
    }
    effectiveness.successRate = effectiveness.positiveResponses / effectiveness.totalAttempts;
    effectiveness.lastAttempt = new Date();

    // Update recommendation
    if (effectiveness.successRate > 0.7 && effectiveness.totalAttempts >= 3) {
      effectiveness.recommendation = 'use_more';
    } else if (effectiveness.successRate > 0.4) {
      effectiveness.recommendation = 'use_occasionally';
    } else if (effectiveness.successRate > 0.2) {
      effectiveness.recommendation = 'use_sparingly';
    } else if (effectiveness.totalAttempts >= 5) {
      effectiveness.recommendation = 'retire';
    }
  }

  private daysBetween(date1: Date, date2: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor(Math.abs(date2.getTime() - date1.getTime()) / msPerDay);
  }

  private getDayOfWeek(date: Date): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }

  private getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    if (hour < 6) return 'late_night';
    if (hour < 9) return 'early_morning';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'late_night';
  }

  private isTypicalTime(date: Date): boolean {
    const timeOfDay = this.getTimeOfDay(date) as keyof TemporalPattern['timeOfDayFrequency'];
    const freq = this.memory.temporalPatterns.timeOfDayFrequency[timeOfDay];
    const total = Object.values(this.memory.temporalPatterns.timeOfDayFrequency).reduce(
      (a, b) => a + b,
      0
    );
    return total > 0 && freq / total > 0.2;
  }

  private formatTimeAgo(date: Date): string {
    const days = this.daysBetween(date, new Date());
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }

  private getMilestoneAcknowledgment(type: RelationshipMilestoneType): string {
    const acknowledgments: Partial<Record<RelationshipMilestoneType, string>> = {
      session_10: 'This is our tenth conversation. It means something.',
      session_25: "Twenty-five conversations. We've built something.",
      session_50: "Fifty conversations. You're basically stuck with me now.",
      session_100: "A hundred conversations. We're old friends at this point.",
      first_vulnerability_shared: 'Thank you for trusting me with that. It means something.',
      first_real_laugh: "There's that laugh. I was wondering when I'd hear it.",
      first_breakthrough: 'That was a real breakthrough. I saw it happen.',
      one_month_anniversary: "It's been a month since we started talking. Time flies.",
      six_month_anniversary: "Six months together. Look how far we've come.",
      one_year_anniversary: "A whole year. We've been through a lot together.",
    };
    return acknowledgments[type] || `Milestone: ${type}`;
  }

  // ============================================================================
  // STATE ACCESS
  // ============================================================================

  getMemory(): RelationshipMemory {
    return this.memory;
  }

  getStage(): RelationshipStage {
    return this.memory.stage;
  }

  getTrustScore(): number {
    return this.memory.trustScore;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

const engines = new Map<string, RelationshipMemoryEngine>();

/**
 * Get or create a relationship memory engine for a user-persona pair
 */
export function getRelationshipEngine(
  userId: string,
  personaId: string,
  existingMemory?: RelationshipMemory
): RelationshipMemoryEngine {
  const key = `${userId}:${personaId}`;
  let engine = engines.get(key);

  if (!engine) {
    engine = new RelationshipMemoryEngine(userId, personaId, existingMemory);
    engines.set(key, engine);
  }

  return engine;
}

/**
 * Clear a relationship engine (for cleanup)
 */
export function clearRelationshipEngine(userId: string, personaId: string): void {
  const key = `${userId}:${personaId}`;
  engines.delete(key);
}

export default RelationshipMemoryEngine;
