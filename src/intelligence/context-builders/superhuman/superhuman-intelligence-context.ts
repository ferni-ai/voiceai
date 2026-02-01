/**
 * Superhuman Intelligence Context Builder
 *
 * Integrates superhuman intelligence enhancements into the context
 * injection pipeline for the LLM.
 *
 * Note: This is a simplified integration that can be expanded as needed.
 * The full 10 enhancement modules are available for direct use.
 *
 * @module intelligence/context-builders/superhuman/superhuman-intelligence-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHighInjection,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
  BuilderCategory,
} from '../index.js';

// Import enhancement engines
import { getEmotionalMomentumTracker } from '../../../conversation/emotional-arc/momentum/tracker.js';
import { getMicroMomentDetector } from '../../deep-understanding/micro-moments/engine.js';
import { getAvoidanceDetector } from '../../deep-understanding/avoidance-detection/engine.js';
import { getRhythmIntelligence } from '../../../conversation/rhythm-intelligence/engine.js';
import { getRelationalMemory } from '../../../services/superhuman/relational-memory/engine.js';
import { getPatternConnector } from '../../deep-understanding/pattern-connector/engine.js';
import { getStoryArcTracker } from '../../story-tracking/engine.js';
import { getVoiceBiomarkerPipeline } from '../../../speech/voice-biomarkers/engine.js';

const log = createLogger({ module: 'SuperhumanIntelligenceContext' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface SuperhumanIntelligenceSession {
  lastMicroMoment?: string;
  turnCount: number;
}

const sessions = new Map<string, SuperhumanIntelligenceSession>();

function getSession(sessionId: string): SuperhumanIntelligenceSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { turnCount: 0 };
    sessions.set(sessionId, session);
  }
  session.turnCount++;
  return session;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildSuperhumanIntelligenceContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { services, userText, analysis } = input;
  const userId = services.userId || 'anonymous';
  const sessionId = services.sessionId;
  const topics = analysis.topics?.detected || [];

  const injections: ContextInjection[] = [];
  const session = getSession(sessionId);

  try {
    // Run all analyses in parallel for speed
    const [
      microMomentResult,
      avoidanceResult,
      rhythmResult,
      relationalResult,
      patternResult,
      storyResult,
    ] = await Promise.all([
      analyzeMicroMoments(userText),
      analyzeAvoidance(userId, userText, topics, sessionId, session.turnCount),
      analyzeRhythm(userId, userText, session.turnCount, analysis),
      analyzeRelational(userId),
      analyzePatterns(userId, topics, sessionId),
      analyzeStoryArcs(userId),
    ]);

    // 1. Micro-Moment Recognition (HIGH priority - acknowledgment needed)
    if (microMomentResult) {
      injections.push(createHighInjection('SuperhumanIntelligence:MicroMoment', microMomentResult));
      session.lastMicroMoment = microMomentResult;
    }

    // 2. Avoidance Pattern Detection (STANDARD priority)
    if (avoidanceResult) {
      injections.push(createStandardInjection('SuperhumanIntelligence:Avoidance', avoidanceResult));
    }

    // 3. Rhythm Guidance (STANDARD priority)
    if (rhythmResult) {
      injections.push(createStandardInjection('SuperhumanIntelligence:Rhythm', rhythmResult));
    }

    // 4. Relational Memory (HINT priority - background context)
    if (relationalResult) {
      injections.push(createHintInjection('SuperhumanIntelligence:Relational', relationalResult));
    }

    // 5. Pattern Insights (HINT priority - optional surfacing)
    if (patternResult) {
      injections.push(createHintInjection('SuperhumanIntelligence:Patterns', patternResult));
    }

    // 6. Story Continuity (HINT priority - optional follow-up)
    if (storyResult) {
      injections.push(createHintInjection('SuperhumanIntelligence:Story', storyResult));
    }

    log.debug(
      {
        userId,
        sessionId,
        injectionCount: injections.length,
        turnCount: session.turnCount,
      },
      'Superhuman intelligence context built'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Error building superhuman intelligence context');
  }

  return injections;
}

// ============================================================================
// INDIVIDUAL ANALYZERS
// ============================================================================

async function analyzeMicroMoments(userText: string): Promise<string | null> {
  try {
    const detector = getMicroMomentDetector();
    const analysis = detector.detect({
      message: userText,
      previousMessages: [],
    });

    if (analysis.hasSignificantMoment && analysis.primaryMoment) {
      const ack = detector.getAcknowledgment(analysis.primaryMoment);
      return `[MICRO-MOMENT DETECTED: ${analysis.primaryMoment.type}]
This is a significant moment that deserves acknowledgment.
Suggested acknowledgment: "${ack?.phrase || 'Acknowledge this moment gently'}"
Timing: ${ack?.timing || 'weave-in'}`;
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Micro-moment analysis skipped');
  }
  return null;
}

async function analyzeAvoidance(
  userId: string,
  userText: string,
  topics: string[],
  sessionId: string,
  turnNumber: number
): Promise<string | null> {
  try {
    const detector = getAvoidanceDetector();
    const analysis = await detector.detect({
      userId,
      message: userText,
      previousTopic: topics[0],
      sessionId,
      turnNumber,
    });

    if (analysis.hasAvoidance && analysis.primarySignal) {
      return detector.buildContextInjection(analysis);
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Avoidance analysis skipped');
  }
  return null;
}

async function analyzeRhythm(
  userId: string,
  userText: string,
  turnNumber: number,
  analysis: ContextBuilderInput['analysis']
): Promise<string | null> {
  try {
    const rhythm = getRhythmIntelligence();
    const wordCount = userText.split(/\s+/).filter(Boolean).length;

    const guidance = await rhythm.getGuidance({
      userId,
      turnNumber,
      userTurnWordCount: wordCount,
      emotionalState: analysis.emotion?.primary,
    });

    // Only inject if we have learned preferences
    if (guidance.confidence > 0.6) {
      return rhythm.buildContextInjection(guidance);
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Rhythm analysis skipped');
  }
  return null;
}

async function analyzeRelational(userId: string): Promise<string | null> {
  try {
    const relMem = getRelationalMemory();
    const context = await relMem.buildContextForLLM(userId);
    return context || null;
  } catch (error) {
    log.debug({ error: String(error) }, 'Relational analysis skipped');
  }
  return null;
}

async function analyzePatterns(
  userId: string,
  topics: string[],
  sessionId: string
): Promise<string | null> {
  try {
    const connector = getPatternConnector();
    if (topics.length === 0) return null;

    const context = await connector.buildContextInjection(userId, topics);
    return context || null;
  } catch (error) {
    log.debug({ error: String(error) }, 'Pattern analysis skipped');
  }
  return null;
}

async function analyzeStoryArcs(userId: string): Promise<string | null> {
  try {
    const tracker = getStoryArcTracker();
    const context = await tracker.buildContextInjection(userId);
    return context || null;
  } catch (error) {
    log.debug({ error: String(error) }, 'Story arc analysis skipped');
  }
  return null;
}

// ============================================================================
// EXPORTED FUNCTIONS FOR TURN HANDLER
// ============================================================================

/**
 * Record turn for emotional momentum tracking.
 */
