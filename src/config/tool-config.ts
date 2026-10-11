/**
 * Centralized Tool Configuration
 *
 * Single source of truth for all tool-related configuration.
 * Eliminates scattered hardcoded limits across the codebase.
 *
 * ## Configuration Options
 *
 * - `maxTools`: Maximum tools to send to LLM (0 = unlimited, semantic router filters)
 * - `useMetaTool`: Use single executeTool instead of 100+ declarations
 * - `metaToolCatalogInPrompt`: Include tool catalog in system prompt
 *
 * ## Environment Variables
 *
 * - `TOOL_LIMIT`: Max tools to send to LLM (default: 0 = unlimited)
 * - `USE_META_TOOL`: Enable meta-tool pattern (default: false)
 * - `META_TOOL_CATALOG_IN_PROMPT`: Include catalog in prompt (default: true)
 *
 * @module config/tool-config
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ToolConfig' });

// ============================================================================
// TYPES
// ============================================================================

export interface ToolConfiguration {
  /**
   * Maximum tools to send to LLM per turn.
   * - 0 = unlimited (semantic router filters, recommended with meta-tool)
   * - 18-50 = typical range for direct tool registration
   * - Higher values can overwhelm Gemini's function calling
   */
  maxTools: number;

  /**
   * Use the Meta-Tool pattern instead of registering 100+ tools.
   * When enabled:
   * - Only ONE tool (`executeTool`) is registered with the LLM
   * - Tool catalog is included in the system prompt
   * - LLM makes a binary decision: "Should I use a tool?"
   * - If yes, specifies which tool via `executeTool(toolName, args)`
   */
  useMetaTool: boolean;

  /**
   * Include the tool catalog in the system prompt.
   * Only relevant when `useMetaTool` is true.
   * When true, the system prompt includes available tool names and descriptions.
   */
  metaToolCatalogInPrompt: boolean;

  /**
   * Use FTIS hierarchical classifier for tool routing.
   * When enabled:
   * - Two-stage ONNX model: Stage 1 classifies domain, Stage 2 classifies meta-tool
   * - Combined confidence = domain_confidence * meta_tool_confidence
   * - Routes by domain first, then filters tools within domain
   * - Falls back to semantic router if models unavailable
   */
  useFtis: boolean;

  /**
   * Confidence threshold for FTIS combined prediction.
   * Tools are loaded from the predicted domain when combined confidence exceeds this threshold.
   */
  ftisThreshold: number;

  /**
   * Essential tools that MUST survive any tool cap.
   * These are prioritized when limiting tools.
   */
  essentialTools: string[];
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Essential tools that MUST survive any tool cap.
 * These are core user-facing features that should always be available.
 */
const DEFAULT_ESSENTIAL_TOOLS = [
  // Music (most common user request)
  'playMusic',
  'musicControl',
  'quickMusic',
  'playMusicInRoom',
  'playSonosMusic',
  'musicInfo',
  'musicProvider',
  // Weather & info
  'getWeather',
  'getWeatherForecast',
  'getNews',
  'searchWeb',
  // Safety (a companion must never lose these to a cap)
  'provideCrisisResources',
  'createSafetyPlan',
  'deEscalateAnxiety',
  'quickCrisisResources',
  'evaluateHumanTransfer',
  'connectToHumanExpert',
  'groundingExercise',
  'breatheWithMe',
  'groundingForTrauma',
  // Memory
  'rememberAboutUser',
  'recallFromMemory',
  'recallPreviousConversation',
  'rememberImportantFact',
  'surfaceRelevantMemory',
  'getRelationshipSummary',
  'quickNote',
  'recallNote',
  // Quick actions (high-frequency)
  'quickAlarm',
  'quickTimer',
  'quickWeather',
  'quickCalendar',
  'quickSmartHome',
  'quickCall',
  'quickText',
  'quickEmail',
  // Tasks & reminders
  'setReminder',
  'getReminders',
  'addTask',
  'getTasks',
  // Habits & coaching
  'createHabit',
  'logHabitCompletion',
  'getHabits',
  'habitCheckIn',
  // Calendar
  'getCalendarToday',
  'createCalendarEvent',
  'getCalendarWeek',
  // Contacts & communication
  'callOnBehalf',
  'getContactInfo',
  // Smart home
  'doNotDisturb',
  // Core context
  'getCurrentContext',
  'getUserContext',
  'whatCanYouDo',
  // Fun
  'tellJoke',
  'getFunFact',
  // The game scorekeeper; only exists with GAME_STATE=on (games/game-state-tool.ts).
  // Without this the first agent's 64-slot cap dropped every games tool.
  'gameState',
  // End call
  'endCall',
];

