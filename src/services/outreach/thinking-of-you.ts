/**
 * Thinking of You - Random Kindness System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: reaching out just because we care,
 * not because there's a task to accomplish. A human friend might think
 * of you but never text. Ferni ACTS on that thought.
 *
 * Types of "thinking of you" outreach:
 * 1. **Random Kindness**: Just because
 * 2. **Relevant Content**: "Saw this and thought of you"
 * 3. **Anniversary**: "It's been X months since we started!"
 * 4. **Seasonal**: "How are you handling winter?"
 * 5. **After Silence**: Gentle reconnection after long gap
 * 6. **Milestone Reflection**: "Remember when you started this journey?"
 * 7. **Life Event Check**: "How was the wedding?"
 * 8. **Appreciation**: "I just want to say I'm proud of you"
 * 9. **Humor**: Share something funny/relevant
 *
 * Philosophy:
 * - These should feel SURPRISING, not expected
 * - They should NOT feel like a marketing drip campaign
 * - Frequency should match relationship depth
 * - Always have an opt-out feel (no response required)
 *
 * @module ThinkingOfYou
 */

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ThinkingOfYou' });

// ============================================================================
// TYPES
// ============================================================================

export type ThinkingOfYouTrigger =
  | 'random_kindness'
  | 'relevant_content'
  | 'anniversary'
  | 'seasonal'
  | 'after_silence'
  | 'milestone_reflection'
  | 'life_event_check'
  | 'appreciation'
  | 'humor'
  | 'pending_followup' // NEW: Unfinished business from previous conversations
  | 'hard_date_approaching'; // NEW: Anniversaries, deadlines user mentioned

export type OutreachChannel = 'sms' | 'email' | 'voice_message' | 'push';

export type PersonaId = 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan';

export interface ThinkingOfYouOutreach {
  id: string;
  userId: string;
  personaId: PersonaId;
  trigger: ThinkingOfYouTrigger;
  channel: OutreachChannel;

  /** The message to send */
  message: string;

  /** When to send it */
  scheduledFor: Date;

  /** Why we're reaching out (internal) */
  reason: string;

  /** Has it been sent? */
  sent: boolean;
  sentAt?: Date;

  /** Did they respond? */
  responseReceived: boolean;
  responseReceivedAt?: Date;
  responseType?: 'positive' | 'neutral' | 'negative' | 'none';
}

export interface ThinkingOfYouConfig {
  /** Base weekly probability of random outreach */
  baseWeeklyProbability: number;

  /** Max outreach per week */
  maxPerWeek: number;

  /** Minimum days between outreach */
  minDaysBetween: number;

  /** Probability boosts */
  probabilityBoosts: {
    userSeemingDown: number;
    longTimeSinceContact: number;
    upcomingChallenge: number;
    recentBigWin: number;
    seasonalRelevance: number;
    relationshipMilestone: number;
    pendingFollowUp: number;
    hardDateApproaching: number;
  };
}

export interface UserOutreachContext {
  profile: UserProfile;
  daysSinceLastContact: number;
  daysSinceLastOutreach: number;
  emotionalState: 'thriving' | 'stable' | 'struggling';
  upcomingEvents: Array<{ date: Date; description: string }>;
  recentWins: string[];
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  outreachCountThisWeek: number;
}

// ============================================================================
// PERSONA OUTREACH VOICES
// ============================================================================

const PERSONA_VOICES: Record<
  PersonaId,
  {
    signaturePhrases: string[];
    emojiStyle: string[];
    closingStyle: string;
    toneDescription: string;
  }
