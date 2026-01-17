/**
 * Scientific Coaching Context Builder
 *
 * Integrates all research-backed intelligence systems into
 * every conversation turn. This is the "brain" that connects:
 *
 * - Cognitive distortion detection
 * - Wellbeing tracking & early warning
 * - Behavioral economics nudges
 * - Population wisdom synthesis
 * - Scientific knowledge base
 *
 * @module ScientificCoachingContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  type ContextInjection,
  type ContextPriority,
  createHintInjection,
  createStandardInjection,
  createCriticalInjection,
} from '../index.js';

const log = createLogger({ module: 'ScientificCoachingContext' });

// Helper to create injection with proper id
let counter = 0;
function createInjection(
  source: string,
  content: string,
  priority: ContextPriority
): ContextInjection {
  return {
    id: `sci_${source}_${++counter}`,
    source,
    content,
    priority,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface ScientificCoachingInput {
  userId: string;
  userMessage: string;
  personaId: string;

  // Optional context
  topic?: string;
  emotionalState?: string;
  emotionalIntensity?: number;
  conversationPhase?: 'opening' | 'exploring' | 'supporting' | 'closing';
  turnNumber?: number;
  sessionDurationMinutes?: number;

  // Feature flags
  enableDistortionDetection?: boolean;
  enableWellbeingTracking?: boolean;
  enableNudges?: boolean;
  enableWisdom?: boolean;
}

export interface ScientificCoachingResult {
  injections: ContextInjection[];
  detectedDistortions: string[];
  wellbeingSignals: Record<string, number>;
  warnings: string[];
  nudges: string[];
  endpointingRecommendation?: {
    minDelay: number;
    maxDelay: number;
  };
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build scientific coaching context for a conversation turn.
 * This is called on every user message to enrich LLM context.
 */
