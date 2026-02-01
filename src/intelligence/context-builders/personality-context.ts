/**
 * Personality v2 Context Builder
 *
 * Integrates the v2 personality system with the context builder infrastructure.
 * This provides SUPERHUMAN personality intelligence to all personas.
 *
 * Features:
 * - Anticipation (predict emotions before expressed)
 * - Timing intelligence (know when to share vs. listen)
 * - Vulnerability detection and callbacks
 * - Pattern surfacing
 * - Growth celebration
 *
 * @module intelligence/context-builders/personality-context
 */

import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { createPersonalityService, type PersonalityService } from '../../personality/v2/index.js';
import { getFirestorePersonalityRepository } from '../../personality/infrastructure/firestore-personality-repository.js';
import { getVoiceAnalyzerAdapter } from '../../personality/infrastructure/adapters/voice-analyzer-adapter.js';
import { getEmotionDetectorAdapter } from '../../personality/infrastructure/adapters/emotion-detector-adapter.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { AnticipatedEmotion } from '../../personality/domain/model/value-objects/anticipated-emotion.js';
import type { VulnerabilityDeposit } from '../../personality/domain/model/vulnerability-deposit.js';
import type { GrowthMilestone } from '../../personality/domain/model/growth-milestone.js';
import type { EmotionalPattern } from '../../personality/domain/model/emotional-pattern.js';

const log = createLogger({ module: 'PersonalityV2Builder' });

// ============================================================================
// SERVICE SETUP
// ============================================================================

let personalityService: PersonalityService | null = null;

