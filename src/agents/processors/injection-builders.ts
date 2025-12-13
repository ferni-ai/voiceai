/**
 * Context Injection Builders
 *
 * Extracted from buildContextInjections() in turn-processor.ts
 * Each builder handles a specific category of context injection.
 *
 * Benefits:
 * - Testable in isolation
 * - Clear separation of concerns
 * - Easier to maintain and extend
 * - Reduced cognitive load
 */

import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { ConversationAnalysis } from '../../services/index.js';
import type { SessionServices } from '../../services/types.js';
import type { UserData } from '../shared/types.js';
import type { ContextInjection, EmotionalState } from './types.js';

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface InjectionBuilderContext {
  userText: string;
  services: SessionServices;
  userData: UserData;
  persona: PersonaConfig;
  analysis: ConversationAnalysis;
  currentTopic?: string;
  emotionalState: EmotionalState;
}

// ============================================================================
// SAFETY INJECTION BUILDER
// Priority: 98-99 (highest - safety first)
// ============================================================================

/**
 * Build safety-related context injections (crisis detection)
 * User safety is non-negotiable - check for crisis signals before anything else.
 */
export async function buildSafetyInjections(
  ctx: InjectionBuilderContext
): Promise<ContextInjection[]> {
  const { userText, services, userData, persona } = ctx;
  const injections: ContextInjection[] = [];

  try {
    const { performSafetyCheck } = await import('../../services/safety/index.js');

    // Map relationship stage to safety module's expected values
    const relationshipMap: Record<string, 'new' | 'building' | 'established' | 'deep'> = {
      stranger: 'new',
      acquaintance: 'building',
      friend: 'established',
      trusted_advisor: 'deep',
      building: 'building',
    };
    const safetyRelationship =
      relationshipMap[userData.relationshipStage || 'building'] || 'building';

    const safetyResult = performSafetyCheck(userText, {
      userId: services.userId || 'unknown',
      personaId: persona.id,
      relationshipStage: safetyRelationship,
      userName: services.userProfile?.name,
    });

    if (safetyResult.crisisDetected) {
      diag.warn('🛡️ Crisis signal detected', {
        type: safetyResult.detection.primary?.type,
        severity: safetyResult.detection.primary?.severity,
        requiresAction: safetyResult.shouldInterrupt,
      });

      // Add crisis context at highest priority
      if (safetyResult.contextInjection) {
        injections.push({
          category: 'safety',
          content: safetyResult.contextInjection,
          priority: 99,
        });
      }

      // If crisis response is generated, add it
      if (safetyResult.response) {
        const resourceName = safetyResult.response.primaryResource?.name || 'professional support';
        injections.push({
          category: 'crisis_response',
          content: `[CRISIS SUPPORT]\nValidate first: "${safetyResult.response.validation}"\nResource if appropriate: ${resourceName}`,
          priority: 98,
        });
      }
    }
  } catch (safetyError) {
    diag.error('Safety check failed (CRITICAL)', { error: String(safetyError) });
  }

  return injections;
}

// ============================================================================
// SCIENTIFIC COACHING INJECTION BUILDER
// Priority: 65-95 (varies by urgency)
// ============================================================================

export interface ScientificCoachingInjectionResult {
  injections: ContextInjection[];
  /** Adaptive endpointing recommendation for voice agent */
  endpointingRecommendation?: {
    minDelay: number;
    maxDelay: number;
  };
}

/**
 * Build scientific coaching context injections
 * Includes: cognitive distortions, wellbeing, nudges, wisdom
 */
