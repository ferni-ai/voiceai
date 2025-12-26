/**
 * Function Call Format - Single Source of Truth
 *
 * ⚠️ CRITICAL: This file defines the EXACT format that Gemini must output
 * for function calls. Changes here MUST be synchronized with:
 *
 * 1. src/personas/bundles/shared/function-calling-base.md (prompt instructions)
 * 2. src/personas/bundles/{persona}/identity/function-calling-specialty.md (persona tools)
 * 3. src/agents/shared/tool-call-sanitizer.ts (detection patterns)
 * 4. src/agents/shared/json-function-executor.ts (execution routing)
 *
 * See docs/architecture/FUNCTION-CALLING-SYSTEM.md for full documentation.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'function-call-format' });

// ============================================================================
// FORMAT SPECIFICATION
// ============================================================================

/**
 * The exact JSON format Gemini must output for function calls.
 *
 * Format: {"fn":"<toolName>","args":{<params>}}
 *
 * @example
 * {"fn":"playMusic","args":{"query":"jazz"}}
 * {"fn":"getNews","args":{"topic":"technology"}}
 * {"fn":"handoffToMaya","args":{"reason":"User wants habit coaching"}}
 */
export interface FunctionCallFormat {
  /** Tool name (camelCase, must match registered tool) */
  fn: string;
  /** Tool arguments (key-value pairs) */
  args: Record<string, unknown>;
}

/**
 * Regex pattern to detect JSON function calls in text.
 *
 * Matches: {"fn":"toolName","args":{...}}
 * Also handles whitespace variations and markdown code blocks.
 */
export const JSON_FUNCTION_CALL_PATTERN =
  /\{\s*"?fn"?\s*:\s*"(\w+)"\s*,\s*"?args"?\s*:\s*(\{[^}]*\})\s*\}/i;

/**
 * Looser pattern for split/chunked JSON (streaming context).
 */
export const JSON_FUNCTION_CALL_LOOSE_PATTERN = /"fn"\s*:\s*"(\w+)".*"args"\s*:\s*(\{[^}]*\})/is;

/**
 * Pattern for JSON wrapped in markdown code blocks.
 */
