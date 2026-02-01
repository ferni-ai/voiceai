/**
 * Relationship Engine
 *
 * > "Every interaction is part of an ongoing relationship, not a one-time transaction."
 *
 * Manages relationship state and progression between Ferni and users.
 * Implements Core Principle #2: Relationship Over Transaction
 *
 * Responsibilities:
 * - Track relationship stage progression
 * - Record and retrieve shared moments
 * - Calculate callback opportunities
 * - Provide relationship context for prompts
 *
 * @module intelligence/relationship
 */

import { createLogger } from '../../utils/safe-logger.js';
import { generateId } from '../../utils/id-generator.js';
import {
  loadRelationshipMemory,
  saveRelationshipMemory,
  createDefaultMemory,
} from './persistence.js';
import {
  type CallbackAttempt,
  type CallbackEffectiveness,
  type CallbackOpportunity,
  type CallbackResponse,
  type InsideJoke,
  type Milestone,
  type MilestoneType,
  type MomentDetails,
  type RelationshipContext,
  type RelationshipMemory,
  type RelationshipStage,
  type SessionMood,
  type SessionStartResult,
  type SharedMoment,
  type SharedMomentType,
  STAGE_CONFIGS,
} from './types.js';

const log = createLogger({ module: 'RelationshipEngine' });

// ============================================================================
// STAGE PROGRESSION THRESHOLDS
// ============================================================================

const STAGE_ORDER: RelationshipStage[] = [
  'stranger',
  'acquaintance',
  'friend',
  'trusted',
  'confidant',
];

// ============================================================================
// ENGINE INSTANCE CACHE
// ============================================================================

const engineCache = new Map<string, RelationshipEngine>();

/**
 * Get or create a RelationshipEngine for a user-persona pair
 */
export function getRelationshipEngine(
  userId: string,
  personaId: string
): RelationshipEngine | undefined {
  const key = `${userId}_${personaId}`;
  return engineCache.get(key);
}

/**
 * Initialize relationship for a session
 */
export async function initializeRelationship(
  userId: string,
  personaId: string
): Promise<RelationshipEngine> {
  const key = `${userId}_${personaId}`;

  // Check cache first
  let engine = engineCache.get(key);
  if (engine) {
    return engine;
  }

  // Load from persistence or create new
  const memory = await loadRelationshipMemory(userId, personaId);
  engine = new RelationshipEngine(userId, personaId, memory);
  engineCache.set(key, engine);

  log.debug({ userId, personaId, isNew: !memory }, 'Initialized relationship engine');
  return engine;
}

/**
 * Clear engine from cache (for testing or cleanup)
 */
export function clearRelationshipEngine(userId: string, personaId: string): void {
  const key = `${userId}_${personaId}`;
  engineCache.delete(key);
}

/**
 * Clear all cached engines
 */
export function clearAllRelationshipEngines(): void {
  engineCache.clear();
}

// ============================================================================
// RELATIONSHIP ENGINE CLASS
// ============================================================================

export class RelationshipEngine {
  private memory: RelationshipMemory;
  private sessionStarted = false;
  private dirty = false; // Track if changes need persisting

