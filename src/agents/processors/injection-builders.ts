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
 * Includes: small wins, intentions, growth reflections, callbacks
 */
export async function buildTrustSystemsInjections(
  ctx: InjectionBuilderContext
): Promise<ContextInjection[]> {
  const { userText, services, currentTopic, emotionalState } = ctx;
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
    if (trustContext.growthReflection) {
      injections.push({
        category: 'growth',
        content: `[🌱 GROWTH REFLECTION]\n"${trustContext.growthReflection}"`,
        priority: 66,
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
      ).catch(() => {});
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
