/**
 * Commands Loader for Persona Bundles
 *
 * Loads slash commands from persona bundle command directories.
 * Commands are markdown files that define prompts the user can invoke.
 *
 * @module personas/bundles/commands-loader
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  BundleCommand,
  BundleCommandFrontmatter,
  BundleCommandIndex,
} from './types/commands.js';

const log = getLogger();

// ============================================================================
// FRONTMATTER PARSING
// ============================================================================

/**
 * Parse YAML-like frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  frontmatter: BundleCommandFrontmatter;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      body: content.trim(),
    };
  }

  const [, frontmatterStr, body] = match;
  const frontmatter: BundleCommandFrontmatter = {};

  // Parse simple YAML-like key: value pairs
  const lines = frontmatterStr.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (value) {
      // Handle string values (remove quotes if present)
      const cleanValue = value.replace(/^["'](.*)["']$/, '$1');

      switch (key) {
        case 'name':
        case 'description':
        case 'icon':
        case 'shortcut':
          frontmatter[key] = cleanValue;
          break;
        case 'category':
          frontmatter.category = cleanValue as BundleCommand['category'];
          break;
        case 'requiresConfirmation':
          frontmatter.requiresConfirmation = cleanValue === 'true';
          break;
      }
    }
  }

  return {
    frontmatter,
    body: body.trim(),
  };
}

// ============================================================================
// COMMAND LOADING
// ============================================================================

/**
 * Load a single command from a markdown file
 */
async function loadCommandFile(filePath: string, commandId: string): Promise<BundleCommand | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    // Generate name from ID if not in frontmatter
    const name =
      frontmatter.name ||
      commandId
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    return {
      id: commandId,
      name,
      description: frontmatter.description || `Run the ${name} command`,
      prompt: body,
      category: frontmatter.category,
      icon: frontmatter.icon,
      shortcut: frontmatter.shortcut,
      requiresConfirmation: frontmatter.requiresConfirmation,
      arguments: frontmatter.arguments,
      filePath,
    };
  } catch (error) {
    log.error({ filePath, error: String(error) }, 'Failed to load command file');
    return null;
  }
}

/**
 * Load commands from a bundle's commands directory
 */
export async function loadBundleCommands(bundlePath: string): Promise<BundleCommand[]> {
  const commandsDir = join(bundlePath, 'commands');

  try {
    const dirStat = await stat(commandsDir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      log.debug({ bundlePath }, 'No commands directory found');
      return [];
    }

    const files = await readdir(commandsDir);
    const commands: BundleCommand[] = [];

    for (const file of files) {
      // Skip index files and non-markdown files
      if (file.startsWith('_') || !file.endsWith('.md')) continue;

      const filePath = join(commandsDir, file);
      const commandId = basename(file, '.md');

      const command = await loadCommandFile(filePath, commandId);
      if (command) {
        commands.push(command);
      }
    }

    // Sort by category, then by name
    commands.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || 'custom').localeCompare(b.category || 'custom');
      }
      return a.name.localeCompare(b.name);
    });

    log.info({ bundlePath, commandCount: commands.length }, 'Loaded bundle commands');

    return commands;
  } catch (error) {
    log.error({ bundlePath, error: String(error) }, 'Failed to load bundle commands');
    return [];
  }
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
 */
export function renderCommand(command: BundleCommand, args: Record<string, string> = {}): string {
  let prompt = command.prompt;

  // Replace argument placeholders: {{argName}}
  for (const [key, value] of Object.entries(args)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    prompt = prompt.replace(placeholder, value);
  }

  // Replace remaining placeholders with defaults or empty string
  if (command.arguments) {
    for (const arg of command.arguments) {
      const placeholder = new RegExp(`\\{\\{\\s*${arg.name}\\s*\\}\\}`, 'g');
      prompt = prompt.replace(placeholder, arg.default || '');
    }
  }

  return prompt;
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
