/**
 * Unified Conversation Orchestrator
 *
 * Coordinates all conversation humanization systems through a clean,
 * layered architecture:
 *
 * 1. ANALYSIS - Understand the user message
 * 2. INTELLIGENCE - Gather insights from all intelligence systems
 * 3. HUMANIZATION - Apply humanization features
 * 4. OUTPUT - Format and return the final response
 *
 * This replaces the complex, interleaved logic in humanizer.ts with
 * a clear, maintainable pipeline.
 *
 * @module @ferni/conversation/orchestrator
 */

import { seededChance, seededPick, seededIndex } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';

// SSML sanitization - ensures stage directions like "*chuckles*" or "[gentle chuckle]" are handled
import { sanitizeSsml } from '../../ssml/core.js';

// Config adapter (unified feature toggles)
import { getConfigAdapter } from './config-adapter.js';

// Shared utilities
import {
  analyzeMessage,
  detectAdviceGiving,
  detectBreakthrough,
  detectDisengagement,
  detectEvidence,
  detectHesitation,
  detectHighEngagement,
} from '../utils/detection.js';

// Phase 2: Intelligence systems
import { getMoodTracker, resetDeepHumanization } from '../deep-humanization/index.js';
import { getEmotionalArcTracker } from '../emotional-arc.js';
import {
  getSessionIntelligence,
  type SessionIntelligenceContext,
} from '../session-intelligence.js';
import { getBetterThanHuman, type BetterThanHumanContext } from '../superhuman/index.js';

// Types
import type {
  AnalysisContext,
  AnalysisPhaseResult,
  AppliedFeature,
  DetectedSignals,
  HumanizationPhaseResult,
  IntelligenceGuidance,
  IntelligencePhaseResult,
  OrchestratorConfig,
  OrchestratorInput,
  OrchestratorOutput,
  ResponseAdditions,
  SkippedFeature,
} from './types.js';

// Metrics
import { getMetricsCollector, logSlowOrchestration } from './metrics.js';

// Performance optimizations
import { getCircuitBreaker, getOrComputeDetectionWithHit, withTimeout } from './performance.js';

// Debug
import { recordOrchestration } from './debug.js';

// Profiling (for performance analysis)
import { profileOrchestration } from './profiling.js';

// NEW: Composable Effects System
import { resetEffectCoordinator } from '../effects/index.js';

// Extracted humanization phase helpers
import {
  applyAdvancedHumanization as applyAdvancedHumanizationHelper,
  applyComposableEffects as applyComposableEffectsHelper,
  applyContentDeliveryPacing,
  applyDeepHumanization as applyDeepHumanizationHelper,
  applyPriorityActions as applyPriorityActionsHelper,
  applySilencePresence as applySilencePresenceHelper,
  applySpeechNaturalization as applySpeechNaturalizationHelper,
  applyVocalHumanization as applyVocalHumanizationHelper,
  applyVocabularyMirroring as applyVocabularyMirroringHelper,
  generateAdditions as generateAdditionsHelper,
} from './humanization-helpers.js';

const log = createLogger({ module: 'ConversationOrchestrator' });

// ============================================================================
// CONVERSATION ORCHESTRATOR
// ============================================================================

export class ConversationOrchestrator {
  private configOverrides: Partial<OrchestratorConfig>;
  private sessionStartTime: number;
  private personaId: string | null = null;
  private sessionId: string;

  constructor(sessionId = 'default', config: Partial<OrchestratorConfig> = {}) {
    this.sessionId = sessionId;
    this.configOverrides = config;
    this.sessionStartTime = Date.now();
  }

  /**
   * Get the effective config, merging adapter config with overrides
   */
  private get config(): OrchestratorConfig {
    // Get config from adapter (which reads from existing config systems)
    const adapterConfig = getConfigAdapter().buildOrchestratorConfig();

    // Merge with any overrides passed to constructor
    return {
      ...adapterConfig,
      ...this.configOverrides,
      features: {
        ...adapterConfig.features,
        ...this.configOverrides.features,
      },
    };
  }

