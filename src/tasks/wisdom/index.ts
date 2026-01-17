/**
 * Task Wisdom Loader
 *
 * Loads task wisdom definitions from JSON files and compiles them into
 * the format expected by TaskManager.
 *
 * JSON files are organized by category:
 * - micro-tasks.json: Quick, natural moments (1-2 turns)
 * - support-tasks.json: Emotional support and crisis handling
 * - life-events.json: Major life transitions
 * - advice-tasks.json: Wisdom sharing and guidance
 * - relationship-tasks.json: Connection and follow-up tasks
 * - domain-tasks.json: Domain-specific (habits, research, etc.)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ConversationAnalysis } from '../../services/types.js';
import { getLogger } from '../../utils/safe-logger.js';

// Get directory of this file for resolving JSON paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

export interface TaskWisdom {
  id: string;
  name: string;
  category: 'micro' | 'support' | 'advice' | 'relationship' | 'life_event';
  priority: number;
  domain?: string;

  triggers: {
    emotions?: string[];
    distressThreshold?: number;
    intents?: string[];
    keywords?: RegExp;
    phases?: string[];
    custom?: (analysis: ConversationAnalysis, userText: string) => boolean;
  };

  instructions: {
    base: string;
    ifDistressed?: string;
    ifPositive?: string;
    ifReturning?: string;
  };

  completion?: {
    afterTurns?: number;
    onEmotionChange?: boolean;
    onKeywords?: RegExp;
    custom?: (analysis: ConversationAnalysis, userText: string) => boolean;
  };

  transitions?: {
    entry?: string[];
    exit?: string[];
    toTask?: string;
  };
}

interface JsonTaskTrigger {
  emotions?: string[];
  distressThreshold?: number;
  intents?: string[];
  keywords?: string;
  phases?: string[];
  customCondition?: string;
}

interface JsonTaskCompletion {
  afterTurns?: number;
  onEmotionChange?: boolean;
  onKeywords?: string;
  customCondition?: string;
}

interface JsonTask {
  id: string;
  name: string;
  priority: number;
  domain?: string;
  triggers: JsonTaskTrigger;
  instructions: {
    base: string;
    ifDistressed?: string;
    ifPositive?: string;
    ifReturning?: string;
  };
  completion?: JsonTaskCompletion;
  transitions?: {
    entry?: string[];
    exit?: string[];
    toTask?: string;
  };
}

interface JsonTaskFile {
  category: 'micro' | 'support' | 'advice' | 'relationship' | 'life_event';
  description: string;
  tasks: JsonTask[];
}

// ============================================================================
// CONDITION PARSER
// ============================================================================

/**
 * Parse a custom condition string into a function.
 * Supports simple expressions like:
 * - "distressLevel > 0.5"
 * - "emotion === 'fear' && distressLevel < 0.7"
 * - "valence === 'positive'"
 */
function parseCustomCondition(
  condition: string
): (analysis: ConversationAnalysis, _userText: string) => boolean {
  // Handle "false" for manually triggered tasks
  if (condition === 'false') {
    return () => false;
  }

  return (analysis: ConversationAnalysis, _userText: string): boolean => {
    try {
      // Create a safe evaluation context with analysis properties
      const ctx = {
        emotion: analysis.emotion.primary,
        distressLevel: analysis.emotion.distressLevel,
        valence: analysis.emotion.valence,
        intensity: analysis.emotion.intensity,
        intent: analysis.intent.primary,
        requiresEmpathy: analysis.intent.requiresEmpathy,
        phase: analysis.state.phase,
      };

      // Replace property access with context lookups
      const evalStr = condition
        .replace(/distressLevel/g, 'ctx.distressLevel')
        .replace(/emotion/g, 'ctx.emotion')
        .replace(/valence/g, 'ctx.valence')
        .replace(/intensity/g, 'ctx.intensity')
        .replace(/intent/g, 'ctx.intent')
        .replace(/requiresEmpathy/g, 'ctx.requiresEmpathy')
        .replace(/phase/g, 'ctx.phase');

      // Use Function constructor for safe evaluation (no access to global scope)
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('ctx', `return ${evalStr}`);
      return fn(ctx) as boolean;
    } catch {
      getLogger().warn({ condition }, 'Failed to evaluate custom condition');
      return false;
    }
  };
}

