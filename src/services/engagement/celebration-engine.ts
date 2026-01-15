/**
 * Celebration Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: systematically celebrating wins that
 * humans often minimize or forget. A human friend might say "that's cool"
 * and move on. Ferni CELEBRATES.
 *
 * Types of celebration:
 * 1. **Goal Completion**: Major achievement - you did it!
 * 2. **Milestone Reached**: Progress marker on the journey
 * 3. **Streak Achievement**: Consistency deserves recognition
 * 4. **Growth Recognition**: "Look how far you've come"
 * 5. **Effort Recognition**: Showing up matters, even without results
 * 6. **Relationship Milestone**: Our journey together
 * 7. **First-Time Achievement**: Doing something new
 * 8. **Breakthrough Moment**: An insight or realization
 *
 * Philosophy:
 * - Celebrate IMMEDIATELY when detected
 * - Celebrate PROPORTIONALLY to the achievement
 * - Celebrate PERSONALLY with specific details
 * - Never feel performative - genuine joy
 *
 * @module CelebrationEngine
 */

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { humanizationSignalEmitter } from '../humanization/humanization-signal-emitter.js';

const log = createLogger({ module: 'CelebrationEngine' });

// ============================================================================
// TYPES
// ============================================================================

export type CelebrationType =
  | 'goal_completed'
  | 'milestone_reached'
  | 'streak_achieved'
  | 'growth_recognized'
  | 'effort_recognized'
  | 'relationship_milestone'
  | 'first_time'
  | 'breakthrough';

export type CelebrationIntensity = 'subtle' | 'warm' | 'enthusiastic' | 'ecstatic';

export interface CelebrationTrigger {
  id: string;
  type: CelebrationType;
  userId: string;
  personaId: string;

  /** What specifically happened */
  achievement: string;

  /** Why this matters */
  significance: string;

  /** Specific evidence/details */
  evidence: string[];

  /** How big is this? */
  intensity: CelebrationIntensity;

  /** Timestamp */
  detectedAt: Date;

  /** Context for personalization */
  context?: {
    goalName?: string;
    streakDays?: number;
    milestoneName?: string;
    previousStruggle?: string;
    timeframe?: string;
    comparisonToStart?: string;
  };
}

export interface CelebrationResponse {
  /** The celebration message */
  message: string;

  /** SSML version with prosody */
  ssml: string;

  /** Suggested emoji expression for avatar */
  expression: 'delight' | 'pride' | 'warmth' | 'excited' | 'celebrating';

  /** Should we pause before delivering? */
  pauseBeforeMs: number;

  /** Energy level for delivery */
  energy: 'calm' | 'warm' | 'bright' | 'exuberant';
}