export function recordEmotionalMomentum(
  sessionId: string,
  emotion: string,
  valence: number,
  topics: string[]
): void {
  try {
    const tracker = getEmotionalMomentumTracker();
    tracker.recordTurn(sessionId, {
      turn: 0, // Will be auto-incremented
      emotion,
      valence,
      arousal: Math.abs(valence),
      topic: topics[0],
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Emotional momentum recording skipped');
  }
}

/**
 * Check if emotional intervention is needed.
 */
export function checkEmotionalIntervention(sessionId: string) {
  try {
    const tracker = getEmotionalMomentumTracker();
    const intervention = tracker.checkIntervention(sessionId);
    const trajectory = tracker.getTrajectory(sessionId);

    if (intervention) {
      return {
        shouldIntervene: true,
        trajectory,
        guidance: intervention.script || `Intervention type: ${intervention.type}`,
        type: intervention.type,
        timing: intervention.timing,
      };
    }

    return {
      shouldIntervene: false,
      trajectory,
      guidance: null,
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Emotional intervention check skipped');
    return null;
  }
}

/**
 * Analyze voice features and return intervention if needed.
 */
export async function analyzeVoiceAndIntervene(voiceFeatures: {
  speakingRate?: number;
  pitchMean?: number;
  pitchVariance?: number;
  energy?: number;
  jitter?: number;
  shimmer?: number;
}) {
  try {
    const pipeline = getVoiceBiomarkerPipeline();
    const state = await pipeline.analyze(voiceFeatures);
    const intervention = pipeline.getIntervention(state);

    return {
      state: {
        primaryState: state.primary, // VoiceState uses 'primary' not 'state'
        stressLevel: state.stressLevel,
        energyLevel: state.energyLevel,
        biomarkers: state.biomarkers,
      },
      intervention,
      contextInjection: pipeline.buildContextInjection(state),
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Voice biomarker analysis skipped');
    return null;
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'SuperhumanIntelligenceContext',
  category: BuilderCategory.ENGAGEMENT,
  priority: 85,
  build: buildSuperhumanIntelligenceContext,
  description: 'Integrates superhuman intelligence enhancements',
});

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up session state.
 */
export function cleanupSession(sessionId: string): void {
  sessions.delete(sessionId);

  try {
    const tracker = getEmotionalMomentumTracker();
    tracker.reset(sessionId);
  } catch {
    // Non-critical
  }
}
