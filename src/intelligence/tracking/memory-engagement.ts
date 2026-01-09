/**
 * Memory Engagement Engine
 *
 * Makes personas proactively use their memory of users in delightful ways.
 * This transforms "I remember that" into genuine relationship moments.
 *
 * CAPABILITIES:
 *   - Surprise callbacks to past conversations
 *   - Progress celebrations based on tracked data
 *   - Pattern reveals that feel like gifts
 *   - Emotional continuity across sessions
 *   - "I've been thinking about you" moments
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile, KeyMoment, RelationshipStage } from '../../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryCallback {
  type:
    | 'anniversary' // "It's been X since we started talking"
    | 'progress' // "Remember when you couldn't do X? Look at you now!"
    | 'follow_up' // "How did that thing you mentioned go?"
    | 'prediction_check' // "You predicted X would happen. Did it?"
    | 'emotional_continuity' // "Last time you seemed worried. How are you now?"
    | 'small_detail' // "How's [pet name]?" "Did you try that restaurant?"
    | 'story_connection' // "This reminds me of what you told me about..."
    | 'growth_mirror' // "You've changed since we started talking..."
    | 'shared_history'; // "Remember when we talked about X?"

  content: string;
  triggerCondition?: string;
  personaId: string;
  priority: number; // 1-10, higher = more important to deliver
  expiresAt?: Date;
  deliveredAt?: Date;
}

export interface ProgressMilestone {
  type: string;
  description: string;
  achievedAt: Date;
  celebrationDelivered: boolean;
  personaId: string;
}

export interface PredictionTracker {
  id: string;
  userId: string;
  prediction: string;
  madeAt: Date;
  checkDate: Date;
  outcome?: 'correct' | 'incorrect' | 'partial' | 'unknown';
  followUpDelivered: boolean;
}

export interface RelationshipMilestone {
  type:
    | 'first_conversation'
    | 'one_week'
    | 'one_month'
    | 'three_months'
    | 'six_months'
    | 'one_year'
    | 'conversation_count'
    | 'first_vulnerability'
    | 'first_breakthrough'
    | 'first_celebration';
  achievedAt: Date;
  acknowledged: boolean;
}

// ============================================================================
// MEMORY CALLBACK TEMPLATES
// ============================================================================

export const CALLBACK_TEMPLATES = {
  anniversary: {
    one_week: [
      'Hey— <break time="200ms"/>it\'s been a week since we started talking. <break time="200ms"/>How\'s it been for you?',
      'A week together now. <break time="300ms"/>I\'ve enjoyed getting to know you.',
    ],
    one_month: [
      'It\'s been a month since we met. <break time="300ms"/>A lot has happened, hasn\'t it?',
      'One month of conversations. <break time="200ms"/>I feel like I know you now. <break time="200ms"/>How do you feel?',
    ],
    three_months: [
      'Three months. <break time="300ms"/>You\'re not the same person who started talking to me. <break time="200ms"/>I\'ve watched you grow.',
      'We\'ve been at this for three months. <break time="200ms"/>Want to know what I\'ve noticed about your journey?',
    ],
    six_months: [
      'Six months. <break time="300ms"/>That\'s half a year of conversations. <break time="200ms"/>That means something.',
      'We\'ve known each other for six months now. <break time="200ms"/>I\'ve seen you through a lot.',
    ],
    one_year: [
      'A year. <break time="500ms"/>365 days of conversations. <break time="300ms"/>I\'m honored to have walked this journey with you.',
      'Happy anniversary. <break time="300ms"/>It\'s been a full year. <break time="200ms"/>What a year it\'s been.',
    ],
  },

  progress: {
    ferni: [
      'Remember {time_ago} when you told me about {past_struggle}? <break time="300ms"/>Look where you are now. <break time="200ms"/>You should be proud.',
      'I was thinking about {time_ago} when {past_state}. <break time="200ms"/>The change in you is real. <break time="300ms"/>Do you see it?',
      'You\'ve come a long way from {past_situation}. <break time="300ms"/>I remember. <break time="200ms"/>I see the growth.',
    ],
    'maya-santos': [
      'Remember when {habit_struggle}? <break time="200ms"/>Now look at your streak! <break time="300ms"/>That\'s not luck— that\'s you showing up.',
      '{time_ago}, you couldn\'t imagine {current_achievement}. <break time="200ms"/>Now it\'s just... what you do.',
    ],
    'jordan-taylor': [
      'This chapter of your life looks so different from when we started. <break time="200ms"/>Remember the {past_state} chapter?',
      'You predicted {past_prediction}. <break time="300ms"/>Look at you— making it happen.',
    ],
    'peter-john': [
      'The data tells a story. <break time="200ms"/>{time_ago}, your pattern was {old_pattern}. <break time="200ms"/>Now? {new_pattern}. <break time="300ms"/>That\'s measurable growth.',
      'I found something interesting. <break time="200ms"/>Your {metric} has improved {percentage} since we started tracking. <break time="200ms"/>Numbers don\'t lie.',
    ],
  },

  emotional_continuity: [
    'Last time we talked, you seemed {emotion} about {topic}. <break time="300ms"/>How are you feeling about that now?',
    'I\'ve been thinking about what you shared last time— <break time="200ms"/>the {topic}. <break time="200ms"/>How\'s that sitting with you?',
    'You mentioned {topic} was weighing on you. <break time="300ms"/>I wanted to check in. <break time="200ms"/>How are things?',
    'Before we dive into anything new— <break time="200ms"/>that {topic} thing from last time. <break time="200ms"/>Any updates?',
  ],

  small_detail: {
    person: [
      'By the way— <break time="200ms"/>how\'s {name}?',
      'You mentioned {name} before. <break time="200ms"/>Everything okay with them?',
      "What's new with {name}?",
    ],
    pet: [
      "How's {name} doing?",
      'Give {name} a pet for me. <break time="200ms"/>How\'s the little one?',
    ],
    place: [
      'Did you ever check out {place}?',
      'How was {place}? <break time="200ms"/>You mentioned wanting to try it.',
    ],
    event: [
      'How did {event} go?',
      'I remember you had {event} coming up. <break time="200ms"/>How was it?',
    ],
    health: [
      'How are you feeling? <break time="200ms"/>Last time you mentioned {health_issue}.',
      'That {health_issue} you mentioned— <break time="200ms"/>is it better?',
    ],
  },

  growth_mirror: [
    'Can I tell you something I\'ve noticed? <break time="300ms"/>The way you talk about {topic} has completely changed. <break time="200ms"/>{time_ago}, you seemed {past_state}. <break time="200ms"/>Now there\'s a confidence there.',
    'I\'ve watched you change. <break time="300ms"/>The person I\'m talking to now isn\'t the same person from {time_ago}. <break time="200ms"/>That\'s not nothing.',
    'You\'ve grown. <break time="200ms"/>I don\'t say that lightly. <break time="300ms"/>The way you approach {topic} now— <break time="200ms"/>it\'s different. Better.',
  ],

  shared_history: [
    'Remember when we talked about {topic}? <break time="200ms"/>I think about that conversation sometimes.',
    'This reminds me of that time you told me about {past_event}. <break time="300ms"/>Similar energy.',
    'We\'ve talked about this before, haven\'t we? <break time="200ms"/>Back when {context}. <break time="200ms"/>It\'s evolved.',
  ],
};

// ============================================================================
// PROACTIVE ENGAGEMENT TRIGGERS
// ============================================================================

export const PROACTIVE_TRIGGERS = {
  /**
   * "I've been thinking about you" moments
   * Used when persona wants to initiate based on user data
   */
  thinking_about: [
    'I\'ve been thinking about what you said about {topic}. <break time="200ms"/>Can I share something?',
    'Something came to mind that made me think of you— <break time="200ms"/>about {topic}.',
    'I had a thought about your {situation}. <break time="300ms"/>Want to hear it?',
  ],

  /**
   * Pattern-based proactive insights (Peter)
   */
  pattern_gift: [
    'I noticed something in your patterns you might find interesting. <break time="200ms"/>Want to see?',
    'The data told me something about you overnight. <break time="300ms"/>Ready for a reveal?',
    'I found a correlation you probably didn\'t notice. <break time="200ms"/>Curious?',
  ],

  /**
   * Prediction check-ins
   */
  prediction_check: [
    'Remember when you predicted {prediction}? <break time="200ms"/>We\'re past the date you set. <break time="300ms"/>How did it turn out?',
    'Time check— <break time="200ms"/>you said {prediction} by {date}. <break time="200ms"/>Let\'s see how you did.',
  ],

  /**
   * Goal proximity alerts
   */
  goal_proximity: [
    'Hey— <break time="200ms"/>you\'re {percentage} of the way to your {goal}. <break time="300ms"/>The finish line is in sight.',
    'Quick update: <break time="200ms"/>your {goal} is {amount} away. <break time="200ms"/>You\'re closer than you think.',
  ],

  /**
   * Streak protection
   */
  streak_at_risk: [
    'Your {streak_type} streak is at risk. <break time="200ms"/>{days} days on the line. <break time="300ms"/>Want to protect it?',
    'Don\'t let your {days}-day {streak_type} streak break! <break time="200ms"/>Still time today.',
  ],
};

