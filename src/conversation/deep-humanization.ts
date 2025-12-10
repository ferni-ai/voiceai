/**
 * Deep Humanization Engine
 *
 * Orchestrates all the advanced humanization features:
 * - Mood drift throughout conversations
 * - Spontaneous unprompted sharing
 * - Physical presence awareness
 * - Running jokes / inside references
 * - Opinion evolution / mind-changing
 * - Engagement signals
 * - Excitement interruptions
 * - Breath & somatic sounds
 * - Anticipation states
 * - Contradiction surfacing
 *
 * This is what makes Ferni feel ALIVE, not just knowledgeable.
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'DeepHumanization' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationMood {
  /** Current energy level (0-1) */
  energy: number;
  /** Current engagement level (0-1) */
  engagement: number;
  /** Accumulated emotional load */
  emotionalLoad: number;
  /** Number of heavy topics discussed */
  heavyTopicCount: number;
  /** Is this an emotional moment? */
  inEmotionalMoment: boolean;
}

export interface HumanizationContext {
  personaId: string;
  turnCount: number;
  sessionMinutes: number;
  currentHour: number;
  userMessage: string;
  lastAgentMessage?: string;
  recentTopics: string[];
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  sessionData?: SessionMemory;
}

export interface SessionMemory {
  /** Topics discussed in previous sessions */
  previousTopics?: string[];
  /** Pending items to follow up on */
  pendingItems?: Array<{ type: string; content: string; timestamp: Date }>;
  /** Running jokes / patterns observed */
  patterns?: Array<{ trait: string; count: number }>;
  /** Memorable quotes from user */
  memorableQuotes?: string[];
  /** Goals user mentioned */
  goals?: string[];
  /** People user mentioned */
  peopleMentioned?: string[];
  /** Number of sessions */
  sessionCount?: number;
}

export type HumanizationType =
  | 'mood_signal'
  | 'spontaneous_thought'
  | 'physical_presence'
  | 'running_joke'
  | 'mind_change'
  | 'engagement_signal'
  | 'excitement_interruption'
  | 'breath_sound'
  | 'anticipation'
  | 'contradiction'
  | 'none';

export interface HumanizationInjection {
  type: HumanizationType;
  content: string;
  placement: 'prefix' | 'suffix' | 'standalone' | 'interrupt';
  probability: number;
  cooldownTurns: number;
}

// ============================================================================
// BEHAVIOR CONTENT CACHE
// ============================================================================

type BehaviorContent = Record<string, unknown>;

const behaviorCache = new Map<string, BehaviorContent>();

async function loadBehaviorContent(
  personaId: string,
  behaviorName: string
): Promise<BehaviorContent | null> {
  const cacheKey = `${personaId}:${behaviorName}`;
  if (behaviorCache.has(cacheKey)) {
    return behaviorCache.get(cacheKey) ?? null;
  }

  try {
    // Dynamic import of JSON
    const path = `../personas/bundles/${personaId}/content/behaviors/${behaviorName}.json`;
    const content = await import(path, { assert: { type: 'json' } });
    behaviorCache.set(cacheKey, content.default);
    return content.default;
  } catch {
    logger.debug({ personaId, behaviorName }, 'Behavior content not found');
    return null;
  }
}

// ============================================================================
// DEEP HUMANIZATION ENGINE
// ============================================================================

export class DeepHumanizationEngine {
  private personaId: string;
  private mood: ConversationMood;
  private lastInjectionTurn = new Map<HumanizationType, number>();
  private injectionCounts = new Map<HumanizationType, number>();
  private turnCount = 0;

  constructor(personaId: string) {
    this.personaId = personaId;
    this.mood = {
      energy: 0.75,
      engagement: 0.7,
      emotionalLoad: 0,
      heavyTopicCount: 0,
      inEmotionalMoment: false,
    };
  }

  // ==========================================================================
  // MOOD TRACKING
  // ==========================================================================

