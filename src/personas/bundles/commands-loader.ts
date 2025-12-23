/**
 * Commands Loader for Persona Bundles (High-Level API)
 *
 * Persona-aware command loading with TTL caching.
 * Delegates to command-loader.ts for low-level file loading.
 *
 * Usage:
 *   // API routes use persona-aware loading
 *   const commands = await loadCommandsWithCache('ferni');
 *   const command = await getCommand('ferni', 'daily-check-in');
 *
 * @module personas/bundles/commands-loader
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { BundleCommand } from './types/commands.js';

// Delegate to command-loader.ts for actual file loading (single source of truth)
// This eliminates duplicate frontmatter parsing logic
import {
  loadBundleCommands as loadBundleCommandsFromPath,
  renderCommandPrompt,
  executeCommand,
} from './command-loader.js';

const log = getLogger();

// Re-export low-level functions for callers that need them
export { renderCommandPrompt, executeCommand };

// ============================================================================
// COMMAND LOADING (delegates to command-loader.ts)
// ============================================================================

/**
 * Load commands from a bundle's commands directory
 * Delegates to command-loader.ts for actual loading
 */
export async function loadBundleCommands(bundlePath: string): Promise<BundleCommand[]> {
  const commands = await loadBundleCommandsFromPath(bundlePath);

  // Sort by category, then by name (persona-aware sorting)
  commands.sort((a, b) => {
    if (a.category !== b.category) {
      return (a.category || 'custom').localeCompare(b.category || 'custom');
    }
    return a.name.localeCompare(b.name);
  });

  return commands;
}

/**
 * Load commands for a persona by ID
 */
export async function loadCommandsForPersona(personaId: string): Promise<BundleCommand[]> {
  try {
    const { loadBundleById } = await import('./loader.js');
    const bundle = await loadBundleById(personaId);

    if (!bundle?.bundlePath) {
      log.debug({ personaId }, 'No bundle found for persona');
      return [];
    }

    return await loadBundleCommands(bundle.bundlePath);
  } catch (error) {
    log.error({ personaId, error: String(error) }, 'Failed to load commands for persona');
    return [];
  }
}

/**
 * Get a specific command by ID
 */
export async function getCommand(
  personaId: string,
  commandId: string
): Promise<BundleCommand | null> {
  const commands = await loadCommandsForPersona(personaId);
  return commands.find((c) => c.id === commandId) || null;
}

/**
 * Execute a command and return the rendered prompt
 * Delegates to renderCommandPrompt from command-loader.ts
 */
export function renderCommand(command: BundleCommand, args: Record<string, string> = {}): string {
  return renderCommandPrompt(command, args);
}

// ============================================================================
// CACHE
// ============================================================================

const commandCache = new Map<string, { commands: BundleCommand[]; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Load commands with caching
 */
export async function loadCommandsWithCache(
  personaId: string,
  forceReload = false
): Promise<BundleCommand[]> {
  const cached = commandCache.get(personaId);

  if (!forceReload && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.commands;
  }

  const commands = await loadCommandsForPersona(personaId);
  commandCache.set(personaId, { commands, timestamp: Date.now() });
  return commands;
}

/**
 * Clear command cache
 */
export function clearCommandCache(personaId?: string): void {
  if (personaId) {
    commandCache.delete(personaId);
  } else {
    commandCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadBundleCommands,
  loadCommandsForPersona,
  loadCommandsWithCache,
  getCommand,
  renderCommand,
  clearCommandCache,
};
