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
import type { BundleCommand, CommandExecutionContext, CommandExecutionResult } from './types/commands.js';
/**
 * Load a single command from a markdown file
 */
export declare function loadCommand(filePath: string): Promise<BundleCommand | null>;
/**
 * Load all commands from a commands directory
 */
export declare function loadCommands(commandsDir: string): Promise<BundleCommand[]>;
/**
 * Load commands for a persona bundle
 */
export declare function loadBundleCommands(bundlePath: string): Promise<BundleCommand[]>;
/**
 * Render a command's prompt with argument substitution
 */
export declare function renderCommandPrompt(command: BundleCommand, args: Record<string, string>): string;
/**
 * Execute a command
 */
export declare function executeCommand(context: CommandExecutionContext): Promise<CommandExecutionResult>;
/**
 * Get commands for a bundle (with caching)
 */
export declare function getCommands(bundlePath: string, forceReload?: boolean): Promise<BundleCommand[]>;
/**
 * Clear command cache for a bundle
 */
export declare function clearCommandCache(bundlePath?: string): void;
/**
 * Find a command by ID
 */
export declare function findCommand(bundlePath: string, commandId: string): Promise<BundleCommand | null>;
declare const _default: {
    loadCommand: typeof loadCommand;
    loadCommands: typeof loadCommands;
    loadBundleCommands: typeof loadBundleCommands;
    renderCommandPrompt: typeof renderCommandPrompt;
    executeCommand: typeof executeCommand;
    getCommands: typeof getCommands;
    clearCommandCache: typeof clearCommandCache;
    findCommand: typeof findCommand;
};
export default _default;
//# sourceMappingURL=command-loader.d.ts.map