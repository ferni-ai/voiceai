/**
 * Tool Fillers - SSML Pauses During Tool Execution
 *
 * DEPRECATED: Static verbal phrases have been replaced by LLM behavioral guidance.
 * See: src/intelligence/context-builders/dynamic-speech-guidance.ts
 *
 * This module now only provides SSML pause tags (no spoken content).
 * The LLM will generate natural speech based on context, not static phrases.
 *
 * @module tool-fillers
 */

import { breakTag } from '../ssml/cartesia.js';
import { normalizePersonaId } from './persona-phrases.js';

// ============================================================================
// DEPRECATED: STATIC PHRASE POOLS
// ============================================================================
//
// Previously, this file contained static phrases like:
// - "Let me check your calendar..."
// - "One moment..."
// - "Looking that up..."
//
// These have been REMOVED because:
// 1. They sound robotic when repeated
// 2. The LLM can generate better, contextual speech
// 3. Behavioral guidance in dynamic-speech-guidance.ts teaches the LLM HOW to behave
//
// Now we only provide silent pauses (SSML break tags) to prevent dead air.
// ============================================================================

/**
 * Tool fillers now only return SSML pauses (no spoken content).
 * The LLM handles natural speech via behavioral guidance.
 */
export const TOOL_FILLERS: Record<string, Record<string, string[]>> = {
  // All categories now return only pauses - no spoken phrases
  calendar: {
    ferni: [`${breakTag('300ms')}`],
    'nayan-patel': [`${breakTag('350ms')}`],
    'peter-john': [`${breakTag('250ms')}`],
    'maya-santos': [`${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('250ms')}`],
    'alex-chen': [`${breakTag('200ms')}`],
  },

  search: {
    ferni: [`${breakTag('300ms')}`],
    'nayan-patel': [`${breakTag('400ms')}`],
    'peter-john': [`${breakTag('250ms')}`],
    'maya-santos': [`${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('250ms')}`],
    'alex-chen': [`${breakTag('200ms')}`],
  },

  weather: {
    ferni: [`${breakTag('300ms')}`],
    'nayan-patel': [`${breakTag('350ms')}`],
    'peter-john': [`${breakTag('250ms')}`],
    'maya-santos': [`${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('250ms')}`],
    'alex-chen': [`${breakTag('200ms')}`],
  },

  music: {
    ferni: [`${breakTag('300ms')}`],
    'nayan-patel': [`${breakTag('400ms')}`],
    'peter-john': [`${breakTag('300ms')}`],
    'maya-santos': [`${breakTag('350ms')}`],
    'jordan-taylor': [`${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('200ms')}`],
  },

  news: {
    ferni: [`${breakTag('300ms')}`],
    'nayan-patel': [`${breakTag('400ms')}`],
    'peter-john': [`${breakTag('300ms')}`],
    'maya-santos': [`${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('200ms')}`],
  },

  stocks: {
    ferni: [`${breakTag('300ms')}`],
    'nayan-patel': [`${breakTag('400ms')}`],
    'peter-john': [`${breakTag('300ms')}`],
    'maya-santos': [`${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('200ms')}`],
  },

  memory: {
    ferni: [`${breakTag('350ms')}`],
    'nayan-patel': [`${breakTag('450ms')}`],
    'peter-john': [`${breakTag('350ms')}`],
    'maya-santos': [`${breakTag('350ms')}`],
    'jordan-taylor': [`${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('250ms')}`],
  },

  default: {
    ferni: [`${breakTag('300ms')}`],
    'nayan-patel': [`${breakTag('400ms')}`],
    'peter-john': [`${breakTag('300ms')}`],
    'maya-santos': [`${breakTag('350ms')}`],
    'jordan-taylor': [`${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('200ms')}`],
  },
};

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================

// Add backward compatibility aliases for tool fillers
for (const toolType of Object.keys(TOOL_FILLERS)) {
  const toolFillers = TOOL_FILLERS[toolType];
  // Legacy alias
  if (toolFillers.ferni) {
    toolFillers['jack-b'] = toolFillers.ferni;
  }
  // Short aliases
  if (toolFillers['maya-santos']) {
    toolFillers.maya = toolFillers['maya-santos'];
  }
  if (toolFillers['jordan-taylor']) {
    toolFillers.jordan = toolFillers['jordan-taylor'];
  }
  if (toolFillers['alex-chen']) {
    toolFillers.alex = toolFillers['alex-chen'];
  }
}

// ============================================================================
// TOOL CATEGORY MAPPING
// ============================================================================

/**
 * Map tool names to filler categories
 * These patterns match common tool names to the appropriate filler category
 */
const TOOL_CATEGORY_MAP: Record<string, string[]> = {
  calendar: ['calendar', 'schedule', 'event', 'meeting', 'reminder', 'gcal', 'appointment'],
  search: ['search', 'lookup', 'find', 'web', 'browse', 'query'],
  weather: ['weather', 'forecast', 'temperature'],
  music: ['music', 'play', 'song', 'playlist', 'spotify', 'track', 'album'],
  news: ['news', 'headlines', 'current_events'],
  stocks: ['stock', 'market', 'portfolio', 'price', 'finance', 'investment'],
  memory: ['memory', 'recall', 'remember', 'history', 'past'],
};

/**
 * Get the filler category for a tool name
 */
function getToolCategory(toolName: string): string {
  const normalized = toolName.toLowerCase();
  for (const [category, patterns] of Object.entries(TOOL_CATEGORY_MAP)) {
    if (patterns.some((pattern) => normalized.includes(pattern))) {
      return category;
    }
  }
  return 'default';
}

// ============================================================================
// LONG-RUNNING TOOL DETECTION
// ============================================================================

/**
 * Tool name patterns that are considered "long-running" and warrant verbal filler.
 * These typically involve external API calls that can take 1+ seconds.
 */
const LONG_RUNNING_TOOL_PATTERNS = [
  'calendar',
  'search',
  'weather',
  'news',
  'stock',
  'music',
  'play',
  'spotify',
  'web',
  'lookup',
  'gcal',
  'reminder',
  'memory',
  'recall',
];

/**
 * Check if a tool is considered "long-running" and should get a verbal filler
 *
 * @param toolName - The name of the tool being executed
 * @returns true if the tool typically takes >500ms
 */
export function isLongRunningTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return LONG_RUNNING_TOOL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Get verbal filler for a specific tool and persona
 *
 * Use this function when a long-running tool is about to execute.
 * Call session.say() with the returned phrase to prevent dead air.
 *
 * @param toolName - The name of the tool being executed
 * @param personaId - The current persona ID
 * @returns SSML-formatted filler phrase, or null if not a long-running tool
 *
 * @example
 * const filler = getToolFiller('getCalendarEvents', 'ferni');
 * if (filler) {
 *   session.say(filler, { allowInterruptions: true });
 * }
 */
export function getToolFiller(toolName: string, personaId: string): string | null {
  if (!isLongRunningTool(toolName)) {
    return null;
  }

  const normalized = normalizePersonaId(personaId);
  const category = getToolCategory(toolName);
  const categoryFillers = TOOL_FILLERS[category] || TOOL_FILLERS.default;
  const personaFillers = categoryFillers[normalized] || categoryFillers.ferni;

  return personaFillers[Math.floor(Math.random() * personaFillers.length)];
}

export default {
  TOOL_FILLERS,
  getToolFiller,
  isLongRunningTool,
};