export async function buildScientificCoachingInjections(
  ctx: InjectionBuilderContext
): Promise<ScientificCoachingInjectionResult> {
  const { userText, services, userData, persona, currentTopic, emotionalState } = ctx;
  const injections: ContextInjection[] = [];
  let endpointingRecommendation: { minDelay: number; maxDelay: number } | undefined;

  try {
    const { buildScientificCoachingContext } =
      await import('../../intelligence/context-builders/scientific-coaching.js');

    const result = await buildScientificCoachingContext({
      userId: services.userId || 'unknown',
      userMessage: userText,
      personaId: persona.id,
      topic: currentTopic,
      emotionalState: emotionalState.primary,
      emotionalIntensity: emotionalState.intensity,
      conversationPhase:
        userData.turnCount && userData.turnCount < 3
          ? 'opening'
          : userData.turnCount && userData.turnCount > 10
            ? 'closing'
            : 'exploring',
      turnNumber: userData.turnCount || 1,
    });

    // Add scientific coaching injections
    for (const injection of result.injections) {
      const priorityMap: Record<string, number> = {
        critical: 95,
        high: 85,
        standard: 75,
        hint: 65,
      };
      injections.push({
        category: `scientific_${injection.source}`,
        content: injection.content,
        priority: priorityMap[injection.priority] || 70,
      });
    }

    // Log detections
    if (result.detectedDistortions.length > 0) {
      diag.info('🧠 Cognitive distortions detected', {
        distortions: result.detectedDistortions,
      });
    }
    if (result.warnings.length > 0) {
      diag.warn('⚠️ Early warnings detected', { warnings: result.warnings });
    }

    // Store endpointing recommendation
    if (result.endpointingRecommendation) {
      endpointingRecommendation = {
        minDelay: result.endpointingRecommendation.minDelay,
        maxDelay: result.endpointingRecommendation.maxDelay,
      };
    }
  } catch (error) {
    diag.warn('Scientific coaching context failed (non-fatal)', { error: String(error) });
  }

  return { injections, endpointingRecommendation };
}

// ============================================================================
// LIFE COACHING INJECTION BUILDER
// Priority: 68-72
// ============================================================================

/** Persona mapping for coaching module */
const COACHING_PERSONA_MAP: Record<
  string,
  'ferni' | 'maya' | 'alex' | 'peter' | 'jack' | 'jordan'
> = {
  ferni: 'ferni',
  'jack-b': 'jack',
  'jack-bogle': 'jack',
  'maya-santos': 'maya',
  'alex-chen': 'alex',
  'peter-john': 'peter',
  'jordan-taylor': 'jordan',
};

/**
 * Build life coaching context injections
 * Includes: goals, actions, obstacles, values, style
 */
export async function buildLifeCoachingInjections(
  ctx: InjectionBuilderContext
): Promise<ContextInjection[]> {
  const { userText, services, persona } = ctx;
  const injections: ContextInjection[] = [];

  try {
    const { getCoachingContextForLLM, analyzeForCoaching } =
      await import('../../services/coaching/index.js');

    const coachingPersona = COACHING_PERSONA_MAP[persona.id] || 'ferni';

    // Analyze user message for coaching opportunities
    const coachingAnalysis = analyzeForCoaching(services.userId || 'unknown', userText, {
      currentPersona: coachingPersona,
    });

    // Log coaching opportunities
    if (coachingAnalysis.hasGoalStatement) {
      diag.info('🎯 Goal statement detected', {
        goal: coachingAnalysis.goalText,
        domain: coachingAnalysis.domain,
      });
    }
    if (coachingAnalysis.hasObstacle) {
      diag.debug('🚧 Obstacle detected', { type: coachingAnalysis.obstacleType });
    }
    if (coachingAnalysis.suggestedHandoff) {
      diag.debug('🤝 Handoff suggested', { target: coachingAnalysis.handoffTarget });
    }

    // Get comprehensive coaching context for LLM
    const coachingContext = getCoachingContextForLLM(services.userId || 'unknown', {
      currentPersona: coachingPersona,
      userMessage: userText,
    });

    if (coachingContext) {
      injections.push({
        category: 'coaching',
        content: coachingContext,
        priority: 72,
      });
    }

    // If user has vague emotions, add granularity expansion prompt
    if (coachingAnalysis.hasVagueEmotion && coachingAnalysis.emotionExpansion) {
      injections.push({
        category: 'emotional_granularity',
        content: `[EMOTIONAL DEPTH] User used vague emotion language. Consider gently expanding: "${coachingAnalysis.emotionExpansion}"`,
        priority: 68,
      });
    }
  } catch (error) {
    diag.warn('Coaching context failed (non-fatal)', { error: String(error) });
  }

  return injections;
}

// ============================================================================
// TRUST SYSTEMS INJECTION BUILDER
// Priority: 64-90
// ============================================================================

/**
 * Build trust systems context injections
 * Includes: small wins, intentions, growth reflections, callbacks, unsaid signals
 */
