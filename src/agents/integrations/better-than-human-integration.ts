/**
 * Better Than Human Integration
 *
 * Integrates the 9 new "Better Than Human" services with the voice pipeline:
 * 1. Silence Interpreter - Classifies silence types, learns thresholds
 * 2. Contradiction Comfort - Validates mixed emotions
 * 3. Perfect Timing Intelligence - Learns optimal timing for topics
 * 4. Pattern Mirror - Tracks energizing/draining topics
 * 5. Future Self Letters - Generates letters from future self
 * 6. First-Time Vulnerability - Detects first-time shares
 * 7. Linguistic Mirroring - Adapts to user's language patterns
 * 8. Ambient Context Detection - Classifies user's environment
 * 9. Protective Memory - Tracks premature advice, boundary softening
 *
 * @module @ferni/agents/integrations/better-than-human
 */

import { createLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';

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
import {
  detectPotentialMoment,
} from '../../services/superhuman/inside-joke-memory.js';

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
 */
export async function loadBetterThanHumanProfiles(userId: string): Promise<void> {
  const startTime = Date.now();

  try {
    // Load all profiles in parallel - these return context strings
    const results = await Promise.allSettled([
      buildSilenceContext(userId),
      buildContradictionAwarenessContext(userId),
      Promise.resolve(buildTimingContext(userId)),
      Promise.resolve(buildPatternMirrorContext(userId)),
      Promise.resolve(buildVulnerabilityAwarenessContext(userId)),
      Promise.resolve(buildLinguisticContext(userId)),
    ]);

    const loadedCount = results.filter((r) => r.status === 'fulfilled').length;
    const duration = Date.now() - startTime;

    diag.session('🌟 Better Than Human profiles loaded', {
      userId,
      durationMs: duration,
      profilesLoaded: loadedCount,
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
  }).catch((e) =>
    log.debug({ error: e }, 'Failed to record silence outcome')
  );
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
 */
export async function buildBetterThanHumanContext(userId: string): Promise<string> {
  if (!userId) return '';

  try {
    const results = await Promise.allSettled([
      buildSilenceContext(userId),
      buildContradictionAwarenessContext(userId),
      Promise.resolve(buildTimingContext(userId)),
      Promise.resolve(buildPatternMirrorContext(userId)),
      Promise.resolve(buildVulnerabilityAwarenessContext(userId)),
      Promise.resolve(buildLinguisticContext(userId)),
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
  mood: 'joyful' | 'content' | 'calm' | 'neutral' | 'anxious' | 'sad' | 'frustrated' | 'overwhelmed' | 'exhausted' | 'hopeful',
  intensity: number,
  context?: string
): Promise<void> {
  try {
    await recordMoodEntry(userId, mood, intensity, context);
    diag.state('😊 Mood recorded', { mood, intensity });
  } catch (error) {
    log.debug({ error }, 'Mood recording failed');
  }
}

/**
 * Get mood prediction for user
 */
export async function getMoodPrediction(userId: string): Promise<{ predictedMood?: string; confidence?: number } | null> {
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
export async function getSocialBatteryStatus(userId: string): Promise<{ level: number; fullRechargeHours?: number } | null> {
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
      conflictType: conflictType as 'disagreement' | 'miscommunication' | 'boundary_violation' | 'unmet_expectations' | 'values_clash' | 'recurring_issue' | 'external_stress' | 'emotional_flooding',
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
      category: category as 'loss' | 'trauma' | 'health' | 'family' | 'relationship' | 'work' | 'financial' | 'identity' | 'comparison' | 'achievement' | 'other',
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
};