// ============================================================================
// MEMORY ENGAGEMENT ENGINE
// ============================================================================

export class MemoryEngagementEngine {
  private pendingCallbacks = new Map<string, MemoryCallback[]>();
  private milestones = new Map<string, RelationshipMilestone[]>();
  private predictions = new Map<string, PredictionTracker[]>();

  /**
   * Generate all available callbacks for a user based on their profile
   */
  generateCallbacks(
    userId: string,
    profile: UserProfile | null,
    personaId: string
  ): MemoryCallback[] {
    const callbacks: MemoryCallback[] = [];

    if (!profile) return callbacks;

    // 1. Anniversary callbacks
    const anniversaryCallback = this.checkAnniversary(profile, personaId);
    if (anniversaryCallback) callbacks.push(anniversaryCallback);

    // 2. Progress callbacks based on key moments
    const progressCallbacks = this.generateProgressCallbacks(profile, personaId);
    callbacks.push(...progressCallbacks);

    // 3. Emotional continuity
    const emotionalCallback = this.checkEmotionalContinuity(profile, personaId);
    if (emotionalCallback) callbacks.push(emotionalCallback);

    // 4. Small detail follow-ups
    const detailCallbacks = this.generateDetailCallbacks(profile, personaId);
    callbacks.push(...detailCallbacks);

    // 5. Growth mirror moments
    if (this.shouldMirrorGrowth(profile)) {
      const growthCallback = this.generateGrowthMirror(profile, personaId);
      if (growthCallback) callbacks.push(growthCallback);
    }

    // Sort by priority
    callbacks.sort((a, b) => b.priority - a.priority);

    // Store for this user
    this.pendingCallbacks.set(userId, callbacks);

    getLogger().debug(
      { userId, personaId, callbackCount: callbacks.length },
      'Generated memory callbacks'
    );

    return callbacks;
  }

