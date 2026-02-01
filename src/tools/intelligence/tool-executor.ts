/**
 * FTIS V2 Direct Executor
 *
 * Executes tools directly based on FTIS V2 classification,
 * bypassing the LLM for tool selection.
 *
 * Flow:
 * 1. FTIS V2 classifies query → category + toolIds
 * 2. Argument extractor infers args from query
 * 3. Execute tool directly
 * 4. Return result for LLM to respond to naturally
 *
 * @module tools/intelligence/tool-executor
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'tool-executor' });

/**
 * Classification result from the FTIS V2 tool classifier.
 * Defines the expected shape for direct tool execution.
 */
export interface ClassificationResult {
  /** Fine-grained category (e.g., 'weather', 'music', 'calendar') */
  fineCategory: string;
  /** Ranked list of candidate tool IDs */
  toolIds: string[];
  /** Combined confidence score from all signals */
  combinedConfidence: number;
  /** Effective confidence after calibration/boundary adjustment */
  effectiveConfidence?: number;
  /** Whether this appears to be an open-ended intent (conversation, not tool) */
  isOpenIntent?: boolean;
  /** Raw embedding confidence */
  embeddingConfidence?: number;
  /** Pattern match confidence */
  patternConfidence?: number;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionContext {
  userId: string;
  sessionId: string;
  personaId?: string;
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
}

export interface DirectExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Tool that was executed */
  toolId: string;
  /** Natural language response to inject into LLM context */
  naturalResponse: string;
  /** Raw result data */
  rawResult?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  durationMs: number;
  /** Whether LLM should be bypassed (always true for successful execution) */
  bypassLLM: boolean;
}

export interface ArgumentExtractionResult {
  toolId: string;
  args: Record<string, unknown>;
  confidence: number;
}

// ============================================================================
// ARGUMENT EXTRACTION
// ============================================================================

/**
 * Extract arguments from user query for the given tool.
 *
 * Uses pattern matching and heuristics to infer arguments.
 * Falls back to empty args if uncertain.
 */
export function extractArguments(
  query: string,
  fineCategory: string,
  toolIds: string[]
): ArgumentExtractionResult {
  const normalizedQuery = query.toLowerCase().trim();

  // Get the primary tool ID
  const toolId = mapCategoryToToolId(fineCategory, toolIds);

  // Category-specific argument extraction
  const extractors: Record<string, () => Record<string, unknown>> = {
    // Music - support both naming conventions (model uses music_play, legacy uses play_music)
    music_play: () => extractMusicArgs(normalizedQuery),
    play_music: () => extractMusicArgs(normalizedQuery),
    music_control: () => extractMusicControlArgs(normalizedQuery),
    music_search: () => extractMusicSearchArgs(normalizedQuery),
    find_music: () => extractMusicSearchArgs(normalizedQuery),

    // Calendar
    alarm_set: () => extractAlarmArgs(normalizedQuery),
    timer_set: () => extractTimerArgs(normalizedQuery),
    reminder_set: () => extractReminderArgs(normalizedQuery),
    calendar_create: () => extractCalendarArgs(normalizedQuery),
    calendar_view: () => ({}),

    // Weather
    weather: () => extractWeatherArgs(normalizedQuery),

    // Productivity
    item_add: () => extractItemAddArgs(normalizedQuery),
    todo_view: () => ({}),
    todo_complete: () => extractTodoCompleteArgs(normalizedQuery),

    // Habits
    activity_log: () => extractHabitLogArgs(normalizedQuery),
    habit_create: () => extractHabitCreateArgs(normalizedQuery),
    habit_view: () => ({}),

    // Communication
    call_make: () => extractCallArgs(normalizedQuery),
    message_send: () => extractMessageArgs(normalizedQuery),

    // Handoffs
    handoff_maya: () => ({ reason: extractHandoffReason(normalizedQuery) }),
    handoff_peter: () => ({ reason: extractHandoffReason(normalizedQuery) }),
    handoff_alex: () => ({ reason: extractHandoffReason(normalizedQuery) }),
    handoff_jordan: () => ({ reason: extractHandoffReason(normalizedQuery) }),
    handoff_nayan: () => ({ reason: extractHandoffReason(normalizedQuery) }),
    handoff_ferni: () => ({ reason: extractHandoffReason(normalizedQuery) }),

    // Smart Home
    lights: () => extractLightsArgs(normalizedQuery),
    thermostat: () => extractThermostatArgs(normalizedQuery),

    // Information
    time: () => ({}),
    date: () => ({}),

    // Entertainment
    game: () => extractGameArgs(normalizedQuery),
    joke: () => ({}),

    // ===========================================
    // FTIS V3 Categories (January 2026)
    // ===========================================

    // Health Domain
    exercise_log: () => extractExerciseArgs(normalizedQuery),
    nutrition: () => extractNutritionArgs(normalizedQuery),
    water: () => extractWaterArgs(normalizedQuery),
    sleep: () => extractSleepArgs(normalizedQuery),

    // Finance Domain
    budget: () => extractBudgetArgs(normalizedQuery),
    bills: () => extractBillsArgs(normalizedQuery),

    // CEO Coaching Domain
    briefing: () => ({}), // No args needed - get today's briefing
    priorities: () => extractPrioritiesArgs(normalizedQuery),
    journal: () => extractJournalArgs(normalizedQuery),
    gratitude: () => extractGratitudeArgs(normalizedQuery),

    // Travel Domain
    travel_plan: () => extractTravelPlanArgs(normalizedQuery),
    flights: () => extractFlightArgs(normalizedQuery),
    directions: () => extractDirectionsArgs(normalizedQuery),

    // Default
    conversation: () => ({}),
  };

  const extractor = extractors[fineCategory];
  const args = extractor ? extractor() : {};

  return {
    toolId,
    args,
    confidence: Object.keys(args).length > 0 ? 0.9 : 0.7,
  };
}

