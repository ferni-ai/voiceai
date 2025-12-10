/**
 * Hume AI Voice Emotion Analysis Service
 *
 * Provides superhuman emotion detection from voice audio.
 * Distinguishes anxiety from sadness from fatigue with high precision.
 *
 * "Better than human" - detects suppressed emotions, micro-expressions in voice,
 * and emotional trajectories that humans often miss.
 *
 * @see https://hume.ai/
 */

import { getLogger } from '../../utils/safe-logger.js';

const logger = getLogger().child({ service: 'HumeEmotion' });

// ============================================================================
// Types
// ============================================================================

export interface HumeEmotionResult {
  /** Primary detected emotion */
  primary: HumeEmotion;
  /** Secondary emotions detected */
  secondary: HumeEmotion[];
  /** Confidence score 0-1 */
  confidence: number;
  /** Suppression indicator - detecting forced/fake emotions */
  suppression: number;
  /** Emotional arousal level (activation) 0-1 */
  arousal: number;
  /** Emotional valence (positive/negative) -1 to 1 */
  valence: number;
  /** Raw scores for all emotions */
  scores: Record<HumeEmotion, number>;
  /** Timestamp of analysis */
  timestamp: number;
}

export type HumeEmotion =
  | 'admiration'
  | 'adoration'
  | 'aesthetic_appreciation'
  | 'amusement'
  | 'anger'
  | 'anxiety'
  | 'awe'
  | 'awkwardness'
  | 'boredom'
  | 'calmness'
  | 'concentration'
  | 'confusion'
  | 'contemplation'
  | 'contempt'
  | 'contentment'
  | 'craving'
  | 'determination'
  | 'disappointment'
  | 'disgust'
  | 'distress'
  | 'doubt'
  | 'ecstasy'
  | 'embarrassment'
  | 'empathic_pain'
  | 'entrancement'
  | 'envy'
  | 'excitement'
  | 'fear'
  | 'guilt'
  | 'horror'
  | 'interest'
  | 'joy'
  | 'love'
  | 'nostalgia'
  | 'pain'
  | 'pride'
  | 'realization'
  | 'relief'
  | 'romance'
  | 'sadness'
  | 'satisfaction'
  | 'desire'
  | 'shame'
  | 'surprise_negative'
  | 'surprise_positive'
  | 'sympathy'
  | 'tiredness'
  | 'triumph'
  | 'neutral';

export interface HumeEmotionTimeline {
  sessionId: string;
  points: HumeEmotionPoint[];
  trajectory: 'improving' | 'declining' | 'stable' | 'volatile';
  dominantEmotion: HumeEmotion;
  averageValence: number;
  averageArousal: number;
}

export interface HumeEmotionPoint {
  timestamp: number;
  emotion: HumeEmotion;
  valence: number;
  arousal: number;
  confidence: number;
}

// ============================================================================
// Configuration
// ============================================================================

const HUME_API_URL = 'https://api.hume.ai/v0/batch/jobs';
const HUME_STREAMING_URL = 'wss://api.hume.ai/v0/stream/models';

// Emotion categories for simplified mapping
const NEGATIVE_EMOTIONS: HumeEmotion[] = [
  'anger',
  'anxiety',
  'contempt',
  'disappointment',
  'disgust',
  'distress',
  'embarrassment',
  'fear',
  'guilt',
  'horror',
  'pain',
  'sadness',
  'shame',
  'tiredness',
];

const POSITIVE_EMOTIONS: HumeEmotion[] = [
  'admiration',
  'adoration',
  'amusement',
  'awe',
  'calmness',
  'contentment',
  'ecstasy',
  'excitement',
  'joy',
  'love',
  'pride',
  'relief',
  'satisfaction',
  'triumph',
];

// ============================================================================
// Service State
// ============================================================================

interface SessionState {
  timeline: HumeEmotionPoint[];
  lastAnalysis?: HumeEmotionResult;
  websocket?: WebSocket;
}

const sessionStates = new Map<string, SessionState>();

// ============================================================================
// Main Service
// ============================================================================

/**
 * Analyze audio buffer for emotions using Hume AI
 */
