/**
 * Validate Natural Language → Tool Routing
 *
 * Tests that natural language input correctly routes to the expected tools.
 * This validates the full NL processing pipeline, not just tool execution.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts
 *   npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts --quick
 *   npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts --domain music
 *   npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts --report json
 *
 * @module cli/commands/validate/validate-nl-routing
 */

// ============================================================================
// TERMINAL COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const icons = {
  success: '✓',
  failure: '✗',
  warning: '⚠',
  info: 'ℹ',
  arrow: '→',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

// ============================================================================
// TYPES
// ============================================================================

interface NLRoutingTestCase {
  input: string;
  expectedTool: string | string[];  // Can expect one of multiple tools
  domain: string;
  description?: string;
  skipInQuickMode?: boolean;
}

interface NLRoutingResult {
  input: string;
  expectedTool: string | string[];
  actualTool: string | null;
  domain: string;
  status: 'correct' | 'wrong_tool' | 'no_tool' | 'error';
  durationMs: number;
  error?: string;
  response?: string;
}

interface NLRoutingReport {
  timestamp: string;
  summary: {
    total: number;
    correct: number;
    wrongTool: number;
    noTool: number;
    errors: number;
    accuracy: string;
  };
  correct: NLRoutingResult[];
  wrongTool: NLRoutingResult[];
  noTool: NLRoutingResult[];
  errors: NLRoutingResult[];
  durationMs: number;
}

// ============================================================================
// TEST CASES - Natural Language → Expected Tool
// ============================================================================

/**
 * Core routing test cases covering major tool categories.
 * Format: { input: "natural language", expectedTool: "toolName" }
 */
