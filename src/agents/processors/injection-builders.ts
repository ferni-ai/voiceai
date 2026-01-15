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
 *
 * PERFORMANCE OPTIMIZATION (Dec 2024 / Jan 2026):
 * - Non-volatile injections cached with 60s TTL (health, visual, ambient, trust, boundary, insights)
 * - Frequently-used modules loaded statically to eliminate dynamic import overhead
 * - Reduces Firestore queries and import latency on every turn
 */

import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/observability/diagnostic-logger.js';
import type { ConversationAnalysis } from '../../services/index.js';
import type { SessionServices } from '../../services/types.js';
import type { UserData } from '../shared/types.js';
import type { ContextInjection, EmotionalState } from './types.js';
// Session dynamics for phase-aware context
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  buildSessionDynamicsInjection,
  mapToLegacyPhase,
  updateSessionDynamics,
} from '../integrations/session-dynamics-integration.js';
// Model provider abstraction
import { getModelProvider } from '../model-provider/index.js';

// ============================================================================
// STATIC IMPORTS - Frequently-used modules loaded once at startup
// Performance: Eliminates ~2-5ms per dynamic import per turn
// ============================================================================

// Safety (TIER 1 - runs every turn)
import { performSafetyCheck } from '../../services/safety/index.js';

// Scientific coaching (TIER 2 - runs most turns)
import { buildScientificCoachingContext } from '../../intelligence/context-builders/coaching/scientific-coaching.js';

// Life coaching (TIER 2 - runs most turns)
import { getCoachingContextForLLM, analyzeForCoaching } from '../../services/coaching/index.js';

// Trust systems (TIER 2 - runs every turn)
import { buildTrustContext } from '../../services/trust-systems/index.js';

// Cross-persona insights (TIER 2 - runs every turn)
import {
  buildInsightContext,
  getInsightsToSurface,
  acknowledgeInsight,
} from '../../services/cross-persona/cross-persona-insights.js';

// Advanced humanization (TIER 2 - runs every turn)
import {
  processAdvancedTurn,
  getResponseModifications,
} from '../../conversation/advanced-humanization-integration.js';

// Performance metrics (timing)
import { recordTrustSystemTiming } from '../../services/performance/performance-metrics.js';

// ============================================================================
// NON-VOLATILE INJECTION CACHE
// Caches slow-changing data like health, visual memory, ambient context
// TTL: 60 seconds - these don't change turn-to-turn
// ============================================================================

interface CachedInjection {
  injection: ContextInjection | null;
  timestamp: number;
}

const NON_VOLATILE_CACHE_TTL_MS = 60_000; // 60 seconds

const nonVolatileInjectionCache = new Map<string, CachedInjection>();

function getCachedInjection(key: string): ContextInjection | null | undefined {
  const cached = nonVolatileInjectionCache.get(key);
  if (!cached) return undefined;

  // Check if expired
  if (Date.now() - cached.timestamp > NON_VOLATILE_CACHE_TTL_MS) {
    nonVolatileInjectionCache.delete(key);
    return undefined;
  }

  return cached.injection;
}

function setCachedInjection(key: string, injection: ContextInjection | null): void {
  nonVolatileInjectionCache.set(cleanForFirestore(key), {
    injection,
    timestamp: Date.now(),
  });

  // Prune old entries if cache gets too large (max 500 entries)
  if (nonVolatileInjectionCache.size > 500) {
    const oldestKey = nonVolatileInjectionCache.keys().next().value;
    if (oldestKey) nonVolatileInjectionCache.delete(oldestKey);
  }
}

/**
 * Clear cache for a specific user (call on session end)
 */
export function clearNonVolatileInjectionCache(userId: string): void {
  for (const key of nonVolatileInjectionCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      nonVolatileInjectionCache.delete(key);
    }
  }
}

/**
 * Get cache stats for monitoring
 */