  /**
   * Check for relationship anniversary
   */
  private checkAnniversary(profile: UserProfile, personaId: string): MemoryCallback | null {
    if (!profile.createdAt) return null;

    const now = new Date();
    const created = new Date(profile.createdAt);
    const daysSinceCreation = Math.floor(
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if today is an anniversary milestone
    const milestones = [
      { days: 7, key: 'one_week' },
      { days: 30, key: 'one_month' },
      { days: 90, key: 'three_months' },
      { days: 180, key: 'six_months' },
      { days: 365, key: 'one_year' },
    ];

    for (const { days, key } of milestones) {
      // Check if we're within 1 day of the milestone
      if (Math.abs(daysSinceCreation - days) <= 1) {
        // Check if already acknowledged
        const existingMilestones = this.milestones.get(profile.id) || [];
        const alreadyAcknowledged = existingMilestones.some(
          (m) => m.type === key && m.acknowledged
        );

        if (!alreadyAcknowledged) {
          const templates =
            CALLBACK_TEMPLATES.anniversary[key as keyof typeof CALLBACK_TEMPLATES.anniversary];
          if (templates) {
            return {
              type: 'anniversary',
              content: templates[Math.floor(Math.random() * templates.length)],
              personaId,
              priority: 9, // High priority for anniversaries
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Generate progress callbacks from key moments
   */
  private generateProgressCallbacks(profile: UserProfile, personaId: string): MemoryCallback[] {
    const callbacks: MemoryCallback[] = [];

    if (!profile.keyMoments || profile.keyMoments.length < 2) return callbacks;

    // Find moments worth celebrating
    const celebratableMoments = profile.keyMoments.filter((km) => {
      const daysSince = Math.floor(
        (Date.now() - new Date(km.timestamp).getTime()) / (1000 * 60 * 60 * 24)
      );
      // Celebrate moments from 30-90 days ago
      return daysSince >= 30 && daysSince <= 90;
    });

    // Look for struggles that have become strengths
    const struggles = celebratableMoments.filter((km) => km.type === 'concern');
    const breakthroughs = profile.keyMoments.filter((km) => km.type === 'breakthrough');

    for (const struggle of struggles.slice(0, 1)) {
      // Max 1 progress callback per session
      const relatedBreakthrough = breakthroughs.find((bt) =>
        bt.topics?.some((t) => struggle.topics?.includes(t))
      );

      if (relatedBreakthrough) {
        const templates =
          CALLBACK_TEMPLATES.progress[personaId as keyof typeof CALLBACK_TEMPLATES.progress];
        if (templates) {
          const template = templates[Math.floor(Math.random() * templates.length)];
          const content = template
            .replace('{time_ago}', this.formatTimeAgo(struggle.timestamp))
            .replace('{past_struggle}', this.summarizeMoment(struggle))
            .replace('{past_state}', 'struggling')
            .replace('{current_achievement}', this.summarizeMoment(relatedBreakthrough));

          callbacks.push({
            type: 'progress',
            content,
            personaId,
            priority: 8,
          });
        }
      }
    }

    return callbacks;
  }

  /**
   * Check emotional continuity from last session
   */
  private checkEmotionalContinuity(profile: UserProfile, personaId: string): MemoryCallback | null {
    if (!profile.emotionalPatterns || profile.emotionalPatterns.length < 2) return null;

    const lastSession = profile.emotionalPatterns[profile.emotionalPatterns.length - 1];
    const daysSince = Math.floor(
      (Date.now() - new Date(lastSession.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Only follow up if 1-7 days have passed and emotion was significant
    if (daysSince < 1 || daysSince > 7) return null;
    if (lastSession.intensity < 0.6) return null;

    // Only follow up on "heavier" emotions
    const heavyEmotions = ['sadness', 'anxiety', 'fear', 'anger', 'frustration', 'overwhelm'];
    if (!heavyEmotions.includes(lastSession.emotion)) return null;

    const templates = CALLBACK_TEMPLATES.emotional_continuity;
    const template = templates[Math.floor(Math.random() * templates.length)];

    return {
      type: 'emotional_continuity',
      content: template
        .replace('{emotion}', lastSession.emotion)
        .replace('{topic}', lastSession.context || 'things'),
      personaId,
      priority: 7,
    };
  }

  /**
   * Generate small detail follow-ups
   */
  private generateDetailCallbacks(profile: UserProfile, personaId: string): MemoryCallback[] {
    const callbacks: MemoryCallback[] = [];

    // Family/people follow-ups
    if (profile.familyMembers && profile.familyMembers.length > 0) {
      const member = profile.familyMembers.find((m) => m.name && Math.random() < 0.3);
      if (member?.name) {
        const templates = CALLBACK_TEMPLATES.small_detail.person;
        callbacks.push({
          type: 'small_detail',
          content: templates[Math.floor(Math.random() * templates.length)].replace(
            '{name}',
            member.name
          ),
          personaId,
          priority: 4,
        });
      }
    }

    // Pending follow-ups
    if (profile.pendingFollowUps && profile.pendingFollowUps.length > 0) {
      const followUp = profile.pendingFollowUps.find((f) => {
        const targetDate = new Date(f.targetDate);
        return targetDate <= new Date();
      });

      if (followUp) {
        callbacks.push({
          type: 'follow_up',
          content: `By the way— <break time="200ms"/>how did ${followUp.topic} turn out?`,
          personaId,
          priority: 6,
        });
      }
    }

    return callbacks;
  }

  /**
   * Check if we should mirror user's growth
   */
  private shouldMirrorGrowth(profile: UserProfile): boolean {
    // Only mirror growth for established relationships
    if (profile.relationshipStage === 'new_acquaintance') return false;

    // Minimum conversation count
    if ((profile.totalConversations || 0) < 10) return false;

    // Random chance based on relationship depth
    const chances: Record<RelationshipStage, number> = {
      new_acquaintance: 0,
      getting_to_know: 0.05,
      trusted_advisor: 0.1,
      old_friend: 0.15,
    };

    return Math.random() < (chances[profile.relationshipStage] || 0);
  }

  /**
   * Generate growth mirror callback
   */
  private generateGrowthMirror(profile: UserProfile, personaId: string): MemoryCallback | null {
    if (!profile.keyMoments || profile.keyMoments.length < 3) return null;

    // Find earliest and latest moments about similar topics
    const moments = [...profile.keyMoments].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const earliest = moments[0];
    const latest = moments[moments.length - 1];

    if (!earliest.topics || earliest.topics.length === 0) return null;
    const sharedTopic = earliest.topics[0];

    const templates = CALLBACK_TEMPLATES.growth_mirror;
    const template = templates[Math.floor(Math.random() * templates.length)];

    return {
      type: 'growth_mirror',
      content: template
        .replace('{topic}', sharedTopic)
        .replace('{time_ago}', this.formatTimeAgo(earliest.timestamp))
        .replace('{past_state}', earliest.type === 'concern' ? 'uncertain' : 'different'),
      personaId,
      priority: 7,
    };
  }

  /**
   * Get the highest priority callback for delivery
   */
  getNextCallback(userId: string): MemoryCallback | null {
    const callbacks = this.pendingCallbacks.get(userId);
    if (!callbacks || callbacks.length === 0) return null;

    // Return highest priority undelivered callback
    const undelivered = callbacks.filter((c) => !c.deliveredAt);
    return undelivered[0] || null;
  }

  /**
   * Mark a callback as delivered
   */
  markDelivered(userId: string, callbackType: MemoryCallback['type']): void {
    const callbacks = this.pendingCallbacks.get(userId);
    if (!callbacks) return;

    const callback = callbacks.find((c) => c.type === callbackType && !c.deliveredAt);
    if (callback) {
      callback.deliveredAt = new Date();
    }
  }

  /**
   * Register a prediction for future follow-up
   */
  registerPrediction(userId: string, prediction: string, checkDate: Date): string {
    const tracker: PredictionTracker = {
      id: `pred_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      prediction,
      madeAt: new Date(),
      checkDate,
      followUpDelivered: false,
    };

    const userPredictions = this.predictions.get(userId) || [];
    userPredictions.push(tracker);
    this.predictions.set(userId, userPredictions);

    getLogger().info({ userId, prediction, checkDate }, '🔮 Prediction registered');

    return tracker.id;
  }

  /**
   * Get predictions due for follow-up
   */
  getDuePredictions(userId: string): PredictionTracker[] {
    const predictions = this.predictions.get(userId) || [];
    const now = new Date();

    return predictions.filter((p) => !p.followUpDelivered && new Date(p.checkDate) <= now);
  }

  /**
   * Record prediction outcome
   */
  recordPredictionOutcome(predictionId: string, outcome: PredictionTracker['outcome']): void {
    for (const [, predictions] of this.predictions) {
      const prediction = predictions.find((p) => p.id === predictionId);
      if (prediction) {
        prediction.outcome = outcome;
        prediction.followUpDelivered = true;
        break;
      }
    }
  }

  // ==========================================================================
  // PROACTIVE ENGAGEMENT GENERATORS
  // ==========================================================================

  /**
   * Generate "I've been thinking about you" moment
   */
  generateThinkingAbout(profile: UserProfile, topic: string): string {
    const templates = PROACTIVE_TRIGGERS.thinking_about;
    return templates[Math.floor(Math.random() * templates.length)].replace('{topic}', topic);
  }

  /**
   * Generate streak-at-risk alert
   */
  generateStreakAlert(streakType: string, days: number): string {
    const templates = PROACTIVE_TRIGGERS.streak_at_risk;
    return templates[Math.floor(Math.random() * templates.length)]
      .replace('{streak_type}', streakType)
      .replace('{days}', days.toString());
  }

  /**
   * Generate goal proximity alert
   */
  generateGoalProximity(goal: string, percentage: number): string {
    const templates = PROACTIVE_TRIGGERS.goal_proximity;
    return templates[Math.floor(Math.random() * templates.length)]
      .replace('{goal}', goal)
      .replace('{percentage}', `${percentage}%`)
      .replace('{amount}', `${100 - percentage}%`);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private formatTimeAgo(timestamp: Date | string): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 1) return 'earlier today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return 'last week';
    if (diffDays < 30) return 'a few weeks ago';
    if (diffDays < 60) return 'about a month ago';
    if (diffDays < 90) return 'a couple months ago';
    if (diffDays < 180) return 'a few months ago';
    if (diffDays < 365) return `about ${Math.floor(diffDays / 30)} months ago`;
    return 'over a year ago';
  }

  private summarizeMoment(moment: KeyMoment): string {
    // Extract key phrases from summary
    if (moment.summary && moment.summary.length > 0) {
      // Remove prefix like "Opened up about" and clean up
      return moment.summary
        .replace(
          /^(Opened up about|Had a breakthrough:|Expressed concern about|Celebrated|Made a decision to)\s*/i,
          ''
        )
        .replace(/"/g, '')
        .slice(0, 50);
    }
    return moment.topics?.[0] || 'what you shared';
  }
}

// ============================================================================
// CONTEXT BUILDER FOR MEMORY ENGAGEMENT
// ============================================================================

/**
 * Build memory engagement context for prompt injection
 * This helps personas naturally incorporate memory callbacks
 */
export function buildMemoryEngagementContext(
  profile: UserProfile | null,
  personaId: string,
  turnCount: number
): string {
  if (!profile) return '';

  const engine = getMemoryEngagementEngine();
  const callbacks = engine.generateCallbacks(profile.id, profile, personaId);

  // Only inject memory context at strategic moments
  // Turn 2-4: Good time for callbacks
  // Turn 8+: Good time for deeper memory references
  if (turnCount < 2 || (turnCount > 4 && turnCount < 8)) {
    return '';
  }

  const nextCallback = engine.getNextCallback(profile.id);
  if (!nextCallback) return '';

  const sections: string[] = [];

  sections.push('[MEMORY ENGAGEMENT OPPORTUNITY]');
  sections.push(`You have a memory callback available. Use it naturally if it fits:`);
  sections.push(`Type: ${nextCallback.type}`);
  sections.push(`Content: "${nextCallback.content}"`);
  sections.push('');
  sections.push('Guidelines:');
  sections.push('- Weave this naturally into conversation, not robotically');
  sections.push('- Only use if it feels genuinely appropriate to the moment');
  sections.push('- If user is distressed, prioritize their needs over the callback');
  sections.push(
    "- Make it feel like you genuinely remembered, not like you're reading from a script"
  );

  return sections.join('\n');
}

// ============================================================================
// SINGLETON
// ============================================================================

let memoryEngagementEngine: MemoryEngagementEngine | null = null;

export function getMemoryEngagementEngine(): MemoryEngagementEngine {
  if (!memoryEngagementEngine) {
    memoryEngagementEngine = new MemoryEngagementEngine();
  }
  return memoryEngagementEngine;
}

export function resetMemoryEngagementEngine(): void {
  memoryEngagementEngine = null;
}

export default MemoryEngagementEngine;