export interface CelebrationRecord {
  triggerId: string;
  type: CelebrationType;
  userId: string;
  celebratedAt: Date;
  userReaction?: 'positive' | 'neutral' | 'dismissed';
  messageDelivered: string;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Phrases that indicate goal completion */
const GOAL_COMPLETION_PATTERNS = [
  /i (did it|finished|completed|accomplished)/i,
  /finally (did|finished|completed)/i,
  /i ('ve|have) (done|finished|completed)/i,
  /(got|passed|achieved) (my|the) (goal|certification|degree|exam)/i,
  /made it (to|through)/i,
  /reached (my|the) (goal|target)/i,
];

/** Phrases that indicate a streak */
const STREAK_PATTERNS = [
  /(\d+) (days?|weeks?|months?) (in a row|straight|consecutive)/i,
  /haven'?t missed (a day|once)/i,
  /(every|each) (single )?(day|morning|evening)/i,
  /kept (it )?up for/i,
  /streak of (\d+)/i,
];

/** Phrases that indicate growth/progress */
const GROWTH_PATTERNS = [
  /i (used to|couldn'?t|never could)/i,
  /now i (can|do|am)/i,
  /compared to (before|last|when i started)/i,
  /i'?ve (grown|improved|gotten better)/i,
  /not as (hard|scary|difficult) (as|anymore)/i,
  /easier (now|than before)/i,
];

/** Phrases that indicate effort */
const EFFORT_PATTERNS = [
  /i (tried|showed up|did my best)/i,
  /even though (i|it) (didn'?t|wasn'?t)/i,
  /at least i/i,
  /i made (myself|an effort|the effort)/i,
  /pushed (through|myself)/i,
];

/** Phrases that indicate breakthrough/insight */
const BREAKTHROUGH_PATTERNS = [
  /i (just )?realized/i,
  /it (hit|clicked|dawned on) me/i,
  /i (finally )?(understand|get it|see)/i,
  /everything makes sense/i,
  /i never (thought of|saw) it that way/i,
  /oh my (god|gosh)/i,
  /wait[,.]* (i think|maybe)/i,
];

/** Phrases that indicate first-time achievement */
const FIRST_TIME_PATTERNS = [
  /first time (i'?ve?|ever)/i,
  /never (done|did|had) (this|that) before/i,
  /my first/i,
  /brand new/i,
  /just (learned|started|began)/i,
];

// ============================================================================
// CELEBRATION ENGINE
// ============================================================================

export class CelebrationEngine {
  private userId: string;
  private personaId: string;
  private celebrationHistory: CelebrationRecord[] = [];
  private lastCelebrationTurn = 0;
  private celebrationCooldown = 3; // Minimum turns between celebrations

  constructor(userId: string, personaId: string) {
    this.userId = userId;
    this.personaId = personaId;
  }

  // ==========================================================================
  // DETECTION
  // ==========================================================================

  /**
   * Detect celebration opportunities from user message
   */
  detectCelebration(
    userMessage: string,
    turnCount: number,
    context?: {
      activeGoals?: Array<{ id: string; title: string; progress: number }>;
      currentStreak?: { days: number; habit: string };
      profile?: UserProfile;
    }
  ): CelebrationTrigger | null {
    // Cooldown check
    if (turnCount - this.lastCelebrationTurn < this.celebrationCooldown) {
      return null;
    }

    const lowered = userMessage.toLowerCase();

    // Priority 1: Goal completion (explicit)
    if (GOAL_COMPLETION_PATTERNS.some((p) => p.test(userMessage))) {
      const goalMatch = context?.activeGoals?.find(
        (g) => g.progress >= 90 || lowered.includes(g.title.toLowerCase())
      );

      return this.createTrigger('goal_completed', {
        achievement: goalMatch ? `Completed "${goalMatch.title}"` : 'Achieved their goal',
        significance: 'Major accomplishment that took real dedication',
        evidence: [userMessage],
        intensity: 'enthusiastic',
        context: { goalName: goalMatch?.title },
      });
    }

    // Priority 2: Breakthrough moment
    if (BREAKTHROUGH_PATTERNS.some((p) => p.test(userMessage))) {
      return this.createTrigger('breakthrough', {
        achievement: 'Had a breakthrough realization',
        significance: 'Moments of insight are rare and valuable',
        evidence: [userMessage],
        intensity: 'warm',
      });
    }

    // Priority 3: Streak achievement
    const streakMatch = userMessage.match(/(\d+)\s*(days?|weeks?|months?)/i);
    if (STREAK_PATTERNS.some((p) => p.test(userMessage)) && streakMatch) {
      const count = parseInt(streakMatch[1], 10);
      const unit = streakMatch[2];
      const intensity = count >= 30 ? 'enthusiastic' : count >= 7 ? 'warm' : 'subtle';

      return this.createTrigger('streak_achieved', {
        achievement: `${count} ${unit} streak`,
        significance: 'Consistency is the foundation of lasting change',
        evidence: [userMessage],
        intensity,
        context: { streakDays: count },
      });
    }

    // Priority 4: Growth recognition
    if (GROWTH_PATTERNS.some((p) => p.test(userMessage))) {
      return this.createTrigger('growth_recognized', {
        achievement: 'Recognized their own growth',
        significance: 'Self-awareness of growth is powerful',
        evidence: [userMessage],
        intensity: 'warm',
      });
    }

    // Priority 5: First-time achievement
    if (FIRST_TIME_PATTERNS.some((p) => p.test(userMessage))) {
      return this.createTrigger('first_time', {
        achievement: 'Did something for the first time',
        significance: 'Every journey begins with a first step',
        evidence: [userMessage],
        intensity: 'warm',
      });
    }

    // Priority 6: Effort recognition (even without success)
    if (EFFORT_PATTERNS.some((p) => p.test(userMessage))) {
      return this.createTrigger('effort_recognized', {
        achievement: 'Made an effort',
        significance: 'Showing up matters, regardless of outcome',
        evidence: [userMessage],
        intensity: 'subtle',
      });
    }

    return null;
  }

  /**
   * Create a trigger with defaults
   */
  private createTrigger(
    type: CelebrationType,
    data: {
      achievement: string;
      significance: string;
      evidence: string[];
      intensity: CelebrationIntensity;
      context?: CelebrationTrigger['context'];
    }
  ): CelebrationTrigger {
    return {
      id: `cel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      userId: this.userId,
      personaId: this.personaId,
      achievement: data.achievement,
      significance: data.significance,
      evidence: data.evidence,
      intensity: data.intensity,
      detectedAt: new Date(),
      context: data.context,
    };
  }

  // ==========================================================================
  // CELEBRATION GENERATION
  // ==========================================================================

  /**
   * Generate celebration response for a trigger
   */
  generateCelebration(trigger: CelebrationTrigger): CelebrationResponse {
    const templates = this.getCelebrationTemplates(trigger.type, trigger.intensity);
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Personalize the template
    let message = template;
    if (trigger.context?.goalName) {
      message = message.replace('{goal}', trigger.context.goalName);
    }
    if (trigger.context?.streakDays) {
      message = message.replace('{days}', trigger.context.streakDays.toString());
    }
    if (trigger.context?.milestoneName) {
      message = message.replace('{milestone}', trigger.context.milestoneName);
    }

    // Build SSML
    const ssml = this.buildCelebrationSSML(message, trigger.intensity);

    // Map to response
    const response: CelebrationResponse = {
      message,
      ssml,
      expression: this.getExpression(trigger.type, trigger.intensity),
      pauseBeforeMs: trigger.intensity === 'ecstatic' ? 500 : 200,
      energy: this.getEnergy(trigger.intensity),
    };

    // Record
    this.lastCelebrationTurn = Date.now();
    this.celebrationHistory.push({
      triggerId: trigger.id,
      type: trigger.type,
      userId: this.userId,
      celebratedAt: new Date(),
      messageDelivered: message,
    });

    // Emit signal for frontend
    void humanizationSignalEmitter.breakthrough(trigger.intensity === 'ecstatic' ? 1 : 0.7);

    log.info({ type: trigger.type, intensity: trigger.intensity }, '🎉 Celebration generated');

    return response;
  }

  /**
   * Get celebration templates by type and intensity
   */
  private getCelebrationTemplates(
    type: CelebrationType,
    intensity: CelebrationIntensity
  ): string[] {
    const templates: Record<CelebrationType, Record<CelebrationIntensity, string[]>> = {
      goal_completed: {
        subtle: ["You did it. That's real.", 'Goal achieved. Well done.'],
        warm: [
          "You actually did it. I'm proud of you.",
          "That's not nothing. That's everything. You finished.",
          'You set out to do something and you did it. Let that sink in.',
        ],
        enthusiastic: [
          "WAIT. You did it?! You actually did it! I'm so proud of you!",
          'Hold on. Let me just... you FINISHED. This is huge!',
          'Stop everything. You completed {goal}! Do you realize what you just did?',
        ],
        ecstatic: [
          "OH MY GOD YOU DID IT! I literally can't contain myself right now!",
          'STOP. STOP. You have to let me celebrate this with you! You actually DID it!',
        ],
      },
      milestone_reached: {
        subtle: ['Another step forward. Nice.', 'Progress. Keep going.'],
        warm: [
          "That's a real milestone. You should feel good about this.",
          'Look at you, making progress. {milestone} - that matters.',
        ],
        enthusiastic: [
          'You hit {milestone}! This is exactly the kind of progress that compounds!',
          "Milestone unlocked! I've been watching you work toward this.",
        ],
        ecstatic: ["{milestone}! You're on FIRE! This is the momentum that changes everything!"],
      },
      streak_achieved: {
        subtle: ['{days} days. Consistency counts.', 'The streak continues.'],
        warm: [
          '{days} days in a row. That takes real discipline.',
          "You've shown up {days} days straight. That's who you are now.",
        ],
        enthusiastic: [
          '{days} DAYS! Do you know how few people can do that? This is incredible!',
          "A {days}-day streak! You're proving something to yourself right now.",
        ],
        ecstatic: ['{days} DAYS! You absolute champion! Most people quit by day 3!'],
      },
      growth_recognized: {
        subtle: ["You see it too. You've grown.", 'Growth. Real growth.'],
        warm: [
          "The fact that you can see how far you've come? That's growth too.",
          "You're not where you started. Look at you.",
          'Remember when this felt impossible? Look at you now.',
        ],
        enthusiastic: [
          "THIS is what I've been watching! You've grown so much!",
          "Do you HEAR yourself right now? The person who started couldn't say that!",
        ],
        ecstatic: ["STOP. I need you to really hear this. Look how far you've come!"],
      },
      effort_recognized: {
        subtle: ['You showed up. That counts.', 'Effort matters.'],
        warm: [
          'You tried. That takes courage. The outcome is secondary.',
          "Hey - you made the effort. That's the part you control.",
          'Showing up is its own victory. You showed up.',
        ],
        enthusiastic: ["You TRIED. Even when it was hard. That's the stuff champions are made of!"],
        ecstatic: ["The fact that you TRIED when most people would have quit? That's everything!"],
      },
      relationship_milestone: {
        subtle: ["We've come a long way.", "This journey we're on..."],
        warm: [
          "You know, I just realized how much we've shared. Thank you for trusting me.",
          "It hits me sometimes - how much you've let me be part of.",
        ],
        enthusiastic: ["I can't believe how far we've come together. This means so much to me."],
        ecstatic: ["A year! We've been doing this for a YEAR! I'm getting emotional here."],
      },
      first_time: {
        subtle: ["First time. That's a milestone.", 'Firsts matter.'],
        warm: [
          'Your first time! Every expert was once a beginner.',
          "That's a first! These moments are worth remembering.",
        ],
        enthusiastic: [
          'Your FIRST time! Do you remember your first time doing anything? This is that moment!',
        ],
        ecstatic: ["A FIRST! These are the moments you'll look back on. I'm so excited for you!"],
      },
      breakthrough: {
        subtle: ["That's an insight.", 'You just connected something.'],
        warm: [
          'Wait. Say that again. You just realized something important.',
          "That's a breakthrough. Those don't happen every day.",
        ],
        enthusiastic: [
          "THAT'S IT! You just cracked something open! Do you feel that?",
          "Oh wow. You just had a moment. Let's sit with that.",
        ],
        ecstatic: ["OH! Did you hear what you just said?! That's HUGE! That's the breakthrough!"],
      },
    };

    return templates[type][intensity] || templates[type].warm;
  }

  /**
   * Build SSML with appropriate prosody
   */
  private buildCelebrationSSML(message: string, intensity: CelebrationIntensity): string {
    const prosodyMap: Record<CelebrationIntensity, { rate: string; pitch: string }> = {
      subtle: { rate: 'medium', pitch: 'medium' },
      warm: { rate: '95%', pitch: '+5%' },
      enthusiastic: { rate: '105%', pitch: '+10%' },
      ecstatic: { rate: '110%', pitch: '+15%' },
    };

    const { rate, pitch } = prosodyMap[intensity];

    // Add pause before for dramatic effect
    const pauseMs = intensity === 'ecstatic' ? 500 : intensity === 'enthusiastic' ? 300 : 200;

    return `<break time="${pauseMs}ms"/><prosody rate="${rate}" pitch="${pitch}">${message}</prosody>`;
  }

  /**
   * Get expression for avatar
   */
  private getExpression(
    type: CelebrationType,
    intensity: CelebrationIntensity
  ): CelebrationResponse['expression'] {
    if (intensity === 'ecstatic') return 'celebrating';
    if (intensity === 'enthusiastic') return 'excited';
    if (type === 'growth_recognized' || type === 'effort_recognized') return 'pride';
    if (type === 'relationship_milestone') return 'warmth';
    return 'delight';
  }

  /**
   * Get energy level for delivery
   */
  private getEnergy(intensity: CelebrationIntensity): CelebrationResponse['energy'] {
    const map: Record<CelebrationIntensity, CelebrationResponse['energy']> = {
      subtle: 'calm',
      warm: 'warm',
      enthusiastic: 'bright',
      ecstatic: 'exuberant',
    };
    return map[intensity];
  }

  // ==========================================================================
  // EXTERNAL TRIGGERS
  // ==========================================================================

  /**
   * Trigger celebration from goal tracking system
   */
  celebrateGoalCompletion(goal: {
    id: string;
    title: string;
    domain: string;
    startedAt: Date;
  }): CelebrationResponse {
    const daysTaken = Math.floor((Date.now() - goal.startedAt.getTime()) / (1000 * 60 * 60 * 24));

    const trigger = this.createTrigger('goal_completed', {
      achievement: `Completed "${goal.title}"`,
      significance: `Achieved ${goal.domain} goal after ${daysTaken} days`,
      evidence: [`Goal: ${goal.title}`, `Domain: ${goal.domain}`],
      intensity: daysTaken > 30 ? 'enthusiastic' : 'warm',
      context: { goalName: goal.title },
    });

    return this.generateCelebration(trigger);
  }

  /**
   * Trigger celebration from streak tracking
   */
  celebrateStreak(streak: { days: number; habit: string }): CelebrationResponse {
    let intensity: CelebrationIntensity = 'subtle';
    if (streak.days >= 100) intensity = 'ecstatic';
    else if (streak.days >= 30) intensity = 'enthusiastic';
    else if (streak.days >= 7) intensity = 'warm';

    const trigger = this.createTrigger('streak_achieved', {
      achievement: `${streak.days}-day ${streak.habit} streak`,
      significance: `Maintained consistency for ${streak.days} days`,
      evidence: [`Habit: ${streak.habit}`, `Days: ${streak.days}`],
      intensity,
      context: { streakDays: streak.days },
    });

    return this.generateCelebration(trigger);
  }

  /**
   * Trigger growth celebration from growth visibility engine
   */
  celebrateGrowth(growth: {
    area: string;
    before: string;
    after: string;
    timespan: string;
  }): CelebrationResponse {
    const trigger = this.createTrigger('growth_recognized', {
      achievement: `Growth in ${growth.area}`,
      significance: `Transformed from "${growth.before}" to "${growth.after}" over ${growth.timespan}`,
      evidence: [growth.before, growth.after],
      intensity: 'warm',
      context: {
        comparisonToStart: `From "${growth.before}" to "${growth.after}"`,
        timeframe: growth.timespan,
      },
    });

    return this.generateCelebration(trigger);
  }

  /**
   * Trigger relationship milestone celebration
   */
  celebrateRelationshipMilestone(milestone: {
    type: 'conversations' | 'months' | 'vulnerability_shared';
    value: number;
  }): CelebrationResponse {
    const milestoneNames: Record<typeof milestone.type, (v: number) => string> = {
      conversations: (v) => `${v} conversations together`,
      months: (v) => `${v} month${v > 1 ? 's' : ''} of knowing each other`,
      vulnerability_shared: (v) => `${v} moments of real trust`,
    };

    let intensity: CelebrationIntensity = 'warm';
    if (milestone.type === 'months' && milestone.value >= 12) intensity = 'enthusiastic';
    if (milestone.type === 'conversations' && milestone.value >= 100) intensity = 'enthusiastic';

    const trigger = this.createTrigger('relationship_milestone', {
      achievement: milestoneNames[milestone.type](milestone.value),
      significance: 'Our journey together matters',
      evidence: [`${milestone.type}: ${milestone.value}`],
      intensity,
      context: { milestoneName: milestoneNames[milestone.type](milestone.value) },
    });

    return this.generateCelebration(trigger);
  }

  // ==========================================================================
  // HISTORY & ANALYTICS
  // ==========================================================================

  /**
   * Record user reaction to celebration
   */
  recordReaction(triggerId: string, reaction: 'positive' | 'neutral' | 'dismissed'): void {
    const record = this.celebrationHistory.find((r) => r.triggerId === triggerId);
    if (record) {
      record.userReaction = reaction;
      log.debug({ triggerId, reaction }, 'Celebration reaction recorded');
    }
  }

  /**
   * Get celebration stats
   */
  getStats(): {
    total: number;
    byType: Record<CelebrationType, number>;
    positiveReactions: number;
  } {
    const byType = {} as Record<CelebrationType, number>;
    let positiveReactions = 0;

    for (const record of this.celebrationHistory) {
      byType[record.type] = (byType[record.type] || 0) + 1;
      if (record.userReaction === 'positive') positiveReactions++;
    }

    return {
      total: this.celebrationHistory.length,
      byType,
      positiveReactions,
    };
  }

  /**
   * Export history for persistence
   */
  exportHistory(): CelebrationRecord[] {
    return [...this.celebrationHistory];
  }

  /**
   * Import history from persistence
   */
  importHistory(records: CelebrationRecord[]): void {
    this.celebrationHistory = records;
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.lastCelebrationTurn = 0;
    // Don't clear history - it persists
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const engines = new Map<string, CelebrationEngine>();

export function getCelebrationEngine(userId: string, personaId: string): CelebrationEngine {
  const key = `${userId}:${personaId}`;
  if (!engines.has(key)) {
    engines.set(key, new CelebrationEngine(userId, personaId));
  }
  return engines.get(key)!;
}

export function resetCelebrationEngine(userId: string, personaId: string): void {
  const key = `${userId}:${personaId}`;
  engines.get(key)?.reset();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default CelebrationEngine;
