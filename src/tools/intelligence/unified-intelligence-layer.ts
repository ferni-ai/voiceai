/**
 * Unified Intelligence Layer
 *
 * Bridges the SemanticRouter and UnifiedToolOrchestrator to create
 * a "Better Than Human" tool selection system.
 *
 * HUMAN LIMITATIONS WE TRANSCEND:
 * 1. Perfect Memory - We remember every preference across sessions (Firestore)
 * 2. Anticipation - We predict needs before users express them
 * 3. Pattern Recognition - We see patterns humans miss
 * 4. Continuous Learning - Every interaction makes us smarter
 * 5. Proactive Suggestions - We surface tools users haven't discovered
 * 6. Emotion-Aware - We sense stress/anxiety and surface wellness tools
 * 7. Cross-Persona - We carry context when switching between team members
 * 8. Proactive Outreach - We remind users at their optimal times
 *
 * ARCHITECTURE:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                  UNIFIED INTELLIGENCE LAYER                     │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │  ┌──────────────────┐        ┌──────────────────────┐          │
 * │  │ SemanticRouter   │◄──────►│ UnifiedOrchestrator   │          │
 * │  │ (per-transcript) │        │ (session tools)       │          │
 * │  └────────┬─────────┘        └─────────┬────────────┘          │
 * │           │                            │                        │
 * │           ▼                            ▼                        │
 * │  ┌──────────────────────────────────────────────────┐          │
 * │  │           SHARED INTELLIGENCE                     │          │
 * │  │  • PersonalizationEngine (user patterns)          │          │
 * │  │  • ToolChainPredictor (anticipation)              │          │
 * │  │  • ActiveLearningEngine (corrections)             │          │
 * │  │  • EmotionAwareSelection (voice prosody)          │          │
 * │  │  • CrossPersonaIntelligence (handoff context)     │          │
 * │  │  • ProactiveOutreachIntegration (time patterns)   │          │
 * │  └──────────────────────────────────────────────────┘          │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module tools/intelligence/unified-intelligence-layer
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'unified-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

/** Voice emotion state for emotion-aware tool selection */
export interface VoiceEmotionState {
  primary: string;
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
  stressLevel: number; // 0 to 1
  anxietyMarkers: boolean;
}

/** Cross-persona context for handoff intelligence */
export interface CrossPersonaContext {
  previousPersonaId: string;
  toolsUsedWithPreviousPersona: string[];
  effectiveToolChains: string[][];
  userPreferencesLearned: Record<string, unknown>;
  topicsDiscussed: string[];
  emotionalJourney: string[]; // Sequence of emotional states
}

/** User intelligence profile for cross-system sharing */
export interface UserIntelligenceProfile {
  userId: string;

  // Time-based patterns (from PersonalizationEngine)
  timePatterns: {
    preferredToolsByHour: Map<number, string[]>;
    activeHours: number[];
    peakEngagementTimes: { hour: number; dayOfWeek: number }[];
  };

  // Vocabulary mapping (user's words → tools)
  vocabulary: Map<string, string>;

  // Tool affinities (which tools this user gravitates to)
  toolAffinities: Map<string, number>; // toolId → affinity score

  // Recent tool chains (for pattern detection)
  recentChains: Array<{
    sequence: string[];
    timestamp: Date;
    context?: string;
  }>;

  // Correction history (for active learning)
  corrections: Array<{
    expected: string;
    actual: string;
    query: string;
    timestamp: Date;
  }>;

  // Proactive suggestions (tools user might benefit from)
  suggestedTools: Array<{
    toolId: string;
    reason: string;
    confidence: number;
    suggested: boolean; // Has it been suggested yet?
  }>;

  // Cross-persona context (carried during handoffs)
  crossPersonaContext?: CrossPersonaContext;

  // Last known emotional state (for continuity)
  lastEmotionalState?: VoiceEmotionState;

  // Proactive outreach patterns (when to nudge)
  outreachPatterns: {
    habitCheckTime?: number; // Hour when user usually checks habits
    engagementPeaks: number[]; // Hours when user is most engaged
    lastOutreach?: Date;
    outreachResponsiveness: number; // 0-1, how often user responds to outreach
  };
}

/** Tool selection enhancement from intelligence layer */
export interface IntelligenceEnhancement {
  // Tools to prioritize based on user patterns
  prioritizeTools: string[];

  // Tools to pre-load based on predicted chains
  anticipatedTools: string[];

  // Proactive suggestions to surface
  proactiveSuggestions: Array<{
    toolId: string;
    reason: string;
    triggerPhrase?: string;
  }>;

  // Context hints for orchestrator
  contextHints: {
    likelyIntent?: string;
    emotionalContext?: string;
    timeContext?: 'morning' | 'afternoon' | 'evening' | 'night';
    isReturningUser: boolean;
    preferredDomains: string[];
  };

  // Confidence adjustments for specific tools
  confidenceAdjustments: Map<string, number>;

  // Emotion-aware tool boosts (Better Than Human)
  emotionAwareBoosts?: {
    boostedDomains: string[];
    reason: string;
    detectedEmotion?: string;
    stressLevel?: number;
  };

  // Cross-persona context (from previous persona)
  crossPersonaContext?: {
    previousPersonaId: string;
    toolsToCarryForward: string[];
    topicsToRemember: string[];
    emotionalContinuity: string;
  };

  // Proactive outreach opportunity
  proactiveOutreach?: {
    shouldTrigger: boolean;
    type: 'habit_reminder' | 'check_in' | 'pattern_based';
    suggestedMessage?: string;
    optimalTime?: Date;
  };
}

