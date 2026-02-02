#!/usr/bin/env npx tsx
/**
 * CI/CD Command
 *
 * Unified CI/CD monitoring and management for agents and humans.
 *
 * Usage:
 *   ferni ci status              # Show CI status (human view)
 *   ferni ci status --json       # Show CI status (agent view)
 *   ferni ci graph               # Show workflow dependency graph
 *   ferni ci actions             # Show recommended actions
 *   ferni ci execute <id>        # Execute a recommended action
 *   ferni ci dashboard           # Interactive ASCII dashboard
 *   ferni ci watch               # Watch for changes
 *
 * Formats:
 *   --format json     Machine-readable JSON (for agents)
 *   --format table    Human-readable table (default)
 *   --format ascii    Interactive ASCII dashboard
 *   --format mermaid  Mermaid diagram for docs
 *   --format minimal  Compact one-line status
 */

import { execSync } from 'child_process';
import type { CICommandOptions, OutputFormat } from './ci-types.js';
import { collectCIState } from './ci-state-collector.js';
import {
  renderJSON,
  renderMinimal,
  renderTable,
  renderASCIIDashboard,
  renderMermaid,
  renderActions,
} from './ci-renderers.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color?: keyof typeof COLORS): void {
  const colorCode = color ? COLORS[color] : '';
  console.log(`${colorCode}${message}${COLORS.reset}`);
}

// ============================================================================
// Status Command
// ============================================================================

async function statusCommand(options: CICommandOptions): Promise<void> {
  const format = options.format || 'table';

  if (format !== 'json' && format !== 'minimal') {
    log('\n🔍 Collecting CI state...', 'cyan');
  }

  const state = await collectCIState(options.branch);

  switch (format) {
    case 'json':
      console.log(renderJSON(state));
      break;
    case 'minimal':
      console.log(renderMinimal(state));
      break;
    case 'ascii':
      console.log(renderASCIIDashboard(state));
      break;
    case 'mermaid':
      console.log(renderMermaid(state));
      break;
    case 'table':
    default:
      console.log(renderTable(state));
  }
}

// ============================================================================
// Graph Command
// ============================================================================

async function graphCommand(options: CICommandOptions): Promise<void> {
  const format = options.format || 'mermaid';
  const state = await collectCIState(options.branch);

  if (format === 'mermaid') {
    console.log(renderMermaid(state));
  } else if (format === 'ascii') {
    console.log(renderASCIIDashboard(state));
  } else {
    // JSON format - output the graph structure
    const ciWorkflow = state.workflows.find(w => w.name === 'CI');
    if (ciWorkflow) {
      const { buildWorkflowGraph } = await import('./ci-state-collector.js');
      const graph = buildWorkflowGraph(ciWorkflow.jobs);
      console.log(JSON.stringify(graph, null, 2));
    }
  }
}

// ============================================================================
// Actions Command
// ============================================================================

async function actionsCommand(options: CICommandOptions): Promise<void> {
  const state = await collectCIState(options.branch);
  const format = options.format === 'json' ? 'json' : 'table';
  console.log(renderActions(state.actions, format));
}

// ============================================================================
// Execute Command
// ============================================================================

// Allowlist of safe command prefixes to prevent shell injection
const ALLOWED_COMMAND_PREFIXES = [
  'gh run rerun',
  'gh run cancel',
  'gh workflow run',
  'ferni runner',
  'ferni ci',
  'ferni deploy',
  'gcloud compute instances describe',
  'gcloud compute instances start',
];

function isCommandSafe(command: string): boolean {
  return ALLOWED_COMMAND_PREFIXES.some(prefix => command.startsWith(prefix));
}

async function executeCommand(actionId: string, options: CICommandOptions): Promise<void> {
  const state = await collectCIState(options.branch);

  // Find action by ID or index
  let action = state.actions.find(a => a.id === actionId);
  if (!action) {
    const index = parseInt(actionId, 10) - 1;
    if (index >= 0 && index < state.actions.length) {
      action = state.actions[index];
    }
  }

  if (!action) {
    log(`❌ Action not found: ${actionId}`, 'red');
    log('\nAvailable actions:', 'dim');
    for (let i = 0; i < state.actions.length; i++) {
      log(`  ${i + 1}. ${state.actions[i].id}: ${state.actions[i].action}`, 'dim');
    }
    process.exit(1);
  }

  // Security: Validate command is in allowlist
  if (!isCommandSafe(action.command)) {
    log(`❌ Command not in allowlist: ${action.command}`, 'red');
    log('   This is a security measure to prevent shell injection.', 'dim');
    log('   Add command prefix to ALLOWED_COMMAND_PREFIXES if this is intentional.', 'dim');
    process.exit(1);
  }

  log(`\n🚀 Executing: ${action.action}`, 'cyan');
  log(`   Command: ${action.command}`, 'dim');
  log('', 'reset');

  try {
    execSync(action.command, { stdio: 'inherit' });
    log('\n✅ Action completed successfully', 'green');
  } catch (error) {
    log('\n❌ Action failed', 'red');
    process.exit(1);
  }
}