export async function buildScientificCoachingContext(
  input: ScientificCoachingInput
): Promise<ScientificCoachingResult> {
  const {
    userId,
    userMessage,
    personaId,
    topic,
    emotionalState,
    emotionalIntensity = 0.5,
    conversationPhase = 'exploring',
    turnNumber = 1,
    enableDistortionDetection = true,
    enableWellbeingTracking = true,
    enableNudges = true,
    enableWisdom = true,
  } = input;

  const result: ScientificCoachingResult = {
    injections: [],
    detectedDistortions: [],
    wellbeingSignals: {},
    warnings: [],
    nudges: [],
  };

  try {
    // =========================================================================
    // 1. COGNITIVE DISTORTION DETECTION
    // =========================================================================
    if (enableDistortionDetection && userMessage.length > 20) {
      try {
        const { detectDistortions, getDistortionContextInjection, recordANT } =
          await import('../../../services/cognitive-intelligence/index.js');

        const distortions = detectDistortions(userId, userMessage, {
          emotionalState,
          recentTopics: topic ? [topic] : undefined,
        });

        if (distortions.length > 0) {
          result.detectedDistortions = distortions.map((d) => d.type);

          // Record for ANT tracking
          for (const distortion of distortions) {
            recordANT(userId, distortion, {
              topic,
              emotionalContext: emotionalState,
              intensity: emotionalIntensity,
            });
          }

          // Add context injection
          const injection = getDistortionContextInjection(distortions);
          if (injection) {
            const priority: ContextPriority = distortions[0].confidence > 0.7 ? 'high' : 'standard';
            result.injections.push(createInjection('cognitive_intelligence', injection, priority));
          }

          log.debug(
            { userId, distortions: result.detectedDistortions },
            'Cognitive distortions detected'
          );
        }
      } catch (error) {
        log.warn({ error }, 'Distortion detection failed');
      }
    }

    // =========================================================================
    // 2. WELLBEING DETECTION & TRACKING
    // =========================================================================
    if (enableWellbeingTracking && userMessage.length > 15) {
      try {
        const { detectWellbeing, recordSnapshot, getWellbeingProfile } =
          await import('../../../services/wellbeing-tracking/index.js');
        const { checkWarnings, getWarningContextInjection } =
          await import('../../../services/wellbeing-tracking/early-warning.js');

        // Detect wellbeing signals from message
        const detected = detectWellbeing(userMessage);

        if (Object.keys(detected.dimensions).length > 0) {
          result.wellbeingSignals = detected.dimensions as Record<string, number>;

          // Record snapshot
          recordSnapshot(userId, detected.dimensions, {
            source: 'detected',
            confidence: detected.confidence,
            topic,
          });

          log.debug({ userId, signals: detected.signals.length }, 'Wellbeing signals detected');
        }

        // Check for early warnings
        const profile = getWellbeingProfile(userId);
        const warnings = checkWarnings(profile, {
          recentMessages: [userMessage],
          emotionalTone: emotionalState,
          topics: topic ? [topic] : undefined,
        });

        if (warnings.length > 0) {
          result.warnings = warnings.map((w) => w.type);

          // Add warning context for serious concerns
          const serious = warnings.filter((w) => w.severity !== 'watch');
          if (serious.length > 0) {
            const warningInjection = getWarningContextInjection(userId);
            if (warningInjection) {
              result.injections.push(
                createInjection('early_warning', warningInjection, 'critical')
              );
            }
          }

          log.info({ userId, warnings: result.warnings }, 'Early warnings detected');
        }
      } catch (error) {
        log.warn({ error }, 'Wellbeing tracking failed');
      }
    }

    // =========================================================================
    // 3. BEHAVIORAL ECONOMICS NUDGES
    // =========================================================================
    if (enableNudges && shouldOfferNudge(userMessage, topic, conversationPhase)) {
      try {
        const { selectNudges, getNudgeContextInjection } =
          await import('../../../services/behavioral-economics/nudge-engine.js');

        const goalType = inferGoalType(topic, userMessage);
        const stage = inferChangeStage(userMessage);

        if (goalType && stage) {
          const nudgeContext = getNudgeContextInjection({
            userId,
            goalType,
            currentStage: stage,
            motivationLevel: emotionalIntensity > 0.5 ? 0.7 : 0.4,
          });

          if (nudgeContext) {
            result.nudges = selectNudges({
              userId,
              goalType,
              currentStage: stage,
              motivationLevel: 0.5,
            }).map((n) => n.type);

            result.injections.push(createInjection('behavioral_economics', nudgeContext, 'hint'));
          }
        }
      } catch (error) {
        log.warn({ error }, 'Nudge selection failed');
      }
    }

    // =========================================================================
    // 4. WISDOM SYNTHESIS
    // =========================================================================
    if (enableWisdom && turnNumber >= 3) {
      try {
        const { getWisdomContextInjection } =
          await import('../../../services/wisdom-synthesis/index.js');

        const situationType = inferSituationType(topic, emotionalState, userMessage);
        if (situationType) {
          const wisdomInjection = getWisdomContextInjection(userId, situationType);

          if (wisdomInjection) {
            result.injections.push(createInjection('wisdom_synthesis', wisdomInjection, 'hint'));
          }
        }
      } catch (error) {
        log.warn({ error }, 'Wisdom synthesis failed');
      }
    }

    // =========================================================================
    // 5. ADAPTIVE ENDPOINTING
    // =========================================================================
    try {
      const { getEndpointingRecommendation } =
        await import('../../../conversation/adaptive-endpointing.js');

      const endpointing = getEndpointingRecommendation(userMessage, {
        emotionalIntensity,
        conversationPhase,
      });

      result.endpointingRecommendation = {
        minDelay: endpointing.minDelay,
        maxDelay: endpointing.maxDelay,
      };
    } catch (error) {
      log.warn({ error }, 'Endpointing calculation failed');
    }

    // =========================================================================
    // 6. PERSONA-SPECIFIC SCIENTIFIC FOCUS
    // =========================================================================
    const personaFocus = getPersonaScientificFocus(personaId);
    if (personaFocus && result.injections.length < 3) {
      result.injections.push(createInjection('persona_science', personaFocus, 'hint'));
    }
  } catch (error) {
    log.error({ error }, 'Scientific coaching context builder failed');
  }

  // Sort injections by priority
  const priorityOrder: Record<ContextPriority, number> = {
    critical: 0,
    high: 1,
    standard: 2,
    hint: 3,
  };
  result.injections.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Limit to top 3 injections to avoid overwhelming LLM
  result.injections = result.injections.slice(0, 3);

  log.debug(
    {
      userId,
      injections: result.injections.length,
      distortions: result.detectedDistortions.length,
      warnings: result.warnings.length,
    },
    'Scientific coaching context built'
  );

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function shouldOfferNudge(message: string, topic?: string, phase?: string): boolean {
  // Don't nudge in opening or if message is too short
  if (phase === 'opening' || message.length < 30) return false;

  // Look for behavior change signals
  const changeSignals = [
    'want to',
    'need to',
    'should',
    'trying to',
    'goal',
    'habit',
    'change',
    'start',
    'stop',
    'quit',
    'more',
    'less',
  ];

  return changeSignals.some((s) => message.toLowerCase().includes(s));
}

function inferGoalType(
  topic?: string,
  message?: string
): 'health' | 'productivity' | 'relationship' | 'financial' | 'growth' | 'habit' | null {
  const text = `${topic || ''} ${message || ''}`.toLowerCase();

  if (/health|exercise|sleep|eat|weight|fitness/.test(text)) return 'health';
  if (/work|productivity|focus|procrastin|task/.test(text)) return 'productivity';
  if (/relationship|partner|friend|family|dating/.test(text)) return 'relationship';
  if (/money|budget|save|spend|debt|financial/.test(text)) return 'financial';
  if (/habit|routine|daily|morning|evening/.test(text)) return 'habit';
  if (/grow|learn|improve|better|develop/.test(text)) return 'growth';

  return null;
}

function inferChangeStage(
  message: string
): 'considering' | 'planning' | 'acting' | 'maintaining' | null {
  const lower = message.toLowerCase();

  if (/thinking about|considering|might|maybe|wonder if/.test(lower)) return 'considering';
  if (/going to|plan to|will start|ready to|decided/.test(lower)) return 'planning';
  if (/started|trying|doing|working on|in the middle/.test(lower)) return 'acting';
  if (/been doing|for \d+ (days|weeks|months)|keeping up/.test(lower)) return 'maintaining';

  return null;
}

function inferSituationType(
  topic?: string,
  emotionalState?: string,
  message?: string
): {
  category: 'emotional' | 'relational' | 'behavioral' | 'cognitive';
  subcategory: string;
  description: string;
} | null {
  const text = `${topic || ''} ${emotionalState || ''} ${message || ''}`.toLowerCase();

  // Emotional situations
  if (/anxious|anxiety|worried|panic|nervous/.test(text)) {
    return { category: 'emotional', subcategory: 'anxiety', description: 'Feeling anxious' };
  }
  if (/sad|depress|down|hopeless|empty/.test(text)) {
    return { category: 'emotional', subcategory: 'sadness', description: 'Feeling sad or down' };
  }
  if (/angry|frustrat|irritat|furious|mad/.test(text)) {
    return { category: 'emotional', subcategory: 'anger', description: 'Feeling angry' };
  }

  // Relational situations
  if (/conflict|fight|argument|disagree/.test(text)) {
    return {
      category: 'relational',
      subcategory: 'conflict',
      description: 'Relationship conflict',
    };
  }

  // Behavioral situations
  if (/stuck|unmotivated|can't start|procrastin/.test(text)) {
    return { category: 'behavioral', subcategory: 'motivation', description: 'Feeling stuck' };
  }

  // Cognitive situations
  if (/decision|choose|decide|option/.test(text)) {
    return { category: 'cognitive', subcategory: 'decision', description: 'Making a decision' };
  }

  return null;
}

function getPersonaScientificFocus(personaId: string): string | null {
  const focuses: Record<string, string> = {
    ferni: '[Ferni uses CBT + growth mindset: Notice thoughts, challenge gently, celebrate effort]',
    maya: '[Maya uses somatic intelligence: Body-first approach, breathing, grounding, nervous system]',
    peter:
      '[Peter uses cognitive science: Evidence-based analysis, Socratic questioning, research]',
    alex: '[Alex uses relationship science: Gottman, attachment, communication patterns]',
    jordan:
      '[Jordan uses behavioral economics: Nudges, implementation intentions, friction design]',
    jack: '[Jack uses wisdom traditions: Values clarification, meaning-making, perspective]',
  };

  return focuses[personaId] || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const scientificCoaching = {
  build: buildScientificCoachingContext,
};

export default scientificCoaching;