/** Learning event from semantic router */
export interface LearningEvent {
  userId: string;
  sessionId: string;
  query: string;
  predictedTool: string;
  actualTool: string;
  confidence: number;
  wasCorrection: boolean;
  timestamp: Date;
  context?: {
    timeOfDay: string;
    personaId: string;
    emotionalState?: string;
    voiceEmotion?: VoiceEmotionState;
  };
}

/** Handoff event for cross-persona intelligence */
export interface PersonaHandoffEvent {
  userId: string;
  sessionId: string;
  fromPersonaId: string;
  toPersonaId: string;
  toolsUsed: string[];
  topicsDiscussed: string[];
  emotionalState?: VoiceEmotionState;
  timestamp: Date;
}

/** Anticipation result from tool chain prediction */
export interface AnticipationResult {
  currentTool: string;
  predictedNext: Array<{
    toolId: string;
    probability: number;
    reason: 'co-occurrence' | 'user-pattern' | 'chain-pattern';
  }>;
  fullChain?: {
    steps: string[];
    confidence: number;
    estimatedDurationMs: number;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface UnifiedIntelligenceConfig {
  /** Minimum interactions before personalization kicks in */
  minInteractionsForPersonalization: number;

  /** How many anticipated tools to pre-load */
  maxAnticipatedTools: number;

  /** Threshold for proactive suggestions */
  proactiveSuggestionThreshold: number;

  /** How long to remember user patterns (days) */
  patternRetentionDays: number;

  /** Enable anticipatory pre-loading */
  enableAnticipation: boolean;

  /** Enable proactive suggestions */
  enableProactiveSuggestions: boolean;

  /** Enable cross-session learning */
  enableCrossSessionLearning: boolean;

  /** Enable emotion-aware tool boosting */
  enableEmotionAwareness: boolean;

  /** Enable cross-persona intelligence */
  enableCrossPersonaIntelligence: boolean;

  /** Enable Firestore persistence */
  enableFirestorePersistence: boolean;

  /** Enable proactive outreach integration */
  enableProactiveOutreach: boolean;

  /** Stress threshold to boost wellness tools (0-1) */
  stressThresholdForWellnessBoost: number;
}

const DEFAULT_CONFIG: UnifiedIntelligenceConfig = {
  minInteractionsForPersonalization: 5,
  maxAnticipatedTools: 5,
  proactiveSuggestionThreshold: 0.7,
  patternRetentionDays: 90,
  enableAnticipation: true,
  enableProactiveSuggestions: true,
  enableCrossSessionLearning: true,
  enableEmotionAwareness: true,
  enableCrossPersonaIntelligence: true,
  enableFirestorePersistence: true,
  enableProactiveOutreach: true,
  stressThresholdForWellnessBoost: 0.6,
};

// ============================================================================
// UNIFIED INTELLIGENCE LAYER
// ============================================================================

export class UnifiedIntelligenceLayer {
  private config: UnifiedIntelligenceConfig;
  private userProfiles = new Map<string, UserIntelligenceProfile>();
  private initialized = false;
  private dirtyProfiles = new Set<string>(); // Profiles that need to be persisted
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Lazy-loaded dependencies (to avoid circular imports)
  private personalizationEngine: unknown = null;
  private chainPredictor: unknown = null;
  private activeLearning: unknown = null;
  private firestorePersistence: {
    saveUserProfile: (profile: unknown) => Promise<void>;
    loadUserProfile: (userId: string) => Promise<unknown | null>;
  } | null = null;

  constructor(config: Partial<UnifiedIntelligenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('🧠 Initializing Unified Intelligence Layer...');

    try {
      // Lazy load semantic router dependencies
      const [personalizationModule, chainModule, learningModule] = await Promise.all([
        import('../semantic-router/advanced/personalization.js'),
        import('../semantic-router/advanced/tool-chain-predictor.js'),
        import('../semantic-router/advanced/active-learning.js'),
      ]);

      this.personalizationEngine = personalizationModule.getPersonalizationEngine();
      this.chainPredictor = chainModule.getChainPredictor();
      this.activeLearning = learningModule.getActiveLearningEngine();

      // Initialize Firestore persistence if enabled
      if (this.config.enableFirestorePersistence) {
        try {
          const persistenceModule =
            await import('../semantic-router/persistence/firestore-persistence.js');
          await persistenceModule.initializeFirestorePersistence();
          // Cast to our internal interface since we serialize/deserialize ourselves
          this.firestorePersistence = {
            saveUserProfile: async (profile: unknown): Promise<void> => {
              await persistenceModule.saveUserProfile(
                profile as Parameters<typeof persistenceModule.saveUserProfile>[0]
              );
            },
            loadUserProfile: (userId: string): Promise<unknown | null> =>
              persistenceModule.loadUserProfile(userId) as Promise<unknown | null>,
          };
          log.info('📦 Firestore persistence enabled for intelligence profiles');
        } catch (persistErr) {
          log.warn({ error: String(persistErr) }, '⚠️ Firestore persistence unavailable');
        }
      }

      this.initialized = true;
      log.info('✅ Unified Intelligence Layer ready');
    } catch (error) {
      log.warn({ error: String(error) }, '⚠️ Unified Intelligence partially initialized');
      this.initialized = true; // Continue with degraded functionality
    }
  }

  // ==========================================================================
  // MAIN API: ENHANCE TOOL SELECTION
  // ==========================================================================

  /**
   * Enhance tool selection for the orchestrator
   *
   * Called when orchestrator is selecting tools for a session.
   * Returns intelligence-driven enhancements.
   */
  async enhanceToolSelection(
    userId: string,
    currentContext: {
      personaId: string;
      timeOfDay?: Date;
      transcript?: string;
      sessionHistory?: string[];
      voiceEmotion?: VoiceEmotionState;
      previousPersonaId?: string;
    }
  ): Promise<IntelligenceEnhancement> {
    if (!this.initialized) {
      await this.initialize();
    }

    const profile = await this.getOrLoadProfile(userId);
    const enhancement: IntelligenceEnhancement = {
      prioritizeTools: [],
      anticipatedTools: [],
      proactiveSuggestions: [],
      contextHints: {
        isReturningUser: profile.recentChains.length > 0,
        preferredDomains: [],
      },
      confidenceAdjustments: new Map(),
    };

    // 1. Apply time-based personalization
    if (currentContext.timeOfDay) {
      const hour = currentContext.timeOfDay.getHours();
      const timeTools = profile.timePatterns.preferredToolsByHour.get(hour);
      if (timeTools) {
        enhancement.prioritizeTools.push(...timeTools);
        enhancement.contextHints.timeContext = this.getTimeContext(hour);
      }
    }

    // 2. Apply tool affinities (user's favorites)
    const topAffinities = Array.from(profile.toolAffinities.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([toolId]) => toolId);
    enhancement.prioritizeTools.push(...topAffinities);

    // 3. Anticipate based on recent patterns
    if (this.config.enableAnticipation && currentContext.transcript) {
      const anticipation = await this.anticipateToolChain(
        userId,
        currentContext.transcript,
        currentContext.sessionHistory
      );
      if (anticipation?.predictedNext) {
        enhancement.anticipatedTools = anticipation.predictedNext
          .filter((p) => p.probability > 0.3)
          .slice(0, this.config.maxAnticipatedTools)
          .map((p) => p.toolId);
      }
    }

    // 4. Generate proactive suggestions
    if (this.config.enableProactiveSuggestions) {
      const suggestions = this.generateProactiveSuggestions(profile);
      enhancement.proactiveSuggestions = suggestions;
    }

    // 5. Apply confidence adjustments from learning
    for (const [toolId, affinity] of profile.toolAffinities) {
      // Boost confidence for tools user frequently uses
      if (affinity > 0.5) {
        enhancement.confidenceAdjustments.set(toolId, affinity * 0.1);
      }
      // Reduce confidence for tools user often corrects
      const corrections = profile.corrections.filter((c) => c.expected === toolId);
      if (corrections.length > 3) {
        enhancement.confidenceAdjustments.set(toolId, -0.1);
      }
    }

    // 6. Extract preferred domains from patterns
    const domainCounts = new Map<string, number>();
    for (const toolId of enhancement.prioritizeTools) {
      const domain = this.extractDomainFromToolId(toolId);
      if (domain) {
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      }
    }
    enhancement.contextHints.preferredDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain]) => domain);