const DEFAULT_CONFIG: ToolConfiguration = {
  maxTools: 0, // 0 = unlimited, let semantic router filter
  useMetaTool: false, // Default to existing behavior
  metaToolCatalogInPrompt: true, // Include catalog when meta-tool is enabled
  useFtis: false, // FTIS disabled - ONNX classifier adds ~17s latency (use semantic router instead)
  ftisThreshold: 0.7, // Combined confidence = domain * meta-tool
  essentialTools: DEFAULT_ESSENTIAL_TOOLS,
};

// ============================================================================
// CONFIGURATION LOADER
// ============================================================================

let cachedConfig: ToolConfiguration | null = null;

/**
 * Load tool configuration from environment variables.
 *
 * Environment variables:
 * - TOOL_LIMIT: Maximum tools to send to LLM (0 = unlimited)
 * - USE_META_TOOL: Enable meta-tool pattern (true/false)
 * - META_TOOL_CATALOG_IN_PROMPT: Include catalog in prompt (true/false)
 */
export function loadToolConfig(): ToolConfiguration {
  if (cachedConfig) {
    return cachedConfig;
  }

  const { env } = process;

  // Parse boolean helper
  const parseBool = (value: string | undefined, defaultValue: boolean): boolean => {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  };

  // Parse number helper
  const parseNum = (value: string | undefined, defaultValue: number): number => {
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const useMetaTool = parseBool(env.USE_META_TOOL, DEFAULT_CONFIG.useMetaTool);
  if (useMetaTool) {
    log.warn(
      '⚠️ USE_META_TOOL is DEPRECATED and slated for removal — the meta-tool routing ' +
        'strategy has no known production users. Use the semantic router (default) or ' +
        'native function calling instead. See docs/audits/AUDIT-FIXES-2026-07-11.md.'
    );
  }

  cachedConfig = {
    maxTools: parseNum(env.TOOL_LIMIT, DEFAULT_CONFIG.maxTools),
    useMetaTool,
    metaToolCatalogInPrompt: parseBool(
      env.META_TOOL_CATALOG_IN_PROMPT,
      DEFAULT_CONFIG.metaToolCatalogInPrompt
    ),
    useFtis: parseBool(env.FTIS_ENABLED, parseBool(env.USE_FTIS, DEFAULT_CONFIG.useFtis)),
    ftisThreshold: parseNum(env.FTIS_THRESHOLD, DEFAULT_CONFIG.ftisThreshold * 100) / 100,
    essentialTools: DEFAULT_CONFIG.essentialTools,
  };

  // Log configuration on first load
  log.info(
    {
      maxTools: cachedConfig.maxTools,
      useMetaTool: cachedConfig.useMetaTool,
      metaToolCatalogInPrompt: cachedConfig.metaToolCatalogInPrompt,
      useFtis: cachedConfig.useFtis,
      ftisThreshold: cachedConfig.ftisThreshold,
      essentialToolCount: cachedConfig.essentialTools.length,
    },
    `🔧 Tool config loaded: maxTools=${cachedConfig.maxTools}, ` +
      `useMetaTool=${cachedConfig.useMetaTool}, useFtis=${cachedConfig.useFtis}`
  );

  return cachedConfig;
}

/**
 * Get the current tool configuration (loads if not cached)
 */
export function getToolConfig(): ToolConfiguration {
  return loadToolConfig();
}

/**
 * Reset cached configuration (for testing)
 */
export function resetToolConfig(): void {
  cachedConfig = null;
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Check if meta-tool pattern is enabled
 */
export function isMetaToolEnabled(): boolean {
  return getToolConfig().useMetaTool;
}

/**
 * Check if FTIS hierarchical classifier is enabled
 */
export function isFtisEnabled(): boolean {
  return getToolConfig().useFtis;
}

/**
 * Get FTIS combined confidence threshold
 */
export function getFtisThreshold(): number {
  return getToolConfig().ftisThreshold;
}

/**
 * Get maximum tools limit (0 = unlimited)
 */
export function getMaxTools(): number {
  return getToolConfig().maxTools;
}

/**
 * CASCADE_APPEND_ONLY_TOOLS=on: a call's tools only grow, in the order they
 * arrived, so the declarations a request starts with stay the same (Gemini
 * caches a request's prefix). See tool-updater.ts and gemini-declarations.ts.
 */
export function appendOnlyToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CASCADE_APPEND_ONLY_TOOLS === 'on' || staticCoreToolsEnabled(env);
}

/**
 * TOOL_CORE_STATIC=on: every request in a call carries the same tools, the
 * STATIC_CORE_TOOLS the agent has plus the user's teammate tools, in this
 * order. Mid-call topic loads add nothing; findTools reaches the rest and
 * what it finds is appended for the rest of the call (append-only order, so
 * the declarations prefix Gemini cached stays the same).
 *
 * Why (prod + dev logs 2026-10-04..11): requests carried 88 tools (~5.3k of
 * ~10.9k prompt tokens) but prod called 3 distinct tools in 223 turns and 20
 * were called across prod and dev; 68 of the 88 were never called. TTFT is
 * flat below ~100 tools and tracks prompt-cache hits instead, and turns whose
 * tool set changed cached worse (dev median cached share 0.78 vs 0.89).
 */
export function staticCoreToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TOOL_CORE_STATIC === 'on';
}