// ============================================================================
// CATEGORY → TOOL ID MAPPING
// ============================================================================

function mapCategoryToToolId(fineCategory: string, toolIds: string[]): string {
  // Use the first tool ID from the mapping as the primary tool
  if (toolIds.length > 0) {
    // Prefer certain tool IDs based on common naming
    const preferred = toolIds.find(
      (id) =>
        id === 'playMusic' ||
        id === 'getWeather' ||
        id === 'setAlarm' ||
        id === 'setTimer' ||
        id === 'addTask' ||
        id.startsWith('handoff')
    );
    return preferred || toolIds[0];
  }

  // Fallback mapping for common categories
  // Note: Support both naming conventions (model uses music_play, legacy uses play_music)
  const fallbackMap: Record<string, string> = {
    music_play: 'playMusic',
    play_music: 'playMusic',
    music_control: 'musicControl',
    music_search: 'searchMusic',
    find_music: 'searchMusic',
    weather: 'getWeather',
    alarm_set: 'setAlarm',
    timer_set: 'setTimer',
    reminder_set: 'setReminder',
    item_add: 'addTask',
    todo_view: 'getTasks',
    habit_view: 'getHabits',
    handoff_maya: 'handoffToMaya',
    handoff_peter: 'handoffToPeter',
    handoff_alex: 'handoffToAlex',
    handoff_jordan: 'handoffToJordan',
    handoff_nayan: 'handoffToNayan',
    handoff_ferni: 'handoffToFerni',
    time: 'getCurrentTime',
    date: 'getCurrentDate',
    lights: 'controlLights',
    thermostat: 'setThermostat',
    call_make: 'makePhoneCall',
    message_send: 'sendMessage',
  };

  return fallbackMap[fineCategory] || fineCategory;
}

// ============================================================================
// ARGUMENT EXTRACTORS
// ============================================================================