    // 7. EMOTION-AWARE TOOL BOOSTING (Better Than Human)
    if (this.config.enableEmotionAwareness && currentContext.voiceEmotion) {
      const emotionBoosts = this.applyEmotionAwareBoosts(currentContext.voiceEmotion);
      if (emotionBoosts) {
        enhancement.emotionAwareBoosts = emotionBoosts;
        // Add boosted domains to anticipated tools
        enhancement.anticipatedTools.push(...this.getToolsForDomains(emotionBoosts.boostedDomains));
      }
      // Store for continuity
      profile.lastEmotionalState = currentContext.voiceEmotion;
    }

    // 8. CROSS-PERSONA INTELLIGENCE (Better Than Human)
    if (this.config.enableCrossPersonaIntelligence && currentContext.previousPersonaId) {
      const crossPersona = this.buildCrossPersonaContext(profile, currentContext.previousPersonaId);
      if (crossPersona) {
        enhancement.crossPersonaContext = crossPersona;
        // Carry forward relevant tools
        enhancement.prioritizeTools.push(...crossPersona.toolsToCarryForward);
      }
    }

    // 9. PROACTIVE OUTREACH INTEGRATION (Better Than Human)
    if (this.config.enableProactiveOutreach && currentContext.timeOfDay) {
      const outreach = this.evaluateProactiveOutreach(profile, currentContext.timeOfDay);
      if (outreach) {
        enhancement.proactiveOutreach = outreach;
      }
    }

    log.debug(
      {
        userId,
        prioritized: enhancement.prioritizeTools.length,
        anticipated: enhancement.anticipatedTools.length,
        suggestions: enhancement.proactiveSuggestions.length,
        emotionAware: !!enhancement.emotionAwareBoosts,
        crossPersona: !!enhancement.crossPersonaContext,
        proactiveOutreach: !!enhancement.proactiveOutreach,
      },
      '🧠 Enhanced tool selection (Better Than Human)'
    );