/**
 * Parse a keyword regex pattern from string
 */
function parseKeywordRegex(pattern: string): RegExp {
  // Pattern is stored without flags in JSON, add 'i' for case-insensitive
  return new RegExp(pattern, 'i');
}

// ============================================================================
// LOADER
// ============================================================================

/**
 * Load and parse a single JSON task file
 */
function loadTaskFile(filename: string): TaskWisdom[] {
  const log = getLogger();
  const filepath = join(__dirname, filename);

  try {
    const content = readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content) as JsonTaskFile;

    return data.tasks.map((task) => {
      const wisdom: TaskWisdom = {
        id: task.id,
        name: task.name,
        category: data.category,
        priority: task.priority,
        domain: task.domain,

        triggers: {
          emotions: task.triggers.emotions,
          distressThreshold: task.triggers.distressThreshold,
          intents: task.triggers.intents,
          phases: task.triggers.phases,
        },

        instructions: task.instructions,
        transitions: task.transitions,
      };

      // Parse keyword regex
      if (task.triggers.keywords) {
        wisdom.triggers.keywords = parseKeywordRegex(task.triggers.keywords);
      }

      // Parse custom condition
      if (task.triggers.customCondition) {
        wisdom.triggers.custom = parseCustomCondition(task.triggers.customCondition);
      }

      // Parse completion
      if (task.completion) {
        wisdom.completion = {
          afterTurns: task.completion.afterTurns,
          onEmotionChange: task.completion.onEmotionChange,
        };

        if (task.completion.onKeywords) {
          wisdom.completion.onKeywords = parseKeywordRegex(task.completion.onKeywords);
        }

        if (task.completion.customCondition) {
          wisdom.completion.custom = parseCustomCondition(task.completion.customCondition);
        }
      }

      return wisdom;
    });
  } catch (error) {
    log.error({ filename, error }, 'Failed to load task wisdom file');
    return [];
  }
}

/**
 * Load all task wisdom from JSON files
 */
export function loadTaskWisdom(): TaskWisdom[] {
  const files = [
    'micro-tasks.json',
    'support-tasks.json',
    'life-events.json',
    'advice-tasks.json',
    'relationship-tasks.json',
    'domain-tasks.json',
  ];

  const allTasks: TaskWisdom[] = [];

  for (const file of files) {
    const tasks = loadTaskFile(file);
    allTasks.push(...tasks);
  }

  getLogger().info({ taskCount: allTasks.length }, 'Loaded task wisdom from JSON files');
  return allTasks;
}

// ============================================================================
// CACHED SINGLETON
// ============================================================================

let cachedWisdom: TaskWisdom[] | null = null;

/**
 * Get task wisdom (cached after first load)
 */
export function getTaskWisdom(): TaskWisdom[] {
  if (!cachedWisdom) {
    cachedWisdom = loadTaskWisdom();
  }
  return cachedWisdom;
}

/**
 * Reload task wisdom (for hot-reloading in development)
 */
export function reloadTaskWisdom(): TaskWisdom[] {
  cachedWisdom = loadTaskWisdom();
  return cachedWisdom;
}

/**
 * Get task wisdom by category
 */
export function getTaskWisdomByCategory(category: TaskWisdom['category']): TaskWisdom[] {
  return getTaskWisdom().filter((t) => t.category === category);
}

/**
 * Get task wisdom by ID
 */
export function getTaskWisdomById(id: string): TaskWisdom | undefined {
  return getTaskWisdom().find((t) => t.id === id);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadTaskWisdom,
  getTaskWisdom,
  reloadTaskWisdom,
  getTaskWisdomByCategory,
  getTaskWisdomById,
};
