/**
 * CLI Commands Command
 *
 * Manage and validate all Ferni persona commands (slash commands).
 *
 * Usage:
 *   ferni commands list                          # List all persona commands
 *   ferni commands list --persona <personaId>    # List commands for a persona
 *   ferni commands exec <personaId>/<cmdId>      # Execute a command
 *   ferni commands validate <personaId>/<cmdId>  # Validate a command
 *   ferni commands validate --all                # Validate all commands
 */

import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = process.env.FERNI_PROJECT_ROOT || process.cwd();
const BUNDLES_DIR = join(PROJECT_ROOT, 'src', 'personas', 'bundles');

// ============================================================================
// COLORS & STYLING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  command: '💬',
  persona: '👤',
  arrow: '→',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}${icons.info}${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}${icons.success}${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}${icons.warning}${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}${icons.error}${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`  ${colors.dim}${icons.arrow}${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
};

// ============================================================================
// TYPES
// ============================================================================

interface CommandInfo {
  id: string;
  name: string;
  description: string;
  category?: string;
  icon?: string;
  personaId: string;
  filePath: string;
}

interface ExecResult {
  success: boolean;
  renderedPrompt?: string;
  error?: string;
}

interface ValidationResult {
  commandId: string;
  personaId: string;
  valid: boolean;
  issues: string[];
}

// ============================================================================
// PERSONA DISCOVERY
// ============================================================================

/**
 * Get all persona IDs that have command directories.
 */
function getPersonasWithCommands(): string[] {
  const personas: string[] = [];

  if (!existsSync(BUNDLES_DIR)) {
    return personas;
  }

  const entries = readdirSync(BUNDLES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'shared' || entry.name === 'types') continue;

    const commandsDir = join(BUNDLES_DIR, entry.name, 'commands');
    if (existsSync(commandsDir)) {
      personas.push(entry.name);
    }
  }

  return personas.sort();
}

// ============================================================================
// COMMAND LISTING
// ============================================================================

async function listCommands(personaFilter?: string): Promise<void> {
  log.header(`${icons.command} Persona Commands`);

  try {
    // Dynamic imports
    const { loadBundleCommands } = await import(
      '../../../../../src/personas/bundles/command-loader.js'
    );

    const personas = getPersonasWithCommands();

    if (personas.length === 0) {
      log.warn('No persona commands found');
      return;
    }

    if (personaFilter) {
      // Filter to specific persona
      if (!personas.includes(personaFilter)) {
        log.error(`Persona "${personaFilter}" not found or has no commands`);
        console.log(`\n  Available personas with commands: ${personas.join(', ')}`);
        process.exit(1);
      }

      const bundlePath = join(BUNDLES_DIR, personaFilter);
      const commands = await loadBundleCommands(bundlePath);

      console.log(`${colors.bold}Persona: ${personaFilter}${colors.reset}`);
      console.log(`  Commands: ${commands.length}`);
      console.log('');

      for (const cmd of commands) {
        console.log(`  ${colors.cyan}/${cmd.id}${colors.reset}`);
        console.log(`    ${colors.dim}${cmd.description || cmd.name}${colors.reset}`);
        if (cmd.category) {
          console.log(`    ${colors.yellow}Category: ${cmd.category}${colors.reset}`);
        }
        console.log('');
      }
    } else {
      // Show all personas and their command counts
      console.log(`${colors.bold}${personas.length} personas with commands:${colors.reset}\n`);

      let totalCommands = 0;
      for (const persona of personas) {
        const bundlePath = join(BUNDLES_DIR, persona);
        const commands = await loadBundleCommands(bundlePath);
        totalCommands += commands.length;
        console.log(
          `  ${colors.cyan}${persona.padEnd(20)}${colors.reset} ${commands.length} commands`
        );
      }

      console.log(
        `\n${colors.bold}Total: ${totalCommands} commands across ${personas.length} personas${colors.reset}`
      );
      console.log(
        `\n  Use ${colors.cyan}ferni commands list --persona <personaId>${colors.reset} to see commands`
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to load commands: ${msg}`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

async function execCommand(
  personaId: string,
  commandId: string,
  args: Record<string, string>
): Promise<ExecResult> {
  try {
    // Dynamic imports
    const { findCommand, renderCommandPrompt } = await import(
      '../../../../../src/personas/bundles/command-loader.js'
    );

    const bundlePath = join(BUNDLES_DIR, personaId);

    if (!existsSync(bundlePath)) {
      return { success: false, error: `Persona not found: ${personaId}` };
    }

    const command = await findCommand(bundlePath, commandId);

    if (!command) {
      return { success: false, error: `Command not found: ${commandId}` };
    }

    // Render the prompt with arguments
    const renderedPrompt = renderCommandPrompt(command, args);

    return { success: true, renderedPrompt };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

async function handleExec(args: string[]): Promise<void> {
  // Parse command path (personaId/commandId)
  const commandPath = args[0];
  if (!commandPath || !commandPath.includes('/')) {
    log.error('Invalid command path. Use format: <personaId>/<commandId>');
    console.log(`\n  Usage: ${colors.cyan}ferni commands exec ferni/daily-check-in${colors.reset}`);
    process.exit(1);
  }

  const [personaId, commandId] = commandPath.split('/');

  // Parse additional arguments (--arg value)
  const commandArgs: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
      const key = args[i].slice(2);
      commandArgs[key] = args[i + 1];
      i++;
    }
  }

  log.header(`${icons.command} Execute Command: ${personaId}/${commandId}`);

  log.info(`Persona: ${personaId}`);
  log.info(`Command: ${commandId}`);
  if (Object.keys(commandArgs).length > 0) {
    log.info(`Args: ${JSON.stringify(commandArgs)}`);
  }
  console.log('');

  const result = await execCommand(personaId, commandId, commandArgs);

  if (result.success) {
    log.success('Command rendered successfully');
    console.log('\n' + colors.bold + 'Rendered Prompt:' + colors.reset);
    console.log('');
    console.log(colors.dim + '─'.repeat(60) + colors.reset);
    console.log(result.renderedPrompt);
    console.log(colors.dim + '─'.repeat(60) + colors.reset);
  } else {
    log.error(`Failed: ${result.error}`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND VALIDATION
// ============================================================================

async function validateCommand(personaId: string, commandId: string): Promise<ValidationResult> {
  const issues: string[] = [];

  try {
    const { findCommand } = await import('../../../../../src/personas/bundles/command-loader.js');

    const bundlePath = join(BUNDLES_DIR, personaId);

    if (!existsSync(bundlePath)) {
      return { commandId, personaId, valid: false, issues: [`Persona not found: ${personaId}`] };
    }

    const command = await findCommand(bundlePath, commandId);

    if (!command) {
      return { commandId, personaId, valid: false, issues: [`Command not found: ${commandId}`] };
    }

    // Validate command structure
    if (!command.name || command.name.trim() === '') {
      issues.push('Missing or empty name');
    }

    if (!command.description || command.description.trim() === '') {
      issues.push('Missing or empty description');
    }

    if (!command.prompt || command.prompt.trim() === '') {
      issues.push('Missing or empty prompt');
    }

    // Check for unreplaced placeholders that don't have default values
    const placeholders = command.prompt?.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
    if (placeholders.length > 0 && !command.arguments) {
      issues.push(`Placeholders found but no arguments defined: ${placeholders.join(', ')}`);
    }

    return {
      commandId,
      personaId,
      valid: issues.length === 0,
      issues,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { commandId, personaId, valid: false, issues: [msg] };
  }
}

async function handleValidate(args: string[]): Promise<void> {
  log.header(`${icons.success} Command Validation`);

  // Parse options
  let commandPath: string | undefined;
  let personaFilter: string | undefined;
  let validateAll = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') {
      validateAll = true;
    } else if (args[i] === '--persona' && args[i + 1]) {
      personaFilter = args[i + 1];
      i++;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    } else if (!args[i].startsWith('-')) {
      commandPath = args[i];
    }
  }

  if (!commandPath && !personaFilter && !validateAll) {
    log.error('Specify a command path, --persona, or --all');
    console.log(`\n  Usage:`);
    console.log(
      `    ${colors.cyan}ferni commands validate ferni/daily-check-in${colors.reset}  # Single command`
    );
    console.log(
      `    ${colors.cyan}ferni commands validate --persona ferni${colors.reset}       # All for persona`
    );
    console.log(
      `    ${colors.cyan}ferni commands validate --all${colors.reset}                  # All commands`
    );
    process.exit(1);
  }

  const results: ValidationResult[] = [];

  if (commandPath) {
    // Validate single command
    const [personaId, commandId] = commandPath.split('/');
    if (!personaId || !commandId) {
      log.error('Invalid command path. Use format: <personaId>/<commandId>');
      process.exit(1);
    }

    const result = await validateCommand(personaId, commandId);
    results.push(result);
  } else {
    // Validate multiple commands
    const { loadBundleCommands } = await import(
      '../../../../../src/personas/bundles/command-loader.js'
    );

    const personas = personaFilter ? [personaFilter] : getPersonasWithCommands();

    for (const persona of personas) {
      const bundlePath = join(BUNDLES_DIR, persona);
      const commands = await loadBundleCommands(bundlePath);

      for (const cmd of commands) {
        const result = await validateCommand(persona, cmd.id);
        results.push(result);
      }
    }
  }

  // Print results
  const passed = results.filter((r) => r.valid);
  const failed = results.filter((r) => !r.valid);

  if (verbose || failed.length > 0) {
    for (const result of results) {
      if (result.valid) {
        console.log(
          `  ${colors.green}${icons.success}${colors.reset} ${result.personaId}/${result.commandId}`
        );
      } else {
        console.log(
          `  ${colors.red}${icons.error}${colors.reset} ${result.personaId}/${result.commandId}`
        );
        for (const issue of result.issues) {
          console.log(`      ${colors.dim}${issue}${colors.reset}`);
        }
      }
    }
    console.log('');
  }

  // Summary
  console.log(
    `${colors.bold}Results: ${passed.length} passed, ${failed.length} failed${colors.reset}`
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleCommands(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'list': {
      // Check for --persona flag
      let persona: string | undefined;
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--persona' && subArgs[i + 1]) {
          persona = subArgs[i + 1];
          break;
        }
      }
      await listCommands(persona);
      break;
    }

    case 'exec':
      await handleExec(subArgs);
      break;

    case 'validate':
      await handleValidate(subArgs);
      break;

    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      console.log(`\n  Available subcommands:`);
      console.log(`    ${colors.cyan}list${colors.reset}      List persona commands`);
      console.log(`    ${colors.cyan}exec${colors.reset}      Execute a command`);
      console.log(`    ${colors.cyan}validate${colors.reset}  Validate commands`);
      console.log(`\n  Examples:`);
      console.log(`    ferni commands list --persona ferni`);
      console.log(`    ferni commands exec ferni/daily-check-in`);
      console.log(`    ferni commands validate --all`);
      process.exit(1);
  }
}
