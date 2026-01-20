#!/usr/bin/env npx tsx
/**
 * CLI Tools Command
 *
 * Manage and validate all Ferni LLM tools.
 *
 * Usage:
 *   ferni tools list                           # List all available tools
 *   ferni tools list --domain <domain>         # List tools in a specific domain
 *   ferni tools exec <toolId> --params '{}'    # Execute a single tool
 *   ferni tools validate <toolId>              # E2E validate a single tool
 *   ferni tools validate --domain <domain>     # E2E validate all tools in a domain
 *   ferni tools validate --all                 # E2E validate all tools
 */

import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = process.env.FERNI_PROJECT_ROOT || join(process.cwd());

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
};

const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  tool: '🔧',
  gear: '⚙',
  check: '✔',
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

interface ToolInfo {
  id: string;
  name: string;
  description: string;
  domain: string;
  tags: string[];
}

interface ExecResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
}

// ============================================================================
// TOOL LISTING
// ============================================================================

async function listTools(domainFilter?: string): Promise<void> {
  log.header(`${icons.tool} Available Tools`);

  try {
    // Dynamic import to avoid loading at CLI startup
    const { toolRegistry } = await import('../../../../../src/tools/registry/index.js');
    const {
      autoRegisterAllDomains,
      initializeToolRegistry,
      getLoadedDomains,
    } = await import('../../../../../src/tools/registry/loader.js');
    const { ALL_TOOL_DOMAINS } = await import('../../../../../src/tools/registry/types.js');

    // Register all domain loaders, then initialize
    await autoRegisterAllDomains();
    await initializeToolRegistry({ lazyLoading: false }); // Load all for listing

    // Get all domains from the type definition
    const loadedDomains = getLoadedDomains();

    if (domainFilter) {
      // Filter to specific domain
      if (!loadedDomains.includes(domainFilter as typeof loadedDomains[number])) {
        log.error(`Domain "${domainFilter}" not found or not loaded`);
        console.log(`\n  Available domains: ${loadedDomains.join(', ')}`);
        process.exit(1);
      }

      const domainTools = toolRegistry.getByDomain(domainFilter as typeof loadedDomains[number]);

      console.log(`${colors.bold}Domain: ${domainFilter}${colors.reset}`);
      console.log(`  Tools: ${domainTools.length}`);
      console.log('');

      for (const tool of domainTools) {
        console.log(`  ${colors.cyan}${tool.id}${colors.reset}`);
        console.log(`    ${colors.dim}${tool.description || tool.name}${colors.reset}`);
        if (tool.tags?.length) {
          console.log(`    ${colors.yellow}Tags: ${tool.tags.join(', ')}${colors.reset}`);
        }
        console.log('');
      }
    } else {
      // Show all domains and their tool counts
      console.log(`${colors.bold}${loadedDomains.length} domains loaded:${colors.reset}\n`);

      let totalTools = 0;
      for (const d of loadedDomains.sort()) {
        const domainTools = toolRegistry.getByDomain(d);
        totalTools += domainTools.length;
        console.log(`  ${colors.cyan}${d.padEnd(25)}${colors.reset} ${domainTools.length} tools`);
      }

      console.log(`\n${colors.bold}Total: ${totalTools} tools across ${loadedDomains.length} domains${colors.reset}`);
      console.log(`\n  Use ${colors.cyan}ferni tools list --domain <domain>${colors.reset} to see tools in a domain`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to load tools: ${msg}`);
    process.exit(1);
  }
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

async function execTool(
  toolId: string,
  paramsJson: string,
  userId: string
): Promise<ExecResult> {
  const startTime = Date.now();

  try {
    // Parse params
    let params: Record<string, unknown>;
    try {
      params = paramsJson ? JSON.parse(paramsJson) : {};
    } catch {
      return {
        success: false,
        error: `Invalid JSON params: ${paramsJson}`,
        duration: Date.now() - startTime,
      };
    }

    // Ensure userId is set
    params.userId = params.userId || userId;

    // Dynamic imports
    const { toolRegistry } = await import('../../../../../src/tools/registry/index.js');
    const { autoRegisterAllDomains, initializeToolRegistry } = await import(
      '../../../../../src/tools/registry/loader.js'
    );
    const { EnvironmentServiceRegistry } = await import(
      '../../../../../src/tools/registry/types.js'
    );

    // Initialize (load all domains to find any tool)
    await autoRegisterAllDomains();
    await initializeToolRegistry({ lazyLoading: false });

    // Find the tool
    const tool = toolRegistry.get(toolId);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolId}`,
        duration: Date.now() - startTime,
      };
    }

    // Create minimal context
    const context = {
      userId,
      agentId: 'cli',
      agentDisplayName: 'CLI',
      services: new EnvironmentServiceRegistry(),
    };

    // Instantiate the tool
    const toolInstance = tool.create(context);

    // Execute
    const result = await toolInstance.execute(params);

    return {
      success: true,
      output: result,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: msg,
      duration: Date.now() - startTime,
    };
  }
}