/**
 * The static core, in request order. One tool per lookalike group
 * (quickTimer, not setTimer/quickAlarm; getWeatherForecast, not
 * getWeather/quickWeather). It covers every prod tool call of that week and
 * ~92% of dev's; calendar, reminders and on-behalf calling are kept although
 * one week of calls undercounts them. Tools a call can't have (gameState
 * without GAME_STATE, endCall off an on-behalf call) are skipped.
 */
export const STATIC_CORE_TOOLS: readonly string[] = [
  'getCurrentContext',
  // Safety: kept whatever their use
  'provideCrisisResources',
  'quickCrisisResources',
  'createSafetyPlan',
  'deEscalateAnxiety',
  'evaluateHumanTransfer',
  'connectToHumanExpert',
  'groundingExercise',
  'breatheWithMe',
  'groundingForTrauma',
  // Memory
  'rememberAboutUser',
  'recallFromMemory',
  'rememberImportantFact',
  'recallPreviousConversation',
  // The calls people make
  'playMusic',
  'musicControl',
  'quickTimer',
  'setReminder',
  'getReminders',
  'getCalendarToday',
  'createCalendarEvent',
  'getWeatherForecast',
  'searchWeb',
  'tellJoke',
  'getFunFact',
  'callOnBehalf',
  // Call control
  'gameState',
  'endCall',
  'findTools',
];

/**
 * The domains findTools may reach under TOOL_CORE_STATIC: the essential
 * domains (dynamic-loader/essential-domains.ts) and the ones the topic loader
 * can load mid-call (topic-mappings.ts), so findTools reaches no tool a call
 * can't already get. Pinned to those lists by static-core-tools.test.ts. The
 * catalog also holds tools no caller may reach this way: runBash and the rest
 * of developer, webhooks, settings, voice enrollment, commerce.
 */
export const FINDABLE_DOMAINS: readonly string[] = [
  // essential
  'memory',
  'handoff',
  'awareness',
  'entertainment',
  'telephony',
  'calendar',
  'productivity',
  'games',
  'presence',
  'trauma-support',
  'crisis',
  'human-transfer',
  // topic-loadable
  'books',
  'communication',
  'curiosity',
  'dreams',
  'finance',
  'grief',
  'habits',
  'information',
  'learning',
  'life-planning',
  'local-search',
  'meaning',
  'play',
  'podcasts',
  'relationships',
  'research',
  'scheduling',
  'self-compassion',
  'simple-utilities',
  'video',
  'vulnerability',
  'wellness',
  'wisdom',
];