function getService(): PersonalityService {
  if (!personalityService) {
    personalityService = createPersonalityService({
      repository: getFirestorePersonalityRepository(),
      voiceAnalyzer: getVoiceAnalyzerAdapter(),
      emotionDetector: getEmotionDetectorAdapter(),
    });
  }
  return personalityService;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build personality context for LLM injection
 */
async function buildPersonalityV2Context(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const startTime = Date.now();

  try {
    // Extract from proper locations in the input
    const userId = input.services?.userId ?? input.userProfile?.id;
    const personaId = input.persona?.id ?? 'ferni';
    const currentMessage = input.userText ?? '';
    const turnCount = input.userData?.turnCount ?? 0;

    if (!userId) {
      log.debug('No userId available, skipping personality-context');
      return injections;
    }

    // Extract topics from current message
    const topics = extractTopics(currentMessage);

    // Convert voice emotion to voice features format (if available)
    // Maps from VoiceEmotionResult (context-builders/types) to VoiceFeatures (personality/domain)
    const voiceFeatures = input.voiceEmotion
      ? mapVoiceEmotionToFeatures(input.voiceEmotion)
      : undefined;

    // Build context
    const service = getService();
    const context = await service.buildContext({
      userId,
      personaId,
      currentMessage,
      topics,
      turnCount,
      voiceFeatures,
    });

    // Add the formatted personality context
    if (context.formattedContext && context.formattedContext.trim()) {
      injections.push(createHintInjection('personality-context', context.formattedContext));
    }

    // ============================================================================
    // STORE V2 SIGNALS FOR FRONTEND DISPATCH
    // These will be picked up by turn-handler.ts and dispatched via sendDataMessage
    // ============================================================================

    // Store anticipation data for frontend EQ system
    if (context.anticipatedEmotion) {
      storeAnticipationForDispatch(input, context.anticipatedEmotion);
    }

    // Store vulnerability data for frontend dispatch
    if (context.pendingVulnerabilities.length > 0) {
      storeVulnerabilitiesForDispatch(input, context.pendingVulnerabilities);
    }

    // Store surfaceable patterns for frontend dispatch
    if (context.surfaceablePatterns.length > 0) {
      storePatternsForDispatch(input, context.surfaceablePatterns);
    }

    // Store celebratable milestones for frontend dispatch
    if (context.celebratableMilestones.length > 0) {
      storeMilestonesForDispatch(input, context.celebratableMilestones);
    }

    // Record emotional moment from user message (fire-and-forget)
    if (currentMessage.length > 10) {
      // Don't record tiny messages
      service
        .recordMoment({
          userId,
          personaId,
          message: currentMessage,
          topics,
          voiceFeatures,
        })
        .catch((err) => {
          log.warn({ error: String(err), userId }, 'Failed to record emotional moment');
        });
    }

    const durationMs = Date.now() - startTime;

    // Production logging - INFO level for visibility
    log.info(
      {
        userId: userId.slice(0, 8) + '...', // Truncate for privacy
        personaId,
        turnCount,
        durationMs,
        injected: injections.length > 0,
        relationshipStage: context.relationshipStage,
        shouldHoldSpace: context.shouldHoldSpace,
        hasAnticipation: !!context.anticipatedEmotion,
        anticipatedEmotion: context.anticipatedEmotion?.emotion,
        vulnerabilityCount: context.pendingVulnerabilities.length,
        patternCount: context.surfaceablePatterns.length,
        milestoneCount: context.celebratableMilestones.length,
        topicsDetected: topics.length,
        hasVoiceFeatures: !!voiceFeatures,
        timingIntent: context.timing?.intent,
      },
      `🧠 Personality v2: ${context.relationshipStage} | ${context.timing?.intent ?? 'no-timing'} | ${durationMs}ms`
    );

    // Debug log for detailed context (only in development)
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PERSONALITY) {
      log.debug(
        {
          formattedContextPreview: context.formattedContext?.slice(0, 200) + '...',
          vulnerabilities: context.pendingVulnerabilities.map((v) => ({
            category: v.category,
            needsFollowUp: v.needsFollowUp,
          })),
          patterns: context.surfaceablePatterns.map((p) => ({
            type: p.patternType,
            description: p.description,
          })),
        },
        'Personality v2 context details'
      );
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error(
      {
        error: String(error),
        durationMs,
        userId: input.services?.userId?.slice(0, 8),
        stack: error instanceof Error ? error.stack : undefined,
      },
      '❌ Personality v2 context builder failed'
    );
    // Don't throw - personality enhancement is non-critical
  }

  return injections;
}

/**
 * Map voice emotion data from context builder format to personality v2 format
 *
 * VoiceEmotionResult (from speech pipeline):
 * - emotion, confidence, speechRate, pitch, stressLevel, arousal, valence
 * - May also have prosody sub-object with detailed features
 *
 * VoiceFeatures (personality v2 domain):
 * - pitchMean, pitchVariation, speakingRate, energyLevel, jitter, shimmer, voiceQuality, etc.
 */
function mapVoiceEmotionToFeatures(
  voiceEmotion: NonNullable<ContextBuilderInput['voiceEmotion']>
): {
  pitchMean?: number;
  pitchVariation?: number;
  speakingRate?: number;
  energyLevel?: number;
  jitter?: number;
  shimmer?: number;
  voiceQuality?: number;
  speechDuration?: number;
  pauseDuration?: number;
} {
  // Access prosody if available (from full VoiceEmotionResult)
  const prosody = (voiceEmotion as { prosody?: Record<string, number> }).prosody;

  return {
    // Map direct properties
    pitchMean: voiceEmotion.pitch ?? prosody?.pitchMean,
    pitchVariation: prosody?.pitchVariance,
    speakingRate: voiceEmotion.speechRate ?? prosody?.speechRate,

    // Map energy from arousal (0-1 arousal to -10 to 10 energy scale)
    energyLevel:
      voiceEmotion.arousal !== undefined ? voiceEmotion.arousal * 20 - 10 : prosody?.energyMean,

    // Voice quality features
    jitter: prosody?.jitter,
    shimmer: prosody?.shimmer,

    // Voice quality from confidence (0-1 scale)
    voiceQuality: voiceEmotion.confidence,

    // Timing features
    speechDuration: prosody?.utteranceDuration,
    pauseDuration: prosody?.pauseDuration,
  };
}

/**
 * Extract topics from message
 */
function extractTopics(message: string): string[] {
  const topicPatterns = [
    { pattern: /\b(work|job|office|boss|colleague|meeting|career)\b/i, topic: 'work' },
    {
      pattern: /\b(family|mom|dad|parent|sibling|brother|sister|kid|children)\b/i,
      topic: 'family',
    },
    {
      pattern: /\b(relationship|partner|boyfriend|girlfriend|spouse|husband|wife|dating)\b/i,
      topic: 'relationship',
    },
    { pattern: /\b(money|bills|debt|financial|afford|salary|pay)\b/i, topic: 'finances' },
    { pattern: /\b(health|sick|doctor|hospital|diagnosis|pain|tired)\b/i, topic: 'health' },
    { pattern: /\b(friend|friendship|social|lonely)\b/i, topic: 'social' },
    { pattern: /\b(anxiety|anxious|stressed|stress|overwhelmed|panic)\b/i, topic: 'anxiety' },
    { pattern: /\b(sad|depressed|depression|down|unhappy)\b/i, topic: 'mood' },
    { pattern: /\b(future|tomorrow|next year|plans|goals)\b/i, topic: 'future' },
    { pattern: /\b(past|history|remember|used to|childhood)\b/i, topic: 'past' },
    { pattern: /\b(sleep|insomnia|tired|exhausted)\b/i, topic: 'sleep' },
    { pattern: /\b(exercise|workout|gym|fitness)\b/i, topic: 'fitness' },
    { pattern: /\b(habit|routine|morning|evening)\b/i, topic: 'habits' },
  ];

  return topicPatterns.filter(({ pattern }) => pattern.test(message)).map(({ topic }) => topic);
}

// ============================================================================
// SIGNAL STORAGE FOR FRONTEND DISPATCH
// Store v2 personality signals in userData for later dispatch by turn-handler
// ============================================================================

/**
 * Extended userData type for personality v2 signals
 * These fields are picked up by turn-handler.ts for frontend dispatch
 */
export interface PersonalityV2Signals {
  /** Anticipated emotion for avatar micro-expressions */
  anticipatedEmotion?: {
    emotion: string;
    confidence: number;
    signals: string[];
    shouldPrepareEmpathy: boolean;
  };
  /** Pending vulnerabilities for empathetic response */
  pendingVulnerabilities?: Array<{
    level: string;
    category: string;
    isFirstTime: boolean;
    suggestedAcknowledgment?: string;
  }>;
  /** Patterns ready to surface */
  surfaceablePatterns?: Array<{
    patternType: string;
    description: string;
    confidence: number;
    insightToShare?: string;
  }>;
  /** Growth milestones ready to celebrate */
  celebratableMilestones?: Array<{
    area: string;
    significance: string;
    description: string;
    celebrationMessage?: string;
  }>;
}

/**
 * Store anticipation data for dispatch by turn-handler
 */
function storeAnticipationForDispatch(
  input: ContextBuilderInput,
  anticipated: AnticipatedEmotion
): void {
  const userData = input.userData as { personalityV2Signals?: PersonalityV2Signals };
  if (!userData.personalityV2Signals) {
    userData.personalityV2Signals = {};
  }
  userData.personalityV2Signals.anticipatedEmotion = {
    emotion: anticipated.emotion,
    confidence: anticipated.confidenceScore, // Use numeric confidenceScore, not string confidence
    signals: anticipated.signals,
    shouldPrepareEmpathy: anticipated.shouldPrepareEmpathy,
  };
}

/**
 * Store vulnerabilities for dispatch by turn-handler
 */
function storeVulnerabilitiesForDispatch(
  input: ContextBuilderInput,
  vulnerabilities: VulnerabilityDeposit[]
): void {
  const userData = input.userData as { personalityV2Signals?: PersonalityV2Signals };
  if (!userData.personalityV2Signals) {
    userData.personalityV2Signals = {};
  }
  userData.personalityV2Signals.pendingVulnerabilities = vulnerabilities.map((v) => ({
    level: v.level,
    category: v.category,
    isFirstTime: v.isFirstTime,
    suggestedAcknowledgment: v.acknowledgment ?? undefined,
  }));
}

/**
 * Store patterns for dispatch by turn-handler
 */
function storePatternsForDispatch(
  input: ContextBuilderInput,
  patterns: EmotionalPattern[]
): void {
  const userData = input.userData as { personalityV2Signals?: PersonalityV2Signals };
  if (!userData.personalityV2Signals) {
    userData.personalityV2Signals = {};
  }
  userData.personalityV2Signals.surfaceablePatterns = patterns.map((p) => ({
    patternType: p.patternType,
    description: p.description,
    confidence: p.confidence,
    insightToShare: p.insightToShare,
  }));
}

/**
 * Store milestones for dispatch by turn-handler
 */
function storeMilestonesForDispatch(
  input: ContextBuilderInput,
  milestones: GrowthMilestone[]
): void {
  const userData = input.userData as { personalityV2Signals?: PersonalityV2Signals };
  if (!userData.personalityV2Signals) {
    userData.personalityV2Signals = {};
  }
  userData.personalityV2Signals.celebratableMilestones = milestones.map((m) => ({
    area: m.area,
    significance: m.significance,
    description: m.label ?? m.baselineEvidence?.observation ?? 'Growth milestone',
    celebrationMessage: m.celebrationMessage,
  }));
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Register the personality v2 context builder
 *
 * Call this during application startup to enable v2 personality intelligence.
 */
export function registerPersonalityV2Builder(): void {
  registerContextBuilder({
    name: 'personality-context',
    description:
      'SUPERHUMAN personality intelligence - anticipation, timing, vulnerability, patterns, growth',
    priority: 80, // High priority
    build: buildPersonalityV2Context,
  });

  log.info('Registered personality-context builder');
}

// ============================================================================
// AUTO-REGISTER ON IMPORT
// ============================================================================

// Register when module is imported (like other context builders)
registerPersonalityV2Builder();

// buildPersonalityV2Context is the main export (used by context builder registry)
// PersonalityV2Signals is exported inline at its definition
