/**
 * Function Call Format - Single Source of Truth
 *
 * ⚠️ CRITICAL: This file defines the EXACT format that Gemini must output
 * for function calls.
 *
 * TOOL REGISTRATION (Two Sources):
 * 1. REGISTERED_TOOLS (this file) - Core tools with specialized executors
 *    - Music, Memory, Handoffs, Productivity, etc.
 *    - ~78 tools that need custom logic
 *
 * 2. DOMAIN_TOOL_IDS (domain-tool-ids.generated.ts) - Auto-discovered domain tools
 *    - All tools in src/tools/domains/
 *    - ~697 tools across 95 domains
 *    - Regenerate with: npx tsx scripts/generate-tool-patterns.ts
 *
 * ADDING NEW TOOLS:
 * - Domain tools: Just create in src/tools/domains/{domain}/ and regenerate
 * - Core tools: Add to REGISTERED_TOOLS below
 *
 * See docs/architecture/FUNCTION-CALLING-SYSTEM.md for full documentation.
 */

import { createLogger } from '../../utils/safe-logger.js';
// Auto-generated list of all domain tool IDs (697 tools across 95 domains)
import { DOMAIN_TOOL_IDS } from './domain-tool-ids.generated.js';

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
 * CORE tools that are NOT in domain folders.
 *
 * These are manually registered because they:
 * - Have specialized executor logic (music, memory, handoffs)
 * - Are utility/pseudo-tools not tied to a domain
 * - Are legacy tools maintained for backward compatibility
 *
 * NOTE: Domain tools (697+ across 95 domains) are auto-discovered via
 * DOMAIN_TOOL_IDS from domain-tool-ids.generated.ts. No need to add
 * domain tools here - just create them in src/tools/domains/{domain}/.
 */
export const REGISTERED_TOOLS = [
  // ============================================================================
  // MUSIC (specialized executor with Apple Music/Spotify integration)
  // ============================================================================
  'playMusic',
  'searchAppleMusic',
  // Note: musicControl, musicInfo are in domains but executor has special logic

  // ============================================================================
  // MEMORY (SUPERHUMAN - specialized executor with semantic embeddings)
  // ============================================================================
  'rememberAboutUser',
  'recallFromMemory',
  'updateMemory',
  'forgetMemory',
  'getRelationshipSummary',
  'reinforceMemory',

  // ============================================================================
  // HANDOFFS (specialized executor for persona transitions)
  // ============================================================================
  'handoffToFerni',
  'handoffToMaya',
  'handoffToAlex',
  'handoffToPeter',
  'handoffToJordan',
  'handoffToNayan',

  // ============================================================================
  // PRODUCTIVITY (specialized executor with cross-tool orchestration)
  // ============================================================================
  // Tasks
  'addTask',
  'completeTask',
  'getTasks',
  'deleteTask',
  // Goals
  'addGoal',
  'updateGoal',
  'getGoals',
  // Timers
  'setTimer',
  'getTimer',
  'cancelTimer',
  // Reminders
  'cancelReminder',
  'getReminders',
  // Notes
  'addNote',
  'saveNote',
  'getNotes',
  'searchNotes',
  // Journal
  'addJournal',
  'getJournals',
  'journal',
  // Habits
  'createHabit',
  'logHabitCompletion',
  'getHabits',
  // Bills & Packages
  'shoppingList',
  'addBill',
  'payBill',
  'getBills',
  'trackPackage',
  'getPackages',
  // Calendar
  'getCalendarToday',
  'createCalendarEvent',
  'createAppointment',
  // Medication
  'manageMedication',
  'medicationSchedule',

  // ============================================================================
  // VOICE MEMOS (not in domains)
  // ============================================================================
  'saveVoiceMemo',
  'listVoiceMemos',
  'recallVoiceMemo',
  'deleteVoiceMemo',
  'searchVoiceMemos',

  // ============================================================================
  // SMS / MESSAGES (not in domains)
  // ============================================================================
  'readSMS',
  'checkNewMessages',
  'searchMessages',

  // ============================================================================
  // WELLNESS (getCrisisResources not in domains)
  // ============================================================================
  'getCrisisResources',
  'logMood',

  // ============================================================================
  // ENGAGEMENT CHALLENGES (not in domains)
  // ============================================================================
  'inboxZeroChallenge',
  'sundayPrepGame',
  'compoundInterestGame',

  // ============================================================================
  // WISDOM (not in domains)
  // ============================================================================
  'paradoxOfTheDay',
  'questionBeneath',
  'lifePortfolioReview',

  // ============================================================================
  // COMMUNICATION (sendMessage, draftMessage not in domains)
  // ============================================================================
  'sendMessage',
  'draftMessage',

  // ============================================================================
  // OUTREACH (telephony-executor handles these - not in auto-discovered domains)
  // ============================================================================
  'reachOut', // Unified outreach - single person
  'multiOutreach', // Multi-person outreach - multiple people with mixed channels
  'callOnBehalf',
  'callAndConverse',
  'makePhoneCall',

  // ============================================================================
  // MARKET (not in domains)
  // ============================================================================
  'getMarketSummary',

  // ============================================================================
  // UTILITY (not in domains)
  // ============================================================================
  'calculateTip',
  'wrapUpConversation',
  'getCurrentTime',
  'getHomeStatus',

  // ============================================================================
  // SCHEDULING (specialized executor - scheduleText, sendTextNow, etc.)
  // ============================================================================
  'scheduleText',
  'sendTextNow',
  'getScheduled',
  'saveContact',
  'addContact',

  // ============================================================================
  // LANGUAGE/SETTINGS (not in domains)
  // ============================================================================
  'setSpokenLanguage',
  'listSupportedLanguages',
  'getCurrentLanguage',
] as const;

export type RegisteredToolName = (typeof REGISTERED_TOOLS)[number];

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a tool name is registered.
 * Checks both manually-registered tools AND auto-generated domain tools.
 */
export function isRegisteredTool(fn: string): boolean {
  const fnLower = fn.toLowerCase();
  // Check manually registered tools
  if (REGISTERED_TOOLS.some((tool) => tool.toLowerCase() === fnLower)) {
    return true;
  }
  // Check auto-generated domain tools (697 tools across 95 domains)
  if (DOMAIN_TOOL_IDS.some((tool) => tool.toLowerCase() === fnLower)) {
    return true;
  }
  return false;
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
    return `Unknown tool: "${obj.fn}". Add to REGISTERED_TOOLS or create in src/tools/domains/.`;
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
