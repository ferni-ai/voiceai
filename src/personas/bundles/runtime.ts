/**
 * Bundle Runtime Engine
 *
 * Provides runtime access to bundle content with intelligent selection,
 * relationship-aware behavior, and contextual response generation.
 */

import { getEmotionalArcTracker, getStoryTimingEngine } from '../../conversation/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  BundleConflictHandling,
  BundleContextualNuances,
  BundleInnerWorld,
  BundleMemoryPatterns,
  BundleMicroExpressions,
  BundlePersonaModes,
  BundleQuirks,
  BundleRelationshipStages,
  BundleSensoryWorld,
  BundleSituationalResponses,
  BundleStoryGraph,
  BundleVoiceExpressions,
  LoadedPersonaBundle,
  PersonaMode,
  RelationshipStage,
  VoiceExpression,
} from './types.js';

// ============================================================================
// RUNTIME STATE
// ============================================================================

/**
 * Bundle runtime state - tracks session and persona state.
 *
 * Required fields are those needed by the BundleRuntimeEngine.
 * For partial state storage (e.g., UserData), use Partial<BundleRuntimeState>
 * or the UserBundleState type alias.
 */
export interface BundleRuntimeState {
  personaId: string;
  relationshipTurns: number;
  sessionCount: number;
  currentMode: string;
  lastStoryTurn: number;
  storiesToldThisSession: string[];
  /** Tracks the last mode transition (e.g., "listening_to_coaching") */
  lastModeTransition?: string;
  userName?: string;
  timeOfDay?: string;
  dayOfWeek?: string;
  detectedEmotion?: string;
  moodState?: Record<string, unknown>;
}

/**
 * Subset of BundleRuntimeState for UserData storage.
 * Contains only the fields typically stored on the session.
 */
export type UserBundleState = Pick<
  BundleRuntimeState,
  'relationshipTurns' | 'currentMode' | 'storiesToldThisSession' | 'lastModeTransition'
>;

// ============================================================================
// BUNDLE RUNTIME ENGINE
// ============================================================================

export class BundleRuntimeEngine {
  private bundle: LoadedPersonaBundle;
  private state: BundleRuntimeState;

  // Cached content
  private voiceExpressions: BundleVoiceExpressions | null = null;
  private situationalResponses: BundleSituationalResponses | null = null;
  private relationshipStages: BundleRelationshipStages | null = null;
  private memoryPatterns: BundleMemoryPatterns | null = null;
  private personaModes: BundlePersonaModes | null = null;
  private storyGraph: BundleStoryGraph | null = null;
  private microExpressions: BundleMicroExpressions | null = null;
  private contextualNuances: BundleContextualNuances | null = null;
  private conflictHandling: BundleConflictHandling | null = null;

  // Deep personality content
  private innerWorld: BundleInnerWorld | null = null;
  private sensoryWorld: BundleSensoryWorld | null = null;
  private quirks: BundleQuirks | null = null;

  // Performance: Cached sorted stages (invalidated when relationshipStages changes)
  private cachedSortedStages: Array<[string, RelationshipStage]> | null = null;

  constructor(bundle: LoadedPersonaBundle, initialState?: Partial<BundleRuntimeState>) {
    this.bundle = bundle;
    this.state = {
      personaId: bundle.manifest.identity.id,
      relationshipTurns: 0,
      sessionCount: 0,
      currentMode: 'listening',
      lastStoryTurn: -Infinity,
      storiesToldThisSession: [],
      ...initialState,
    };
  }

  /** FIX BUG #bundle-7: Timeout for content loading operations */
  private static readonly CONTENT_LOAD_TIMEOUT_MS = 5000; // 5 seconds

  /**
   * Initialize all extended content (lazy load on first use)
   * FIX BUG #bundle-7: Added timeout to prevent hanging on slow/stuck file operations
   */
  async initialize(): Promise<void> {
    const startTime = Date.now();

    // Helper to wrap promises with timeout
    const withTimeout = async <T>(
      promise: Promise<T> | undefined,
      name: string
    ): Promise<T | null> => {
      if (!promise) return Promise.resolve(null);

      return Promise.race([
        promise.then((result) => result ?? null),
        new Promise<null>((resolve) => {
          setTimeout(() => {
            getLogger().warn(
              { personaId: this.state.personaId, operation: name },
              'Content load timed out'
            );
            resolve(null);
          }, BundleRuntimeEngine.CONTENT_LOAD_TIMEOUT_MS);
        }),
      ]);
    };

    // Load all extended content in parallel with timeout protection
    const [
      voiceExpressions,
      situationalResponses,
      relationshipStages,
      memoryPatterns,
      personaModes,
      storyGraph,
      microExpressions,
      contextualNuances,
      conflictHandling,
    ] = await Promise.all([
      withTimeout(this.bundle.getVoiceExpressions?.(), 'voiceExpressions'),
      withTimeout(this.bundle.getSituationalResponses?.(), 'situationalResponses'),
      withTimeout(this.bundle.getRelationshipStages?.(), 'relationshipStages'),
      withTimeout(this.bundle.getMemoryPatterns?.(), 'memoryPatterns'),
      withTimeout(this.bundle.getPersonaModes?.(), 'personaModes'),
      withTimeout(this.bundle.getStoryGraph?.(), 'storyGraph'),
      withTimeout(this.bundle.getMicroExpressions?.(), 'microExpressions'),
      withTimeout(this.bundle.getContextualNuances?.(), 'contextualNuances'),
      withTimeout(this.bundle.getConflictHandling?.(), 'conflictHandling'),
    ]);

    this.voiceExpressions = voiceExpressions;
    this.situationalResponses = situationalResponses;
    this.relationshipStages = relationshipStages;
    this.memoryPatterns = memoryPatterns;
    this.personaModes = personaModes;
    this.storyGraph = storyGraph;
    this.microExpressions = microExpressions;
    this.contextualNuances = contextualNuances;
    this.conflictHandling = conflictHandling;

    // Load inner world content (also with timeout protection via race in loadInnerWorld)
    await this.loadInnerWorld();

    // Update time context
    this.updateTimeContext();

    const loadTime = Date.now() - startTime;
    getLogger().debug(
      {
        personaId: this.state.personaId,
        loadTimeMs: loadTime,
        hasVoiceExpressions: !!this.voiceExpressions,
        hasSituationalResponses: !!this.situationalResponses,
        hasRelationshipStages: !!this.relationshipStages,
        hasInnerWorld: this.hasInnerWorld(),
      },
      'Bundle runtime initialized'
    );
  }