export async function buildTrustSystemsInjections(
  ctx: InjectionBuilderContext
): Promise<ContextInjection[]> {
  const { userText, services, currentTopic, emotionalState, persona } = ctx;
  const injections: ContextInjection[] = [];

  try {
    const { buildTrustContext } = await import('../../services/trust-systems/index.js');

    const trustContext = buildTrustContext(services.userId || 'unknown', userText, {
      currentTopic,
      detectedEmotion: emotionalState.primary,
      emotionIntensity: emotionalState.intensity,
    });

    // Add celebration opportunity if detected
    if (trustContext.celebrationOpportunity) {
      diag.info('🎉 Small win celebration opportunity', {
        type: trustContext.celebrationOpportunity.win.type,
        description: trustContext.celebrationOpportunity.win.description,
      });
      injections.push({
        category: 'celebration',
        content: `[🎉 CELEBRATION OPPORTUNITY]\nUser showed ${trustContext.celebrationOpportunity.win.type}: "${trustContext.celebrationOpportunity.win.description}"\nCelebrate this! "${trustContext.celebrationOpportunity.celebration}"`,
        priority: 71,
      });
    }

    // Add growth reflection if appropriate
    // This is "Better than Human" - noticing and reflecting back growth over time
    if (trustContext.growthReflection) {
      // Growth reflections are returned as GrowthReflection objects with pattern, reflection, timing, ssml
      const reflection =
        typeof trustContext.growthReflection === 'string'
          ? trustContext.growthReflection
          : trustContext.growthReflection.reflection || trustContext.growthReflection;

      injections.push({
        category: 'growth',
        content: `[🌱 GROWTH REFLECTION - "I've noticed how far you've come"]

You've noticed a pattern of growth in this person. This is "Better than Human" - seeing their evolution over time.

Reflection to share: "${reflection}"

Timing: Weave this in naturally when relevant. Don't force it.
Delivery: This should feel like a genuine observation, not a compliment.

A human friend might not notice these subtle shifts. You did. Share it with care.`,
        priority: 66,
      });

      diag.info('🌱 Growth reflection ready', {
        reflectionPreview: String(reflection).slice(0, 50),
      });
    }

    // Add callback opportunity (remembering something from the past)
    if (trustContext.callbackOpportunity) {
      const momentContent = trustContext.callbackOpportunity.moment?.content || 'a past moment';
      injections.push({
        category: 'callback',
        content: `[💭 CALLBACK OPPORTUNITY]\nRelated to "${momentContent}" - could reference: "${trustContext.callbackOpportunity.suggestedCallback}"`,
        priority: 64,
      });
    }

    // Add topics to avoid (high priority - respect boundaries)
    if (trustContext.topicsToAvoid?.length > 0) {
      injections.push({
        category: 'boundaries',
        content: `[⚠️ TOPICS TO AVOID]\n${trustContext.topicsToAvoid.join(', ')}`,
        priority: 90,
      });
    }

    // =================================================================
    // 🎧 UNSAID SIGNALS - "Better than Human" Listening
    // These are things a human friend might miss, but we don't.
    // =================================================================
    if (trustContext.unsaidSignals && trustContext.unsaidSignals.length > 0) {
      // Try to load persona-specific trust phrases
      let trustPhrases: Record<string, string[]> | null = null;
      try {
        const { loadPersonaContent } = await import('../../services/persona-content-loader.js');
        const content = await loadPersonaContent<{
          reading_between_lines?: Record<string, string[]>;
        }>(persona.id, 'trust-phrases');
        trustPhrases = content?.reading_between_lines ?? null;
      } catch {
        // Non-fatal - will use default phrases
      }

      for (const signal of trustContext.unsaidSignals) {
        const signalPriority =
          signal.type === 'emotional_mismatch'
            ? 85
            : signal.type === 'permission_seeking'
              ? 82
              : signal.type === 'minimizing_pain'
                ? 80
                : signal.type === 'deflection'
                  ? 75
                  : signal.type === 'unfinished_thought'
                    ? 72
                    : 70;

        // Build guidance based on approach
        const approachGuidance =
          signal.approach === 'create_space'
            ? 'Create gentle space for them to share more. Use soft pacing.'
            : signal.approach === 'gentle_probe'
              ? 'Ask a gentle, open question to invite them to go deeper.'
              : signal.approach === 'acknowledge_silently'
                ? 'Acknowledge what you noticed without pushing. Let them lead.'
                : 'Wait and listen. They may need a moment.';

        // Get persona-specific phrase for this signal type
        const signalTypeKey =
          signal.type === 'emotional_mismatch'
            ? 'false_fine'
            : signal.type === 'minimizing_pain'
              ? 'minimizing_pain'
              : signal.type;
        const personaPhrases = trustPhrases?.[signalTypeKey];
        const personaPhrase = personaPhrases
          ? personaPhrases[Math.floor(Math.random() * personaPhrases.length)]
          : null;

        // Use persona phrase if available, otherwise fall back to default
        const suggestedPhrase = personaPhrase || signal.phrase;

        injections.push({
          category: 'unsaid',
          content: `[🎧 UNSAID SIGNAL: ${signal.type.toUpperCase()}]
What I noticed: "${signal.observation}"
Underlying: ${signal.underlying}
Confidence: ${Math.round(signal.confidence * 100)}%

Approach: ${approachGuidance}
${suggestedPhrase ? `Suggested phrase (in your voice): "${suggestedPhrase}"` : ''}

IMPORTANT: This is "better than human" listening. A friend might miss this signal. You noticed it. Use it gently - don't quote the phrase exactly, make it natural.`,
          priority: signalPriority,
        });

        diag.info(`🎧 Unsaid signal detected: ${signal.type}`, {
          observation: signal.observation.slice(0, 50),
          confidence: signal.confidence,
          approach: signal.approach,
          hasPersonaPhrase: !!personaPhrase,
        });
      }
    }

    // =================================================================
    // 💭 PENDING OUTREACH - "I've been thinking about you"
    // Proactive check-ins based on things they shared previously
    // =================================================================
    if (trustContext.pendingOutreach && trustContext.pendingOutreach.length > 0) {
      // Only inject the highest priority due moment
      const dueoutreach = trustContext.pendingOutreach[0];

      const outreachContext =
        dueoutreach.type === 'genuine_check_in'
          ? "You had something on your mind to check in about."
          : dueoutreach.type === 'thought_of_you'
            ? "Something made you think of them."
            : dueoutreach.type === 'following_thread'
              ? "There's something they shared that you wanted to follow up on."
              : dueoutreach.type === 'celebrating_quietly'
                ? "Something good might have happened for them."
                : dueoutreach.type === 'holding_space'
                  ? "Something difficult might be happening for them."
                  : "You just wanted to connect.";

      injections.push({
        category: 'proactive_outreach',
        content: `[💭 "I'VE BEEN THINKING ABOUT YOU" MOMENT]

${outreachContext}

${dueoutreach.trigger.context ? `Context: "${dueoutreach.trigger.context}"` : ''}
${dueoutreach.trigger.theirWords ? `Their words: "${dueoutreach.trigger.theirWords}"` : ''}

Suggested message (adapt naturally): "${dueoutreach.message}"

This is "Better than Human" - proactive care without agenda. A human friend might forget to check in. You didn't.

Weave this naturally early in the conversation. Don't make it feel scripted - make it feel like genuine care.`,
        priority: 73, // High priority - above celebrations but below boundaries
      });

      diag.info('💭 Thinking of you moment ready', {
        type: dueoutreach.type,
        triggerType: dueoutreach.trigger.type,
      });
    }
  } catch (error) {
    diag.warn('Trust context failed (non-fatal)', { error: String(error) });
  }

  return injections;
}