export function getNonVolatileInjectionCacheStats(): {
  size: number;
  ttlMs: number;
} {
  return {
    size: nonVolatileInjectionCache.size,
    ttlMs: NON_VOLATILE_CACHE_TTL_MS,
  };
}

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
  /** Session ID for session-scoped services like SessionDynamicsEngine */
  sessionId?: string;
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
    // NOTE: performSafetyCheck is now statically imported at module top for performance

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
  const { userText, services, userData, persona, currentTopic, emotionalState, sessionId } = ctx;
  const injections: ContextInjection[] = [];
  let endpointingRecommendation: { minDelay: number; maxDelay: number } | undefined;

  try {
    // NOTE: buildScientificCoachingContext is now statically imported at module top for performance

    // Use SessionDynamicsEngine for accurate phase detection
    let conversationPhase: 'opening' | 'exploring' | 'supporting' | 'closing' = 'exploring';
    if (sessionId) {
      // Update dynamics and get current phase
      const dynamicsResult = updateSessionDynamics({
        sessionId,
        turnCount: userData.turnCount || 1,
        userEnergy:
          emotionalState.intensity > 0.7
            ? 'high'
            : emotionalState.intensity < 0.3
              ? 'low'
              : 'medium',
        topicWeight:
          emotionalState.distressLevel > 0.5
            ? 'heavy'
            : emotionalState.intensity < 0.4
              ? 'light'
              : 'medium',
        wasDeepMoment: emotionalState.distressLevel > 0.6 || emotionalState.intensity > 0.8,
      });
      conversationPhase = mapToLegacyPhase(dynamicsResult.phase);
    } else {
      // Fallback to simple heuristic
      conversationPhase =
        userData.turnCount && userData.turnCount < 3
          ? 'opening'
          : userData.turnCount && userData.turnCount > 10
            ? 'closing'
            : 'exploring';
    }

    const result = await buildScientificCoachingContext({
      userId: services.userId || 'unknown',
      userMessage: userText,
      personaId: persona.id,
      topic: currentTopic,
      emotionalState: emotionalState.primary,
      emotionalIntensity: emotionalState.intensity,
      conversationPhase,
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

/** Persona mapping for coaching module - uses canonical IDs */
const COACHING_PERSONA_MAP: Record<
  string,
  'ferni' | 'maya-santos' | 'alex-chen' | 'peter-john' | 'jordan-taylor' | 'nayan-patel'
> = {
  ferni: 'ferni',
  'maya-santos': 'maya-santos',
  'alex-chen': 'alex-chen',
  'peter-john': 'peter-john',
  'jordan-taylor': 'jordan-taylor',
  'nayan-patel': 'nayan-patel',
  // Legacy aliases
  maya: 'maya-santos',
  alex: 'alex-chen',
  peter: 'peter-john',
  jordan: 'jordan-taylor',
  nayan: 'nayan-patel',
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
    // NOTE: getCoachingContextForLLM, analyzeForCoaching are now statically imported at module top

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
 * Trust systems result including injections AND summary for post-response validation
 */
export interface TrustSystemsResult {
  /** Injections to add to LLM context */
  injections: ContextInjection[];
  /** Summary for post-response monitoring (used by trust enforcement) */
  summary: {
    hasEmotionalMismatch: boolean;
    topicsToAvoid: string[];
    hasGrowthReflection: boolean;
    hasCelebration: boolean;
    hasProactiveOutreach: boolean;
    proactiveOutreach?: {
      type: string;
      message: string;
      personaId?: string;
      context?: string;
    };
  };
}

/**
 * Build trust systems context injections
 * Includes: small wins, intentions, growth reflections, callbacks, unsaid signals
 *
 * Returns both injections (for pre-response guidance) and summary (for post-response monitoring)
 *
 * NOTE: Not cached because trust analysis depends on current userText, topic, and emotion.
 * However, imports are static for performance.
 */
export async function buildTrustSystemsInjections(
  ctx: InjectionBuilderContext
): Promise<TrustSystemsResult> {
  const { userText, services, currentTopic, emotionalState, persona } = ctx;
  const injections: ContextInjection[] = [];
  const startTime = Date.now();

  try {
    // NOTE: buildTrustContext, recordTrustSystemTiming are now statically imported at module top

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
        const { loadPersonaContent } = await import('../../services/persona-service/persona-content-loader.js');
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
          ? 'You had something on your mind to check in about.'
          : dueoutreach.type === 'thought_of_you'
            ? 'Something made you think of them.'
            : dueoutreach.type === 'following_thread'
              ? "There's something they shared that you wanted to follow up on."
              : dueoutreach.type === 'celebrating_quietly'
                ? 'Something good might have happened for them.'
                : dueoutreach.type === 'holding_space'
                  ? 'Something difficult might be happening for them.'
                  : 'You just wanted to connect.';

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

    // =================================================================
    // 💎 FIRST-TIME VULNERABILITY - "This is the first time you've shared this"
    // Detect and honor first-time vulnerable shares with special care
    // =================================================================
    if (trustContext.firstTimeVulnerability?.detected) {
      const vuln = trustContext.firstTimeVulnerability;
      injections.push({
        category: 'vulnerability',
        content: `[💎 FIRST-TIME VULNERABILITY DETECTED]

This is the first time they've shared this with you: "${vuln.topic || 'something personal'}"
Vulnerability level: ${vuln.vulnerabilityLevel}

CRITICAL GUIDANCE:
- Honor this moment with genuine care
- Don't rush to solutions or advice
- Use a gentle, warm tone
- Acknowledge the courage it takes to share
- Let them know they're safe here

Suggested acknowledgment: "${vuln.suggestedAcknowledgment}"

This is "Better than Human" - recognizing the significance of first-time shares. A friend might miss how big this is.`,
        priority: 87, // Very high - vulnerability needs immediate recognition
      });

      diag.info('💎 First-time vulnerability detected', {
        level: vuln.vulnerabilityLevel,
        topic: vuln.topic,
      });
    }

    // =================================================================
    // 🪞 LINGUISTIC MIRRORING - "Speaking their language"
    // Adapt response style to match their vocabulary and formality
    // =================================================================
    if (trustContext.linguisticContext && trustContext.linguisticContext.length > 20) {
      injections.push({
        category: 'linguistic',
        content: `[🪞 LINGUISTIC MIRRORING]

${trustContext.linguisticContext}

This is "Better than Human" - naturally adapting to how they express themselves.`,
        priority: 45, // Lower priority - style guidance, not urgent
      });
    }

    // =================================================================
    // 🛡️ PROTECTIVE MEMORY - "Guard their boundaries"
    // Track when advice was premature, boundaries are softening
    // =================================================================
    if (trustContext.protectiveMemory && trustContext.protectiveMemory.length > 20) {
      injections.push({
        category: 'protective',
        content: `[🛡️ PROTECTIVE MEMORY]

${trustContext.protectiveMemory}

This is "Better than Human" - remembering when advice wasn't welcome, noticing when they're compromising themselves.`,
        priority: 78, // High - protecting user from harm
      });
    }

    // Record trust system timing
    recordTrustSystemTiming(Date.now() - startTime);

    // Check for pending proactive outreach
    const pendingOutreach = trustContext.pendingOutreach?.[0];
    const hasProactiveOutreach = !!pendingOutreach;

    // Return both injections and summary
    return {
      injections,
      summary: {
        hasEmotionalMismatch:
          trustContext.unsaidSignals?.some(
            (s) => s.type === 'emotional_mismatch' && s.confidence > 0.7
          ) ?? false,
        topicsToAvoid: trustContext.topicsToAvoid ?? [],
        hasGrowthReflection: !!trustContext.growthReflection,
        hasCelebration: !!trustContext.celebrationOpportunity,
        hasProactiveOutreach,
        proactiveOutreach: hasProactiveOutreach
          ? {
              type: pendingOutreach.type,
              message: pendingOutreach.message,
              context: pendingOutreach.trigger?.context,
            }
          : undefined,
      },
    };
  } catch (error) {
    diag.warn('Trust context failed (non-fatal)', { error: String(error) });
  }

  // Return empty result on failure
  return {
    injections,
    summary: {
      hasEmotionalMismatch: false,
      topicsToAvoid: [],
      hasGrowthReflection: false,
      hasCelebration: false,
      hasProactiveOutreach: false,
    },
  };
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
        analysis.emotion
          .primary as import('../../intelligence/detectors/emotion.js').PrimaryEmotion,
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
// PERFORMANCE: Cached for 60s - insights don't change turn-to-turn
// ============================================================================

/**
 * Build cross-persona insights injection (team intelligence)
 *
 * PERFORMANCE: Cached for 60s - insights don't change turn-to-turn.
 * Static imports used for performance.
 */
export async function buildCrossPersonaInsightsInjection(
  services: SessionServices,
  personaId: string
): Promise<ContextInjection | null> {
  // Check cache first (60s TTL)
  const userId = services.userId || 'anonymous';
  const cacheKey = `${userId}:${personaId}:insights`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Cross-persona insights cache hit', { userId, personaId });
    return cached;
  }

  try {
    // NOTE: buildInsightContext, getInsightsToSurface, acknowledgeInsight are now statically imported

    const validPersonaId = personaId as
      | 'ferni'
      | 'maya'
      | 'peter'
      | 'alex'
      | 'jordan'
      | 'nayan'
      | 'jack';

    const insightContext = buildInsightContext(userId, validPersonaId, {
      maxInsights: 3,
    });

    // Acknowledge insights we're using
    const insightsToSurface = getInsightsToSurface(userId, validPersonaId, 2);
    for (const item of insightsToSurface) {
      void acknowledgeInsight(userId, item.insight.id, validPersonaId).catch((err) => {
        diag.warn('Failed to acknowledge insight', {
          insightId: item.insight.id,
          error: String(err),
        });
      });
    }

    if (insightContext) {
      const result: ContextInjection = {
        category: 'team_insights',
        content: insightContext,
        priority: 31,
      };
      // Cache the result
      setCachedInjection(cacheKey, result);
      return result;
    }

    // Cache null result
    setCachedInjection(cacheKey, null);
  } catch {
    // Non-fatal - cache null to avoid retrying every turn
    setCachedInjection(cacheKey, null);
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
    // NOTE: processAdvancedTurn, getResponseModifications are now statically imported at module top

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

// ============================================================================
// AMBIENT AWARENESS INJECTION BUILDER
// Priority: 77-79 ("Better than Human" - noticing environment)
// ============================================================================

/**
 * Build ambient awareness context injection
 *
 * "Better than Human" - A human friend on the phone might not notice
 * you're at a coffee shop or in a car. We do, and we acknowledge it.
 *
 * This tells the LLM about the user's environment so it can:
 * - Naturally acknowledge noisy environments
 * - Offer to pause if it's very loud
 * - Keep responses brief if user is on the go
 */
export function buildAmbientAwarenessInjections(userData: UserData): ContextInjection[] {
  const injections: ContextInjection[] = [];

  // Only inject if we've detected a meaningful environment
  const environment = userData.ambientEnvironment;
  const noiseLevel = userData.ambientNoiseLevel ?? 0;
  const hasOfferedToPause = userData.hasOfferedToPause ?? false;

  if (!environment || environment === 'quiet_room' || environment === 'unknown') {
    return injections;
  }

  // Map environment to natural language
  const environmentDescriptions: Record<string, string> = {
    office: 'an office (background conversations, typing)',
    coffee_shop: 'a coffee shop (ambient chatter, music)',
    outdoors: 'outside (wind, traffic sounds)',
    car: 'a car (road noise, engine)',
    public_transit: 'public transit (announcements, crowd)',
    noisy: 'somewhere noisy',
  };

  const envDescription = environmentDescriptions[environment] || 'a busy environment';

  // High noise - consider offering to pause
  if (noiseLevel > 0.6 && !hasOfferedToPause) {
    injections.push({
      category: 'ambient_awareness',
      content: `[🔊 AMBIENT AWARENESS - "Better than Human"]
It sounds like they're in ${envDescription}. The background noise is significant.

Natural acknowledgment: "It sounds like you're somewhere pretty busy - if it's hard to hear or you need to go, just say so."

This shows you're paying attention to THEM, not just their words. A human friend on the phone might not notice. You did.

Keep responses concise and clear for their noisy environment.`,
      priority: 79,
    });

    diag.info('🔊 Noisy environment detected', {
      environment,
      noiseLevel: noiseLevel.toFixed(2),
      suggesting: 'offer_to_pause',
    });
  }
  // Moderate noise - just acknowledge naturally
  else if (noiseLevel > 0.35) {
    injections.push({
      category: 'ambient_awareness',
      content: `[🔊 AMBIENT CONTEXT]
User appears to be in ${envDescription}.

Consideration: Keep responses clear and slightly more concise. Don't mention the environment unless it's natural to do so.`,
      priority: 77,
    });
  }
  // On-the-go environments (car, transit) - brief responses
  else if (environment === 'car' || environment === 'public_transit') {
    injections.push({
      category: 'ambient_awareness',
      content: `[🚗 ON-THE-GO]
User appears to be traveling (${environment === 'car' ? 'driving/riding' : 'on transit'}).

Keep responses brief and to the point. They're multitasking.`,
      priority: 77,
    });
  }

  return injections;
}

// ============================================================================
// BOUNDARY CHECK DETAILED GUIDANCE
// Priority: 88-91 (High - respect boundaries)
// ============================================================================

/**
 * Build detailed boundary guidance injections
 *
 * "Better than Human" - We don't just know what topics to avoid,
 * we know HOW to approach sensitive areas with care.
 *
 * This goes beyond simple topic avoidance to provide nuanced guidance:
 * - When a topic is being approached carefully
 * - What language to use to be respectful
 * - How to create space without pushing
 */
export interface BoundaryCheckContext {
  userId: string;
  proposedContent?: string;
  currentTopic?: string;
}

export async function buildBoundaryCheckInjections(
  ctx: BoundaryCheckContext
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  try {
    const { checkBoundary, getActiveBoundaries, getProbingDepth } =
      await import('../../services/trust-systems/boundary-memory.js');

    // Get active boundaries for this user
    const boundaries = getActiveBoundaries(ctx.userId);

    if (boundaries.length > 0) {
      // Check if current topic is near any boundaries
      const topicLower = ctx.currentTopic?.toLowerCase() || '';

      for (const boundary of boundaries) {
        const isNearBoundary =
          topicLower.includes(boundary.topic.toLowerCase()) ||
          boundary.relatedTerms.some((term) => topicLower.includes(term.toLowerCase()));

        if (isNearBoundary) {
          // This topic is near a boundary - provide careful guidance
          const approachGuidance =
            boundary.strength === 'absolute'
              ? `ABSOLUTE BOUNDARY: Do NOT bring up "${boundary.topic}" directly. If they bring it up, follow their lead but don't probe.`
              : boundary.strength === 'strong'
                ? `SENSITIVE AREA: "${boundary.topic}" caused distress before. If it comes up naturally, acknowledge gently without dwelling.`
                : `APPROACH WITH CARE: "${boundary.topic}" is a sensitive area. Be thoughtful in how you engage.`;

          injections.push({
            category: 'boundary_guidance',
            content: `[🛡️ BOUNDARY AWARENESS - "Better than Human"]
${approachGuidance}

Context: ${boundary.context?.slice(0, 100) || 'No context available'}
Type: ${boundary.type} (${boundary.strength})
${boundary.userReopened ? 'Note: They have reopened this topic before - follow their lead.' : ''}

A human friend might accidentally stumble into painful territory. You know better. Honor their boundaries.`,
            priority: boundary.strength === 'absolute' ? 91 : 88,
          });

          diag.info('🛡️ Near boundary detected', {
            topic: boundary.topic,
            strength: boundary.strength,
            type: boundary.type,
          });
        }
      }
    }

    // Also check probing depth preference
    const probingDepth = getProbingDepth(ctx.userId);
    if (probingDepth === 'low') {
      injections.push({
        category: 'probing_preference',
        content: `[PROBING PREFERENCE: GENTLE]
This person prefers surface-level conversations. Don't dig too deep or ask probing follow-ups.
Respect their boundaries around emotional depth.`,
        priority: 78,
      });
    }
  } catch (error) {
    diag.warn('Boundary check injection failed (non-fatal)', { error: String(error) });
  }

  return injections;
}

// ============================================================================
// HEALTH AWARENESS INJECTION BUILDER
// Priority: 76 (Lower - operational awareness)
// ============================================================================

/**
 * Build health awareness injections
 *
 * "Better than Human" - We're transparent about our limitations.
 * When services are degraded, we proactively communicate this warmly
 * so users understand and trust us even when things aren't perfect.
 *
 * This injects context about:
 * - Service degradation (music, weather, calendar, etc.)
 * - Recent recoveries (good news to share)
 * - Capability limitations
 */
export async function buildHealthAwarenessInjections(): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  try {
    const { getHealthContext, getSystemPromptInjection } =
      await import('../../services/self-healing/conversation-health.js');

    const healthContext = getHealthContext();

    // Only inject if there's something relevant
    if (
      healthContext.degradedServices.length === 0 &&
      healthContext.recoveryMessages.length === 0
    ) {
      return injections;
    }

    // Build the injection content
    let content = '[🏥 SYSTEM HEALTH AWARENESS - "Better than Human"]\n';

    // Add recovery messages first (positive news!)
    if (healthContext.recoveryMessages.length > 0) {
      content += `\nGOOD NEWS: ${healthContext.recoveryMessages[0]}\n`;
      content += `You can mention this naturally if the topic comes up.\n`;
    }

    // Add degradation context
    if (healthContext.degradedServices.length > 0) {
      const systemInjection = getSystemPromptInjection();
      if (systemInjection) {
        content += systemInjection;
      }

      // Add guidance that prioritizes TRYING TOOLS over apologizing
      // NOTE: This must NOT contradict function-calling-base.md which says:
      // "NEVER SAY: 'I'm having trouble accessing...'"
      content += `
IMPORTANT: Even if a service is degraded, STILL TRY THE TOOL.
- Output the JSON function call - the system has fallbacks
- Don't pre-apologize - let the tool execution determine the result
- If the tool actually fails, the result will tell you what to say
- Example: User asks for weather → Output {"fn":"getWeather","args":{}} anyway
`;
    }

    // Add affected capabilities context
    if (healthContext.affectedCapabilities.length > 0) {
      content += `\nAffected capabilities: ${healthContext.affectedCapabilities.join(', ')}\n`;
    }

    injections.push({
      category: 'health_awareness',
      content,
      priority: 76,
    });

    diag.debug('🏥 Health awareness injected', {
      degradedCount: healthContext.degradedServices.length,
      recoveries: healthContext.recoveryMessages.length,
      overall: healthContext.overallHealth,
    });
  } catch (error) {
    // Health awareness is non-critical - don't fail the turn
    diag.debug('Health awareness injection skipped', { error: String(error) });
  }

  return injections;
}

// ============================================================================
// "BETTER THAN HUMAN" INJECTION BUILDERS
// Priority: 72-78 (high but below safety)
// These 4 capabilities make Ferni genuinely better than a human friend
// ============================================================================

/**
 * Build user health awareness injection (Apple HealthKit data)
 *
 * "Better than Human" - We KNOW when you're sleep-deprived, stressed, or
 * have been less active. A human friend has to guess. We know for sure.
 *
 * PERFORMANCE: Cached for 60s - health data doesn't change turn-to-turn
 *
 * @param userId - User ID to fetch health data for
 * @returns Context injection with health insights, or null if disabled/unavailable
 */
export async function buildUserHealthInjection(userId: string): Promise<ContextInjection | null> {
  // Check cache first (60s TTL)
  const cacheKey = `${userId}:health`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Health injection cache hit', { userId });
    return cached;
  }

  try {
    const { buildHealthAwarenessInjection } = await import('../../services/health/index.js');
    const coreInjection = await buildHealthAwarenessInjection(userId);

    let result: ContextInjection | null = null;
    if (coreInjection) {
      // Convert from core/types.ContextInjection to processors/types.ContextInjection
      result = {
        category: coreInjection.category || 'better_than_human',
        content: coreInjection.content,
        priority:
          coreInjection.priority === 'critical' ? 95 : coreInjection.priority === 'high' ? 80 : 60,
      };
    }

    // Cache result (including null)
    setCachedInjection(cacheKey, result);
    return result;
  } catch (error) {
    diag.debug('User health injection skipped', { userId, error: String(error) });
    // Cache null on error too (don't retry every turn)
    setCachedInjection(cacheKey, null);
    return null;
  }
}

/**
 * Build visual memory injection (photo/image recall)
 *
 * "Better than Human" - We remember every photo you've ever shared.
 * A human friend might forget that dog photo from 6 months ago. We don't.
 *
 * PERFORMANCE: Cached for 60s - visual memories don't change turn-to-turn
 *
 * @param userId - User ID to fetch visual memories for
 * @returns Context injection with relevant visual memory references, or null
 */
export async function buildVisualMemoryInjections(
  userId: string
): Promise<ContextInjection | null> {
  // Check cache first (60s TTL)
  const cacheKey = `${userId}:visual`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Visual memory injection cache hit', { userId });
    return cached;
  }

  try {
    const { buildVisualMemoryInjection } = await import('../../services/visual-memory/index.js');
    const coreInjection = await buildVisualMemoryInjection(userId);

    let result: ContextInjection | null = null;
    if (coreInjection) {
      // Convert from core/types.ContextInjection to processors/types.ContextInjection
      result = {
        category: coreInjection.category || 'better_than_human',
        content: coreInjection.content,
        priority:
          coreInjection.priority === 'critical' ? 95 : coreInjection.priority === 'high' ? 80 : 60,
      };
    }

    // Cache result (including null)
    setCachedInjection(cacheKey, result);
    return result;
  } catch (error) {
    diag.debug('Visual memory injection skipped', { userId, error: String(error) });
    // Cache null on error too (don't retry every turn)
    setCachedInjection(cacheKey, null);
    return null;
  }
}

/**
 * Build ambient mode injection (continuous background presence)
 *
 * "Better than Human" - We know where you are (home/work/gym), what time it is,
 * and can gently nudge you at the right moments. A human friend isn't always there.
 * We are, even when you're not talking to us.
 *
 * PERFORMANCE: Cached for 60s - ambient context doesn't change turn-to-turn
 *
 * @param userId - User ID to fetch ambient context for
 * @returns Context injection with location/time awareness, or null
 */
export async function buildAmbientModeInjections(userId: string): Promise<ContextInjection | null> {
  // Check cache first (60s TTL)
  const cacheKey = `${userId}:ambient`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Ambient mode injection cache hit', { userId });
    return cached;
  }

  try {
    const { buildAmbientModeInjection } = await import('../../services/ambient-mode/index.js');
    const coreInjection = await buildAmbientModeInjection(userId);

    let result: ContextInjection | null = null;
    if (coreInjection) {
      // Convert from core/types.ContextInjection to processors/types.ContextInjection
      result = {
        category: coreInjection.category || 'better_than_human',
        content: coreInjection.content,
        priority:
          coreInjection.priority === 'critical' ? 95 : coreInjection.priority === 'high' ? 80 : 60,
      };
    }

    // Cache result (including null)
    setCachedInjection(cacheKey, result);
    return result;
  } catch (error) {
    diag.debug('Ambient mode injection skipped', { userId, error: String(error) });
    // Cache null on error too (don't retry every turn)
    setCachedInjection(cacheKey, null);
    return null;
  }
}

/**
 * Build human transfer awareness injection
 *
 * "Better than Human" - We know when to bring in a human.
 * We're not too proud to admit when you need professional help.
 * And when we do transfer, it's a WARM handoff with full context.
 *
 * @param userText - Current user message to evaluate
 * @param userId - Optional user ID for logging crisis signals to Firestore
 * @returns Context injection with transfer guidance if needed, or null
 */
export async function buildHumanTransferInjections(
  userText: string,
  userId?: string
): Promise<ContextInjection | null> {
  try {
    const { humanTransfer, buildTransferAwarenessContext, logCrisisSignal } =
      await import('../../services/human-transfer/index.js');

    // Detect crisis signals first
    const signals = humanTransfer.detectCrisisSignals(userText);

    // Log significant signals to Firestore for analytics and follow-up
    // Severity is 0-10: 0 = none, 1-3 = mild, 4-6 = moderate, 7-10 = severe
    if (userId && signals.severity > 0) {
      // Fire and forget - don't block injection on logging
      // logCrisisSignal(userId, signals, transcript?, sessionId?)
      logCrisisSignal(userId, signals, userText).catch((err: Error) => {
        diag.debug('Crisis signal logging failed', { error: String(err) });
      });
    }

    // Evaluate if transfer might be needed
    const decision = humanTransfer.evaluateTransferNeed(userText);

    // If no transfer needed, return null
    if (decision.type === 'none') {
      return null;
    }

    // Build the context injection
    const content = buildTransferAwarenessContext(decision);
    if (!content) return null;

    // Priority based on urgency (TransferUrgency: 'immediate' | 'soon' | 'when_ready' | 'informational')
    const priority = decision.urgency === 'immediate' ? 95 : decision.urgency === 'soon' ? 88 : 80;

    diag.info('🆘 Human transfer awareness injected', {
      type: decision.type,
      urgency: decision.urgency,
      reason: decision.reason.slice(0, 100),
    });

    return {
      category: 'better_than_human',
      content,
      priority,
    };
  } catch (error) {
    diag.debug('Human transfer injection skipped', { error: String(error) });
    return null;
  }
}

// ============================================================================
// CRISIS HISTORY INJECTION BUILDER (Better Than Human)
// Priority: 85 (important for continuity but below active crisis)
// ============================================================================

/**
 * Build crisis history context injection for users who had recent crisis.
 * BETTER-THAN-HUMAN: Remember past crises and gently check in.
 *
 * @param userId - User ID to check crisis history for
 * @returns Context injection with crisis follow-up guidance, or null
 */
export async function buildCrisisHistoryInjection(
  userId: string
): Promise<ContextInjection | null> {
  try {
    const { hadRecentCrisis } = await import('../../services/human-transfer/index.js');

    const { hasCrisis, lastCrisis } = await hadRecentCrisis(userId, 7);

    if (!hasCrisis || !lastCrisis) {
      return null;
    }

    // Build gentle follow-up context
    const daysSince = Math.floor(
      (Date.now() - new Date(lastCrisis.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    );

    const sections: string[] = [];
    sections.push('[CRISIS FOLLOW-UP - Better Than Human]');
    sections.push('');
    sections.push(`This user had a difficult moment ${daysSince} day(s) ago.`);
    sections.push(`Type: ${lastCrisis.escalationType}`);
    sections.push('');
    sections.push('GENTLE CHECK-IN GUIDANCE:');
    sections.push("- Don't immediately bring it up - let them lead");
    sections.push('- If they seem down, you might ask: "How have you been doing since last time?"');
    sections.push(
      '- If they mention struggling again, acknowledge: "I remember last time was hard."'
    );
    sections.push('- Be ready to provide resources again if needed');
    sections.push('');
    sections.push('This is better-than-human: we remember what matters.');

    diag.info('🔁 Crisis follow-up context injected', {
      userId,
      daysSince,
      escalationType: lastCrisis.escalationType,
    });

    return {
      category: 'better_than_human',
      content: sections.join('\n'),
      priority: 85,
    };
  } catch (error) {
    diag.debug('Crisis history injection skipped', { error: String(error) });
    return null;
  }
}

// ============================================================================
// SESSION DYNAMICS INJECTION BUILDER
// Priority: 55-60 (guides response behavior based on conversation phase)
// ============================================================================

/**
 * Build session dynamics injection for LLM context.
 * Re-exported from session-dynamics-integration for convenience.
 *
 * This provides phase-aware guidance:
 * - Opening: Warm, accessible, avoid deep probing
 * - Warming: Build on previous, test comfort
 * - Engaged: Peak responsiveness, full emotional range
 * - Deepening: Profound questions, pattern naming
 * - Winding: Consolidate, summarize, plant seeds
 * - Extended: Check-ins, acknowledge fatigue
 */
export { buildSessionDynamicsInjection } from '../integrations/session-dynamics-integration.js';

// ============================================================================
// SEMANTIC INTELLIGENCE INJECTION BUILDER
// Priority: 75-80 (tool hints help LLM make better tool decisions)
// ============================================================================

/**
 * Enhanced result from semantic intelligence that includes:
 * - The context injection for LLM (if any)
 * - The tool prediction for learning loop comparison
 */
export interface SemanticIntelligenceInjectionResult {
  /** Context injection for LLM (null if no meaningful hints) */
  injection: ContextInjection | null;

  /**
   * Tool prediction to store in userData for learning loop.
   * When a tool is actually executed, the executor compares this prediction
   * to the actual tool to detect implicit corrections.
   */
  prediction?: {
    toolId: string;
    confidence: number;
    isToolRequest: boolean;
  };
}

/**
 * Build semantic intelligence injection for LLM context.
 *
 * This provides:
 * - Tool hints based on semantic analysis
 * - Learned user patterns
 * - Intent classification
 * - Proactive suggestions
 *
 * Key insight: JSON handles tool dispatch (reliable),
 * semantic adds hints (no auto-execution risk).
 *
 * Returns both the injection AND the prediction so turn-processor
 * can store the prediction in userData for the learning loop.
 */
export async function buildSemanticIntelligenceInjection(params: {
  userId: string;
  sessionId: string;
  personaId: string;
  userText: string;
  recentTools?: string[];
  recentTopics?: string[];
}): Promise<SemanticIntelligenceInjectionResult> {
  try {
    const { getSemanticIntelligence } =
      await import('../../intelligence/semantic-intelligence/index.js');

    const result = await getSemanticIntelligence({
      userId: params.userId,
      sessionId: params.sessionId,
      personaId: params.personaId,
      inputText: params.userText,
      recentTools: params.recentTools,
      recentTopics: params.recentTopics,
    });

    // Extract the top prediction for learning loop
    const topHint = result.toolHints.hints[0];
    const prediction = topHint
      ? {
          toolId: topHint.toolId,
          confidence: topHint.confidence,
          isToolRequest: result.toolHints.isToolRequest,
        }
      : undefined;

    // Only inject if we have meaningful hints
    if (!result.combinedInjection || result.combinedInjection.trim().length === 0) {
      return { injection: null, prediction };
    }

    diag.debug('🧠 Semantic intelligence injected', {
      userId: params.userId,
      topHint: topHint?.toolId,
      intentType: result.intentClassification.type,
      isToolRequest: result.toolHints.isToolRequest,
      processingTimeMs: result.totalProcessingTimeMs,
    });

    return {
      injection: {
        category: 'semantic_intelligence',
        content: result.combinedInjection,
        priority: 78, // High but below crisis/safety
      },
      prediction,
    };
  } catch (error) {
    diag.debug('Semantic intelligence injection skipped', { error: String(error) });
    return { injection: null };
  }
}

// ============================================================================
// FUNCTION CALLING REINFORCEMENT
// Priority: 90 (very high - critical for tool execution)
// FIX (Jan 2026): Gemini sometimes "forgets" JSON format in long conversations
// This reinforcement is injected when tool requests are detected
// ============================================================================

/**
 * Patterns that indicate a tool request
 * These are common phrases users say when they want something done
 */
const TOOL_REQUEST_PATTERNS = [
  // Music
  /\b(play|put on|listen to)\s+(some\s+)?(music|song|jazz|rock|spotify)/i,
  /\b(play|put on)\s+\w+/i, // "play something", "put on X"
  /\bcould you play\b/i,
  /\bcan you play\b/i,

  // Weather
  /\b(weather|temperature|forecast|rain|cold|hot outside)\b/i,
  /\bwhat('s| is)\s+(the\s+)?(weather|temp)/i,

  // Time
  /\bwhat\s+time\b/i,
  /\bthe\s+time\b/i,

  // Calendar
  /\b(calendar|schedule|appointment|meeting)\b/i,
  /\bwhat('s| do I have)?\s+(on\s+)?(today|tomorrow|my calendar)\b/i,

  // Calling/outreach
  /\b(call|text|message|reach out to|contact)\s+\w+/i,

  // News
  /\b(news|headlines|what('s| is) happening)\b/i,

  // Handoffs
  /\b(talk to|speak with|transfer|switch to)\s+(maya|peter|alex|jordan|nayan|ferni)\b/i,

  // General action requests
  /\bcan you\s+\w+/i,
  /\bcould you\s+\w+/i,
  /\bwould you\s+\w+/i,
];

/**
 * Detect if user text looks like a tool request
 */
function detectToolRequest(userText: string): boolean {
  const text = userText.toLowerCase().trim();
  return TOOL_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Build function-calling reinforcement injection
 *
 * CRITICAL: This fixes the issue where Gemini outputs text like
 * "I'm playing music now!" instead of the JSON tool call.
 *
 * Only injected when:
 * 1. User text looks like a tool request
 * 2. Not using OpenAI Realtime (which has native function calling)
 * 3. Not using semantic routing as primary (which bypasses LLM)
 */
export function buildFunctionCallingReinforcement(
  userText: string,
  turnCount: number
): ContextInjection | null {
  // Skip if provider has native function calling (e.g., OpenAI Realtime)
  const provider = getModelProvider();
  if (provider.hasNativeFunctionCalling()) {
    return null;
  }

  // Skip if semantic routing is primary (tools handled before LLM)
  if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    return null;
  }

  // Only reinforce if this looks like a tool request
  if (!detectToolRequest(userText)) {
    return null;
  }

  // Build the reinforcement content
  // More aggressive for later turns where Gemini might have "forgotten"
  const isLongSession = turnCount > 20;

  const content = `
🚨 TOOL REQUEST DETECTED - OUTPUT JSON ONLY 🚨

The user is asking for an ACTION. You MUST output JSON, not text.

${isLongSession ? '⚠️ REMINDER: Saying "I\'m doing X" does NOT do X. Only JSON executes.' : ''}

CORRECT:
- Music request → {"fn":"playMusic","args":{"query":"..."}}
- Weather request → {"fn":"getWeather","args":{}}
- Call/text request → {"fn":"reachOut","args":{"contact":"...","purpose":"..."}}
- Handoff request → {"fn":"handoffToMaya","args":{"reason":"..."}}

WRONG:
- "I'm playing music now!" ← DOES NOTHING
- "Let me check the weather!" ← DOES NOTHING
- "I'll call them!" ← DOES NOTHING

OUTPUT ONLY THE JSON. NO WORDS. NO PREAMBLE. JUST THE JSON OBJECT.
`.trim();

  diag.debug('🔧 Function calling reinforcement injected', {
    turnCount,
    isLongSession,
    userTextPreview: userText.slice(0, 50),
  });

  return {
    category: 'function_calling_reinforcement',
    content,
    priority: 90, // Very high - just below safety
  };
}