/** Never findable, even if a topic mapping or the list above ever names them. */
export const NEVER_FINDABLE_DOMAINS: readonly string[] = [
  'developer',
  'developer-custom',
  'webhooks',
  'voice-enrollment',
  'settings',
  'commerce',
];

export function isFindableDomain(domain: string | undefined): boolean {
  return (
    domain !== undefined &&
    FINDABLE_DOMAINS.includes(domain) &&
    !NEVER_FINDABLE_DOMAINS.includes(domain)
  );
}

/** Teammate tools: they differ per user, so they go after the fixed core. */
export function isTeammateTool(name: string): boolean {
  return (
    name.startsWith('handoffTo') ||
    name === 'askForTeammate' ||
    name === 'introduceMember' ||
    name === 'meetTheTeam'
  );
}

export function isStaticCoreTool(name: string): boolean {
  return STATIC_CORE_TOOLS.includes(name) || isTeammateTool(name);
}

/**
 * The most tools an append-only call holds. Union of a call's tools under
 * append-only, from 611 calls' tool updates (2026-10-03..10): p50 88, p90 131,
 * prod-only p95 123. Past it, the oldest non-essential tools go as one block
 * of APPEND_ONLY_EVICT_BLOCK, so the prefix breaks rarely, not every load.
 */
export const APPEND_ONLY_TOOL_CAP = 128;
export const APPEND_ONLY_EVICT_BLOCK = 32;

/**
 * Check if a tool is in the essential tools list
 */
export function isEssentialTool(toolName: string): boolean {
  const config = getToolConfig();
  return (
    config.essentialTools.includes(toolName) ||
    toolName.startsWith('handoffTo') ||
    toolName === 'endCall' ||
    toolName === 'askForTeammate' // stands in for locked handoffs (locked-teammates.ts)
  );
}

/**
 * Get the essential tools list
 */
export function getEssentialTools(): readonly string[] {
  return getToolConfig().essentialTools;
}

/**
 * Cap tools to maxTools, prioritizing essential tools.
 *
 * @param tools - Record of tool name to tool definition
 * @param overrideLimit - Optional override for maxTools (useful for testing)
 * @returns Capped tools record
 */
export function capToolsToLimit<T>(
  tools: Record<string, T>,
  overrideLimit?: number
): Record<string, T> {
  const config = getToolConfig();
  const limit = overrideLimit ?? config.maxTools;

  // 0 = unlimited
  if (limit === 0) {
    return tools;
  }

  const toolCount = Object.keys(tools).length;
  if (toolCount <= limit) {
    return tools;
  }

  // Partition tools: essential first, then rest
  const essentialEntries: Array<[string, T]> = [];
  const otherEntries: Array<[string, T]> = [];

  for (const [name, tool] of Object.entries(tools)) {
    if (isEssentialTool(name)) {
      essentialEntries.push([name, tool]);
    } else {
      otherEntries.push([name, tool]);
    }
  }

  // Fill remaining slots with other tools
  const remainingSlots = limit - essentialEntries.length;
  const selectedOther = otherEntries.slice(0, Math.max(0, remainingSlots));

  const cappedTools: Record<string, T> = {};
  for (const [name, tool] of [...essentialEntries, ...selectedOther]) {
    cappedTools[name] = tool;
  }

  const droppedCount = toolCount - Object.keys(cappedTools).length;
  if (droppedCount > 0) {
    log.debug(
      {
        originalCount: toolCount,
        cappedCount: Object.keys(cappedTools).length,
        essentialCount: essentialEntries.length,
        droppedCount,
      },
      `🔪 Capped tools: ${toolCount} → ${Object.keys(cappedTools).length}`
    );
  }

  return cappedTools;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const TOOL_CONFIG = {
  get maxTools() {
    return getToolConfig().maxTools;
  },
  get useMetaTool() {
    return getToolConfig().useMetaTool;
  },
  get metaToolCatalogInPrompt() {
    return getToolConfig().metaToolCatalogInPrompt;
  },
  get useFtis() {
    return getToolConfig().useFtis;
  },
  get ftisThreshold() {
    return getToolConfig().ftisThreshold;
  },
  get essentialTools() {
    return getToolConfig().essentialTools;
  },
};