  constructor(
    private readonly userId: string,
    private readonly personaId: string,
    existingMemory?: RelationshipMemory | null
  ) {
    this.memory = existingMemory ?? createDefaultMemory(userId, personaId);
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * Start a new session - increments counters, checks milestones
   */
  startSession(): SessionStartResult {
    if (this.sessionStarted) {
      log.warn('Session already started, returning existing state');
      return this.getSessionState();
    }

    this.sessionStarted = true;
    const previousStage = this.memory.stage;
    const now = new Date();

    // Calculate days since last session
    const daysSinceLastSession = Math.floor(
      (now.getTime() - this.memory.lastSessionAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Increment session count
    this.memory.totalSessions += 1;
    this.memory.lastSessionAt = now;
    this.dirty = true;

    // Check for stage advancement
    const stageAdvanced = this.checkStageAdvancement();

    // Check for milestone
    const milestone = this.checkSessionMilestones();

    log.info(
      {
        userId: this.userId,
        sessionNumber: this.memory.totalSessions,
        stage: this.memory.stage,
        stageAdvanced,
        milestone: milestone?.type,
      },
      'Session started'
    );

    return {
      isReturningUser: this.memory.totalSessions > 1,
      daysSinceLastSession,
      milestone,
      stageAdvanced,
      previousStage: stageAdvanced ? previousStage : undefined,
      currentStage: this.memory.stage,
    };
  }

  private getSessionState(): SessionStartResult {
    const daysSinceLastSession = Math.floor(
      (Date.now() - this.memory.lastSessionAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      isReturningUser: this.memory.totalSessions > 1,
      daysSinceLastSession,
      stageAdvanced: false,
      currentStage: this.memory.stage,
    };
  }

  /**
   * End session and persist changes
   */
  async endSession(mood: SessionMood, topics: string[]): Promise<void> {
    // Add to emotional trajectory
    this.memory.emotionalTrajectory.recentSessions.push({
      sessionNumber: this.memory.totalSessions,
      date: new Date(),
      mood,
      topics,
    });

    // Keep only last 20 sessions in trajectory
    if (this.memory.emotionalTrajectory.recentSessions.length > 20) {
      this.memory.emotionalTrajectory.recentSessions =
        this.memory.emotionalTrajectory.recentSessions.slice(-20);
    }

    // Update trajectory analysis
    this.updateTrajectoryAnalysis();

    // Update timestamp
    this.memory.updatedAt = new Date();
    this.dirty = true;

    // Persist to Firestore
    await this.persist();

    log.info(
      {
        userId: this.userId,
        sessionNumber: this.memory.totalSessions,
        mood,
        topicsCount: topics.length,
      },
      'Session ended'
    );
  }

  // ============================================================================
  // MOMENT RECORDING
  // ============================================================================

  /**
   * Record a shared moment
   */
  recordMoment(type: SharedMomentType, summary: string, details?: MomentDetails): SharedMoment {
    const moment: SharedMoment = {
      id: generateId(),
      type,
      summary,
      sessionNumber: this.memory.totalSessions,
      timestamp: new Date(),
      userPhrase: details?.userPhrase,
      significance: details?.significance ?? 0.5,
      topic: details?.topic,
      callbackCount: 0,
    };

    this.memory.sharedMoments.push(moment);
    this.dirty = true;

    // Check for moment-related milestones
    this.checkMomentMilestones(type);

    // Increase trust score for significant moments
    if (moment.significance > 0.7) {
      this.memory.trustScore = Math.min(1, this.memory.trustScore + 0.02);
    }

    log.debug({ type, summary, significance: moment.significance }, 'Recorded shared moment');
    return moment;
  }

  // ============================================================================
  // INSIDE JOKES
  // ============================================================================

  /**
   * Register a new inside joke
   */
  registerInsideJoke(trigger: string, reference: string, origin: string): InsideJoke {
    const joke: InsideJoke = {
      id: generateId(),
      trigger,
      reference,
      origin,
      createdAt: new Date(),
      originSession: this.memory.totalSessions,
      usageCount: 0,
      resonanceScore: 0.5,
      status: 'emerging',
    };

    this.memory.insideJokes.push(joke);
    this.dirty = true;

    // Check milestone
    this.markMilestone('first_inside_joke');

    log.debug({ trigger }, 'Registered inside joke');
    return joke;
  }

  /**
   * Record inside joke usage and response
   */
  recordJokeUsage(jokeId: string, resonated: boolean): void {
    const joke = this.memory.insideJokes.find((j) => j.id === jokeId);
    if (!joke) return;

    joke.usageCount += 1;
    joke.lastUsed = new Date();

    // Update resonance score with decay
    joke.resonanceScore = joke.resonanceScore * 0.8 + (resonated ? 0.2 : 0);

    // Update status based on usage
    if (joke.usageCount >= 5 && joke.resonanceScore > 0.6) {
      joke.status = 'established';
    } else if (joke.usageCount >= 10 && joke.resonanceScore < 0.3) {
      joke.status = 'retired';
    }

    this.dirty = true;
  }

  // ============================================================================
  // CALLBACK TRACKING
  // ============================================================================

  /**
   * Record a callback attempt and its effectiveness
   */
  recordCallbackAttempt(
    reference: string,
    type: CallbackAttempt['type'],
    userResponse: CallbackResponse,
    threadContinued: boolean
  ): void {
    const attempt: CallbackAttempt = {
      reference,
      type,
      timestamp: new Date(),
      userResponse,
      threadContinued,
    };

    this.memory.callbackAttempts.push(attempt);

    // Keep only last 100 callback attempts
    if (this.memory.callbackAttempts.length > 100) {
      this.memory.callbackAttempts = this.memory.callbackAttempts.slice(-100);
    }

    // Check milestone
    if (userResponse === 'positive' || userResponse === 'engaged') {
      this.markMilestone('first_callback_landed');
      this.memory.trustScore = Math.min(1, this.memory.trustScore + 0.01);
    }

    this.dirty = true;
    log.debug({ reference, userResponse, threadContinued }, 'Recorded callback attempt');
  }

  /**
   * Get callback opportunity based on current context
   */
  getCallbackOpportunity(currentTopic?: string): CallbackOpportunity | null {
    // Get recent effective callbacks
    const effectiveness = this.calculateCallbackEffectiveness();

    // Get moments related to current topic
    const relevantMoments = currentTopic
      ? this.memory.sharedMoments.filter(
          (m) =>
            m.topic?.toLowerCase().includes(currentTopic.toLowerCase()) ||
            m.summary.toLowerCase().includes(currentTopic.toLowerCase())
        )
      : this.memory.sharedMoments;

    // Find a good callback candidate
    for (const moment of relevantMoments.slice(-10).reverse()) {
      const eff = effectiveness.find((e) => e.reference === moment.id);
      const shouldSurface =
        // Don't callback too often
        !moment.lastCallback ||
        Date.now() - moment.lastCallback.getTime() > 7 * 24 * 60 * 60 * 1000;

      if (shouldSurface && moment.significance > 0.5) {
        return {
          type: 'moment',
          reference: moment.id,
          summary: moment.summary,
          confidence: moment.significance * (eff?.successRate ?? 0.5),
          shouldSurface: true,
          suggestedPhrase: moment.userPhrase
            ? `Remember when you told me "${moment.userPhrase}"?`
            : `I remember when ${moment.summary.toLowerCase()}.`,
        };
      }
    }

    // Check inside jokes
    const activeJokes = this.memory.insideJokes.filter(
      (j) => j.status === 'established' && j.resonanceScore > 0.5
    );

    if (activeJokes.length > 0 && Math.random() < 0.2) {
      const joke = activeJokes[Math.floor(Math.random() * activeJokes.length)];
      const recentlyUsed = joke.lastUsed && Date.now() - joke.lastUsed.getTime() < 3600000;

      if (!recentlyUsed) {
        return {
          type: 'joke',
          reference: joke.id,
          summary: joke.reference,
          confidence: joke.resonanceScore,
          shouldSurface: true,
          suggestedPhrase: joke.reference,
        };
      }
    }

    return null;
  }

  private calculateCallbackEffectiveness(): CallbackEffectiveness[] {
    const byReference = new Map<string, { total: number; positive: number; lastAttempt: Date }>();

    for (const attempt of this.memory.callbackAttempts) {
      const existing = byReference.get(attempt.reference) ?? {
        total: 0,
        positive: 0,
        lastAttempt: attempt.timestamp,
      };

      existing.total += 1;
      if (attempt.userResponse === 'positive' || attempt.userResponse === 'engaged') {
        existing.positive += 1;
      }
      if (attempt.timestamp > existing.lastAttempt) {
        existing.lastAttempt = attempt.timestamp;
      }

      byReference.set(attempt.reference, existing);
    }

    return Array.from(byReference.entries()).map(([reference, data]) => {
      const successRate = data.total > 0 ? data.positive / data.total : 0.5;
      let recommendation: CallbackEffectiveness['recommendation'] = 'use_occasionally';

      if (successRate > 0.7) recommendation = 'use_more';
      else if (successRate < 0.3 && data.total >= 3) recommendation = 'retire';
      else if (successRate < 0.5) recommendation = 'use_sparingly';

      return {
        reference,
        totalAttempts: data.total,
        positiveResponses: data.positive,
        successRate,
        lastAttempt: data.lastAttempt,
        recommendation,
      };
    });
  }

  // ============================================================================
  // CONTEXT BUILDING
  // ============================================================================

  /**
   * Build relationship context for LLM prompts
   */
  buildRelationshipContext(): RelationshipContext {
    const stageConfig = STAGE_CONFIGS[this.memory.stage];
    const daysSinceLastSession = Math.floor(
      (Date.now() - this.memory.lastSessionAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get recent significant moments
    const recentMoments = this.memory.sharedMoments.filter((m) => m.significance > 0.5).slice(-5);

    // Get active inside jokes
    const activeJokes = this.memory.insideJokes.filter(
      (j) => j.status === 'established' || j.status === 'emerging'
    );

    // Get pending milestones
    const pendingMilestones = this.memory.milestones.filter((m) => m.reached && !m.acknowledged);

    // Get effective callbacks
    const effectiveCallbacks = this.calculateCallbackEffectiveness().filter(
      (c) => c.recommendation === 'use_more' || c.recommendation === 'use_occasionally'
    );

    // Get active concerns
    const activeConcerns = this.memory.emotionalTrajectory.concerns.filter((c) => !c.addressed);

    return {
      stage: this.memory.stage,
      trustScore: this.memory.trustScore,
      totalSessions: this.memory.totalSessions,
      daysSinceLastSession,
      recentMoments,
      activeInsideJokes: activeJokes,
      pendingMilestones,
      effectiveCallbacks,
      trajectoryDirection: this.memory.emotionalTrajectory.trendDirection,
      activeConcerns,
      unlockedContent: stageConfig.unlockedContent,
    };
  }

  // ============================================================================
  // STAGE & MILESTONE MANAGEMENT
  // ============================================================================

  private checkStageAdvancement(): boolean {
    const currentIndex = STAGE_ORDER.indexOf(this.memory.stage);
    if (currentIndex >= STAGE_ORDER.length - 1) return false;

    const nextStage = STAGE_ORDER[currentIndex + 1];
    const config = STAGE_CONFIGS[nextStage];

    if (
      this.memory.totalSessions >= config.minSessions &&
      this.memory.trustScore >= config.minTrustScore
    ) {
      this.memory.stage = nextStage;
      this.dirty = true;

      // Mark stage milestone
      const milestoneMap: Partial<Record<RelationshipStage, MilestoneType>> = {
        friend: 'reached_friend',
        trusted: 'reached_trusted',
        confidant: 'reached_confidant',
      };

      const milestone = milestoneMap[nextStage];
      if (milestone) {
        this.markMilestone(milestone);
      }

      log.info({ previousStage: STAGE_ORDER[currentIndex], newStage: nextStage }, 'Stage advanced');
      return true;
    }

    return false;
  }

  private checkSessionMilestones(): SessionStartResult['milestone'] | undefined {
    const sessionMilestones: Array<{ sessions: number; type: MilestoneType; message: string }> = [
      { sessions: 10, type: 'session_10', message: 'This is our 10th conversation!' },
      { sessions: 25, type: 'session_25', message: '25 conversations together!' },
      { sessions: 50, type: 'session_50', message: "50 conversations - look how far we've come!" },
      { sessions: 100, type: 'session_100', message: '100 conversations! What a journey.' },
    ];

    for (const milestone of sessionMilestones) {
      if (this.memory.totalSessions === milestone.sessions) {
        this.markMilestone(milestone.type);
        return { type: milestone.type, message: milestone.message };
      }
    }

    // Check time-based milestones
    const firstSession = this.memory.firstSessionAt;
    const now = new Date();
    const daysSinceFirst = Math.floor(
      (now.getTime() - firstSession.getTime()) / (1000 * 60 * 60 * 24)
    );

    const timeMilestones: Array<{ days: number; type: MilestoneType; message: string }> = [
      { days: 30, type: 'one_month', message: "It's been a month since we started talking!" },
      { days: 90, type: 'three_months', message: 'Three months together!' },
      { days: 180, type: 'six_months', message: 'Half a year of growing together!' },
      { days: 365, type: 'one_year', message: 'One year anniversary! This is special.' },
    ];

    for (const milestone of timeMilestones) {
      const existing = this.memory.milestones.find((m) => m.type === milestone.type);
      if (!existing?.reached && daysSinceFirst >= milestone.days) {
        this.markMilestone(milestone.type);
        return { type: milestone.type, message: milestone.message };
      }
    }

    return undefined;
  }

  private checkMomentMilestones(momentType: SharedMomentType): void {
    const momentMilestoneMap: Partial<Record<SharedMomentType, MilestoneType>> = {
      vulnerability: 'first_vulnerability', // Tracks first time user was vulnerable
      laughter: 'first_laugh',
      breakthrough: 'first_breakthrough',
      crisis_support: 'first_crisis_support',
    };

    const milestone = momentMilestoneMap[momentType];
    if (milestone) {
      this.markMilestone(milestone);
    }
  }

  private markMilestone(type: MilestoneType): void {
    const milestone = this.memory.milestones.find((m) => m.type === type);
    if (milestone && !milestone.reached) {
      milestone.reached = true;
      milestone.reachedAt = new Date();
      this.dirty = true;
      log.debug({ type }, 'Milestone reached');
    }
  }

  /**
   * Acknowledge a milestone (after mentioning it to user)
   */
  acknowledgeMilestone(type: MilestoneType): void {
    const milestone = this.memory.milestones.find((m) => m.type === type);
    if (milestone && milestone.reached && !milestone.acknowledged) {
      milestone.acknowledged = true;
      milestone.acknowledgedAt = new Date();
      this.dirty = true;
    }
  }

  // ============================================================================
  // TRAJECTORY ANALYSIS
  // ============================================================================

  private updateTrajectoryAnalysis(): void {
    const recent = this.memory.emotionalTrajectory.recentSessions.slice(-5);
    if (recent.length < 3) {
      this.memory.emotionalTrajectory.trendDirection = 'stable';
      this.memory.emotionalTrajectory.trendConfidence = 0.3;
      return;
    }

    // Calculate mood scores
    const moodScores: Record<SessionMood, number> = {
      positive: 3,
      neutral: 2,
      struggling: 1,
      crisis: 0,
    };

    const scores = recent.map((s) => moodScores[s.mood]);
    const avgRecent = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const avgOlder =
      scores.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, scores.length - 3);

    const diff = avgRecent - avgOlder;

    if (diff > 0.5) {
      this.memory.emotionalTrajectory.trendDirection = 'improving';
    } else if (diff < -0.5) {
      this.memory.emotionalTrajectory.trendDirection = 'declining';
    } else {
      // Check for high variance
      const variance =
        scores.reduce((sum, s) => sum + Math.pow(s - avgRecent, 2), 0) / scores.length;
      this.memory.emotionalTrajectory.trendDirection = variance > 0.5 ? 'variable' : 'stable';
    }

    this.memory.emotionalTrajectory.trendConfidence = Math.min(1, recent.length / 5);
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async persist(): Promise<void> {
    if (!this.dirty) return;

    try {
      await saveRelationshipMemory(this.memory);
      this.dirty = false;
      log.debug({ userId: this.userId }, 'Relationship memory persisted');
    } catch (error) {
      log.error({ error, userId: this.userId }, 'Failed to persist relationship memory');
      throw error;
    }
  }

  // ============================================================================
  // ACCESSORS
  // ============================================================================

  get stage(): RelationshipStage {
    return this.memory.stage;
  }

  get trust(): number {
    return this.memory.trustScore;
  }

  get sessions(): number {
    return this.memory.totalSessions;
  }

  getMemory(): Readonly<RelationshipMemory> {
    return this.memory;
  }
}
