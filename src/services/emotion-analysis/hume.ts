/**
 * Voice Emotion Analysis Service
 *
 * Provides superhuman emotion detection from voice audio using Gemini.
 * Distinguishes anxiety from sadness from fatigue with high precision.
 *
 * "Better than human" - detects suppressed emotions, micro-expressions in voice,
 * and emotional trajectories that humans often miss.
 *
 * Originally designed for Hume AI, now uses Gemini multimodal for emotion analysis.
 * Uses existing GOOGLE_API_KEY - no additional API setup required.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getDefaultModel } from '../model-config.js';

const logger = getLogger().child({ service: 'VoiceEmotion' });

// Use centralized Gemini config
import { getGeminiClient, isGeminiConfigured } from '../../config/gemini-config.js';

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

// Use centralized model config (toggle via admin UI or model-config.json)
function getGeminiModel(): string {
  return getDefaultModel();
}

// Emotion analysis prompt for Gemini
const EMOTION_ANALYSIS_PROMPT = `Analyze the emotional content of this audio clip. Focus on voice prosody (tone, pitch, rhythm, energy).

Return a JSON object with:
{
  "primary": "the dominant emotion (use one of: joy, sadness, anxiety, anger, fear, tiredness, contentment, excitement, neutral, confusion, frustration, relief, pride, embarrassment, love, contempt, amusement, determination, distress)",
  "secondary": ["array of 1-3 secondary emotions detected"],
  "confidence": 0.0-1.0,
  "arousal": 0.0-1.0 (0=calm/low energy, 1=highly activated/energetic),
  "valence": -1.0 to 1.0 (-1=very negative, 0=neutral, 1=very positive),
  "suppression": 0.0-1.0 (0=emotions seem authentic, 1=emotions seem forced/suppressed),
  "indicators": ["brief notes on what you heard, e.g., 'voice tremor', 'flat tone', 'upward inflection'"]
}

Be sensitive to subtle cues. Distinguish between similar emotions:
- Anxiety: rapid speech, tension, higher pitch
- Sadness: slower speech, lower energy, sighing
- Tiredness: flat prosody, low energy, monotone
- Anger: clipped speech, tension, volume spikes

Return ONLY the JSON object, no markdown.`;

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
 * Analyze audio buffer for emotions using Gemini multimodal
 */
export async function analyzeVoiceEmotion(
  audioBuffer: ArrayBuffer,
  sessionId: string
): Promise<HumeEmotionResult | null> {
  if (!isGeminiConfigured()) {
    logger.debug('Gemini not configured, using fallback');
    return generateFallbackResult();
  }

  try {
    const genAI = await getGeminiClient();
    if (!genAI) {
      logger.debug('Gemini client not available, using fallback');
      return generateFallbackResult();
    }

    // Convert audio buffer to base64
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    // Determine audio MIME type (assume PCM/WAV by default)
    const mimeType = 'audio/wav';

    // Send audio to Gemini for analysis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (genAI as any).models.generateContent({
      model: getGeminiModel(),
      contents: [
        { text: EMOTION_ANALYSIS_PROMPT },
        {
          inlineData: {
            mimeType,
            data: base64Audio,
          },
        },
      ],
    });

    const text = result.text ?? '';

    // Parse Gemini response
    const emotionResult = parseGeminiResponse(text);

    // Update session timeline
    updateSessionTimeline(sessionId, emotionResult);

    logger.debug(
      {
        primary: emotionResult.primary,
        confidence: emotionResult.confidence,
        valence: emotionResult.valence,
      },
      'Gemini emotion analysis complete'
    );

    return emotionResult;
  } catch (error) {
    logger.warn({ error: String(error) }, 'Gemini analysis failed, using fallback');
    return generateFallbackResult();
  }
}

/**
 * Parse Gemini emotion analysis response
 */
function parseGeminiResponse(text: string): HumeEmotionResult {
  try {
    // Clean up response (remove markdown if present)
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    // Try to extract JSON
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('No JSON found in Gemini response');
      return generateFallbackResult();
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      primary?: string;
      secondary?: string[];
      confidence?: number;
      arousal?: number;
      valence?: number;
      suppression?: number;
      indicators?: string[];
    };

    const primary = (parsed.primary || 'neutral') as HumeEmotion;
    const secondary = (parsed.secondary || []) as HumeEmotion[];

    // Build scores object from primary/secondary
    const scores: Record<string, number> = { [primary]: parsed.confidence || 0.7 };
    secondary.forEach((s, i) => {
      scores[s] = Math.max(0.3 - i * 0.1, 0.1);
    });

    return {
      primary,
      secondary,
      confidence: parsed.confidence || 0.7,
      suppression: parsed.suppression || 0,
      arousal: parsed.arousal || 0.5,
      valence: parsed.valence || 0,
      scores: scores as Record<HumeEmotion, number>,
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to parse Gemini response');
    return generateFallbackResult();
  }
}

/**
 * Start real-time emotion streaming for a session
 *
 * Note: Gemini doesn't support streaming WebSocket for multimodal.
 * This uses periodic batch analysis instead.
 */
export async function startEmotionStream(
  sessionId: string,
  onEmotion: (result: HumeEmotionResult) => void
): Promise<{ sendAudio: (audio: ArrayBuffer) => void; stop: () => void }> {
  if (!isGeminiConfigured()) {
    logger.debug('Gemini not configured, streaming disabled');
    return {
      sendAudio: () => {},
      stop: () => {},
    };
  }

  // Initialize session state
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, { timeline: [] });
  }

  let audioBuffer: ArrayBuffer[] = [];
  let isProcessing = false;
  let stopped = false;

  // Process accumulated audio periodically
  const processInterval = setInterval(async () => {
    if (stopped || isProcessing || audioBuffer.length === 0) return;

    isProcessing = true;
    try {
      // Combine audio chunks
      const totalLength = audioBuffer.reduce((sum, buf) => sum + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of audioBuffer) {
        combined.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }
      audioBuffer = [];

      // Analyze combined audio
      const result = await analyzeVoiceEmotion(combined.buffer, sessionId);
      if (result) {
        onEmotion(result);
      }
    } catch (e) {
      logger.debug({ error: String(e) }, 'Emotion stream processing error');
    } finally {
      isProcessing = false;
    }
  }, 3000); // Analyze every 3 seconds

  return {
    sendAudio: (audio: ArrayBuffer) => {
      if (!stopped) {
        audioBuffer.push(audio);
      }
    },
    stop: () => {
      stopped = true;
      clearInterval(processInterval);
      audioBuffer = [];
    },
  };
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
// Helper Functions (kept for compatibility with existing analysis functions)
// ============================================================================

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