    return enhancement;
  }

  // ==========================================================================
  // EMOTION-AWARE TOOL SELECTION (Better Than Human)
  // ==========================================================================

  /**
   * Apply emotion-aware tool boosts based on voice prosody
   *
   * A human friend might not notice you're stressed from your voice.
   * Ferni does, and proactively surfaces wellness tools.
   */
  private applyEmotionAwareBoosts(
    emotion: VoiceEmotionState
  ): IntelligenceEnhancement['emotionAwareBoosts'] | null {
    const boostedDomains: string[] = [];
    let reason = '';

    // High stress or anxiety → wellness tools
    if (
      emotion.stressLevel > this.config.stressThresholdForWellnessBoost ||
      emotion.anxietyMarkers
    ) {
      boostedDomains.push('wellness', 'presence', 'self-compassion');
      reason = 'Detected stress/anxiety in your voice - wellness tools ready';
      log.debug(
        { stressLevel: emotion.stressLevel, anxietyMarkers: emotion.anxietyMarkers },
        '🫂 Emotion-aware: Boosting wellness tools'
      );
    }

    // Negative valence → supportive tools
    if (emotion.valence < -0.3) {
      boostedDomains.push('grief', 'connection', 'self-compassion');
      reason = reason || 'Sensing some heaviness - support tools available';
    }

    // High arousal + positive valence → celebration/engagement
    if (emotion.arousal > 0.7 && emotion.valence > 0.3) {
      boostedDomains.push('play', 'entertainment', 'engagement');
      reason = 'Sensing excitement - fun tools ready!';
    }

    // Low arousal → grounding tools
    if (emotion.arousal < 0.3 && emotion.valence < 0) {
      boostedDomains.push('presence', 'wellness');
      reason = reason || 'Grounding tools available';
    }

    if (boostedDomains.length === 0) return null;

    return {
      boostedDomains: [...new Set(boostedDomains)], // Dedupe
      reason,
      detectedEmotion: emotion.primary,
      stressLevel: emotion.stressLevel,
    };
  }

  // ==========================================================================
  // CROSS-PERSONA INTELLIGENCE (Better Than Human)
  // ==========================================================================

  /**
   * Build context to carry forward from previous persona
   *
   * When you switch from Ferni to Maya, Maya should know what
   * tools worked well with Ferni, what topics you discussed,
   * and your emotional journey.
   */
  private buildCrossPersonaContext(
    profile: UserIntelligenceProfile,
    previousPersonaId: string
  ): IntelligenceEnhancement['crossPersonaContext'] | null {
    if (!profile.crossPersonaContext) return null;

    const ctx = profile.crossPersonaContext;
    if (ctx.previousPersonaId !== previousPersonaId) return null;

    // Find tools that were successful with the previous persona
    const successfulTools = ctx.toolsUsedWithPreviousPersona.filter((toolId) => {
      const affinity = profile.toolAffinities.get(toolId);
      return affinity && affinity > 0.6;
    });

    return {
      previousPersonaId,
      toolsToCarryForward: successfulTools.slice(0, 5),
      topicsToRemember: ctx.topicsDiscussed.slice(0, 3),
      emotionalContinuity:
        ctx.emotionalJourney.length > 0
          ? `User's emotional journey: ${ctx.emotionalJourney.slice(-3).join(' → ')}`
          : '',
    };
  }

  /**
   * Record a persona handoff for cross-persona intelligence
   */
  async recordHandoff(event: PersonaHandoffEvent): Promise<void> {
    const profile = await this.getOrLoadProfile(event.userId);

    // Update cross-persona context
    profile.crossPersonaContext = {
      previousPersonaId: event.fromPersonaId,
      toolsUsedWithPreviousPersona: event.toolsUsed,
      effectiveToolChains: profile.recentChains
        .filter((c) => c.context === event.fromPersonaId)
        .map((c) => c.sequence)
        .slice(-5),
      userPreferencesLearned: Object.fromEntries(profile.toolAffinities),
      topicsDiscussed: event.topicsDiscussed,
      emotionalJourney: event.emotionalState
        ? [...(profile.crossPersonaContext?.emotionalJourney || []), event.emotionalState.primary]
        : profile.crossPersonaContext?.emotionalJourney || [],
    };

    this.markProfileDirty(event.userId);

    log.info(
      {
        userId: event.userId,
        from: event.fromPersonaId,
        to: event.toPersonaId,
        toolsCarried: profile.crossPersonaContext.toolsUsedWithPreviousPersona.length,
      },
      '🔄 Cross-persona context recorded'
    );
  }

  // ==========================================================================
  // PROACTIVE OUTREACH INTEGRATION (Better Than Human)
  // ==========================================================================

  /**
   * Evaluate if we should trigger proactive outreach
   *
   * "I notice you usually check your habits around this time..."
   */
  private evaluateProactiveOutreach(
    profile: UserIntelligenceProfile,
    currentTime: Date
  ): IntelligenceEnhancement['proactiveOutreach'] | null {
    const hour = currentTime.getHours();
    const patterns = profile.outreachPatterns;

    // Check if this is the user's usual habit check time
    if (patterns.habitCheckTime !== undefined) {
      const isHabitTime = Math.abs(hour - patterns.habitCheckTime) <= 1;
      const hasntCheckedRecently =
        !patterns.lastOutreach || Date.now() - patterns.lastOutreach.getTime() > 3600000; // 1 hour

      if (isHabitTime && hasntCheckedRecently && patterns.outreachResponsiveness > 0.5) {
        return {
          shouldTrigger: true,
          type: 'habit_reminder',
          suggestedMessage: "Hey! It's around the time you usually check in on your habits.",
          optimalTime: currentTime,
        };
      }
    }

    // Check if this is an engagement peak
    if (patterns.engagementPeaks.includes(hour)) {
      const daysSinceLastOutreach = patterns.lastOutreach
        ? (Date.now() - patterns.lastOutreach.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

      if (daysSinceLastOutreach > 2 && patterns.outreachResponsiveness > 0.6) {
        return {
          shouldTrigger: true,
          type: 'check_in',
          suggestedMessage: 'Hey, just wanted to check in. How are you doing?',
          optimalTime: currentTime,
        };
      }
    }

    return null;
  }

  /**
   * Record outreach response for learning
   */
  recordOutreachResponse(userId: string, responded: boolean): void {
    const profile = this.userProfiles.get(userId);
    if (!profile) return;

    // Update responsiveness score (exponential moving average)
    const alpha = 0.3;
    profile.outreachPatterns.outreachResponsiveness =
      alpha * (responded ? 1 : 0) + (1 - alpha) * profile.outreachPatterns.outreachResponsiveness;

    profile.outreachPatterns.lastOutreach = new Date();
    this.markProfileDirty(userId);
  }

  /**
   * Trigger proactive outreach if conditions are met
   *
   * This connects the intelligence layer's outreach suggestions to the actual
   * outreach system. Called during session or on API check.
   */
  async triggerProactiveOutreach(
    userId: string,
    outreach: NonNullable<IntelligenceEnhancement['proactiveOutreach']>
  ): Promise<{ triggered: boolean; messageId?: string; reason?: string }> {
    if (!outreach.shouldTrigger) {
      return { triggered: false, reason: 'shouldTrigger is false' };
    }

    try {
      // Dynamically import to avoid circular dependencies
      const { savePendingInAppMessage } =
        await import('../../services/outreach/firestore-persistence.js');

      // Map outreach type to message type
      const messageType =
        outreach.type === 'habit_reminder'
          ? 'maya_habit_reminder'
          : outreach.type === 'check_in'
            ? 'ferni_thinking_of_you'
            : 'ferni_pattern_insight';

      const personaId = outreach.type === 'habit_reminder' ? 'maya' : 'ferni';

      const messageId = await savePendingInAppMessage(
        userId,
        outreach.suggestedMessage || 'Hey! Just checking in.',
        messageType,
        {
          personaId,
          priority: outreach.type === 'habit_reminder' ? 2 : 1,
          expiresInHours: 24,
        }
      );

      if (messageId) {
        log.info(
          {
            userId,
            type: outreach.type,
            messageId,
          },
          '🔔 Proactive outreach triggered'
        );

        // Update the profile to record outreach
        const profile = this.userProfiles.get(userId);
        if (profile) {
          profile.outreachPatterns.lastOutreach = new Date();
          this.markProfileDirty(userId);
        }

        return { triggered: true, messageId };
      }

      return { triggered: false, reason: 'Failed to save message' };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to trigger proactive outreach');
      return { triggered: false, reason: String(error) };
    }
  }

  // ==========================================================================
  // ANTICIPATION: PREDICT WHAT USER WILL NEED
  // ==========================================================================

  /**
   * Anticipate which tools user will need next
   *
   * This is the "thinks three steps ahead" capability.
   */
  async anticipateToolChain(
    userId: string,
    currentInput: string,
    sessionHistory?: string[]
  ): Promise<AnticipationResult | null> {
    if (!this.chainPredictor) return null;

    const profile = await this.getOrLoadProfile(userId);

    // Get prediction from chain predictor
    const predictor = this.chainPredictor as {
      predict: (
        intent: string,
        primaryTool: { toolId: string; confidence: number },
        availableTools: { id: string }[],
        userId: string
      ) => Promise<{
        steps: Array<{ toolId: string; dependsOn: number[] }>;
        confidence: number;
        estimatedDuration: number;
      } | null>;
      getLikelyNext: (toolId: string, k: number) => Array<{ toolId: string; probability: number }>;
    };

    // Determine current tool from input (simplified - in production would use semantic matching)
    const currentToolGuess = this.guessCurrentTool(currentInput, profile);
    if (!currentToolGuess) return null;

    // Get co-occurrence predictions
    const likelyNext = predictor.getLikelyNext(currentToolGuess, 5);

    // Get user-specific patterns
    const userPatterns = this.getUserToolPatterns(profile, currentToolGuess);

    // Combine predictions
    const combined: Array<{
      toolId: string;
      probability: number;
      reason: 'co-occurrence' | 'user-pattern' | 'chain-pattern';
    }> = [];

    // Add co-occurrence predictions
    for (const next of likelyNext) {
      combined.push({
        toolId: next.toolId,
        probability: next.probability,
        reason: 'co-occurrence',
      });
    }

    // Add user pattern predictions (with boost)
    for (const toolId of userPatterns) {
      const existing = combined.find((c) => c.toolId === toolId);
      if (existing) {
        existing.probability = Math.min(1, existing.probability + 0.2);
      } else {
        combined.push({
          toolId,
          probability: 0.5,
          reason: 'user-pattern',
        });
      }
    }

    // Sort by probability
    combined.sort((a, b) => b.probability - a.probability);

    return {
      currentTool: currentToolGuess,
      predictedNext: combined.slice(0, 5),
    };
  }

  // ==========================================================================
  // LEARNING: RECORD AND APPLY CORRECTIONS
  // ==========================================================================

  /**
   * Record a learning event (correction or confirmation)
   *
   * This closes the learning loop - corrections improve future predictions.
   */
  async recordLearning(event: LearningEvent): Promise<void> {
    if (!this.config.enableCrossSessionLearning) return;

    const profile = await this.getOrLoadProfile(event.userId);

    // Record correction
    if (event.wasCorrection) {
      profile.corrections.push({
        expected: event.predictedTool,
        actual: event.actualTool,
        query: event.query,
        timestamp: event.timestamp,
      });

      // Decrease affinity for wrongly predicted tool
      const currentAffinity = profile.toolAffinities.get(event.predictedTool) || 0.5;
      profile.toolAffinities.set(event.predictedTool, Math.max(0, currentAffinity - 0.1));

      log.debug(
        { userId: event.userId, from: event.predictedTool, to: event.actualTool },
        '📚 Recorded correction'
      );
    }

    // Increase affinity for actually used tool
    const currentAffinity = profile.toolAffinities.get(event.actualTool) || 0.5;
    profile.toolAffinities.set(event.actualTool, Math.min(1, currentAffinity + 0.05));

    // Learn vocabulary mapping
    this.learnVocabulary(profile, event.query, event.actualTool);

    // Update time patterns
    if (event.context?.timeOfDay) {
      const hour = new Date(event.timestamp).getHours();
      const hourTools = profile.timePatterns.preferredToolsByHour.get(hour) || [];
      if (!hourTools.includes(event.actualTool)) {
        hourTools.push(event.actualTool);
        profile.timePatterns.preferredToolsByHour.set(hour, hourTools.slice(-5));
      }
    }

    // Update recent chains
    const lastChain = profile.recentChains[profile.recentChains.length - 1];
    const now = new Date();
    if (lastChain && now.getTime() - lastChain.timestamp.getTime() < 60000) {
      // Within 1 minute - extend chain
      lastChain.sequence.push(event.actualTool);
      lastChain.timestamp = now;
    } else {
      // Start new chain
      profile.recentChains.push({
        sequence: [event.actualTool],
        timestamp: now,
        context: event.context?.personaId,
      });
    }

    // Keep chains bounded
    if (profile.recentChains.length > 100) {
      profile.recentChains.shift();
    }

    // Learn engagement patterns for proactive outreach
    const hour = event.timestamp.getHours();
    if (!profile.outreachPatterns.engagementPeaks.includes(hour)) {
      // Track engagement hours (simple frequency tracking)
      const hourCounts = new Map<number, number>();
      for (const chain of profile.recentChains) {
        const h = chain.timestamp.getHours();
        hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
      }
      // Top 3 hours become engagement peaks
      profile.outreachPatterns.engagementPeaks = Array.from(hourCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([h]) => h);
    }

    // Detect habit check patterns (if tool is habit-related)
    if (
      event.actualTool.includes('habit') &&
      profile.outreachPatterns.habitCheckTime === undefined
    ) {
      profile.outreachPatterns.habitCheckTime = hour;
    }

    // Store emotional state if provided
    if (event.context?.voiceEmotion) {
      profile.lastEmotionalState = event.context.voiceEmotion;
    }

    // Propagate to personalization engine
    if (this.personalizationEngine) {
      const engine = this.personalizationEngine as {
        learn: (event: {
          userId: string;
          query: string;
          predictedTool: string;
          actualTool: string;
          timestamp: Date;
          context?: string;
        }) => void;
      };
      engine.learn({
        userId: event.userId,
        query: event.query,
        predictedTool: event.predictedTool,
        actualTool: event.actualTool,
        timestamp: event.timestamp,
        context: event.context?.personaId,
      });
    }

    // Propagate to active learning engine
    if (this.activeLearning && event.wasCorrection) {
      const learning = this.activeLearning as {
        recordCorrection: (
          userId: string,
          query: string,
          expected: string,
          actual: string,
          confidence: number
        ) => void;
      };
      learning.recordCorrection(
        event.userId,
        event.query,
        event.predictedTool,
        event.actualTool,
        event.confidence
      );
    }

    this.userProfiles.set(event.userId, profile);
  }

  // ==========================================================================
  // PROACTIVE SUGGESTIONS
  // ==========================================================================

  /**
   * Generate proactive tool suggestions for a user
   *
   * These are tools the user might benefit from but hasn't discovered yet.
   */
  private generateProactiveSuggestions(
    profile: UserIntelligenceProfile
  ): Array<{ toolId: string; reason: string; triggerPhrase?: string }> {
    const suggestions: Array<{ toolId: string; reason: string; triggerPhrase?: string }> = [];

    // Analyze usage patterns to find gaps
    const usedTools = new Set(profile.toolAffinities.keys());

    // Tool bundles that often go together
    const toolBundles: Record<string, { tools: string[]; reason: string }> = {
      morning_routine: {
        tools: ['weather_current', 'calendar_list_today', 'habit_morning_check', 'spotify_play'],
        reason: 'Complete your morning routine - I notice you check some but not all of these',
      },
      wellness_suite: {
        tools: ['mood_check', 'habit_status', 'wellness_summary', 'journal_prompt'],
        reason: "Track your wellbeing holistically - you're missing some helpful tools",
      },
      productivity_stack: {
        tools: ['tasks_list', 'calendar_check', 'focus_timer', 'break_reminder'],
        reason: 'Maximize your productive time with these complementary tools',
      },
    };

    for (const [bundleName, bundle] of Object.entries(toolBundles)) {
      const usedFromBundle = bundle.tools.filter((t) => usedTools.has(t));
      const missingFromBundle = bundle.tools.filter((t) => !usedTools.has(t));

      // If user uses some but not all, suggest the rest
      if (usedFromBundle.length >= 2 && missingFromBundle.length > 0) {
        for (const toolId of missingFromBundle.slice(0, 2)) {
          suggestions.push({
            toolId,
            reason: bundle.reason,
            triggerPhrase: `Would you like to try ${toolId.replace(/_/g, ' ')}?`,
          });
        }
      }
    }

    return suggestions.slice(0, 3); // Max 3 suggestions
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async getOrLoadProfile(userId: string): Promise<UserIntelligenceProfile> {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      // Try to load from Firestore first
      if (this.firestorePersistence) {
        try {
          const persisted = await this.firestorePersistence.loadUserProfile(userId);
          if (persisted) {
            profile = this.deserializeProfile(persisted as Record<string, unknown>);
            log.debug({ userId }, '📦 Loaded intelligence profile from Firestore');
          }
        } catch (loadErr) {
          log.debug({ error: String(loadErr) }, 'Could not load profile from Firestore');
        }
      }

      if (!profile) {
        // Create new profile
        profile = {
          userId,
          timePatterns: {
            preferredToolsByHour: new Map(),
            activeHours: [],
            peakEngagementTimes: [],
          },
          vocabulary: new Map(),
          toolAffinities: new Map(),
          recentChains: [],
          corrections: [],
          suggestedTools: [],
          outreachPatterns: {
            engagementPeaks: [],
            outreachResponsiveness: 0.5,
          },
        };

        // Try to load from personalization engine
        if (this.personalizationEngine) {
          const engine = this.personalizationEngine as {
            exportProfile: (userId: string) => {
              toolBoosts: Map<string, number>;
              vocabulary: Map<string, string>;
              timePatterns: Map<string, Map<string, number>>;
            } | null;
          };
          const existingProfile = engine.exportProfile(userId);
          if (existingProfile) {
            profile.toolAffinities = new Map(
              Array.from(existingProfile.toolBoosts.entries()).map(([k, v]) => [k, v + 0.5])
            );
            profile.vocabulary = existingProfile.vocabulary;
          }
        }
      }

      this.userProfiles.set(userId, profile);
    }

    return profile;
  }

  /**
   * Mark a profile as needing persistence
   */
  private markProfileDirty(userId: string): void {
    this.dirtyProfiles.add(userId);
    this.scheduleDebouncedSave();
  }

  /**
   * Schedule a debounced save of dirty profiles
   */
  private scheduleDebouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      void this.saveDirtyProfiles();
      this.saveDebounceTimer = null;
    }, 30000); // 30 second debounce
  }

  /**
   * Save all dirty profiles to Firestore
   */
  private async saveDirtyProfiles(): Promise<void> {
    if (!this.firestorePersistence || this.dirtyProfiles.size === 0) {
      return;
    }

    const userIds = Array.from(this.dirtyProfiles);
    this.dirtyProfiles.clear();

    for (const userId of userIds) {
      const profile = this.userProfiles.get(userId);
      if (!profile) continue;

      try {
        const serialized = this.serializeProfile(profile);
        await this.firestorePersistence.saveUserProfile(serialized);
        log.debug({ userId }, '📦 Saved intelligence profile to Firestore');
      } catch (saveErr) {
        log.warn({ error: String(saveErr), userId }, 'Failed to save intelligence profile');
        // Re-mark as dirty for retry
        this.dirtyProfiles.add(userId);
      }
    }
  }

  /**
   * Force save all dirty profiles (call on shutdown)
   */
  async flushProfiles(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    await this.saveDirtyProfiles();
  }

  /**
   * Serialize profile for Firestore storage
   */
  private serializeProfile(profile: UserIntelligenceProfile): Record<string, unknown> {
    return {
      userId: profile.userId,
      timePatterns: {
        preferredToolsByHour: Object.fromEntries(profile.timePatterns.preferredToolsByHour),
        activeHours: profile.timePatterns.activeHours,
        peakEngagementTimes: profile.timePatterns.peakEngagementTimes,
      },
      vocabulary: Object.fromEntries(profile.vocabulary),
      toolAffinities: Object.fromEntries(profile.toolAffinities),
      recentChains: profile.recentChains.map((c) => ({
        ...c,
        timestamp: c.timestamp.toISOString(),
      })),
      corrections: profile.corrections.map((c) => ({
        ...c,
        timestamp: c.timestamp.toISOString(),
      })),
      suggestedTools: profile.suggestedTools,
      crossPersonaContext: profile.crossPersonaContext,
      lastEmotionalState: profile.lastEmotionalState,
      outreachPatterns: {
        ...profile.outreachPatterns,
        lastOutreach: profile.outreachPatterns.lastOutreach?.toISOString(),
      },
      _updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Deserialize profile from Firestore
   */
  private deserializeProfile(data: Record<string, unknown>): UserIntelligenceProfile {
    const timePatterns = data.timePatterns as Record<string, unknown> | undefined;
    const outreachPatterns = data.outreachPatterns as Record<string, unknown> | undefined;

    return {
      userId: data.userId as string,
      timePatterns: {
        preferredToolsByHour: new Map(
          Object.entries(
            (timePatterns?.preferredToolsByHour as Record<string, string[]>) || {}
          ).map(([k, v]) => [Number(k), v])
        ),
        activeHours: (timePatterns?.activeHours as number[]) || [],
        peakEngagementTimes:
          (timePatterns?.peakEngagementTimes as { hour: number; dayOfWeek: number }[]) || [],
      },
      vocabulary: new Map(Object.entries((data.vocabulary as Record<string, string>) || {})),
      toolAffinities: new Map(
        Object.entries((data.toolAffinities as Record<string, number>) || {})
      ),
      recentChains: ((data.recentChains as Array<Record<string, unknown>>) || []).map((c) => ({
        sequence: c.sequence as string[],
        timestamp: new Date(c.timestamp as string),
        context: c.context as string | undefined,
      })),
      corrections: ((data.corrections as Array<Record<string, unknown>>) || []).map((c) => ({
        expected: c.expected as string,
        actual: c.actual as string,
        query: c.query as string,
        timestamp: new Date(c.timestamp as string),
      })),
      suggestedTools: (data.suggestedTools as UserIntelligenceProfile['suggestedTools']) || [],
      crossPersonaContext: data.crossPersonaContext as CrossPersonaContext | undefined,
      lastEmotionalState: data.lastEmotionalState as VoiceEmotionState | undefined,
      outreachPatterns: {
        habitCheckTime: outreachPatterns?.habitCheckTime as number | undefined,
        engagementPeaks: (outreachPatterns?.engagementPeaks as number[]) || [],
        lastOutreach: outreachPatterns?.lastOutreach
          ? new Date(outreachPatterns.lastOutreach as string)
          : undefined,
        outreachResponsiveness: (outreachPatterns?.outreachResponsiveness as number) || 0.5,
      },
    };
  }

  /**
   * Get tool IDs for a list of domain names
   */
  private getToolsForDomains(domains: string[]): string[] {
    // Return placeholder tool IDs based on domain
    // In production, this would query the tool registry
    const domainToTools: Record<string, string[]> = {
      wellness: ['mood_check', 'wellness_summary', 'grounding_exercise'],
      presence: ['grounding_exercise', 'breathing_exercise', 'mindfulness_prompt'],
      'self-compassion': ['self_kindness_prompt', 'inner_critic_reframe'],
      grief: ['grief_support', 'companion_in_grief'],
      connection: ['connection_builder', 'friendship_prompt'],
      play: ['play_prompt', 'fun_activity'],
      entertainment: ['spotify_play', 'game_suggest'],
      engagement: ['engagement_prompt', 'celebration'],
    };

    const tools: string[] = [];
    for (const domain of domains) {
      const domainTools = domainToTools[domain];
      if (domainTools) {
        tools.push(...domainTools);
      }
    }
    return [...new Set(tools)]; // Dedupe
  }

  private getTimeContext(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private guessCurrentTool(input: string, profile: UserIntelligenceProfile): string | null {
    // Check vocabulary mapping first
    const lowerInput = input.toLowerCase();
    for (const [phrase, toolId] of profile.vocabulary) {
      if (lowerInput.includes(phrase)) {
        return toolId;
      }
    }

    // Fallback to simple keyword matching
    const keywords: Record<string, string> = {
      music: 'spotify_play',
      play: 'spotify_play',
      weather: 'weather_current',
      calendar: 'calendar_list',
      habit: 'habit_status',
      mood: 'mood_check',
      task: 'tasks_list',
      note: 'notes_create',
    };

    for (const [keyword, toolId] of Object.entries(keywords)) {
      if (lowerInput.includes(keyword)) {
        return toolId;
      }
    }

    return null;
  }

  private getUserToolPatterns(profile: UserIntelligenceProfile, currentTool: string): string[] {
    // Find chains that started with this tool
    const matchingChains = profile.recentChains.filter(
      (c) => c.sequence[0] === currentTool && c.sequence.length > 1
    );

    if (matchingChains.length === 0) return [];

    // Count what typically comes next
    const nextCounts = new Map<string, number>();
    for (const chain of matchingChains) {
      const nextTool = chain.sequence[1];
      nextCounts.set(nextTool, (nextCounts.get(nextTool) || 0) + 1);
    }

    // Return sorted by frequency
    return Array.from(nextCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([toolId]) => toolId);
  }

  private learnVocabulary(profile: UserIntelligenceProfile, query: string, toolId: string): void {
    // Extract key phrases (simplified n-gram extraction)
    const words = query.toLowerCase().split(/\s+/);

    // Learn bigrams and trigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram.length > 5) {
        profile.vocabulary.set(bigram, toolId);
      }
    }

    // Keep vocabulary bounded
    if (profile.vocabulary.size > 300) {
      const entries = Array.from(profile.vocabulary.entries());
      profile.vocabulary = new Map(entries.slice(100));
    }
  }

  private extractDomainFromToolId(toolId: string): string | null {
    const parts = toolId.split('_');
    if (parts.length >= 1) {
      return parts[0];
    }
    return null;
  }

  // ==========================================================================
  // METRICS & DEBUGGING
  // ==========================================================================

  getMetrics(): {
    profileCount: number;
    totalCorrections: number;
    avgToolAffinities: number;
  } {
    let totalCorrections = 0;
    let totalAffinities = 0;
    let affinityCount = 0;

    for (const profile of this.userProfiles.values()) {
      totalCorrections += profile.corrections.length;
      for (const affinity of profile.toolAffinities.values()) {
        totalAffinities += affinity;
        affinityCount++;
      }
    }

    return {
      profileCount: this.userProfiles.size,
      totalCorrections,
      avgToolAffinities: affinityCount > 0 ? totalAffinities / affinityCount : 0,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: UnifiedIntelligenceLayer | null = null;

export function getUnifiedIntelligence(): UnifiedIntelligenceLayer {
  if (!instance) {
    instance = new UnifiedIntelligenceLayer();
  }
  return instance;
}

export async function initializeUnifiedIntelligence(): Promise<void> {
  const intelligence = getUnifiedIntelligence();
  await intelligence.initialize();
}