// ============================================================================
// Dashboard Command
// ============================================================================

async function dashboardCommand(options: CICommandOptions): Promise<void> {
  if (options.watch) {
    await watchMode(options);
  } else {
    const state = await collectCIState(options.branch);
    console.log(renderASCIIDashboard(state));
  }
}

// ============================================================================
// Watch Mode
// ============================================================================

async function watchMode(options: CICommandOptions): Promise<void> {
  const interval = options.interval || 30;
  let isRefreshing = false;
  let intervalId: NodeJS.Timeout | null = null;

  log(`\n👁️  Watching CI state (refresh every ${interval}s)`, 'cyan');
  log('   Press Ctrl+C to stop\n', 'dim');

  const refresh = async () => {
    // Prevent overlapping refreshes if API is slow
    if (isRefreshing) return;
    isRefreshing = true;

    try {
      console.clear();
      const state = await collectCIState(options.branch);
      console.log(renderASCIIDashboard(state));
      log(`\n${COLORS.dim}Last refresh: ${new Date().toLocaleTimeString()} | Next in ${interval}s${COLORS.reset}`);
    } catch (error) {
      log(`\n⚠️  Refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'yellow');
      log(`   Will retry in ${interval}s...`, 'dim');
    } finally {
      isRefreshing = false;
    }
  };

  // Graceful shutdown handler
  const cleanup = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    log('\n\n👋 Watch mode stopped', 'cyan');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await refresh();
  intervalId = setInterval(refresh, interval * 1000);
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`
${COLORS.bold}${COLORS.cyan}Ferni CI/CD Command${COLORS.reset}

${COLORS.bold}USAGE${COLORS.reset}
  ferni ci <command> [options]

${COLORS.bold}COMMANDS${COLORS.reset}
  status              Show CI status
  graph               Show workflow dependency graph
  actions             Show recommended actions
  execute <id>        Execute a recommended action
  dashboard           Interactive ASCII dashboard
  watch               Watch for changes

${COLORS.bold}OPTIONS${COLORS.reset}
  --format <format>   Output format: json, table, ascii, mermaid, minimal
  --branch <branch>   Filter by branch
  --watch             Enable watch mode (auto-refresh)
  --interval <sec>    Refresh interval for watch mode (default: 30)
  --verbose           Show detailed output

${COLORS.bold}EXAMPLES${COLORS.reset}
  ${COLORS.dim}# Human view - show current status${COLORS.reset}
  ferni ci status

  ${COLORS.dim}# Agent view - JSON output for programmatic consumption${COLORS.reset}
  ferni ci status --format json

  ${COLORS.dim}# Show workflow graph as Mermaid diagram${COLORS.reset}
  ferni ci graph --format mermaid

  ${COLORS.dim}# Execute the first recommended action${COLORS.reset}
  ferni ci execute 1

  ${COLORS.dim}# Watch mode with 60s refresh${COLORS.reset}
  ferni ci watch --interval 60

  ${COLORS.dim}# Filter by PR branch${COLORS.reset}
  ferni ci status --branch fix/ci-agents-js-all-workflows

${COLORS.bold}AGENT VS HUMAN VIEWS${COLORS.reset}
  ${COLORS.cyan}Agent View (--format json/minimal):${COLORS.reset}
    - Structured, machine-readable output
    - Complete state for programmatic decisions
    - Actionable commands included

  ${COLORS.cyan}Human View (--format table/ascii):${COLORS.reset}
    - Visual, interactive display
    - Color-coded status indicators
    - Curated highlights and recommendations
`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function runCICommand(args: string[]): Promise<void> {
  const command = args[0] || 'status';

  // Parse options
  const options: CICommandOptions = {
    format: getArgValue(args, '--format') as OutputFormat,
    branch: getArgValue(args, '--branch'),
    watch: args.includes('--watch'),
    interval: parseInt(getArgValue(args, '--interval') || '30', 10),
    verbose: args.includes('--verbose'),
  };

  // Handle --json shorthand
  if (args.includes('--json')) {
    options.format = 'json';
  }

  try {
    switch (command) {
      case 'status':
        await statusCommand(options);
        break;
      case 'graph':
        await graphCommand(options);
        break;
      case 'actions':
        await actionsCommand(options);
        break;
      case 'execute':
        await executeCommand(args[1], options);
        break;
      case 'dashboard':
        await dashboardCommand(options);
        break;
      case 'watch':
        options.watch = true;
        await dashboardCommand(options);
        break;
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;
      default:
        log(`Unknown command: ${command}`, 'red');
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    log(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`, 'red');
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runCICommand(process.argv.slice(2));
}