> = {
  ferni: {
    signaturePhrases: ['Hey!', 'Just thinking about you', 'No agenda', 'How are you really doing?'],
    emojiStyle: ['🌱', '💚', '🌟'],
    closingStyle: 'Rooting for you, Ferni',
    toneDescription: 'warm, coach-like, grounded',
  },
  maya: {
    signaturePhrases: [
      'Quick check-in',
      'Small wins count!',
      'How did the morning go?',
      'Keeping momentum',
    ],
    emojiStyle: ['✅', '💪', '🌅'],
    closingStyle: 'Cheering you on, Maya',
    toneDescription: 'supportive, practical, routine-focused',
  },
  peter: {
    signaturePhrases: [
      'I found something fascinating',
      'This made me think of you',
      'You might find this useful',
    ],
    emojiStyle: ['🔍', '📚'],
    closingStyle: 'Happy exploring, Peter',
    toneDescription: 'intellectually curious, enthusiastic about ideas',
  },
  alex: {
    signaturePhrases: [
      'Quick heads up',
      "Just wanted to make sure you're set",
      "Here's what you need to know",
    ],
    emojiStyle: ['📅', '✉️'],
    closingStyle: 'Best, Alex',
    toneDescription: 'professional, polished, helpful',
  },
  jordan: {
    signaturePhrases: [
      'Exciting things ahead!',
      "Let's make this amazing",
      "Everything's coming together",
    ],
    emojiStyle: ['🎉', '🗓️', '✨'],
    closingStyle: "Let's make it memorable! Jordan",
    toneDescription: 'enthusiastic, detail-oriented, celebratory',
  },
  nayan: {
    signaturePhrases: [
      'Been thinking about what you said',
      'Something occurred to me',
      'The market reminded me of our chat',
    ],
    emojiStyle: ['📈', '🎯'],
    closingStyle: 'Stay the course, Nayan',
    toneDescription: 'wise, measured, grandfatherly',
  },
};

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

const TEMPLATES: Record<ThinkingOfYouTrigger, Array<(ctx: UserOutreachContext) => string>> = {
  random_kindness: [
    () =>
      'Hey! No agenda - just wanted to say hi and hope your day is going well. No need to respond. 🌱',
    () =>
      "Random thought: I'm really glad we get to talk. You're putting in the work, and it shows. 💚",
    (ctx) =>
      `Just thinking about you, ${ctx.profile.name || 'friend'}. Hope you're being kind to yourself today.`,
    () =>
      "You crossed my mind today. No reason - just wanted you to know someone's in your corner. 🌟",
  ],
  relevant_content: [
    (ctx) =>
      `Hey! I came across something that made me think of our conversation about ${ctx.profile.preferredTopics?.[0] || "what you've been working on"}. Thought you might find it interesting!`,
    () => 'Found this and immediately thought of you. Seemed right up your alley!',
  ],
  anniversary: [
    (ctx) => {
      const months = Math.floor(ctx.daysSinceLastContact / 30);
      return `Hey! Just realized it's been ${months} months since we started talking. I've really enjoyed getting to know you. Here's to many more conversations! 🎉`;
    },
    () =>
      "I was just thinking about how far we've come together. Thank you for trusting me. It means more than you know.",
  ],
  seasonal: [
    () =>
      "The days are getting shorter. How are you handling the change? Remember, it's okay to slow down.",
    () => 'New season, new energy. What are you looking forward to?',
    () => "Hope you're finding moments of peace this time of year. 🌟",
  ],
  after_silence: [
    (ctx) =>
      `Hey ${ctx.profile.name || 'friend'}! It's been a minute. No pressure to catch up, but I've been thinking about you. Hope life is treating you well. 💚`,
    () =>
      "Miss you! No need to respond - just wanted you to know you're not forgotten. Life gets busy; I get it.",
    (ctx) =>
      `Haven't heard from you in a while and wanted to make sure you're okay. Whatever's going on, I'm here when you need me. ${ctx.daysSinceLastContact > 30 ? 'Take your time.' : ''}`,
  ],
  milestone_reflection: [
    (ctx) =>
      `Remember when you first mentioned ${ctx.profile.goals?.[0]?.name || 'your goal'}? Look how far you've come since then. I'm proud of you.`,
    () =>
      "I was thinking about your journey. The person who started isn't the same person you are now. Growth isn't always obvious day to day, but it's real.",
  ],
  life_event_check: [
    (ctx) => {
      const event = ctx.upcomingEvents[0];
      return event
        ? `How was ${event.description}? Been thinking about you!`
        : "How did that thing go? I've been curious!";
    },
    () => 'Been wondering how everything went! Fill me in when you have a chance.',
  ],
  appreciation: [
    (ctx) =>
      `${ctx.profile.name || 'Hey'} - random thought: I'm really proud of you. Not for any specific thing, just... you keep showing up. That matters.`,
    () =>
      "Wanted you to know: the effort you're putting in? I see it. It's not going unnoticed. 💚",
    () => "Quick appreciation moment: you're doing better than you think. Really.",
  ],
  humor: [
    () =>
      "Okay, random question that I've been thinking about: if you could only eat one cuisine for the rest of your life, what would it be? 😄",
    () =>
      'Just saw the most relatable meme and thought of you. The universe has a sense of humor. 😂',
  ],
  pending_followup: [
    (ctx) => {
      const pendingTopic =
        (ctx.profile as unknown as { pendingTopics?: string[] }).pendingTopics?.[0] ||
        'what you were working on';
      return `Hey! That thing you mentioned last time - about ${pendingTopic} - I've been curious. How'd it go?`;
    },
    () =>
      "I've been thinking about what you shared. No pressure to update me, but I'm here if you want to talk about it.",
    (ctx) => {
      const pendingTopic =
        (ctx.profile as unknown as { pendingTopics?: string[] }).pendingTopics?.[0] || 'situation';
      return `Quick check-in: that ${pendingTopic} you were dealing with? I haven't forgotten. How are you doing with it?`;
    },
    () =>
      "Something you told me has been on my mind. Just wanted you to know I'm thinking about you. 💚",
  ],
  hard_date_approaching: [
    (ctx) => {
      const event = ctx.upcomingEvents[0];
      return event
        ? `Hey - ${event.description} is coming up. I remembered. I'm thinking of you. 💚`
        : "I know what day is coming up. You're not alone in this.";
    },
    () =>
      "I know this time of year is hard for you. Just wanted to reach out. No words needed - I'm just here.",
    (ctx) =>
      `Tomorrow's going to be a big day for you${ctx.upcomingEvents[0] ? ` - ${ctx.upcomingEvents[0].description}` : ''}. You've got this. And I'm here if you need someone after.`,
    () => "I remembered the date. I'm thinking of you. That's all. 💚",
  ],
};

