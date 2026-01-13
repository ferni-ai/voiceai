/**
 * Habits Domain Tools
 *
 * Tools for habit tracking, coaching, and gamification.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: habits
 * TOOLS:
 *   Core: addHabit, logHabit, getHabitStats, getDueHabits
 *   Coaching: assessLifeDomains, createHabitPlan, suggestKeystone, handleSetback
 *   Gamification: getGamificationProfile, awardBadge, getLeaderboard, celebrateStreak
 *
 * MIGRATION NOTE:
 *   New unified tools are available in ./unified-habits.ts
 *   These will eventually replace the legacy wrappers below.
 */
import type { ToolDefinition } from '../../registry/types.js';
import { habitToolDefinitions as unifiedHabitTools } from './unified-habits.js';
declare function getCoreHabitToolDefinitions(): ToolDefinition[];
declare function getCoachingToolDefinitions(): ToolDefinition[];
declare function getGamificationToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getCoreHabitToolDefinitions, getCoachingToolDefinitions, getGamificationToolDefinitions };
export { habitVoiceTools } from './habit-voice-tools.js';
export { createHabitTools } from './habits.js';
export { createHabitCoachingTools } from '../../habit-coaching.js';
export { createGamificationToolsV2 } from './gamification-v2.js';
export { unifiedHabitTools };
export { LIFE_DOMAINS, TENDENCY_STRATEGIES, type HabitFrequency, type HabitCategory, type FourTendency, type EnhancedHabit, } from './unified-habits.js';
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map