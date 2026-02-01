/**
 * Better Than Human Integration
 *
 * Integrates ALL superhuman services with the voice pipeline:
 *
 * ORIGINAL 10 (Core Superhuman Capabilities):
 * 1. Commitment Keeper - Tracks promises, intentions, decisions
 * 2. Capacity Guardian - Monitors energy, prevents burnout
 * 3. Values Alignment - Detects when actions contradict values
 * 4. Dream Keeper - Guards long-term aspirations
 * 5. Life Narrative - Builds coherent story of user's journey
 * 6. Relationship Network - Maps all relationships with sentiment
 * 7. Seasonal Awareness - Connects to seasonal patterns
 *
 * ENHANCED 9 (December 2024):
 * 8. Silence Interpreter - Classifies silence types, learns thresholds
 * 9. Contradiction Comfort - Validates mixed emotions
 * 10. Perfect Timing Intelligence - Learns optimal timing for topics
 * 11. Pattern Mirror - Tracks energizing/draining topics
 * 12. First-Time Vulnerability - Detects first-time shares
 * 13. Linguistic Mirroring - Adapts to user's language patterns
 * 14. Ambient Context Detection - Classifies user's environment
 * 15. Protective Memory - Tracks premature advice, boundary softening
 *
 * @module @ferni/agents/integrations/better-than-human
 */

import { createLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';

// BTH Validation Telemetry
import {
  instrumentCommitmentDetection,
  instrumentCrisisDetection,
  instrumentSubtextDetection,
  instrumentPatternSurfacing,
  instrumentVoiceBiomarkers,
  instrumentEmotionalVocabulary,
  trackCapabilityOutcome,
} from '../../services/better-than-human-validation/instrumentation.js';

// Silence Interpreter
import {
  analyzeSilence,
  recordSilenceOutcome,
  buildSilenceContext,
  type SilenceAnalysis,
  type VoiceMarkers,
} from '../../services/superhuman/silence-interpreter.js';

// Contradiction Comfort
import {
  detectContradiction,
  recordContradiction,
  buildContradictionAwarenessContext,
  type ContradictionDetection,
} from '../../services/superhuman/contradiction-comfort.js';

// Perfect Timing
import {
  detectReceptivity,
  recordTimingLearning,
  isGoodTimeFor,
  buildTimingContext,
  type ReceptivityScore,
  type GreetingTone,
} from '../../services/superhuman/perfect-timing.js';

// Pattern Mirror
import {
  recordTopicEnergy,
  getPatternToSurface,
  buildPatternMirrorContext,
} from '../../services/superhuman/pattern-mirror.js';

// First-Time Vulnerability
import {
  detectFirstTimeVulnerability,
  recordVulnerabilityShare,
  buildVulnerabilityAwarenessContext,
  type FirstTimeVulnerabilityResult,
} from '../../services/trust-systems/first-time-vulnerability.js';

// Linguistic Mirroring
import {
  recordLinguisticPatterns,
  buildLinguisticContext,
} from '../../services/trust-systems/linguistic-mirroring.js';

// Ambient Context
import {
  analyzeAmbientAudio,
  buildAmbientContext,
  type AmbientContext,
} from '../../services/trust-systems/ambient-context.js';

// Resonance Check (Voice-Enabled Feedback)
import { generateResonanceCheck } from '../../speech/llm-backchannel.js';
import {
  trackCapabilityEffectiveness,
  type SuperhumanCapability,
} from '../../conversation/superhuman/analytics.js';

// ============================================================================
// V2 "BETTER THAN HUMAN" IMPORTS (Dec 2025)
// ============================================================================

// Voice Biomarkers
import {
  analyzeVoiceBiomarkers,
  storeBiomarkerReading,
  type VoiceBiomarkers,
  type VoiceAnalysisInput as BiomarkerInput,
} from '../../services/superhuman/voice-biomarkers.js';

// Mood Calendar
import {
  recordMoodEntry,
  getMoodCalendarSummary,
} from '../../services/superhuman/mood-calendar.js';

// Social Battery
import {
  recordSocialEvent,
  getSocialBatteryState,
  type SocialEventType,
} from '../../services/superhuman/social-battery.js';

// Conflict Resolution
import {
  recordConflict as recordConflictHistory,
  getConflictRecommendations,
} from '../../services/superhuman/conflict-resolution-memory.js';

// Protective Silence
import {
  recordBoundary,
  inferBoundaryFromReaction,
} from '../../services/superhuman/protective-silence.js';

// Calendar Prep Coaching
import {
  getPrepRecommendations,
  type CalendarEvent,
} from '../../services/superhuman/calendar-prep-coaching.js';

// Recovery Tracking
import {
  startRecoveryTracking,
  getActiveRecoveryEvents,
  type RecoveryEventType,
} from '../../services/superhuman/recovery-tracking.js';

// Inside Joke Memory
import { detectPotentialMoment } from '../../services/superhuman/inside-joke-memory.js';

// ============================================================================
// ORIGINAL 10 - Core Superhuman Capabilities (Jan 2024)
// ============================================================================

// 1. Commitment Keeper - Tracks promises, intentions, decisions
import {
  detectCommitment,
  saveCommitment,
  loadUserCommitments,
  generateFollowUp,
  getFollowUpsForUser,
  buildCommitmentContext,
  type Commitment,
  type CommitmentDetectionResult,
  type CommitmentFollowUp,
} from '../../services/superhuman/commitment-keeper.js';

// 2. Capacity Guardian - Monitors energy, prevents burnout
import {
  detectEnergyLevel,
  detectOvercommitment,
  recordEnergyReading,
  assessBurnoutRisk,
  buildCapacityContext,
  type EnergyLevel,
  type BurnoutAssessment,
} from '../../services/superhuman/capacity-guardian.js';

// 3. Values Alignment - Detects when actions contradict values
import {
  detectValue,
  detectConflict as detectValueConflict,
  recordValueMention,
  recordConflict as recordValueConflictStore,
  buildValuesContext,
  type UserValue,
  type ValueConflict,
} from '../../services/superhuman/values-alignment.js';

// 4. Dream Keeper - Guards long-term aspirations
import {
  detectDream,
  recordDreamMention,
  findDormantDreams,
  buildDreamContext,
  type Dream,
  type DreamReminder,
} from '../../services/superhuman/dream-keeper.js';

// 5. Life Narrative - Builds coherent story of user's journey
import {
  detectChapterMoment,
  recordIdentityShift,
  buildNarrativeContextString,
  type LifeChapter,
} from '../../services/superhuman/life-narrative.js';

// 6. Relationship Network - Maps all relationships with sentiment
import {
  extractPerson,
  recordMention as recordPersonMention,
  findConnectionOpportunities,
  buildNetworkContext,
  type RelationshipPerson,
} from '../../services/superhuman/relationship-network.js';

// 7. Seasonal Awareness - Connects to seasonal patterns
import {
  getCurrentSeason,
  detectSeasonalPattern,
  recordSeasonalObservation,
  findUpcomingDates,
  buildSeasonalContext,
  type Season,
  type PersonalDate,
} from '../../services/superhuman/seasonal-awareness.js';

const log = createLogger({ module: 'BetterThanHumanIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceAnalysisInput {
  energy: number;
  stressLevel: number;
  arousal?: number;
  valence?: number;
  speechRate?: number;
  pitchVariance?: number;
  pauseDuration?: number;
  energyMean?: number;
  breathiness?: number;
  voiceQuality?: string;
  greetingTone?: GreetingTone;
}

export interface TranscriptInput {
  transcript: string;
  isFinal: boolean;
  emotion?: string;
  emotionIntensity?: number;
  topic?: string;
  recentEmotions?: string[];
}

export interface SilenceInput {
  durationMs: number;
  precedingTopic?: string;
  precedingEmotion?: string;
  precedingUserMessage?: string;
  voiceMarkersBefore: VoiceMarkers;
  conversationPhase: 'opening' | 'middle' | 'deep' | 'closing';
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  personaId: string;
  turnCount: number;
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Load all Better Than Human profiles at session start
 * Called from session-init-handler.ts
 *
 * Loads both Original 10 and Enhanced 9 superhuman capabilities in parallel.
 */
export async function loadBetterThanHumanProfiles(userId: string): Promise<void> {
  const startTime = Date.now();

  try {
    // Load all profiles in parallel - these return context strings
    const results = await Promise.allSettled([
      // === ORIGINAL 10 (Core Capabilities) ===
      buildCommitmentContext(userId), // 1. Commitment Keeper
      buildCapacityContext(userId), // 2. Capacity Guardian
      buildValuesContext(userId), // 3. Values Alignment
      buildDreamContext(userId), // 4. Dream Keeper
      buildNarrativeContextString(userId), // 5. Life Narrative
      buildNetworkContext(userId), // 6. Relationship Network
      buildSeasonalContext(userId), // 7. Seasonal Awareness

      // === ENHANCED 9 (December 2024) ===
      buildSilenceContext(userId), // 8. Silence Interpreter
      buildContradictionAwarenessContext(userId), // 9. Contradiction Comfort
      Promise.resolve(buildTimingContext(userId)), // 10. Perfect Timing
      Promise.resolve(buildPatternMirrorContext(userId)), // 11. Pattern Mirror
      Promise.resolve(buildVulnerabilityAwarenessContext(userId)), // 12. First-Time Vulnerability
      Promise.resolve(buildLinguisticContext(userId)), // 13. Linguistic Mirroring
    ]);

    const loadedCount = results.filter((r) => r.status === 'fulfilled').length;
    const duration = Date.now() - startTime;

    diag.session('🌟 Better Than Human profiles loaded', {
      userId,
      durationMs: duration,
      profilesLoaded: loadedCount,
      original10: results.slice(0, 7).filter((r) => r.status === 'fulfilled').length,
      enhanced9: results.slice(7).filter((r) => r.status === 'fulfilled').length,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to load Better Than Human profiles');
  }
}

// ============================================================================
// SILENCE INTEGRATION
// ============================================================================

/**
 * Analyze silence with the Silence Interpreter
 * Called from session-state-handler.ts when silence is detected
 */
export function processSilenceWithInterpreter(
  input: SilenceInput,
  _ctx: SessionContext
): SilenceAnalysis | null {
  if (input.durationMs < 1000) {
    return null;
  }

  try {
    const analysis = analyzeSilence(input.durationMs, {
      precedingTopic: input.precedingTopic,
      precedingEmotion: input.precedingEmotion,
      precedingUserMessage: input.precedingUserMessage,
      voiceMarkersBefore: input.voiceMarkersBefore,
      conversationPhase: input.conversationPhase,
    });

    diag.state('🤫 Silence Interpreter analysis', {
      type: analysis.type,
      confidence: analysis.confidence.toFixed(2),
      recommendedResponse: analysis.recommendedResponse,
    });

    return analysis;
  } catch (error) {
    log.debug({ error }, 'Silence Interpreter analysis failed');
    return null;
  }
}

/**
 * Record the outcome of a silence after user responds
 * Called when user speaks after a meaningful silence
 */
export function recordSilenceOutcomeFromResponse(
  userId: string,
  silenceAnalysis: SilenceAnalysis,
  ferniResponse: string,
  userContinued: boolean
): void {
  recordSilenceOutcome(userId, silenceAnalysis, {
    ferniResponse,
    userContinued,
  }).catch((e) => log.debug({ error: e }, 'Failed to record silence outcome'));
}

// ============================================================================
// VOICE PROSODY INTEGRATION
// ============================================================================

/**
 * Detect receptivity at conversation start
 * Called from audio-processor.ts when voice emotion is analyzed
 */
export function detectVoiceReceptivity(input: VoiceAnalysisInput): ReceptivityScore {
  return detectReceptivity({
    energy: input.energy,
    stressLevel: input.stressLevel,
    speechRate: input.speechRate,
    greetingTone: input.greetingTone || 'neutral',
  });
}

/**
 * Process voice prosody for Perfect Timing and Pattern Mirror
 * Called from audio-processor.ts when voice emotion is analyzed
 */
export function processVoiceProsody(
  input: VoiceAnalysisInput,
  ctx: SessionContext,
  currentTopic?: string
): void {
  if (!ctx.userId) return;

  try {
    // Record topic energy for Pattern Mirror
    if (currentTopic) {
      const baselineEnergy = 0.5; // Could be fetched from user profile

      recordTopicEnergy(ctx.userId, {
        topic: currentTopic,
        voiceEnergy: input.energy,
        baselineEnergy,
        voiceMarkers:
          input.pitchVariance !== undefined
            ? {
                pitch: input.pitchVariance,
                speechRate: input.speechRate || 1.0,
              }
            : undefined,
        sentiment:
          input.valence !== undefined
            ? input.valence > 0.3
              ? 'positive'
              : input.valence < -0.3
                ? 'negative'
                : 'neutral'
            : undefined,
      });
    }
  } catch (error) {
    log.debug({ error }, 'Voice prosody integration failed');
  }
}

/**
 * Record timing learning after conversation
 */
export async function recordConversationTiming(
  userId: string,
  data: {
    receptivityScore: number;
    conversationQuality: number;
    topicsSurfaced: string[];
    topicsWellReceived: string[];
    voiceEnergy: number;
    greetingTone: GreetingTone;
  }
): Promise<void> {
  try {
    await recordTimingLearning(userId, {
      timestamp: new Date(),
      ...data,
    });
  } catch (error) {
    log.debug({ error }, 'Timing recording failed');
  }
}

/**
 * Check if now is a good time for a topic type
 * conversationType: 'deep' | 'gentle' | 'challenging' | 'celebration'
 */
export function checkTopicTiming(
  userId: string,
  conversationType: 'deep' | 'gentle' | 'challenging' | 'celebration'
): { isGoodTime: boolean; confidence: number; reason: string } {
  try {
    const result = isGoodTimeFor(userId, conversationType);
    return {
      isGoodTime: result.isGood,
      confidence: result.confidence,
      reason: result.reason,
    };
  } catch (error) {
    log.debug({ error }, 'Timing check failed');
    return { isGoodTime: true, confidence: 0.5, reason: 'Unable to assess' };
  }
}

// ============================================================================
// TRANSCRIPT INTEGRATION
// ============================================================================

/**
 * Process transcript for all relevant Better Than Human services
 * Called from transcript-handler.ts on final transcripts
 */
export async function processTranscriptForBetterThanHuman(
  input: TranscriptInput,
  ctx: SessionContext
): Promise<{
  vulnerability?: { isFirstTime: boolean; category: string; level: number };
  contradiction?: { detected: boolean; emotions: string[] };
  patterns?: { insights: string[] };
}> {
  if (!ctx.userId || !input.isFinal || !input.transcript) {
    return {};
  }

  const result: {
    vulnerability?: { isFirstTime: boolean; category: string; level: number };
    contradiction?: { detected: boolean; emotions: string[] };
    patterns?: { insights: string[] };
  } = {};

  try {
    // First-Time Vulnerability Detection
    const vulnerabilityResult = detectFirstTimeVulnerability(ctx.userId, input.transcript);

    if (vulnerabilityResult?.detected) {
      result.vulnerability = {
        isFirstTime: true,
        category: vulnerabilityResult.topic || 'personal',
        level: vulnerabilityResult.vulnerabilityLevel,
      };

      // Record the share for tracking
      recordVulnerabilityShare(
        ctx.userId,
        vulnerabilityResult,
        vulnerabilityResult.suggestedAcknowledgment
      );

      // BTH Validation: Track crisis/vulnerability detection
      // High vulnerability levels map to crisis detection capability
      if (vulnerabilityResult.vulnerabilityLevel >= 0.7) {
        instrumentCrisisDetection(ctx.userId, ctx.sessionId, input.transcript, {
          detected: true,
          severity: vulnerabilityResult.vulnerabilityLevel >= 0.9 ? 'high' : 'medium',
          signals: [vulnerabilityResult.topic || 'vulnerability_share'],
          confidence: vulnerabilityResult.vulnerabilityLevel,
        });
      }

      diag.state('💎 First-time vulnerability detected', {
        category: vulnerabilityResult.topic,
        level: vulnerabilityResult.vulnerabilityLevel,
      });
    }

    // Contradiction Comfort Detection
    const recentEmotions = input.recentEmotions || [];
    if (input.emotion) {
      recentEmotions.push(input.emotion);
    }

    const contradictionResult: ContradictionDetection | null = detectContradiction(
      input.transcript,
      recentEmotions,
      input.topic
    );

    if (contradictionResult?.detected) {
      result.contradiction = {
        detected: true,
        emotions: [...contradictionResult.emotions],
      };

      // BTH Validation: Track subtext detection (emotional contradictions)
      instrumentSubtextDetection(ctx.userId, ctx.sessionId, input.transcript, {
        detected: true,
        subtext: `Feeling both ${contradictionResult.emotions.join(' and ')}`,
        emotionalUndercurrent: 'emotional_contradiction',
        confidence: 0.8,
      });

      // Record the contradiction for learning (use validation phrase from result)
      recordContradiction(
        ctx.userId,
        contradictionResult,
        contradictionResult.validationPhrase || 'It makes sense to feel both ways.'
      ).catch((e) => log.debug({ error: e }, 'Failed to record contradiction'));

      diag.state('🎭 Emotional contradiction detected', {
        emotions: contradictionResult.emotions.join(' + '),
        topic: contradictionResult.topic,
      });
    }

    // Pattern Mirror - get any patterns to surface
    const patternInsight = getPatternToSurface(ctx.userId);
    if (patternInsight) {
      result.patterns = { insights: [patternInsight.insight] };

      // BTH Validation: Track pattern surfacing
      instrumentPatternSurfacing(ctx.userId, ctx.sessionId, {
        patternType: patternInsight.type,
        description: patternInsight.insight,
        confidence: 0.75,
        surfacedToUser: true,
      });

      diag.state('🪞 Pattern insight available', {
        type: patternInsight.type,
        insight: patternInsight.insight.slice(0, 50),
      });
    }

    // Linguistic Mirroring - learn patterns from transcript
    recordLinguisticPatterns(ctx.userId, input.transcript, {
      topic: input.topic,
      emotion: input.emotion,
    });
  } catch (error) {
    log.debug({ error }, 'Transcript Better Than Human processing failed');
  }

  return result;
}

// ============================================================================
// AMBIENT CONTEXT INTEGRATION
// ============================================================================

/**
 * Process ambient signals from audio analysis
 * Called when ambient sounds are detected
 */
export function processAmbientSignals(signals: {
  backgroundNoiseLevel: number;
  speechToNoiseRatio: number;
  frequencySpread: number;
  rhythmicPatterns?: boolean;
  multipleVoices?: boolean;
  outdoorIndicators?: boolean;
}): AmbientContext {
  try {
    return analyzeAmbientAudio(signals);
  } catch (error) {
    log.debug({ error }, 'Ambient context detection failed');
    return {
      environment: 'quiet',
      confidence: 0.5,
      signals: [],
      privacyConcern: false,
      distractionLevel: 0,
      suggestions: [],
      shouldOfferReschedule: false,
    };
  }
}

// ============================================================================
// COMBINED CONTEXT BUILDING
// ============================================================================

/**
 * Build combined Better Than Human context for LLM injection
 * Called from context builders during turn processing
 *
 * Includes both Original 10 and Enhanced 9 capabilities.
 */
export async function buildBetterThanHumanContext(userId: string): Promise<string> {
  if (!userId) return '';

  try {
    const results = await Promise.allSettled([
      // === ORIGINAL 10 (Core Capabilities) ===
      buildCommitmentContext(userId), // 1. Commitment Keeper
      buildCapacityContext(userId), // 2. Capacity Guardian
      buildValuesContext(userId), // 3. Values Alignment
      buildDreamContext(userId), // 4. Dream Keeper
      buildNarrativeContextString(userId), // 5. Life Narrative
      buildNetworkContext(userId), // 6. Relationship Network
      buildSeasonalContext(userId), // 7. Seasonal Awareness

      // === ENHANCED 9 (December 2024) ===
      buildSilenceContext(userId), // 8. Silence Interpreter
      buildContradictionAwarenessContext(userId), // 9. Contradiction Comfort
      Promise.resolve(buildTimingContext(userId)), // 10. Perfect Timing
      Promise.resolve(buildPatternMirrorContext(userId)), // 11. Pattern Mirror
      Promise.resolve(buildVulnerabilityAwarenessContext(userId)), // 12. First-Time Vulnerability
      Promise.resolve(buildLinguisticContext(userId)), // 13. Linguistic Mirroring
    ]);

    const contexts = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((c) => c.length > 0);

    const combined = contexts.join('\n\n');

    if (combined.length > 0) {
      return `\n\n### Better Than Human Intelligence\n${combined}`;
    }

    return '';
  } catch (error) {
    log.debug({ error }, 'Failed to build Better Than Human context');
    return '';
  }
}

// ============================================================================
// V2 "BETTER THAN HUMAN" INTEGRATIONS (Dec 2025)
// These provide simplified wrappers for the V2 superhuman services.
// Direct access to services is also available via imports from services/superhuman
// ============================================================================

/**
 * Process voice for biomarkers (wellness detection)
 * Called from audio-processor.ts with voice analysis data
 */
export async function processVoiceBiomarkers(
  userId: string,
  sessionId: string,
  input: BiomarkerInput
): Promise<VoiceBiomarkers | null> {
  if (!userId || !input) return null;

  try {
    const biomarkers = analyzeVoiceBiomarkers(input);

    // Store reading for trend analysis
    await storeBiomarkerReading(userId, sessionId, biomarkers, input);

    // BTH Validation: Track voice biomarker analysis
    // Map VoiceBiomarkers to the BTH instrumentation shape
    const concernLevel = Math.max(biomarkers.fatigueLevel, biomarkers.illnessRisk);
    if (concernLevel > 0.4) {
      instrumentVoiceBiomarkers(userId, sessionId, {
        strain: biomarkers.fatigueLevel,
        speechRate: input.speechRate,
        pauseFrequency: biomarkers.fatigueLevel > 0.7 ? 0.8 : 0.3,
        overallConcern: concernLevel,
      });
    }

    // Check if stress is rising
    if (biomarkers.stressTrajectory === 'rising' || biomarkers.fatigueLevel > 0.7) {
      diag.state('🩺 Voice biomarkers indicate concern', {
        stressTrajectory: biomarkers.stressTrajectory,
        fatigueLevel: biomarkers.fatigueLevel,
      });
    }

    return biomarkers;
  } catch (error) {
    log.debug({ error }, 'Voice biomarker processing failed');
    return null;
  }
}

/**
 * Record mood from conversation
 * Called when mood signals are detected in transcript or voice
 */
export async function recordConversationMood(
  userId: string,
  mood:
    | 'joyful'
    | 'content'
    | 'calm'
    | 'neutral'
    | 'anxious'
    | 'sad'
    | 'frustrated'
    | 'overwhelmed'
    | 'exhausted'
    | 'hopeful',
  intensity: number,
  context?: string,
  sessionId?: string
): Promise<void> {
  try {
    await recordMoodEntry(userId, mood, intensity, context);

    // BTH Validation: Track emotional vocabulary usage
    if (sessionId) {
      // Track when user expresses nuanced emotions
      const suggestedVocabulary = intensity > 0.7 ? ['nuanced_emotion', mood] : [mood];
      instrumentEmotionalVocabulary(userId, sessionId, context || mood, suggestedVocabulary);
    }

    diag.state('😊 Mood recorded', { mood, intensity });
  } catch (error) {
    log.debug({ error }, 'Mood recording failed');
  }
}

/**
 * Get mood prediction for user
 */
export async function getMoodPrediction(
  userId: string
): Promise<{ predictedMood?: string; confidence?: number } | null> {
  try {
    const summary = await getMoodCalendarSummary(userId);
    // Check predictions array instead of predictedMood property
    if (summary?.predictions && summary.predictions.length > 0) {
      const firstPrediction = summary.predictions[0];
      return {
        predictedMood: firstPrediction.predictedMood,
        confidence: firstPrediction.confidence,
      };
    }
    return null;
  } catch (error) {
    log.debug({ error }, 'Mood prediction failed');
    return null;
  }
}

/**
 * Record social interaction for battery tracking
 */
export async function recordSocialInteraction(
  userId: string,
  eventType: SocialEventType,
  durationMinutes: number,
  context?: string
): Promise<void> {
  try {
    await recordSocialEvent(userId, eventType, durationMinutes, context);
    diag.state('🔋 Social event recorded', { eventType, duration: durationMinutes });
  } catch (error) {
    log.debug({ error }, 'Social event recording failed');
  }
}

/**
 * Get social battery status
 */
export async function getSocialBatteryStatus(
  userId: string
): Promise<{ level: number; fullRechargeHours?: number } | null> {
  try {
    const state = await getSocialBatteryState(userId);
    return {
      level: state.currentLevel,
      fullRechargeHours: state.fullRechargeHours,
    };
  } catch (error) {
    log.debug({ error }, 'Social battery status failed');
    return null;
  }
}

/**
 * Record conflict for resolution memory
 */
export async function recordConflictEvent(
  userId: string,
  withPerson: string,
  relationship: string,
  conflictType: string,
  triggers: string[]
): Promise<void> {
  try {
    await recordConflictHistory(userId, {
      withPerson,
      relationship,
      conflictType: conflictType as
        | 'disagreement'
        | 'miscommunication'
        | 'boundary_violation'
        | 'unmet_expectations'
        | 'values_clash'
        | 'recurring_issue'
        | 'external_stress'
        | 'emotional_flooding',
      triggers,
      approachesTried: [],
      effectiveApproaches: [],
      ineffectiveApproaches: [],
      outcome: 'ongoing',
      cooldownNeeded: 0,
    });
    diag.state('⚔️ Conflict recorded', { withPerson, type: conflictType });
  } catch (error) {
    log.debug({ error }, 'Conflict recording failed');
  }
}

/**
 * Get conflict resolution recommendations
 */
export async function getConflictResolution(
  userId: string,
  withPerson: string
): Promise<{ approaches: string[]; warnings: string[] } | null> {
  try {
    const recommendations = await getConflictRecommendations(userId, withPerson);
    if (recommendations) {
      return {
        approaches: recommendations.effective,
        warnings: recommendations.avoid,
      };
    }
    return null;
  } catch (error) {
    log.debug({ error }, 'Conflict recommendations failed');
    return null;
  }
}

/**
 * Record boundary for protective silence
 */
export async function recordProtectiveBoundary(
  userId: string,
  topic: string,
  severity: 'never' | 'only_if_they_bring_up' | 'gentle_only' | 'time_sensitive',
  category: string,
  reason?: string
): Promise<void> {
  try {
    await recordBoundary(userId, {
      topic,
      severity,
      category: category as
        | 'loss'
        | 'trauma'
        | 'health'
        | 'family'
        | 'relationship'
        | 'work'
        | 'financial'
        | 'identity'
        | 'comparison'
        | 'achievement'
        | 'other',
      reason,
      triggerKeywords: [],
      source: 'user_stated',
    });
    diag.state('🛡️ Protective boundary recorded', { topic, severity });
  } catch (error) {
    log.debug({ error }, 'Boundary recording failed');
  }
}

/**
 * Infer boundary from user reaction (withdrawal, deflection)
 */
export async function inferBoundaryFromUserReaction(
  userId: string,
  topic: string,
  reaction: 'deflected' | 'went_silent' | 'changed_subject' | 'showed_distress'
): Promise<void> {
  try {
    await inferBoundaryFromReaction(userId, topic, reaction);
    diag.state('🤫 Boundary inferred from reaction', { topic, reaction });
  } catch (error) {
    log.debug({ error }, 'Boundary inference failed');
  }
}

/**
 * Get prep coaching for upcoming calendar event
 */
export async function getEventPrepCoaching(
  userId: string,
  event: CalendarEvent
): Promise<{ recommendations: string[] } | null> {
  try {
    const prep = await getPrepRecommendations(userId, event);
    if (prep) {
      return {
        recommendations: prep.suggestions,
      };
    }
    return null;
  } catch (error) {
    log.debug({ error }, 'Calendar prep coaching failed');
    return null;
  }
}

/**
 * Start recovery tracking for an event
 */
export async function startEventRecoveryTracking(
  userId: string,
  eventType: RecoveryEventType,
  intensity: number,
  description?: string
): Promise<void> {
  try {
    await startRecoveryTracking(userId, eventType, intensity, description);
    diag.state('🩹 Recovery tracking started', { eventType, intensity });
  } catch (error) {
    log.debug({ error }, 'Recovery tracking failed');
  }
}

/**
 * Get active recovery events for user
 */
export async function getActiveRecoveries(
  userId: string
): Promise<Array<{ type: string; daysSince: number }>> {
  try {
    const events = await getActiveRecoveryEvents(userId);
    return events.map((e) => ({
      type: e.eventType,
      daysSince: Math.floor((Date.now() - e.eventTimestamp) / (1000 * 60 * 60 * 24)),
    }));
  } catch (error) {
    log.debug({ error }, 'Active recoveries fetch failed');
    return [];
  }
}

/**
 * Detect potential shared moment for inside joke memory
 */
export function detectSharedMoment(
  transcript: string,
  speaker: 'user' | 'ferni' = 'user'
): { detected: boolean; type?: string; essence?: string } {
  try {
    const moment = detectPotentialMoment(transcript, speaker);
    if (moment && moment.isPotential) {
      return {
        detected: true,
        type: moment.type,
        essence: moment.essence,
      };
    }
    return { detected: false };
  } catch (error) {
    log.debug({ error }, 'Shared moment detection failed');
    return { detected: false };
  }
}

// ============================================================================
// ORIGINAL 10 - Turn Processing Integrations
// ============================================================================

/**
 * Process transcript for commitment detection
 * Detects when user makes promises, intentions, goals, decisions
 */
export async function processCommitmentDetection(
  userId: string,
  transcript: string,
  topic?: string,
  sessionId?: string
): Promise<CommitmentDetectionResult | null> {
  if (!userId || !transcript) return null;

  try {
    // detectCommitment requires userId as second argument
    const result = detectCommitment(transcript, userId, { topic });

    if (result.detected && result.commitment) {
      // Save the commitment - add required fields that detectCommitment doesn't set
      const now = Date.now();
      const fullCommitment: Omit<Commitment, 'id'> = {
        ...result.commitment,
        createdAt: now,
        lastMentioned: now,
        followUpAfter: now + 24 * 60 * 60 * 1000, // Default: check in after 24 hours
        status: 'active',
        followUpCount: 0,
      };
      await saveCommitment(fullCommitment);

      // BTH Validation: Track commitment detection
      if (sessionId) {
        instrumentCommitmentDetection(userId, sessionId, transcript, result);
      }

      diag.state('📝 Commitment detected', {
        type: result.commitment.type,
        summary: result.commitment.summary?.slice(0, 50),
        confidence: result.confidence,
      });
    }

    return result;
  } catch (error) {
    log.debug({ error }, 'Commitment detection failed');
    return null;
  }
}

/**
 * Get follow-ups that should be surfaced this session
 */
export async function getCommitmentFollowUps(userId: string): Promise<CommitmentFollowUp[]> {
  try {
    return await getFollowUpsForUser(userId);
  } catch (error) {
    log.debug({ error }, 'Getting commitment follow-ups failed');
    return [];
  }
}

/**
 * Process voice/transcript for energy level detection
 * Monitors burnout risk and capacity
 */
export async function processEnergyDetection(
  userId: string,
  sessionId: string,
  transcript: string,
  voiceSignals?: { emotion?: string; arousal?: number; speechRate?: number }
): Promise<{
  energy?: { level: EnergyLevel; score: number };
  overcommitted?: boolean;
  burnoutRisk?: BurnoutAssessment;
} | null> {
  if (!userId) return null;

  try {
    const result: {
      energy?: { level: EnergyLevel; score: number };
      overcommitted?: boolean;
      burnoutRisk?: BurnoutAssessment;
    } = {};

    // Detect energy level from transcript and voice
    const energyResult = detectEnergyLevel(transcript, voiceSignals);
    result.energy = { level: energyResult.level, score: energyResult.score };

    // Check for overcommitment signals
    result.overcommitted = detectOvercommitment(transcript);

    // Record the reading (takes userId and reading data only)
    await recordEnergyReading(userId, {
      energyLevel: energyResult.level,
      energyScore: energyResult.score,
      detectedFrom: voiceSignals ? ['voice', 'text'] : ['text'],
      indicators: energyResult.indicators,
    });

    // If energy is low, assess burnout risk
    if (energyResult.level === 'low' || energyResult.level === 'depleted' || result.overcommitted) {
      result.burnoutRisk = await assessBurnoutRisk(userId);

      if (result.burnoutRisk.risk === 'high' || result.burnoutRisk.risk === 'critical') {
        diag.state('🔋 Burnout risk detected', {
          risk: result.burnoutRisk.risk,
          riskScore: result.burnoutRisk.riskScore,
        });
      }
    }

    return result;
  } catch (error) {
    log.debug({ error }, 'Energy detection failed');
    return null;
  }
}

/**
 * Process transcript for values detection and conflict
 * Tracks user's stated values and flags contradictions
 */
export async function processValuesDetection(
  userId: string,
  transcript: string,
  _topic?: string
): Promise<{
  valueDetected?: { category: string; statement: string };
  conflictDetected?: { statedValue: string; conflictingAction: string };
} | null> {
  if (!userId || !transcript) return null;

  try {
    const result: {
      valueDetected?: { category: string; statement: string };
      conflictDetected?: { statedValue: string; conflictingAction: string };
    } = {};

    // detectValue returns { category, statement, weight } | null
    const valueResult = detectValue(transcript);
    if (valueResult) {
      result.valueDetected = {
        category: valueResult.category,
        statement: valueResult.statement,
      };

      // recordValueMention takes (userId, { category, statement, weight })
      await recordValueMention(userId, valueResult);

      diag.state('💎 Value detected', {
        category: valueResult.category,
      });
    }

    // detectConflict requires user's existing values to check against
    // We need to load user values first, then check for conflicts
    // For now, skip conflict detection if no values detected this turn
    // (More complete implementation would load values and check)

    return result;
  } catch (error) {
    log.debug({ error }, 'Values detection failed');
    return null;
  }
}

/**
 * Process transcript for dream/aspiration detection
 * Guards long-term aspirations from getting lost
 */
export async function processDreamDetection(
  userId: string,
  transcript: string
): Promise<{
  dreamDetected?: { type: string; summary: string };
  dormantDreams?: DreamReminder[];
} | null> {
  if (!userId || !transcript) return null;

  try {
    const result: {
      dreamDetected?: { type: string; summary: string };
      dormantDreams?: DreamReminder[];
    } = {};

    // detectDream returns { type, statement, confidence } | null
    const dreamResult = detectDream(transcript);
    if (dreamResult) {
      result.dreamDetected = {
        type: dreamResult.type,
        summary: dreamResult.statement,
      };

      // recordDreamMention takes (userId, { type, statement, confidence })
      await recordDreamMention(userId, dreamResult);

      diag.state('✨ Dream detected', {
        type: dreamResult.type,
      });
    }

    // Check for dormant dreams to surface
    result.dormantDreams = await findDormantDreams(userId);

    return result;
  } catch (error) {
    log.debug({ error }, 'Dream detection failed');
    return null;
  }
}

/**
 * Process transcript for life chapter/identity moments
 * Builds the narrative of user's journey
 */
export async function processNarrativeMoment(
  userId: string,
  transcript: string,
  _emotion?: string
): Promise<{
  chapterMoment?: { type: string; significance: number };
} | null> {
  if (!userId || !transcript) return null;

  try {
    const result: {
      chapterMoment?: { type: string; significance: number };
    } = {};

    // detectChapterMoment takes only transcript, returns { type, significance } | null
    const chapterResult = detectChapterMoment(transcript);
    if (chapterResult) {
      result.chapterMoment = {
        type: chapterResult.type,
        significance: chapterResult.significance,
      };

      // Record identity shift if significant
      // recordIdentityShift takes (userId, { from, to, evidence })
      if (chapterResult.significance > 0.7) {
        await recordIdentityShift(userId, {
          from: 'unknown',
          to: chapterResult.type,
          evidence: transcript,
        });

        diag.state('📖 Life chapter moment', {
          type: chapterResult.type,
          significance: chapterResult.significance,
        });
      }
    }

    return result;
  } catch (error) {
    log.debug({ error }, 'Narrative moment detection failed');
    return null;
  }
}

/**
 * Process transcript for relationship mentions
 * Maps the user's social network
 */
export async function processRelationshipMention(
  userId: string,
  transcript: string,
  _emotion?: string
): Promise<{
  personMentioned?: { name: string; relationship: string };
  connectionOpportunities?: Array<{ personName: string; reason: string }>;
} | null> {
  if (!userId || !transcript) return null;

  try {
    const result: {
      personMentioned?: { name: string; relationship: string };
      connectionOpportunities?: Array<{ personName: string; reason: string }>;
    } = {};

    // extractPerson returns { name, type, context } | null
    const personResult = extractPerson(transcript);
    if (personResult) {
      result.personMentioned = {
        name: personResult.name,
        relationship: personResult.type,
      };

      // recordMention takes (userId, { name, type, context })
      await recordPersonMention(userId, personResult);

      diag.state('👥 Person mentioned', {
        name: personResult.name,
        relationship: personResult.type,
      });
    }

    // findConnectionOpportunities returns ConnectionOpportunity[] with personName
    const opportunities = await findConnectionOpportunities(userId);
    result.connectionOpportunities = opportunities.map((o) => ({
      personName: o.personName,
      reason: o.reason,
    }));

    return result;
  } catch (error) {
    log.debug({ error }, 'Relationship mention detection failed');
    return null;
  }
}

/**
 * Process for seasonal patterns and personal dates
 * Connects to natural rhythms and important dates
 */
export async function processSeasonalAwareness(
  userId: string,
  transcript?: string
): Promise<{
  currentSeason: Season;
  seasonalPattern?: { type: string };
  upcomingDates?: Array<{ name: string; daysUntil: number }>;
} | null> {
  if (!userId) return null;

  try {
    const result: {
      currentSeason: Season;
      seasonalPattern?: { type: string };
      upcomingDates?: Array<{ name: string; daysUntil: number }>;
    } = {
      currentSeason: getCurrentSeason(),
    };

    // Detect seasonal pattern mentions if transcript provided
    if (transcript) {
      // detectSeasonalPattern returns { type, observation } | null
      const patternResult = detectSeasonalPattern(transcript);
      if (patternResult) {
        result.seasonalPattern = {
          type: patternResult.type,
        };

        // recordSeasonalObservation takes (userId, { type, observation })
        await recordSeasonalObservation(userId, patternResult);
      }
    }

    // findUpcomingDates returns { date: PersonalDate, daysUntil: number }[]
    const upcoming = await findUpcomingDates(userId, 14);
    result.upcomingDates = upcoming.map((u) => ({
      name: u.date.name,
      daysUntil: u.daysUntil,
    }));

    if (result.upcomingDates && result.upcomingDates.length > 0) {
      diag.state('📅 Upcoming personal dates', {
        count: result.upcomingDates.length,
        next: result.upcomingDates[0]?.name,
      });
    }

    return result;
  } catch (error) {
    log.debug({ error }, 'Seasonal awareness processing failed');
    return null;
  }
}

/**
 * Process transcript through ALL Original 10 services
 * Called from turn-processor for comprehensive detection
 */
export async function processOriginal10ForTurn(
  userId: string,
  sessionId: string,
  transcript: string,
  options?: {
    topic?: string;
    emotion?: string;
    voiceSignals?: { emotion?: string; arousal?: number; speechRate?: number };
  }
): Promise<{
  commitment?: CommitmentDetectionResult | null;
  energy?: { level: EnergyLevel; score: number } | null;
  value?: { category: string; statement: string } | null;
  dream?: { type: string; summary: string } | null;
  chapter?: { type: string; significance: number } | null;
  person?: { name: string; relationship: string } | null;
  season?: Season;
}> {
  if (!userId || !transcript) return {};

  const result: {
    commitment?: CommitmentDetectionResult | null;
    energy?: { level: EnergyLevel; score: number } | null;
    value?: { category: string; statement: string } | null;
    dream?: { type: string; summary: string } | null;
    chapter?: { type: string; significance: number } | null;
    person?: { name: string; relationship: string } | null;
    season?: Season;
  } = {};

  try {
    // Run all detections in parallel for performance
    const [
      commitmentRes,
      energyRes,
      valuesRes,
      dreamRes,
      narrativeRes,
      relationshipRes,
      seasonalRes,
    ] = await Promise.allSettled([
      processCommitmentDetection(userId, transcript, options?.topic, sessionId),
      processEnergyDetection(userId, sessionId, transcript, options?.voiceSignals),
      processValuesDetection(userId, transcript, options?.topic),
      processDreamDetection(userId, transcript),
      processNarrativeMoment(userId, transcript, options?.emotion),
      processRelationshipMention(userId, transcript, options?.emotion),
      processSeasonalAwareness(userId, transcript),
    ]);

    // Extract successful results
    if (commitmentRes.status === 'fulfilled' && commitmentRes.value) {
      result.commitment = commitmentRes.value;
    }
    if (energyRes.status === 'fulfilled' && energyRes.value?.energy) {
      result.energy = energyRes.value.energy;
    }
    if (valuesRes.status === 'fulfilled' && valuesRes.value?.valueDetected) {
      result.value = valuesRes.value.valueDetected;
    }
    if (dreamRes.status === 'fulfilled' && dreamRes.value?.dreamDetected) {
      result.dream = dreamRes.value.dreamDetected;
    }
    if (narrativeRes.status === 'fulfilled' && narrativeRes.value?.chapterMoment) {
      result.chapter = narrativeRes.value.chapterMoment;
    }
    if (relationshipRes.status === 'fulfilled' && relationshipRes.value?.personMentioned) {
      result.person = relationshipRes.value.personMentioned;
    }
    if (seasonalRes.status === 'fulfilled' && seasonalRes.value) {
      result.season = seasonalRes.value.currentSeason;
    }

    return result;
  } catch (error) {
    log.debug({ error }, 'Original 10 processing failed');
    return result;
  }
}

// ============================================================================
// RESONANCE CHECK INTEGRATION (Voice-Enabled Feedback)
// ============================================================================

/**
 * Session-scoped resonance check queue
 * Tracks which superhuman capabilities have been surfaced and need feedback
 */
interface ResonanceQueueItem {
  capability: SuperhumanCapability;
  insight: string;
  surfacedAt: number;
  turnNumber: number;
  checked: boolean;
}

const resonanceQueues = new Map<string, ResonanceQueueItem[]>();

/**
 * Tracks which capability is awaiting a user response after "Does that track?"
 * Key: sessionId, Value: { capability, turnAsked, userId }
 */
interface PendingResonanceResponse {
  capability: SuperhumanCapability;
  turnAsked: number;
  insight: string;
}

const pendingResponseChecks = new Map<string, PendingResonanceResponse>();

/**
 * Get the pending resonance response for a session (if any)
 * Returns the capability we asked about and clears it
 */
export function getPendingResonanceCheck(sessionId: string): PendingResonanceResponse | null {
  const pending = pendingResponseChecks.get(sessionId);
  if (pending) {
    pendingResponseChecks.delete(sessionId);
    return pending;
  }
  return null;
}

/**
 * Check if there's a pending resonance response and process the user's transcript
 * This is called at the START of each turn to see if the user is responding to "Does that track?"
 */
export function processUserResponseForResonance(
  sessionId: string,
  userId: string,
  userTranscript: string,
  currentTurn: number
): {
  processed: boolean;
  capability?: SuperhumanCapability;
  reaction?: 'positive' | 'neutral' | 'negative';
} {
  const pending = pendingResponseChecks.get(sessionId);

  // Only process if there was a pending check from the previous turn
  if (!pending || currentTurn !== pending.turnAsked + 1) {
    return { processed: false };
  }

  // Clear the pending check
  pendingResponseChecks.delete(sessionId);

  // Classify the user's response
  const reaction = classifyResonanceResponse(userTranscript);

  // Record the response
  recordResonanceResponse(
    sessionId,
    userId,
    pending.capability,
    reaction,
    reaction === 'positive' // Assume positive = engagement increase
  );

  log.info(
    {
      sessionId,
      capability: pending.capability,
      reaction,
      transcript: userTranscript.slice(0, 50),
    },
    '📊 Resonance response recorded'
  );

  return { processed: true, capability: pending.capability, reaction };
}

/**
 * Queue a resonance check after a superhuman insight is surfaced
 * Called after context is injected into LLM response
 */
export function queueResonanceCheck(
  sessionId: string,
  capability: SuperhumanCapability,
  insight: string,
  turnNumber: number
): void {
  if (!resonanceQueues.has(sessionId)) {
    resonanceQueues.set(sessionId, []);
  }

  const queue = resonanceQueues.get(sessionId)!;

  // Don't queue if we already have 3+ unchecked items
  const uncheckedCount = queue.filter((item) => !item.checked).length;
  if (uncheckedCount >= 3) {
    log.debug({ sessionId, capability }, 'Resonance queue full, skipping');
    return;
  }

  queue.push({
    capability,
    insight,
    surfacedAt: Date.now(),
    turnNumber,
    checked: false,
  });

  log.debug({ sessionId, capability, queueSize: queue.length }, 'Queued resonance check');
}

/**
 * Get the next resonance check to trigger (if any)
 * Returns instructions for backchannel if we should check
 */
export function getNextResonanceCheck(
  sessionId: string,
  currentTurn: number,
  personaId: string
): { shouldCheck: boolean; instructions?: string; capability?: SuperhumanCapability } {
  const queue = resonanceQueues.get(sessionId);
  if (!queue || queue.length === 0) {
    return { shouldCheck: false };
  }

  // Find oldest unchecked item that's at least 1 turn old
  const readyItem = queue.find((item) => !item.checked && currentTurn > item.turnNumber);

  if (!readyItem) {
    return { shouldCheck: false };
  }

  // Generate resonance check backchannel
  const result = generateResonanceCheck(sessionId, {
    turnNumber: currentTurn,
    personaId,
    superhumanCapability: readyItem.capability,
    insightSurfaced: readyItem.insight,
  });

  if (result.shouldTrigger) {
    readyItem.checked = true;

    // Store that we're awaiting a response for this capability
    pendingResponseChecks.set(sessionId, {
      capability: readyItem.capability,
      turnAsked: currentTurn,
      insight: readyItem.insight,
    });

    log.debug(
      { sessionId, capability: readyItem.capability, turnAsked: currentTurn },
      'Set pending resonance response'
    );

    return {
      shouldCheck: true,
      instructions: result.instructions,
      capability: readyItem.capability,
    };
  }

  return { shouldCheck: false };
}

/**
 * Record user's response to a resonance check
 * Called when we detect user's reaction after asking "Does that track?"
 */
export function recordResonanceResponse(
  sessionId: string,
  userId: string,
  capability: SuperhumanCapability,
  reaction: 'positive' | 'neutral' | 'negative',
  engagementIncrease = false
): void {
  // Track in analytics
  trackCapabilityEffectiveness({
    capability,
    userId,
    sessionId,
    userReaction: reaction,
    engagementIncrease,
  });

  log.info({ sessionId, capability, reaction, engagementIncrease }, 'Recorded resonance response');

  diag.state('📊 Resonance feedback recorded', {
    capability,
    reaction,
    engaged: engagementIncrease,
  });
}

/**
 * Classify user's verbal response to resonance check
 * Returns positive, neutral, or negative based on transcript
 */
export function classifyResonanceResponse(transcript: string): 'positive' | 'neutral' | 'negative' {
  const lower = transcript.toLowerCase();

  // Positive signals
  const positivePatterns = [
    /yes|yeah|yep|yup|totally|exactly|definitely/,
    /that.{0,10}(right|true|accurate|spot.?on)/,
    /makes sense|you.{0,5}got it|nailed it/,
    /hundred percent|for sure|absolutely/,
    /wow|whoa|huh|hmm.*(yeah|yes|true)/,
    /i.{0,10}(feel|felt|think|thought) that/,
  ];

  // Negative signals
  const negativePatterns = [
    /no|nah|not really|not quite/,
    /that.{0,10}(wrong|off|not|isn.t)/,
    /i.{0,10}(don.?t|didn.?t) (think|feel|mean)/,
    /miss(ed|ing) the mark/,
    /that.{0,10}not what i/,
  ];

  // Check patterns
  for (const pattern of positivePatterns) {
    if (pattern.test(lower)) return 'positive';
  }

  for (const pattern of negativePatterns) {
    if (pattern.test(lower)) return 'negative';
  }

  return 'neutral';
}

/**
 * Clean up resonance queue for session
 */
export function cleanupResonanceQueue(sessionId: string): void {
  resonanceQueues.delete(sessionId);
  pendingResponseChecks.delete(sessionId);
  log.debug({ sessionId }, 'Cleaned up resonance queue');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const betterThanHumanIntegration = {
  // Lifecycle
  loadProfiles: loadBetterThanHumanProfiles,

  // Silence
  processSilence: processSilenceWithInterpreter,
  recordSilenceOutcome: recordSilenceOutcomeFromResponse,

  // Voice
  detectReceptivity: detectVoiceReceptivity,
  processVoiceProsody,
  recordConversationTiming,
  checkTopicTiming,

  // Transcript
  processTranscript: processTranscriptForBetterThanHuman,

  // Ambient
  processAmbientSignals,

  // Context
  buildContext: buildBetterThanHumanContext,

  // === ORIGINAL 10 (Core Capabilities) ===
  // 1. Commitment Keeper
  processCommitment: processCommitmentDetection,
  getCommitmentFollowUps,

  // 2. Capacity Guardian
  processEnergy: processEnergyDetection,

  // 3. Values Alignment
  processValues: processValuesDetection,

  // 4. Dream Keeper
  processDream: processDreamDetection,

  // 5. Life Narrative
  processNarrative: processNarrativeMoment,

  // 6. Relationship Network
  processRelationship: processRelationshipMention,

  // 7. Seasonal Awareness
  processSeasonal: processSeasonalAwareness,

  // Combined Original 10 processing
  processOriginal10: processOriginal10ForTurn,

  // === V2 Better Than Human (Dec 2025) ===
  // Voice Biomarkers
  processVoiceBiomarkers,

  // Mood Calendar
  recordMood: recordConversationMood,
  getMoodPrediction,

  // Social Battery
  recordSocialInteraction,
  getSocialBatteryStatus,

  // Conflict Resolution
  recordConflict: recordConflictEvent,
  getConflictResolution,

  // Protective Silence
  recordBoundary: recordProtectiveBoundary,
  inferBoundary: inferBoundaryFromUserReaction,

  // Calendar Prep
  getEventPrepCoaching,

  // Recovery Tracking
  startRecoveryTracking: startEventRecoveryTracking,
  getActiveRecoveries,

  // Inside Jokes
  detectSharedMoment,

  // === Resonance Check (Voice-Enabled Feedback) ===
  queueResonanceCheck,
  getNextResonanceCheck,
  recordResonanceResponse,
  classifyResonanceResponse,
  cleanupResonanceQueue,
  getPendingResonanceCheck,
  processUserResponseForResonance,
};