// ============================================================================
// THINKING OF YOU ENGINE
// ============================================================================

export class ThinkingOfYouEngine {
  private config: ThinkingOfYouConfig;
  private pendingOutreach: Map<string, ThinkingOfYouOutreach> = new Map();
  private outreachHistory: ThinkingOfYouOutreach[] = [];

  constructor(config?: Partial<ThinkingOfYouConfig>) {
    this.config = {
      // INCREASED: More proactive outreach builds relationship faster
      baseWeeklyProbability: 0.45, // 45% base chance per week
      maxPerWeek: 3, // Allow up to 3 per week
      minDaysBetween: 2, // Reduced from 3
      probabilityBoosts: {
        userSeemingDown: 0.3, // Higher boost when they're struggling
        longTimeSinceContact: 0.2, // Increased - don't let them slip away
        upcomingChallenge: 0.25, // Life events need support
        recentBigWin: 0.2, // Celebrate victories
        seasonalRelevance: 0.15,
        relationshipMilestone: 0.25, // These matter!
        pendingFollowUp: 0.35, // NEW: Unfinished business is highest priority
        hardDateApproaching: 0.4, // NEW: Anniversaries, deadlines, etc.
      },
      ...config,
    };
  }

  // ==========================================================================
  // OUTREACH DECISION
  // ==========================================================================

  /**
   * Decide whether to reach out and what to say
   */
  shouldReachOut(context: UserOutreachContext): {
    shouldSend: boolean;
    trigger?: ThinkingOfYouTrigger;
    persona?: PersonaId;
    reason?: string;
  } {
    // Rate limiting
    if (context.outreachCountThisWeek >= this.config.maxPerWeek) {
      return { shouldSend: false };
    }

    if (context.daysSinceLastOutreach < this.config.minDaysBetween) {
      return { shouldSend: false };
    }

    // Don't reach out to strangers proactively
    if (context.relationshipStage === 'stranger') {
      return { shouldSend: false };
    }

    // Calculate probability
    let probability = this.config.baseWeeklyProbability;

    // Apply boosts
    if (context.emotionalState === 'struggling') {
      probability += this.config.probabilityBoosts.userSeemingDown;
    }
    if (context.daysSinceLastContact > 7) {
      probability += this.config.probabilityBoosts.longTimeSinceContact;
    }
    if (context.upcomingEvents.length > 0) {
      probability += this.config.probabilityBoosts.upcomingChallenge;
    }
    if (context.recentWins.length > 0) {
      probability += this.config.probabilityBoosts.recentBigWin;
    }
    if (this.isSeasonalMoment()) {
      probability += this.config.probabilityBoosts.seasonalRelevance;
    }

    // Roll the dice
    if (Math.random() > probability) {
      return { shouldSend: false };
    }

    // Select trigger and persona
    const trigger = this.selectTrigger(context);
    const persona = this.selectPersona(trigger, context);

    return {
      shouldSend: true,
      trigger,
      persona,
      reason: `Probability: ${(probability * 100).toFixed(0)}%, Trigger: ${trigger}`,
    };
  }