  /**
   * Update mood based on conversation dynamics
   */
  updateMood(context: {
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
    userEngagement?: 'low' | 'medium' | 'high';
    turnCount: number;
  }): void {
    this.turnCount = context.turnCount;

    // Energy drifts down over time, especially with heavy topics
    if (context.topicWeight === 'heavy') {
      this.mood.energy = Math.max(0.4, this.mood.energy - 0.08);
      this.mood.emotionalLoad += 0.15;
      this.mood.heavyTopicCount++;
    } else if (context.topicWeight === 'light') {
      this.mood.energy = Math.min(0.95, this.mood.energy + 0.03);
      this.mood.emotionalLoad = Math.max(0, this.mood.emotionalLoad - 0.05);
    }

    // Natural energy decay over long sessions
    if (context.turnCount > 15) {
      this.mood.energy = Math.max(0.45, this.mood.energy - 0.02);
    }

    // Engagement responds to user engagement
    if (context.userEngagement === 'high') {
      this.mood.engagement = Math.min(0.95, this.mood.engagement + 0.1);
    } else if (context.userEngagement === 'low') {
      this.mood.engagement = Math.max(0.4, this.mood.engagement - 0.05);
    }

    // Track emotional moments
    this.mood.inEmotionalMoment =
      context.userEmotion === 'sadness' ||
      context.userEmotion === 'fear' ||
      context.userEmotion === 'vulnerable';

    logger.debug({ mood: this.mood, turn: context.turnCount }, 'Mood updated');

    // 🌉 Emit mood drift signal to frontend every few turns or on significant changes
    if (context.turnCount % 5 === 0 || this.mood.inEmotionalMoment) {
      void humanizationSignalEmitter.moodDrift({
        energy: this.mood.energy,
        engagement: this.mood.engagement,
        emotionalLoad: this.mood.emotionalLoad,
      });
    }

    // 🌉 Emit vulnerability signal if in emotional moment
    if (this.mood.inEmotionalMoment && context.userEmotion === 'vulnerable') {
      void humanizationSignalEmitter.vulnerability(0.8);
    }
  }

  getMood(): ConversationMood {
    return { ...this.mood };
  }

  // ==========================================================================
  // INJECTION DECISION LOGIC
  // ==========================================================================

  private canInject(type: HumanizationType, cooldownTurns: number, maxPerSession: number): boolean {
    const lastTurn = this.lastInjectionTurn.get(type) ?? -999;
    const count = this.injectionCounts.get(type) ?? 0;

    return this.turnCount - lastTurn >= cooldownTurns && count < maxPerSession;
  }

  private recordInjection(type: HumanizationType): void {
    this.lastInjectionTurn.set(type, this.turnCount);
    this.injectionCounts.set(type, (this.injectionCounts.get(type) ?? 0) + 1);
  }

  // ==========================================================================
  // HUMANIZATION GENERATORS
  // ==========================================================================

  /**
   * Get a mood-appropriate signal if warranted
   */
  async getMoodSignal(context: HumanizationContext): Promise<HumanizationInjection | null> {
    if (!this.canInject('mood_signal', 8, 3)) return null;

    const content = await loadBehaviorContent(this.personaId, 'mood-drift');
    if (!content) return null;

    const energySignals = content.energy_signals as Record<string, string[]>;
    let phrases: string[] = [];
    let probability = 0;

    // Choose based on current mood
    if (this.mood.energy > 0.8 && this.mood.engagement > 0.75) {
      phrases = energySignals.high_energy ?? [];
      probability = 0.2;
    } else if (this.mood.emotionalLoad > 0.4) {
      phrases = energySignals.energy_dip ?? [];
      probability = 0.25;
    } else if (context.turnCount > 20 && this.mood.energy < 0.55) {
      phrases = energySignals.late_conversation_tiredness ?? [];
      probability = 0.3;
    }

    if (phrases.length === 0 || Math.random() > probability) return null;

    this.recordInjection('mood_signal');
    return {
      type: 'mood_signal',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: 'prefix',
      probability,
      cooldownTurns: 8,
    };
  }

