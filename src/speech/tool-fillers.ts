/**
 * Tool Fillers - Verbal feedback during tool execution
 *
 * Tool fillers are spoken BEFORE long-running tools execute to prevent dead air.
 * These should be SHORT and tool-appropriate - not generic "please wait" messages.
 *
 * @module tool-fillers
 */

import { breakTag } from '../ssml/cartesia.js';
import { normalizePersonaId } from './persona-phrases.js';

// ============================================================================
// TOOL FILLER DEFINITIONS
// ============================================================================

/**
 * Tool fillers organized by tool category and persona.
 * Each entry is an array of possible phrases (randomly selected at runtime).
 */
export const TOOL_FILLERS: Record<string, Record<string, string[]>> = {
  // Calendar/scheduling tools
  calendar: {
    ferni: [
      `${breakTag('200ms')}Let me check your calendar...${breakTag('300ms')}`,
      `${breakTag('200ms')}Looking at your schedule...${breakTag('300ms')}`,
      `${breakTag('150ms')}One sec, checking that...${breakTag('300ms')}`,
    ],
    'nayan-patel': [
      `${breakTag('250ms')}Let me see what your schedule looks like...${breakTag('350ms')}`,
      `${breakTag('250ms')}Checking your calendar...${breakTag('350ms')}`,
    ],
    'peter-john': [
      `${breakTag('150ms')}Let me pull that up!${breakTag('300ms')}`,
      `${breakTag('150ms')}Checking your schedule...${breakTag('250ms')}`,
    ],
    'maya-santos': [
      `${breakTag('200ms')}Let me check on that...${breakTag('350ms')}`,
      `${breakTag('200ms')}Looking at your calendar...${breakTag('300ms')}`,
    ],
    'jordan-taylor': [
      `${breakTag('150ms')}Ooh let me check!${breakTag('300ms')}`,
      `${breakTag('150ms')}Looking at your schedule...${breakTag('250ms')}`,
    ],
    'alex-chen': [
      `${breakTag('150ms')}Checking...${breakTag('250ms')}`,
      `${breakTag('150ms')}Let me pull that up...${breakTag('250ms')}`,
    ],
  },

  // Search/lookup tools
  search: {
    ferni: [
      `${breakTag('200ms')}Let me look that up...${breakTag('300ms')}`,
      `${breakTag('200ms')}Searching for that...${breakTag('300ms')}`,
    ],
    'nayan-patel': [
      `${breakTag('250ms')}Let me find that for you...${breakTag('400ms')}`,
      `${breakTag('250ms')}Looking into that...${breakTag('350ms')}`,
    ],
    'peter-john': [
      `${breakTag('150ms')}Ooh let me dig into this!${breakTag('300ms')}`,
      `${breakTag('150ms')}Researching...${breakTag('250ms')}`,
    ],
    'maya-santos': [
      `${breakTag('200ms')}Let me find that...${breakTag('300ms')}`,
      `${breakTag('200ms')}Looking that up...${breakTag('300ms')}`,
    ],
    'jordan-taylor': [
      `${breakTag('150ms')}On it!${breakTag('300ms')}`,
      `${breakTag('150ms')}Looking that up...${breakTag('250ms')}`,
    ],
    'alex-chen': [
      `${breakTag('150ms')}Searching...${breakTag('200ms')}`,
      `${breakTag('150ms')}Looking into it...${breakTag('200ms')}`,
    ],
  },

  // Weather tools
  weather: {
    ferni: [
      `${breakTag('200ms')}Checking the weather...${breakTag('300ms')}`,
      `${breakTag('200ms')}Let me see what it's like out there...${breakTag('350ms')}`,
    ],
    'nayan-patel': [`${breakTag('250ms')}Let me check the weather for you...${breakTag('350ms')}`],
    'peter-john': [`${breakTag('150ms')}Let me check!${breakTag('300ms')}`],
    'maya-santos': [`${breakTag('200ms')}Checking the forecast...${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('150ms')}Let me see!${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('150ms')}Checking...${breakTag('200ms')}`],
  },

  // Music tools
  music: {
    ferni: [
      `${breakTag('200ms')}Finding something good...${breakTag('300ms')}`,
      `${breakTag('200ms')}Let me find the right vibe...${breakTag('350ms')}`,
    ],
    'nayan-patel': [`${breakTag('250ms')}Let me find something fitting...${breakTag('400ms')}`],
    'peter-john': [
      `${breakTag('150ms')}Oh I know just the thing!${breakTag('300ms')}`,
      `${breakTag('150ms')}Let me find something great...${breakTag('300ms')}`,
    ],
    'maya-santos': [`${breakTag('200ms')}Let me find the right music...${breakTag('350ms')}`],
    'jordan-taylor': [`${breakTag('150ms')}Ooh let me pick something!${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('150ms')}Queuing that up...${breakTag('200ms')}`],
  },

  // News tools
  news: {
    ferni: [
      `${breakTag('200ms')}Checking the news...${breakTag('300ms')}`,
      `${breakTag('200ms')}Let me see what's happening...${breakTag('350ms')}`,
    ],
    'nayan-patel': [`${breakTag('250ms')}Let me see the latest...${breakTag('400ms')}`],
    'peter-john': [`${breakTag('150ms')}Let me check the news!${breakTag('300ms')}`],
    'maya-santos': [`${breakTag('200ms')}Checking on that...${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('150ms')}Let me see!${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('150ms')}Checking...${breakTag('200ms')}`],
  },

  // Stock/financial tools
  stocks: {
    ferni: [
      `${breakTag('200ms')}Let me check that...${breakTag('300ms')}`,
      `${breakTag('200ms')}Looking up those numbers...${breakTag('350ms')}`,
    ],
    'nayan-patel': [
      `${breakTag('250ms')}Let me check the markets...${breakTag('400ms')}`,
      `${breakTag('250ms')}Looking at those numbers...${breakTag('350ms')}`,
    ],
    'peter-john': [
      `${breakTag('150ms')}Let me dig into this!${breakTag('300ms')}`,
      `${breakTag('150ms')}Checking the data...${breakTag('300ms')}`,
    ],
    'maya-santos': [`${breakTag('200ms')}Let me look that up...${breakTag('300ms')}`],
    'jordan-taylor': [`${breakTag('150ms')}Checking...${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('150ms')}Pulling that data...${breakTag('200ms')}`],
  },

  // Memory/recall tools
  memory: {
    ferni: [
      `${breakTag('200ms')}Let me think back...${breakTag('350ms')}`,
      `${breakTag('200ms')}I remember you mentioned...${breakTag('300ms')}`,
    ],
    'nayan-patel': [`${breakTag('300ms')}Reflecting on what you've shared...${breakTag('450ms')}`],
    'peter-john': [`${breakTag('200ms')}Oh, you know what...${breakTag('350ms')}`],
    'maya-santos': [`${breakTag('250ms')}I recall...${breakTag('350ms')}`],
    'jordan-taylor': [`${breakTag('200ms')}Oh yeah!${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('150ms')}Let me recall...${breakTag('250ms')}`],
  },

  // Default for unknown tools
  default: {
    ferni: [
      `${breakTag('200ms')}One moment...${breakTag('300ms')}`,
      `${breakTag('200ms')}Let me check on that...${breakTag('350ms')}`,
    ],
    'nayan-patel': [`${breakTag('250ms')}Give me a moment...${breakTag('400ms')}`],
    'peter-john': [`${breakTag('150ms')}One sec!${breakTag('300ms')}`],
    'maya-santos': [`${breakTag('200ms')}Just a moment...${breakTag('350ms')}`],
    'jordan-taylor': [`${breakTag('150ms')}Hang on!${breakTag('300ms')}`],
    'alex-chen': [`${breakTag('150ms')}One moment...${breakTag('200ms')}`],
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