const NL_ROUTING_TEST_CASES: NLRoutingTestCase[] = [
  // ============================================================================
  // MUSIC (Critical - high frequency)
  // ============================================================================
  { input: 'play some jazz music', expectedTool: 'playMusic', domain: 'music' },
  { input: 'put on some relaxing piano', expectedTool: 'playMusic', domain: 'music' },
  { input: 'I want to listen to The Beatles', expectedTool: 'playMusic', domain: 'music' },
  { input: 'can you play something upbeat', expectedTool: 'playMusic', domain: 'music' },
  { input: 'music for working out', expectedTool: 'playMusic', domain: 'music' },
  { input: 'play lofi hip hop', expectedTool: 'playMusic', domain: 'music' },

  // ============================================================================
  // MEMORY (Superhuman capability)
  // ============================================================================
  { input: 'remember that my favorite color is blue', expectedTool: 'rememberAboutUser', domain: 'memory' },
  { input: 'save this: I love hiking', expectedTool: 'rememberAboutUser', domain: 'memory' },
  { input: 'what do you know about my preferences', expectedTool: 'recallFromMemory', domain: 'memory' },
  { input: 'do you remember what I told you about my job', expectedTool: 'recallFromMemory', domain: 'memory' },

  // ============================================================================
  // TASKS & PRODUCTIVITY
  // ============================================================================
  { input: 'add a task to buy groceries', expectedTool: 'addTask', domain: 'productivity' },
  { input: 'remind me to call mom tomorrow', expectedTool: ['addTask', 'setReminder'], domain: 'productivity' },
  { input: 'what are my tasks for today', expectedTool: 'getTasks', domain: 'productivity' },
  { input: 'show me my to-do list', expectedTool: 'getTasks', domain: 'productivity' },
  { input: 'mark the groceries task as done', expectedTool: 'completeTask', domain: 'productivity' },

  // ============================================================================
  // NOTES
  // ============================================================================
  { input: 'take a note: meeting notes from today', expectedTool: ['addNote', 'saveNote'], domain: 'productivity' },
  { input: 'save a note about the project', expectedTool: ['addNote', 'saveNote'], domain: 'productivity' },
  { input: 'show me my notes', expectedTool: 'getNotes', domain: 'productivity' },
  { input: 'search my notes for project ideas', expectedTool: 'searchNotes', domain: 'productivity' },

  // ============================================================================
  // CALENDAR
  // ============================================================================
  { input: 'what do I have on my calendar today', expectedTool: 'getCalendarToday', domain: 'calendar' },
  { input: 'show me my schedule', expectedTool: 'getCalendarToday', domain: 'calendar' },
  { input: 'schedule a meeting with John tomorrow at 3pm', expectedTool: ['createCalendarEvent', 'createAppointment'], domain: 'calendar' },
  { input: 'add an appointment for dentist next Monday', expectedTool: ['createCalendarEvent', 'createAppointment'], domain: 'calendar' },

  // ============================================================================
  // GOALS
  // ============================================================================
  { input: 'I want to set a goal to exercise more', expectedTool: 'addGoal', domain: 'productivity' },
  { input: 'add a new goal to learn Spanish', expectedTool: 'addGoal', domain: 'productivity' },
  { input: 'what are my current goals', expectedTool: 'getGoals', domain: 'productivity' },

  // ============================================================================
  // HABITS
  // ============================================================================
  { input: 'create a habit to meditate daily', expectedTool: 'createHabit', domain: 'habits' },
  { input: 'I want to start a new habit of reading', expectedTool: 'createHabit', domain: 'habits' },
  { input: 'show me my habits', expectedTool: 'getHabits', domain: 'habits' },
  { input: 'I did my meditation today', expectedTool: 'logHabitCompletion', domain: 'habits' },

  // ============================================================================
  // TIMERS & REMINDERS
  // ============================================================================
  { input: 'set a timer for 10 minutes', expectedTool: 'setTimer', domain: 'productivity' },
  { input: 'start a 30 minute timer', expectedTool: 'setTimer', domain: 'productivity' },
  { input: 'what timers do I have', expectedTool: 'getTimer', domain: 'productivity' },
  { input: 'show me my reminders', expectedTool: 'getReminders', domain: 'productivity' },

  // ============================================================================
  // HANDOFFS (Team coordination)
  // ============================================================================
  { input: 'I need help with my habits', expectedTool: 'handoffToMaya', domain: 'handoff', skipInQuickMode: true },
  { input: 'can I talk to Maya about mindfulness', expectedTool: 'handoffToMaya', domain: 'handoff', skipInQuickMode: true },
  { input: 'transfer me to Peter for research', expectedTool: 'handoffToPeter', domain: 'handoff', skipInQuickMode: true },
  { input: 'I want to talk to Alex about my calendar', expectedTool: 'handoffToAlex', domain: 'handoff', skipInQuickMode: true },
  { input: 'connect me with Jordan for life planning', expectedTool: 'handoffToJordan', domain: 'handoff', skipInQuickMode: true },
  { input: 'I have some deep questions for Nayan', expectedTool: 'handoffToNayan', domain: 'handoff', skipInQuickMode: true },

  // ============================================================================
  // INFORMATION
  // ============================================================================
  { input: 'what time is it', expectedTool: 'getCurrentTime', domain: 'information' },
  { input: 'tell me the current time', expectedTool: 'getCurrentTime', domain: 'information' },

  // ============================================================================
  // UTILITY
  // ============================================================================
  { input: 'calculate a 20% tip on $85', expectedTool: 'calculateTip', domain: 'utility' },
  { input: 'how much should I tip on a $50 bill', expectedTool: 'calculateTip', domain: 'utility' },

  // ============================================================================
  // WELLNESS & EMOTIONAL
  // ============================================================================
  { input: 'I need to talk about how I\'m feeling', expectedTool: 'logMood', domain: 'wellness', skipInQuickMode: true },
  { input: 'can we do a breathing exercise', expectedTool: 'breatheWithMe', domain: 'wellness', skipInQuickMode: true },
  { input: 'help me calm down', expectedTool: 'breatheWithMe', domain: 'wellness', skipInQuickMode: true },

  // ============================================================================
  // SCHEDULING
  // ============================================================================
  { input: 'show me my scheduled messages', expectedTool: 'getScheduled', domain: 'scheduling' },
  { input: 'what texts are scheduled', expectedTool: 'getScheduled', domain: 'scheduling' },

  // ============================================================================
  // HOME
  // ============================================================================
  { input: 'what\'s the status of my smart home', expectedTool: 'getHomeStatus', domain: 'home', skipInQuickMode: true },
  { input: 'how is my home doing', expectedTool: 'getHomeStatus', domain: 'home', skipInQuickMode: true },

  // ============================================================================
  // VOICE MEMOS
  // ============================================================================
  { input: 'show me my voice memos', expectedTool: 'listVoiceMemos', domain: 'voice-memos', skipInQuickMode: true },
  { input: 'save a voice memo about the meeting', expectedTool: 'saveVoiceMemo', domain: 'voice-memos', skipInQuickMode: true },

  // ============================================================================
  // LANGUAGE
  // ============================================================================
  { input: 'what language are you speaking', expectedTool: 'getCurrentLanguage', domain: 'settings', skipInQuickMode: true },
  { input: 'what languages do you support', expectedTool: 'listSupportedLanguages', domain: 'settings', skipInQuickMode: true },

  // ============================================================================
  // COMMUNICATION
  // ============================================================================
  { input: 'send a message to John', expectedTool: ['sendMessage', 'draftMessage'], domain: 'communication', skipInQuickMode: true },
  { input: 'draft an email to my boss', expectedTool: 'draftMessage', domain: 'communication', skipInQuickMode: true },

  // ============================================================================
  // COACHING (Domain tools)
  // ============================================================================
  { input: 'I think I\'m burning out', expectedTool: 'assessBurnout', domain: 'coaching', skipInQuickMode: true },
  { input: 'help me set boundaries', expectedTool: 'boundaryCoaching', domain: 'coaching', skipInQuickMode: true },
  { input: 'I need career advice', expectedTool: 'assessCareerSatisfaction', domain: 'career', skipInQuickMode: true },

  // ============================================================================
  // DECISION SUPPORT
  // ============================================================================
  { input: 'help me think through this decision', expectedTool: 'analyzeProsAndCons', domain: 'decisions', skipInQuickMode: true },
  { input: 'I need to weigh pros and cons', expectedTool: 'analyzeProsAndCons', domain: 'decisions', skipInQuickMode: true },
];