  /**
   * Update time context for the current session
   * FIX BUG #bundle-8: Support user timezone offset
   *
   * @param userTimezoneOffset - Offset in minutes from UTC (e.g., -480 for PST)
   */
  updateTimeContext(userTimezoneOffset?: number): void {
    let now = new Date();

    // FIX BUG #bundle-8: Adjust for user's timezone if provided
    if (userTimezoneOffset !== undefined) {
      // Get UTC time
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      // Apply user's timezone offset
      now = new Date(utc + userTimezoneOffset * 60000);
    }

    const hour = now.getHours();
    this.state.timeOfDay =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    this.state.dayOfWeek = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][now.getDay()];
  }

  /**
   * Set user's timezone offset for time-aware responses
   */
  setUserTimezone(offsetMinutes: number): void {
    this.updateTimeContext(offsetMinutes);
  }

  // ============================================================================
  // RELATIONSHIP STAGE
  // ============================================================================

  /**
   * Get sorted stages with caching for performance.
   * Stages are sorted by turn_threshold descending (highest first).
   */
  private getSortedStages(): Array<[string, RelationshipStage]> {
    if (!this.relationshipStages) return [];

    // Use cached version if available
    if (this.cachedSortedStages) return this.cachedSortedStages;

    // Sort once and cache
    this.cachedSortedStages = Object.entries(this.relationshipStages.stages).sort(
      ([, a], [, b]) => b.turn_threshold - a.turn_threshold
    );

    return this.cachedSortedStages;
  }

  getCurrentRelationshipStage(): RelationshipStage | null {
    if (!this.relationshipStages) return null;

    const stages = this.getSortedStages();

    for (const [, stage] of stages) {
      if (this.state.relationshipTurns >= stage.turn_threshold) {
        if (stage.session_threshold && this.state.sessionCount < stage.session_threshold) {
          continue;
        }
        return stage;
      }
    }

    return stages[stages.length - 1]?.[1] ?? null;
  }

  getRelationshipStageName(): string {
    if (!this.relationshipStages) return 'unknown';

    const stages = this.getSortedStages();

    for (const [name, stage] of stages) {
      if (this.state.relationshipTurns >= stage.turn_threshold) {
        return name;
      }
    }

    return 'stranger';
  }

  applyProgressionTrigger(triggerName: string): void {
    if (!this.relationshipStages?.progression_triggers) return;

    const trigger = this.relationshipStages.progression_triggers[triggerName];
    if (trigger) {
      this.state.relationshipTurns += trigger.turn_bonus;
      getLogger().debug({ triggerName, bonus: trigger.turn_bonus }, 'Progression trigger applied');
    }
  }

  // ============================================================================
  // PERSONA MODE
  // ============================================================================

  getCurrentMode(): PersonaMode | null {
    if (!this.personaModes) return null;
    return this.personaModes.modes[this.state.currentMode] ?? null;
  }

  /**
   * Detect and set persona mode based on user text or emotional signals
   * FIX BUG #bundle-11: Validate mode exists before setting
   */
  detectAndSetMode(userText: string, emotionalSignal?: string): string {
    if (!this.personaModes?.mode_detection) {
      return this.state.currentMode;
    }

    const detection = this.personaModes.mode_detection;
    const lowerText = userText.toLowerCase();

    // Helper to validate and set mode
    const setModeIfValid = (mode: string): boolean => {
      // FIX BUG #bundle-11: Only set mode if it exists in the modes map
      if (this.personaModes?.modes && mode in this.personaModes.modes) {
        this.state.currentMode = mode;
        return true;
      }
      getLogger().warn({ personaId: this.state.personaId, mode }, 'Attempted to set invalid mode');
      return false;
    };

    // Check keyword triggers
    if (detection.keywords) {
      for (const [mode, keywords] of Object.entries(detection.keywords)) {
        if (keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
          if (setModeIfValid(mode)) {
            return mode;
          }
        }
      }
    }

    // Check emotional signals
    if (emotionalSignal && detection.emotional_signals) {
      const modesForEmotion = detection.emotional_signals[emotionalSignal];
      if (modesForEmotion && modesForEmotion.length > 0) {
        const mode = modesForEmotion[0];
        if (setModeIfValid(mode)) {
          return mode;
        }
      }
    }

    return this.state.currentMode;
  }

  getModeTransitionPhrase(fromMode: string, toMode: string): string | null {
    if (!this.personaModes?.mode_transitions) return null;

    const transitionKey = `${fromMode}_to_${toMode}`;
    const transition = this.personaModes.mode_transitions[transitionKey];

    return transition?.transition_phrase ?? null;
  }

  // ============================================================================
  // VOICE EXPRESSIONS
  // ============================================================================

  getVoiceExpression(emotionType: string): VoiceExpression | null {
    if (!this.voiceExpressions?.emotional_expressions) return null;
    return this.voiceExpressions.emotional_expressions[emotionType] ?? null;
  }

  /**
   * Get a random expression phrase for an emotion
   * FIX BUG #bundle-12: Validate SSML wrapper format before applying
   */
  getRandomExpressionPhrase(emotionType: string): string | null {
    const expression = this.getVoiceExpression(emotionType);
    if (!expression || !expression.phrases.length) return null;

    const phrase = expression.phrases[Math.floor(Math.random() * expression.phrases.length)];

    // FIX BUG #bundle-12: Validate and apply SSML wrapper if present
    if (expression.ssml_wrapper) {
      const wrapper = expression.ssml_wrapper;
      // Validate wrapper format - should be valid SSML opening tag
      if (typeof wrapper === 'string' && wrapper.startsWith('<') && !wrapper.includes('><')) {
        // Wrapper looks valid, apply it
        // If wrapper is self-closing or complete, just concatenate
        if (wrapper.endsWith('/>') || wrapper.includes('</')) {
          return `${wrapper}${phrase}`;
        }
        // If wrapper is an opening tag, try to close it
        const tagMatch = wrapper.match(/<(\w+)/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          return `${wrapper}${phrase}</${tagName}>`;
        }
      }
      // Wrapper format is invalid/stale, log and skip
      getLogger().warn(
        { emotionType, wrapper: wrapper.slice(0, 50) },
        'Invalid SSML wrapper format'
      );
    }
    return phrase;
  }

  getBreathingPattern(context: string): string | null {
    return this.voiceExpressions?.breathing_patterns?.[context] ?? null;
  }

  // ============================================================================
  // SITUATIONAL RESPONSES
  // ============================================================================

  /**
   * Get situational response for a specific category and situation
   * FIX BUG #bundle-18: Added proper type validation instead of unsafe coercion
   */
  getSituationalResponse(
    category: 'celebrations' | 'condolences' | 'difficult_moments',
    situation: string
  ): {
    immediate: string;
    followUp?: string;
    dontSay?: string[];
  } | null {
    if (!this.situationalResponses) return null;

    const responses = this.situationalResponses[category];
    if (!responses) return null;

    const response = responses[situation];
    if (!response || typeof response !== 'object') return null;

    // FIX BUG #bundle-18: Type-safe property access with validation
    const rawResponse = response as unknown as Record<string, unknown>;

    // Extract immediate response (supports both 'immediate' and legacy 'response' keys)
    let immediate = '';
    if (typeof rawResponse['immediate'] === 'string') {
      immediate = rawResponse['immediate'];
    } else if (typeof rawResponse['response'] === 'string') {
      immediate = rawResponse['response'];
    }

    if (!immediate) return null; // No valid response found

    return {
      immediate,
      followUp: typeof rawResponse['follow_up'] === 'string' ? rawResponse['follow_up'] : undefined,
      dontSay: Array.isArray(rawResponse['dont_say'])
        ? rawResponse['dont_say'].filter((s) => typeof s === 'string')
        : undefined,
    };
  }

  // ============================================================================
  // MEMORY PATTERNS
  // ============================================================================

  getNameUsagePhrase(context: 'opening' | 'mid_sentence' | 'emphasis' | 'warmth'): string | null {
    if (!this.memoryPatterns?.name_usage?.patterns) return null;

    const patterns = this.memoryPatterns.name_usage.patterns[context];
    if (!patterns || !patterns.length) return null;

    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  getCallbackPhrase(
    type: 'callback_to_earlier' | 'callback_to_previous_session' | 'long_term_memory'
  ): string | null {
    if (!this.memoryPatterns?.reference_patterns) return null;

    const pattern = this.memoryPatterns.reference_patterns[type];
    if (!pattern || !pattern.phrases.length) return null;

    return pattern.phrases[Math.floor(Math.random() * pattern.phrases.length)];
  }

  getDetailCallback(category: string): string | null {
    if (!this.memoryPatterns?.detail_callbacks) return null;

    const callback = this.memoryPatterns.detail_callbacks[category];
    if (!callback || !callback.patterns.length) return null;

    return callback.patterns[Math.floor(Math.random() * callback.patterns.length)];
  }

  // ============================================================================
  // STORY TIMING (Enhanced with StoryTimingEngine)
  // ============================================================================

  shouldTellStory(currentTurn: number): { should: boolean; reason?: string; confidence?: number } {
    // First check bundle-specific rules
    if (this.storyGraph?.story_timing_rules) {
      const rules = this.storyGraph.story_timing_rules;

      // Check minimum turns before first story
      if (
        rules.minimum_turns_before_first_story &&
        this.state.storiesToldThisSession.length === 0 &&
        currentTurn < rules.minimum_turns_before_first_story
      ) {
        return { should: false, reason: 'too_early_in_conversation' };
      }

      // Check minimum turns between stories
      if (
        rules.minimum_turns_between_stories &&
        currentTurn - this.state.lastStoryTurn < rules.minimum_turns_between_stories
      ) {
        return { should: false, reason: 'too_soon_after_last_story' };
      }

      // Check max stories per session
      if (
        rules.max_stories_per_session &&
        this.state.storiesToldThisSession.length >= rules.max_stories_per_session
      ) {
        return { should: false, reason: 'max_stories_reached' };
      }

      // Check contextual restrictions (e.g., never_tell_story_when: ['user_is_crying'])
      if (rules.never_tell_story_when) {
        const emotionalArc = getEmotionalArcTracker();
        const arc = emotionalArc.getArc();

        // Check if user needs emotional support
        if (
          arc.needsEmotionalSupport &&
          rules.never_tell_story_when.includes('user_is_distressed')
        ) {
          return { should: false, reason: 'user_needs_emotional_support' };
        }

        // Check for high negative arousal
        if (arc.currentArousal > 0.7 && arc.currentValence < -0.2) {
          return { should: false, reason: 'user_agitated' };
        }
      }
    }

    // Now consult the StoryTimingEngine for more nuanced decision
    const storyEngine = getStoryTimingEngine();
    const emotionalArc = getEmotionalArcTracker();

    // Determine user engagement based on emotional arc and pacing
    let userEngagement: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
    const arc = emotionalArc.getArc();
    if (arc.trajectory === 'improving' || arc.conversationTemperature > 0.6) {
      userEngagement = 'high';
    } else if (arc.needsEmotionalSupport) {
      userEngagement = 'low';
    } else {
      userEngagement = 'medium';
    }

    // Build story timing context
    const timingContext = {
      turnCount: currentTurn,
      conversationDurationMs: currentTurn * 30000, // Rough estimate: 30s per turn
      lastStoryTurn: this.state.lastStoryTurn > 0 ? this.state.lastStoryTurn : undefined,
      storiesToldThisSession: this.state.storiesToldThisSession,
      emotionalArc: arc,
      userEngagement,
      userPacing: arc.conversationTemperature > 0.7 ? ('rushed' as const) : ('normal' as const),
    };

    // Note: We don't have persona config here, so we use the engine's gating only
    const result = storyEngine.evaluateStoryTiming(
      { stories: [] } as any, // Minimal persona - just checking timing
      timingContext
    );

    if (!result.shouldTell && result.reason) {
      return {
        should: false,
        reason: result.reason,
        confidence: result.confidenceScore,
      };
    }

    return { should: true, confidence: result.confidenceScore };
  }

  getRecommendedStories(context: string): string[] {
    if (!this.storyGraph?.context_triggers) return [];

    const trigger = this.storyGraph.context_triggers[context];
    if (!trigger) return [];

    // Filter out already told stories
    return trigger.recommended_stories.filter(
      (id) => !this.state.storiesToldThisSession.includes(id)
    );
  }

  /**
   * Get the persona ID from the bundle
   */
  getPersonaId(): string {
    return this.bundle.manifest.identity.id;
  }

  /**
   * Get recommended stories enhanced with evolution engine insights
   * This combines bundle context triggers with community-learned effectiveness
   */
  async getRecommendedStoriesWithEvolution(
    context: { topic: string; userEmotion: string; relationshipStage?: string },
    limit = 3
  ): Promise<Array<{ storyId: string; score: number; reason: string }>> {
    const personaId = this.getPersonaId();

    try {
      // Import dynamically to avoid circular dependencies
      const { getAgentEvolution } = await import('../../intelligence/agent-evolution.js');
      const evolution = getAgentEvolution();

      const relationshipStage = context.relationshipStage || this.getRelationshipStageName();

      // Get evolution-ranked recommendations
      const evolutionRecs = evolution.getRecommendedStories(
        personaId,
        {
          topic: context.topic,
          userEmotion: context.userEmotion,
          relationshipStage,
        },
        limit * 2 // Get more to filter
      );

      // Filter out already-told stories
      const filteredRecs = evolutionRecs.filter(
        (rec) => !this.state.storiesToldThisSession.includes(rec.storyId)
      );

      // If evolution has recommendations, use them
      if (filteredRecs.length > 0) {
        getLogger().debug(
          {
            evolutionRecs: filteredRecs.length,
            context: context.topic,
          },
          'Using evolution-enhanced story recommendations'
        );
        return filteredRecs.slice(0, limit);
      }

      // Fall back to bundle triggers
      const bundleRecs = this.getRecommendedStories(context.topic);
      return bundleRecs.slice(0, limit).map((storyId) => ({
        storyId,
        score: 0.5,
        reason: 'Bundle context trigger',
      }));
    } catch (error) {
      getLogger().debug(
        { error: String(error) },
        'Evolution story recommendation unavailable, using bundle fallback'
      );
      const bundleRecs = this.getRecommendedStories(context.topic);
      return bundleRecs.slice(0, limit).map((storyId) => ({
        storyId,
        score: 0.5,
        reason: 'Bundle context trigger',
      }));
    }
  }

  recordStoryTold(storyId: string, turn: number): void {
    this.state.storiesToldThisSession.push(storyId);
    this.state.lastStoryTurn = turn;

    // Sync with StoryTimingEngine for cross-module consistency
    const storyEngine = getStoryTimingEngine();
    storyEngine.recordStoryTold(storyId, turn);
  }

  /**
   * Record story usage with feedback for evolution learning
   */
  async recordStoryUsage(
    storyId: string,
    turn: number,
    userReaction?: {
      engagement: 'positive' | 'neutral' | 'negative';
      continued: boolean;
      emotionalShift?: string;
    }
  ): Promise<void> {
    const personaId = this.getPersonaId();

    // Record locally first
    this.recordStoryTold(storyId, turn);

    // Feed to community insights for evolution learning
    if (userReaction) {
      try {
        const { getCommunityInsights } = await import('../../intelligence/community-insights.js');
        const insights = getCommunityInsights();

        // Record story resonance for future recommendations
        const reactionMap: Record<
          string,
          'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent'
        > = {
          positive: 'inspired',
          neutral: 'indifferent',
          negative: 'indifferent',
        };

        insights.recordStoryUsage(
          storyId,
          personaId,
          {
            topic: this.state.currentMode || 'general',
            relationshipStage: this.getRelationshipStageName(),
            userEmotion: userReaction.emotionalShift || 'neutral',
          },
          reactionMap[userReaction.engagement],
          userReaction.engagement === 'positive'
            ? 0.9
            : userReaction.engagement === 'neutral'
              ? 0.5
              : 0.2
        );

        getLogger().debug(
          {
            storyId,
            personaId,
            engagement: userReaction.engagement,
          },
          'Recorded story usage to community insights'
        );
      } catch (error) {
        getLogger().debug({ error: String(error) }, 'Failed to record story usage (non-fatal)');
      }
    }
  }

  getStoryIntroPhrase(): string | null {
    const phrases = this.storyGraph?.story_delivery?.introduction_phrases;
    if (!phrases || !phrases.length) return null;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  // ============================================================================
  // MICRO-EXPRESSIONS
  // ============================================================================

  getListeningSound(
    emotion: 'neutral' | 'concerned' | 'interested' | 'surprised' | 'delighted' | 'sympathetic'
  ): string | null {
    if (!this.microExpressions?.listening_sounds?.with_emotion) return null;

    const emotionSounds = this.microExpressions.listening_sounds.with_emotion[emotion];
    if (!emotionSounds || !emotionSounds.sounds.length) return null;

    const sound = emotionSounds.sounds[Math.floor(Math.random() * emotionSounds.sounds.length)];

    if (emotionSounds.ssml) {
      return `${emotionSounds.ssml}${sound}`;
    }
    return sound;
  }

  getVocalTexture(
    type: 'laughter' | 'thinking' | 'acknowledgment' | 'surprise' | 'concern',
    variant: string
  ): string | null {
    if (!this.microExpressions?.vocal_textures) return null;

    const textures = this.microExpressions.vocal_textures[type];
    if (!textures) return null;

    return textures[variant] ?? null;
  }

  getPacingVariation(context: string): { speed: number; ssmlPrefix?: string } | null {
    if (!this.microExpressions?.pacing_variations) return null;

    const variation = this.microExpressions.pacing_variations[context];
    if (!variation) return null;

    return {
      speed: variation.speed,
      ssmlPrefix: variation.ssml_prefix,
    };
  }

  // ============================================================================
  // CONTEXTUAL NUANCES
  // ============================================================================

  getTimeOfDayGreeting(): string | null {
    if (!this.contextualNuances?.time_of_day) return null;

    const hour = new Date().getHours();

    // Find matching time period
    for (const [, config] of Object.entries(this.contextualNuances.time_of_day)) {
      if (config.hours && config.hours.includes(hour) && config.greetings?.length) {
        return config.greetings[Math.floor(Math.random() * config.greetings.length)];
      }
    }

    return null;
  }

  getTimeOfDayModifiers(): { energyMultiplier: number; paceMultiplier: number; volume?: string } {
    if (!this.contextualNuances?.time_of_day) {
      return { energyMultiplier: 1.0, paceMultiplier: 1.0 };
    }

    const hour = new Date().getHours();

    for (const [, config] of Object.entries(this.contextualNuances.time_of_day)) {
      if (config.hours && config.hours.includes(hour)) {
        return {
          energyMultiplier: config.energy_multiplier ?? 1.0,
          paceMultiplier: config.pace_multiplier ?? 1.0,
          volume: config.volume,
        };
      }
    }

    return { energyMultiplier: 1.0, paceMultiplier: 1.0 };
  }

  getDayOfWeekAcknowledgment(): string | null {
    if (!this.contextualNuances?.day_of_week) return null;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];

    // Check for weekend
    if (today === 'saturday' || today === 'sunday') {
      const { weekend } = this.contextualNuances.day_of_week;
      if (weekend?.acknowledgments?.length) {
        return weekend.acknowledgments[Math.floor(Math.random() * weekend.acknowledgments.length)];
      }
    }

    const config = this.contextualNuances.day_of_week[today];
    if (config?.acknowledgments?.length) {
      return config.acknowledgments[Math.floor(Math.random() * config.acknowledgments.length)];
    }

    return null;
  }

  // ============================================================================
  // CONFLICT HANDLING
  // ============================================================================

  detectPushback(userText: string): { type: string; response: string } | null {
    if (!this.conflictHandling?.user_pushback) return null;

    const lowerText = userText.toLowerCase();

    for (const [type, config] of Object.entries(this.conflictHandling.user_pushback)) {
      if (config.detection_patterns.some((p) => lowerText.includes(p.toLowerCase()))) {
        return {
          type,
          response: config.response.immediate,
        };
      }
    }

    return null;
  }

  getPushBackPhrase(context: 'gentle' | 'direct'): string | null {
    if (!this.conflictHandling?.persona_disagreement?.how_to_push_back) return null;

    const phrases = this.conflictHandling.persona_disagreement.how_to_push_back[context];
    if (!phrases || !phrases.length) return null;

    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  getRepairPhrase(type: 'check_in' | 'acknowledge_rupture' | 'rebuild_connection'): string | null {
    if (!this.conflictHandling?.repair_after_conflict) return null;

    const repair = this.conflictHandling.repair_after_conflict[type];
    if (!repair || !repair.phrases?.length) return null;

    return repair.phrases[Math.floor(Math.random() * repair.phrases.length)];
  }

  // ============================================================================
  // INNER WORLD - Deep personality content
  // ============================================================================

  /**
   * Load inner world content (called after initialization)
   * FIX BUG #bundle-4: Log specific file errors for debugging
   */
  async loadInnerWorld(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      // Try to load inner-world.json
      const innerWorldPath = path.join(
        this.bundle.bundlePath,
        'content',
        'identity',
        'inner-world.json'
      );
      try {
        const content = await fs.readFile(innerWorldPath, 'utf-8');
        this.innerWorld = JSON.parse(content);
      } catch (err) {
        // FIX BUG #bundle-4: Log specific file path on error (only at debug level)
        const e = err as NodeJS.ErrnoException;
        if (e.code !== 'ENOENT') {
          getLogger().debug(
            { path: innerWorldPath, error: String(err) },
            'Failed to load inner-world.json'
          );
        }
      }

      // Try to load sensory-world.json
      const sensoryWorldPath = path.join(
        this.bundle.bundlePath,
        'content',
        'identity',
        'sensory-world.json'
      );
      try {
        const content = await fs.readFile(sensoryWorldPath, 'utf-8');
        this.sensoryWorld = JSON.parse(content);
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code !== 'ENOENT') {
          getLogger().debug(
            { path: sensoryWorldPath, error: String(err) },
            'Failed to load sensory-world.json'
          );
        }
      }

      // Try to load quirks.json
      const quirksPath = path.join(this.bundle.bundlePath, 'content', 'behaviors', 'quirks.json');
      try {
        const content = await fs.readFile(quirksPath, 'utf-8');
        this.quirks = JSON.parse(content);
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code !== 'ENOENT') {
          getLogger().debug({ path: quirksPath, error: String(err) }, 'Failed to load quirks.json');
        }
      }
    } catch (error) {
      getLogger().debug(
        { error: String(error), personaId: this.state.personaId },
        'Failed to load inner world content'
      );
    }
  }

  /**
   * Get a self-talk phrase for when the persona is struggling
   */
  getSelfTalk(context: 'struggling' | 'critic' | 'champion' | 'mantra'): string | null {
    if (!this.innerWorld?.inner_voice) return null;

    switch (context) {
      case 'struggling':
        return this.innerWorld.inner_voice.what_they_tell_themselves_when_struggling ?? null;
      case 'critic':
        return this.innerWorld.inner_voice.inner_critic_voice ?? null;
      case 'champion':
        return this.innerWorld.inner_voice.inner_champion_voice ?? null;
      case 'mantra':
        return this.innerWorld.inner_voice.mantra ?? null;
      default:
        return null;
    }
  }

  /**
   * Get a random self-talk pattern
   */
  getRandomSelfTalk(): string | null {
    if (!this.innerWorld?.inner_voice?.self_talk_patterns?.length) return null;
    const patterns = this.innerWorld.inner_voice.self_talk_patterns;
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  /**
   * Get a contradiction (belief vs behavior) to make the persona feel more human
   */
  getContradiction(): { belief: string; but: string } | null {
    if (!this.innerWorld?.contradictions?.belief_vs_behavior?.length) return null;
    const contradictions = this.innerWorld.contradictions.belief_vs_behavior;
    return contradictions[Math.floor(Math.random() * contradictions.length)];
  }

  /**
   * Get public vs private self for moments of vulnerability
   */
  getPublicPrivateSelf(): { public_self: string; private_self: string } | null {
    return this.innerWorld?.contradictions?.public_vs_private ?? null;
  }

  /**
   * Get a sensory memory triggered by something in the conversation
   */
  getSensoryMemory(trigger: string): { trigger: string; memory: string; emotion: string } | null {
    if (!this.innerWorld?.embodied_memories?.sense_memories?.length) return null;

    const lowerTrigger = trigger.toLowerCase();

    // Look for a matching memory
    const memory = this.innerWorld.embodied_memories.sense_memories.find((m) =>
      lowerTrigger.includes(m.trigger.toLowerCase())
    );

    return memory ?? null;
  }

  /**
   * Get a random sensory memory for storytelling
   */
  getRandomSensoryMemory(): { trigger: string; memory: string; emotion: string } | null {
    if (!this.innerWorld?.embodied_memories?.sense_memories?.length) return null;
    const memories = this.innerWorld.embodied_memories.sense_memories;
    return memories[Math.floor(Math.random() * memories.length)];
  }

  /**
   * Check if user message triggers an emotional flashpoint
   */
  detectEmotionalFlashpoint(
    userText: string
  ): { type: 'tears' | 'anger' | 'joy' | 'shutdown'; trigger: string } | null {
    if (!this.innerWorld?.emotional_flashpoints) return null;

    const lowerText = userText.toLowerCase();

    // FIX BUG #bundle-20: Helper to match triggers without arbitrary slicing
    // Uses word boundary detection for more accurate matching
    const matchesTrigger = (text: string, trigger: string): boolean => {
      const lowerTrigger = trigger.toLowerCase().trim();
      if (!lowerTrigger) return false;

      // Check for exact phrase match or word boundary match
      // This handles "my mother passed" matching "mother" without false positives
      return text.includes(lowerTrigger);
    };

    for (const trigger of this.innerWorld.emotional_flashpoints.instant_tears || []) {
      if (matchesTrigger(lowerText, trigger)) {
        return { type: 'tears', trigger };
      }
    }

    for (const trigger of this.innerWorld.emotional_flashpoints.instant_anger || []) {
      if (matchesTrigger(lowerText, trigger)) {
        return { type: 'anger', trigger };
      }
    }

    for (const trigger of this.innerWorld.emotional_flashpoints.instant_joy || []) {
      if (matchesTrigger(lowerText, trigger)) {
        return { type: 'joy', trigger };
      }
    }

    for (const trigger of this.innerWorld.emotional_flashpoints.instant_shutdown || []) {
      if (matchesTrigger(lowerText, trigger)) {
        return { type: 'shutdown', trigger };
      }
    }

    return null;
  }

  /**
   * Get an unfinished business item (regret, unresolved question)
   */
  getRegret(): string | null {
    if (!this.innerWorld?.unfinished_business?.regrets?.length) return null;
    const { regrets } = this.innerWorld.unfinished_business;
    return regrets[Math.floor(Math.random() * regrets.length)];
  }

  /**
   * Get what keeps them up at night
   */
  getWhatKeepsThemUp(): string | null {
    return this.innerWorld?.unfinished_business?.what_keeps_them_up ?? null;
  }

  /**
   * Get legacy hope
   */
  getLegacyHope(): string | null {
    return this.innerWorld?.dreams_still_chasing?.legacy_hope ?? null;
  }

  /**
   * Get a secret fear
   */
  getSecretFear(): string | null {
    if (!this.innerWorld?.secret_self?.secret_fears?.length) return null;
    const fears = this.innerWorld.secret_self.secret_fears;
    return fears[Math.floor(Math.random() * fears.length)];
  }

  /**
   * Get a guilty admission (for moments of vulnerability)
   */
  getGuiltyAdmission(): string | null {
    if (!this.innerWorld?.secret_self?.guilty_admissions?.length) return null;
    const admissions = this.innerWorld.secret_self.guilty_admissions;
    return admissions[Math.floor(Math.random() * admissions.length)];
  }

  /**
   * Get their line they won't cross
   */
  getLineWontCross(): string | null {
    return this.innerWorld?.values_under_pressure?.line_they_wont_cross ?? null;
  }

  /**
   * Get value hierarchy
   */
  getValueHierarchy(): string[] | null {
    return this.innerWorld?.values_under_pressure?.hierarchy_when_forced_to_choose ?? null;
  }

  // ============================================================================
  // SENSORY WORLD
  // ============================================================================

  /**
   * Get a phrase they uniquely use (voice fingerprint)
   */
  getSignaturePhrase(): string | null {
    if (!this.sensoryWorld?.voice_fingerprint?.phrases_that_are_theirs?.length) return null;
    const phrases = this.sensoryWorld.voice_fingerprint.phrases_that_are_theirs;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Get a word only they use
   */
  getUniqueWord(): string | null {
    if (!this.sensoryWorld?.voice_fingerprint?.words_only_they_use?.length) return null;
    const words = this.sensoryWorld.voice_fingerprint.words_only_they_use;
    return words[Math.floor(Math.random() * words.length)];
  }

  /**
   * Get a verbal tic
   */
  getVerbalTic(): string | null {
    if (!this.sensoryWorld?.voice_fingerprint?.verbal_tics?.length) return null;
    const tics = this.sensoryWorld.voice_fingerprint.verbal_tics;
    return tics[Math.floor(Math.random() * tics.length)];
  }

  /**
   * Get a mentor quote
   */
  getMentorQuote(): { mentor: string; quote: string; lesson: string } | null {
    if (!this.sensoryWorld?.relationship_history?.mentors_who_shaped_them?.length) return null;
    const mentors = this.sensoryWorld.relationship_history.mentors_who_shaped_them;
    const mentor = mentors[Math.floor(Math.random() * mentors.length)];
    return {
      mentor: mentor.who ?? '',
      quote: mentor.a_thing_they_said ?? '',
      lesson: mentor.what_they_taught ?? '',
    };
  }

  /**
   * Get music for mood
   */
  getMusicForMood(mood: string): string | null {
    if (!this.sensoryWorld?.sensory_preferences?.music_for_different_moods) return null;
    return this.sensoryWorld.sensory_preferences.music_for_different_moods[mood] ?? null;
  }

  /**
   * Get what fills their soul (sounds)
   */
  getSoulFillingSounds(): string[] | null {
    return this.sensoryWorld?.sensory_preferences?.sounds_that_fill_the_soul ?? null;
  }

  /**
   * Get their growth edge (something they're working on)
   */
  getGrowthEdge(): string | null {
    if (!this.sensoryWorld?.growth_edges?.actively_working_on?.length) return null;
    const edges = this.sensoryWorld.growth_edges.actively_working_on;
    return edges[Math.floor(Math.random() * edges.length)];
  }

  /**
   * Get their recharge method
   */
  getRechargeMethod(): string | null {
    return this.sensoryWorld?.daily_rhythms?.how_they_recharge ?? null;
  }

  // ============================================================================
  // PHYSICAL PRESENCE - Embodied persona presence
  // ============================================================================

  /**
   * Get how the persona moves/carries themselves
   */
  getPhysicalPresence(): {
    howTheyMove?: string;
    signatureGestures?: string[];
    posture?: string;
    eyeContact?: string;
    energyInRoom?: string;
    physicalQuirks?: string[];
  } | null {
    if (!this.sensoryWorld?.physical_presence) return null;
    const pp = this.sensoryWorld.physical_presence;
    return {
      howTheyMove: pp.how_they_move,
      signatureGestures: pp.signature_gestures,
      posture: pp.posture,
      eyeContact: pp.eye_contact,
      energyInRoom: pp.energy_in_a_room,
      physicalQuirks: pp.physical_quirks,
    };
  }

  /**
   * Get a random signature gesture
   */
  getSignatureGesture(): string | null {
    const gestures = this.sensoryWorld?.physical_presence?.signature_gestures;
    if (!gestures?.length) return null;
    return gestures[Math.floor(Math.random() * gestures.length)];
  }

  /**
   * Get a random physical quirk
   */
  getPhysicalQuirk(): string | null {
    const quirks = this.sensoryWorld?.physical_presence?.physical_quirks;
    if (!quirks?.length) return null;
    return quirks[Math.floor(Math.random() * quirks.length)];
  }

  /**
   * Get their energy in a room description
   */
  getEnergyInRoom(): string | null {
    return this.sensoryWorld?.physical_presence?.energy_in_a_room ?? null;
  }

  /**
   * Get daily rhythms
   */
  getDailyRhythms(): {
    morningRitual?: string;
    whatTheyDoFirst?: string;
    endOfDayRitual?: string;
    sacredWeeklyTime?: string;
    exerciseRelationship?: string;
    howTheyRecharge?: string;
  } | null {
    if (!this.sensoryWorld?.daily_rhythms) return null;
    const dr = this.sensoryWorld.daily_rhythms;
    return {
      morningRitual: dr.morning_ritual,
      whatTheyDoFirst: dr.what_they_do_first,
      endOfDayRitual: dr.end_of_day_ritual,
      sacredWeeklyTime: dr.sacred_weekly_time,
      exerciseRelationship: dr.exercise_relationship,
      howTheyRecharge: dr.how_they_recharge,
    };
  }

  /**
   * Get environment where they thrive
   */
  getEnvironmentWhereThrives(): string | null {
    const envs = this.sensoryWorld?.sensory_preferences?.environments_where_they_thrive;
    if (!envs?.length) return null;
    return envs[Math.floor(Math.random() * envs.length)];
  }

  /**
   * Get environment that drains them
   */
  getEnvironmentThatDrains(): string | null {
    const envs = this.sensoryWorld?.sensory_preferences?.environments_that_drain;
    if (!envs?.length) return null;
    return envs[Math.floor(Math.random() * envs.length)];
  }

  // ============================================================================
  // TEAM DYNAMICS - How this persona relates to team members
  // ============================================================================

  /**
   * Get team dynamics for a specific team member
   */
  getTeamDynamic(teamMemberId: string): {
    howWeInteract?: string;
    whatTheyGiveMe?: string;
    whatIGiveThem?: string;
    whatIAdmire?: string;
  } | null {
    const dynamics = this.sensoryWorld?.team_dynamics;
    if (!dynamics) return null;

    // Normalize ID (handle both "jack_bogle" and "nayan-patel" formats)
    const normalizedId = teamMemberId.replace(/-/g, '_');
    const member = dynamics[normalizedId];

    if (!member) return null;

    return {
      howWeInteract: member.how_we_interact,
      whatTheyGiveMe:
        member.what_they_give_me || member.what_he_gives_me || member.what_she_gives_me,
      whatIGiveThem: member.what_i_give_them || member.what_i_give_him || member.what_i_give_her,
      whatIAdmire: member.what_i_admire,
    };
  }

  /**
   * Get all team member IDs this persona has dynamics for
   */
  getTeamMemberIds(): string[] {
    const dynamics = this.sensoryWorld?.team_dynamics;
    if (!dynamics) return [];
    return Object.keys(dynamics);
  }

  /**
   * Get what this persona admires about a team member
   */
  getWhatIAdmire(teamMemberId: string): string | null {
    const dynamic = this.getTeamDynamic(teamMemberId);
    return dynamic?.whatIAdmire ?? null;
  }

  /**
   * Get how this persona interacts with a team member
   */
  getHowWeInteract(teamMemberId: string): string | null {
    const dynamic = this.getTeamDynamic(teamMemberId);
    return dynamic?.howWeInteract ?? null;
  }

  // ============================================================================
  // QUIRKS - What makes the persona feel human and endearing
  // ============================================================================

  /**
   * Get a random habit the persona has
   */
  getHabit(): string | null {
    if (!this.quirks?.habits?.length) return null;
    return this.quirks.habits[Math.floor(Math.random() * this.quirks.habits.length)];
  }

  /**
   * Get a guilty pleasure to share in vulnerable moments
   */
  getGuiltyPleasure(): string | null {
    if (!this.quirks?.guilty_pleasures?.length) return null;
    return this.quirks.guilty_pleasures[
      Math.floor(Math.random() * this.quirks.guilty_pleasures.length)
    ];
  }

  /**
   * Get a strong opinion the persona holds
   */
  getStrongOpinion(): string | null {
    if (!this.quirks?.strong_opinions?.length) return null;
    return this.quirks.strong_opinions[
      Math.floor(Math.random() * this.quirks.strong_opinions.length)
    ];
  }

  /**
   * Get something the persona is not good at (makes them relatable)
   */
  getWeakness(): string | null {
    if (!this.quirks?.not_good_at?.length) return null;
    return this.quirks.not_good_at[Math.floor(Math.random() * this.quirks.not_good_at.length)];
  }

  /**
   * Get something the persona might be "caught doing" when you arrive
   * Makes introductions feel alive - they were in the middle of something
   */
  getCaughtDoing(): string | null {
    if (!this.quirks?.caught_doing?.length) return null;
    return this.quirks.caught_doing[Math.floor(Math.random() * this.quirks.caught_doing.length)];
  }

  /**
   * Get all quirks for a specific category
   */
  getQuirksCategory(
    category: 'habits' | 'guilty_pleasures' | 'strong_opinions' | 'not_good_at'
  ): string[] {
    return this.quirks?.[category] || [];
  }

  /**
   * Check if quirks are loaded
   */
  hasQuirks(): boolean {
    return this.quirks !== null;
  }

  /**
   * Check if inner world content is loaded
   */
  hasInnerWorld(): boolean {
    return this.innerWorld !== null || this.sensoryWorld !== null;
  }

  /**
   * Get a "humanizing moment" - something that makes the persona feel real
   */
  getHumanizingMoment(): { type: string; content: string } | null {
    // Randomly select from different types of humanizing content
    const options: Array<() => { type: string; content: string } | null> = [
      () => {
        const admission = this.getGuiltyAdmission();
        return admission ? { type: 'vulnerability', content: admission } : null;
      },
      () => {
        const contradiction = this.getContradiction();
        return contradiction
          ? { type: 'contradiction', content: `${contradiction.belief}, but ${contradiction.but}` }
          : null;
      },
      () => {
        const regret = this.getRegret();
        return regret ? { type: 'regret', content: regret } : null;
      },
      () => {
        const phrase = this.getSignaturePhrase();
        return phrase ? { type: 'signature', content: phrase } : null;
      },
      () => {
        const mentor = this.getMentorQuote();
        return mentor
          ? { type: 'mentor', content: `${mentor.mentor} once told me: "${mentor.quote}"` }
          : null;
      },
    ];

    // Shuffle and try each option
    const shuffled = options.sort(() => Math.random() - 0.5);
    for (const option of shuffled) {
      const result = option();
      if (result) return result;
    }

    return null;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  incrementTurn(): void {
    this.state.relationshipTurns++;
  }

  incrementSession(): void {
    this.state.sessionCount++;
    this.state.storiesToldThisSession = [];
  }

  /**
   * Set the user's name
   * FIX BUG #bundle-17: Validate input to prevent empty/invalid names
   */
  setUserName(name: string): void {
    if (typeof name !== 'string') {
      getLogger().warn({ received: typeof name }, 'setUserName received non-string value');
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      getLogger().debug('setUserName called with empty string, ignoring');
      return;
    }
    if (trimmed.length > 100) {
      getLogger().warn(
        { length: trimmed.length },
        'setUserName received unusually long name, truncating'
      );
      this.state.userName = trimmed.slice(0, 100);
      return;
    }
    this.state.userName = trimmed;
  }

  /**
   * Set the detected user emotion
   */
  setDetectedEmotion(emotion: string): void {
    if (typeof emotion === 'string' && emotion.trim().length > 0) {
      this.state.detectedEmotion = emotion.trim().toLowerCase();
    }
  }

  getState(): Readonly<BundleRuntimeState> {
    return { ...this.state };
  }

  /**
   * Get serializable state for persistence across reconnects
   * FIX BUG #bundle-9 & #bundle-16: Enable persistence of session-specific state
   */
  getSerializableState(): {
    storiesToldThisSession: string[];
    sessionCount: number;
    relationshipTurns: number;
    lastStoryTurn: number;
    currentMode: string;
    userName?: string;
  } {
    return {
      storiesToldThisSession: [...this.state.storiesToldThisSession],
      sessionCount: this.state.sessionCount,
      relationshipTurns: this.state.relationshipTurns,
      lastStoryTurn: this.state.lastStoryTurn,
      currentMode: this.state.currentMode,
      userName: this.state.userName,
    };
  }

  /**
   * Restore state from persisted data
   * FIX BUG #bundle-9 & #bundle-16: Restore session state on reconnect
   */
  restoreFromPersistedState(persisted: {
    storiesToldThisSession?: string[];
    sessionCount?: number;
    relationshipTurns?: number;
    lastStoryTurn?: number;
    currentMode?: string;
    userName?: string;
  }): void {
    if (Array.isArray(persisted.storiesToldThisSession)) {
      this.state.storiesToldThisSession = persisted.storiesToldThisSession.filter(
        (s) => typeof s === 'string'
      );
    }
    if (typeof persisted.sessionCount === 'number' && persisted.sessionCount >= 0) {
      this.state.sessionCount = persisted.sessionCount;
    }
    if (typeof persisted.relationshipTurns === 'number' && persisted.relationshipTurns >= 0) {
      this.state.relationshipTurns = persisted.relationshipTurns;
    }
    if (typeof persisted.lastStoryTurn === 'number') {
      this.state.lastStoryTurn = persisted.lastStoryTurn;
    }
    if (typeof persisted.currentMode === 'string') {
      this.state.currentMode = persisted.currentMode;
    }
    if (typeof persisted.userName === 'string') {
      this.state.userName = persisted.userName;
    }
    getLogger().debug(
      { personaId: this.state.personaId },
      'Restored bundle runtime state from persistence'
    );
  }

  /**
   * Update state with validation
   * FIX BUG #65: Validate incoming data to prevent state corruption
   */
  updateState(updates: Partial<BundleRuntimeState>): void {
    // FIX BUG #65: Basic validation of incoming state updates
    const validatedUpdates: Partial<BundleRuntimeState> = {};

    // Validate each field that's being updated
    if (updates.relationshipTurns !== undefined) {
      const turns = Number(updates.relationshipTurns);
      validatedUpdates.relationshipTurns =
        Number.isFinite(turns) && turns >= 0 ? turns : this.state.relationshipTurns;
    }
    if (updates.sessionCount !== undefined) {
      const count = Number(updates.sessionCount);
      validatedUpdates.sessionCount =
        Number.isFinite(count) && count >= 0 ? count : this.state.sessionCount;
    }
    if (updates.currentMode !== undefined && typeof updates.currentMode === 'string') {
      validatedUpdates.currentMode = updates.currentMode;
    }
    if (updates.userName !== undefined) {
      validatedUpdates.userName =
        typeof updates.userName === 'string' ? updates.userName : undefined;
    }
    if (updates.personaId !== undefined && typeof updates.personaId === 'string') {
      validatedUpdates.personaId = updates.personaId;
    }
    if (Array.isArray(updates.storiesToldThisSession)) {
      validatedUpdates.storiesToldThisSession = updates.storiesToldThisSession.filter(
        (s) => typeof s === 'string'
      );
    }
    if (updates.detectedEmotion !== undefined && typeof updates.detectedEmotion === 'string') {
      validatedUpdates.detectedEmotion = updates.detectedEmotion;
    }
    if (updates.moodState !== undefined && typeof updates.moodState === 'object') {
      validatedUpdates.moodState = updates.moodState;
    }

    Object.assign(this.state, validatedUpdates);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * GLOBAL runtime engines cache - for backward compatibility.
 * NOTE: For session isolation, use SessionBundleRuntimeManager instead.
 * This global cache is suitable for read-only operations or when session
 * isolation is not critical (e.g., fetching static persona content).
 *
 * @deprecated Prefer session-scoped runtimes via SessionBundleRuntimeManager
 */
const globalRuntimeEngines = new Map<string, BundleRuntimeEngine>();

/**
 * Session-scoped runtime engine manager.
 * FIX BUG #bundle-1: Prevents cross-session contamination by keying engines
 * by both sessionId AND personaId.
 */
export class SessionBundleRuntimeManager {
  private engines = new Map<string, BundleRuntimeEngine>();
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Get or create a runtime engine for a persona in this session
   */
  async getOrCreateRuntime(
    bundle: LoadedPersonaBundle,
    initialState?: Partial<BundleRuntimeState>
  ): Promise<BundleRuntimeEngine> {
    const personaId = bundle.manifest.identity.id;
    const key = `${this.sessionId}:${personaId}`;

    if (this.engines.has(key)) {
      const existing = this.engines.get(key)!;
      // FIX BUG #bundle-6: Update state if initialState differs
      if (initialState) {
        existing.updateState(initialState);
      }
      return existing;
    }

    const engine = new BundleRuntimeEngine(bundle, initialState);
    await engine.initialize();
    this.engines.set(key, engine);

    getLogger().debug(
      { sessionId: this.sessionId, personaId },
      'Created session-scoped bundle runtime'
    );

    return engine;
  }

  /**
   * Get an existing runtime for a persona (if it exists)
   */
  getRuntime(personaId: string): BundleRuntimeEngine | null {
    const key = `${this.sessionId}:${personaId}`;
    return this.engines.get(key) ?? null;
  }

  /**
   * Clear all runtimes for this session
   */
  clear(): void {
    const count = this.engines.size;
    this.engines.clear();
    getLogger().debug({ sessionId: this.sessionId, count }, 'Cleared session bundle runtimes');
  }

  /**
   * Get count of runtimes in this session
   */
  get size(): number {
    return this.engines.size;
  }
}

/**
 * Create a bundle runtime (backward-compatible global version)
 * @deprecated Use SessionBundleRuntimeManager for session isolation
 */
export async function createBundleRuntime(
  bundle: LoadedPersonaBundle,
  initialState?: Partial<BundleRuntimeState>
): Promise<BundleRuntimeEngine> {
  const personaId = bundle.manifest.identity.id;

  // Check if already exists in global cache
  if (globalRuntimeEngines.has(personaId)) {
    const existing = globalRuntimeEngines.get(personaId)!;
    // FIX BUG #bundle-6: Update state if initialState provided
    if (initialState) {
      existing.updateState(initialState);
    }
    return existing;
  }

  const engine = new BundleRuntimeEngine(bundle, initialState);
  await engine.initialize();

  globalRuntimeEngines.set(personaId, engine);
  return engine;
}