async function handleExec(args: string[]): Promise<void> {
  // Parse args
  const toolId = args[0];
  if (!toolId) {
    log.error('Missing tool ID');
    console.log(`\n  Usage: ${colors.cyan}ferni tools exec <toolId> [--params '{}'] [--userId <id>]${colors.reset}`);
    console.log(`\n  Example:`);
    console.log(`    ferni tools exec trackJobApplication --params '{"company": "Acme Inc"}'`);
    process.exit(1);
  }

  // Parse options
  let paramsJson = '{}';
  let userId = 'cli-test-user';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--params' && args[i + 1]) {
      paramsJson = args[i + 1];
      i++;
    } else if (args[i] === '--userId' && args[i + 1]) {
      userId = args[i + 1];
      i++;
    }
  }

  log.header(`${icons.tool} Execute Tool: ${toolId}`);

  log.info(`Tool: ${toolId}`);
  log.info(`Params: ${paramsJson}`);
  log.info(`User: ${userId}`);
  console.log('');

  const result = await execTool(toolId, paramsJson, userId);

  if (result.success) {
    log.success(`Executed in ${result.duration}ms`);
    console.log('\n' + colors.bold + 'Result:' + colors.reset);
    console.log(JSON.stringify(result.output, null, 2));
  } else {
    log.error(`Failed: ${result.error}`);
    process.exit(1);
  }
}

// ============================================================================
// TOOL VALIDATION (E2E)
// ============================================================================

async function handleValidate(args: string[]): Promise<void> {
  log.header(`${icons.check} E2E Tool Validation`);

  // Parse options
  let toolId: string | undefined;
  let domain: string | undefined;
  let validateAll = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') {
      validateAll = true;
    } else if (args[i] === '--domain' && args[i + 1]) {
      domain = args[i + 1];
      i++;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    } else if (!args[i].startsWith('-')) {
      toolId = args[i];
    }
  }

  // Validate inputs
  if (!toolId && !domain && !validateAll) {
    log.error('Specify a tool ID, --domain, or --all');
    console.log(`\n  Usage:`);
    console.log(`    ${colors.cyan}ferni tools validate <toolId>${colors.reset}        # Single tool`);
    console.log(`    ${colors.cyan}ferni tools validate --domain habits${colors.reset}  # All in domain`);
    console.log(`    ${colors.cyan}ferni tools validate --all${colors.reset}            # All tools`);
    process.exit(1);
  }

  try {
    // Import E2E test infrastructure
    const { runTests, createTestContext, formatSummaryForConsole } = await import(
      '../../../../../src/e2e/index.js'
    );
    const { loadToolFixtures } = await import('./fixtures-loader.js');

    // Load fixtures
    const fixtures = await loadToolFixtures({ toolId, domain, all: validateAll });

    if (fixtures.length === 0) {
      log.warn('No fixtures found for the specified criteria');
      console.log('\n  Fixtures are auto-generated stubs. Run:');
      console.log(`    ${colors.cyan}ferni tools generate-fixtures${colors.reset}`);
      process.exit(0);
    }

    log.info(`Found ${fixtures.length} fixture(s) to validate`);
    console.log('');

    // Run tests
    const summary = await runTests(fixtures, {
      verbose,
      concurrency: 5,
      skipCleanup: false,
    });

    // Print summary
    console.log(formatSummaryForConsole(summary));

    // Exit with appropriate code
    if (!summary.runPassed) {
      process.exit(1);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`Validation failed: ${msg}`);
    process.exit(1);
  }
}

// ============================================================================
// FIXTURE GENERATION
// ============================================================================

async function handleGenerateFixtures(args: string[]): Promise<void> {
  log.header(`${icons.gear} Generate E2E Fixtures`);

  // Parse options
  let domain: string | undefined;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domain' && args[i + 1]) {
      domain = args[i + 1];
      i++;
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true;
    }
  }

  try {
    const { generateFixtures } = await import('./fixtures-generator.js');
    const result = await generateFixtures({ domain, force });

    log.success(`Generated ${result.created} fixtures`);
    if (result.skipped > 0) {
      log.info(`Skipped ${result.skipped} existing fixtures (use --force to overwrite)`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`Generation failed: ${msg}`);
    process.exit(1);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleTools(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'list': {
      // Check for --domain flag
      let domain: string | undefined;
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--domain' && subArgs[i + 1]) {
          domain = subArgs[i + 1];
          break;
        }
      }
      await listTools(domain);
      break;
    }

    case 'exec':
      await handleExec(subArgs);
      break;

    case 'validate':
      await handleValidate(subArgs);
      break;

    case 'generate-fixtures':
      await handleGenerateFixtures(subArgs);
      break;

    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      console.log(`\n  Available subcommands:`);
      console.log(`    ${colors.cyan}list${colors.reset}              List available tools`);
      console.log(`    ${colors.cyan}exec${colors.reset}              Execute a tool`);
      console.log(`    ${colors.cyan}validate${colors.reset}          E2E validate tools`);
      console.log(`    ${colors.cyan}generate-fixtures${colors.reset} Generate E2E fixtures`);
      console.log(`\n  Examples:`);
      console.log(`    ferni tools list --domain career`);
      console.log(`    ferni tools exec trackJobApplication --params '{"company": "Acme"}'`);
      console.log(`    ferni tools validate --all`);
      process.exit(1);
  }
}

// CLI entry point - called from main CLI router
// Direct execution removed in favor of central CLI routing via apps/cli/src/index.ts