// ============================================================================
// API CLIENT
// ============================================================================

const DEFAULT_API_BASE = 'http://localhost:3002';
const TEST_USER_ID = 'test-nl-routing-user';

interface ChatResponse {
  success: boolean;
  response?: string;
  toolCalls?: Array<{
    fn: string;
    args: Record<string, unknown>;
    result: unknown;
    success: boolean;
    durationMs?: number;
  }>;
  error?: string;
}

async function sendChatMessage(
  message: string,
  apiBase: string
): Promise<{ response: ChatResponse; durationMs: number }> {
  const url = `${apiBase}/api/chat/message`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-Mode': 'true',
      },
      body: JSON.stringify({
        message,
        userId: TEST_USER_ID,
        personaId: 'ferni',
      }),
    });

    const data = await response.json() as ChatResponse;
    return {
      response: data,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      response: {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// VALIDATION LOGIC
// ============================================================================

function checkToolMatch(expected: string | string[], actual: string | null): boolean {
  if (!actual) return false;
  const expectedList = Array.isArray(expected) ? expected : [expected];
  return expectedList.some(e => e.toLowerCase() === actual.toLowerCase());
}

async function runNLRoutingTest(
  testCase: NLRoutingTestCase,
  apiBase: string
): Promise<NLRoutingResult> {
  const { input, expectedTool, domain } = testCase;

  const { response, durationMs } = await sendChatMessage(input, apiBase);

  // Extract which tool was called (if any)
  let actualTool: string | null = null;
  if (response.toolCalls && response.toolCalls.length > 0) {
    actualTool = response.toolCalls[0].fn;
  }

  // Determine status
  let status: NLRoutingResult['status'];
  if (!response.success) {
    status = 'error';
  } else if (!actualTool) {
    status = 'no_tool';
  } else if (checkToolMatch(expectedTool, actualTool)) {
    status = 'correct';
  } else {
    status = 'wrong_tool';
  }

  return {
    input,
    expectedTool,
    actualTool,
    domain,
    status,
    durationMs,
    error: response.error,
    response: response.response,
  };
}

// ============================================================================
// MAIN VALIDATION RUNNER
// ============================================================================

interface RunOptions {
  quick?: boolean;
  domain?: string;
  apiBase?: string;
  verbose?: boolean;
}

async function runNLRoutingValidation(options: RunOptions = {}): Promise<NLRoutingReport> {
  const { quick = false, domain, apiBase = DEFAULT_API_BASE, verbose = false } = options;

  const startTime = Date.now();

  // Build test case list
  let testCases = [...NL_ROUTING_TEST_CASES];

  // Filter by domain if specified
  if (domain) {
    testCases = testCases.filter(tc => tc.domain === domain);
  }

  // Filter for quick mode
  if (quick) {
    testCases = testCases.filter(tc => !tc.skipInQuickMode);
  }

  console.log(`\n${colors.cyan}${colors.bold}Natural Language → Tool Routing Validation${colors.reset}`);
  console.log(`${colors.dim}Testing ${testCases.length} NL inputs against ${apiBase}${colors.reset}\n`);

  // Check API is reachable
  try {
    const healthCheck = await fetch(`${apiBase}/health`);
    if (!healthCheck.ok) {
      console.log(`${colors.red}${icons.failure} API not reachable at ${apiBase}/health${colors.reset}`);
      console.log(`${colors.dim}Start the UI server with: pnpm ui-server${colors.reset}\n`);
      process.exit(1);
    }
  } catch {
    console.log(`${colors.red}${icons.failure} API not reachable at ${apiBase}${colors.reset}`);
    console.log(`${colors.dim}Start the UI server with: pnpm ui-server${colors.reset}\n`);
    process.exit(1);
  }

  // Run tests
  const results: NLRoutingResult[] = [];
  let spinnerIdx = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const progress = `[${i + 1}/${testCases.length}]`;

    // Show spinner
    const inputPreview = testCase.input.length > 40
      ? testCase.input.substring(0, 40) + '...'
      : testCase.input;
    process.stdout.write(
      `\r${colors.cyan}${icons.spinner[spinnerIdx % icons.spinner.length]}${colors.reset} ${progress} "${inputPreview}"`
    );
    spinnerIdx++;

    const result = await runNLRoutingTest(testCase, apiBase);
    results.push(result);

    // Clear line and show result
    process.stdout.write(`\r${' '.repeat(100)}\r`);

    if (verbose || result.status !== 'correct') {
      const statusIcon =
        result.status === 'correct'
          ? `${colors.green}${icons.success}${colors.reset}`
          : result.status === 'wrong_tool'
            ? `${colors.yellow}${icons.warning}${colors.reset}`
            : `${colors.red}${icons.failure}${colors.reset}`;

      const expected = Array.isArray(result.expectedTool)
        ? result.expectedTool.join('|')
        : result.expectedTool;

      let detail = '';
      if (result.status === 'wrong_tool') {
        detail = ` (got: ${result.actualTool}, expected: ${expected})`;
      } else if (result.status === 'no_tool') {
        detail = ` (no tool called, expected: ${expected})`;
      } else if (result.status === 'error') {
        detail = ` (${result.error})`;
      }

      console.log(`${statusIcon} ${progress} "${inputPreview}" ${icons.arrow} ${result.actualTool || 'none'}${detail}`);
    }
  }

  // Clear spinner line
  process.stdout.write(`\r${' '.repeat(100)}\r`);

  // Categorize results
  const correct = results.filter(r => r.status === 'correct');
  const wrongTool = results.filter(r => r.status === 'wrong_tool');
  const noTool = results.filter(r => r.status === 'no_tool');
  const errors = results.filter(r => r.status === 'error');

  const totalTime = Date.now() - startTime;

  // Build report
  const report: NLRoutingReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      correct: correct.length,
      wrongTool: wrongTool.length,
      noTool: noTool.length,
      errors: errors.length,
      accuracy: `${((correct.length / results.length) * 100).toFixed(1)}%`,
    },
    correct,
    wrongTool,
    noTool,
    errors,
    durationMs: totalTime,
  };

  return report;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function printReport(report: NLRoutingReport): void {
  const { summary } = report;

  console.log(`\n${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}              NL → TOOL ROUTING VALIDATION REPORT${colors.reset}`);
  console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Summary stats
  const accuracyColor = parseFloat(summary.accuracy) >= 80 ? colors.green : colors.yellow;
  console.log(`${colors.bold}Summary:${colors.reset}`);
  console.log(`  • Total inputs tested: ${colors.bold}${summary.total}${colors.reset}`);
  console.log(`  ${colors.green}${icons.success}${colors.reset} Correct routing: ${colors.green}${summary.correct}${colors.reset}`);
  console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Wrong tool: ${colors.yellow}${summary.wrongTool}${colors.reset}`);
  console.log(`  ${colors.red}${icons.failure}${colors.reset} No tool called: ${colors.red}${summary.noTool}${colors.reset}`);
  console.log(`  ${colors.red}${icons.failure}${colors.reset} Errors: ${colors.red}${summary.errors}${colors.reset}`);
  console.log(`  ${accuracyColor}•${colors.reset} Accuracy: ${accuracyColor}${summary.accuracy}${colors.reset}`);
  console.log(`  • Duration: ${colors.dim}${report.durationMs}ms${colors.reset}\n`);

  // Wrong tool section
  if (report.wrongTool.length > 0) {
    console.log(`${colors.yellow}${colors.bold}Wrong Tool Routing (${report.wrongTool.length}):${colors.reset}`);
    for (const r of report.wrongTool) {
      const expected = Array.isArray(r.expectedTool) ? r.expectedTool.join('|') : r.expectedTool;
      console.log(`  ${colors.yellow}${icons.warning}${colors.reset} "${r.input}"`);
      console.log(`    ${colors.dim}Expected: ${expected}, Got: ${r.actualTool}${colors.reset}`);
    }
    console.log('');
  }

  // No tool section
  if (report.noTool.length > 0) {
    console.log(`${colors.red}${colors.bold}No Tool Called (${report.noTool.length}):${colors.reset}`);
    for (const r of report.noTool) {
      const expected = Array.isArray(r.expectedTool) ? r.expectedTool.join('|') : r.expectedTool;
      console.log(`  ${colors.red}${icons.failure}${colors.reset} "${r.input}"`);
      console.log(`    ${colors.dim}Expected: ${expected}${colors.reset}`);
    }
    console.log('');
  }

  // Error section
  if (report.errors.length > 0) {
    console.log(`${colors.red}${colors.bold}Errors (${report.errors.length}):${colors.reset}`);
    for (const r of report.errors) {
      console.log(`  ${colors.red}${icons.failure}${colors.reset} "${r.input}"`);
      console.log(`    ${colors.dim}${r.error}${colors.reset}`);
    }
    console.log('');
  }

  // Final verdict
  const passed = summary.wrongTool === 0 && summary.noTool === 0 && summary.errors === 0;
  if (passed) {
    console.log(`${colors.green}${colors.bold}${icons.success} All NL inputs routed correctly!${colors.reset}\n`);
  } else {
    const issues = summary.wrongTool + summary.noTool + summary.errors;
    console.log(`${colors.yellow}${colors.bold}${icons.warning} ${issues} routing issue(s) found${colors.reset}\n`);
  }
}

function printJsonReport(report: NLRoutingReport): void {
  console.log(JSON.stringify(report, null, 2));
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse flags
  const quick = args.includes('--quick') || args.includes('-q');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const jsonOutput = args.includes('--json') || args.includes('--report=json');
  const help = args.includes('--help') || args.includes('-h');

  // Parse --domain flag
  const domainIdx = args.findIndex(a => a.startsWith('--domain'));
  let domain: string | undefined;
  if (domainIdx !== -1) {
    if (args[domainIdx].includes('=')) {
      domain = args[domainIdx].split('=')[1];
    } else if (args[domainIdx + 1]) {
      domain = args[domainIdx + 1];
    }
  }

  // Parse --api-base flag
  const apiBaseIdx = args.findIndex(a => a.startsWith('--api-base'));
  let apiBase = DEFAULT_API_BASE;
  if (apiBaseIdx !== -1) {
    if (args[apiBaseIdx].includes('=')) {
      apiBase = args[apiBaseIdx].split('=')[1];
    } else if (args[apiBaseIdx + 1]) {
      apiBase = args[apiBaseIdx + 1];
    }
  }

  if (help) {
    console.log(`
${colors.cyan}${colors.bold}NL → Tool Routing Validation${colors.reset}

Tests that natural language input correctly routes to expected tools.

${colors.bold}Usage:${colors.reset}
  npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts [options]

${colors.bold}Options:${colors.reset}
  --quick, -q         Run quick validation (~40 core cases)
  --domain <name>     Test only inputs for a specific domain
  --api-base <url>    API base URL (default: http://localhost:3002)
  --json              Output JSON report instead of formatted text
  --verbose, -v       Show all results, not just failures
  --help, -h          Show this help message

${colors.bold}Examples:${colors.reset}
  # Quick validation
  npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts --quick

  # Test only music routing
  npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts --domain music

  # Full validation with JSON output
  npx tsx apps/cli/src/commands/validate/validate-nl-routing.ts --json > nl-routing-report.json

${colors.bold}Domains:${colors.reset}
  music, memory, productivity, calendar, habits, handoff, information,
  utility, wellness, scheduling, home, voice-memos, settings, communication,
  coaching, career, decisions
`);
    process.exit(0);
  }

  try {
    const report = await runNLRoutingValidation({
      quick,
      domain,
      apiBase,
      verbose,
    });

    if (jsonOutput) {
      printJsonReport(report);
    } else {
      printReport(report);
    }

    // Exit with error code if failures
    const issues = report.summary.wrongTool + report.summary.noTool + report.summary.errors;
    process.exit(issues > 0 ? 1 : 0);
  } catch (err) {
    console.error(`${colors.red}${icons.failure} Validation failed: ${err}${colors.reset}`);
    process.exit(1);
  }
}

main();