function extractMusicArgs(query: string): Record<string, unknown> {
  // Remove common prefixes
  const cleaned = query
    .replace(/^(play|put on|start|let's hear|i want to hear|can you play)\s*/i, '')
    .replace(/\s*(music|song|songs)$/i, '')
    .trim();

  return { query: cleaned || 'music' };
}

function extractMusicControlArgs(query: string): Record<string, unknown> {
  if (/pause|stop/i.test(query)) return { action: 'pause' };
  if (/resume|continue|unpause/i.test(query)) return { action: 'resume' };
  if (/skip|next/i.test(query)) return { action: 'skip' };
  if (/previous|back|last/i.test(query)) return { action: 'previous' };
  if (/volume|louder|quieter|turn (up|down)/i.test(query)) {
    const level = /louder|turn up/i.test(query) ? 80 : 40;
    return { action: 'volume', level };
  }
  return { action: 'pause' };
}

function extractMusicSearchArgs(query: string): Record<string, unknown> {
  const cleaned = query
    .replace(/^(search|find|look for|what's)\s*/i, '')
    .replace(/\s*(playing|on|now)$/i, '')
    .trim();
  return { query: cleaned };
}

function extractAlarmArgs(query: string): Record<string, unknown> {
  // Extract time patterns
  const timeMatch = query.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3]?.toLowerCase();

    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    return { time };
  }

  // Common patterns
  if (/morning/i.test(query)) return { time: '07:00' };
  if (/noon/i.test(query)) return { time: '12:00' };
  if (/evening/i.test(query)) return { time: '18:00' };

  return { time: '07:00' }; // Default
}

function extractTimerArgs(query: string): Record<string, unknown> {
  // Extract duration patterns
  const minuteMatch = query.match(/(\d+)\s*min(ute)?s?/i);
  if (minuteMatch) return { duration: `${minuteMatch[1]} minutes` };

  const hourMatch = query.match(/(\d+)\s*hour?s?/i);
  if (hourMatch) return { duration: `${hourMatch[1]} hours` };

  const secondMatch = query.match(/(\d+)\s*sec(ond)?s?/i);
  if (secondMatch) return { duration: `${secondMatch[1]} seconds` };

  return { duration: '5 minutes' }; // Default
}

function extractReminderArgs(query: string): Record<string, unknown> {
  // Extract what to remind about
  const toMatch = query.match(/remind me (?:to\s+)?(.+?)(?:\s+(?:at|in|tomorrow|later))/i);
  const message = toMatch ? toMatch[1] : 'reminder';

  // Extract when
  const timeMatch = query.match(/(?:at|in)\s+(.+)$/i);
  const when = timeMatch ? timeMatch[1] : 'later today';

  return { message, when };
}

function extractCalendarArgs(query: string): Record<string, unknown> {
  // Basic event extraction
  const eventMatch = query.match(/(?:schedule|add|create)\s+(?:a\s+)?(.+?)(?:\s+(?:at|for|on))/i);
  const title = eventMatch ? eventMatch[1] : 'Event';

  const timeMatch = query.match(/(?:at|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  const startTime = timeMatch ? timeMatch[1] : undefined;

  return { title, startTime };
}

function extractWeatherArgs(query: string): Record<string, unknown> {
  // Check for location - preserve original case
  const locationMatch = query.match(/(?:in|for|at)\s+([A-Za-z\s]+)$/i);
  if (locationMatch) {
    // Capitalize first letter of each word (proper noun)
    const location = locationMatch[1]
      .trim()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    return { location };
  }
  return {}; // Auto-detect location
}

function extractItemAddArgs(query: string): Record<string, unknown> {
  // Extract item to add
  const addMatch = query.match(
    /(?:add|put|remember)\s+(.+?)(?:\s+(?:to|on)\s+(?:my\s+)?(?:list|todo))?$/i
  );
  if (addMatch) {
    return { title: addMatch[1].trim() };
  }

  // "I need to X" pattern
  const needMatch = query.match(/i need to\s+(.+)$/i);
  if (needMatch) {
    return { title: needMatch[1].trim() };
  }

  return { title: query };
}

function extractTodoCompleteArgs(query: string): Record<string, unknown> {
  const doneMatch = query.match(/(?:done|finished|completed|did)\s+(?:the\s+)?(.+)$/i);
  if (doneMatch) {
    return { taskName: doneMatch[1].trim() };
  }
  return {};
}

function extractHabitLogArgs(query: string): Record<string, unknown> {
  // "I did X" or "I went to the gym" patterns
  const didMatch = query.match(
    /(?:i\s+)?(?:did|went|completed|finished)\s+(?:my\s+)?(.+?)(?:\s+today)?$/i
  );
  if (didMatch) {
    return { habitName: didMatch[1].trim() };
  }
  return {};
}

function extractHabitCreateArgs(query: string): Record<string, unknown> {
  const createMatch = query.match(
    /(?:create|start|track|add)\s+(?:a\s+)?(?:new\s+)?(?:habit\s+)?(?:for\s+|to\s+)?(.+)$/i
  );
  if (createMatch) {
    return { name: createMatch[1].trim(), frequency: 'daily' };
  }
  return { name: 'New habit', frequency: 'daily' };
}

function extractCallArgs(query: string): Record<string, unknown> {
  const contactMatch = query.match(/(?:call|phone|ring)\s+(?:my\s+)?(.+)$/i);
  if (contactMatch) {
    return { contact: contactMatch[1].trim() };
  }
  return {};
}

function extractMessageArgs(query: string): Record<string, unknown> {
  const msgMatch = query.match(
    /(?:text|message|send)\s+(?:my\s+)?(\w+)\s+(?:that\s+|saying\s+)?(.+)$/i
  );
  if (msgMatch) {
    return { contact: msgMatch[1].trim(), message: msgMatch[2].trim() };
  }
  return {};
}

function extractHandoffReason(query: string): string {
  // Extract the reason/context for the handoff
  if (/habit|routine|morning|evening/i.test(query)) return 'habits';
  if (/research|analyze|study/i.test(query)) return 'research';
  if (/calendar|schedule|meeting/i.test(query)) return 'scheduling';
  if (/event|party|plan/i.test(query)) return 'event planning';
  if (/meaning|purpose|wisdom/i.test(query)) return 'guidance';
  return 'requested';
}

function extractLightsArgs(query: string): Record<string, unknown> {
  const action = /off|turn off/i.test(query) ? 'off' : 'on';
  const roomMatch = query.match(/(?:in\s+(?:the\s+)?)?(\w+)\s+(?:lights?|room)/i);
  const room = roomMatch ? roomMatch[1] : undefined;

  return { action, room };
}

function extractThermostatArgs(query: string): Record<string, unknown> {
  const tempMatch = query.match(/(\d{2})\s*(?:degrees?|°)?/);
  if (tempMatch) {
    return { temperature: parseInt(tempMatch[1]) };
  }

  if (/warmer|hotter|heat/i.test(query)) return { temperature: 72 };
  if (/cooler|colder|cool/i.test(query)) return { temperature: 68 };

  return { temperature: 70 };
}

function extractGameArgs(query: string): Record<string, unknown> {
  if (/trivia/i.test(query)) return { gameType: 'trivia' };
  if (/story/i.test(query)) return { gameType: 'story' };
  if (/word/i.test(query)) return { gameType: 'wordplay' };
  return {};
}

// ===========================================
// FTIS V3 ARGUMENT EXTRACTORS (January 2026)
// ===========================================

// Health Domain Extractors

function extractExerciseArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract exercise type
  const exerciseTypes = [
    'run',
    'walk',
    'jog',
    'bike',
    'swim',
    'yoga',
    'workout',
    'gym',
    'lift',
    'weight',
    'cardio',
    'hiit',
  ];
  for (const type of exerciseTypes) {
    if (query.includes(type)) {
      args.exerciseType = type;
      break;
    }
  }

  // Extract duration
  const durationMatch = query.match(/(\d+)\s*(minute|min|hour|hr)/i);
  if (durationMatch) {
    const value = parseInt(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    args.durationMinutes = unit.startsWith('hour') || unit.startsWith('hr') ? value * 60 : value;
  }

  // Extract intensity
  if (/light|easy|gentle/i.test(query)) args.intensity = 'light';
  else if (/moderate|medium/i.test(query)) args.intensity = 'moderate';
  else if (/hard|intense|heavy/i.test(query)) args.intensity = 'vigorous';

  return args;
}

function extractNutritionArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract meal type
  if (/breakfast/i.test(query)) args.mealType = 'breakfast';
  else if (/lunch/i.test(query)) args.mealType = 'lunch';
  else if (/dinner/i.test(query)) args.mealType = 'dinner';
  else if (/snack/i.test(query)) args.mealType = 'snack';

  // Extract what they ate (simple extraction)
  const ateMatch = query.match(/(?:ate|had|eaten|eating)\s+(.+?)(?:\s+for|\s+at|$)/i);
  if (ateMatch) {
    args.food = ateMatch[1].trim();
  }

  return args;
}

function extractWaterArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract quantity
  const glassMatch = query.match(/(\d+)\s*glass/i);
  const ozMatch = query.match(/(\d+)\s*(?:oz|ounce)/i);
  const literMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:liter|litre|l\b)/i);

  if (glassMatch) {
    args.glasses = parseInt(glassMatch[1]);
    args.amountOz = parseInt(glassMatch[1]) * 8; // 8 oz per glass
  } else if (ozMatch) {
    args.amountOz = parseInt(ozMatch[1]);
  } else if (literMatch) {
    args.amountOz = Math.round(parseFloat(literMatch[1]) * 33.8);
  }

  return args;
}

function extractSleepArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract sleep duration
  const hoursMatch = query.match(/(\d+(?:\.\d+)?)\s*hours?/i);
  if (hoursMatch) {
    args.hours = parseFloat(hoursMatch[1]);
  }

  // Extract sleep quality
  if (/great|amazing|wonderful|excellent/i.test(query)) args.quality = 'excellent';
  else if (/good|well|fine/i.test(query)) args.quality = 'good';
  else if (/ok|okay|alright|decent/i.test(query)) args.quality = 'fair';
  else if (/bad|poor|terrible|awful/i.test(query)) args.quality = 'poor';

  return args;
}

// Finance Domain Extractors

function extractBudgetArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract category
  const categories = [
    'food',
    'groceries',
    'entertainment',
    'transport',
    'transportation',
    'bills',
    'utilities',
    'shopping',
    'travel',
  ];
  for (const cat of categories) {
    if (query.includes(cat)) {
      args.category = cat;
      break;
    }
  }

  // Extract amount
  const amountMatch = query.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (amountMatch) {
    args.amount = parseFloat(amountMatch[1].replace(',', ''));
  }

  // Extract time period
  if (/week/i.test(query)) args.period = 'weekly';
  else if (/month/i.test(query)) args.period = 'monthly';
  else if (/year/i.test(query)) args.period = 'yearly';

  return args;
}

function extractBillsArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract bill type
  const billTypes = [
    'rent',
    'mortgage',
    'electric',
    'electricity',
    'gas',
    'water',
    'internet',
    'phone',
    'insurance',
    'credit card',
    'loan',
  ];
  for (const bill of billTypes) {
    if (query.includes(bill)) {
      args.billType = bill;
      break;
    }
  }

  // Extract amount
  const amountMatch = query.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (amountMatch) {
    args.amount = parseFloat(amountMatch[1].replace(',', ''));
  }

  return args;
}

// CEO Coaching Domain Extractors

function extractPrioritiesArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Check for action type
  if (/add|set|create/i.test(query)) args.action = 'add';
  else if (/list|show|what/i.test(query)) args.action = 'list';
  else if (/complete|done|finish/i.test(query)) args.action = 'complete';
  else if (/remove|delete|clear/i.test(query)) args.action = 'remove';

  // Extract priority content (after common verbs)
  const contentMatch = query.match(/(?:add|set|create|priority is)\s+(.+)/i);
  if (contentMatch) {
    args.content = contentMatch[1].trim();
  }

  return args;
}

function extractJournalArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract the journal content (everything after common prefixes)
  const contentMatch = query.match(/(?:journal|write|note|log|record|add)\s+(?:that\s+)?(.+)/i);
  if (contentMatch) {
    args.content = contentMatch[1].trim();
  }

  return args;
}

function extractGratitudeArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract what they're grateful for
  const gratefulMatch = query.match(
    /(?:grateful for|thankful for|appreciate|gratitude for)\s+(.+)/i
  );
  if (gratefulMatch) {
    args.content = gratefulMatch[1].trim();
  }

  return args;
}

// Travel Domain Extractors

function extractTravelPlanArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract destination
  const toMatch = query.match(/(?:to|visit|going to|trip to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (toMatch) {
    args.destination = toMatch[1];
  }

  // Extract dates
  const dateMatch = query.match(/(?:on|in|for|from)\s+(\w+\s+\d+|\d+\/\d+)/i);
  if (dateMatch) {
    args.date = dateMatch[1];
  }

  // Extract duration
  const durationMatch = query.match(/(\d+)\s*(?:day|night|week)/i);
  if (durationMatch) {
    args.duration = durationMatch[0];
  }

  return args;
}

function extractFlightArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract origin
  const fromMatch = query.match(/(?:from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (fromMatch) {
    args.origin = fromMatch[1];
  }

  // Extract destination
  const toMatch = query.match(/(?:to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (toMatch) {
    args.destination = toMatch[1];
  }

  // Extract date
  const dateMatch = query.match(/(?:on|for)\s+(\w+\s+\d+|\d+\/\d+)/i);
  if (dateMatch) {
    args.date = dateMatch[1];
  }

  return args;
}

function extractDirectionsArgs(query: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Extract destination
  const toMatch = query.match(
    /(?:to|directions to|how to get to|way to|route to)\s+(.+?)(?:\s+from|$)/i
  );
  if (toMatch) {
    args.destination = toMatch[1].trim();
  }

  // Extract origin
  const fromMatch = query.match(/(?:from)\s+(.+?)(?:\s+to|$)/i);
  if (fromMatch) {
    args.origin = fromMatch[1].trim();
  }

  // Extract mode
  if (/walk/i.test(query)) args.mode = 'walking';
  else if (/drive|car/i.test(query)) args.mode = 'driving';
  else if (/transit|bus|train|subway/i.test(query)) args.mode = 'transit';
  else if (/bike|bicycle/i.test(query)) args.mode = 'bicycling';

  return args;
}

// ============================================================================
// DIRECT EXECUTION
// ============================================================================

/**
 * Execute a tool directly based on FTIS V2 classification.
 *
 * This bypasses the LLM for tool selection - we've already classified
 * the intent with 93% accuracy using our ONNX models.
 */
export async function executeDirectFromClassification(
  classification: ClassificationResult,
  query: string,
  context: ExecutionContext
): Promise<DirectExecutionResult> {
  const startTime = Date.now();

  try {
    // Extract arguments from the query
    const { toolId, args } = extractArguments(
      query,
      classification.fineCategory,
      classification.toolIds
    );

    // FIX (Jan 2026): Merge userLocation into args for weather when no location in query
    // extractWeatherArgs() returns {} when user says "what's the weather?" without a location.
    // The userLocation from IP geo is in context but wasn't being passed to the tool.
    if (classification.fineCategory === 'weather' && !args.location && context.userLocation?.city) {
      args.location = context.userLocation.regionCode
        ? `${context.userLocation.city}, ${context.userLocation.regionCode}`
        : context.userLocation.city;
      log.debug(
        { location: args.location, source: 'IP_GEO', trace: 'FTIS_V2_WEATHER_LOCATION' },
        `📍 Weather: Using IP-detected location: ${args.location}`
      );
    }

    // Use effective confidence in logging (accounts for boundary detection + calibration)
    const routingConfidence =
      classification.effectiveConfidence ?? classification.combinedConfidence;

    log.info(
      {
        toolId,
        fineCategory: classification.fineCategory,
        confidence: routingConfidence,
        rawConfidence: classification.combinedConfidence,
        isOpenIntent: classification.isOpenIntent,
        args,
        trace: 'FTIS_V2_DIRECT_EXEC',
      },
      `🎯 FTIS V2 Direct Execution: ${toolId}`
    );

    // Import and use the domain bridge for execution
    const { hasDomainMapping, getDomainToolId } =
      await import('../semantic-router/domain-bridge.js');

    // Translate semantic tool ID to domain tool ID
    // CRITICAL FIX (Jan 2026): We must ALWAYS translate the tool ID, not just check if mapping exists
    let actualToolId = toolId;
    if (hasDomainMapping(toolId)) {
      // Translate semantic ID (spotify_play) to domain ID (playMusic)
      actualToolId = getDomainToolId(toolId) || toolId;
      log.debug(
        { originalId: toolId, translatedId: actualToolId, trace: 'FTIS_V2_TRANSLATE' },
        `🔄 Translated tool ID: ${toolId} → ${actualToolId}`
      );
    } else if (hasDomainMapping(classification.fineCategory)) {
      // Fallback: try the fine category as the semantic ID
      actualToolId = getDomainToolId(classification.fineCategory) || classification.fineCategory;
      log.debug(
        {
          originalId: classification.fineCategory,
          translatedId: actualToolId,
          trace: 'FTIS_V2_TRANSLATE',
        },
        `🔄 Translated category: ${classification.fineCategory} → ${actualToolId}`
      );
    } else {
      // No mapping found - fall back to LLM
      return {
        success: false,
        toolId,
        naturalResponse: `I understood you wanted ${classification.fineCategory}, but I couldn't find the right tool.`,
        error: `No domain mapping for ${toolId} or ${classification.fineCategory}`,
        durationMs: Date.now() - startTime,
        bypassLLM: false, // Fall back to LLM
      };
    }

    // Execute the tool using the tool registry directly
    const { toolRegistry } = await import('../registry/index.js');
    const toolDef = toolRegistry.get(actualToolId);

    if (!toolDef) {
      return {
        success: false,
        toolId: actualToolId,
        naturalResponse: `Tool ${actualToolId} not found.`,
        error: `Tool not registered: ${actualToolId}`,
        durationMs: Date.now() - startTime,
        bypassLLM: false,
      };
    }

    // Create the tool instance with minimal context
    const toolContext = {
      userId: context.userId,
      sessionId: context.sessionId,
      agentId: context.personaId || 'ferni',
      agentDisplayName: context.personaId || 'Ferni',
      userLocation: context.userLocation,
    };

    const tool = toolDef.create(toolContext);

    // Execute the tool
    const result = await tool.execute(args);

    // Format the result for natural response
    let naturalResponse = 'Done!';
    if (typeof result === 'string') {
      naturalResponse = result;
    } else if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      naturalResponse =
        (r.message as string) ||
        (r.response as string) ||
        (r.result as string) ||
        (r.naturalResponse as string) ||
        'Done!';
    }

    return {
      success: true,
      toolId: actualToolId,
      naturalResponse: naturalResponse || `Done!`,
      rawResult: result,
      durationMs: Date.now() - startTime,
      bypassLLM: true,
    };
  } catch (error) {
    log.error(
      { error: String(error), classification, trace: 'FTIS_V2_EXEC_ERROR' },
      'FTIS V2 direct execution failed'
    );

    return {
      success: false,
      toolId: classification.toolIds[0] || classification.fineCategory,
      naturalResponse: "Hmm, that didn't work. Want me to try something else?",
      error: String(error),
      durationMs: Date.now() - startTime,
      bypassLLM: false, // Fall back to LLM
    };
  }
}

/**
 * Format execution result for injection into LLM context.
 */
export function formatResultForLLM(result: DirectExecutionResult): string {
  if (result.success) {
    return [
      `[TOOL_RESULT: ${result.toolId}]`,
      `Status: SUCCESS`,
      `Result: ${result.naturalResponse}`,
      ``,
      `[RESPOND NATURALLY to this result. Be brief and conversational.]`,
    ].join('\n');
  }

  return [
    `[TOOL_RESULT: ${result.toolId}]`,
    `Status: FAILED`,
    `Error: ${result.error || 'Unknown error'}`,
    ``,
    `[ACKNOWLEDGE warmly that something didn't work. Offer to help differently.]`,
  ].join('\n');
}

// ============================================================================
// CONFIDENCE THRESHOLD
// ============================================================================

/**
 * Minimum confidence for direct execution.
 * Below this, we add a tool hint to the LLM instead.
 */
export const DIRECT_EXECUTION_THRESHOLD = 0.85;

/**
 * Check if classification confidence is high enough for direct execution.
 */
export function shouldExecuteDirectly(classification: ClassificationResult): boolean {
  // Don't execute conversation category
  if (classification.fineCategory === 'conversation') {
    return false;
  }

  // Don't execute if classifier detected open intent (query outside known class boundaries)
  if (classification.isOpenIntent === true) {
    return false;
  }

  // CRITICAL: Use effectiveConfidence, NOT combinedConfidence!
  // effectiveConfidence accounts for boundary detection and calibration.
  // combinedConfidence is the raw ONNX output which can be overconfident.
  const routingConfidence = classification.effectiveConfidence ?? classification.combinedConfidence;

  return routingConfidence >= DIRECT_EXECUTION_THRESHOLD;
}