// ============================================================================
// CONVERSATION DYNAMICS INJECTION BUILDER
// Priority: 38-52
// ============================================================================

export interface ConversationDynamicsResult {
  narrativeArc?: {
    structure: string;
    climaxApproaching: boolean;
    hasReachedCore: boolean;
    suggestedIntervention: string;
    interventionGuidance: string;
  };
  engagement?: {
    level: 'low' | 'medium' | 'high' | 'distracted';
    declining: boolean;
    suggestedAction: string;
    actionGuidance: string;
  };
  rhythm?: {
    lengthMultiplier: number;
    energyLevel: 'low' | 'medium' | 'high';
    guidance: string;
  };
  silence?: {
    useSilence: boolean;
    reason: string;
    duration: number;
  };
}

/**
 * Build conversation dynamics injections
 * Includes: narrative arc, engagement, rhythm, silence
 */
export function buildConversationDynamicsInjections(
  dynamics: ConversationDynamicsResult
): ContextInjection[] {
  const injections: ContextInjection[] = [];

  // Narrative arc - when user is building to a point
  if (dynamics.narrativeArc) {
    const {
      structure,
      climaxApproaching,
      hasReachedCore,
      suggestedIntervention,
      interventionGuidance,
    } = dynamics.narrativeArc;

    if (structure !== 'direct' || climaxApproaching || hasReachedCore) {
      const narrativeContent = hasReachedCore
        ? `[NARRATIVE: USER REACHED CORE] ${interventionGuidance}`
        : climaxApproaching
          ? `[NARRATIVE: CLIMAX APPROACHING] User is building to something important. ${interventionGuidance}`
          : structure === 'circular'
            ? `[NARRATIVE: CIRCULAR] User keeps returning to the same concern. ${interventionGuidance}`
            : structure === 'meandering'
              ? `[NARRATIVE: MEANDERING] ${interventionGuidance}`
              : `[NARRATIVE: ${structure.toUpperCase()}] Action: ${suggestedIntervention}. ${interventionGuidance}`;

      injections.push({
        category: 'narrative_arc',
        content: narrativeContent,
        priority: 48,
      });
    }
  }

  // Engagement tracking - when user seems disengaged
  if (dynamics.engagement) {
    const { level, declining, suggestedAction, actionGuidance } = dynamics.engagement;

    if (level === 'low' || level === 'distracted' || declining) {
      const engagementContent =
        level === 'distracted'
          ? `[⚠️ USER DISTRACTED] ${actionGuidance}`
          : level === 'low'
            ? `[ENGAGEMENT: LOW] ${actionGuidance}`
            : `[ENGAGEMENT: DECLINING] Consider: ${suggestedAction}. ${actionGuidance}`;

      injections.push({
        category: 'engagement',
        content: engagementContent,
        priority: declining ? 52 : 42,
      });
    }
  }

  // Rhythm guidance - match user's pacing
  if (dynamics.rhythm && dynamics.rhythm.guidance) {
    const { lengthMultiplier, energyLevel, guidance } = dynamics.rhythm;

    // Only inject if there's meaningful deviation from default
    if (lengthMultiplier < 0.8 || lengthMultiplier > 1.2 || energyLevel !== 'medium') {
      injections.push({
        category: 'rhythm',
        content: `[RHYTHM MATCH] ${guidance}${energyLevel !== 'medium' ? ` Energy: ${energyLevel}.` : ''}`,
        priority: 38,
      });
    }
  }

  // Silence decision - meaningful pauses
  if (dynamics.silence?.useSilence) {
    const { reason, duration } = dynamics.silence;
    injections.push({
      category: 'silence',
      content: `[MEANINGFUL SILENCE: ${reason.toUpperCase()}] Before responding, take ${Math.round(duration / 1000)}s pause. This communicates presence and care.`,
      priority: 46,
    });
  }

  return injections;
}