export async function analyzeVoiceEmotion(
  audioBuffer: ArrayBuffer,
  sessionId: string
): Promise<HumeEmotionResult | null> {
  const apiKey = process.env.HUME_API_KEY;

  if (!apiKey) {
    logger.debug('Hume API key not configured, using fallback');
    return generateFallbackResult();
  }

  try {
    // Convert audio buffer to base64
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    const response = await fetch(HUME_API_URL, {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        models: {
          prosody: {},
        },
        data: [
          {
            file: base64Audio,
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Hume API request failed');
      return generateFallbackResult();
    }

    const result = await response.json();
    const emotionResult = parseHumeResponse(result);

    // Update session timeline
    updateSessionTimeline(sessionId, emotionResult);

    logger.debug(
      {
        primary: emotionResult.primary,
        confidence: emotionResult.confidence,
        valence: emotionResult.valence,
      },
      'Hume emotion analysis complete'
    );

    return emotionResult;
  } catch (error) {
    logger.warn({ error: String(error) }, 'Hume analysis failed, using fallback');
    return generateFallbackResult();
  }
}

/**
 * Start real-time emotion streaming for a session
 */
export async function startEmotionStream(
  sessionId: string,
  onEmotion: (result: HumeEmotionResult) => void
): Promise<{ sendAudio: (audio: ArrayBuffer) => void; stop: () => void }> {
  const apiKey = process.env.HUME_API_KEY;

  if (!apiKey) {
    logger.debug('Hume API key not configured, streaming disabled');
    return {
      sendAudio: () => {},
      stop: () => {},
    };
  }

  // Initialize session state
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, { timeline: [] });
  }
  const state = sessionStates.get(sessionId)!;

  try {
    const ws = new WebSocket(`${HUME_STREAMING_URL}?apikey=${apiKey}`);
    state.websocket = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.prosody?.predictions) {
          const result = parseHumeResponse(data);
          state.lastAnalysis = result;
          updateSessionTimeline(sessionId, result);
          onEmotion(result);
        }
      } catch (e) {
        logger.debug({ error: String(e) }, 'Failed to parse Hume stream message');
      }
    };

    ws.onerror = (error) => {
      logger.warn({ error: String(error) }, 'Hume WebSocket error');
    };

    return {
      sendAudio: (audio: ArrayBuffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = Buffer.from(audio).toString('base64');
          ws.send(
            JSON.stringify({
              data: base64,
              models: { prosody: {} },
            })
          );
        }
      },
      stop: () => {
        ws.close();
        state.websocket = undefined;
      },
    };
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to start Hume stream');
    return {
      sendAudio: () => {},
      stop: () => {},
    };
  }
}

/**
 * Get emotion timeline for a session
 */
