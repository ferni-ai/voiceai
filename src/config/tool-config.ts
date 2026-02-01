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
   * Use FTIS V5 classifier for tool routing.
   * When enabled:
   * - Qwen3-1.7B ONNX model classifies user intent into tool domains
   * - 860 tool labels with 98%+ Top-1 accuracy
   * - Routes directly to tools without LLM function calling
   * - Falls back to semantic router if classifier confidence < threshold
   */
  useFtisV5: boolean;

  /**
   * Confidence threshold for FTIS V5 direct execution.
   * Tools are executed directly when confidence exceeds this threshold.
   * Below threshold, falls back to semantic router + LLM.
   */
  ftisV5Threshold: number;

  /**
   * Use FTIS V7 hierarchical classifier for tool routing.
   * When enabled:
   * - Two-stage ONNX model: Stage 1 classifies domain, Stage 2 classifies meta-tool
   * - Combined confidence = domain_confidence * meta_tool_confidence
   * - Routes by domain first, then filters tools within domain
   * - Falls back to V5 flat classifier if V7 models unavailable
   */
  useFtisV7: boolean;

  /**
   * Confidence threshold for FTIS V7 combined prediction.
   * Tools are loaded from the predicted domain when combined confidence exceeds this threshold.
   */
  ftisV7Threshold: number;

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
  useFtisV5: false, // Default to existing behavior (semantic router + LLM)
  ftisV5Threshold: 0.85, // High confidence required for direct execution
  useFtisV7: false, // Default off until V7 models are trained and validated
  ftisV7Threshold: 0.70, // Lower than V5 since combined confidence is product of two
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
    useFtisV5: parseBool(env.USE_FTIS_V5, DEFAULT_CONFIG.useFtisV5),
    ftisV5Threshold: parseNum(env.FTIS_V5_THRESHOLD, DEFAULT_CONFIG.ftisV5Threshold * 100) / 100,
    useFtisV7: parseBool(env.USE_FTIS_V7, DEFAULT_CONFIG.useFtisV7),
    ftisV7Threshold: parseNum(env.FTIS_V7_THRESHOLD, DEFAULT_CONFIG.ftisV7Threshold * 100) / 100,
    essentialTools: DEFAULT_CONFIG.essentialTools,
  };

  // Log configuration on first load
  log.info(
    {
      maxTools: cachedConfig.maxTools,
      useMetaTool: cachedConfig.useMetaTool,
      metaToolCatalogInPrompt: cachedConfig.metaToolCatalogInPrompt,
      useFtisV5: cachedConfig.useFtisV5,
      ftisV5Threshold: cachedConfig.ftisV5Threshold,
      useFtisV7: cachedConfig.useFtisV7,
      ftisV7Threshold: cachedConfig.ftisV7Threshold,
      essentialToolCount: cachedConfig.essentialTools.length,
    },
    `🔧 Tool config loaded: maxTools=${cachedConfig.maxTools}, ` +
      `useMetaTool=${cachedConfig.useMetaTool}, useFtisV5=${cachedConfig.useFtisV5}, ` +
      `useFtisV7=${cachedConfig.useFtisV7}`
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
 * Check if FTIS V5 classifier is enabled
 */
export function isFtisV5Enabled(): boolean {
  return getToolConfig().useFtisV5;
}

/**
 * Get FTIS V5 confidence threshold
 */
export function getFtisV5Threshold(): number {
  return getToolConfig().ftisV5Threshold;
}

/**
 * Check if FTIS V7 hierarchical classifier is enabled
 */
export function isFtisV7Enabled(): boolean {
  return getToolConfig().useFtisV7;
}

/**
 * Get FTIS V7 combined confidence threshold
 */
export function getFtisV7Threshold(): number {
  return getToolConfig().ftisV7Threshold;
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
  get useFtisV5() {
    return getToolConfig().useFtisV5;
  },
  get ftisV5Threshold() {
    return getToolConfig().ftisV5Threshold;
  },
  get useFtisV7() {
    return getToolConfig().useFtisV7;
  },
  get ftisV7Threshold() {
    return getToolConfig().ftisV7Threshold;
  },
  get essentialTools() {
    return getToolConfig().essentialTools;
  },
};