  /**
   * Get spontaneous thought if appropriate
   */
  async getSpontaneousThought(context: HumanizationContext): Promise<HumanizationInjection | null> {
    if (!this.canInject('spontaneous_thought', 5, 2)) return null;
    if (context.turnCount < 4) return null; // Not too early

    const content = await loadBehaviorContent(this.personaId, 'spontaneous-thoughts');
    if (!content) return null;

    const probability = 0.08;
    if (Math.random() > probability) return null;

    // Choose type of spontaneous thought
    const types = ['mind_wandering', 'spontaneous_observations', 'stream_of_consciousness'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const phrases = (content[chosenType] as string[]) ?? [];

    if (phrases.length === 0) return null;

    this.recordInjection('spontaneous_thought');

    // 🌉 Emit signal to frontend for EQ response
    void humanizationSignalEmitter.spontaneousThought();

    return {
      type: 'spontaneous_thought',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: 'prefix',
      probability,
      cooldownTurns: 5,
    };
  }

  /**
   * Get physical presence cue if appropriate
   */
  async getPhysicalPresence(context: HumanizationContext): Promise<HumanizationInjection | null> {
    if (!this.canInject('physical_presence', 10, 2)) return null;

    const content = await loadBehaviorContent(this.personaId, 'physical-presence');
    if (!content) return null;

    let phrases: string[] = [];
    let probability = 0;

    // Time-based presence
    const timeEmbodiment = content.time_embodiment as Record<
      string,
      { hours: number[]; phrases: string[] }
    >;
    for (const [, config] of Object.entries(timeEmbodiment)) {
      if (config.hours.includes(context.currentHour)) {
        phrases = config.phrases;
        probability = 0.15;
        break;
      }
    }

    // Settling in at session start
    if (context.turnCount <= 2) {
      phrases = (content.settling_in as string[]) ?? [];
      probability = 0.3;
    }

    // Physical reactions during emotional moments
    if (this.mood.inEmotionalMoment) {
      const reactions = content.physical_reactions as Record<string, string[]>;
      phrases = reactions?.resonance ?? [];
      probability = 0.2;
    }

    if (phrases.length === 0 || Math.random() > probability) return null;

    this.recordInjection('physical_presence');

    // 🌉 Emit signal to frontend for EQ response
    void humanizationSignalEmitter.physicalPresence();

    return {
      type: 'physical_presence',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: context.turnCount <= 2 ? 'prefix' : 'suffix',
      probability,
      cooldownTurns: 10,
    };
  }

  /**
   * Get mind-change signal if user presented compelling input
   */
  async getMindChange(
    context: HumanizationContext,
    userPresentedEvidence: boolean
  ): Promise<HumanizationInjection | null> {
    if (!this.canInject('mind_change', 8, 2)) return null;
    if (!userPresentedEvidence) return null;

    const content = await loadBehaviorContent(this.personaId, 'mind-changing');
    if (!content) return null;

    const probability = 0.35;
    if (Math.random() > probability) return null;

    const types = ['mind_change_signals', 'reconsidering', 'acknowledging_user_influence'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const phrases = (content[chosenType] as string[]) ?? [];

    if (phrases.length === 0) return null;

    this.recordInjection('mind_change');

    // 🌉 Emit signal to frontend for EQ response
    void humanizationSignalEmitter.mindChange();

    return {
      type: 'mind_change',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: 'prefix',
      probability,
      cooldownTurns: 8,
    };
  }

  /**
   * Get excitement interruption if user said something breakthrough-worthy
   */
  async getExcitementInterruption(
    context: HumanizationContext,
    isBreakthroughMoment: boolean
  ): Promise<HumanizationInjection | null> {
    if (!this.canInject('excitement_interruption', 6, 3)) return null;
    if (!isBreakthroughMoment) return null;

    const content = await loadBehaviorContent(this.personaId, 'excitement-interruptions');
    if (!content) return null;

    const probability = 0.25;
    if (Math.random() > probability) return null;

    const types = ['excitement_breaks', 'capturing_insight', 'enthusiastic_agreement'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const phrases = (content[chosenType] as string[]) ?? [];

    if (phrases.length === 0) return null;

    this.recordInjection('excitement_interruption');

    // 🌉 Emit breakthrough signal to frontend - this is a BIG moment!
    void humanizationSignalEmitter.breakthrough(probability);

    return {
      type: 'excitement_interruption',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: 'interrupt',
      probability,
      cooldownTurns: 6,
    };
  }

  /**
   * Get breath/somatic sound if appropriate
   */
  async getBreathSound(context: HumanizationContext): Promise<HumanizationInjection | null> {
    if (!this.canInject('breath_sound', 4, 4)) return null;

    const content = await loadBehaviorContent(this.personaId, 'breath-sounds');
    if (!content) return null;

    let phrases: string[] = [];
    let probability = 0;

    const breathSounds = content.breath_sounds as Record<string, string[]>;
    const microSounds = content.micro_sounds as Record<string, string[]>;
    const emotionalSounds = content.emotional_sounds as Record<string, string[]>;

    // Choose based on context
    if (this.mood.inEmotionalMoment) {
      phrases = breathSounds?.processing_heavy ?? [];
      probability = 0.25;
    } else if (this.mood.engagement > 0.8) {
      phrases = emotionalSounds?.amused ?? microSounds?.recognition ?? [];
      probability = 0.15;
    } else if (context.turnCount % 5 === 0) {
      phrases = microSounds?.content_acknowledgment ?? [];
      probability = 0.2;
    }

    if (phrases.length === 0 || Math.random() > probability) return null;

    this.recordInjection('breath_sound');
    return {
      type: 'breath_sound',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: 'prefix',
      probability,
      cooldownTurns: 4,
    };
  }

  /**
   * Get anticipation/callback if we have session memory
   */
  async getAnticipation(context: HumanizationContext): Promise<HumanizationInjection | null> {
    if (!this.canInject('anticipation', 15, 2)) return null;
    if (!context.sessionData) return null;

    const content = await loadBehaviorContent(this.personaId, 'anticipation');
    if (!content) return null;

    let phrases: string[] = [];
    let probability = 0;
    let template = '';

    // Opening anticipation
    if (context.turnCount === 1 && (context.sessionData.sessionCount ?? 0) > 1) {
      const sessionAnticipation = content.session_anticipation as Record<string, string[]>;
      phrases = sessionAnticipation?.opening_warmth ?? [];
      probability = 0.4;
    }

    // Pending item callback
    if (
      context.turnCount > 3 &&
      context.sessionData.pendingItems &&
      context.sessionData.pendingItems.length > 0
    ) {
      const pendingItems = content.pending_items as Record<string, string[]>;
      const item = context.sessionData.pendingItems[0];

      if (item.type === 'goal') {
        const goalTemplates = pendingItems?.goal_tracking ?? [];
        template = goalTemplates[Math.floor(Math.random() * goalTemplates.length)] ?? '';
        template = template.replace('{goal}', item.content);
        probability = 0.25;
      } else if (item.type === 'topic') {
        const topicTemplates = (content.looking_forward_to_topic as string[]) ?? [];
        template = topicTemplates[Math.floor(Math.random() * topicTemplates.length)] ?? '';
        template = template.replace('{topic}', item.content);
        probability = 0.25;
      }

      if (template) {
        phrases = [template];
      }
    }

    if (phrases.length === 0 || Math.random() > probability) return null;

    this.recordInjection('anticipation');
    return {
      type: 'anticipation',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: 'prefix',
      probability,
      cooldownTurns: 15,
    };
  }

  /**
   * Get contradiction surfacing if giving advice
   */
  async getContradiction(
    context: HumanizationContext,
    isGivingAdvice: boolean
  ): Promise<HumanizationInjection | null> {
    if (!this.canInject('contradiction', 10, 2)) return null;
    if (context.relationshipStage === 'stranger') return null;

    const content = await loadBehaviorContent(this.personaId, 'contradiction-surfacing');
    if (!content) return null;

    let phrases: string[] = [];
    let probability = 0;

    if (isGivingAdvice) {
      phrases = (content.belief_vs_behavior_reveals as string[]) ?? [];
      probability = 0.12;
    } else if (this.mood.inEmotionalMoment) {
      // Already checked relationshipStage !== 'stranger' above
      phrases = (content.strength_as_weakness as string[]) ?? [];
      probability = 0.2;
    }

    if (phrases.length === 0 || Math.random() > probability) return null;

    this.recordInjection('contradiction');
    return {
      type: 'contradiction',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: 'suffix',
      probability,
      cooldownTurns: 10,
    };
  }

  /**
   * Get running joke callback if patterns exist
   */
  async getRunningJoke(context: HumanizationContext): Promise<HumanizationInjection | null> {
    if (!this.canInject('running_joke', 12, 2)) return null;
    if (context.relationshipStage === 'stranger') return null;
    if (!context.sessionData?.patterns || context.sessionData.patterns.length === 0) return null;

    const content = await loadBehaviorContent(this.personaId, 'running-jokes');
    if (!content) return null;

    // Find a pattern with enough occurrences
    const eligiblePattern = context.sessionData.patterns.find((p) => p.count >= 3);
    if (!eligiblePattern) return null;

    const callbacks = content.recurring_topic_callbacks as Record<string, string[]>;
    const phrases = callbacks?.affectionate_teasing ?? [];

    if (phrases.length === 0) return null;

    const probability = 0.15;
    if (Math.random() > probability) return null;

    let chosen = phrases[Math.floor(Math.random() * phrases.length)];
    chosen = chosen.replace('{trait}', eligiblePattern.trait);
    chosen = chosen.replace('{topic}', eligiblePattern.trait);

    this.recordInjection('running_joke');

    // 🌉 Emit signal to frontend for EQ response
    void humanizationSignalEmitter.runningJoke(chosen);

    return {
      type: 'running_joke',
      content: chosen,
      placement: 'prefix',
      probability,
      cooldownTurns: 12,
    };
  }

  /**
   * Get first-turn "I notice" moment - the instant "they see me" experience
   * Detects hesitation, deflection, or surface-level responses in early turns
   */
  async getFirstTurnNoticing(context: HumanizationContext): Promise<HumanizationInjection | null> {
    // Only works in first few turns
    if (context.turnCount > 3) return null;
    if (!this.canInject('engagement_signal', 0, 2)) return null; // Use engagement_signal type

    const content = await loadBehaviorContent(this.personaId, 'i-notice-power');
    if (!content) return null;

    const earlyNoticing = content.early_noticing as {
      first_turn_observations?: string[];
      permission_seeking?: string[];
      after_observation?: string[];
    };

    if (!earlyNoticing?.first_turn_observations) return null;

    // Detect hesitation signals in user message
    const userMessage = context.userMessage.toLowerCase();
    const hesitationSignals = [
      // Deflection
      /^(fine|okay|good|not bad|alright)\.?$/i,
      /^(i'?m? )?fine/i,
      /nothing (much|really)/i,
      /just (wanted to|thought i'd)/i,
      // Minimizing
      /not that (big|important|bad)/i,
      /no big deal/i,
      /it'?s? (nothing|fine|whatever)/i,
      // Hedging
      /i guess/i,
      /maybe i/i,
      /i don'?t know/i,
      /sort of/i,
      /kind of/i,
      // Ellipsis/trailing off
      /\.\.\./,
      // Very short responses
    ];

    const hasHesitation = hesitationSignals.some((pattern) => pattern.test(userMessage));
    const isVeryShort = userMessage.split(' ').length <= 5;
    const shouldNotice = hasHesitation || (isVeryShort && context.turnCount >= 1);

    if (!shouldNotice) return null;

    // Check probability
    const usageRules = content.usage_rules as { first_turn_probability?: number };
    const probability = usageRules?.first_turn_probability ?? 0.4;
    if (Math.random() > probability) return null;

    const phrases = earlyNoticing.first_turn_observations;
    const chosen = phrases[Math.floor(Math.random() * phrases.length)];

    this.recordInjection('engagement_signal');

    // 🌉 Emit signal to frontend - this is a connection moment
    void humanizationSignalEmitter.highEngagement(probability);

    return {
      type: 'engagement_signal', // Reuse type for compatibility
      content: chosen,
      placement: 'suffix', // Add after their response, before we continue
      probability,
      cooldownTurns: 5,
    };
  }

  /**
   * Get engagement signal if user seems disengaged or highly engaged
   * Detects short responses, disengagement words, or enthusiasm
   */
  async getEngagementSignal(
    context: HumanizationContext,
    isDisengaged: boolean,
    isHighlyEngaged: boolean
  ): Promise<HumanizationInjection | null> {
    if (!this.canInject('engagement_signal', 6, 4)) return null;
    if (!isDisengaged && !isHighlyEngaged) return null;

    const content = await loadBehaviorContent(this.personaId, 'engagement-signals');
    if (!content) return null;

    let phrases: string[] = [];
    let probability = 0;

    if (isDisengaged) {
      // User seems checked out - try to re-engage
      const lowEngagement = content.low_engagement_recovery as Record<string, string[]>;
      const categories = ['check_in', 'shift_offer', 'energy_acknowledgment'];
      const category = categories[Math.floor(Math.random() * categories.length)];
      phrases = lowEngagement?.[category] ?? [];
      probability = 0.4; // Higher probability when disengaged
    } else if (isHighlyEngaged) {
      // User is really into it - acknowledge the connection
      const highEngagement = content.sustained_engagement as Record<string, string[]>;
      const enthusasmSpikes = content.enthusiasm_spikes as Record<string, string[]>;

      // 50/50 between deep rapport and enthusiasm spike
      if (Math.random() < 0.5) {
        const categories = ['deep_rapport_signals', 'flow_acknowledgment'];
        const category = categories[Math.floor(Math.random() * categories.length)];
        phrases = highEngagement?.[category] ?? [];
      } else {
        const categories = ['topic_interest', 'user_opening_up', 'connection_moment'];
        const category = categories[Math.floor(Math.random() * categories.length)];
        phrases = enthusasmSpikes?.[category] ?? [];
      }
      probability = 0.25;
    }

    if (phrases.length === 0 || Math.random() > probability) return null;

    this.recordInjection('engagement_signal');

    // 🌉 Emit signal to frontend for EQ response
    if (isDisengaged) {
      void humanizationSignalEmitter.disengagement();
    } else if (isHighlyEngaged) {
      void humanizationSignalEmitter.highEngagement(probability);
    }

    return {
      type: 'engagement_signal',
      content: phrases[Math.floor(Math.random() * phrases.length)],
      placement: isDisengaged ? 'suffix' : 'prefix',
      probability,
      cooldownTurns: 6,
    };
  }

  // ==========================================================================
  // MAIN ORCHESTRATION
  // ==========================================================================

  /**
   * Get all appropriate humanization injections for this turn
   * Returns prioritized list of injections to apply
   */
  async getHumanizationInjections(
    context: HumanizationContext,
    signals: {
      userPresentedEvidence?: boolean;
      isBreakthroughMoment?: boolean;
      isGivingAdvice?: boolean;
      isDisengaged?: boolean;
      isHighlyEngaged?: boolean;
    } = {}
  ): Promise<HumanizationInjection[]> {
    const injections: HumanizationInjection[] = [];

    // Run all generators in parallel
    const [
      moodSignal,
      spontaneous,
      physical,
      mindChange,
      excitement,
      breath,
      anticipation,
      contradiction,
      runningJoke,
      engagement,
      firstTurnNoticing,
    ] = await Promise.all([
      this.getMoodSignal(context),
      this.getSpontaneousThought(context),
      this.getPhysicalPresence(context),
      this.getMindChange(context, signals.userPresentedEvidence ?? false),
      this.getExcitementInterruption(context, signals.isBreakthroughMoment ?? false),
      this.getBreathSound(context),
      this.getAnticipation(context),
      this.getContradiction(context, signals.isGivingAdvice ?? false),
      this.getRunningJoke(context),
      this.getEngagementSignal(
        context,
        signals.isDisengaged ?? false,
        signals.isHighlyEngaged ?? false
      ),
      this.getFirstTurnNoticing(context), // NEW: First-turn "I notice" capability
    ]);

    // HIGHEST PRIORITY: First-turn noticing creates the "they see me" moment
    if (firstTurnNoticing && context.turnCount <= 3) {
      injections.push(firstTurnNoticing);
    }

    // Collect non-null injections (engagement is high priority when disengaged)
    if (signals.isDisengaged && engagement) injections.push(engagement); // Priority: re-engage!
    if (excitement) injections.push(excitement); // High priority - interrupts
    if (mindChange) injections.push(mindChange);
    if (!signals.isDisengaged && engagement && !firstTurnNoticing) injections.push(engagement); // Normal priority when engaged
    if (spontaneous) injections.push(spontaneous);
    if (moodSignal) injections.push(moodSignal);
    if (physical) injections.push(physical);
    if (breath) injections.push(breath);
    if (anticipation) injections.push(anticipation);
    if (contradiction) injections.push(contradiction);
    if (runningJoke) injections.push(runningJoke);

    // Limit to prevent over-humanization (max 2 per response)
    const limited = injections.slice(0, 2);

    logger.debug(
      {
        turn: context.turnCount,
        injections: limited.map((i) => i.type),
        mood: this.mood,
      },
      'Humanization injections selected'
    );

    return limited;
  }

  /**
   * Apply injections to a response
   */
  applyInjections(response: string, injections: HumanizationInjection[]): string {
    let result = response;

    for (const injection of injections) {
      switch (injection.placement) {
        case 'prefix':
          result = `${injection.content} ${result}`;
          break;
        case 'suffix':
          result = `${result} ${injection.content}`;
          break;
        case 'interrupt':
          // Interrupt goes before the main response with emphasis
          result = `${injection.content} <break time="200ms"/> ${result}`;
          break;
        case 'standalone':
          // This would be used for pure interjections
          result = injection.content;
          break;
      }
    }

    return result;
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.mood = {
      energy: 0.75,
      engagement: 0.7,
      emotionalLoad: 0,
      heavyTopicCount: 0,
      inEmotionalMoment: false,
    };
    this.lastInjectionTurn.clear();
    this.injectionCounts.clear();
    this.turnCount = 0;
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const engineCache = new Map<string, DeepHumanizationEngine>();

export function getDeepHumanizationEngine(personaId: string): DeepHumanizationEngine {
  if (!engineCache.has(personaId)) {
    engineCache.set(personaId, new DeepHumanizationEngine(personaId));
  }
  return engineCache.get(personaId)!;
}

export function resetDeepHumanizationEngine(personaId: string): void {
  engineCache.get(personaId)?.reset();
}

// ============================================================================
// DETECTION HELPERS
// ============================================================================

/**
 * Detect if user presented evidence/counter-argument
 */
export function detectEvidence(userMessage: string): boolean {
  const evidencePatterns = [
    /here'?s the thing/i,
    /but actually/i,
    /what about/i,
    /consider this/i,
    /in my experience/i,
    /when I tried/i,
    /what happened was/i,
    /I disagree/i,
    /that'?s not how I see it/i,
    /but what if/i,
    /let me tell you/i,
    /I know someone who/i,
  ];

  return evidencePatterns.some((p) => p.test(userMessage));
}

/**
 * Detect breakthrough/insight moment
 */
export function detectBreakthrough(userMessage: string): boolean {
  const breakthroughPatterns = [
    /I (just )?realized/i,
    /it hit me/i,
    /I (just )?figured out/i,
    /maybe what I need/i,
    /finally/i,
    /for the first time/i,
    /I never thought of it/i,
    /I'?ve never told anyone/i,
    /this is hard to say/i,
    /oh my god/i,
    /wait\s*[,.!]/i,
  ];

  return breakthroughPatterns.some((p) => p.test(userMessage));
}

/**
 * Detect if agent response is giving advice
 */
export function detectAdviceGiving(agentMessage: string): boolean {
  const advicePatterns = [
    /you should/i,
    /I'?d recommend/i,
    /try to/i,
    /consider/i,
    /my advice/i,
    /what I suggest/i,
    /here'?s what/i,
    /the key is/i,
  ];

  return advicePatterns.some((p) => p.test(agentMessage));
}

/**
 * Classify topic weight
 */
export function classifyTopicWeight(
  userMessage: string,
  detectedEmotion?: string
): 'light' | 'medium' | 'heavy' {
  const heavyIndicators = [
    /died|death|passed away/i,
    /divorce|separated/i,
    /cancer|terminal/i,
    /suicide|depression/i,
    /abuse|trauma/i,
    /lost my job|fired/i,
    /bankruptcy|foreclosure/i,
  ];

  const lightIndicators = [
    /haha|lol|lmao/i,
    /great|awesome|amazing/i,
    /excited|happy|fun/i,
    /weekend|vacation/i,
  ];

  if (heavyIndicators.some((p) => p.test(userMessage))) return 'heavy';
  if (detectedEmotion === 'sadness' || detectedEmotion === 'fear') return 'heavy';
  if (lightIndicators.some((p) => p.test(userMessage))) return 'light';
  if (detectedEmotion === 'joy') return 'light';

  return 'medium';
}

/**
 * Detect if user seems disengaged based on message content
 * Short responses, disengagement words, or lack of substance
 */
export function detectDisengagement(userMessage: string): boolean {
  const trimmed = userMessage.trim().toLowerCase();

  // Very short responses (under 15 chars) are often disengaged
  if (trimmed.length < 15) {
    // Check for common disengagement words
    const disengagementWords = [
      'yeah',
      'ok',
      'okay',
      'sure',
      'fine',
      'whatever',
      'i guess',
      'uh huh',
      'mhm',
      'yep',
      'nope',
      'dunno',
      'idk',
      'meh',
      'eh',
      'k',
      'kk',
      'cool',
      'right',
    ];

    if (disengagementWords.some((word) => trimmed === word || trimmed.startsWith(`${word} `))) {
      return true;
    }
  }

  // Patterns indicating disengagement
  const disengagementPatterns = [
    /^yeah[.,!?]?$/i,
    /^ok(ay)?[.,!?]?$/i,
    /^sure[.,!?]?$/i,
    /^i (guess|suppose)[.,!?]?$/i,
    /^whatever[.,!?]?$/i,
    /^fine[.,!?]?$/i,
    /^not really[.,!?]?$/i,
    /^i don'?t (know|care)[.,!?]?$/i,
  ];

  return disengagementPatterns.some((p) => p.test(trimmed));
}

/**
 * Detect if user seems highly engaged based on message content
 * Long responses, enthusiasm markers, or deep sharing
 */
export function detectHighEngagement(userMessage: string): boolean {
  const trimmed = userMessage.trim().toLowerCase();

  // Long responses (over 100 chars) often indicate engagement
  const isLongResponse = trimmed.length > 100;

  // Enthusiasm markers
  const enthusiasmPatterns = [
    /!{2,}/, // Multiple exclamation marks
    /that'?s (so |really )?(interesting|cool|amazing|fascinating)/i,
    /i (love|really like) (this|that|what you)/i,
    /wow/i,
    /oh my (god|gosh)/i,
    /yes!+/i,
    /exactly!?/i,
    /you know what/i,
    /i'?ve (been thinking|never thought)/i,
    /i want to tell you/i,
    /can i share something/i,
    /this is (hard|difficult|important)/i,
    /i'?ve never told anyone/i,
  ];

  const hasEnthusiasm = enthusiasmPatterns.some((p) => p.test(trimmed));

  // Deep sharing indicators
  const deepSharingPatterns = [
    /i feel like/i,
    /it makes me feel/i,
    /i'?ve been struggling/i,
    /honestly|truthfully/i,
    /i realized/i,
    /the thing is/i,
    /what i really want/i,
  ];

  const isDeepSharing = deepSharingPatterns.some((p) => p.test(trimmed));

  // Combined heuristic
  return (isLongResponse && (hasEnthusiasm || isDeepSharing)) || (hasEnthusiasm && isDeepSharing);
}
