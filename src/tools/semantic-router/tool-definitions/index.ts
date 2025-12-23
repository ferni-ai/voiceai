/**
 * Tool Definitions Index
 *
 * Export all semantic tool definitions from this file.
 *
 * @module tools/semantic-router/tool-definitions
 */

export { musicTools, playMusicTool, pauseMusicTool, skipSongTool } from './music.semantic.js';
export { handoffTools, handoffTool, habitHelpTool } from './handoff.semantic.js';

// Add more as they're created:
// export { calendarTools } from './calendar.semantic.js';
// export { weatherTools } from './weather.semantic.js';
// export { memoryTools } from './memory.semantic.js';

import type { SemanticToolDefinition } from '../types.js';
import { musicTools } from './music.semantic.js';
import { handoffTools } from './handoff.semantic.js';

/**
 * All registered tool definitions
 */
export const allToolDefinitions: SemanticToolDefinition[] = [...musicTools, ...handoffTools];