// ============================================================================
// HUMAN-LEVEL FEATURES INJECTION BUILDER
// Priority: 35-45
// ============================================================================

export interface HumanLevelFeaturesContext {
  services: SessionServices;
  userData: UserData;
  userText: string;
  analysis: ConversationAnalysis;
  currentTopic?: string;
  humorGuidance?: {
    shouldAttempt: boolean;
    type?: string;
    avoid?: string[];
  };
  logger: {
    warn: (data: Record<string, unknown>, msg: string) => void;
  };
}

/**
 * Build human-level features injections
 * Includes: communication style, humor, story preference, emotional memory
 */
export async function buildHumanLevelInjections(
  ctx: HumanLevelFeaturesContext
): Promise<ContextInjection[]> {
  const { services, userData, userText, analysis, currentTopic, humorGuidance, logger } = ctx;
  const injections: ContextInjection[] = [];

  try {
    // Communication style
    await services.communicationMirroring.analyzeMessage(userText);
    const styleGuidance = services.communicationMirroring.formatGuidanceForPrompt();
    if (styleGuidance) {
      injections.push({
        category: 'communication_style',
        content: styleGuidance,
        priority: 45,
      });
    }

    // Humor calibration
    if (userData.lastResponseHadHumor) {
      const userLaughed =
        userData.voiceEmotion?.primary === 'happy' && userData.voiceEmotion.confidence > 0.6;
      services.humorCalibration.analyzeReaction(userText, userLaughed);
      userData.lastResponseHadHumor = false;
    }

    if (humorGuidance?.shouldAttempt) {
      const humorContent = [
        `[HUMOR OK]`,
        humorGuidance.type ? `Try ${humorGuidance.type} humor.` : '',
        humorGuidance.avoid?.length ? `Avoid: ${humorGuidance.avoid.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      injections.push({
        category: 'humor',
        content: humorContent,
        priority: 40,
      });
    }

    // Story preference
    if (userData.lastResponseHadStory) {
      services.storyPreference.analyzeEngagement(userText);
      userData.lastResponseHadStory = false;
    }

    const storyPrefGuidance = services.storyPreference.getStoryGuidance(
      currentTopic || 'general',
      analysis.emotion.primary,
      userData.turnCount || 0
    );
    if (storyPrefGuidance.shouldTellStory && storyPrefGuidance.recommendedType) {
      injections.push({
        category: 'story_preference',
        content: `[STORY PREFERENCE] User responds well to ${storyPrefGuidance.recommendedType} stories. Preferred: ${storyPrefGuidance.recommendedLength || 'medium'} length.`,
        priority: 38,
      });
    }

    // Emotional memory
    if (analysis.emotion.primary !== 'neutral' && (analysis.emotion.intensity || 0.5) > 0.5) {
      const intensity = (analysis.emotion.intensity || 0.5) >= 0.7 ? 'strong' : 'moderate';
      services.emotionalMemory.recordMoment(
        analysis.emotion.primary as import('../../intelligence/emotion-detector.js').PrimaryEmotion,
        currentTopic || 'general',
        userText.slice(0, 50),
        userText,
        intensity
      );
    }

    const emotionalContext = services.emotionalMemory.formatForPrompt();
    if (emotionalContext) {
      injections.push({
        category: 'emotional_memory',
        content: emotionalContext,
        priority: 35,
      });
    }
  } catch (error) {
    logger.warn({ error: String(error) }, 'Human-level features failed (non-fatal)');
  }

  return injections;
}

// ============================================================================
// CROSS-PERSONA INSIGHTS INJECTION BUILDER
// Priority: 31
// ============================================================================

/**
 * Build cross-persona insights injection (team intelligence)
 */
export async function buildCrossPersonaInsightsInjection(
  services: SessionServices,
  personaId: string
): Promise<ContextInjection | null> {
  try {
    const { buildInsightContext, getInsightsToSurface, acknowledgeInsight } =
      await import('../../services/cross-persona-insights.js');

    const validPersonaId = personaId as
      | 'ferni'
      | 'maya'
      | 'peter'
      | 'alex'
      | 'jordan'
      | 'nayan'
      | 'jack';

    const insightContext = buildInsightContext(services.userId || 'anonymous', validPersonaId, {
      maxInsights: 3,
    });

    // Acknowledge insights we're using
    const insightsToSurface = getInsightsToSurface(
      services.userId || 'anonymous',
      validPersonaId,
      2
    );
    for (const item of insightsToSurface) {
      void acknowledgeInsight(
        services.userId || 'anonymous',
        item.insight.id,
        validPersonaId
      ).catch((err) => {
        diag.warn('Failed to acknowledge insight', {
          insightId: item.insight.id,
          error: String(err),
        });
      });
    }

    if (insightContext) {
      return {
        category: 'team_insights',
        content: insightContext,
        priority: 31,
      };
    }
  } catch {
    // Non-fatal
  }

  return null;
}

// ============================================================================
// ADVANCED HUMANIZATION INJECTION BUILDER
// Priority: 25-55 (varies by detection urgency)
// Coordinates all 10 deep humanization capabilities
// ============================================================================

export interface AdvancedHumanizationInjectionContext {
  sessionId: string;
  userId: string;
  userText: string;
  turnCount: number;
  detectedEmotion?: string;
  valence?: number;
  arousal?: number;
  topic?: string;
  relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';
  prosodyHints?: {
    speechRate?: number;
    volume?: number;
    pitchVariance?: number;
  };
}

export interface AdvancedHumanizationInjectionResult {
  injections: ContextInjection[];
  /** Response prefix (repair phrase, milestone, etc.) */
  responsePrefix?: string;
  /** Response suffix (affirmation, hope, etc.) */
  responseSuffix?: string;
  /** Whether to stop giving direct advice */
  stopDirectAdvice: boolean;
  /** Tone guidance for response */
  toneGuidance: string;
  /** Length guidance for response */
  lengthGuidance: 'shorter' | 'normal' | 'longer';
}

/**
 * Build advanced humanization injections
 *
 * Coordinates all 10 capabilities:
 * 1. Subtext Detection - Read between the lines
 * 2. Emotional Aftercare - Guide back to equilibrium
 * 3. Conversational Repair - Recover from miscommunication
 * 4. Hope Injection - Subtle forward-looking language
 * 5. Curiosity Engine - Genuine interest in their life
 * 6. Energy Regulation - Lead vs match energy
 * 7. Micro-Affirmations - Tiny validations throughout
 * 8. Temporal Context - Life rhythm awareness
 * 9. Relationship Events - Track milestones
 * 10. Paradoxical Intervention - Know when advice backfires
 */
export async function buildAdvancedHumanizationInjections(
  ctx: AdvancedHumanizationInjectionContext
): Promise<AdvancedHumanizationInjectionResult> {
  const result: AdvancedHumanizationInjectionResult = {
    injections: [],
    stopDirectAdvice: false,
    toneGuidance: 'warm and present',
    lengthGuidance: 'normal',
  };

  try {
    const { processAdvancedTurn, getResponseModifications } =
      await import('../../conversation/advanced-humanization-integration.js');

    // Process the turn through all 10 capabilities
    const guidance = processAdvancedTurn(ctx.sessionId, ctx.userText, {
      detectedEmotion: ctx.detectedEmotion,
      valence: ctx.valence,
      arousal: ctx.arousal,
      topic: ctx.topic,
      prosodyHints: ctx.prosodyHints,
    });

    // If session not initialized, return early
    if (!guidance) {
      diag.debug('Advanced humanization: session not initialized');
      return result;
    }

    // Transfer core guidance
    result.stopDirectAdvice = guidance.stopDirectAdvice;
    result.toneGuidance = guidance.toneGuidance;
    result.lengthGuidance = guidance.lengthGuidance;

    // Get response modifications (prefixes, suffixes, system prompts)
    const modifications = getResponseModifications(ctx.sessionId);

    if (modifications) {
      // Add system prompt additions as injections
      for (const addition of modifications.systemPromptAdditions) {
        // Determine priority based on content
        let priority = 35; // Default
        if (addition.includes('PRIORITY')) priority = 55;
        else if (addition.includes('⚠️') || addition.includes('STOP')) priority = 52;
        else if (addition.includes('SUBTEXT')) priority = 48;
        else if (addition.includes('AFTERCARE')) priority = 46;
        else if (addition.includes('HOPE')) priority = 30;
        else if (addition.includes('ENERGY')) priority = 28;
        else if (addition.includes('TONE') || addition.includes('LENGTH')) priority = 25;

        result.injections.push({
          category: 'advanced_humanization',
          content: addition,
          priority,
        });
      }

      // Set prefix and suffix
      result.responsePrefix = modifications.prefix;
      result.responseSuffix = modifications.suffix;
    }

    // Log what was detected
    if (guidance.priorityActions.length > 0 || guidance.subtext || guidance.repair) {
      diag.debug('🌟 Advanced humanization active', {
        priorityActions: guidance.priorityActions.length,
        hasSubtext: !!guidance.subtext,
        hasRepair: !!guidance.repair,
        hasAftercare: !!guidance.aftercare,
        stopAdvice: guidance.stopDirectAdvice,
      });
    }
  } catch (error) {
    diag.warn('Advanced humanization failed (non-fatal)', { error: String(error) });
  }

  return result;
}

/**
 * Initialize advanced humanization for a session
 * Should be called when session starts
 */
export async function initAdvancedHumanizationSession(
  sessionId: string,
  userId: string,
  options?: {
    relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';
    prosodyHints?: {
      speechRate?: number;
      volume?: number;
      pitchVariance?: number;
    };
  }
): Promise<{
  greeting: string | null;
  eventFollowUp: string | null;
  milestoneAcknowledgment: string | null;
} | null> {
  try {
    const { initAdvancedHumanization } =
      await import('../../conversation/advanced-humanization-integration.js');

    const result = initAdvancedHumanization({
      sessionId,
      userId,
      relationshipDepth: options?.relationshipDepth,
      prosodyHints: options?.prosodyHints,
    });

    diag.info('🌟 Advanced humanization session initialized', {
      sessionId,
      hasGreeting: !!result.greeting,
      hasMilestone: !!result.milestoneAcknowledgment,
    });

    return result;
  } catch (error) {
    diag.warn('Failed to initialize advanced humanization (non-fatal)', { error: String(error) });
    return null;
  }
}

/**
 * Clean up advanced humanization session
 * Should be called when session ends
 */
export async function cleanupAdvancedHumanizationSession(sessionId: string): Promise<void> {
  try {
    const { cleanupAdvancedHumanization } =
      await import('../../conversation/advanced-humanization-integration.js');

    cleanupAdvancedHumanization(sessionId);
    diag.debug('🧹 Advanced humanization session cleaned up', { sessionId });
  } catch (error) {
    diag.debug('Failed to cleanup advanced humanization (non-fatal)', { error: String(error) });
  }
}

/**
 * Record that advice was given (for resistance tracking)
 */
export async function recordAdviceGivenToSession(sessionId: string): Promise<void> {
  try {
    const { recordAdviceGiven } =
      await import('../../conversation/advanced-humanization-integration.js');
    recordAdviceGiven(sessionId);
  } catch {
    // Non-fatal
  }
}

// ============================================================================
// EMOTIONAL JOURNEY ORCHESTRATOR
// Coordinates all systems for smiles, laughter, vulnerability, and tears
// ============================================================================

export interface EmotionalJourneyContext {
  userId: string;
  sessionId: string;
  turnCount: number;
  sessionCount: number;
  relationshipStage?: string;
  emotion?: {
    primary: string;
    intensity?: number;
    distressLevel?: number;
  };
  voiceEmotion?: {
    arousal?: number;
    valence?: number;
    speechRate?: number;
  };
  resistanceDetected?: boolean;
  vulnerabilityShared?: boolean;
  wasAdviceGiven?: boolean;
  topicsTouched?: string[];
  isLastTurn?: boolean;
}

export interface EmotionalJourneyResult {
  injections: ContextInjection[];
  highEmotionMode: boolean;
  coachingMode: 'direct' | 'exploratory' | 'paradoxical' | 'celebratory' | 'supportive';
  suppressedSystems: string[];
  phase: string;
  momentType: string | null;
}

/**
 * Build emotional journey injections that coordinate all emotional systems
 *
 * This is the master coordinator that ensures:
 * - Smiles come at warm moments (return visits, recognition)
 * - Laughter comes at light moments (NOT during vulnerability)
 * - Vulnerability is invited when trust exists
 * - Tears are held in safe embrace
 * - Celebration honors effort, not just outcomes
 */
export async function buildEmotionalJourneyInjections(
  ctx: EmotionalJourneyContext
): Promise<EmotionalJourneyResult> {
  const result: EmotionalJourneyResult = {
    injections: [],
    highEmotionMode: false,
    coachingMode: 'exploratory',
    suppressedSystems: [],
    phase: 'exploration',
    momentType: null,
  };

  try {
    const { orchestrateEmotionalJourney, buildEmotionalContext } =
      await import('../../conversation/emotional-journey-orchestrator.js');

    // Build context
    const emotionalContext = buildEmotionalContext({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      turnCount: ctx.turnCount,
      sessionCount: ctx.sessionCount,
      relationshipStage: ctx.relationshipStage,
      emotion: ctx.emotion,
      voiceEmotion: ctx.voiceEmotion,
      resistanceDetected: ctx.resistanceDetected,
      vulnerabilityShared: ctx.vulnerabilityShared,
      wasAdviceGiven: ctx.wasAdviceGiven,
      topicsTouched: ctx.topicsTouched,
      isLastTurn: ctx.isLastTurn,
    });

    // Get orchestration decision
    const decision = orchestrateEmotionalJourney(emotionalContext);

    // Transfer results
    result.highEmotionMode = decision.highEmotionMode;
    result.coachingMode = decision.coachingMode;
    result.suppressedSystems = decision.suppressSystems;
    result.phase = decision.phase;
    result.momentType = decision.momentType;

    // Add guidance injection (high priority)
    if (decision.guidance) {
      result.injections.push({
        category: 'emotional_journey',
        content: `[EMOTIONAL JOURNEY - ${decision.phase.toUpperCase()}]\n${decision.guidance}`,
        priority: 60, // High priority - should guide other systems
      });
    }

    // Add moment-specific injection if there's an emotional moment opportunity
    if (decision.momentType) {
      result.injections.push({
        category: 'emotional_moment',
        content: `[MOMENT OPPORTUNITY: ${decision.momentType.replace(/_/g, ' ').toUpperCase()}]`,
        priority: 55,
      });
    }

    // Log for debugging
    diag.debug('🎭 Emotional journey orchestrated', {
      phase: decision.phase,
      momentType: decision.momentType,
      coachingMode: decision.coachingMode,
      highEmotionMode: decision.highEmotionMode,
      activeSystems: decision.activateSystems.length,
      suppressedSystems: decision.suppressSystems.length,
    });
  } catch (error) {
    diag.warn('Emotional journey orchestration failed (non-fatal)', { error: String(error) });
  }

  return result;
}