export const MARKDOWN_WRAPPED_JSON_PATTERN = /```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/i;

// ============================================================================
// TOOL REGISTRY (for validation)
// ============================================================================

/**
 * All registered tool names that can be called via JSON format.
 *
 * IMPORTANT: When adding a new tool, add it here AND to:
 * - tool-call-sanitizer.ts TOOL_NAME_PATTERNS
 * - json-function-executor.ts routeToTool()
 * - function-calling-base.md or function-calling-specialty.md
 */
export const REGISTERED_TOOLS = [
  // Music (unified API - use musicControl for pause/resume/stop/skip/volume)
  'playMusic',
  'musicControl',
  'musicInfo',
  'searchAppleMusic',
  // Note: Legacy names (skipMusic, nextSong, pauseMusic, resumeMusic, stopMusic) 
  // are handled by music-executor.ts for backward compatibility but not advertised here

  // Memory (SUPERHUMAN - semantic embeddings + temporal awareness)
  'rememberAboutUser',
  'recallFromMemory',
  'updateMemory',
  'forgetMemory',
  'getRelationshipSummary',
  'reinforceMemory',

  // Handoffs
  'handoffToFerni',
  'handoffToMaya',
  'handoffToAlex',
  'handoffToPeter',
  'handoffToJordan',
  'handoffToNayan',

  // Information
  'getWeather',
  'getNews',
  'getCurrentTime',

  // Smart Home
  'controlLight',
  'setThermostat',
  'activateScene',
  'controlLock',
  'getHomeStatus',

  // Productivity
  'addTask',
  'completeTask',
  'getTasks',
  'saveNote',
  'getNotes',
  'journal',
  'createHabit',
  'logHabitCompletion',
  'getHabits',
  'shoppingList',
  'addBill',
  'payBill',
  'getBills',
  'trackPackage',
  'getPackages',
  'searchFlights',
  'searchHotels',
  'planTrip',
  'scheduleReminder',
  'getCalendarToday',
  'createCalendarEvent',
  'manageMedication',
  'medicationSchedule',

  // Voice Memos
  'saveVoiceMemo',
  'listVoiceMemos',
  'recallVoiceMemo',
  'deleteVoiceMemo',
  'searchVoiceMemos',

  // SMS / Text Messages
  'readSMS',
  'checkNewMessages',
  'searchMessages',

  // Telephony (phone calls)
  'callOnBehalf',  // Call someone on behalf of the user (mom, doctor, restaurant)

  // Wellness
  'getCrisisResources',
  'groundingExercise',
  'logMood',

  // Games (Ferni specialty)
  'startGame',
  'submitGameAnswer',
  'getGameHint',
  'skipGameRound',
  'endGame',
  'getGameStatus',
  'suggestGame',
  'startTextGame',
  'makeTextGameMove',
  'getTextGameBoard',
  'endTextGame',

  // Engagement Challenges
  'inboxZeroChallenge',
  'sundayPrepGame',
  'compoundInterestGame',

  // Wisdom
  'paradoxOfTheDay',
  'questionBeneath',
  'lifePortfolioReview',

  // Calendar
  'createAppointment',
  'manageAppointment',

  // Communication
  'sendMessage',
  'draftMessage',
  'analyzeMessage',

  // Market
  'getMarketSummary',

  // Behavior
  'shiftMode',
  'processing',
  'holdSpace',

  // Utility
  'calculateTip',
  'wrapUpConversation',

  // Scheduling (scheduled messages, calls, emails)
  'scheduleMessage',
  'scheduleText',
  'scheduleCall',
  'scheduleEmail',
  'sendMessageNow',
  'sendTextNow',
  'listScheduled',
  'getScheduled',
  'cancelScheduled',
  'saveContact',
  'saveContactInfo',
  'addContact',

  // Concierge (AI-powered outreach)
  'requestHotelQuotes',
  'makeRestaurantReservation',
  'scheduleHealthcareAppointment',
  'getServiceQuotes',
  'checkConciergeStatus',
] as const;

export type RegisteredToolName = (typeof REGISTERED_TOOLS)[number];

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a tool name is registered.
 */
export function isRegisteredTool(fn: string): fn is RegisteredToolName {
  return REGISTERED_TOOLS.some((tool) => tool.toLowerCase() === fn.toLowerCase());
}

/**
 * Validate a function call object.
 *
 * @returns Error message if invalid, null if valid
 */
export function validateFunctionCall(call: unknown): string | null {
  if (!call || typeof call !== 'object') {
    return 'Function call must be an object';
  }

  const obj = call as Record<string, unknown>;

  if (typeof obj.fn !== 'string') {
    return 'Function call must have "fn" string property';
  }

  if (!obj.args || typeof obj.args !== 'object') {
    return 'Function call must have "args" object property';
  }

  if (!isRegisteredTool(obj.fn)) {
    return `Unknown tool: "${obj.fn}". Add it to REGISTERED_TOOLS if this is a new tool.`;
  }

  return null; // Valid
}

/**
 * Parse and validate JSON from text.
 *
 * @returns Parsed function call or null if invalid
 */
export function parseAndValidateFunctionCall(text: string): FunctionCallFormat | null {
  // Strip markdown if present
  let cleanText = text;
  const markdownMatch = text.match(MARKDOWN_WRAPPED_JSON_PATTERN);
  if (markdownMatch) {
    cleanText = markdownMatch[1];
  }

  // Try to parse JSON
  const jsonMatch = cleanText.match(JSON_FUNCTION_CALL_PATTERN);
  if (!jsonMatch) {
    // Try loose pattern for streaming
    const looseMatch = cleanText.match(JSON_FUNCTION_CALL_LOOSE_PATTERN);
    if (!looseMatch) return null;

    try {
      const fn = looseMatch[1];
      const args = JSON.parse(looseMatch[2]) as Record<string, unknown>;
      const call = { fn, args };
      const error = validateFunctionCall(call);
      if (error) {
        log.warn({ error }, 'Validation failed');
        return null;
      }
      return call;
    } catch {
      return null;
    }
  }

  try {
    const fn = jsonMatch[1];
    const args = JSON.parse(jsonMatch[2]) as Record<string, unknown>;
    const call = { fn, args };
    const error = validateFunctionCall(call);
    if (error) {
      log.warn({ error }, 'Validation failed');
      return null;
    }
    return call;
  } catch {
    return null;
  }
}

// ============================================================================
// PROMPT GENERATION HELPERS
// ============================================================================

/**
 * Generate the JSON format example for a tool.
 *
 * Use this to ensure consistent formatting in prompts.
 */
export function formatToolExample(fn: string, args: Record<string, string>): string {
  return JSON.stringify({ fn, args });
}

/**
 * Generate a tool documentation block for system prompts.
 *
 * @example
 * generateToolDoc('playMusic', 'Play music', { query: 'search term' })
 * // Returns:
 * // **playMusic** - Play music
 * // ```
 * // {"fn":"playMusic","args":{"query":"search term"}}
 * // ```
 */
export function generateToolDoc(
  fn: string,
  description: string,
  exampleArgs: Record<string, string>
): string {
  return `**${fn}** - ${description}
\`\`\`
${formatToolExample(fn, exampleArgs)}
\`\`\``;
}
