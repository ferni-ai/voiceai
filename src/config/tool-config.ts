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
  // Memory
  'rememberAboutUser',
  'recallFromMemory',
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
  'getCalendarEvents',
  'createCalendarEvent',
  'getUpcomingEvents',
  // Contacts & communication
  'sendMessage',
  'makeCall',
  'getContacts',
  // Smart home
  'controlSmartHome',
  'doNotDisturb',
  // Core context
  'getCurrentContext',
  'getUserContext',
  'whatCanYouDo',
  // Fun
  'tellJoke',
  'getFunFact',
  // End call
  'endCall',
];

const DEFAULT_CONFIG: ToolConfiguration = {
  maxTools: 0, // 0 = unlimited, let semantic router filter
  useMetaTool: false, // Default to existing behavior
  metaToolCatalogInPrompt: true, // Include catalog when meta-tool is enabled
  useFtis: true, // FTIS hierarchical classifier enabled by default
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

  const env = process.env;

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

  cachedConfig = {
    maxTools: parseNum(env.TOOL_LIMIT, DEFAULT_CONFIG.maxTools),
    useMetaTool: parseBool(env.USE_META_TOOL, DEFAULT_CONFIG.useMetaTool),
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
 * Check if a tool is in the essential tools list
 */
export function isEssentialTool(toolName: string): boolean {
  const config = getToolConfig();
  return (
    config.essentialTools.includes(toolName) ||
    toolName.startsWith('handoffTo') ||
    toolName === 'endCall'
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
  const essentialEntries: [string, T][] = [];
  const otherEntries: [string, T][] = [];

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
