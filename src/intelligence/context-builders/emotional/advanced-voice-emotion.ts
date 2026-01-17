/**
 * Advanced Voice Emotion Context Builder
 *
 * Integrates Hume AI for superhuman emotional intelligence from voice.
 * "Better than Human" - detect emotions humans often miss.
 *
 * Superhuman Capabilities:
 * - Distinguish anxiety from sadness from fatigue
 * - Detect suppressed emotions (forcing cheerfulness)
 * - Identify micro-expressions in voice
 * - Track emotional arc through conversation
 *
 * @module intelligence/context-builders/advanced-voice-emotion
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getEmotionTimeline,
  getLastEmotion,
  generateEmotionInsight,
  detectSuppression,
  distinguishNegativeEmotion,
  type HumeEmotionResult,
  type HumeEmotionTimeline,
  type HumeEmotionPoint,
} from '../../../services/emotion-analysis/hume.js';
import {
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:advanced-voice-emotion' });

// Track emotional arc for each session
interface EmotionalArc {
  startEmotion: string;
  currentEmotion: string;
  trend: 'improving' | 'declining' | 'stable';
  significantShifts: Array<{ from: string; to: string; turnNumber: number }>;
}

const sessionEmotionalArcs = new Map<string, EmotionalArc>();

/**
 * Advanced Voice Emotion Context Builder
 *
 * Priority: 25 (early - informs how to approach the conversation)
 */
export const advancedVoiceEmotionBuilder: ContextBuilder = {
  name: 'advanced-voice-emotion',
  description: 'Injects superhuman emotional intelligence from Hume AI voice analysis',
  priority: 25,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData } = input;
    const sessionId = services.sessionId;

    const injections: ContextInjection[] = [];

    // Get emotion timeline from Hume
    const timeline = getEmotionTimeline(sessionId);

    if (!timeline || timeline.points.length === 0) {
      return [];
    }

    // Get the latest full emotion result for detailed analysis
    const latestEmotion = getLastEmotion(sessionId);

    if (!latestEmotion) {
      return [];
    }

    // Generate insight from latest emotion
    const insight = generateEmotionInsight(latestEmotion);

    if (insight) {
      injections.push({
        id: 'hume-emotion-insight',
        source: 'advanced-voice-emotion',
        content: insight,
        priority: 'high',
        category: 'voice-emotion',
        confidence: latestEmotion.confidence,
      });
    }

    // Check for suppressed emotions (forcing cheerfulness)
    const suppression = detectSuppression(latestEmotion);

    if (suppression.isSuppressing && suppression.confidence > 0.6) {
      const suppressedEmotion = suppression.suppressed || 'something';
      const displayedEmotion = suppression.displayed;

      injections.push({
        id: 'hume-suppression-detected',
        source: 'advanced-voice-emotion',
        content: `SUPPRESSED EMOTION DETECTED: User may be forcing ${displayedEmotion} while actually feeling ${suppressedEmotion}. Gently acknowledge this: "You sound like you're holding back - it's okay to let it out."`,
        priority: 'high',
        category: 'voice-emotion',
        confidence: suppression.confidence,
      });

      log.debug(
        {
          sessionId,
          surface: displayedEmotion,
          underlying: suppressedEmotion,
          confidence: suppression.confidence,
        },
        'Suppressed emotion detected'
      );
    }

    // Distinguish between similar negative emotions
    if (latestEmotion.valence < 0) {
      const distinction = distinguishNegativeEmotion(latestEmotion);

      if (distinction.confidence > 0.7) {
        let guidanceContent: string;

        switch (distinction.emotion) {
          case 'anxiety':
            guidanceContent =
              'Voice analysis indicates ANXIETY (not sadness or anger). Focus on grounding, present moment, and reassurance.';
            break;
          case 'sadness':
            guidanceContent =
              'Voice analysis indicates SADNESS (not anxiety). Focus on validation, allowing grief, and gentle presence.';
            break;
          case 'tiredness':
            guidanceContent =
              'Voice analysis indicates EXHAUSTION/FATIGUE. Be brief, gentle, and acknowledge tiredness. Ask about sleep.';
            break;
          case 'anger':
            guidanceContent =
              'Voice analysis indicates FRUSTRATION/ANGER. Let them vent, validate the frustration, then problem-solve if appropriate.';
            break;
          default:
            guidanceContent = `Voice indicates negative emotion. Respond with empathy.`;
        }

        injections.push({
          id: 'hume-emotion-distinction',
          source: 'advanced-voice-emotion',
          content: guidanceContent,
          priority: 'high',
          category: 'voice-emotion',
          confidence: distinction.confidence,
        });
      }
    }

    // Track emotional arc using timeline
    const arc = updateEmotionalArc(sessionId, timeline, latestEmotion, userData.turnCount || 0);

    if (arc) {
      // Report on emotional trend
      if (arc.trend === 'improving' && timeline.points.length >= 3) {
        injections.push({
          id: 'hume-arc-improving',
          source: 'advanced-voice-emotion',
          content: `EMOTIONAL ARC: User's emotional state is improving throughout the conversation. They started ${arc.startEmotion} and are now ${arc.currentEmotion}. This is working - keep doing what you're doing.`,
          priority: 'standard',
          category: 'voice-emotion',
        });
      } else if (arc.trend === 'declining' && timeline.points.length >= 3) {
        injections.push({
          id: 'hume-arc-declining',
          source: 'advanced-voice-emotion',
          content: `EMOTIONAL ARC WARNING: User's emotional state has declined during the conversation. Started ${arc.startEmotion}, now ${arc.currentEmotion}. Consider a different approach or check in directly.`,
          priority: 'high',
          category: 'voice-emotion',
        });
      }

      // Report significant shifts
      const recentShift = arc.significantShifts[arc.significantShifts.length - 1];
      if (recentShift && recentShift.turnNumber === (userData.turnCount || 0) - 1) {
        injections.push({
          id: 'hume-emotional-shift',
          source: 'advanced-voice-emotion',
          content: `EMOTIONAL SHIFT: User just shifted from ${recentShift.from} to ${recentShift.to}. Acknowledge or explore this change.`,
          priority: 'standard',
          category: 'voice-emotion',
        });
      }
    }

    // Voice brightening detection (positive moments)
    const points = timeline.points;
    if (latestEmotion.valence > 0.3 && latestEmotion.primary === 'joy' && points.length > 1) {
      const previousPoint = points[points.length - 2];
      if (previousPoint.valence <= 0) {
        injections.push({
          id: 'hume-voice-brightened',
          source: 'advanced-voice-emotion',
          content:
            "VOICE BRIGHTENED: User's voice just lifted - they mentioned something that makes them happy. Follow up: 'Your voice just brightened when you mentioned that - tell me more.'",
          priority: 'hint',
          category: 'voice-emotion',
        });
      }
    }

    return injections;
  },
};