  /**
   * Select the most appropriate trigger based on context
   * PRIORITY ORDER: Hard dates > Pending follow-ups > Silence > Life events > Everything else
   */
  private selectTrigger(context: UserOutreachContext): ThinkingOfYouTrigger {
    // HIGHEST PRIORITY: Hard dates approaching (anniversaries, etc.)
    const upcomingHardDate = context.upcomingEvents.find((e) => {
      const eventDate = new Date(e.date);
      const daysUntil = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      // Event is within next 2 days and marked as significant
      return daysUntil > 0 && daysUntil <= 2;
    });
    if (upcomingHardDate) {
      return 'hard_date_approaching';
    }

    // SECOND PRIORITY: Pending follow-ups (unfinished business)
    // Check if profile has pending topics (may be stored in memory or goals)
    const hasPendingTopics =
      (context.profile as unknown as { pendingTopics?: string[] }).pendingTopics?.length ?? 0;
    if (hasPendingTopics > 0) {
      return 'pending_followup';
    }

    // Priority triggers based on context
    if (context.daysSinceLastContact > 14) {
      return 'after_silence';
    }

    // Check for life events that just passed
    const recentEvent = context.upcomingEvents.find((e) => {
      const eventDate = new Date(e.date);
      const daysSince = (Date.now() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 0 && daysSince < 3;
    });
    if (recentEvent) {
      return 'life_event_check';
    }

    if (context.recentWins.length > 0) {
      return Math.random() < 0.5 ? 'appreciation' : 'milestone_reflection';
    }

    if (context.emotionalState === 'struggling') {
      return 'random_kindness'; // Pure support, no agenda
    }

    if (this.isSeasonalMoment()) {
      return 'seasonal';
    }

    // Random selection from lighter triggers
    const lightTriggers: ThinkingOfYouTrigger[] = ['random_kindness', 'appreciation', 'humor'];
    return lightTriggers[Math.floor(Math.random() * lightTriggers.length)];
  }

  /**
   * Select the best persona for this outreach
   */
  private selectPersona(trigger: ThinkingOfYouTrigger, context: UserOutreachContext): PersonaId {
    // Default mapping - Ferni handles most care-based outreach
    const triggerPersonaMap: Record<ThinkingOfYouTrigger, PersonaId> = {
      random_kindness: 'ferni',
      relevant_content: 'peter',
      anniversary: 'ferni',
      seasonal: 'ferni',
      after_silence: 'ferni',
      milestone_reflection: 'ferni',
      life_event_check: 'jordan',
      appreciation: 'ferni',
      humor: 'ferni',
      pending_followup: 'ferni', // Ferni cares about unfinished business
      hard_date_approaching: 'ferni', // Ferni handles sensitive dates with care
    };

    return triggerPersonaMap[trigger];
  }

  /**
   * Check if we're in a seasonal moment
   */
  private isSeasonalMoment(): boolean {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();

    // Season transitions
    if (
      (month === 2 && day >= 15) ||
      (month === 5 && day >= 15) ||
      (month === 8 && day >= 15) ||
      (month === 11 && day >= 15)
    ) {
      return true;
    }

    // New Year
    if (month === 0 && day <= 7) return true;

    // End of year reflection
    if (month === 11 && day >= 20) return true;

    return false;
  }

  // ==========================================================================
  // MESSAGE GENERATION
  // ==========================================================================

  /**
   * Generate the outreach message
   */
  generateMessage(
    trigger: ThinkingOfYouTrigger,
    persona: PersonaId,
    context: UserOutreachContext
  ): string {
    const templates = TEMPLATES[trigger];
    const template = templates[Math.floor(Math.random() * templates.length)];
    const voice = PERSONA_VOICES[persona];

    let message = template(context);

    // Add persona flavor occasionally
    if (Math.random() < 0.3) {
      const emoji = voice.emojiStyle[Math.floor(Math.random() * voice.emojiStyle.length)];
      if (!message.includes(emoji)) {
        message = message.replace(/\.$/, ` ${emoji}`);
      }
    }

    return message;
  }

  // ==========================================================================
  // OUTREACH MANAGEMENT
  // ==========================================================================

  /**
   * Create a new outreach
   */
  createOutreach(
    userId: string,
    trigger: ThinkingOfYouTrigger,
    persona: PersonaId,
    context: UserOutreachContext,
    scheduledFor: Date = new Date()
  ): ThinkingOfYouOutreach {
    const message = this.generateMessage(trigger, persona, context);

    const outreach: ThinkingOfYouOutreach = {
      id: `toy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      personaId: persona,
      trigger,
      channel: 'sms', // Default to SMS for now
      message,
      scheduledFor,
      reason: `${trigger} outreach`,
      sent: false,
      responseReceived: false,
    };

    this.pendingOutreach.set(outreach.id, outreach);

    log.info({ id: outreach.id, trigger, persona }, '💭 Thinking of you outreach created');

    return outreach;
  }

  /**
   * Mark outreach as sent
   */
  markSent(outreachId: string): void {
    const outreach = this.pendingOutreach.get(outreachId);
    if (outreach) {
      outreach.sent = true;
      outreach.sentAt = new Date();
      this.outreachHistory.push(outreach);
      this.pendingOutreach.delete(outreachId);
      log.info({ id: outreachId }, '📤 Outreach sent');
    }
  }

  /**
   * Record response to outreach
   */
  recordResponse(
    outreachId: string,
    responseType: 'positive' | 'neutral' | 'negative' | 'none'
  ): void {
    const outreach = this.outreachHistory.find((o) => o.id === outreachId);
    if (outreach) {
      outreach.responseReceived = true;
      outreach.responseReceivedAt = new Date();
      outreach.responseType = responseType;
      log.debug({ id: outreachId, responseType }, 'Response recorded');
    }
  }

  /**
   * Get pending outreach
   */
  getPendingOutreach(): ThinkingOfYouOutreach[] {
    return Array.from(this.pendingOutreach.values());
  }

  /**
   * Get outreach history
   */
  getHistory(): ThinkingOfYouOutreach[] {
    return [...this.outreachHistory];
  }

  /**
   * Get stats
   */
  getStats(): {
    totalSent: number;
    positiveResponses: number;
    byTrigger: Record<ThinkingOfYouTrigger, number>;
    responseRate: number;
  } {
    const byTrigger = {} as Record<ThinkingOfYouTrigger, number>;
    let positiveResponses = 0;
    let totalResponses = 0;

    for (const outreach of this.outreachHistory) {
      byTrigger[outreach.trigger] = (byTrigger[outreach.trigger] || 0) + 1;
      if (outreach.responseReceived) {
        totalResponses++;
        if (outreach.responseType === 'positive') {
          positiveResponses++;
        }
      }
    }

    return {
      totalSent: this.outreachHistory.length,
      positiveResponses,
      byTrigger,
      responseRate:
        this.outreachHistory.length > 0 ? totalResponses / this.outreachHistory.length : 0,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ThinkingOfYouEngine | null = null;
let isRunning = false;

export function getThinkingOfYouEngine(): ThinkingOfYouEngine {
  if (!instance) {
    instance = new ThinkingOfYouEngine();
  }
  return instance;
}

/**
 * Start the Thinking of You engine
 */
export function startThinkingOfYouEngine(): void {
  if (!isRunning) {
    getThinkingOfYouEngine();
    isRunning = true;
  }
}

/**
 * Stop the Thinking of You engine
 */
export function stopThinkingOfYouEngine(): void {
  isRunning = false;
}

/**
 * Get current season based on date
 */
export function getCurrentSeason(): 'spring' | 'summer' | 'fall' | 'winter' {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

/**
 * Check if we're in a season transition (within 2 weeks of equinox/solstice)
 */
export function isSeasonTransition(): boolean {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  // Season transitions roughly: Mar 20, Jun 21, Sep 22, Dec 21
  const transitions = [
    { month: 2, day: 20 }, // Spring equinox
    { month: 5, day: 21 }, // Summer solstice
    { month: 8, day: 22 }, // Fall equinox
    { month: 11, day: 21 }, // Winter solstice
  ];

  for (const t of transitions) {
    if (month === t.month && Math.abs(day - t.day) <= 14) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ThinkingOfYouEngine;
