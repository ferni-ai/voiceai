/**
 * Predictive Tool Preloading
 *
 * ⚡ CRITICAL PERFORMANCE OPTIMIZATION
 *
 * Predicts which tools are likely to be needed based on transcript patterns
 * and preloads their dependencies in the background.
 *
 * This runs EARLY in the turn processing pipeline (as soon as transcript arrives)
 * so tool dependencies are ready by the time execution starts.
 *
 * Savings: ~100-200ms per tool call (dependency loading time)
 *
 * @module agents/shared/performance/predictive-tool-preload
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PredictiveToolPreload' });

// ============================================================================
// PATTERN MATCHING
// ============================================================================

/**
 * Tool prediction patterns - simple keyword/phrase matching
 * Maps patterns to likely tools with confidence scores
 */
interface ToolPrediction {
  toolId: string;
  confidence: number;
  preloadFn?: () => Promise<void>;
}

const PREDICTION_PATTERNS: Array<{
  patterns: RegExp[];
  tools: ToolPrediction[];
}> = [
  // Weather patterns
  {
    patterns: [
      /\bweather\b/i,
      /\bhow (hot|cold|warm)\b/i,
      /\btemperature\b/i,
      /\brain(ing)?\b/i,
      /\bforecast\b/i,
      /\bwill it (rain|snow)\b/i,
    ],
    tools: [
      { toolId: 'getWeather', confidence: 0.9 },
      { toolId: 'weather_current', confidence: 0.9 },
    ],
  },

  // Music patterns
  {
    patterns: [
      /\bplay (some|a|the)?\s*(music|song|track)\b/i,
      /\bput on (some|a)?\s*music\b/i,
      /\blisten to\b/i,
      /\bplay (jazz|rock|classical|hip hop|pop|country)\b/i,
      /\bspotify\b/i,
    ],
    tools: [
      { toolId: 'playMusic', confidence: 0.85 },
      { toolId: 'searchMusic', confidence: 0.7 },
    ],
  },

  // Calendar patterns
  {
    patterns: [
      /\bschedule\b/i,
      /\bcalendar\b/i,
      /\bmeeting(s)?\b/i,
      /\bappointment\b/i,
      /\bwhat('s| is) (on )?my (schedule|calendar)\b/i,
      /\bwhat('s| is) happening (today|tomorrow)\b/i,
      /\bam i free\b/i,
    ],
    tools: [
      { toolId: 'getCalendarToday', confidence: 0.85 },
      { toolId: 'getUpcomingMeetings', confidence: 0.8 },
    ],
  },

  // Timer/reminder patterns
  {
    patterns: [
      /\btimer\b/i,
      /\bremind(er)?\s*(me)?\b/i,
      /\balarm\b/i,
      /\bin \d+ (minute|hour|second)s?\b/i,
      /\bset a\b/i,
    ],
    tools: [
      { toolId: 'setTimer', confidence: 0.85 },
      { toolId: 'setReminder', confidence: 0.8 },
    ],
  },

  // News patterns
  {
    patterns: [
      /\bnews\b/i,
      /\bheadlines\b/i,
      /\bwhat('s| is) happening in the world\b/i,
      /\bcurrent events\b/i,
    ],
    tools: [
      { toolId: 'getNews', confidence: 0.9 },
      { toolId: 'searchNews', confidence: 0.7 },
    ],
  },

  // Task/todo patterns
  {
    patterns: [
      /\btask(s)?\b/i,
      /\bto(-)?do\b/i,
      /\badd (a )?task\b/i,
      /\bwhat('s| is) on my list\b/i,
      /\bremember to\b/i,
    ],
    tools: [
      { toolId: 'getTasks', confidence: 0.85 },
      { toolId: 'addTask', confidence: 0.7 },
    ],
  },

  // Habit patterns
  {
    patterns: [
      /\bhabit(s)?\b/i,
      /\broutine(s)?\b/i,
      /\bhow am i doing with\b/i,
      /\btrack(ing)?\b/i,
      /\bstreak\b/i,
    ],
    tools: [
      { toolId: 'getHabits', confidence: 0.85 },
      { toolId: 'logHabit', confidence: 0.7 },
    ],
  },

  // Contact patterns
  {
    patterns: [
      /\bcall\b/i,
      /\btext\b/i,
      /\bmessage\b/i,
      /\bcontact\b/i,
      /\bemail\b/i,
    ],
    tools: [
      { toolId: 'getContacts', confidence: 0.7 },
      { toolId: 'sendMessage', confidence: 0.6 },
    ],
  },

  // Home automation patterns
  {
    patterns: [
      /\blights?\b/i,
      /\bthermostat\b/i,
      /\btemperature (in |at )?(the )?house\b/i,
      /\bturn (on|off)\b/i,
      /\bset (the )?(\w+) to\b/i,
    ],
    tools: [
      { toolId: 'getHomeStatus', confidence: 0.85 },
      { toolId: 'controlDevice', confidence: 0.8 },
    ],
  },

  // Handoff patterns
  {
    patterns: [
      /\btalk to (maya|peter|alex|jordan|nayan|ferni)\b/i,
      /\bswitch to\b/i,
      /\bget (maya|peter|alex|jordan|nayan)\b/i,
      /\btransfer me\b/i,
    ],
    tools: [{ toolId: 'handoff', confidence: 0.95 }],
  },
];

// ============================================================================
// PRELOAD CACHE
// ============================================================================

/** Cache of preloaded tool states */
const preloadedTools = new Map<string, { timestamp: number; ready: boolean }>();

/** TTL for preloaded state (2 minutes) */
const PRELOAD_TTL_MS = 120_000;

/**
 * Check if a tool is already preloaded
 */
function isToolPreloaded(toolId: string): boolean {
  const state = preloadedTools.get(toolId);
  if (!state) return false;
  if (Date.now() - state.timestamp > PRELOAD_TTL_MS) {
    preloadedTools.delete(toolId);
    return false;
  }
  return state.ready;
}

/**
 * Mark a tool as preloaded
 */
function markToolPreloaded(toolId: string): void {
  preloadedTools.set(toolId, { timestamp: Date.now(), ready: true });
}

// ============================================================================
// PRELOAD FUNCTIONS
// ============================================================================

/**
 * Preload weather tool dependencies
 */
async function preloadWeatherDeps(): Promise<void> {
  try {
    // Import weather module to ensure it's ready
    await import('../../../tools/domains/information/weather.js');
    markToolPreloaded('getWeather');
    markToolPreloaded('weather_current');
  } catch {
    // Non-fatal
  }
}

/**
 * Preload music tool dependencies
 */
async function preloadMusicDeps(): Promise<void> {
  try {
    await import('../../../tools/domains/entertainment/music.js');
    markToolPreloaded('playMusic');
    markToolPreloaded('searchMusic');
  } catch {
    // Non-fatal
  }
}

/**
 * Preload calendar tool dependencies
 */
async function preloadCalendarDeps(): Promise<void> {
  try {
    await import('../../../tools/domains/organization/calendar/index.js');
    markToolPreloaded('getCalendarToday');
    markToolPreloaded('getUpcomingMeetings');
  } catch {
    // Non-fatal
  }
}

/**
 * Preload home automation dependencies
 */
async function preloadHomeDeps(): Promise<void> {
  try {
    await import('../../../tools/domains/home/index.js');
    markToolPreloaded('getHomeStatus');
    markToolPreloaded('controlDevice');
  } catch {
    // Non-fatal
  }
}

/**
 * Map of toolId to preload function
 */
const PRELOAD_FUNCTIONS: Record<string, () => Promise<void>> = {
  getWeather: preloadWeatherDeps,
  weather_current: preloadWeatherDeps,
  playMusic: preloadMusicDeps,
  searchMusic: preloadMusicDeps,
  getCalendarToday: preloadCalendarDeps,
  getUpcomingMeetings: preloadCalendarDeps,
  getHomeStatus: preloadHomeDeps,
  controlDevice: preloadHomeDeps,
};

// ============================================================================
// PUBLIC API
// ============================================================================

export interface PredictionResult {
  toolId: string;
  confidence: number;
  preloaded: boolean;
}

/**
 * Get predictions for likely tools based on partial transcript.
 *
 * Call this early (as soon as speech starts) to get predictions,
 * then call `preloadPredictedTools` to start preloading.
 *
 * @param transcript - Partial or complete user speech
 * @param minConfidence - Minimum confidence to include (default 0.7)
 * @returns Array of predicted tools with confidence scores
 */
export function predictTools(transcript: string, minConfidence = 0.7): PredictionResult[] {
  if (!transcript || transcript.trim().length < 3) {
    return [];
  }

  const predictions: PredictionResult[] = [];
  const seen = new Set<string>();

  for (const { patterns, tools } of PREDICTION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(transcript)) {
        for (const tool of tools) {
          if (!seen.has(tool.toolId) && tool.confidence >= minConfidence) {
            seen.add(tool.toolId);
            predictions.push({
              toolId: tool.toolId,
              confidence: tool.confidence,
              preloaded: isToolPreloaded(tool.toolId),
            });
          }
        }
        break; // Found match for this pattern group, move to next
      }
    }
  }

  // Sort by confidence
  predictions.sort((a, b) => b.confidence - a.confidence);

  return predictions;
}

/**
 * Preload dependencies for predicted tools.
 *
 * This is a fire-and-forget operation - it starts preloading
 * in the background and doesn't block.
 *
 * @param predictions - Tool predictions from `predictTools`
 */
export function preloadPredictedTools(predictions: PredictionResult[]): void {
  for (const prediction of predictions) {
    if (prediction.preloaded) continue;

    const preloadFn = PRELOAD_FUNCTIONS[prediction.toolId];
    if (preloadFn) {
      // Fire and forget
      preloadFn()
        .then(() => {
          log.debug(
            { toolId: prediction.toolId, confidence: prediction.confidence },
            '⚡ Tool preloaded'
          );
        })
        .catch(() => {
          // Non-fatal - tool will load normally when needed
        });
    }
  }
}

/**
 * Predict and preload tools in one call.
 *
 * This is the main entry point - call this as soon as transcript is available.
 *
 * @param transcript - User speech (can be partial)
 * @param minConfidence - Minimum confidence threshold
 * @returns Predictions that were found
 */
export function predictAndPreload(transcript: string, minConfidence = 0.7): PredictionResult[] {
  const predictions = predictTools(transcript, minConfidence);

  if (predictions.length > 0) {
    log.debug({ predictions: predictions.map((p) => p.toolId) }, '🔮 Predicted tools');
    preloadPredictedTools(predictions);
  }

  return predictions;
}

/**
 * Clear preload cache (for testing)
 */
export function clearPreloadCache(): void {
  preloadedTools.clear();
}

/**
 * Get preload cache stats
 */
export function getPreloadCacheStats(): { cacheSize: number; toolIds: string[] } {
  return {
    cacheSize: preloadedTools.size,
    toolIds: Array.from(preloadedTools.keys()),
  };
}

export default {
  predictTools,
  preloadPredictedTools,
  predictAndPreload,
  clearPreloadCache,
  getPreloadCacheStats,
};