  /**
   * Set persona for persona-specific config
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
    getConfigAdapter().setPersona(personaId);
  }

  // ==========================================================================
  // MAIN ORCHESTRATION METHOD
  // ==========================================================================

  /**
   * Orchestrate the full humanization pipeline
   */
  async orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const startTime = Date.now();
    const timing = { analysis: 0, intelligence: 0, humanization: 0, output: 0, total: 0 };

    try {
      // Phase 1: Analysis
      const analysisStart = Date.now();
      const analysisResult = this.runAnalysisPhase(input);
      timing.analysis = Date.now() - analysisStart;

      // Phase 2: Intelligence
      const intelligenceStart = Date.now();
      const intelligenceResult = await this.runIntelligencePhase(input, analysisResult);
      timing.intelligence = Date.now() - intelligenceStart;

      // Phase 3: Humanization
      const humanizationStart = Date.now();
      const humanizationResult = await this.runHumanizationPhase(
        input,
        analysisResult,
        intelligenceResult
      );
      timing.humanization = Date.now() - humanizationStart;

      // Phase 4: Output
      const outputStart = Date.now();
      const output = this.runOutputPhase(
        input,
        analysisResult,
        intelligenceResult,
        humanizationResult,
        timing
      );
      timing.output = Date.now() - outputStart;
      timing.total = Date.now() - startTime;

      // Record metrics
      const metricsCollector = getMetricsCollector(this.sessionId, input.personaId);
      metricsCollector.recordTiming(timing);
      metricsCollector.recordFeatures(output.appliedFeatures, humanizationResult.skippedFeatures);
      metricsCollector.recordConfidence(output.metadata.confidence);

      // Log slow orchestrations
      logSlowOrchestration(this.sessionId, timing, input.turnNumber);

      // Record profiling data for performance analysis
      profileOrchestration(this.sessionId, input.turnNumber, timing);

      // Record for debugging (when debug enabled)
      if (this.config.debug) {
        recordOrchestration(this.sessionId, input, output);
      }

      log.debug(
        {
          turn: input.turnNumber,
          features: output.appliedFeatures.length,
          timing,
        },
        '🎭 Orchestration complete'
      );

      return output;
    } catch (error) {
      // Record error in metrics
      const metricsCollector = getMetricsCollector(this.sessionId, input.personaId);
      metricsCollector.recordError();

      log.error({ error: String(error), turn: input.turnNumber }, 'Orchestration failed');

      // Return minimal response on error
      return {
        text: input.rawResponse,
        ssml: input.rawResponse,
        appliedFeatures: [],
        emotionalGuidance: null,
        pacing: 'normal',
        metadata: {
          timing: { ...timing, total: Date.now() - startTime },
          confidence: { analysis: 0, intelligence: 0, overall: 0 },
        },
      };
    }
  }

  // ==========================================================================
  // PHASE 1: ANALYSIS
  // ==========================================================================

  private runAnalysisPhase(input: OrchestratorInput): AnalysisPhaseResult {
    if (!this.config.enableAnalysis) {
      return this.getDefaultAnalysis();
    }

    const metricsCollector = getMetricsCollector(this.sessionId, input.personaId);

    // Use cached analysis for the same message (within same turn)
    const cacheKey = `analysis:${input.userMessage}:${input.userEmotion || ''}`;
    const analysisResult = getOrComputeDetectionWithHit(cacheKey, () =>
      analyzeMessage(input.userMessage, input.userEmotion)
    );
    const analysis = analysisResult.value;
    metricsCollector.recordCacheHit(analysisResult.hit);

    // Cache individual signal detections
    const signalCachePrefix = `signal:${input.userMessage}:`;
    const signals: DetectedSignals = {
      hasEvidence: getOrComputeDetectionWithHit(`${signalCachePrefix}evidence`, () =>
        detectEvidence(input.userMessage)
      ).value,
      isBreakthrough: getOrComputeDetectionWithHit(`${signalCachePrefix}breakthrough`, () =>
        detectBreakthrough(input.userMessage)
      ).value,
      hasHesitation: getOrComputeDetectionWithHit(`${signalCachePrefix}hesitation`, () =>
        detectHesitation(input.userMessage)
      ).value,
      isDisengaged: getOrComputeDetectionWithHit(`${signalCachePrefix}disengaged`, () =>
        detectDisengagement(input.userMessage)
      ).value,
      isHighlyEngaged: getOrComputeDetectionWithHit(`${signalCachePrefix}engaged`, () =>
        detectHighEngagement(input.userMessage)
      ).value,
      isEmotional: analysis.isEmotional,
      isHeavy: analysis.isHeavy,
      isFirstTurn: input.turnNumber <= 1,
    };

    // Build context
    const context: AnalysisContext = {
      energy: analysis.energy,
      topicWeight: analysis.topicWeight,
      engagement: analysis.engagement,
      conversationDepth: this.getConversationDepth(input.turnNumber),
      needsSupport: signals.isHeavy || signals.isEmotional || input.wasPersonalSharing === true,
      confidence: analysis.confidence,
    };

    return { analysis, signals, context };
  }

  private getDefaultAnalysis(): AnalysisPhaseResult {
    return {
      analysis: {
        energy: 'medium',
        topicWeight: 'medium',
        engagement: 'medium',
        hasEvidence: false,
        isBreakthrough: false,
        hasHesitation: false,
        isEmotional: false,
        isHeavy: false,
        confidence: 0.5,
      },
      signals: {
        hasEvidence: false,
        isBreakthrough: false,
        hasHesitation: false,
        isDisengaged: false,
        isHighlyEngaged: false,
        isEmotional: false,
        isHeavy: false,
        isFirstTurn: false,
      },
      context: {
        energy: 'medium',
        topicWeight: 'medium',
        engagement: 'medium',
        conversationDepth: 'surface',
        needsSupport: false,
        confidence: 0.5,
      },
    };
  }

  private getConversationDepth(turnNumber: number): 'surface' | 'medium' | 'deep' {
    if (turnNumber > 8) return 'deep';
    if (turnNumber > 4) return 'medium';
    return 'surface';
  }

  // ==========================================================================
  // PHASE 2: INTELLIGENCE
  // ==========================================================================

  private async runIntelligencePhase(
    input: OrchestratorInput,
    analysis: AnalysisPhaseResult
  ): Promise<IntelligencePhaseResult> {
    if (!this.config.enableIntelligence) {
      return this.getDefaultIntelligence();
    }

    // Run intelligence systems in parallel where possible
    const [sessionInsight, superhumanInsight, mood, emotionalGuidance] = await Promise.all([
      this.getSessionInsight(input, analysis),
      this.getSuperhumanInsight(input, analysis),
      this.getMoodState(input, analysis),
      this.getEmotionalGuidance(),
    ]);

    // Build combined guidance
    const guidance = this.buildGuidance(
      analysis,
      sessionInsight,
      superhumanInsight,
      emotionalGuidance
    );

    return {
      sessionInsight,
      superhumanInsight,
      mood,
      emotionalGuidance,
      guidance,
    };
  }

  private async getSessionInsight(
    input: OrchestratorInput,
    analysis: AnalysisPhaseResult
  ): Promise<IntelligencePhaseResult['sessionInsight']> {
    if (!this.config.features.sessionIntelligence || !input.userId) {
      return null;
    }

    // Use circuit breaker to protect against slow/failing intelligence
    const breaker = getCircuitBreaker('sessionIntelligence');
    const result = await breaker.execute(async () => {
      const intelligence = getSessionIntelligence(input.sessionId, input.userId!);
      const context: SessionIntelligenceContext = {
        sessionId: input.sessionId,
        userId: input.userId!,
        turnCount: input.turnNumber,
        userMessage: input.userMessage,
        topic: input.topic,
        emotion: input.userEmotion,
        wasVulnerable: input.wasPersonalSharing,
        isSessionStart: input.turnNumber <= 1,
        engagementLevel: analysis.context.engagement === 'high' ? 0.8 : 0.5,
      };
      return intelligence.analyze(context);
    }, null);

    if (!result.success && result.fromCircuit) {
      log.debug('Session intelligence skipped (circuit open)');
    }

    return result.value ?? null;
  }

  private async getSuperhumanInsight(
    input: OrchestratorInput,
    analysis: AnalysisPhaseResult
  ): Promise<IntelligencePhaseResult['superhumanInsight']> {
    if (!this.config.features.betterThanHuman || !input.userId) {
      return null;
    }

    // Use circuit breaker with timeout for superhuman intelligence
    const breaker = getCircuitBreaker('betterThanHuman');
    const result = await breaker.execute(async () => {
      const { value, timedOut } = await withTimeout(
        async () => {
          const orchestrator = getBetterThanHuman(
            input.userId!,
            input.sessionId,
            input.personaId,
            input.sessionCount || 0
          );

          const context: BetterThanHumanContext = {
            userMessage: input.userMessage,
            turnCount: input.turnNumber,
            sessionCount: input.sessionCount || 0,
            topic: input.topic,
            emotion: input.userEmotion,
            isSessionStart: input.turnNumber <= 1,
            relationshipStage: this.mapRelationshipStage(input.relationshipStage),
            personaId: input.personaId,
            userId: input.userId!,
            sessionId: input.sessionId,
            draftResponse: input.rawResponse,
            timeOfDay: this.getTimeOfDay(),
            dayOfWeek: new Date().getDay(),
          };

          return orchestrator.analyze(context);
        },
        100, // 100ms timeout for better-than-human
        null
      );

      if (timedOut) {
        log.debug('Better-than-human timed out');
        return null;
      }

      return value;
    }, null);

    if (!result.success && result.fromCircuit) {
      log.debug('Better-than-human skipped (circuit open)');
    }

    return result.value ?? null;
  }

  private async getMoodState(
    input: OrchestratorInput,
    analysis: AnalysisPhaseResult
  ): Promise<IntelligencePhaseResult['mood']> {
    if (!this.config.features.deepHumanization) {
      return {
        energy: 0.75,
        engagement: 0.7,
        emotionalLoad: 0,
        heavyTopicCount: 0,
        inEmotionalMoment: false,
      };
    }

    // NEW: Use the new mood tracker from split module
    const moodTracker = getMoodTracker(input.personaId);
    moodTracker.update({
      userEmotion: input.userEmotion,
      topicWeight: analysis.context.topicWeight,
      userEngagement: analysis.context.engagement === 'high' ? 'high' : 'medium',
      turnCount: input.turnNumber,
    });
    return moodTracker.getMood();
  }

  private async getEmotionalGuidance(): Promise<IntelligencePhaseResult['emotionalGuidance']> {
    try {
      const tracker = getEmotionalArcTracker();
      return tracker.getResponseRecommendation();
    } catch {
      return null;
    }
  }

  private buildGuidance(
    analysis: AnalysisPhaseResult,
    sessionInsight: IntelligencePhaseResult['sessionInsight'],
    superhumanInsight: IntelligencePhaseResult['superhumanInsight'],
    emotionalGuidance: IntelligencePhaseResult['emotionalGuidance']
  ): IntelligenceGuidance {
    const guidance: IntelligenceGuidance = {
      approach: 'normal',
      pacing: 'normal',
      energyTarget: analysis.context.energy,
      avoid: [],
      priorityActions: [],
    };

    // Adjust based on analysis
    if (analysis.context.needsSupport) {
      guidance.approach = 'supportive';
      guidance.pacing = 'slower';
    } else if (analysis.signals.isBreakthrough) {
      guidance.approach = 'celebratory';
    } else if (analysis.signals.isHighlyEngaged) {
      guidance.approach = 'energetic';
    }

    // Incorporate session insight
    if (sessionInsight) {
      if (
        sessionInsight.concern.level === 'elevated' ||
        sessionInsight.concern.level === 'crisis'
      ) {
        guidance.approach = 'cautious';
        guidance.avoid.push(...sessionInsight.responseGuidance.avoid);
      }

      // Add priority actions from session insight
      if (sessionInsight.responseModifications.length > 0) {
        guidance.priorityActions.push(
          ...sessionInsight.responseModifications.slice(0, 2).map((m) => ({
            type: m.type,
            content: m.content || '',
            placement: 'prefix' as const,
            priority: 0.8,
            reason: 'session_intelligence',
          }))
        );
      }
    }

    // Incorporate superhuman insight
    if (superhumanInsight && superhumanInsight.prioritizedActions.length > 0) {
      guidance.priorityActions.push(
        ...superhumanInsight.prioritizedActions.slice(0, 2).map((a) => ({
          type: a.type,
          content: a.content,
          placement: a.placement === 'interrupt' ? ('prefix' as const) : a.placement,
          priority: a.priority / 10, // Normalize to 0-1
          reason: 'superhuman',
        }))
      );
    }

    // Sort by priority and limit
    guidance.priorityActions.sort((a, b) => b.priority - a.priority);
    guidance.priorityActions = guidance.priorityActions.slice(0, this.config.maxPriorityActions);

    return guidance;
  }

  private getDefaultIntelligence(): IntelligencePhaseResult {
    return {
      sessionInsight: null,
      superhumanInsight: null,
      mood: {
        energy: 0.75,
        engagement: 0.7,
        emotionalLoad: 0,
        heavyTopicCount: 0,
        inEmotionalMoment: false,
      },
      emotionalGuidance: null,
      guidance: {
        approach: 'normal',
        pacing: 'normal',
        energyTarget: 'medium',
        avoid: [],
        priorityActions: [],
      },
    };
  }

  // ==========================================================================
  // PHASE 3: HUMANIZATION
  // ==========================================================================

  private async runHumanizationPhase(
    input: OrchestratorInput,
    analysis: AnalysisPhaseResult,
    intelligence: IntelligencePhaseResult
  ): Promise<HumanizationPhaseResult> {
    if (!this.config.enableHumanization) {
      return {
        text: input.rawResponse,
        ssml: input.rawResponse,
        appliedFeatures: [],
        skippedFeatures: [],
        additions: {},
      };
    }

    let text = input.rawResponse;
    let ssml = input.rawResponse;
    const appliedFeatures: AppliedFeature[] = [];
    const skippedFeatures: SkippedFeature[] = [];
    const additions: ResponseAdditions = {};

    // 1. Speech Naturalization
    if (this.config.features.speechNaturalization) {
      const result = applySpeechNaturalizationHelper(text, input, analysis);
      text = result.text;
      ssml = text;
      if (result.applied) {
        appliedFeatures.push({ name: 'speech_naturalization', source: 'speech' });
      }
    }

    // 2. Vocabulary Mirroring
    const mirrorResult = applyVocabularyMirroringHelper(text, input.userMessage);
    if (mirrorResult.applied) {
      text = mirrorResult.text;
      ssml = text;
      appliedFeatures.push({ name: 'vocabulary_mirroring', source: 'speech' });
    }

    // 3. Content Delivery Pacing (for long content)
    if (this.config.features.contentDeliveryPacing) {
      const pacingResult = applyContentDeliveryPacing(text, input);
      if (pacingResult.applied) {
        ssml = pacingResult.ssml;
        appliedFeatures.push({ name: 'content_delivery_pacing', source: 'speech' });
      }
    }

    // 4. Vocal Humanization
    if (this.config.features.vocalHumanization) {
      const vocalResult = applyVocalHumanizationHelper(ssml, input, analysis);
      ssml = vocalResult.ssml;
      appliedFeatures.push(
        ...vocalResult.appliedFeatures.map((f) => ({ name: f, source: 'vocal' as const }))
      );
    }

    // 5. Silence Presence (for heavy moments)
    if (this.config.features.silencePresence && analysis.context.needsSupport) {
      const silenceResult = applySilencePresenceHelper(text, ssml, input, analysis);
      if (silenceResult.applied) {
        text = silenceResult.text;
        ssml = silenceResult.ssml;
        appliedFeatures.push({ name: 'silence_presence', source: 'deep' });
      }
    }

    // 6. Deep Humanization Injections (LEGACY - being replaced by effects system)
    if (this.config.features.deepHumanization) {
      const deepResult = await applyDeepHumanizationHelper(text, ssml, input, analysis);
      text = deepResult.text;
      ssml = deepResult.ssml;
      appliedFeatures.push(...deepResult.features);
    }

    // 6b. NEW: Composable Effects System (opt-in via config.features.composableEffects)
    // This is the new architecture that will eventually replace deep humanization
    if (this.config.features.composableEffects) {
      const effectsResult = await applyComposableEffectsHelper(
        text,
        ssml,
        input,
        analysis,
        intelligence
      );
      text = effectsResult.text;
      ssml = effectsResult.ssml;
      appliedFeatures.push(...effectsResult.features);
      skippedFeatures.push(...effectsResult.skipped);
    }

    // 7. Advanced Humanization (disfluencies, self-correction)
    if (this.config.features.advancedHumanization) {
      const advResult = applyAdvancedHumanizationHelper(
        text,
        ssml,
        input,
        analysis,
        this.getComfortLevel.bind(this)
      );
      text = advResult.text;
      ssml = advResult.ssml;
      appliedFeatures.push(...advResult.features);
      skippedFeatures.push(...advResult.skipped);
    }

    // 8. Apply Priority Actions from Intelligence
    const actionResult = applyPriorityActionsHelper(
      text,
      ssml,
      intelligence.guidance.priorityActions
    );
    text = actionResult.text;
    ssml = actionResult.ssml;
    appliedFeatures.push(...actionResult.features);

    // 9. Generate Additions (follow-up question, memory callback)
    const additionsResult = generateAdditionsHelper(input, analysis, this.shouldTrigger.bind(this));
    Object.assign(additions, additionsResult);

    return { text, ssml, appliedFeatures, skippedFeatures, additions };
  }

  // Note: Humanization helper methods have been extracted to humanization-helpers.ts

  /**
   * Deterministic probability gate.
   *
   * We avoid `Math.random()` to keep behavior stable within a session/turn,
   * which feels more "human" (consistent) and makes tests reliable.
   */
  private shouldTrigger(
    sessionId: string,
    turnNumber: number,
    feature: string,
    probability: number
  ): boolean {
    const p = Math.max(0, Math.min(1, probability));
    if (p === 0) return false;
    if (p === 1) return true;

    const key = `${sessionId}:${turnNumber}:${feature}`;
    // FNV-1a 32-bit hash
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }

    const roll = hash / 0xffffffff; // 0..1
    return roll < p;
  }

  // ==========================================================================
  // PHASE 4: OUTPUT
  // ==========================================================================

  private runOutputPhase(
    input: OrchestratorInput,
    analysis: AnalysisPhaseResult,
    intelligence: IntelligencePhaseResult,
    humanization: HumanizationPhaseResult,
    timing: {
      analysis: number;
      intelligence: number;
      humanization: number;
      output: number;
      total: number;
    }
  ): OrchestratorOutput {
    // Apply SSML enhancements based on emotional guidance
    let ssml = humanization.ssml;
    if (intelligence.emotionalGuidance) {
      ssml = this.applySsmlEnhancements(ssml, intelligence.emotionalGuidance);
    }

    // Compile all feature names
    const appliedFeatures = humanization.appliedFeatures.map((f) => f.name);

    return {
      // Ensure plain text output never leaks SSML tags.
      text: this.stripSsml(humanization.text),
      // CRITICAL: Sanitize SSML to convert stage directions like "[gentle chuckle]" to [laughter]
      // Without this, breath sounds from persona JSON files would be spoken literally
      ssml: sanitizeSsml(ssml),
      appliedFeatures,
      emotionalGuidance: intelligence.emotionalGuidance,
      pacing: intelligence.guidance.pacing,
      memoryCallback: humanization.additions.memoryCallback,
      followUpQuestion: humanization.additions.followUpQuestion,
      backchannel: humanization.additions.backchannel,
      metadata: {
        timing,
        confidence: {
          analysis: analysis.context.confidence,
          intelligence: intelligence.sessionInsight?.confidence || 0.5,
          overall:
            (analysis.context.confidence + (intelligence.sessionInsight?.confidence || 0.5)) / 2,
        },
        debug: this.config.debug
          ? {
              analysisResult: analysis,
              intelligenceResult: intelligence,
              humanizationResult: humanization,
            }
          : undefined,
      },
    };
  }

  private applySsmlEnhancements(
    ssml: string,
    guidance: IntelligencePhaseResult['emotionalGuidance']
  ): string {
    if (!guidance) return ssml;

    let result = ssml;

    // Add opening break
    result = `<break time="100ms"/>${result}`;

    // Add emotion if specified
    if (guidance.suggestedEmotion && guidance.suggestedEmotion !== 'neutral') {
      result = `<emotion value="${guidance.suggestedEmotion}"/>${result}`;
    }

    // Add volume adjustment for support
    if (guidance.warmthLevel === 'high') {
      // Cartesia uses ratio (0.5-2.0), not level
      result = `<volume ratio="0.75"/>${result}`;
    }

    // Add breaks for pause frequency
    if (guidance.pauseFrequency === 'more') {
      result = result.replace(/\.(\s)/g, '.<break time="200ms"/>$1');
    }

    return result;
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  private stripSsml(text: string): string {
    // Strip any SSML/markup that could leak into chat surfaces.
    const withoutTags = text.replace(/<[^>]+>/g, '');
    return withoutTags.replace(/\s+/g, ' ').trim();
  }

  private getComfortLevel(stage?: string): number {
    const levels: Record<string, number> = {
      stranger: 0.25,
      acquaintance: 0.45,
      friend: 0.65,
      trusted_advisor: 0.85,
    };
    return levels[stage || 'acquaintance'] || 0.45;
  }

  private mapRelationshipStage(
    stage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'
  ): 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend' {
    const mapping: Record<
      string,
      'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend'
    > = {
      stranger: 'new_acquaintance',
      acquaintance: 'getting_to_know',
      friend: 'trusted_advisor',
      trusted_advisor: 'old_friend',
    };
    return mapping[stage || 'acquaintance'] || 'getting_to_know';
  }

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Reset session time
   */
  resetSession(): void {
    this.sessionStartTime = Date.now();
  }

  /**
   * Get session duration in minutes
   */
  getSessionMinutes(): number {
    return Math.floor((Date.now() - this.sessionStartTime) / (1000 * 60));
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';

/**
 * Session registry for conversation orchestrators.
 *
 * 🧹 MEMORY CLEANUP NOTE:
 * This Map is managed by the session registry, which:
 * 1. Automatically calls resetSession() when a session is reset
 * 2. Deletes the Map entry after cleanup
 * 3. Registers with the global registry for coordinated cleanup
 *
 * Sessions are cleaned up when:
 * - resetConversationOrchestrator(sessionId) is called
 * - resetAllOrchestrators() is called
 * - resetSessionGlobally(sessionId) is called from utils/session-registry
 */
const orchestratorRegistry = createSessionRegistry<ConversationOrchestrator>(
  (sessionId: string) => new ConversationOrchestrator(sessionId),
  {
    name: 'ConversationOrchestrator',
    cleanup: (orchestrator: ConversationOrchestrator) => orchestrator.resetSession(),
    verbose: false,
  }
);

// Register for global session cleanup
registerGlobalRegistry(orchestratorRegistry);

/**
 * Get or create an orchestrator for a session
 */
export function getConversationOrchestrator(
  sessionId: string,
  config?: Partial<OrchestratorConfig>
): ConversationOrchestrator {
  // Note: config is only applied on creation - subsequent calls return existing instance
  if (!orchestratorRegistry.has(sessionId) && config) {
    // Create with custom config by manually handling it
    const orchestrator = new ConversationOrchestrator(sessionId, config);
    return orchestrator; // The registry will create its own, but this overrides it
  }
  return orchestratorRegistry.get(sessionId);
}

/**
 * Reset orchestrator for a session
 */
export function resetConversationOrchestrator(sessionId: string): void {
  orchestratorRegistry.reset(sessionId);
}

/**
 * Reset all orchestrators
 */
export function resetAllOrchestrators(): void {
  orchestratorRegistry.resetAll();
}

/**
 * Get count of active orchestrators (for monitoring)
 */
export function getActiveOrchestratorCount(): number {
  return orchestratorRegistry.getActiveCount();
}

export default ConversationOrchestrator;