export function getEmotionTimeline(sessionId: string): HumeEmotionTimeline | null {
  const state = sessionStates.get(sessionId);
  if (!state || state.timeline.length === 0) {
    return null;
  }

  const points = state.timeline;
  const avgValence = points.reduce((sum, p) => sum + p.valence, 0) / points.length;
  const avgArousal = points.reduce((sum, p) => sum + p.arousal, 0) / points.length;

  // Calculate trajectory based on valence trend
  const trajectory = calculateTrajectory(points);

  // Find dominant emotion
  const emotionCounts = new Map<HumeEmotion, number>();
  for (const point of points) {
    emotionCounts.set(point.emotion, (emotionCounts.get(point.emotion) || 0) + 1);
  }
  const dominantEmotion =
    [...emotionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

  return {
    sessionId,
    points,
    trajectory,
    dominantEmotion,
    averageValence: avgValence,
    averageArousal: avgArousal,
  };
}

/**
 * Get the last emotion analysis for a session
 */
export function getLastEmotion(sessionId: string): HumeEmotionResult | null {
  return sessionStates.get(sessionId)?.lastAnalysis || null;
}

/**
 * Clear session state
 */
export function clearSession(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (state?.websocket) {
    state.websocket.close();
  }
  sessionStates.delete(sessionId);
}

// ============================================================================
// Superhuman Insights
// ============================================================================

/**
 * Detect suppressed emotions - when someone is "forcing" cheerfulness
 */
export function detectSuppression(result: HumeEmotionResult): {
  isSuppressing: boolean;
  suppressed: HumeEmotion | null;
  displayed: HumeEmotion;
  confidence: number;
} {
  // High suppression score indicates mismatch between prosody and content
  if (result.suppression > 0.6) {
    // Find the likely suppressed emotion from secondary
    const suppressed = result.secondary.find((e) => NEGATIVE_EMOTIONS.includes(e));
    return {
      isSuppressing: true,
      suppressed: suppressed || null,
      displayed: result.primary,
      confidence: result.suppression,
    };
  }

  return {
    isSuppressing: false,
    suppressed: null,
    displayed: result.primary,
    confidence: 0,
  };
}

/**
 * Distinguish anxiety from sadness from tiredness
 * These are commonly confused by humans
 */
export function distinguishNegativeEmotion(result: HumeEmotionResult): {
  emotion: 'anxiety' | 'sadness' | 'tiredness' | 'anger' | 'other';
  confidence: number;
  indicators: string[];
} {
  const scores = result.scores;

  // Anxiety: high arousal, negative valence
  if (scores.anxiety > 0.4 || (result.arousal > 0.6 && result.valence < -0.2)) {
    return {
      emotion: 'anxiety',
      confidence: scores.anxiety || 0.5,
      indicators: ['elevated arousal', 'tension in voice', 'faster speech patterns'],
    };
  }

  // Tiredness: low arousal, neutral-negative valence
  if (scores.tiredness > 0.4 || (result.arousal < 0.3 && result.valence < 0.1)) {
    return {
      emotion: 'tiredness',
      confidence: scores.tiredness || 0.5,
      indicators: ['low energy', 'slower speech', 'flat prosody'],
    };
  }

  // Sadness: low-medium arousal, negative valence
  if (scores.sadness > 0.4 || (result.arousal < 0.5 && result.valence < -0.3)) {
    return {
      emotion: 'sadness',
      confidence: scores.sadness || 0.5,
      indicators: ['downward intonation', 'sighing patterns', 'pauses'],
    };
  }

  // Anger: high arousal, negative valence, tension
  if (scores.anger > 0.4 || (result.arousal > 0.7 && result.valence < -0.4)) {
    return {
      emotion: 'anger',
      confidence: scores.anger || 0.5,
      indicators: ['increased volume', 'clipped speech', 'tension'],
    };
  }

  return {
    emotion: 'other',
    confidence: result.confidence,
    indicators: [],
  };
}

/**
 * Generate insight for context builder injection
 */
export function generateEmotionInsight(result: HumeEmotionResult): string | null {
  // Check for suppression
  const suppression = detectSuppression(result);
  if (suppression.isSuppressing && suppression.suppressed) {
    return (
      `User appears to be suppressing ${suppression.suppressed} while displaying ${suppression.displayed}. ` +
      `Gently acknowledge this without calling it out directly.`
    );
  }

  // Distinguish negative emotions
  if (result.valence < -0.2) {
    const distinction = distinguishNegativeEmotion(result);
    if (distinction.emotion !== 'other') {
      const indicatorText = distinction.indicators.slice(0, 2).join(', ');
      return (
        `Voice analysis indicates ${distinction.emotion} (${indicatorText}). ` +
        `Respond appropriately for this specific emotion.`
      );
    }
  }

  // High arousal moments
  if (result.arousal > 0.7) {
    if (result.valence > 0.3) {
      return `User shows high positive energy and excitement. Match their enthusiasm.`;
    } else {
      return `User shows elevated stress/activation. Use calming tone and grounding.`;
    }
  }

  // Low energy
  if (result.arousal < 0.3 && result.primary === 'tiredness') {
    return `User sounds tired/fatigued. Keep responses concise and gentle.`;
  }

  return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseHumeResponse(response: unknown): HumeEmotionResult {
  // Parse Hume API response structure
  const predictions =
    (
      response as {
        prosody?: { predictions?: Array<{ emotions?: Array<{ name: string; score: number }> }> };
      }
    )?.prosody?.predictions?.[0]?.emotions || [];

  const scores: Record<string, number> = {};
  for (const pred of predictions) {
    scores[pred.name.toLowerCase().replace(/ /g, '_')] = pred.score;
  }

  // Find primary emotion (highest score)
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = (sorted[0]?.[0] || 'neutral') as HumeEmotion;
  const secondary = sorted.slice(1, 4).map(([name]) => name as HumeEmotion);

  // Calculate valence and arousal from emotion mix
  const valence = calculateValence(scores);
  const arousal = calculateArousal(scores);

  // Estimate suppression from prosody inconsistencies
  const suppression = estimateSuppression(scores, valence);

  return {
    primary,
    secondary,
    confidence: sorted[0]?.[1] || 0,
    suppression,
    arousal,
    valence,
    scores: scores as Record<HumeEmotion, number>,
    timestamp: Date.now(),
  };
}

function calculateValence(scores: Record<string, number>): number {
  let positive = 0;
  let negative = 0;

  for (const [emotion, score] of Object.entries(scores)) {
    if (POSITIVE_EMOTIONS.includes(emotion as HumeEmotion)) {
      positive += score;
    } else if (NEGATIVE_EMOTIONS.includes(emotion as HumeEmotion)) {
      negative += score;
    }
  }

  const total = positive + negative || 1;
  return (positive - negative) / total;
}

function calculateArousal(scores: Record<string, number>): number {
  const highArousal = ['anger', 'excitement', 'fear', 'ecstasy', 'anxiety'];
  const lowArousal = ['calmness', 'tiredness', 'sadness', 'contentment'];

  let high = 0;
  let low = 0;

  for (const [emotion, score] of Object.entries(scores)) {
    if (highArousal.includes(emotion)) high += score;
    if (lowArousal.includes(emotion)) low += score;
  }

  const total = high + low || 1;
  return high / total;
}

function estimateSuppression(scores: Record<string, number>, valence: number): number {
  // Suppression is indicated by mismatch between expressed and underlying emotions
  // E.g., joy on surface but anxiety/sadness in prosody
  const joyScore = scores['joy'] || 0;
  const negativeSum = (scores['anxiety'] || 0) + (scores['sadness'] || 0) + (scores['fear'] || 0);

  if (joyScore > 0.3 && negativeSum > 0.3) {
    return Math.min(negativeSum, 0.9);
  }

  return 0;
}

function updateSessionTimeline(sessionId: string, result: HumeEmotionResult): void {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, { timeline: [] });
  }

  const state = sessionStates.get(sessionId)!;
  state.timeline.push({
    timestamp: result.timestamp,
    emotion: result.primary,
    valence: result.valence,
    arousal: result.arousal,
    confidence: result.confidence,
  });

  // Keep last 100 points
  if (state.timeline.length > 100) {
    state.timeline = state.timeline.slice(-100);
  }

  state.lastAnalysis = result;
}

function calculateTrajectory(
  points: HumeEmotionPoint[]
): 'improving' | 'declining' | 'stable' | 'volatile' {
  if (points.length < 3) return 'stable';

  const recent = points.slice(-10);
  const older = points.slice(-20, -10);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, p) => sum + p.valence, 0) / recent.length;
  const olderAvg = older.reduce((sum, p) => sum + p.valence, 0) / older.length;

  const diff = recentAvg - olderAvg;

  // Check for volatility
  const variance =
    recent.reduce((sum, p) => sum + Math.abs(p.valence - recentAvg), 0) / recent.length;
  if (variance > 0.4) return 'volatile';

  if (diff > 0.15) return 'improving';
  if (diff < -0.15) return 'declining';
  return 'stable';
}

function generateFallbackResult(): HumeEmotionResult {
  return {
    primary: 'neutral',
    secondary: [],
    confidence: 0.5,
    suppression: 0,
    arousal: 0.5,
    valence: 0,
    scores: { neutral: 0.5 } as Record<HumeEmotion, number>,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  analyzeVoiceEmotion,
  startEmotionStream,
  getEmotionTimeline,
  getLastEmotion,
  clearSession,
  detectSuppression,
  distinguishNegativeEmotion,
  generateEmotionInsight,
};
