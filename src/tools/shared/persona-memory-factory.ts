/**
 * Persona Memory Factory
 *
 * Shared utilities and factory pattern for persona memory tools.
 * Reduces boilerplate while allowing each persona to define unique memory types.
 *
 * Usage:
 *   const tools = getMemoryToolsForPersona('maya');
 *   const allTools = getAllPersonaMemoryTools();
 */

import { llm } from '@livekit/agents';
import type { z } from 'zod';
import { getLogger, getUserId } from '../utils/tool-helpers.js';

// Re-export getUserId for backward compatibility
export { getUserId };

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryToolConfig {
  personaId: string;
  displayName: string;
  emoji: string;
  memoryTypes: string[];
}

/**
 * Format a response with persona personality
 */
export function formatResponse(
  message: string,
  options: {
    emoji?: string;
    excited?: boolean;
    empathetic?: boolean;
  } = {}
): string {
  const { emoji, excited, empathetic } = options;

  let response = message;

  if (emoji) {
    response = `${emoji} ${response}`;
  }

  if (excited) {
    response = response.replace(/\.$/, '!');
  }

  return response;
}

/**
 * Format ordinal number (1st, 2nd, 3rd, etc.)
 */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

/**
 * Calculate progress percentage
 */
export function progressPercent(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.round((current / target) * 100);
}

// ============================================================================
// PERSONA CONFIGURATIONS
// ============================================================================

export const PERSONA_MEMORY_CONFIGS: Record<string, MemoryToolConfig> = {
  ferni: {
    personaId: 'ferni',
    displayName: 'Ferni',
    emoji: '🌟',
    memoryTypes: ['preference', 'win', 'topic', 'style', 'music'],
  },
  'nayan-patel': {
    personaId: 'nayan-patel',
    displayName: 'Jack Bogle',
    emoji: '📊',
    memoryTypes: ['fund', 'philosophy'],
  },
  'peter-john': {
    personaId: 'peter-john',
    displayName: 'Peter John',
    emoji: '🎯',
    memoryTypes: ['watchlist', 'company', 'ten-bagger'],
  },
  maya: {
    personaId: 'maya',
    displayName: 'Maya',
    emoji: '🌱',
    memoryTypes: ['habit', 'routine', 'life_stage', 'merchant', 'bill', 'trigger', 'savings_goal'],
  },
  jordan: {
    personaId: 'jordan',
    displayName: 'Jordan',
    emoji: '📅',
    memoryTypes: ['date', 'venue', 'destination'],
  },
};

// Aliases
PERSONA_MEMORY_CONFIGS['jack-b'] = PERSONA_MEMORY_CONFIGS['ferni'];
PERSONA_MEMORY_CONFIGS['spend-save'] = PERSONA_MEMORY_CONFIGS['maya'];
PERSONA_MEMORY_CONFIGS['event-planner'] = PERSONA_MEMORY_CONFIGS['jordan'];

// ============================================================================
// TOOL FACTORY HELPERS
// ============================================================================

/**
 * Create a basic "remember" tool with common structure
 */
export function createRememberTool<TParams extends z.ZodRawShape>(config: {
  description: string;
  parameters: z.ZodObject<TParams>;
  execute: (params: z.infer<z.ZodObject<TParams>>, userId: string) => Promise<string>;
}) {
  return llm.tool({
    description: config.description,
    parameters: config.parameters,
    execute: async (params, { ctx }) => {
      const userId = getUserId({ ctx });
      return config.execute(params as z.infer<z.ZodObject<TParams>>, userId);
    },
  });
}

/**
 * Create a basic "recall" tool with common structure
 */
export function createRecallTool<TParams extends z.ZodRawShape>(config: {
  description: string;
  parameters: z.ZodObject<TParams>;
  execute: (params: z.infer<z.ZodObject<TParams>>, userId: string) => Promise<string>;
}) {
  return llm.tool({
    description: config.description,
    parameters: config.parameters,
    execute: async (params, { ctx }) => {
      const userId = getUserId({ ctx });
      return config.execute(params as z.infer<z.ZodObject<TParams>>, userId);
    },
  });
}

// ============================================================================
// REGISTRY
// ============================================================================

// Import actual tool creators (lazy to avoid circular deps)
let _toolCreators: Record<string, () => Record<string, unknown>> | null = null;

async function getToolCreators() {
  if (!_toolCreators) {
    const memoryTools = await import('../domains/memory/persona-tools.js');
    _toolCreators = {
      ferni: memoryTools.createFerniMemoryTools,
      'jack-b': memoryTools.createFerniMemoryTools,
      'nayan-patel': memoryTools.createBogleMemoryTools,
      'peter-john': memoryTools.createPeterMemoryTools,
      maya: memoryTools.createMayaMemoryTools,
      'spend-save': memoryTools.createMayaMemoryTools,
      jordan: memoryTools.createJordanMemoryTools,
      'event-planner': memoryTools.createJordanMemoryTools,
    };
  }
  return _toolCreators;
}

/**
 * Get memory tools for a specific persona
 */
export async function getMemoryToolsForPersona(
  personaId: string
): Promise<Record<string, unknown> | null> {
  const creators = await getToolCreators();
  const creator = creators[personaId];

  if (!creator) {
    getLogger().warn({ personaId }, 'No memory tools found for persona');
    return null;
  }

  return creator();
}

/**
 * Get all persona memory tools as a flat object
 */
export async function getAllPersonaMemoryTools(): Promise<Record<string, unknown>> {
  const creators = await getToolCreators();
  const allTools: Record<string, unknown> = {};

  // Only get unique creators (avoid duplicates from aliases)
  const seen = new Set<() => Record<string, unknown>>();

  for (const [personaId, creator] of Object.entries(creators)) {
    if (seen.has(creator)) continue;
    seen.add(creator);

    const tools = creator();
    for (const [name, tool] of Object.entries(tools)) {
      // Prefix with persona ID to avoid collisions
      allTools[`${personaId}_${name}`] = tool;
    }
  }

  return allTools;
}

/**
 * Get memory tool config for a persona
 */
export function getMemoryConfig(personaId: string): MemoryToolConfig | null {
  return PERSONA_MEMORY_CONFIGS[personaId] || null;
}

export default {
  getUserId,
  formatResponse,
  ordinal,
  formatCurrency,
  progressPercent,
  createRememberTool,
  createRecallTool,
  getMemoryToolsForPersona,
  getAllPersonaMemoryTools,
  getMemoryConfig,
  PERSONA_MEMORY_CONFIGS,
};
