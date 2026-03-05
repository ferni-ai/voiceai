/**
 * Daily Check-in Handler
 *
 * Detects and processes daily check-in conversations, extracting emotional
 * weather from user responses and persisting to the engagement system.
 *
 * This bridges the gap between voice conversations and data persistence:
 * - Detects when a daily check-in is happening
 * - Uses LLM to extract emotional weather from transcript
 * - Records sky check via API
 * - Updates ritual streak
 *
 * @module voice-agent/daily-checkin-handler
 */

import { log } from '@livekit/agents';
import { diag } from '../../services/diagnostic-logger.js';
import { getDefaultModel } from '../../services/model-config.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionalWeather {
  primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
  energy: 'high' | 'medium' | 'low';
  note?: string;
  confidence: number;
}

export interface CheckInDetectionResult {
  isCheckIn: boolean;
  confidence: number;
  trigger: 'command' | 'organic' | 'ritual' | 'none';
}

export interface DailyCheckInContext {
  sessionId: string;
  userId: string | undefined;
  turnCount: number;
  recentTranscripts: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Phrases that trigger daily check-in detection
 */
const CHECK_IN_TRIGGERS = [
  'daily check-in',
  'daily check in',
  'morning check-in',
  'morning check in',
  'sky check',
  "how i'm feeling",
  'how i am feeling',
  'emotional weather',
  'check in with me',
  "let's do a check-in",
  "let's do a check in",
  'start my day',
  "what's your weather",
  'weather inside',
];

/**
 * Weather keyword mapping for extraction
 */
const WEATHER_KEYWORDS: Record<EmotionalWeather['primary'], string[]> = {
  sunny: [
    'great',
    'amazing',
    'wonderful',
    'fantastic',
    'excellent',
    'happy',
    'joyful',
    'energized',
    'excited',
    'optimistic',
    'bright',
    'positive',
    'sunny',
    'clear',
    'on top of the world',
    'feeling good',
    'really well',
    'pretty good',
    'awesome',
    'good today',
    'really good',
    'feeling really good',
    'lots of energy',
  ],
  'partly-cloudy': [
    'okay',
    'alright',
    'fine',
    'decent',
    'mixed',
    'so-so',
    'not bad',
    'could be better',
    'ups and downs',
    'bit of both',
    'some good some bad',
    'medium',
    'moderate',
  ],
  cloudy: [
    'meh',
    'blah',
    'tired',
    'drained',
    'low energy',
    'unmotivated',
    'sluggish',
    'flat',
    'neutral',
    'nothing special',
    'just existing',
    'going through motions',
  ],
  rainy: [
    'sad',
    'down',
    'blue',
    'melancholy',
    'heavy',
    'processing',
    'grieving',
    'missing',
    'lonely',
    'disconnected',
    'crying',
    'tearful',
    'emotional',
  ],
  stormy: [
    'angry',
    'frustrated',
    'upset',
    'furious',
    'overwhelmed',
    'anxious',
    'panicking',
    'stressed',
    'freaking out',
    'losing it',
    'terrible',
    'awful',
    'horrible',
    'worst',
    'chaos',
    'turbulent',
    'stormy',
  ],
  foggy: [
    'confused',
    'uncertain',
    'lost',
    'unclear',
    'unsure',
    'indecisive',
    'scattered',
    'foggy',
    'hazy',
    "can't think",
    'brain fog',
    "don't know",
    'not sure',
  ],
  rainbow: [
    'breakthrough',
    'relief',
    'hopeful',
    'grateful',
    'thankful',
    'blessed',
    'turning around',
    'getting better',
    'improving',
    'rainbow',
    'after the storm',
    'weight lifted',
    'clarity',
    'peace',
  ],
};

/**
 * Energy level keyword mapping
 */
const ENERGY_KEYWORDS: Record<EmotionalWeather['energy'], string[]> = {
  high: [
    'energized',
    'pumped',
    'ready',
    'motivated',
    "can't wait",
    'excited',
    'raring to go',
    'full of energy',
    'bouncing',
    'alert',
    'sharp',
  ],
  medium: [
    'normal',
    'steady',
    'balanced',
    'okay',
    'adequate',
    'sufficient',
    'manageable',
    'sustainable',
    'moderate',
  ],
  low: [
    'tired',
    'exhausted',
    'drained',
    'no energy',
    'sleepy',
    'fatigued',
    'running on empty',
    'depleted',
    'wiped',
    'burned out',
    'spent',
  ],
};

// ============================================================================
// CHECK-IN STATE TRACKING
// ============================================================================

/**
 * Track active check-in sessions
 * Maps sessionId -> check-in state
 */
const activeCheckIns = new Map<
  string,
  {
    startedAt: number;
    turnStarted: number;
    transcripts: string[];
    weatherExtracted: boolean;
  }
>();

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect if the current conversation is a daily check-in
 */
export function detectDailyCheckIn(
  transcript: string,
  ctx: DailyCheckInContext
): CheckInDetectionResult {
  const lowerTranscript = transcript.toLowerCase();

  // Check for explicit triggers
  for (const trigger of CHECK_IN_TRIGGERS) {
    if (lowerTranscript.includes(trigger)) {
      diag.state('Daily check-in detected via trigger', { trigger });

      // Start tracking this check-in
      activeCheckIns.set(ctx.sessionId, {
        startedAt: Date.now(),
        turnStarted: ctx.turnCount,
        transcripts: [transcript],
        weatherExtracted: false,
      });

      return {
        isCheckIn: true,
        confidence: 0.95,
        trigger: 'command',
      };
    }
  }

  // Check if we're already in an active check-in
  const activeCheckIn = activeCheckIns.get(ctx.sessionId);
  if (activeCheckIn && !activeCheckIn.weatherExtracted) {
    // Within 5 turns of starting, still consider part of check-in
    if (ctx.turnCount - activeCheckIn.turnStarted <= 5) {
      activeCheckIn.transcripts.push(transcript);
      return {
        isCheckIn: true,
        confidence: 0.8,
        trigger: 'organic',
      };
    } else {
      // Check-in timed out
      activeCheckIns.delete(ctx.sessionId);
    }
  }

  // Check for organic emotional disclosure that might warrant recording
  const hasEmotionalContent = detectEmotionalContent(lowerTranscript);
  if (hasEmotionalContent.detected && ctx.turnCount <= 3) {
    // Early in conversation with emotional content - might be a natural check-in
    return {
      isCheckIn: true,
      confidence: hasEmotionalContent.confidence,
      trigger: 'organic',
    };
  }

  return {
    isCheckIn: false,
    confidence: 0,
    trigger: 'none',
  };
}

/**
 * Detect if transcript contains emotional content
 */
function detectEmotionalContent(transcript: string): { detected: boolean; confidence: number } {
  // Flatten all weather keywords
  const allKeywords = Object.values(WEATHER_KEYWORDS).flat();
  const energyKeywords = Object.values(ENERGY_KEYWORDS).flat();
  const allEmotionalKeywords = [...allKeywords, ...energyKeywords];

  let matchCount = 0;
  for (const keyword of allEmotionalKeywords) {
    if (transcript.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  if (matchCount >= 3) {
    return { detected: true, confidence: 0.85 };
  } else if (matchCount >= 2) {
    return { detected: true, confidence: 0.7 };
  } else if (matchCount >= 1) {
    return { detected: true, confidence: 0.5 };
  }

  return { detected: false, confidence: 0 };
}

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract emotional weather from transcript using keyword matching
 * For more accuracy, use extractEmotionalWeatherWithLLM
 */
export function extractEmotionalWeather(transcript: string): EmotionalWeather | null {
  const lowerTranscript = transcript.toLowerCase();

  // Score each weather type
  const scores: Record<EmotionalWeather['primary'], number> = {
    sunny: 0,
    'partly-cloudy': 0,
    cloudy: 0,
    rainy: 0,
    stormy: 0,
    foggy: 0,
    rainbow: 0,
  };

  for (const [weather, keywords] of Object.entries(WEATHER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerTranscript.includes(keyword.toLowerCase())) {
        scores[weather as EmotionalWeather['primary']] += 1;
      }
    }
  }

  // Find highest scoring weather
  let maxScore = 0;
  let primaryWeather: EmotionalWeather['primary'] = 'partly-cloudy'; // Default
  for (const [weather, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      primaryWeather = weather as EmotionalWeather['primary'];
    }
  }

  // If no clear signal, return null (will use LLM fallback)
  if (maxScore === 0) {
    return null;
  }

  // Detect energy level
  let energy: EmotionalWeather['energy'] = 'medium'; // Default
  for (const [level, keywords] of Object.entries(ENERGY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerTranscript.includes(keyword.toLowerCase())) {
        energy = level as EmotionalWeather['energy'];
        break;
      }
    }
  }

  // Calculate confidence based on match count
  const confidence = Math.min(0.95, 0.5 + maxScore * 0.15);

  return {
    primary: primaryWeather,
    energy,
    note: transcript.length > 200 ? `${transcript.slice(0, 200)}...` : transcript,
    confidence,
  };
}

/**
 * Extract emotional weather using LLM for higher accuracy
 */
export async function extractEmotionalWeatherWithLLM(
  transcripts: string[],
  sessionId: string
): Promise<EmotionalWeather | null> {
  try {
    // Use centralized Gemini config
    const { getGeminiClient, isGeminiConfigured } = await import('../../config/gemini-config.js');

    if (!isGeminiConfigured()) {
      log().warn('Gemini not configured, falling back to keyword extraction');
      return extractEmotionalWeather(transcripts.join(' '));
    }

    const genai = await getGeminiClient();
    if (!genai) {
      log().warn('Failed to get Gemini client, falling back to keyword extraction');
      return extractEmotionalWeather(transcripts.join(' '));
    }

    const combinedTranscript = transcripts.join('\n\n');

    const prompt = `Analyze this conversation excerpt and extract the user's emotional state.

User said:
"""
${combinedTranscript}
"""

Based on the conversation, determine:
1. Primary emotional weather (choose ONE): sunny, partly-cloudy, cloudy, rainy, stormy, foggy, rainbow
   - sunny = feeling great, happy, positive
   - partly-cloudy = mixed feelings, okay but not great
   - cloudy = low mood, tired, unmotivated
   - rainy = sad, down, processing difficult emotions
   - stormy = angry, overwhelmed, anxious, stressed
   - foggy = confused, uncertain, unclear thinking
   - rainbow = breakthrough, relief, hope after difficulty

2. Energy level (choose ONE): high, medium, low

3. A brief note summarizing their emotional state (1 sentence max)

Respond in JSON format ONLY:
{"primary": "weather_type", "energy": "level", "note": "brief note", "confidence": 0.0-1.0}`;

    type GeminiGenerateContent = {
      models: {
        generateContent: (opts: { model: string; contents: string }) => Promise<{ text?: string }>;
      };
    };
    const result = await (genai as GeminiGenerateContent).models.generateContent({
      model: getDefaultModel(),
      contents: prompt,
    });
    const text = result.text ?? '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log().warn('Failed to parse LLM weather response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as EmotionalWeather;

    // Validate the response
    const validWeathers: Array<EmotionalWeather['primary']> = [
      'sunny',
      'partly-cloudy',
      'cloudy',
      'rainy',
      'stormy',
      'foggy',
      'rainbow',
    ];
    const validEnergies: Array<EmotionalWeather['energy']> = ['high', 'medium', 'low'];

    if (!validWeathers.includes(parsed.primary) || !validEnergies.includes(parsed.energy)) {
      log().warn('Invalid weather values from LLM', { parsed });
      return null;
    }

    diag.state('Extracted weather via LLM', {
      primary: parsed.primary,
      energy: parsed.energy,
      confidence: parsed.confidence,
    });

    return parsed;
  } catch (error) {
    log().warn({ error }, 'LLM weather extraction failed, falling back to keywords');

    // Fallback to keyword extraction
    return extractEmotionalWeather(transcripts.join(' '));
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Callback type for sending data messages to frontend
 */
export type SendDataMessageFn = (type: string, payload: Record<string, unknown>) => Promise<void>;

/**
 * Record the daily check-in to the backend
 */
export async function recordDailyCheckIn(
  userId: string,
  weather: EmotionalWeather,
  sessionId: string,
  sendDataMessage?: SendDataMessageFn
): Promise<{ success: boolean; streak?: number; error?: string }> {
  try {
    // Import the services
    const { getDailyRitualsService } = await import('../../services/daily-rituals.js');
    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');

    const service = getDailyRitualsService();
    const store = await getEngagementStore();

    // 1. Record emotional weather
    await store.recordWeather(userId, {
      date: new Date().toISOString(),
      weather: {
        primary: weather.primary,
        energy: weather.energy,
        note: weather.note,
      },
      ritualId: 'ferni-sky-check',
    });

    // 2. Record ritual completion using the consolidated service
    const result = await service.recordCompletionAsync(userId, 'ferni-sky-check', {
      emotionalWeather: weather,
    });

    diag.state('Daily check-in recorded', {
      userId,
      weather: weather.primary,
      energy: weather.energy,
      streak: result.newStreak,
      isNewRecord: result.isNewRecord,
    });

    // Mark check-in as complete
    const activeCheckIn = activeCheckIns.get(sessionId);
    if (activeCheckIn) {
      activeCheckIn.weatherExtracted = true;
    }

    // Send data message to frontend so UI can update
    if (sendDataMessage) {
      try {
        await sendDataMessage('daily_checkin_recorded', {
          weather: weather.primary,
          energy: weather.energy,
          streak: result.newStreak,
          isNewRecord: result.isNewRecord,
          celebration: result.celebration,
          ritualId: 'ferni-sky-check',
          timestamp: new Date().toISOString(),
        });
        diag.state('Sent check-in data message to frontend');
      } catch (msgError) {
        // Non-critical - frontend will sync on next load
        log().debug({ error: String(msgError) }, 'Failed to send check-in data message');
      }
    }

    return {
      success: true,
      streak: result.newStreak,
    };
  } catch (error) {
    log().error({ error, userId }, 'Failed to record daily check-in');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Process a transcript for daily check-in
 * Call this from the transcript handler when a final transcript is received
 *
 * @param transcript - The user's transcript
 * @param ctx - Check-in context with session/user info
 * @param sendDataMessage - Optional callback to send data messages to frontend
 * @returns true if a check-in was recorded, false otherwise
 */
export async function processDailyCheckIn(
  transcript: string,
  ctx: DailyCheckInContext,
  sendDataMessage?: SendDataMessageFn
): Promise<boolean> {
  // Must have a userId to record
  if (!ctx.userId) {
    return false;
  }

  // Detect if this is a check-in
  const detection = detectDailyCheckIn(transcript, ctx);
  if (!detection.isCheckIn) {
    return false;
  }

  // Get the active check-in state
  const activeCheckIn = activeCheckIns.get(ctx.sessionId);
  if (!activeCheckIn) {
    return false;
  }

  // Already extracted weather for this check-in
  if (activeCheckIn.weatherExtracted) {
    return false;
  }

  // Try keyword extraction first (fast)
  let weather = extractEmotionalWeather(activeCheckIn.transcripts.join(' '));

  // If low confidence or no result, try LLM
  if (!weather || weather.confidence < 0.6) {
    const llmWeather = await extractEmotionalWeatherWithLLM(
      activeCheckIn.transcripts,
      ctx.sessionId
    );
    if (llmWeather && (!weather || llmWeather.confidence > weather.confidence)) {
      weather = llmWeather;
    }
  }

  // If still no weather detected, use default
  if (!weather) {
    weather = {
      primary: 'partly-cloudy',
      energy: 'medium',
      note: activeCheckIn.transcripts[0]?.slice(0, 200),
      confidence: 0.5,
    };
  }

  // Record the check-in
  const result = await recordDailyCheckIn(ctx.userId, weather, ctx.sessionId, sendDataMessage);

  return result.success;
}

/**
 * Get celebration message for a streak milestone
 */
export function getStreakCelebration(streak: number): string | null {
  const milestones: Record<number, string> = {
    3: "Three days of checking in! You're building a beautiful habit.",
    7: "A full week of sky checks! I'm proud of you.",
    14: "Two weeks! You're really getting to know yourself.",
    21: 'Three weeks - they say this is when habits stick.',
    30: 'A whole month of showing up for yourself!',
    66: 'Sixty-six days. Research says this is automaticity. This is who you are now.',
    100: "One hundred days. You've transformed self-reflection into a daily gift.",
  };

  return milestones[streak] || null;
}

/**
 * Clean up stale check-in sessions (call periodically)
 */
export function cleanupStaleCheckIns(): void {
  const now = Date.now();
  const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, checkIn] of activeCheckIns) {
    if (now - checkIn.startedAt > MAX_AGE_MS) {
      activeCheckIns.delete(sessionId);
    }
  }
}

/**
 * Reset all active check-ins (for testing)
 */
export function resetActiveCheckIns(): void {
  activeCheckIns.clear();
}

export default {
  detectDailyCheckIn,
  extractEmotionalWeather,
  extractEmotionalWeatherWithLLM,
  recordDailyCheckIn,
  processDailyCheckIn,
  getStreakCelebration,
  cleanupStaleCheckIns,
};