/**
 * Update and track emotional arc for a session
 */
function updateEmotionalArc(
  sessionId: string,
  timeline: HumeEmotionTimeline,
  latestEmotion: HumeEmotionResult,
  turnNumber: number
): EmotionalArc | null {
  let arc = sessionEmotionalArcs.get(sessionId);
  const points = timeline.points;

  if (!arc) {
    // Initialize arc from first point
    const firstPoint = points[0];
    arc = {
      startEmotion: firstPoint?.emotion || latestEmotion.primary,
      currentEmotion: latestEmotion.primary,
      trend: 'stable',
      significantShifts: [],
    };
    sessionEmotionalArcs.set(sessionId, arc);
    return arc;
  }

  const previousEmotion = arc.currentEmotion;
  arc.currentEmotion = latestEmotion.primary;

  // Detect significant shifts
  if (previousEmotion !== latestEmotion.primary) {
    const isSignificantShift =
      // From negative to positive
      (isNegativeEmotion(previousEmotion) && isPositiveEmotion(latestEmotion.primary)) ||
      // From positive to negative
      (isPositiveEmotion(previousEmotion) && isNegativeEmotion(latestEmotion.primary)) ||
      // Large valence change
      Math.abs(latestEmotion.valence) > 0.5;

    if (isSignificantShift) {
      arc.significantShifts.push({
        from: previousEmotion,
        to: latestEmotion.primary,
        turnNumber,
      });
    }
  }

  // Use timeline's trajectory
  arc.trend =
    timeline.trajectory === 'improving'
      ? 'improving'
      : timeline.trajectory === 'declining'
        ? 'declining'
        : 'stable';

  return arc;
}

function isNegativeEmotion(emotion: string): boolean {
  return ['sadness', 'anxiety', 'anger', 'fear', 'disgust', 'tiredness', 'distress'].includes(
    emotion
  );
}

function isPositiveEmotion(emotion: string): boolean {
  return ['joy', 'excitement', 'contentment', 'amusement', 'pride', 'love'].includes(emotion);
}

/**
 * Clear session emotional arc on session end
 */
export function clearEmotionalArc(sessionId: string): void {
  sessionEmotionalArcs.delete(sessionId);
}

// Register on module load
registerContextBuilder(advancedVoiceEmotionBuilder);

export default advancedVoiceEmotionBuilder;
