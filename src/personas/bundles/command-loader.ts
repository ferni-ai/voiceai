/**
 * Agent Command Loader
 *
 * Loads and parses agent-specific commands from the commands/ directory.
 * Commands are defined as markdown files with optional YAML frontmatter.
 *
 * Example command file (commands/daily-check-in.md):
 * ```markdown
 * ---
 * name: Daily Check-In
 * description: Start your morning with a structured check-in
 * category: check-in
 * icon: 🌅
 * ---
 *
 * Let's do our daily check-in! I'd like to hear about:
 *
 * 1. How are you feeling this morning?
 * 2. What's your main focus for today?
 * 3. Is there anything weighing on your mind?
 *
 * Take your time - I'm here to listen.
 * ```
 *
 * @module personas/bundles/command-loader
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  BundleCommand,
  BundleCommandIndex,
  BundleCommandFrontmatter,
  CommandExecutionContext,
  CommandExecutionResult,
} from './types/commands.js';

const log = getLogger();

// ============================================================================
// FRONTMATTER PARSING
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  frontmatter: BundleCommandFrontmatter;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      body: content.trim(),
    };
  }

  const [, frontmatterYaml, body] = match;
  const frontmatter: BundleCommandFrontmatter = {};

  // Simple YAML parsing for our specific use case
  const lines = frontmatterYaml.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    switch (key) {
      case 'name':
        frontmatter.name = value;
        break;
      case 'description':
        frontmatter.description = value;
        break;
      case 'category':
        frontmatter.category = value as BundleCommandFrontmatter['category'];
        break;
      case 'icon':
        frontmatter.icon = value;
        break;
      case 'shortcut':
        frontmatter.shortcut = value;
        break;
      case 'requiresConfirmation':
        frontmatter.requiresConfirmation = value.toLowerCase() === 'true';
        break;
    }
  }

  return {
    frontmatter,
    body: body.trim(),
  };
}

/**
 * Convert filename to display name
 * daily-check-in.md -> Daily Check In
 */
function filenameToDisplayName(filename: string): string {
  const name = basename(filename, extname(filename));
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// COMMAND LOADER
// ============================================================================

/**
 * Load a single command from a markdown file
 */
export async function loadCommand(filePath: string): Promise<BundleCommand | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const id = basename(filePath, '.md');

    const command: BundleCommand = {
      id,
      name: frontmatter.name || filenameToDisplayName(filePath),
      description: frontmatter.description || `Run the ${id} command`,
      prompt: body,
      category: frontmatter.category,
      icon: frontmatter.icon,
      shortcut: frontmatter.shortcut,
      requiresConfirmation: frontmatter.requiresConfirmation,
      arguments: frontmatter.arguments,
      filePath,
    };

    return command;
  } catch (error) {
    log.error({ error, filePath }, 'Failed to load command');
    return null;
  }
}

/**
 * Load all commands from a commands directory
 */
export async function loadCommands(commandsDir: string): Promise<BundleCommand[]> {
  const commands: BundleCommand[] = [];

  try {
    // Check if directory exists
    const dirStat = await stat(commandsDir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      return commands;
    }

    // Check for index file first
    const indexPath = join(commandsDir, '_index.json');
    const indexStat = await stat(indexPath).catch(() => null);

    if (indexStat?.isFile()) {
      // Load from index
      const indexContent = await readFile(indexPath, 'utf-8');
      const index: BundleCommandIndex = JSON.parse(indexContent);

      for (const ref of index.commands) {
        if (ref.enabled === false) continue;

        const commandPath = join(commandsDir, ref.file);
        const command = await loadCommand(commandPath);
        if (command) {
          // Override with index metadata
          command.name = ref.name || command.name;
          command.description = ref.description || command.description;
          command.category = ref.category || command.category;
          command.icon = ref.icon || command.icon;
          commands.push(command);
        }
      }
    } else {
      // Scan directory for markdown files
      const files = await readdir(commandsDir);
      for (const file of files) {
        if (!file.endsWith('.md') || file.startsWith('_')) continue;

        const commandPath = join(commandsDir, file);
        const command = await loadCommand(commandPath);
        if (command) {
          commands.push(command);
        }
      }
    }

    log.info({ commandsDir, count: commands.length }, 'Loaded agent commands');
    return commands;
  } catch (error) {
    log.error({ error, commandsDir }, 'Failed to load commands');
    return commands;
  }
}

/**
 * Load commands for a persona bundle
 */
export async function loadBundleCommands(bundlePath: string): Promise<BundleCommand[]> {
  const commandsDir = join(bundlePath, 'commands');
  return loadCommands(commandsDir);
}

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

/**
 * Render a command's prompt with argument substitution
 */
export function renderCommandPrompt(
  command: BundleCommand,
  args: Record<string, string>
): string {
  let prompt = command.prompt;

  // Substitute {{arg}} placeholders
  for (const [key, value] of Object.entries(args)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    prompt = prompt.replace(placeholder, value);
  }

  // Remove any remaining unfilled placeholders
  prompt = prompt.replace(/\{\{\s*\w+\s*\}\}/g, '');

  return prompt.trim();
}

/**
 * Execute a command
 */
export async function executeCommand(
  context: CommandExecutionContext
): Promise<CommandExecutionResult> {
  try {
    const { command, args } = context;

    // Render the prompt with arguments
    const renderedPrompt = renderCommandPrompt(command, args);

    log.info(
      {
        commandId: command.id,
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
      },
      'Executed command'
    );

    return {
      success: true,
      renderedPrompt,
    };
  } catch (error) {
    log.error({ error, context }, 'Failed to execute command');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// COMMAND CACHE
// ============================================================================

const commandCache = new Map<string, BundleCommand[]>();

/**
 * Get commands for a bundle (with caching)
 */
export async function getCommands(
  bundlePath: string,
  forceReload = false
): Promise<BundleCommand[]> {
  if (!forceReload && commandCache.has(bundlePath)) {
    return commandCache.get(bundlePath)!;
  }

  const commands = await loadBundleCommands(bundlePath);
  commandCache.set(bundlePath, commands);
  return commands;
}

/**
 * Clear command cache for a bundle
 */
export function clearCommandCache(bundlePath?: string): void {
  if (bundlePath) {
    commandCache.delete(bundlePath);
  } else {
    commandCache.clear();
  }
}

/**
 * Find a command by ID
 */
export async function findCommand(
  bundlePath: string,
  commandId: string
): Promise<BundleCommand | null> {
  const commands = await getCommands(bundlePath);
  return commands.find((c) => c.id === commandId) || null;
}

export default {
  loadCommand,
  loadCommands,
  loadBundleCommands,
  renderCommandPrompt,
  executeCommand,
  getCommands,
  clearCommandCache,
  findCommand,
};
